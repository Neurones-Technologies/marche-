/* Envoi des courriels par Microsoft 365 (API Microsoft Graph, « sendMail »), sans dépendance : fetch de Node.
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
const actif = () => conf().mode === 'graph';
const manque = () => { const c = conf(); return ['tenant', 'client', 'secret', 'expediteur'].filter((k) => !c[k]); };
if (actif() && manque().length) console.error('MAIL_MODE=graph : paramètres manquants — ' + manque().join(', ') + ' (M365_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET, M365_SENDER).');

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

module.exports = { envoyer, actif, adresseValide, expediteur: () => conf().expediteur };
