/* Module 1 — référencement des partenaires (docs/CADRAGE.md §4).
   Le prestataire complète sa fiche et dépose ses pièces administratives ; il soumet son dossier, qui suit le parcours
   de référencement de l'organisation (moteur de circuits, clé circuitReferencement). Les achats (habilitation
   « Référencer les partenaires ») instruisent, valident les pièces, suspendent ou excluent.

   Statuts : candidat → verification → reference ; rejete (motivé, retour au prestataire) ; suspendu ↔ reference ; exclu.
   Une pièce validée au référencement tient lieu de pièce du dossier de candidature à chaque dépôt d'offre. */
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { db, kvGet, partenairesAll, partenaireGet, partenaireSave, partenaireDe, commandesAll, auditAppend, frDate } = require('../db');
const { requireAuth, whoLabel } = require('../auth');
const { lireFichier, corpsBrut, diskPath } = require('./files');
const SU = require('../suppleance');
const C = require('../../public/js/circuits.js');
const F = require('../formulaire');

const r = express.Router();
r.use(requireAuth);

const gere = (req) => req.can('partenaires.manage');
const err = (res, status, code, error) => res.status(status).json({ error, code });
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const journal = (req, p, action) => {
  p.historique.push({ t: frDate(), who: whoLabel(req.user), action });
  auditAppend(req.user.id, whoLabel(req.user), `Partenaire ${p.id} (${p.raisonSociale}) — ${action}`);
};

/** Pièces demandées pour le référencement : celles du formulaire de l'organisation, selon le pays du partenaire. */
const piecesExigees = (p) => F.piecesPour(p.pays);
/** Une pièce tient lieu de pièce de dossier si elle est validée et non expirée. */
const pieceValable = (x) => !!x && x.statut === 'valide' && (!x.expire || x.expire >= aujourdhui());
/** Vue d'une fiche : avec les pièces exigées et leur état, pour l'interface. */
function vue(p) {
  const exigees = piecesExigees(p).map((d) => {
    const x = p.pieces[d.id];
    const etat = !x ? 'manquante' : (x.expire && x.expire < aujourdhui() ? 'expiree' : x.statut);
    return { id: d.id, label: d.label, obligatoire: d.obligatoire !== false, expiration: !!d.expiration, etat, piece: x || null };
  });
  // évaluations reçues (module 5) : une par commande clôturée
  const evaluations = commandesAll().filter((c) => c.evaluation && c.evaluation.partenaire === p.id)
    .map((c) => ({ commande: c.numero, procedure: c.procedure.ref, date: c.receptionDefinitive && c.receptionDefinitive.date, ...c.evaluation }));
  return { ...p, reponses: p.reponses || {}, exigees, evaluations, questions: F.formulaire().champs };
}

r.get('/', (req, res) => {
  if (!gere(req)) return err(res, 403, 'FORBIDDEN', 'Habilitation « Référencer les partenaires » requise.');
  res.json({ partenaires: partenairesAll().map(vue) });
});

r.get('/moi', (req, res) => {
  const p = partenaireDe(req.user.id);
  res.json({ partenaire: p ? vue(p) : null });
});

/** Partenaires référencés, pour choisir ceux qu'on consulte sur un appel d'offres (rédacteur du dossier ou achats). */
r.get('/references', (req, res) => {
  if (!gere(req) && !req.can('cdc.edit') && !req.can('cdc.publish')) return err(res, 403, 'FORBIDDEN', 'Habilitation insuffisante.');
  res.json({ partenaires: partenairesAll().filter((p) => p.statut === 'reference').map((p) => ({ id: p.id, raisonSociale: p.raisonSociale, pays: p.pays,
    domaines: p.domaines || [], activite: (p.reponses || {}).activite || '', referenceLe: p.referenceLe, evaluation: p.evaluation || null })) });
});

/* Routes sur une fiche : son titulaire ou un acheteur habilité. */
r.use('/:id', (req, res, next) => {
  const p = partenaireGet(req.params.id);
  const titulaire = p && (p.comptes || []).indexOf(req.user.id) >= 0;
  if (!p || !(titulaire || gere(req))) return err(res, 404, 'PARTNER_UNKNOWN', 'Fiche partenaire introuvable.');
  req.partenaire = p; req.titulaire = titulaire;
  next();
});

r.put('/:id', (req, res) => {
  const p = req.partenaire, d = req.body || {};
  if (!req.titulaire) return err(res, 403, 'PARTNER_NOT_OWNER', 'Seul le partenaire complète sa fiche.');
  if (!['candidat', 'rejete', 'reference', 'suspendu'].includes(p.statut)) return err(res, 409, 'PARTNER_LOCKED', 'La fiche ne se modifie pas pendant l’instruction du dossier.');
  const champs = {
    raisonSociale: String(d.raisonSociale != null ? d.raisonSociale : p.raisonSociale).trim(),
    pays: String(d.pays != null ? d.pays : p.pays).trim().toUpperCase(),
    immatriculation: String(d.immatriculation != null ? d.immatriculation : p.immatriculation).trim(),
    adresse: String(d.adresse != null ? d.adresse : p.adresse || '').trim(),
    contact: { nom: String((d.contact || p.contact || {}).nom || '').trim(), email: String((d.contact || p.contact || {}).email || '').trim(), tel: String((d.contact || p.contact || {}).tel || '').trim() },
    domaines: Array.isArray(d.domaines) ? d.domaines.map((x) => String(x).trim()).filter(Boolean).slice(0, 20) : p.domaines || [],
  };
  if (champs.raisonSociale.length < 2 || champs.raisonSociale.length > 200) return err(res, 422, 'PARTNER_INVALID', 'Raison sociale invalide.');
  if (champs.pays && !/^[A-Z]{2}$/.test(champs.pays)) return err(res, 422, 'PARTNER_INVALID', 'Pays invalide (code à deux lettres).');
  if (champs.immatriculation.length > 80 || champs.adresse.length > 300) return err(res, 422, 'PARTNER_INVALID', 'Texte trop long.');
  // un partenaire référencé qui change d'identité légale repasse par l'instruction
  const identite = champs.raisonSociale !== p.raisonSociale || champs.pays !== p.pays || champs.immatriculation !== p.immatriculation;
  if (identite && ['reference', 'suspendu'].includes(p.statut)) return err(res, 409, 'PARTNER_IDENTITY_LOCKED', 'Raison sociale, pays et immatriculation d’un partenaire référencé ne se modifient que par le service des achats.');
  // réponses aux questions du formulaire de référencement (complètes seulement à la soumission)
  if (d.reponses !== undefined) {
    const v = F.verifierReponses(d.reponses, false);
    if (v.erreur) return err(res, 422, 'PARTNER_INVALID', v.erreur);
    champs.reponses = v.reponses;
  }
  db.transaction(() => { Object.assign(p, champs); journal(req, p, 'fiche modifiée'); partenaireSave(p); })();
  res.json({ partenaire: vue(p) });
});

/* Dépôts de pièces d'une fiche : débit limité par compte, et volume total plafonné (les versions remplacées restent
   archivées), pour qu'un compte ne puisse pas remplir le disque. */
const limiteDepots = require('express-rate-limit').rateLimit({ windowMs: 3600000, limit: Number(process.env.PIECES_PAR_HEURE) || 60,
  keyGenerator: (req) => 'u:' + req.user.id, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Trop de dépôts de pièces : réessayez dans une heure.', code: 'TOO_MANY_UPLOADS' } });
const PLAFOND_FICHE = (Number(process.env.PARTENAIRE_MAX_MO) || 200) * 1024 * 1024;
/** Dépôt d'une pièce administrative (fichier brut) ; ?doc= pièce visée, ?expire=AAAA-MM-JJ facultatif. */
r.post('/:id/fichiers', limiteDepots, corpsBrut, (req, res) => {
  const p = req.partenaire;
  if (!req.titulaire) return err(res, 403, 'PARTNER_NOT_OWNER', 'Seul le partenaire dépose ses pièces.');
  if (['verification', 'exclu'].includes(p.statut)) return err(res, 409, 'PARTNER_LOCKED', 'Les pièces ne se modifient pas pendant l’instruction du dossier.');
  const fx = lireFichier(req);
  if (fx.erreur) return err(res, fx.status, 'FILE_INVALID', fx.erreur);
  const def = piecesExigees(p).find((d) => d.id === fx.doc);
  if (!def) return err(res, 422, 'PIECE_NOT_REQUIRED', 'Cette pièce ne fait pas partie du dossier de référencement.');
  const expire = String(req.query.expire || '');
  if (def.expiration && !expire) return err(res, 422, 'PIECE_EXPIRY_REQUIRED', '« ' + def.label + ' » : indiquez sa date de fin de validité.');
  if (expire && !/^\d{4}-\d{2}-\d{2}$/.test(expire)) return err(res, 422, 'FILE_INVALID', 'Date de validité invalide (AAAA-MM-JJ).');
  if (expire && expire < aujourdhui()) return err(res, 422, 'PIECE_EXPIRED', 'Cette pièce est déjà expirée.');
  const volume = db.prepare('SELECT sum(size) s FROM files WHERE partenaire_id=?').get(p.id).s || 0;
  if (volume + fx.body.length > PLAFOND_FICHE)
    return err(res, 413, 'PARTNER_STORAGE_FULL', 'Volume de pièces atteint pour cette fiche : contactez le service des achats.');
  const id = crypto.randomUUID(), ancienne = p.pieces[fx.doc];
  fs.writeFileSync(diskPath(id), fx.body, { mode: 0o600 });
  db.transaction(() => {
    db.prepare('INSERT INTO files(id,owner,doc_id,name,mime,size,sha256,partenaire_id) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, req.user.id, fx.doc, fx.name, fx.mime, fx.body.length, fx.sha, p.id);
    // une pièce remplacée reste archivée (fichier et empreinte), la fiche ne pointe que sur la dernière
    p.pieces[fx.doc] = { fichier: id, nom: fx.name, taille: fx.body.length, sha256: fx.sha, expire: expire || null, depose: frDate(), statut: 'a_verifier', remplace: ancienne ? ancienne.fichier : null };
    journal(req, p, `pièce déposée — ${fx.doc}${expire ? ' (valable jusqu’au ' + expire + ')' : ''}`);
    partenaireSave(p);
  })();
  res.status(201).json({ partenaire: vue(p) });
});

/** Décision sur une pièce (achats), en dehors de l'instruction initiale : validée ou refusée avec motif. */
r.put('/:id/pieces/:doc', (req, res) => {
  const p = req.partenaire, x = p.pieces[req.params.doc], { statut, motif } = req.body || {};
  if (!gere(req)) return err(res, 403, 'FORBIDDEN', 'Habilitation « Référencer les partenaires » requise.');
  if (!x) return err(res, 404, 'PIECE_UNKNOWN', 'Pièce non déposée.');
  if (!['valide', 'refuse'].includes(statut)) return err(res, 422, 'PIECE_INVALID', 'Décision attendue : valide ou refuse.');
  if (statut === 'refuse' && !String(motif || '').trim()) return err(res, 422, 'REJECTION_REASON_REQUIRED', 'Le refus d’une pièce doit être motivé.');
  db.transaction(() => {
    Object.assign(x, { statut, motif: statut === 'refuse' ? String(motif).trim().slice(0, 500) : undefined, decidePar: req.user.id, decideLe: frDate() });
    journal(req, p, `pièce ${req.params.doc} ${statut === 'valide' ? 'validée' : 'refusée — motif : ' + x.motif}`);
    partenaireSave(p);
  })();
  res.json({ partenaire: vue(p) });
});

/**
 * Soumission d'un dossier au référencement : fiche complète, réponses obligatoires données, pièces obligatoires
 * déposées et en cours de validité. Retourne { status, code, error } si le dossier n'est pas soumissible, sinon met le
 * dossier en instruction (parcours de l'organisation) et retourne null. Sert aussi à l'inscription sur le portail,
 * dont le dossier part en instruction à la vérification du courriel.
 */
function soumettreDossier(p, qui) {
  const ko = (status, code, error) => ({ status, code, error });
  if (!['candidat', 'rejete'].includes(p.statut)) return ko(409, 'PARTNER_LOCKED', 'Ce dossier n’est pas à soumettre.');
  if (!p.raisonSociale || !p.pays || !p.immatriculation) return ko(422, 'PARTNER_INCOMPLETE', 'Raison sociale, pays et numéro d’immatriculation sont obligatoires.');
  const manquantes = vue(p).exigees.filter((e) => e.obligatoire && (e.etat === 'manquante' || e.etat === 'expiree' || e.etat === 'refuse'));
  if (manquantes.length) return ko(422, 'PIECES_MISSING', 'Pièces manquantes, expirées ou refusées : ' + manquantes.map((e) => e.label).join(' ; ') + '.');
  const rep = F.verifierReponses(p.reponses, true);
  if (rep.erreur) return ko(422, 'PARTNER_INCOMPLETE', rep.erreur);
  const modele = (kvGet('circuitReferencement') || { value: [] }).value;
  const circuit = C.appliquerMontant(C.reinitialiser(modele), 0);
  if (!C.nbRequises(circuit)) return ko(409, 'CIRCUIT_EMPTY', 'Le parcours de référencement n’a aucune étape : à configurer dans Paramètres.');
  db.transaction(() => {
    Object.assign(p, { statut: 'verification', circuit, soumis: frDate() });
    delete p.rejet; delete p.soumissionEnAttente;
    p.historique.push({ t: frDate(), who: qui.who, action: 'dossier soumis au référencement' });
    auditAppend(qui.uid, qui.who, `Partenaire ${p.id} (${p.raisonSociale}) — dossier soumis au référencement`);
    partenaireSave(p);
  })();
  return null;
}

r.post('/:id/soumettre', (req, res) => {
  const p = req.partenaire;
  if (!req.titulaire) return err(res, 403, 'PARTNER_NOT_OWNER', 'Seul le partenaire soumet son dossier.');
  const e = soumettreDossier(p, { uid: req.user.id, who: whoLabel(req.user) });
  if (e) return err(res, e.status, e.code, e.error);
  res.json({ partenaire: vue(p) });
});

/** Étape du parcours de référencement. Le dernier niveau référence le partenaire et valide les pièces déposées. */
r.post('/:id/approbations/:niveau', (req, res) => {
  const p = req.partenaire, i = Number(req.params.niveau);
  if (!gere(req)) return err(res, 403, 'FORBIDDEN', 'Habilitation « Référencer les partenaires » requise.');
  if (p.statut !== 'verification') return err(res, 409, 'PARTNER_NOT_SUBMITTED', 'Ce dossier n’est pas en cours d’instruction.');
  const sup = SU.sup(req.user, 'referencement', p.id);
  const e = C.controle(p.circuit, i, req.user, p.comptes || [], sup);
  if (e) return err(res, e.status, e.code, e.error);
  const pour = C.pour(p.circuit, i, req.user, sup);
  db.transaction(() => {
    Object.assign(p.circuit[i], { done: true, by: req.user.id, at: frDate() }, pour ? { pour } : {});
    journal(req, p, `étape franchie — ${p.circuit[i].role}${SU.mention(pour)}`);
    if (C.complet(p.circuit)) {
      p.statut = 'reference'; p.referenceLe = frDate();
      Object.values(p.pieces).forEach((x) => { if (x.statut === 'a_verifier') Object.assign(x, { statut: 'valide', decidePar: req.user.id, decideLe: frDate() }); });
      journal(req, p, 'référencé');
    }
    partenaireSave(p);
  })();
  res.json({ partenaire: vue(p) });
});

/** Rejet motivé du dossier, par le niveau attendu : retour au partenaire pour correction. */
r.post('/:id/rejet', (req, res) => {
  const p = req.partenaire, motif = String((req.body || {}).motif || '').trim();
  if (!gere(req)) return err(res, 403, 'FORBIDDEN', 'Habilitation « Référencer les partenaires » requise.');
  if (p.statut !== 'verification') return err(res, 409, 'PARTNER_NOT_SUBMITTED', 'Ce dossier n’est pas en cours d’instruction.');
  if (!motif || motif.length > 1000) return err(res, 422, 'REJECTION_REASON_REQUIRED', 'Le rejet doit être motivé (1 000 caractères au plus).');
  const i = C.prochaine(p.circuit), sup = SU.sup(req.user, 'referencement', p.id), e = C.controle(p.circuit, i, req.user, p.comptes || [], sup);
  if (e) return err(res, e.status, e.code, e.error);
  const pour = C.pour(p.circuit, i, req.user, sup);
  db.transaction(() => {
    p.statut = 'rejete';
    p.rejet = Object.assign({ niveau: i, role: p.circuit[i].role, motif, by: req.user.id, at: frDate() }, pour ? { pour } : {});
    journal(req, p, `dossier rejeté (${p.circuit[i].role})${SU.mention(pour)} — motif : ${motif}`);
    partenaireSave(p);
  })();
  res.json({ partenaire: vue(p) });
});

/** Suspension, réactivation ou exclusion d'un partenaire référencé (achats), toujours motivées. */
const TRANSITIONS = { suspendu: ['reference'], reference: ['suspendu'], exclu: ['reference', 'suspendu', 'candidat', 'rejete'] };
r.post('/:id/statut', (req, res) => {
  const p = req.partenaire, { statut } = req.body || {}, motif = String((req.body || {}).motif || '').trim();
  if (!gere(req)) return err(res, 403, 'FORBIDDEN', 'Habilitation « Référencer les partenaires » requise.');
  if (!TRANSITIONS[statut] || !TRANSITIONS[statut].includes(p.statut)) return err(res, 409, 'PARTNER_TRANSITION', `Passage de « ${p.statut} » à « ${statut} » impossible.`);
  if (!motif || motif.length > 1000) return err(res, 422, 'REASON_REQUIRED', 'La décision doit être motivée (1 000 caractères au plus).');
  if (statut === 'reference') {
    const ko = vue(p).exigees.filter((e) => e.obligatoire && e.etat !== 'valide');
    if (ko.length) return err(res, 422, 'PIECES_MISSING', 'Réactivation impossible : pièces à jour requises — ' + ko.map((e) => e.label).join(' ; ') + '.');
  }
  db.transaction(() => {
    const avant = p.statut;
    p.statut = statut;
    p.decision = { de: avant, vers: statut, motif, by: req.user.id, at: frDate() };
    journal(req, p, `${statut === 'reference' ? 'réactivé' : statut} — motif : ${motif}`);
    partenaireSave(p);
  })();
  res.json({ partenaire: vue(p) });
});

module.exports = r;
module.exports.pieceValable = pieceValable;
module.exports.soumettreDossier = soumettreDossier;
