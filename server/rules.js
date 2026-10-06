/* Règles métier appliquées côté serveur : qui peut écrire quelle partie de l'état, et dans quel ordre.
   Les calculs (conversion, conformité, classement, justifications) viennent de public/js/regles.js,
   le même fichier que celui exécuté par le navigateur. */
const R = require('../public/js/regles.js');
const P = require('../public/js/profils.js');
const C = require('../public/js/circuits.js');
const { seed, frDate, db } = require('./db');
const SU = require('./suppleance');
// rôles dont la plateforme a besoin : l'administrateur initial et le compte des prestataires inscrits en ligne
const ROLES_SYSTEME = ['admin', 'soum'];

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
  org: ['params.edit'], seuils: ['params.edit'], docDefs: ['cdc.edit', 'params.edit'],
  mailFrom: ['params.edit'], mailSuffix: ['params.edit'], circuitModele: ['params.edit'], circuitBesoin: ['params.edit'], circuitReferencement: ['params.edit'], formulaireReferencement: ['params.edit'], circuitCommande: ['params.edit'], evaluationPartenaires: ['params.edit'],
  offers: ['params.edit'],
  consultes: ['cdc.edit', 'cdc.publish'],
  roles: ['roles.edit'], users: ['roles.edit'], // délégations et affectations : routes /api/suppleances uniquement
  notifRules: ['notif.manage'],
  // questions, clarifications et recours : enregistrés par les achats, jamais réécrits par un prestataire (la clé entière
  // lui permettrait de modifier les réponses officielles ou d'écrire au nom d'un concurrent)
  qa: ['qa.answer'],
  additifs: ['qa.answer'],
  clarifs: ['clarif.send'],
  recours: ['recours.handle'],
  standstill: ['decision.approve', 'contract.sign', 'recours.handle'],
  contractSigned: ['contract.sign'],
  infructueux: ['decision.approve'],
  rejets: ['decision.approve'],
  coi: ['*'], notifs: ['*'], emails: ['*'],
};
const CAPS = { notifs: 120, emails: 80, qa: 500, additifs: 200, clarifs: 500, recours: 200, delegations: 200 };

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const refus = (status, code, error) => ({ status, code, error });
/* État de la procédure en cours de traitement (db.store) : posé au début de validateChange et effectsOf,
   appelés de façon synchrone dans la même requête. */
let ST = null;
const stored = (k) => ST.get(k);

/** Valeur après application du lot de changements : celle envoyée si la clé est modifiée, sinon celle en base. */
function nextOf(changes) { return (k) => (k in changes ? changes[k] : stored(k)); }

function ctxOf(get) {
  return {
    offers: ST.offers(), org: get('org'), fxFrozen: stored('fxFrozen'), cadre: stored('cadre'), cdc: get('cdc'), criteria: get('criteria'),
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

/** Le lot contient-il un nouveau rejet d'attribution ? Il renvoie la procédure à l'évaluation (voir « rejets »). */
function hasNewRejection(changes) {
  return Array.isArray(changes.rejets) && changes.rejets.length > (stored('rejets') || []).length;
}
/** Retour en arrière autorisé : recours déclaré fondé, ou rejet de l'attribution par un niveau du circuit. */
const retourAutorise = (changes) => hasFoundedAppeal(changes) || hasNewRejection(changes);

/** Valide un changement de clé de la procédure req.store. Retourne null si OK ; sinon un message (403) ou { status, code, error }. */
function validateChange(key, value, req, changes = { [key]: value }) {
  ST = req.store;
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
      if (value.cdcPublie && !(cur && cur.cdcPublie)) {
        const manque = R.cdcManquants({ ...ctxOf(next), cdc: value, consultes: next('consultes') });
        if (manque.length) return refus(409, 'CDC_INCOMPLETE', 'Le dossier n’est pas prêt à être publié. À compléter : ' + manque.join(' ; ') + '.');
      }
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
      const coi = (stored('coi') || {})[uid];
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
        if (!retourAutorise(changes)) return refus(409, 'EVALUATION_VALIDATED', 'Une évaluation validée ne se rouvre que par un recours déclaré fondé ou un rejet de l’attribution.');
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
      {
        // le montant de l'attribution fixe les étapes requises : il en faut au moins autant que le profil l'exige
        const k = cadreOf(next), nReq = C.nbRequises(C.appliquerMontant(next('approvals'), R.montantAttribution({ ...ctx, fxFrozen: stored('fxFrozen') })));
        if (nReq < k.niveauxApprobationMin)
          return refus(422, 'APPROVAL_CIRCUIT_TOO_SHORT', `Pour ce montant, le circuit ne compte que ${nReq} niveau(x) requis ; le profil réglementaire en exige au moins ${k.niveauxApprobationMin}.`);
      }
      break;
    }
    case 'approvals': {
      if (!Array.isArray(value) || value.some((a) => !isObj(a))) return 'Circuit d’approbation invalide.';
      const before = cur || [];
      const k = cadreOf(next);
      const roles = stored('roles') || {};
      if (value.some((a) => (a.seuil != null && a.seuil !== '' && !(Number(a.seuil) >= 0)) || (a.roleId && !roles[a.roleId])))
        return refus(422, 'CIRCUIT_INVALID', 'Étape invalide : seuil négatif ou rôle inconnu.');
      if (!same(C.forme(value), C.forme(before))) {
        if (!req.can('params.edit')) return 'Modifier le circuit exige l’habilitation « Paramètres ».';
        if (stored('evalDone')) return refus(409, 'APPROVAL_CIRCUIT_LOCKED', 'L’évaluation est validée : le circuit d’approbation ne peut plus être modifié.');
        if (value.some((a) => a.done)) return refus(409, 'APPROVAL_CIRCUIT_LOCKED', 'Un niveau ne peut pas être approuvé en même temps que le circuit est modifié.');
        if (value.length < k.niveauxApprobationMin)
          return refus(422, 'APPROVAL_CIRCUIT_TOO_SHORT', `Le profil réglementaire exige au moins ${k.niveauxApprobationMin} niveau(x) d’approbation.`);
        value.forEach((a) => { delete a.requis; delete a.by; delete a.at; });
        break;
      }
      const retour = retourAutorise(changes);
      // décisions et étapes requises : posées par le serveur, jamais par le navigateur
      for (let i = 0; i < value.length; i++) {
        const a = value[i], b = before[i];
        if (b.requis === undefined) delete a.requis; else a.requis = b.requis;
        if (!!a.done === !!b.done) { a.by = b.by; a.at = b.at; if (b.pour) a.pour = b.pour; else delete a.pour; continue; }
        if (!a.done) {
          if (!retour) return refus(409, 'APPROVAL_FINAL', 'Une approbation donnée ne se retire que par un recours déclaré fondé ou un rejet de l’attribution.');
          delete a.by; delete a.at;
        }
      }
      // une seule nouvelle approbation par envoi, contrôlée par le moteur de circuits sur l'état avant l'envoi
      const nouvelles = value.map((a, i) => (a.done && !before[i].done ? i : -1)).filter((i) => i >= 0);
      if (nouvelles.length > 1) return refus(409, 'APPROVAL_ORDER', 'Les niveaux d’approbation se franchissent un par un, dans l’ordre.');
      if (nouvelles.length) {
        const i = nouvelles[0];
        if (!req.can('decision.approve')) return 'Approuver exige l’habilitation « Approuver l’attribution ».';
        if (!next('evalDone')) return refus(409, 'GATE_EVALUATION_NOT_VALIDATED', 'L’approbation est fermée tant que l’évaluation n’est pas validée.');
        if (C.nbRequises(before) < k.niveauxApprobationMin)
          return refus(422, 'APPROVAL_CIRCUIT_TOO_SHORT', `Le profil réglementaire exige au moins ${k.niveauxApprobationMin} niveau(x) d’approbation.`);
        const s = sod(), ecartes = k.separationFonctions ? s.scorers.concat(s.validators) : [];
        const sup = SU.sup(req.user, 'attribution', req.pid);
        const err = C.controle(before, i, req.user, ecartes, sup);
        if (err) return refus(err.status, err.code, err.error);
        value[i].by = uid; value[i].at = frDate();
        const pour = C.pour(before, i, req.user, sup); if (pour) value[i].pour = pour; else delete value[i].pour;
      }
      break;
    }
    case 'rejets': {
      // rejet de l'attribution par le niveau attendu du circuit : motif obligatoire, retour à l'évaluation
      if (!Array.isArray(value) || value.some((x) => !isObj(x))) return 'Liste de rejets invalide.';
      const before = cur || [];
      if (value.length < before.length || before.some((x, i) => !same(x, value[i]))) return refus(409, 'REJECTION_LOCKED', 'Un rejet enregistré ne peut être ni modifié ni supprimé.');
      if (value.length === before.length) break;
      if (value.length > before.length + 1) return 'Un seul rejet à la fois.';
      const nv = value[value.length - 1], ap = stored('approvals') || [];
      const motif = String(nv.motif || '').trim();
      if (!motif || motif.length > 1000) return refus(422, 'REJECTION_REASON_REQUIRED', 'Le rejet de l’attribution doit être motivé (1 000 caractères au plus).');
      if (!stored('evalDone')) return refus(409, 'GATE_EVALUATION_NOT_VALIDATED', 'Rien à rejeter : l’évaluation n’est pas validée.');
      if (C.complet(ap)) return refus(409, 'APPROVAL_FINAL', 'L’attribution est prononcée : elle ne se remet en cause que par un recours.');
      const i = C.prochaine(ap), k = cadreOf(next), s = sod(), sup = SU.sup(req.user, 'attribution', req.pid);
      const err = C.controle(ap, i, req.user, k.separationFonctions ? s.scorers.concat(s.validators) : [], sup);
      if (err) return refus(err.status, err.code, err.error);
      const pourRejet = C.pour(ap, i, req.user, sup);
      if (changes.evalDone !== false || !Array.isArray(changes.approvals) || changes.approvals.some((a) => a.done))
        return refus(409, 'REJECTION_INCOMPLETE', 'Un rejet renvoie la procédure à l’évaluation : évaluation rouverte et circuit remis à zéro dans le même envoi.');
      value[value.length - 1] = Object.assign({ niveau: i, role: ap[i].role, motif, by: uid, at: frDate() }, pourRejet ? { pour: pourRejet } : {});
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
        if (b.par) { a.par = b.par; a.enregistre = b.enregistre; } // posés par le serveur à l'enregistrement
        if (a.statut === b.statut && a.decision === b.decision) continue;
        if (!req.can('recours.handle')) return 'Instruire un recours exige l’habilitation « Instruire un recours ».';
        if (b.statut !== 'ouvert') return refus(409, 'APPEAL_LOCKED', 'Ce recours a déjà été tranché.');
        if (!['rejete', 'fonde'].includes(a.statut)) return 'Décision de recours invalide.';
      }
      if (value.slice(before.length).some((r) => r.statut !== 'ouvert')) return 'Un nouveau recours est enregistré « ouvert ».';
      if (value.length > before.length && !cadreOf(next).recoursActif)
        return refus(409, 'APPEAL_NOT_PROVIDED', 'Le profil réglementaire de la procédure ne prévoit pas de recours.');
      // un nouveau recours : qui l'enregistre et quand, posés par le serveur (t reste la date de réception déclarée)
      value.slice(before.length).forEach((r) => { r.par = uid; r.enregistre = frDate(); });
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
      const byId = new Map(ST.offers().map((o) => [o.id, o]));
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
      // identifiant, libellé obligatoire et unique
      const libelles = new Set();
      for (const [id, r] of Object.entries(value)) {
        if (!/^[a-z][a-z0-9-]{1,39}$/.test(id)) return 'Identifiant de rôle invalide.';
        const lab = r && typeof r.lab === 'string' ? r.lab.trim() : '';
        if (!lab || lab.length > 80) return 'Chaque rôle doit avoir un libellé (80 caractères au plus).';
        if (libelles.has(lab.toLowerCase())) return `Deux rôles portent le libellé « ${lab} ».`;
        libelles.add(lab.toLowerCase());
      }
      // un rôle supprimé ne doit plus servir
      for (const id of Object.keys(stored('roles') || {})) {
        if (value[id]) continue;
        if (ROLES_SYSTEME.includes(id)) return 'Ce rôle est utilisé par la plateforme : il peut être renommé, pas supprimé.';
        if (db.prepare('SELECT 1 FROM users WHERE role=? LIMIT 1').get(id)) return 'Ce rôle est encore attribué à des comptes : changez d’abord leur rôle.';
      }
      break;
    }
    case 'users': {
      if (!Array.isArray(value)) return 'Liste d’utilisateurs invalide.';
      const roles = stored('roles') || {};
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
      if (value.verrouillageMinutes != null && ![5, 10, 15, 30, 60].includes(Number(value.verrouillageMinutes)))
        return refus(422, 'LOCK_DELAY_INVALID', 'Délai de verrouillage : 5, 10, 15, 30 ou 60 minutes.');
      const errs = P.erreursReglages(R.profilId({ cdc: next('cdc'), org: value }), value.reglages);
      if (errs.length) return refus(422, 'SETTING_OUT_OF_BOUNDS', 'Réglage refusé par le profil réglementaire : ' + errs.map((e) => `${e.regle} (${e.motif})`).join(' ; ') + '.');
      break;
    }
    case 'circuitModele':
    case 'circuitBesoin':
    case 'circuitReferencement':
    case 'circuitCommande':
      if (!Array.isArray(value) || !value.length || value.some((a) => !isObj(a) || typeof a.role !== 'string' || !a.role.trim()))
        return 'Circuit modèle invalide : au moins un niveau, chacun avec un intitulé.';
      if (value.some((a) => (a.seuil != null && a.seuil !== '' && !(Number(a.seuil) >= 0)) || (a.roleId && !(stored('roles') || {})[a.roleId])))
        return refus(422, 'CIRCUIT_INVALID', 'Étape invalide : seuil négatif ou rôle inconnu.');
      value.forEach((a, i) => {
        const e = { role: String(a.role).slice(0, 120), who: String(a.who || '').slice(0, 120) };
        if (Number(a.seuil) > 0) e.seuil = Number(a.seuil);
        if (a.roleId) e.roleId = a.roleId;
        value[i] = e;
      });
      break;
    case 'evaluationPartenaires': {
      const c = isObj(value) && isObj(value.criteres) ? value.criteres : null;
      const ids = ['delais', 'conformite', 'completude', 'qualite'];
      if (!c || ids.some((k) => !(Number(c[k]) >= 0)) || Object.keys(c).some((k) => !ids.includes(k)))
        return refus(422, 'EVALUATION_INVALID', 'Poids attendus pour les critères délais, conformité, complétude et qualité.');
      const somme = ids.reduce((t, k) => t + Number(c[k]), 0);
      if (Math.round(somme) !== 100) return refus(422, 'EVALUATION_INVALID', `Les poids des critères doivent totaliser 100 (ici ${somme}).`);
      if (!(Number(value.seuilAlerte) >= 0 && Number(value.seuilAlerte) <= 100)) return refus(422, 'EVALUATION_INVALID', 'Seuil d’alerte entre 0 et 100.');
      if (!(Number(value.plafondRetardJours) >= 1 && Number(value.plafondRetardJours) <= 365)) return refus(422, 'EVALUATION_INVALID', 'Retard plafond entre 1 et 365 jours.');
      break;
    }
    case 'consultes': {
      const e = require('./consultation').verifier(value, cur, next, (id) => ST.offers().some((o) => o.partenaire === id));
      if (e) return refus(422, 'CONSULTATION_INVALID', e);
      break;
    }
    case 'notifs':
    case 'emails': {
      // le navigateur ne fait qu'annoncer un événement configuré (notifRules) ; les destinataires sont ceux de la règle.
      // Un prestataire n'en émet aucun : le serveur annonce son dépôt (sinon il écrirait au personnel depuis la boîte
      // officielle de l'organisation, avec un contenu libre)
      if (!Array.isArray(value)) return 'Liste invalide.';
      const connus = new Set((cur || []).map((x) => x && x.id));
      const nouveaux = value.filter((x) => x && x.id && !connus.has(x.id));
      if (!nouveaux.length) break;
      if (req.can('portail.use') && !req.can('offres.read')) return 'Un prestataire n’émet ni notification ni courriel.';
      const regles = stored('notifRules') || {}, canal = key === 'notifs' ? 'inapp' : 'email';
      if (nouveaux.some((x) => !regles[x.ev] || !regles[x.ev][canal])) return refus(422, 'EVENT_UNKNOWN', 'Événement de notification inconnu ou désactivé.');
      break;
    }
    case 'formulaireReferencement': {
      const e = require('./formulaire').verifierDefinition(value);
      if (e) return refus(422, 'FORM_INVALID', e);
      break;
    }
    case 'docDefs': {
      if (!Array.isArray(value) || value.some((d) => !isObj(d) || !d.id)) return 'Liste de pièces invalide.';
      if (value.some((d) => d.referencement !== undefined && (typeof d.referencement !== 'string' || d.referencement.length > 41)))
        return 'Pièce de référencement correspondante invalide.';
      const ids = new Set(value.map((d) => d.id));
      const manquantes = cadreOf(next).piecesImposees.filter((id) => !ids.has(id));
      if (manquantes.length) {
        const lab = (id) => ((cur || []).find((d) => d.id === id) || { label: id }).label;
        return refus(409, 'PIECE_IMPOSED', 'Pièce exigée par le profil réglementaire, elle ne peut pas être retirée : ' + manquantes.map(lab).join(' ; ') + '.');
      }
      if (value.some((d) => !String(d.label || '').trim() || String(d.label).length > 200 || !['tous', 'local', 'etranger'].includes(d.scope || 'tous')))
        return 'Chaque pièce a un libellé (200 caractères au plus) et des soumissionnaires concernés.';
      // pièces d'un dossier publié : figées (les changer modifierait les conditions de participation en cours de route)
      if ((stored('cdc') || {}).cdcPublie && !same(value, cur)) return refus(409, 'PIECES_LOCKED', 'Le dossier est publié : les pièces exigées ne peuvent plus être modifiées.');
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
  ST = req.store;
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
  if (changes.evalDone === true && !stored('evalDone')) {
    // le montant de l'attribution est connu : le serveur fixe les étapes requises du circuit
    const montant = R.montantAttribution({ ...ctxOf(next), fxFrozen: stored('fxFrozen') });
    const circuit = C.appliquerMontant(next('approvals'), montant);
    kv.approvals = circuit;
    const non = circuit.filter((e) => !e.requis).map((e) => e.role);
    if (non.length) audit.push(`Circuit d’approbation : pour ${Math.round(montant).toLocaleString('fr-FR')} XOF, niveau(x) non requis — ${non.join(', ')}`);
  }
  if (hasNewRejection(changes)) {
    const r = changes.rejets[changes.rejets.length - 1];
    audit.push(`Attribution rejetée au niveau « ${r.role} » — motif : ${r.motif} — retour à l’évaluation`);
  }
  // partenaires consultés : prévenus (cloche) quand le dossier publié leur devient accessible
  {
    const Co = require('./consultation');
    const avantPub = !!(stored('cdc') || {}).cdcPublie, apresPub = !!(next('cdc') || {}).cdcPublie;
    const c = Co.consultation(next), avant = Co.consultation((k) => stored(k));
    if (apresPub && c.mode === 'restreint') {
      const nouveaux = avantPub ? c.partenaires.filter((id) => !avant.partenaires.includes(id) || avant.mode !== 'restreint') : c.partenaires;
      if (nouveaux.length) Co.prevenir(nouveaux, next('cdc'));
    }
    if ('consultes' in changes && !same(changes.consultes, stored('consultes'))) {
      const noms = (ids) => ids.map((id) => (require('./db').partenaireGet(id) || { raisonSociale: id }).raisonSociale);
      const ajoutes = c.partenaires.filter((id) => !avant.partenaires.includes(id)), retires = avant.partenaires.filter((id) => !c.partenaires.includes(id));
      audit.push('Consultation : ' + (c.mode === 'ouvert' ? 'appel d’offres ouvert à toute entreprise' : 'restreinte aux partenaires sélectionnés')
        + (ajoutes.length ? ' — ajoutés : ' + noms(ajoutes).join(', ') : '') + (retires.length ? ' — retirés : ' + noms(retires).join(', ') : ''));
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
