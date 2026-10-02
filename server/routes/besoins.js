/* Module 2 — de l'intention à la publication (docs/CADRAGE.md §4).
   Un service exprime un besoin, le soumet au circuit de validation de l'organisation (moteur de circuits), puis les
   achats en font une procédure pré-remplie. Les besoins appartiennent à l'organisation, pas à une procédure.

   Statuts : brouillon → soumis → valide → transforme ; un rejet (motivé) renvoie au demandeur (statut rejete),
   qui peut corriger et soumettre de nouveau. */
const express = require('express');
const { db, kvGet, besoinsAll, besoinGet, besoinInsert, besoinSave, besoinNumero, proceduresAll, procedureCreate, auditAppend, frDate } = require('../db');
const { requireAuth, whoLabel } = require('../auth');
const C = require('../../public/js/circuits.js');
const P = require('../../public/js/profils.js');

const r = express.Router();
r.use(requireAuth);

const voitTout = (req) => req.can('besoin.manage') || req.can('besoin.approve');
const visible = (req, b) => voitTout(req) || b.par === req.user.id;
const err = (res, status, code, error) => res.status(status).json({ error, code });
const journal = (req, b, action) => {
  b.historique.push({ t: frDate(), who: whoLabel(req.user), action });
  auditAppend(req.user.id, whoLabel(req.user), `Besoin ${b.id} — ${action}`);
};
/** Règles du profil par défaut de l'organisation, avec ses réglages : fixent le type de procédure. */
const reglesOrg = () => { const org = (kvGet('org') || { value: {} }).value; return P.effectif(org.profilDefaut, org.reglages); };

/** Contrôle et normalise les champs saisis par le demandeur. */
function champs(d) {
  const out = {
    objet: String(d.objet || '').trim(), service: String(d.service || '').trim(),
    description: String(d.description || '').trim(), justification: String(d.justification || '').trim(),
    budget: Number(d.budget), dateSouhaitee: String(d.dateSouhaitee || '').trim(),
  };
  if (!out.objet || out.objet.length > 300) return { erreur: 'L’objet est obligatoire (300 caractères au plus).' };
  if (out.service.length > 120 || out.description.length > 4000 || out.justification.length > 2000) return { erreur: 'Texte trop long.' };
  if (!(out.budget > 0)) return { erreur: 'Le budget estimé doit être un montant positif.' };
  if (out.dateSouhaitee && !/^\d{4}-\d{2}-\d{2}$/.test(out.dateSouhaitee)) return { erreur: 'Date souhaitée invalide (AAAA-MM-JJ).' };
  return { champs: out };
}

r.get('/', (req, res) => {
  if (!req.can('besoin.create') && !voitTout(req)) return err(res, 403, 'FORBIDDEN', 'Habilitation insuffisante.');
  res.json({ besoins: besoinsAll().filter((b) => visible(req, b)), regles: reglesOrg(), types: P.TYPES });
});

r.post('/', (req, res) => {
  if (!req.can('besoin.create')) return err(res, 403, 'FORBIDDEN', 'Exprimer un besoin exige l’habilitation « Exprimer un besoin ».');
  const c = champs(req.body || {});
  if (c.erreur) return err(res, 422, 'NEED_INVALID', c.erreur);
  let b;
  db.transaction(() => {
    b = { id: besoinNumero(), ...c.champs, statut: 'brouillon', par: req.user.id, parNom: req.user.nom, cree: frDate(), circuit: [], historique: [] };
    journal(req, b, 'créé : ' + b.objet);
    besoinInsert(b, req.user.id);
  })();
  res.status(201).json({ besoin: b });
});

/* Routes sur un besoin existant : il doit exister et être visible de l'utilisateur. */
r.use('/:id', (req, res, next) => {
  const b = besoinGet(req.params.id);
  if (!b || !visible(req, b)) return err(res, 404, 'NEED_UNKNOWN', 'Besoin introuvable.');
  req.besoin = b;
  next();
});

r.put('/:id', (req, res) => {
  const b = req.besoin;
  if (b.par !== req.user.id) return err(res, 403, 'NEED_NOT_OWNER', 'Seul le demandeur modifie son besoin.');
  if (!['brouillon', 'rejete'].includes(b.statut)) return err(res, 409, 'NEED_LOCKED', 'Un besoin soumis ne se modifie plus.');
  const c = champs({ ...b, ...(req.body || {}) });
  if (c.erreur) return err(res, 422, 'NEED_INVALID', c.erreur);
  db.transaction(() => { Object.assign(b, c.champs); journal(req, b, 'modifié'); besoinSave(b); })();
  res.json({ besoin: b });
});

/** Soumission au circuit : le serveur fixe les étapes requises d'après le budget et le type de procédure pressenti. */
r.post('/:id/soumettre', (req, res) => {
  const b = req.besoin;
  if (b.par !== req.user.id) return err(res, 403, 'NEED_NOT_OWNER', 'Seul le demandeur soumet son besoin.');
  if (!['brouillon', 'rejete'].includes(b.statut)) return err(res, 409, 'NEED_LOCKED', 'Ce besoin est déjà soumis.');
  const modele = (kvGet('circuitBesoin') || { value: [] }).value;
  const circuit = C.appliquerMontant(C.reinitialiser(modele), b.budget);
  if (!C.nbRequises(circuit)) return err(res, 409, 'CIRCUIT_EMPTY', 'Le circuit de validation des besoins n’a aucune étape pour ce montant : à configurer dans Paramètres.');
  const type = P.typeProcedure(reglesOrg(), b.budget);
  db.transaction(() => {
    Object.assign(b, { statut: 'soumis', circuit, type: type.id, typeLab: type.lab, soumis: frDate() });
    delete b.rejet;
    journal(req, b, `soumis à validation (${type.lab})`);
    besoinSave(b);
  })();
  res.json({ besoin: b });
});

/** Validation d'une étape. Le demandeur ne valide jamais son propre besoin. */
r.post('/:id/approbations/:niveau', (req, res) => {
  const b = req.besoin, i = Number(req.params.niveau);
  if (!req.can('besoin.approve')) return err(res, 403, 'FORBIDDEN', 'Valider un besoin exige l’habilitation « Valider un besoin ».');
  if (b.statut !== 'soumis') return err(res, 409, 'NEED_NOT_SUBMITTED', 'Ce besoin n’est pas en attente de validation.');
  const e = C.controle(b.circuit, i, req.user, [b.par]);
  if (e) return err(res, e.status, e.code === 'SEPARATION_OF_DUTIES' ? 'NEED_OWN' : e.code, e.code === 'SEPARATION_OF_DUTIES' ? 'Vous ne pouvez pas valider un besoin que vous avez exprimé.' : e.error);
  db.transaction(() => {
    Object.assign(b.circuit[i], { done: true, by: req.user.id, at: frDate() });
    journal(req, b, `validé au niveau « ${b.circuit[i].role} »`);
    if (C.complet(b.circuit)) { b.statut = 'valide'; b.valide = frDate(); journal(req, b, 'validé : prêt à devenir une procédure'); }
    besoinSave(b);
  })();
  res.json({ besoin: b });
});

/** Rejet motivé par le niveau attendu : retour au demandeur, circuit remis à zéro à la prochaine soumission. */
r.post('/:id/rejet', (req, res) => {
  const b = req.besoin, motif = String((req.body || {}).motif || '').trim();
  if (!req.can('besoin.approve')) return err(res, 403, 'FORBIDDEN', 'Rejeter un besoin exige l’habilitation « Valider un besoin ».');
  if (b.statut !== 'soumis') return err(res, 409, 'NEED_NOT_SUBMITTED', 'Ce besoin n’est pas en attente de validation.');
  if (!motif || motif.length > 1000) return err(res, 422, 'REJECTION_REASON_REQUIRED', 'Le rejet doit être motivé (1 000 caractères au plus).');
  const i = C.prochaine(b.circuit);
  const e = C.controle(b.circuit, i, req.user, [b.par]);
  if (e) return err(res, e.status, e.code, e.error);
  db.transaction(() => {
    b.statut = 'rejete';
    b.rejet = { niveau: i, role: b.circuit[i].role, motif, by: req.user.id, at: frDate() };
    journal(req, b, `rejeté au niveau « ${b.circuit[i].role} » — motif : ${motif}`);
    besoinSave(b);
  })();
  res.json({ besoin: b });
});

/** Transformation en procédure (achats) : cahier des charges pré-rempli, lien conservé dans les deux sens. */
r.post('/:id/procedure', (req, res) => {
  const b = req.besoin, d = req.body || {};
  if (!req.can('besoin.manage') || !req.can('cdc.edit')) return err(res, 403, 'FORBIDDEN', 'Créer la procédure exige les habilitations « Instruire les besoins » et « Rédiger le cahier des charges ».');
  if (b.statut !== 'valide') return err(res, 409, 'NEED_NOT_VALIDATED', 'Seul un besoin validé devient une procédure.');
  const ref = String(d.ref || '').trim();
  if (!ref || ref.length > 40) return err(res, 422, 'REFERENCE_INVALID', 'La référence est obligatoire (40 caractères au plus).');
  if (proceduresAll().some((p) => String(p.ref).toLowerCase() === ref.toLowerCase())) return err(res, 409, 'REFERENCE_TAKEN', `La référence ${ref} est déjà utilisée.`);
  if (d.profil != null && !P.existe(d.profil)) return err(res, 422, 'PROFILE_UNKNOWN', 'Profil réglementaire inconnu.');
  let pid;
  db.transaction(() => {
    pid = procedureCreate({ ref, objet: b.objet, profil: d.profil, extra: {
      procedure: b.typeLab, budgetEstime: b.budget, besoin: b.id, demandeur: b.par, serviceDemandeur: b.service,
    } }, req.user.id);
    Object.assign(b, { statut: 'transforme', procedure: pid, procedureRef: ref });
    journal(req, b, `transformé en procédure ${ref}`);
    besoinSave(b);
    auditAppend(req.user.id, whoLabel(req.user), `Procédure créée à partir du besoin ${b.id} — ${ref} : ${b.objet}`, pid);
  })();
  res.status(201).json({ besoin: b, procedure: pid });
});

module.exports = r;
