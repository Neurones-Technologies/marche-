/* Règles métier appliquées côté serveur : qui peut écrire quelle partie de l'état, et dans quel ordre.
   Les calculs (conversion, conformité, classement, justifications) viennent de public/js/regles.js,
   le même fichier que celui exécuté par le navigateur. */
const R = require('../public/js/regles.js');
const P = require('../public/js/profils.js');
const { seed, kvGet, offersAll, frDate } = require('./db');

// clé d'état -> habilitations (au moins une requise). '*' = tout utilisateur connecté.
// recours.handle figure sur evalDone, approvals et standstill pour le seul cas du recours déclaré fondé.
const WRITE_PERMS = {
  cdc: ['cdc.edit', 'cdc.publish'],
  criteria: ['criteres.edit'],
  confirmed: ['depouille.confirm'],
  excluded: ['conformite.decide'],
  quality: ['eval.score'],
  justif: ['eval.score', 'eval.validate', 'decision.approve', 'conformite.decide'],
  depClosed: ['depouille.close'],
  evalDone: ['eval.validate', 'recours.handle'],
  approvals: ['decision.approve', 'params.edit', 'recours.handle'],
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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const refus = (status, code, error) => ({ status, code, error });
const stored = (k) => (kvGet(k) || {}).value;

/** Valeur après application du lot de changements : celle envoyée si la clé est modifiée, sinon celle en base. */
function nextOf(changes) { return (k) => (k in changes ? changes[k] : stored(k)); }

function ctxOf(get) {
  return {
    offers: offersAll(), org: get('org'), fxFrozen: stored('fxFrozen'), cadre: stored('cadre'), cdc: get('cdc'), criteria: get('criteria'),
    quality: get('quality'), justif: get('justif'), excluded: get('excluded'), confirmed: get('confirmed'), docDefs: get('docDefs'),
  };
}

/** Règles du profil réglementaire en vigueur après le lot (figées à la publication du dossier). */
function cadreOf(get) { return R.cadre(ctxOf(get)); }

/** Qui a noté, validé ou approuvé cette procédure : historique cumulé, tenu par le serveur seul. */
function sod() { return stored('_sod') || { scorers: [], validators: [], approvers: [] }; }

/** Le lot contient-il un recours qui passe de « ouvert » à « fondé » ? Seul cas où la procédure peut revenir en arrière. */
function hasFoundedAppeal(changes) {
  if (!Array.isArray(changes.recours)) return false;
  const cur = stored('recours') || [];
  return changes.recours.some((r, i) => r && r.statut === 'fonde' && cur[i] && cur[i].statut === 'ouvert');
}

/** Valide un changement de clé. Retourne null si OK ; sinon un message (403) ou { status, code, error }. */
function validateChange(key, value, req, changes = { [key]: value }) {
  const perms = WRITE_PERMS[key];
  if (!perms) return `Clé d'état inconnue ou non modifiable : ${key}`;
  if (!perms.includes('*') && !perms.some((p) => req.can(p))) return `Habilitation insuffisante pour « ${key} ».`;
  const cur = stored(key);
  const next = nextOf(changes);
  const uid = req.user.id;

  switch (key) {
    case 'cdc':
      if (!isObj(value)) return 'Cahier des charges invalide.';
      if (typeof value.ref !== 'string' || !value.ref.trim() || value.ref.length > 40)
        return refus(422, 'REFERENCE_INVALID', 'La référence de la procédure est obligatoire (40 caractères au plus).');
      if (cur && cur.cdcPublie && value.ref !== cur.ref)
        return refus(409, 'REFERENCE_LOCKED', 'Le dossier est publié : sa référence ne peut plus être modifiée.');
      if (!!value.cdcPublie !== !!(cur && cur.cdcPublie) && !req.can('cdc.publish')) return 'Publier le cahier des charges exige l’habilitation « Publier ».';
      if (cur && cur.cdcPublie && value.cdcPublie) {
        const a = JSON.stringify({ ...cur, cdcPublie: 0 }), b = JSON.stringify({ ...value, cdcPublie: 0 });
        if (a !== b && !req.can('cdc.edit')) return 'Cahier des charges publié : modification réservée.';
      }
      if (stored('depClosed') && cur && (!!value.prefActive !== !!cur.prefActive || Number(value.prefTaux || 0) !== Number(cur.prefTaux || 0)))
        return refus(409, 'PREFERENCE_LOCKED', 'Le dépouillement est clôturé : la marge de préférence ne peut plus être modifiée, elle conditionne le classement.');
      if (value.profil != null && !P.existe(value.profil))
        return refus(422, 'PROFILE_UNKNOWN', 'Profil réglementaire inconnu.');
      if (cur && cur.cdcPublie && R.profilId({ cdc: value, org: next('org') }) !== R.profilId({ cdc: cur, org: next('org') }))
        return refus(409, 'PROFILE_LOCKED', 'Le dossier est publié : son profil réglementaire ne peut plus être modifié.');
      if (value.prefActive) {
        const k = cadreOf(next);
        if (!k.preferenceAutorisee) return refus(409, 'PREFERENCE_NOT_ALLOWED', 'Le profil réglementaire de la procédure n’autorise pas de marge de préférence.');
        if (Number(value.prefTaux || 0) > k.preferenceTauxMax)
          return refus(422, 'PREFERENCE_OUT_OF_BOUNDS', `La marge de préférence ne peut pas dépasser ${k.preferenceTauxMax} % dans ce profil réglementaire.`);
      }
      break;
    case 'criteria': {
      if (!Array.isArray(value)) return 'Grille invalide.';
      if (value.some((c) => !c || !c.id || !(Number(c.weight) >= 0))) return 'Critère invalide.';
      if (stored('depClosed') && !same(value, cur))
        return refus(409, 'CRITERIA_LOCKED', 'Le dépouillement est clôturé : la grille de critères publiée ne peut plus être modifiée.');
      break;
    }
    case 'confirmed':
      if (!isObj(value)) return 'Confirmations invalides.';
      if (stored('depClosed') && !same(value, cur))
        return refus(409, 'SCREENING_CLOSED', 'Le dépouillement est clôturé : les données extraites sont figées.');
      break;
    case 'excluded':
      if (!isObj(value)) return 'Décisions de conformité invalides.';
      if (stored('evalDone') && !same(value, cur))
        return refus(409, 'EVALUATION_VALIDATED', 'L’évaluation est validée : la liste des offres conformes ne peut plus changer.');
      break;
    case 'quality': {
      if (!isObj(value)) return 'Notes invalides.';
      const coi = ((kvGet('coi') || {}).value || {})[uid];
      if (!coi || !coi.declare || coi.conflit) return 'Déclaration d’absence de conflit d’intérêts requise avant de noter.';
      for (const o of Object.values(value)) for (const v of Object.values(o || {})) if (!(Number(v) >= 0 && Number(v) <= 100)) return 'Une note doit être comprise entre 0 et 100.';
      if (same(value, cur)) break;
      if (!stored('depClosed'))
        return refus(409, 'GATE_DEPOUILLEMENT_NOT_CLOSED', 'L’évaluation est fermée tant que le dépouillement n’est pas clôturé.');
      if (stored('evalDone'))
        return refus(409, 'EVALUATION_VALIDATED', 'L’évaluation est validée : les notes ne peuvent plus être modifiées.');
      if (cadreOf(next).separationFonctions && sod().approvers.includes(uid))
        return refus(403, 'SEPARATION_OF_DUTIES', 'Vous avez approuvé l’attribution de cette procédure : vous ne pouvez pas en noter les offres.');
      break;
    }
    case 'justif':
      if (!isObj(value)) return 'Justifications invalides.';
      if (stored('evalDone') && !same(value, cur))
        return refus(409, 'EVALUATION_VALIDATED', 'L’évaluation est validée : les justifications ne peuvent plus être modifiées.');
      break;
    case 'depClosed': {
      if (typeof value !== 'boolean') return 'Booléen attendu.';
      if (value === !!cur) break;
      if (!value) return refus(409, 'SCREENING_CLOSED', 'Un dépouillement clôturé ne peut pas être rouvert.');
      if (!(next('cdc') || {}).cdcPublie) return refus(409, 'GATE_CDC_NOT_PUBLISHED', 'Le dépouillement ne peut pas être clôturé avant la publication du cahier des charges.');
      const ctx = ctxOf(next);
      const n = R.flagsRemaining(ctx);
      if (n > 0) return refus(409, 'UNCONFIRMED_FIELDS', `${n} champ(s) extrait(s) à faible confiance reste(nt) à confirmer avant la clôture du dépouillement.`);
      const wt = R.weightTotal(ctx);
      if (wt !== 100) return refus(422, 'GRID_INVALID', `Le total des pondérations est de ${wt} % : la grille doit totaliser 100 % avant la clôture.`);
      break;
    }
    case 'evalDone': {
      if (typeof value !== 'boolean') return 'Booléen attendu.';
      if (value === !!cur) break;
      if (!value) {
        if (!hasFoundedAppeal(changes)) return refus(409, 'EVALUATION_VALIDATED', 'Une évaluation validée ne se rouvre que par un recours déclaré fondé.');
        break;
      }
      if (!req.can('eval.validate')) return 'Habilitation insuffisante pour valider l’évaluation.';
      if (!next('depClosed')) return refus(409, 'GATE_DEPOUILLEMENT_NOT_CLOSED', 'L’évaluation ne peut pas être validée avant la clôture du dépouillement.');
      const ctx = ctxOf(next);
      const wt = R.weightTotal(ctx);
      if (wt !== 100) return refus(422, 'GRID_INVALID', `Le total des pondérations est de ${wt} % : la grille doit totaliser 100 %.`);
      const miss = R.missingJustifs(ctx);
      if (miss.length) return refus(422, 'JUSTIFICATION_REQUIRED', `Justification écrite obligatoire pour tout écart avec le score proposé : ${miss.join(', ')}.`);
      if (cadreOf(next).separationFonctions && sod().approvers.includes(uid))
        return refus(403, 'SEPARATION_OF_DUTIES', 'Vous avez approuvé l’attribution de cette procédure : vous ne pouvez pas en valider l’évaluation.');
      break;
    }
    case 'approvals': {
      if (!Array.isArray(value) || value.some((a) => !isObj(a))) return 'Circuit d’approbation invalide.';
      const before = cur || [];
      const shape = (l) => l.map((a) => ({ role: a.role, who: a.who }));
      const k = cadreOf(next);
      const tropCourt = () => refus(422, 'APPROVAL_CIRCUIT_TOO_SHORT',
        `Le profil réglementaire exige au moins ${k.niveauxApprobationMin} niveau(x) d’approbation.`);
      if (!same(shape(value), shape(before))) {
        if (!req.can('params.edit')) return 'Modifier le circuit exige l’habilitation « Paramètres ».';
        if (stored('evalDone')) return refus(409, 'APPROVAL_CIRCUIT_LOCKED', 'L’évaluation est validée : le circuit d’approbation ne peut plus être modifié.');
        if (value.some((a) => a.done)) return refus(409, 'APPROVAL_CIRCUIT_LOCKED', 'Un niveau ne peut pas être approuvé en même temps que le circuit est modifié.');
        if (value.length < k.niveauxApprobationMin) return tropCourt();
        break;
      }
      const founded = hasFoundedAppeal(changes);
      for (let i = 0; i < value.length; i++) {
        const a = value[i], b = before[i];
        if (!!a.done === !!b.done) { a.by = b.by; a.at = b.at; continue; } // identité et date : jamais fournies par le client
        if (!a.done) {
          if (!founded) return refus(409, 'APPROVAL_FINAL', 'Une approbation donnée ne se retire que par un recours déclaré fondé.');
          delete a.by; delete a.at;
          continue;
        }
        if (!req.can('decision.approve')) return 'Approuver exige l’habilitation « Approuver l’attribution ».';
        if (!next('evalDone')) return refus(409, 'GATE_EVALUATION_NOT_VALIDATED', 'L’approbation est fermée tant que l’évaluation n’est pas validée.');
        if (value.slice(0, i).some((x) => !x.done)) return refus(409, 'APPROVAL_ORDER', 'Les niveaux d’approbation se franchissent dans l’ordre.');
        if (value.length < k.niveauxApprobationMin) return tropCourt();
        const s = sod();
        if (k.separationFonctions && (s.scorers.includes(uid) || s.validators.includes(uid)))
          return refus(403, 'SEPARATION_OF_DUTIES', 'Vous avez noté ou validé l’évaluation de cette procédure : vous ne pouvez pas en approuver l’attribution.');
        a.by = uid; a.at = frDate();
      }
      break;
    }
    case 'standstill': {
      if (!isObj(value)) return 'Délai de recours invalide.';
      const b = cur || {};
      if (b.startedAt && Number(value.days) !== Number(b.days))
        return refus(409, 'STANDSTILL_LOCKED', 'Le délai de recours est ouvert : sa durée ne peut plus être modifiée.');
      if (!b.startedAt) value.days = cadreOf(next).delaiRecoursJours; // durée fixée par le profil réglementaire
      if (!b.startedAt && value.startedAt) {
        if (!req.can('decision.approve')) return 'Notifier l’attribution exige l’habilitation « Approuver l’attribution ».';
        if (!R.allApproved(next('approvals'))) return refus(409, 'GATE_APPROVAL_INCOMPLETE', 'L’attribution ne peut être notifiée qu’une fois tous les niveaux d’approbation franchis.');
        value.startedAt = Date.now(); // l'heure du serveur, jamais celle du navigateur
      } else if (b.startedAt && !value.startedAt) {
        if (!hasFoundedAppeal(changes)) return refus(409, 'STANDSTILL_LOCKED', 'Le délai de recours ne s’annule que par un recours déclaré fondé.');
      } else if (b.startedAt && value.startedAt !== b.startedAt) {
        return refus(409, 'STANDSTILL_LOCKED', 'La date d’ouverture du délai de recours est fixée par le serveur.');
      }
      break;
    }
    case 'recours': {
      if (!Array.isArray(value) || value.some((r) => !isObj(r))) return 'Liste de recours invalide.';
      const before = cur || [];
      if (value.length < before.length) return refus(409, 'APPEAL_LOCKED', 'Un recours enregistré ne peut pas être supprimé.');
      for (let i = 0; i < before.length; i++) {
        const a = value[i], b = before[i];
        if (a.de !== b.de || a.objet !== b.objet || a.t !== b.t) return refus(409, 'APPEAL_LOCKED', 'Un recours enregistré ne peut pas être modifié.');
        if (a.statut === b.statut && a.decision === b.decision) continue;
        if (!req.can('recours.handle')) return 'Instruire un recours exige l’habilitation « Instruire un recours ».';
        if (b.statut !== 'ouvert') return refus(409, 'APPEAL_LOCKED', 'Ce recours a déjà été tranché.');
        if (!['rejete', 'fonde'].includes(a.statut)) return 'Décision de recours invalide.';
      }
      if (value.slice(before.length).some((r) => r.statut !== 'ouvert')) return 'Un nouveau recours est enregistré « ouvert ».';
      if (value.length > before.length && !cadreOf(next).recoursActif)
        return refus(409, 'APPEAL_NOT_PROVIDED', 'Le profil réglementaire de la procédure ne prévoit pas de recours.');
      break;
    }
    case 'contractSigned': {
      if (typeof value !== 'boolean') return 'Booléen attendu.';
      if (value === !!cur) break;
      if (!value) return refus(409, 'CONTRACT_SIGNED', 'Un marché signé ne peut pas être annulé depuis l’application.');
      const ap = next('approvals') || [];
      if (!R.allApproved(ap)) return 'Le marché ne peut être signé avant l’approbation de tous les niveaux.';
      const ss = next('standstill') || {};
      if (!ss.startedAt) return refus(409, 'GATE_NOT_NOTIFIED', 'Le marché ne peut pas être signé avant la notification de l’attribution.');
      const reste = R.standstillRemaining(ss);
      if (reste > 0) return refus(409, 'STANDSTILL_RUNNING', `Le délai de recours court encore (${reste} jour(s)) : la signature est suspendue.`);
      if ((next('recours') || []).some((r) => r.statut === 'ouvert')) return refus(409, 'APPEAL_PENDING', 'Un recours est en instruction : la signature est suspendue.');
      break;
    }
    case 'offers': {
      // Les offres sont construites par le serveur au dépôt (POST /api/offers) et ne se modifient plus ensuite :
      // changer un montant, une devise, un délai ou une pièce après dépôt serait une négociation déguisée.
      if (!Array.isArray(value) || value.some((o) => !o || !o.id)) return 'Liste d’offres invalide.';
      const byId = new Map(offersAll().map((o) => [o.id, o]));
      if (value.length !== byId.size || value.some((o) => !byId.has(o.id) || !same(o, byId.get(o.id))))
        return refus(409, 'OFFER_LOCKED', 'Une offre déposée ne peut pas être modifiée.');
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
      if (!Array.isArray(value)) return 'Liste d’utilisateurs invalide.';
      const roles = (kvGet('roles') || {}).value || {};
      if (value.some((u) => !u || !u.id || !roles[u.role])) return 'Utilisateur ou rôle invalide.';
      break;
    }
    case 'coi': {
      if (!isObj(value)) return 'Déclaration invalide.';
      const before = cur || {};
      for (const id of new Set([...Object.keys(before), ...Object.keys(value)])) {
        if (id !== uid && JSON.stringify(before[id]) !== JSON.stringify(value[id])) return 'Chacun ne peut déclarer que pour soi-même.';
      }
      break;
    }
    case 'org': {
      if (!isObj(value) || !isObj(value.rates)) return 'Paramètres de l’organisation invalides.';
      for (const v of Object.values(value.rates)) if (!(Number(v) > 0)) return 'Taux de change invalide.';
      if (value.profilDefaut != null && !P.existe(value.profilDefaut)) return refus(422, 'PROFILE_UNKNOWN', 'Profil réglementaire inconnu.');
      if (value.reglages != null && !isObj(value.reglages)) return 'Réglages invalides.';
      const errs = P.erreursReglages(R.profilId({ cdc: next('cdc'), org: value }), value.reglages);
      if (errs.length) return refus(422, 'SETTING_OUT_OF_BOUNDS', 'Réglage refusé par le profil réglementaire : ' + errs.map((e) => `${e.regle} (${e.motif})`).join(' ; ') + '.');
      break;
    }
    case 'docDefs': {
      if (!Array.isArray(value) || value.some((d) => !isObj(d) || !d.id)) return 'Liste de pièces invalide.';
      const ids = new Set(value.map((d) => d.id));
      const manquantes = cadreOf(next).piecesImposees.filter((id) => !ids.has(id));
      if (manquantes.length) {
        const lab = (id) => ((cur || []).find((d) => d.id === id) || { label: id }).label;
        return refus(409, 'PIECE_IMPOSED', 'Pièce exigée par le profil réglementaire, elle ne peut pas être retirée : ' + manquantes.map(lab).join(' ; ') + '.');
      }
      break;
    }
    default:
      break;
  }
  if (CAPS[key] && Array.isArray(value) && value.length > CAPS[key]) value.length = CAPS[key];
  return null;
}

/**
 * Effets serveur d'un lot validé, à exécuter dans la même transaction, AVANT l'écriture des clés :
 * historique de séparation des fonctions, gel du cadre réglementaire et des taux, classement arrêté. Retourne { kv, audit }.
 */
function effectsOf(changes, req) {
  const uid = req.user.id, next = nextOf(changes);
  const s = sod(), before = JSON.stringify(s), kv = {}, audit = [];
  const add = (list) => { if (!list.includes(uid)) list.push(uid); };

  if ('quality' in changes && !same(changes.quality, stored('quality'))) add(s.scorers);
  if (changes.evalDone === true && !stored('evalDone')) {
    add(s.validators);
    const rows = R.ranking({ ...ctxOf(next), fxFrozen: stored('fxFrozen') });
    audit.push('Évaluation validée — classement arrêté par le serveur : ' +
      (rows.map((r) => `${r.rank}. ${r.o.name} (${r.total.toFixed(1)})`).join(' ; ') || 'aucune offre conforme'));
  }
  if (Array.isArray(changes.approvals)) {
    const before = stored('approvals') || [];
    if (changes.approvals.some((a, i) => a.done && !(before[i] || {}).done)) add(s.approvers);
  }
  if ('cdc' in changes) {
    const avant = !!(stored('cdc') || {}).cdcPublie, apres = !!(changes.cdc || {}).cdcPublie;
    if (apres && !avant) {
      const ctx = { ...ctxOf(next), cadre: null }, id = R.profilId(ctx);
      kv.cadre = { profil: id, regles: R.cadre(ctx), at: frDate(), by: uid };
      audit.push(`Cadre réglementaire figé à la publication du dossier : ${P.profil(id).lab}`);
    } else if (avant && !apres) {
      kv.cadre = null; // dossier dépublié : le cadre sera de nouveau figé à la prochaine publication
    }
  }
  if (changes.depClosed === true && !stored('depClosed')) {
    const rates = { ...((next('org') || {}).rates || {}) };
    kv.fxFrozen = { rates, at: frDate(), by: uid };
    audit.push('Taux de change figés à la clôture du dépouillement : ' + Object.entries(rates).map(([d, v]) => `${d} ${v}`).join(', '));
  }
  if (JSON.stringify(s) !== before) kv._sod = s;
  return { kv, audit };
}

module.exports = { WRITE_PERMS, validateChange, effectsOf };
