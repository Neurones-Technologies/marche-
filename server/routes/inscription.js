/* Inscription publique d'un prestataire (module 1) : la seule route de l'application accessible sans compte.
   Protections : limitation par adresse IP, champ piège contre les robots, réponse identique que le courriel soit
   connu ou non (pas d'énumération des comptes), politique de mot de passe, compte inactif tant que le courriel n'est
   pas vérifié par un jeton à usage unique (48 h). L'organisation peut fermer l'inscription (org.inscriptionOuverte).

   Les courriels sont simulés dans cette version : le message de vérification est placé dans la boîte d'envoi de
   l'organisation, et le lien est renvoyé dans la réponse hors production pour permettre la démonstration. */
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { db, kvGet, kvSet, partenaireCreer, jetonCreer, jetonUtiliser, auditAppend, bumpRev, frDate } = require('../db');
const { bcrypt } = require('../auth');
const cfg = require('../config');
const mail = require('../mail');

const r = express.Router();
const limite = rateLimit({ windowMs: 3600000, limit: cfg.inscriptionParHeure, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Trop de demandes d’inscription depuis cette adresse. Réessayez plus tard.' } });

const REPONSE = 'Demande enregistrée. Si l’adresse est valide et n’est pas déjà inscrite, un courriel de vérification vient d’être envoyé ; le lien est valable 48 heures.';
const motDePasseValide = (p) => p.length >= 10 && p.length <= 200 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p);

r.post('/', limite, (req, res) => {
  const org = (kvGet('org') || { value: {} }).value;
  if (org.inscriptionOuverte === false) return res.status(403).json({ error: 'L’inscription en ligne des prestataires est fermée. Contactez le service des achats.', code: 'REGISTRATION_CLOSED' });
  const d = req.body || {};
  if (d.site) return res.status(202).json({ message: REPONSE }); // champ piège rempli : un robot, on ne crée rien
  const raisonSociale = String(d.raisonSociale || '').trim(), nom = String(d.nom || '').trim();
  const email = String(d.email || '').trim().toLowerCase(), pays = String(d.pays || '').trim().toUpperCase();
  const immatriculation = String(d.immatriculation || '').trim(), mdp = String(d.motDePasse || '');
  if (raisonSociale.length < 2 || raisonSociale.length > 200) return res.status(422).json({ error: 'Raison sociale invalide.' });
  if (nom.length < 2 || nom.length > 120) return res.status(422).json({ error: 'Nom du contact invalide.' });
  if (!/^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$/.test(email)) return res.status(422).json({ error: 'Courriel invalide.' });
  if (!/^[A-Z]{2}$/.test(pays)) return res.status(422).json({ error: 'Pays invalide.' });
  if (immatriculation.length > 80) return res.status(422).json({ error: 'Numéro d’immatriculation trop long.' });
  if (!motDePasseValide(mdp)) return res.status(422).json({ error: 'Mot de passe : 10 caractères minimum, avec majuscule, minuscule et chiffre.' });
  if (db.prepare('SELECT 1 FROM users WHERE lower(email)=?').get(email)) return res.status(202).json({ message: REPONSE });

  let lien, courriel;
  db.transaction(() => {
    const uid = 'u' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
    db.prepare('INSERT INTO users(id,nom,email,role,pass_hash,active,a_verifier) VALUES(?,?,?,?,?,0,1)').run(uid, nom, email, 'soum', bcrypt.hashSync(mdp, 10));
    const p = partenaireCreer({ raisonSociale, pays, immatriculation, adresse: '', contact: { nom, email, tel: '' }, domaines: [] }, uid);
    p.historique = [{ t: frDate(), who: nom + ' — inscription en ligne', action: 'inscription en ligne' }];
    require('../db').partenaireSave(p);
    const jeton = jetonCreer(uid, 'verification', 48);
    lien = '/?verifier=' + jeton;
    const emails = (kvGet('emails') || { value: [] }).value;
    courriel = { id: 'm' + Date.now() + crypto.randomBytes(2).toString('hex'), ev: 'inscription', de: mail.actif() ? mail.expediteur() : (kvGet('mailFrom') ? kvGet('mailFrom').value : ''),
      ids: [uid], a: [email], noms: [nom + ' (' + raisonSociale + ')'], objet: 'Vérifiez votre adresse pour finaliser votre inscription',
      corps: 'Bonjour ' + nom + ',\n\nPour activer le compte de ' + raisonSociale + ' sur la plateforme d’achats de ' + (org.nom || 'l’organisation') +
        ', ouvrez ce lien dans les 48 heures :\n' + cfg.appUrl + lien + '\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message.',
      t: frDate(), statut: mail.actif() ? 'en cours' : 'simulé' };
    emails.unshift(courriel);
    kvSet('emails', emails.slice(0, 80), 'inscription');
    auditAppend(null, 'Inscription en ligne', `Inscription d’un prestataire — ${raisonSociale} (${pays}), fiche ${p.id}, en attente de vérification du courriel`);
  })();
  if (courriel && mail.actif()) {
    mail.envoyer({ a: courriel.a, objet: courriel.objet, corps: courriel.corps }).then((r) => {
      const cur = (kvGet('emails') || { value: [] }).value, x = cur.find((m) => m.id === courriel.id);
      if (x) { x.statut = r.statut; if (r.erreur) x.erreur = r.erreur; x.expedie = frDate(); kvSet('emails', cur, 'courriel'); }
    }).catch((e) => console.error('Courriel d’inscription', e));
  }
  res.status(202).json({ message: REPONSE, ...(cfg.prod ? {} : { lienVerification: lien }) });
});

/** Vérification du courriel : active le compte. Le jeton est à usage unique. */
r.post('/verifier', limite, (req, res) => {
  const uid = jetonUtiliser((req.body || {}).jeton, 'verification');
  if (!uid) return res.status(410).json({ error: 'Lien de vérification invalide, déjà utilisé ou expiré.', code: 'TOKEN_INVALID' });
  db.prepare('UPDATE users SET active=1, a_verifier=0 WHERE id=?').run(uid);
  bumpRev();
  const u = db.prepare('SELECT nom FROM users WHERE id=?').get(uid);
  auditAppend(uid, (u ? u.nom : uid) + ' — inscription en ligne', 'Courriel vérifié : compte prestataire activé');
  res.json({ ok: true, message: 'Adresse vérifiée. Vous pouvez vous connecter et compléter votre dossier de référencement.' });
});

module.exports = r;
