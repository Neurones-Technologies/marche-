/* Inscription publique d'un prestataire (module 1), depuis le portail des partenaires (/portail-partenaires) : la seule
   partie de l'application accessible sans compte. Le prestataire remplit le formulaire de référencement de
   l'organisation (fiche, questions, documents) et le soumet ; à la vérification de son courriel, son compte s'active et
   son dossier part en instruction (parcours de référencement).

   Les documents sont déposés un par un dans un brouillon anonyme (jeton à usage limité, 6 heures), avant l'envoi du
   formulaire : la réponse à l'envoi reste la même que le courriel soit connu ou non (pas d'énumération des comptes).
   Protections : limitation par adresse IP, champ piège contre les robots, politique de mot de passe, compte inactif tant
   que le courriel n'est pas vérifié par un jeton à usage unique (48 h). L'organisation peut fermer l'inscription.

   Sans envoi réel des courriels, le message de vérification est placé dans la boîte d'envoi de l'organisation, et le
   lien est renvoyé dans la réponse hors production pour permettre la démonstration. */
const fs = require('fs');
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { db, kvGet, kvSet, partenaireCreer, partenaireSave, partenaireDe, jetonCreer, jetonUtiliser, auditAppend, bumpRev, frDate } = require('../db');
const { bcrypt } = require('../auth');
const { lireFichier, corpsBrut, diskPath } = require('./files');
const F = require('../formulaire');
const cfg = require('../config');
const mail = require('../mail');

const r = express.Router();
const limite = rateLimit({ windowMs: 3600000, limit: cfg.inscriptionParHeure, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Trop de demandes d’inscription depuis cette adresse. Réessayez plus tard.' } });
// dépôt des documents du brouillon : plus large (une dizaine de pièces par inscription, remplacements)
const limitePieces = rateLimit({ windowMs: 3600000, limit: cfg.inscriptionParHeure * 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Trop de dépôts depuis cette adresse. Réessayez plus tard.' } });

const REPONSE = 'Dossier reçu. Si l’adresse est valide et n’est pas déjà inscrite, un courriel de vérification vient d’être envoyé (lien valable 48 heures) : votre dossier sera transmis au service des achats dès la vérification.';
const motDePasseValide = (p) => p.length >= 10 && p.length <= 200 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p);
const err = (res, status, code, error) => res.status(status).json({ error, code });
const ouverte = () => ((kvGet('org') || { value: {} }).value).inscriptionOuverte !== false;
const FERMEE = 'L’inscription en ligne des prestataires est fermée. Contactez le service des achats.';
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const empreinte = (brut) => crypto.createHash('sha256').update(String(brut || '')).digest('hex');

/* ── Brouillon de dossier : documents déposés avant l'envoi du formulaire ── */
/** Supprime un brouillon et ses fichiers. */
function jeterBrouillon(hash) {
  const b = db.prepare('SELECT pieces FROM brouillons WHERE hash=?').get(hash);
  if (!b) return;
  for (const x of Object.values(JSON.parse(b.pieces))) {
    db.prepare("DELETE FROM files WHERE id=? AND owner='inscription'").run(x.fichier);
    try { fs.unlinkSync(diskPath(x.fichier)); } catch (e) { /* déjà absent */ }
  }
  db.prepare('DELETE FROM brouillons WHERE hash=?').run(hash);
}
const purger = () => db.prepare('SELECT hash FROM brouillons WHERE expire<?').all(Date.now()).forEach((b) => jeterBrouillon(b.hash));
function brouillonDe(req) {
  const hash = empreinte(req.headers['x-brouillon'] || (req.body && req.body.brouillon));
  const b = db.prepare('SELECT * FROM brouillons WHERE hash=? AND expire>?').get(hash, Date.now());
  return b ? { hash, pieces: JSON.parse(b.pieces) } : null;
}

/** Formulaire de référencement de l'organisation, pour le portail : questions, et documents selon le pays. */
r.get('/formulaire', (req, res) => {
  const pays = String(req.query.pays || '').trim().toUpperCase();
  res.json({ ouverte: ouverte(), champs: F.formulaire().champs, pieces: F.piecesPour(/^[A-Z]{2}$/.test(pays) ? pays : '') });
});

r.post('/brouillon', limitePieces, (req, res) => {
  if (!ouverte()) return err(res, 403, 'REGISTRATION_CLOSED', FERMEE);
  purger();
  const brut = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO brouillons(hash,expire) VALUES(?,?)').run(empreinte(brut), Date.now() + 6 * 3600000);
  res.status(201).json({ brouillon: brut });
});

/** Dépôt d'un document dans le brouillon (corps brut) ; ?doc= document visé, ?expire=AAAA-MM-JJ. */
r.post('/brouillon/pieces', limitePieces, corpsBrut, (req, res) => {
  if (!ouverte()) return err(res, 403, 'REGISTRATION_CLOSED', FERMEE);
  const b = brouillonDe(req);
  if (!b) return err(res, 410, 'DRAFT_INVALID', 'Session de dépôt expirée : rechargez la page et recommencez.');
  const fx = lireFichier(req);
  if (fx.erreur) return err(res, fx.status, 'FILE_INVALID', fx.erreur);
  const def = F.formulaire().pieces.find((d) => d.id === fx.doc);
  if (!def) return err(res, 422, 'PIECE_NOT_REQUIRED', 'Ce document ne fait pas partie du dossier de référencement.');
  const expire = String(req.query.expire || '');
  if (expire && !/^\d{4}-\d{2}-\d{2}$/.test(expire)) return err(res, 422, 'FILE_INVALID', 'Date de validité invalide (AAAA-MM-JJ).');
  if (def.expiration && !expire) return err(res, 422, 'PIECE_EXPIRY_REQUIRED', '« ' + def.label + ' » : indiquez sa date de fin de validité.');
  if (expire && expire < aujourdhui()) return err(res, 422, 'PIECE_EXPIRED', 'Ce document est déjà expiré.');
  if (Object.keys(b.pieces).length >= 40 && !b.pieces[fx.doc]) return err(res, 422, 'DRAFT_FULL', 'Trop de documents.');
  const id = crypto.randomUUID(), ancienne = b.pieces[fx.doc];
  fs.writeFileSync(diskPath(id), fx.body, { mode: 0o600 });
  db.transaction(() => {
    db.prepare("INSERT INTO files(id,owner,doc_id,name,mime,size,sha256) VALUES(?,'inscription',?,?,?,?,?)").run(id, fx.doc, fx.name, fx.mime, fx.body.length, fx.sha);
    if (ancienne) db.prepare("DELETE FROM files WHERE id=? AND owner='inscription'").run(ancienne.fichier);
    b.pieces[fx.doc] = { fichier: id, nom: fx.name, taille: fx.body.length, sha256: fx.sha, expire: expire || null };
    db.prepare('UPDATE brouillons SET pieces=? WHERE hash=?').run(JSON.stringify(b.pieces), b.hash);
  })();
  if (ancienne) { try { fs.unlinkSync(diskPath(ancienne.fichier)); } catch (e) { /* déjà absent */ } }
  res.status(201).json({ piece: { doc: fx.doc, nom: fx.name, taille: fx.body.length, expire: expire || null } });
});

/** Envoi du formulaire complet : fiche, réponses, documents du brouillon, compte. */
r.post('/', limite, (req, res) => {
  if (!ouverte()) return err(res, 403, 'REGISTRATION_CLOSED', FERMEE);
  const d = req.body || {};
  if (d.site) return res.status(202).json({ message: REPONSE }); // champ piège rempli : un robot, on ne crée rien
  const raisonSociale = String(d.raisonSociale || '').trim(), nom = String(d.nom || '').trim();
  const email = String(d.email || '').trim().toLowerCase(), pays = String(d.pays || '').trim().toUpperCase();
  const immatriculation = String(d.immatriculation || '').trim(), tel = String(d.tel || '').trim(), mdp = String(d.motDePasse || '');
  if (raisonSociale.length < 2 || raisonSociale.length > 200) return err(res, 422, 'PARTNER_INVALID', 'Raison sociale invalide.');
  if (!/^[A-Z]{2}$/.test(pays)) return err(res, 422, 'PARTNER_INVALID', 'Pays invalide.');
  if (!immatriculation || immatriculation.length > 80) return err(res, 422, 'PARTNER_INVALID', 'Numéro d’immatriculation obligatoire (80 caractères au plus).');
  if (nom.length < 2 || nom.length > 120) return err(res, 422, 'PARTNER_INVALID', 'Nom du contact invalide.');
  if (!/^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$/.test(email)) return err(res, 422, 'PARTNER_INVALID', 'Courriel invalide.');
  if (tel.length > 40) return err(res, 422, 'PARTNER_INVALID', 'Téléphone trop long.');
  if (!motDePasseValide(mdp)) return err(res, 422, 'PARTNER_INVALID', 'Mot de passe : 10 caractères minimum, avec majuscule, minuscule et chiffre.');
  const rep = F.verifierReponses(d.reponses, true);
  if (rep.erreur) return err(res, 422, 'PARTNER_INCOMPLETE', rep.erreur);
  // documents : ceux demandés pour ce pays ; les obligatoires présents et en cours de validité
  const b = brouillonDe(req);
  const exiges = F.piecesPour(pays), deposees = (b && b.pieces) || {};
  const manquent = exiges.filter((x) => x.obligatoire && (!deposees[x.id] || (deposees[x.id].expire && deposees[x.id].expire < aujourdhui())));
  if (manquent.length) return err(res, 422, 'PIECES_MISSING', 'Documents obligatoires manquants : ' + manquent.map((x) => x.label).join(' ; ') + '.');
  // adresse déjà inscrite : même réponse, rien de créé, brouillon jeté (pas d'énumération des comptes)
  if (db.prepare('SELECT 1 FROM users WHERE lower(email)=?').get(email)) { if (b) jeterBrouillon(b.hash); return res.status(202).json({ message: REPONSE }); }

  const org = (kvGet('org') || { value: {} }).value;
  let lien, courriel;
  db.transaction(() => {
    const uid = 'u' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
    db.prepare('INSERT INTO users(id,nom,email,role,pass_hash,active,a_verifier) VALUES(?,?,?,?,?,0,1)').run(uid, nom, email, 'soum', bcrypt.hashSync(mdp, 10));
    const p = partenaireCreer({ raisonSociale, pays, immatriculation, adresse: '', contact: { nom, email, tel }, domaines: [] }, uid);
    p.reponses = rep.reponses;
    // les documents demandés pour ce pays passent du brouillon au dossier, à vérifier par les achats
    const ids = new Set(exiges.map((x) => x.id));
    for (const [doc, x] of Object.entries(deposees)) {
      if (!ids.has(doc)) continue;
      p.pieces[doc] = { fichier: x.fichier, nom: x.nom, taille: x.taille, sha256: x.sha256, expire: x.expire, depose: frDate(), statut: 'a_verifier', remplace: null };
      db.prepare("UPDATE files SET owner=?, partenaire_id=? WHERE id=? AND owner='inscription'").run(uid, p.id, x.fichier);
      delete deposees[doc];
    }
    p.soumissionEnAttente = true; // le dossier part en instruction à la vérification du courriel
    p.historique = [{ t: frDate(), who: nom + ' — inscription en ligne', action: 'dossier de référencement déposé sur le portail des partenaires' }];
    partenaireSave(p);
    if (b) { db.prepare('UPDATE brouillons SET pieces=? WHERE hash=?').run(JSON.stringify(deposees), b.hash); jeterBrouillon(b.hash); }
    const jeton = jetonCreer(uid, 'verification', 48);
    lien = '/?verifier=' + jeton;
    const emails = (kvGet('emails') || { value: [] }).value;
    courriel = { id: 'm' + Date.now() + crypto.randomBytes(2).toString('hex'), ev: 'inscription', de: mail.actif() ? mail.expediteur() : (kvGet('mailFrom') ? kvGet('mailFrom').value : ''),
      ids: [uid], a: [email], noms: [nom + ' (' + raisonSociale + ')'], objet: 'Vérifiez votre adresse pour transmettre votre dossier de référencement',
      corps: 'Bonjour ' + nom + ',\n\nPour transmettre le dossier de référencement de ' + raisonSociale + ' au service des achats de ' + (org.nom || 'l’organisation') +
        ' et activer votre compte, ouvrez ce lien dans les 48 heures :\n' + require('../espaces').adresseCourante() + lien + '\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message.',
      t: frDate(), statut: mail.actif() ? 'en cours' : 'simulé' };
    emails.unshift(courriel);
    kvSet('emails', emails.slice(0, 80), 'inscription');
    auditAppend(null, 'Inscription en ligne', `Inscription d’un prestataire — ${raisonSociale} (${pays}), fiche ${p.id}, dossier déposé, en attente de vérification du courriel`);
  })();
  if (courriel && mail.actif()) {
    mail.envoyer({ a: courriel.a, objet: courriel.objet, corps: courriel.corps }).then((x) => {
      const cur = (kvGet('emails') || { value: [] }).value, m = cur.find((y) => y.id === courriel.id);
      if (m) { m.statut = x.statut; if (x.erreur) m.erreur = x.erreur; m.expedie = frDate(); kvSet('emails', cur, 'courriel'); }
    }).catch((e) => console.error('Courriel d’inscription', e));
  }
  res.status(202).json({ message: REPONSE, ...(cfg.prod ? {} : { lienVerification: lien }) });
});

/** Vérification du courriel : active le compte, et transmet le dossier déposé au référencement. */
r.post('/verifier', limite, (req, res) => {
  const uid = jetonUtiliser((req.body || {}).jeton, 'verification');
  if (!uid) return err(res, 410, 'TOKEN_INVALID', 'Lien de vérification invalide, déjà utilisé ou expiré.');
  db.prepare('UPDATE users SET active=1, a_verifier=0 WHERE id=?').run(uid);
  bumpRev();
  const u = db.prepare('SELECT nom FROM users WHERE id=?').get(uid);
  const qui = (u ? u.nom : uid) + ' — inscription en ligne';
  auditAppend(uid, qui, 'Courriel vérifié : compte prestataire activé');
  const p = partenaireDe(uid);
  let transmis = false;
  if (p && p.soumissionEnAttente) {
    const e = require('./partenaires').soumettreDossier(p, { uid, who: qui });
    transmis = !e;
    if (e) { delete p.soumissionEnAttente; p.historique.push({ t: frDate(), who: 'Système', action: 'dossier à compléter avant soumission — ' + e.error }); partenaireSave(p); }
  }
  res.json({ ok: true, transmis, message: transmis
    ? 'Adresse vérifiée : votre dossier de référencement est transmis au service des achats. Connectez-vous pour suivre son instruction.'
    : 'Adresse vérifiée. Connectez-vous pour compléter et soumettre votre dossier de référencement.' });
});

module.exports = r;
