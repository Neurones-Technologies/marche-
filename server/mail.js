/* Envoi des courriels. Par ordre de priorité :
   1. le serveur SMTP de l'organisation (Paramètres → Messagerie, clé « smtp » de l'espace ; mot de passe chiffré),
      quand il est activé ;
   2. Microsoft 365 (API Microsoft Graph, « sendMail ») configuré pour tout le serveur par l'environnement ;
   3. sinon, les courriels restent simulés.

   Microsoft 365 : sans dépendance, fetch de Node.
   L'application est enregistrée dans Entra ID avec la permission d'application Mail.Send, restreinte à la seule boîte
   d'envoi (voir README, « Courriels »). Authentification par identifiants client (OAuth 2.0), jeton gardé en mémoire.

   MAIL_MODE=graph active l'envoi ; sinon (par défaut) les courriels restent simulés : journalisés dans la boîte
   d'envoi de l'organisation, avec le statut « simulé ». Les secrets ne viennent que de l'environnement. */
/* Configuration lue à chaque usage : l'environnement fait foi (et les tests peuvent la poser après le chargement). */
const conf = () => ({
  mode: process.env.MAIL_MODE === 'graph' ? 'graph' : 'simule',
  tenant: process.env.M365_TENANT_ID || '',
  client: process.env.M365_CLIENT_ID || '',
  secret: process.env.M365_CLIENT_SECRET || '',
  expediteur: process.env.M365_SENDER || '',
  // remplaçables pour les tests (serveur Graph simulé) ; jamais en production
  login: process.env.M365_LOGIN_BASE || 'https://login.microsoftonline.com',
  graph: process.env.M365_GRAPH_BASE || 'https://graph.microsoft.com',
});
/* ---- SMTP de l'organisation ---- */
const crypto = require('crypto');
/** Clé de chiffrement du mot de passe SMTP, dérivée du secret du serveur (JWT_SECRET). */
const cleSmtp = () => crypto.createHash('sha256').update('smtp:' + require('./config').jwtSecret).digest();
function chiffrer(texte) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', cleSmtp(), iv);
  const x = Buffer.concat([c.update(String(texte), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), x].map((b) => b.toString('base64')).join('.');
}
function dechiffrer(v) {
  try {
    const [iv, tag, x] = String(v || '').split('.').map((b) => Buffer.from(b, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', cleSmtp(), iv); d.setAuthTag(tag);
    return Buffer.concat([d.update(x), d.final()]).toString('utf8');
  } catch (e) { return null; } // secret du serveur changé : mot de passe à ressaisir
}
/** Réglage SMTP de l'espace courant (ou null). */
function smtp() {
  const { kvGet } = require('./db');
  const s = (kvGet('smtp') || {}).value;
  return s && s.actif && s.hote && s.expediteur ? s : null;
}
let transports = new Map();
function transportSmtp(s) {
  const mdp = s.motDePasse ? dechiffrer(s.motDePasse) : '';
  if (s.motDePasse && mdp == null) throw new Error('Mot de passe SMTP illisible : ressaisissez-le dans les paramètres.');
  const cle = JSON.stringify([s.hote, s.port, s.securite, s.utilisateur, s.motDePasse]);
  if (!transports.has(cle)) {
    if (transports.size > 50) transports = new Map();
    transports.set(cle, require('nodemailer').createTransport({
      host: s.hote, port: Number(s.port) || 587, secure: s.securite === 'ssl', requireTLS: s.securite === 'starttls',
      ignoreTLS: s.securite === 'aucune', auth: s.utilisateur ? { user: s.utilisateur, pass: mdp || '' } : undefined,
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
    }));
  }
  return transports.get(cle);
}
/** Adresse interne (boucle locale, réseau privé, lien local) : un espace ne fait pas contacter le réseau du serveur. */
function adresseInterne(ip) {
  const v = String(ip || '').toLowerCase().replace(/^::ffff:/, '');
  return /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(v) || /^172\.(1[6-9]|2\d|3[01])\./.test(v) || v === '::1' || /^f[cd]/.test(v) || /^fe80:/.test(v);
}
async function hoteAutorise(hote) {
  if (process.env.SMTP_RESEAU_LOCAL === '1') return true;
  const r = await require('dns').promises.lookup(hote, { all: true }).catch(() => []);
  return r.length > 0 && !r.some((x) => adresseInterne(x.address));
}
async function envoyerSmtp(s, dest, objet, corps) {
  try {
    if (!await hoteAutorise(s.hote)) return { statut: 'échec', erreur: 'SMTP : serveur introuvable ou situé sur un réseau interne.' };
    await transportSmtp(s).sendMail({ from: s.nomExpediteur ? { name: s.nomExpediteur, address: s.expediteur } : s.expediteur, to: dest,
      subject: String(objet || '').slice(0, 250), text: String(corps || '').slice(0, 20000) });
    return { statut: 'envoyé' };
  } catch (e) {
    return { statut: 'échec', erreur: ('SMTP : ' + String(e.message || e)).slice(0, 200) };
  }
}

/** Mode d'envoi en vigueur pour l'espace courant : 'smtp', 'graph' ou 'simule'. */
const mode = () => (smtp() ? 'smtp' : (conf().mode === 'graph' ? 'graph' : 'simule'));
const actif = () => mode() !== 'simule';
const manque = () => { const c = conf(); return ['tenant', 'client', 'secret', 'expediteur'].filter((k) => !c[k]); };
if (conf().mode === 'graph' && manque().length) console.error('MAIL_MODE=graph : paramètres manquants — ' + manque().join(', ') + ' (M365_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET, M365_SENDER).');

let jeton = null, expire = 0, enCours = null;
/** Jeton d'application, réutilisé jusqu'à une minute de son expiration ; envois simultanés : une seule demande. */
function obtenirJeton() {
  if (jeton && Date.now() < expire - 60000) return Promise.resolve(jeton);
  if (!enCours) enCours = demanderJeton().finally(() => { enCours = null; });
  return enCours;
}
async function demanderJeton() {
  const cfg = conf();
  const corps = new URLSearchParams({ client_id: cfg.client, client_secret: cfg.secret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' });
  const r = await fetch(`${cfg.login}/${encodeURIComponent(cfg.tenant)}/oauth2/v2.0/token`, { method: 'POST', body: corps, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Authentification Microsoft 365 refusée' + (j.error ? ' (' + j.error + ')' : '') + '.');
  jeton = j.access_token; expire = Date.now() + (Number(j.expires_in) || 3600) * 1000;
  return jeton;
}

const adresseValide = (a) => /^[^@\s<>"]{1,64}@[^@\s<>"]{1,190}\.[^@\s<>"]{2,}$/.test(String(a || ''));

/**
 * Envoie un courriel texte. a : liste d'adresses (déjà contrôlées par l'appelant). Retourne
 * { statut: 'envoyé' | 'simulé' | 'échec', erreur? }. Ne lève jamais : un échec d'envoi ne casse pas l'action métier.
 */
async function envoyer({ a, objet, corps }) {
  const dest = [...new Set((a || []).filter(adresseValide))].slice(0, 50);
  if (!dest.length) return { statut: 'échec', erreur: 'Aucun destinataire valide.' };
  const s = smtp();
  if (s) return envoyerSmtp(s, dest, objet, corps);
  if (!actif()) return { statut: 'simulé' };
  if (manque().length) return { statut: 'échec', erreur: 'Configuration Microsoft 365 incomplète.' };
  const cfg = conf();
  try {
    const message = {
      subject: String(objet || '').slice(0, 250),
      body: { contentType: 'Text', content: String(corps || '').slice(0, 20000) },
      toRecipients: dest.map((x) => ({ emailAddress: { address: x } })),
    };
    const r = await fetch(`${cfg.graph}/v1.0/users/${encodeURIComponent(cfg.expediteur)}/sendMail`, {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: 'Bearer ' + await obtenirJeton(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, saveToSentItems: true }),
    });
    if (r.status === 202) return { statut: 'envoyé' };
    if (r.status === 401) jeton = null; // jeton révoqué ou expiré : redemandé au prochain envoi
    const j = await r.json().catch(() => ({}));
    return { statut: 'échec', erreur: `Microsoft Graph ${r.status}` + (j.error && j.error.code ? ' (' + j.error.code + ')' : '') };
  } catch (e) {
    return { statut: 'échec', erreur: String(e.message || e).slice(0, 200) };
  }
}

module.exports = { envoyer, actif, mode, adresseValide, chiffrer, dechiffrer, envoyerSmtp,
  expediteur: () => { const s = smtp(); return s ? s.expediteur : conf().expediteur; } };
