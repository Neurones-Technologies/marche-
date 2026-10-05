/* Suppléance des valideurs absents (docs/CADRAGE.md) : deux mécanismes, enregistrés dans l'état de l'organisation.

   - Délégation (kv « delegations ») : un titulaire, ou l'administrateur pour lui, désigne un suppléant pour une
     période et des circuits. Pendant la période, le suppléant franchit les niveaux réservés au rôle du titulaire.
   - Affectation (kv « affectations ») : l'administrateur confie un niveau en attente d'un dossier précis à une
     personne nommée, avec un motif.

   La suppléance transfère un niveau, pas des habilitations : le suppléant doit déjà détenir l'habilitation de
   validation du circuit. Elle ne lève jamais la séparation des fonctions (le moteur de circuits la vérifie sur
   la personne qui agit). Chaque décision prise en suppléance garde la mention « pour X ». */
const { db, kvGet, kvSet, frDate } = require('./db');

/* Circuits couverts, et l'habilitation que la validation exige. Un avenant suit la délégation « commande ». */
const CIRCUITS = {
  attribution: { lab: 'Attribution d’un appel d’offres', perm: 'decision.approve' },
  besoin: { lab: 'Validation des demandes d’achat', perm: 'besoin.approve' },
  commande: { lab: 'Bons de commande et avenants', perm: 'commande.approve' },
  referencement: { lab: 'Référencement des partenaires', perm: 'partenaires.manage' },
};
const typeDelegation = (type) => (type === 'avenant' ? 'commande' : type);
const aujourdhui = () => new Date().toISOString().slice(0, 10);

const delegations = () => (kvGet('delegations') || { value: [] }).value || [];
const affectations = () => (kvGet('affectations') || { value: [] }).value || [];

/** Une délégation est en vigueur aujourd'hui si elle n'est pas annulée et que la date est dans sa période. */
function enVigueur(d, jour = aujourdhui()) { return !d.annulee && d.du <= jour && jour <= d.au; }
function etatDelegation(d, jour = aujourdhui()) {
  if (d.annulee) return 'annulee';
  if (jour < d.du) return 'a_venir';
  if (jour > d.au) return 'terminee';
  return 'en_cours';
}

const compte = (id) => db.prepare('SELECT id, nom, email, role, active FROM users WHERE id=?').get(id);
function habilitations(u) {
  if (!u) return {};
  const roles = (kvGet('roles') || { value: {} }).value;
  return ((roles[u.role] || {}).perms) || {};
}

/**
 * Suppléance de l'utilisateur pour un dossier : { roles, affectes } (voir MPCircuits.controle).
 * type : attribution | besoin | commande | avenant | referencement ; cible : identifiant du dossier.
 */
function sup(user, type, cible) {
  const t = typeDelegation(type), roles = {}, affectes = {};
  for (const d of delegations()) {
    if (d.a !== user.id || !enVigueur(d) || !(d.types || []).includes(t)) continue;
    const titulaire = compte(d.de);
    if (titulaire && titulaire.role !== user.role && !roles[titulaire.role]) roles[titulaire.role] = { id: titulaire.id, nom: titulaire.nom, du: d.du, au: d.au };
  }
  for (const a of affectations()) {
    if (a.annulee || a.a !== user.id || a.type !== type || a.cible !== String(cible)) continue;
    affectes[a.niveau] = { motif: a.motif, par: a.parNom };
  }
  return { roles, affectes };
}

/** Mention à consigner : « (pour A. Diomandé, délégation du … au …) » ou « (sur affectation : motif) ». */
function mention(p) {
  if (!p) return '';
  if (p.via === 'delegation') return ` (pour ${p.nom}, délégation du ${p.du.split('-').reverse().join('/')} au ${p.au.split('-').reverse().join('/')})`;
  return ` (sur affectation${p.motif ? ' : ' + p.motif : ''})`;
}

/** Notification ciblée sur des comptes précis (et non sur des rôles), dans le fil de l'organisation. */
function notifier(ids, titre, corps) {
  const cur = (kvGet('notifs') || { value: [] }).value;
  cur.unshift({ id: 'n' + Date.now() + Math.random().toString(36).slice(2, 6), ev: 'suppleance', lab: 'Suppléance',
    titre, corps, t: frDate(), roles: [], ids: ids.filter(Boolean), lu: [] });
  kvSet('notifs', cur.slice(0, 120), 'suppleance');
}

module.exports = { CIRCUITS, typeDelegation, aujourdhui, delegations, affectations, enVigueur, etatDelegation, compte, habilitations, sup, mention, notifier };
