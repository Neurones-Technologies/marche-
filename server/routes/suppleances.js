/* Suppléances des valideurs absents : délégations pour une période, affectations d'un niveau de dossier.
   Seules ces routes écrivent « delegations » et « affectations » (la route générique d'état les refuse).
   Voir server/suppleance.js pour les règles. */
const express = require('express');
const { db, kvSet, pkvGet, besoinGet, commandeGet, partenaireGet, auditAppend, frDate } = require('../db');
const { requireAuth, whoLabel, roleDef } = require('../auth');
const C = require('../../public/js/circuits.js');
const SU = require('../suppleance');

const r = express.Router();
const err = (res, status, code, error) => res.status(status).json({ error, code });
const iso = (x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x || '')) && !isNaN(Date.parse(x));
const jours = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const fr = (d) => d.split('-').reverse().join('/');

/* Un utilisateur interne qui valide au moins un circuit, ou qui gère les habilitations, voit les suppléances. */
function circuitsDe(u) { const h = SU.habilitations(u); return Object.keys(SU.CIRCUITS).filter((t) => h[SU.CIRCUITS[t].perm]); }
function concerne(req) { return req.can('roles.edit') || circuitsDe(req.user).length > 0; }

/** Dossier et circuit visés par une affectation. */
function dossier(type, cible) {
  cible = String(cible || '');
  if (type === 'attribution') {
    const ap = (pkvGet(cible, 'approvals') || {}).value, cdc = (pkvGet(cible, 'cdc') || {}).value || {};
    if (!Array.isArray(ap)) return null;
    return { circuit: ap, ref: cdc.ref || cible, ouvert: !!(pkvGet(cible, 'evalDone') || {}).value && !C.complet(ap), intervenants: [] };
  }
  if (type === 'besoin') { const b = besoinGet(cible); return b && { circuit: b.circuit, ref: 'Besoin ' + b.id, ouvert: b.statut === 'soumis', intervenants: [b.par] }; }
  if (type === 'commande') { const c = commandeGet(cible); return c && { circuit: c.circuit, ref: 'Commande ' + (c.numero || c.id), ouvert: c.statut === 'validation', intervenants: [c.creePar] }; }
  if (type === 'avenant') {
    const [cid, n] = cible.split('#'), c = commandeGet(cid), a = c && (c.avenants || [])[Number(n) - 1];
    return a && { circuit: a.circuit, ref: 'Commande ' + (c.numero || c.id) + ', avenant n° ' + n, ouvert: a.statut === 'validation', intervenants: [a.creePar] };
  }
  if (type === 'referencement') { const p = partenaireGet(cible); return p && { circuit: p.circuit, ref: 'Partenaire ' + p.id + ' — ' + p.raisonSociale, ouvert: p.statut === 'verification', intervenants: p.comptes || [] }; }
  return null;
}

/** Délégations et affectations visibles, avec les comptes qui peuvent être choisis comme suppléants. */
r.get('/', requireAuth, (req, res) => {
  if (!concerne(req)) return err(res, 403, 'FORBIDDEN', 'Suppléances réservées aux valideurs et à l’administration.');
  const tout = req.can('roles.edit'), moi = req.user.id;
  const comptes = db.prepare('SELECT id, nom, email, role FROM users WHERE active=1 ORDER BY nom').all()
    .map((u) => ({ id: u.id, nom: u.nom, role: u.role, roleLab: roleDef(u.role).lab, circuits: circuitsDe(u) }))
    .filter((u) => u.circuits.length);
  res.json({
    circuits: SU.CIRCUITS,
    delegations: SU.delegations().filter((d) => tout || d.de === moi || d.a === moi).map((d) => ({ ...d, etat: SU.etatDelegation(d) })),
    affectations: SU.affectations().filter((a) => tout || a.a === moi),
    comptes,
  });
});

/** Nouvelle délégation : par le titulaire pour lui-même, ou par l'administration pour un titulaire. */
r.post('/delegations', requireAuth, (req, res) => {
  const { de, a, du, au, motif } = req.body || {};
  const types = [...new Set(Array.isArray((req.body || {}).types) ? req.body.types : [])];
  if (de !== req.user.id && !req.can('roles.edit')) return err(res, 403, 'FORBIDDEN', 'Vous ne pouvez déléguer que vos propres validations.');
  const titulaire = SU.compte(de), suppleant = SU.compte(a);
  if (!titulaire || !titulaire.active) return err(res, 422, 'DELEGATION_HOLDER', 'Titulaire introuvable ou inactif.');
  if (!suppleant || !suppleant.active) return err(res, 422, 'DELEGATION_DEPUTY', 'Suppléant introuvable ou inactif.');
  if (de === a) return err(res, 422, 'DELEGATION_SELF', 'Le suppléant doit être une autre personne que le titulaire.');
  if (!iso(du) || !iso(au) || du > au) return err(res, 422, 'DELEGATION_DATES', 'Période invalide : date de début, puis date de fin.');
  if (au < SU.aujourdhui()) return err(res, 422, 'DELEGATION_PAST', 'La période est déjà passée.');
  if (jours(du, au) > 180) return err(res, 422, 'DELEGATION_TOO_LONG', 'Une délégation couvre 180 jours au plus : au-delà, changez plutôt le rôle du suppléant.');
  if (!types.length || types.some((t) => !SU.CIRCUITS[t])) return err(res, 422, 'DELEGATION_CIRCUITS', 'Choisissez au moins un circuit.');
  const h = SU.habilitations(suppleant), manque = types.filter((t) => !h[SU.CIRCUITS[t].perm]);
  if (manque.length) return err(res, 422, 'DELEGATION_PERMISSION', `${suppleant.nom} n’a pas l’habilitation de valider : ${manque.map((t) => SU.CIRCUITS[t].lab).join(', ')}. Une délégation transfère un niveau, pas une habilitation.`);
  const m = String(motif || '').trim().slice(0, 300);
  const d = { id: 'D' + Date.now().toString(36), de, deNom: titulaire.nom, a, aNom: suppleant.nom, du, au, types, motif: m,
    par: req.user.id, parNom: req.user.nom, le: frDate() };
  kvSet('delegations', [d].concat(SU.delegations()).slice(0, 200), req.user.id);
  const quoi = types.map((t) => SU.CIRCUITS[t].lab.toLowerCase()).join(', ');
  auditAppend(req.user.id, whoLabel(req.user), `Délégation — ${titulaire.nom} → ${suppleant.nom}, du ${fr(du)} au ${fr(au)} (${quoi})${m ? ' : ' + m : ''}`);
  SU.notifier([a], 'Vous suppléez ' + titulaire.nom,
    `Du ${fr(du)} au ${fr(au)}, vous pouvez valider à la place de ${titulaire.nom} (${roleDef(titulaire.role).lab}) : ${quoi}.${m ? ' Motif : ' + m + '.' : ''}`);
  if (de !== req.user.id) SU.notifier([de], 'Suppléance organisée pendant votre absence', `${suppleant.nom} valide à votre place du ${fr(du)} au ${fr(au)} : ${quoi}.`);
  res.status(201).json({ delegation: { ...d, etat: SU.etatDelegation(d) } });
});

/** Fin anticipée d'une délégation : par le titulaire, le suppléant ou l'administration. */
r.post('/delegations/:id/annuler', requireAuth, (req, res) => {
  const list = SU.delegations(), d = list.find((x) => x.id === req.params.id);
  if (!d) return err(res, 404, 'DELEGATION_UNKNOWN', 'Délégation introuvable.');
  if (![d.de, d.a].includes(req.user.id) && !req.can('roles.edit')) return err(res, 403, 'FORBIDDEN', 'Seuls le titulaire, le suppléant ou l’administration peuvent y mettre fin.');
  if (d.annulee) return err(res, 409, 'DELEGATION_ENDED', 'Cette délégation est déjà annulée.');
  d.annulee = { par: req.user.id, parNom: req.user.nom, le: frDate() };
  kvSet('delegations', list, req.user.id);
  auditAppend(req.user.id, whoLabel(req.user), `Délégation annulée — ${d.deNom} → ${d.aNom}`);
  SU.notifier([d.de, d.a].filter((x) => x !== req.user.id), 'Suppléance terminée', `La délégation de ${d.deNom} à ${d.aNom} a pris fin le ${frDate()}.`);
  res.json({ delegation: { ...d, etat: SU.etatDelegation(d) } });
});

/** Affectation d'un niveau en attente d'un dossier à une personne nommée (administration). */
r.post('/affectations', requireAuth, (req, res) => {
  if (!req.can('roles.edit')) return err(res, 403, 'FORBIDDEN', 'L’affectation d’un dossier est réservée à l’administration.');
  const { type, cible, a } = req.body || {}, niveau = Number((req.body || {}).niveau), motif = String((req.body || {}).motif || '').trim();
  const D = SU.CIRCUITS[SU.typeDelegation(type)] && dossier(type, cible);
  if (!D) return err(res, 404, 'FILE_UNKNOWN', 'Dossier introuvable.');
  if (!D.ouvert) return err(res, 409, 'FILE_NOT_PENDING', 'Ce dossier n’attend aucune validation.');
  if (C.prochaine(D.circuit) !== niveau) return err(res, 409, 'STEP_NOT_PENDING', 'Seul le niveau en attente peut être affecté.');
  if (!motif || motif.length > 300) return err(res, 422, 'ASSIGNMENT_REASON_REQUIRED', 'L’affectation doit être motivée (300 caractères au plus).');
  const u = SU.compte(a);
  if (!u || !u.active) return err(res, 422, 'ASSIGNMENT_DEPUTY', 'Personne introuvable ou inactive.');
  if (!SU.habilitations(u)[SU.CIRCUITS[SU.typeDelegation(type)].perm]) return err(res, 422, 'ASSIGNMENT_PERMISSION', `${u.nom} n’a pas l’habilitation de valider ce circuit.`);
  if (D.intervenants.includes(u.id)) return err(res, 422, 'SEPARATION_OF_DUTIES', `${u.nom} est déjà intervenu sur ce dossier : il ne peut pas le valider.`);
  const list = SU.affectations(), cle = String(cible);
  list.forEach((x) => { if (!x.annulee && x.type === type && x.cible === cle && x.niveau === niveau) x.annulee = { par: req.user.id, parNom: req.user.nom, le: frDate(), remplacee: true }; });
  const etape = D.circuit[niveau];
  const x = { id: 'A' + Date.now().toString(36), type, cible: cle, ref: D.ref, niveau, role: etape.role, a: u.id, aNom: u.nom, motif,
    par: req.user.id, parNom: req.user.nom, le: frDate() };
  kvSet('affectations', [x].concat(list).slice(0, 300), req.user.id);
  auditAppend(req.user.id, whoLabel(req.user), `Affectation — ${D.ref}, niveau « ${etape.role} » confié à ${u.nom} : ${motif}`, type === 'attribution' ? cle : null);
  SU.notifier([u.id], 'Un dossier vous est affecté', `${D.ref} attend votre validation au niveau « ${etape.role} ». Motif : ${motif}.`);
  res.status(201).json({ affectation: x });
});

r.post('/affectations/:id/annuler', requireAuth, (req, res) => {
  if (!req.can('roles.edit')) return err(res, 403, 'FORBIDDEN', 'Réservé à l’administration.');
  const list = SU.affectations(), x = list.find((y) => y.id === req.params.id);
  if (!x) return err(res, 404, 'ASSIGNMENT_UNKNOWN', 'Affectation introuvable.');
  if (x.annulee) return err(res, 409, 'ASSIGNMENT_ENDED', 'Cette affectation est déjà annulée.');
  x.annulee = { par: req.user.id, parNom: req.user.nom, le: frDate() };
  kvSet('affectations', list, req.user.id);
  auditAppend(req.user.id, whoLabel(req.user), `Affectation annulée — ${x.ref}, niveau « ${x.role} » (${x.aNom})`, x.type === 'attribution' ? x.cible : null);
  res.json({ affectation: x });
});

module.exports = r;
