/* Routes de l'instance, hors procédure : vérification de la chaîne d'audit, réinitialisation de la démonstration. */
const express = require('express');
const { auditVerify, auditJournal, proceduresAll, resetDemo, viderDonnees } = require('../db');
const { requireAuth, needPerm, whoLabel } = require('../auth');
const cfg = require('../config');

const r = express.Router();
r.use(requireAuth);

r.get('/audit/verify', needPerm('audit.read'), (req, res) => res.json(auditVerify()));

/* Journal de l'instance (menu « Audit ») : chaque entrée avec sa date, son auteur, son action, la référence de la
   procédure concernée et l'adresse IP de l'auteur. */
r.get('/audit', needPerm('audit.read'), (req, res) => {
  const refs = {}; proceduresAll().forEach((p) => { refs[p.id] = p.ref; });
  res.json({ entrees: auditJournal().map((e) => ({ ...e, procedure: e.pid ? (refs[e.pid] || e.pid) : null })), verification: auditVerify() });
});

r.post('/admin/reset', needPerm('params.edit', 'roles.edit'), (req, res) => {
  if (!require('../espaces').reinitialisable()) return res.status(403).json({ error: 'Réinitialisation désactivée dans cet espace.' });
  resetDemo(req.user.id, whoLabel(req.user));
  res.json({ ok: true });
});

/** Vide les données de l'espace (par exemple les données fictives de la démonstration), en gardant ses paramètres
    et ses comptes. Mêmes droits et même garde que la réinitialisation ; confirmation explicite exigée. */
r.post('/admin/vider', needPerm('params.edit', 'roles.edit'), (req, res) => {
  if (!require('../espaces').reinitialisable()) return res.status(403).json({ error: 'Opération désactivée dans cet espace.' });
  if ((req.body || {}).confirmation !== 'VIDER') return res.status(422).json({ error: 'Confirmation attendue : saisissez VIDER.', code: 'CONFIRMATION_REQUIRED' });
  const fichiers = viderDonnees(req.user.id, whoLabel(req.user));
  const { diskPath } = require('./files'), fs = require('fs');
  for (const id of fichiers) { try { fs.unlinkSync(diskPath(id)); } catch (e) { /* déjà absent */ } }
  res.json({ ok: true, fichiers: fichiers.length });
});

/* Messagerie de l'organisation : serveur SMTP. Le mot de passe est chiffré dans la base et ne revient jamais au
   navigateur ; le réglage n'est pas transmis avec l'état (il ne s'écrit que par ces routes). */
const vueSmtp = () => {
  const s = (require('../db').kvGet('smtp') || {}).value || {};
  const mail = require('../mail');
  return { configuration: { hote: s.hote || '', port: s.port || 587, securite: s.securite || 'starttls', utilisateur: s.utilisateur || '',
    expediteur: s.expediteur || '', nomExpediteur: s.nomExpediteur || '', actif: !!s.actif, motDePasseEnregistre: !!s.motDePasse },
    mode: mail.mode(), microsoft365: process.env.MAIL_MODE === 'graph' };
};
r.get('/messagerie/smtp', needPerm('params.edit'), (req, res) => res.json(vueSmtp()));
r.put('/messagerie/smtp', needPerm('params.edit'), (req, res) => {
  const d = req.body || {}, { kvGet, kvSet, auditAppend } = require('../db'), mail = require('../mail');
  const avant = (kvGet('smtp') || {}).value || {};
  const t = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const s = { hote: t(d.hote, 200).toLowerCase(), port: Number(d.port) || 587, securite: d.securite, utilisateur: t(d.utilisateur, 200),
    expediteur: t(d.expediteur, 200).toLowerCase(), nomExpediteur: t(d.nomExpediteur, 100), actif: d.actif === true, motDePasse: avant.motDePasse || null };
  if (s.hote && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s.hote)) return res.status(422).json({ error: 'Serveur SMTP invalide (nom de domaine attendu, ex. smtp.office365.com).', code: 'SMTP_HOST' });
  if (!Number.isInteger(s.port) || s.port < 1 || s.port > 65535) return res.status(422).json({ error: 'Port invalide.', code: 'SMTP_PORT' });
  if (!['ssl', 'starttls', 'aucune'].includes(s.securite)) return res.status(422).json({ error: 'Sécurité de connexion invalide.', code: 'SMTP_SECURITY' });
  if (s.expediteur && !mail.adresseValide(s.expediteur)) return res.status(422).json({ error: 'Adresse d’expédition invalide.', code: 'SMTP_FROM' });
  if (s.actif && (!s.hote || !s.expediteur)) return res.status(422).json({ error: 'Pour activer l’envoi, indiquez le serveur et l’adresse d’expédition.', code: 'SMTP_INCOMPLETE' });
  if (typeof d.motDePasse === 'string' && d.motDePasse.length) {
    if (d.motDePasse.length > 500) return res.status(422).json({ error: 'Mot de passe trop long.', code: 'SMTP_PASSWORD' });
    s.motDePasse = mail.chiffrer(d.motDePasse);
  }
  if (d.effacerMotDePasse === true) s.motDePasse = null;
  kvSet('smtp', s, req.user.id);
  auditAppend(req.user.id, whoLabel(req.user), `Messagerie : serveur SMTP ${s.hote || '—'}:${s.port} (${s.securite}), expéditeur ${s.expediteur || '—'}, envoi ${s.actif ? 'activé' : 'désactivé'}`
    + (typeof d.motDePasse === 'string' && d.motDePasse.length ? ', mot de passe modifié' : '') + (d.effacerMotDePasse === true ? ', mot de passe effacé' : ''));
  res.json(vueSmtp());
});
/** Courriel de test, avec la configuration enregistrée (activée ou non), à l'adresse du compte connecté. */
r.post('/messagerie/smtp/test', needPerm('params.edit'), async (req, res) => {
  const { kvGet, auditAppend, db } = require('../db'), mail = require('../mail');
  const s = (kvGet('smtp') || {}).value || {};
  if (!s.hote || !s.expediteur) return res.status(422).json({ error: 'Enregistrez d’abord le serveur et l’adresse d’expédition.', code: 'SMTP_INCOMPLETE' });
  const moi = db.prepare('SELECT email FROM users WHERE id=?').get(req.user.id);
  const r2 = await mail.envoyerSmtp(s, [moi.email], 'Marché+ — courriel de test', 'Ce message confirme que la messagerie de votre organisation fonctionne.\n\nServeur : ' + s.hote + ':' + s.port);
  auditAppend(req.user.id, whoLabel(req.user), `Messagerie : courriel de test à ${moi.email} — ${r2.statut}${r2.erreur ? ' (' + r2.erreur + ')' : ''}`);
  res.status(r2.statut === 'envoyé' ? 200 : 502).json({ statut: r2.statut, erreur: r2.erreur || null, a: moi.email });
});

module.exports = r;
