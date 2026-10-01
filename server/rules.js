/* Règles métier appliquées côté serveur : qui peut écrire quelle partie de l'état. */
const { seed, kvGet } = require('./db');

// clé d'état -> habilitations (au moins une requise). '*' = tout utilisateur connecté.
const WRITE_PERMS = {
  cdc: ['cdc.edit', 'cdc.publish'],
  criteria: ['criteres.edit'],
  confirmed: ['depouille.confirm'],
  excluded: ['conformite.decide'],
  quality: ['eval.score'],
  justif: ['eval.score', 'eval.validate', 'decision.approve', 'conformite.decide'],
  depClosed: ['depouille.close'],
  evalDone: ['eval.validate'],
  approvals: ['decision.approve', 'params.edit'],
  org: ['params.edit'], seuils: ['params.edit'], docDefs: ['params.edit'],
  mailFrom: ['params.edit'], mailSuffix: ['params.edit'],
  offers: ['params.edit'],
  roles: ['roles.edit'], users: ['roles.edit'], delegations: ['roles.edit'],
  notifRules: ['notif.manage'],
  qa: ['qa.answer', 'portail.use'],
  additifs: ['qa.answer'],
  clarifs: ['clarif.send', 'portail.use'],
  recours: ['recours.handle', 'portail.use'],
  standstill: ['decision.approve', 'contract.sign', 'recours.handle'],
  contractSigned: ['contract.sign'],
  infructueux: ['decision.approve'],
  coi: ['*'], notifs: ['*'], emails: ['*'],
};
const CAPS = { notifs: 120, emails: 80, qa: 500, additifs: 200, clarifs: 500, recours: 200, delegations: 200 };

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }

/** Valide un changement de clé. Retourne null si OK, sinon un message d'erreur. */
function validateChange(key, value, req) {
  const perms = WRITE_PERMS[key];
  if (!perms) return `Clé d'état inconnue ou non modifiable : ${key}`;
  if (!perms.includes('*') && !perms.some((p) => req.can(p))) return `Habilitation insuffisante pour « ${key} ».`;
  const cur = (kvGet(key) || {}).value;

  switch (key) {
    case 'cdc':
      if (!isObj(value)) return 'Cahier des charges invalide.';
      if (!!value.cdcPublie !== !!(cur && cur.cdcPublie) && !req.can('cdc.publish')) return 'Publier le cahier des charges exige l’habilitation « Publier ».';
      if (cur && cur.cdcPublie && value.cdcPublie) {
        const a = JSON.stringify({ ...cur, cdcPublie: 0 }), b = JSON.stringify({ ...value, cdcPublie: 0 });
        if (a !== b && !req.can('cdc.edit')) return 'Cahier des charges publié : modification réservée.';
      }
      break;
    case 'criteria': {
      if (!Array.isArray(value)) return 'Grille invalide.';
      if (value.some((c) => !c || !c.id || !(Number(c.weight) >= 0))) return 'Critère invalide.';
      break;
    }
    case 'quality': {
      if (!isObj(value)) return 'Notes invalides.';
      const coi = ((kvGet('coi') || {}).value || {})[req.user.id];
      if (!coi || !coi.declare || coi.conflit) return 'Déclaration d’absence de conflit d’intérêts requise avant de noter.';
      for (const o of Object.values(value)) for (const v of Object.values(o || {})) if (!(Number(v) >= 0 && Number(v) <= 100)) return 'Une note doit être comprise entre 0 et 100.';
      break;
    }
    case 'depClosed': case 'evalDone': case 'contractSigned':
      if (typeof value !== 'boolean') return 'Booléen attendu.';
      if (key === 'contractSigned' && value) {
        const ap = ((kvGet('approvals') || {}).value || []);
        if (!ap.length || !ap.every((a) => a.done)) return 'Le marché ne peut être signé avant l’approbation de tous les niveaux.';
      }
      break;
    case 'approvals':
      if (!Array.isArray(value)) return 'Circuit d’approbation invalide.';
      // marquer une approbation « faite » exige decision.approve ; modifier la structure exige params.edit
      if (cur && value.length !== cur.length && !req.can('params.edit')) return 'Modifier le circuit exige l’habilitation « Paramètres ».';
      if (cur && value.some((a, i) => cur[i] && !!a.done !== !!cur[i].done) && !req.can('decision.approve')) return 'Approuver exige l’habilitation « Approuver l’attribution ».';
      break;
    case 'coi': {
      if (!isObj(value)) return 'Déclaration invalide.';
      const before = cur || {};
      for (const uid of new Set([...Object.keys(before), ...Object.keys(value)])) {
        if (uid !== req.user.id && JSON.stringify(before[uid]) !== JSON.stringify(value[uid])) return 'Chacun ne peut déclarer que pour soi-même.';
      }
      break;
    }
    case 'roles': {
      if (!isObj(value)) return 'Rôles invalides.';
      const ids = new Set(seed.PERMS.map((p) => p.id));
      for (const r of Object.values(value)) for (const k of Object.keys((r && r.perms) || {})) if (!ids.has(k)) return `Habilitation inconnue : ${k}`;
      // un administrateur ne peut pas se retirer le droit de gérer les rôles
      const mine = value[req.user.role];
      if (!mine || !(mine.perms || {})['roles.edit']) return 'Vous ne pouvez pas retirer à votre propre rôle la gestion des habilitations.';
      break;
    }
    case 'users': {
      if (!Array.isArray(value)) return 'Liste d\u2019utilisateurs invalide.';
      const roles = (kvGet('roles') || {}).value || {};
      if (value.some((u) => !u || !u.id || !roles[u.role])) return 'Utilisateur ou rôle invalide.';
      break;
    }
    case 'offers':
      if (!Array.isArray(value) || value.some((o) => !o || !o.id)) return 'Liste d\u2019offres invalide.';
      break;
    case 'org':
      if (!isObj(value) || !isObj(value.rates)) return 'Paramètres de l’organisation invalides.';
      for (const v of Object.values(value.rates)) if (!(Number(v) > 0)) return 'Taux de change invalide.';
      break;
    default:
      break;
  }
  if (CAPS[key] && Array.isArray(value) && value.length > CAPS[key]) value.length = CAPS[key];
  return null;
}

module.exports = { WRITE_PERMS, validateChange };
