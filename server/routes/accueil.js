/* Accueil de l'organisation et registre des appels d'offres.
   - GET /api/accueil : chiffres clés de chaque registre que l'utilisateur peut voir, et « À faire pour moi » :
     les actions qui l'attendent, calculées par le serveur selon ses habilitations (validations à donner,
     dossiers à instruire, commandes à émettre ou à réceptionner…), avec de quoi ouvrir l'écran concerné.
   - GET /api/registre : toutes les procédures visibles, passées et en cours, avec leur phase, le titulaire et le
     montant attribués, le besoin d'origine et les commandes passées.
   - GET /api/indicateurs : pilotage des achats sur une année (création de la procédure) : volumes, délais entre les
     jalons datés par le serveur, économies (estimation du dossier comparée au montant attribué), concurrence,
     commandes. Lecteurs des offres, de la piste d'audit ou des procès-verbaux. */
const express = require('express');
const { db, store, proceduresAll, besoinsAll, commandesAll, partenairesAll, partenaireDe, auditList } = require('../db');
const { requireAuth } = require('../auth');
const SU = require('../suppleance');
const C = require('../../public/js/circuits.js');
const R = require('../../public/js/regles.js');
const P = require('../../public/js/profils.js');

// authentification route par route : ce routeur est monté sur /api, il ne doit pas filtrer les autres routes
// (l'inscription publique, notamment)
const r = express.Router();

const voitTout = (req) => req.can('offres.read') || req.can('cdc.edit');
const visible = (req, p) => voitTout(req) || (p.publie && !p.archive) || (p.demandeur && p.demandeur === req.user.id);

/** Contexte complet d'une procédure : de quoi calculer sa phase, son classement et son titulaire. */
function ctxDe(pid) {
  const s = store(pid);
  const k = ['org', 'fxFrozen', 'cadre', 'cdc', 'criteria', 'quality', 'justif', 'excluded', 'confirmed', 'docDefs', 'approvals',
    'depClosed', 'evalDone', 'standstill', 'contractSigned', 'infructueux', 'recours'];
  const ctx = { offers: s.offers() };
  k.forEach((x) => { ctx[x] = s.get(x); });
  return ctx;
}
/** Phase d'une procédure, de la préparation à la signature (ordre du cycle de vie). */
function phase(p, ctx) {
  if (p.archive) return { id: 'archivee', lab: 'Archivée', rang: 9 };
  if (ctx.infructueux) return { id: 'infructueuse', lab: 'Infructueuse', rang: 8 };
  if (ctx.contractSigned) return { id: 'signee', lab: 'Marché signé', rang: 7 };
  if (R.allApproved(ctx.approvals)) return { id: 'attribuee', lab: (ctx.standstill || {}).startedAt ? 'Attribuée, notifiée' : 'Attribuée', rang: 6 };
  if (ctx.evalDone) return { id: 'approbation', lab: 'En approbation', rang: 5 };
  if (ctx.depClosed) return { id: 'evaluation', lab: 'En évaluation', rang: 4 };
  if ((ctx.cdc || {}).cdcPublie) return { id: 'publiee', lab: 'Publiée, dépôt des offres', rang: 3 };
  return { id: 'preparation', lab: 'En préparation', rang: 1 };
}

r.get('/registre', requireAuth, (req, res) => {
  const commandes = commandesAll(), besoins = besoinsAll();
  const lignes = proceduresAll().filter((p) => visible(req, p)).map((p) => {
    const ctx = ctxDe(p.id), ph = phase(p, ctx), cdc = ctx.cdc || {};
    const ligne = { id: p.id, ref: cdc.ref, objet: cdc.objet, type: cdc.procedure, profil: P.profil(R.profilId(ctx)).lab,
      phase: ph, archive: p.archive, creee: p.creee, publieeLe: ctx.cadre ? ctx.cadre.at : null };
    if (!voitTout(req)) {
      // soumissionnaire : la date limite et l'état de l'offre de son entreprise (pas de données internes)
      if (req.can('portail.use')) {
        const eq = require('../db').equipeDe(req.user.id);
        Object.assign(ligne, { dateLimite: cdc.ouverture || null, autorite: cdc.autorite || null,
          monOffre: ctx.offers.some((o) => o.depotPar && eq.includes(o.depotPar)) });
      }
      return ligne;
    }
    const win = R.allApproved(ctx.approvals) ? R.ranking(ctx)[0] : null;
    const cmd = commandes.filter((c) => c.procedure.id === p.id && c.statut !== 'annulee');
    const b = cdc.besoin ? besoins.find((x) => x.id === cdc.besoin) : null;
    return { ...ligne, offres: ctx.offers.length, budgetEstime: cdc.budgetEstime || null,
      titulaire: win ? win.o.name : null, montantAttribue: win ? Math.round(R.montantXOF(ctx, win.o)) : null,
      besoin: b ? { id: b.id, service: b.service } : null,
      commandes: { nb: cmd.length, emises: cmd.filter((c) => c.numero).length,
        montant: Math.round(cmd.filter((c) => c.numero).reduce((t, c) => t + c.lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0) * (c.taux || 1), 0)) } };
  });
  res.json({ procedures: lignes });
});

r.get('/accueil', requireAuth, (req, res) => {
  const can = (x) => req.can(x), moi = req.user.id, taches = [], chiffres = {};
  const tache = (module, titre, detail, lien) => taches.push({ module, titre, detail, lien });

  /* Besoins */
  if (can('besoin.create') || can('besoin.approve') || can('besoin.manage')) {
    const bs = besoinsAll().filter((b) => can('besoin.approve') || can('besoin.manage') || b.par === moi);
    const n = (s) => bs.filter((b) => b.statut === s).length;
    chiffres.besoins = { brouillon: n('brouillon'), soumis: n('soumis'), valide: n('valide'), rejete: n('rejete'), transforme: n('transforme') };
    bs.forEach((b) => {
      if (b.par === moi && b.statut === 'rejete') tache('Demandes d’achat', `Corriger la demande ${b.id}`, b.objet + ' — rejeté : ' + (b.rejet || {}).motif, { vue: 'besoins', id: b.id });
      if (b.par === moi && b.statut === 'brouillon') tache('Demandes d’achat', `Soumettre la demande ${b.id}`, b.objet, { vue: 'besoins', id: b.id });
      if (b.statut === 'soumis' && can('besoin.approve')) {
        const i = C.prochaine(b.circuit);
        if (i >= 0 && !C.controle(b.circuit, i, req.user, [b.par], SU.sup(req.user, 'besoin', b.id))) tache('Demandes d’achat', `Valider la demande ${b.id}`, `${b.objet} — ${b.circuit[i].role}`, { vue: 'besoins', id: b.id });
      }
      if (b.statut === 'valide' && can('besoin.manage')) tache('Demandes d’achat', `Transformer la demande ${b.id} en procédure`, b.objet, { vue: 'besoins', id: b.id });
    });
  }

  /* Appels d'offres */
  const procs = proceduresAll().filter((p) => visible(req, p));
  if (voitTout(req)) {
    const parPhase = {};
    procs.forEach((p) => {
      const ctx = ctxDe(p.id), ph = phase(p, ctx), cdc = ctx.cdc || {}, ref = cdc.ref;
      parPhase[ph.id] = (parPhase[ph.id] || 0) + 1;
      if (p.archive) return;
      const L = (vue) => ({ vue, procedure: p.id });
      if (!cdc.cdcPublie && can('cdc.publish')) tache('Appels d’offres', `Publier le dossier ${ref}`, cdc.objet, L('cdc'));
      if (cdc.cdcPublie && !ctx.depClosed && can('depouille.close')) tache('Appels d’offres', `Dépouiller les offres de ${ref}`, `${ctx.offers.length} offre(s) reçue(s)`, L('depouille'));
      if (ctx.depClosed && !ctx.evalDone && (can('eval.score') || can('eval.validate'))) tache('Appels d’offres', `Évaluer les offres de ${ref}`, can('eval.validate') ? 'Noter puis valider l’évaluation' : 'Noter les critères qualitatifs', L('evaluation'));
      if (ctx.evalDone && !R.allApproved(ctx.approvals) && can('decision.approve')) {
        const i = C.prochaine(ctx.approvals);
        if (i >= 0 && !C.controle(ctx.approvals, i, req.user, [], SU.sup(req.user, 'attribution', p.id))) tache('Appels d’offres', `Approuver l’attribution de ${ref}`, ctx.approvals[i].role, L('decision'));
      }
      if (R.allApproved(ctx.approvals) && !ctx.contractSigned && can('contract.sign')) {
        const ss = ctx.standstill || {};
        tache('Appels d’offres', ss.startedAt ? `Signer le marché ${ref}` : `Notifier l’attribution de ${ref}`, ss.startedAt ? 'Après le délai de recours' : 'Ouvre le délai de recours', L('recours'));
      }
      if ((ctx.recours || []).some((x) => x.statut === 'ouvert') && can('recours.handle')) tache('Appels d’offres', `Instruire le recours sur ${ref}`, 'Signature suspendue', L('recours'));
    });
    chiffres.procedures = { total: procs.length, parPhase };
  } else if (can('portail.use')) {
    const ouverts = procs.filter((p) => p.publie && !p.archive && !p.depouillement);
    chiffres.procedures = { ouverts: ouverts.length };
    ouverts.forEach((p) => tache('Appels d’offres', `Répondre à ${p.ref}`, p.objet, { vue: 'portail', procedure: p.id }));
  }

  /* Commandes */
  const cmds = commandesAll().filter((c) => can('commande.manage') || can('commande.approve') || (c.receptionnaire && c.receptionnaire.id === moi));
  if (cmds.length || can('commande.manage')) {
    const n = (...s) => cmds.filter((c) => s.includes(c.statut)).length;
    const auj = new Date().toISOString().slice(0, 10);
    chiffres.commandes = { brouillon: n('brouillon', 'rejete'), validation: n('validation', 'validee'), enCours: n('emise', 'en_reception', 'receptionnee'),
      cloturees: n('cloturee'), enRetard: cmds.filter((c) => ['emise', 'en_reception'].includes(c.statut) && c.dateLivraison < auj).length };
    cmds.forEach((c) => {
      const nom = (c.numero || 'Brouillon') + ' — ' + c.titulaire.nom, L = { vue: 'commandes', id: c.id };
      if (c.statut === 'validation' && can('commande.approve')) { const i = C.prochaine(c.circuit); if (i >= 0 && !C.controle(c.circuit, i, req.user, [c.creePar], SU.sup(req.user, 'commande', c.id))) tache('Commandes', `Valider la commande ${nom}`, c.circuit[i].role, L); }
      (c.avenants || []).forEach((a) => {
        if (a.statut === 'validation' && can('commande.approve')) { const i = C.prochaine(a.circuit); if (i >= 0 && !C.controle(a.circuit, i, req.user, [a.creePar], SU.sup(req.user, 'avenant', c.id + '#' + a.n))) tache('Commandes', `Valider l’avenant n° ${a.n} de ${nom}`, a.motif, L); }
        if (a.statut === 'validee' && can('commande.manage')) tache('Commandes', `Émettre l’avenant n° ${a.n} de ${nom}`, a.motif, L);
      });
      if (c.statut === 'validee' && can('commande.manage')) tache('Commandes', `Émettre la commande ${nom}`, c.procedure.ref, L);
      if (['brouillon', 'rejete'].includes(c.statut) && can('commande.manage')) tache('Commandes', `Compléter la commande ${nom}`, c.statut === 'rejete' ? 'Rejetée : ' + (c.rejet || {}).motif : 'Brouillon', L);
      if (c.receptionnaire && c.receptionnaire.id === moi && ['emise', 'en_reception'].includes(c.statut)) tache('Commandes', `Réceptionner ${nom}`, 'Livraison prévue le ' + c.dateLivraison + (c.dateLivraison < auj ? ' (en retard)' : ''), L);
      if (c.receptionnaire && c.receptionnaire.id === moi && c.statut === 'receptionnee') tache('Commandes', `Prononcer la réception définitive de ${nom}`, 'Après levée des réserves', L);
    });
  }

  /* Partenaires */
  if (can('partenaires.manage')) {
    const ps = partenairesAll(), auj = new Date().toISOString().slice(0, 10);
    chiffres.partenaires = { verification: ps.filter((p) => p.statut === 'verification').length, references: ps.filter((p) => p.statut === 'reference').length,
      alertes: ps.filter((p) => p.evaluation && p.evaluation.alerte).length };
    ps.forEach((p) => {
      const L = { vue: 'partenaires', id: p.id };
      if (p.statut === 'verification') tache('Partenaires', `Instruire le dossier de ${p.raisonSociale}`, p.id, L);
      const aVoir = Object.keys(p.pieces || {}).filter((k) => p.pieces[k].statut === 'a_verifier');
      if (aVoir.length && p.statut !== 'verification') tache('Partenaires', `Vérifier ${aVoir.length} pièce(s) de ${p.raisonSociale}`, 'Pièce(s) renouvelée(s)', L);
      const exp = Object.keys(p.pieces || {}).filter((k) => p.pieces[k].expire && p.pieces[k].expire < auj);
      if (exp.length && p.statut === 'reference') tache('Partenaires', `Pièce(s) expirée(s) chez ${p.raisonSociale}`, exp.join(', '), L);
      if (p.evaluation && p.evaluation.alerte) tache('Partenaires', `Examiner ${p.raisonSociale} : note ${p.evaluation.moyenne}/100`, 'Sous le seuil d’alerte', L);
    });
  }
  if (can('portail.use')) {
    const p = partenaireDe(moi);
    if (p) {
      chiffres.monReferencement = { statut: p.statut, note: p.evaluation && p.evaluation.nb ? p.evaluation.moyenne : null };
      if (['candidat', 'rejete'].includes(p.statut)) tache('Référencement', p.statut === 'rejete' ? 'Corriger mon dossier de référencement' : 'Compléter et soumettre mon dossier de référencement', p.rejet ? 'Motif : ' + p.rejet.motif : 'Fiche et pièces administratives', { vue: 'referencement' });
    }
  }
  // activité récente : les dernières entrées du journal, pour ceux qui y ont accès
  const activite = can('audit.read') ? auditList(8) : [];
  res.json({ chiffres, taches, activite });
});

/** Budget : lignes et situation (alloué, engagé, réservé, disponible). Paramètres, achats, demandes et commandes. */
r.get('/budget', requireAuth, (req, res) => {
  if (!['params.edit', 'offres.read', 'commande.manage', 'besoin.create', 'besoin.approve', 'besoin.manage', 'audit.read'].some((p) => req.can(p)))
    return res.status(403).json({ error: 'Habilitation insuffisante.' });
  res.json({ lignes: require('../budget').situation(null) });
});

/** Sauvegardes vues d'un espace (administrateur) : la dernière, et le résultat pour sa propre base. */
r.get('/sauvegardes', requireAuth, (req, res) => {
  if (!req.can('params.edit')) return res.status(403).json({ error: 'Habilitation insuffisante.' });
  const S = require('../sauvegardes'), e = S.etat(), moi = require('../contexte').espace() || require('../espaces').INITIAL();
  const d = e.derniere, base = d && (d.bases || []).find((b) => b.espace === moi);
  res.json({ actif: e.actif, intervalleHeures: e.intervalleHeures, conserver: e.conserver, nombre: e.sauvegardes.length,
    derniere: d ? { date: d.date, statut: base ? (base.integrite === 'ok' ? 'ok' : 'anomalie') : 'absente', taille: base ? base.taille : null, sha256: base ? base.sha256 : null } : null });
});

/* ---- Indicateurs ---- */
const isoSql = (t) => (t ? String(t).replace(' ', 'T') + (/Z$/.test(t) ? '' : 'Z') : null);
const jours = (a, b) => (a && b ? Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 864e5 * 10) / 10) : null);
/** Montant d'un texte (« 45 000 000 XOF »), converti en XOF au taux de l'organisation quand une autre devise est citée. */
function montantTexte(t, rates) {
  const s = String(t || ''), n = Number(s.replace(/[^\d,.]/g, '').replace(/\s/g, '').replace(',', '.'));
  if (!(n > 0)) return null;
  const dev = (/\b(EUR|USD|GHS|NGN|XOF)\b/.exec(s) || [])[1] || 'XOF';
  return n * ((rates || {})[dev] || 1);
}
/** Estimation d'un dossier en XOF : somme des montants estimatifs des lots, sinon budget estimé du besoin d'origine. */
function estimation(cdc, rates) {
  const lots = (cdc.lots || []).map((l) => montantTexte(l.montant, rates));
  if (lots.length && lots.every((x) => x != null)) return lots.reduce((t, x) => t + x, 0);
  return Number(cdc.budgetEstime) > 0 ? Number(cdc.budgetEstime) : null;
}
function resume(liste) {
  const v = liste.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2), med = v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  return { nb: v.length, moyenne: Math.round(v.reduce((t, x) => t + x, 0) / v.length * 10) / 10, mediane: Math.round(med * 10) / 10, min: v[0], max: v[v.length - 1] };
}
r.get('/indicateurs', requireAuth, (req, res) => {
  if (!(req.can('offres.read') || req.can('audit.read') || req.can('pv.read'))) return res.status(403).json({ error: 'Habilitation insuffisante.' });
  const annees = new Set(), annee = Number(req.query.annee) || null;
  const toutes = proceduresAll().map((p) => { const a = new Date(isoSql(p.creee)).getUTCFullYear(); annees.add(a); return { ...p, annee: a }; });
  const commandes = commandesAll();
  const lignes = toutes.filter((p) => !annee || p.annee === annee).map((p) => {
    const ctx = ctxDe(p.id), ph = phase(p, ctx), cdc = ctx.cdc || {}, j = store(p.id).get('jalons') || {};
    const rates = (ctx.fxFrozen && ctx.fxFrozen.rates) || (ctx.org || {}).rates;
    const win = R.allApproved(ctx.approvals) ? R.ranking(ctx)[0] : null;
    const attribue = win ? Math.round(R.montantXOF(ctx, win.o)) : null, estime = estimation(cdc, rates);
    const cmd = commandes.filter((c) => c.procedure.id === p.id && c.numero && c.statut !== 'annulee');
    return { id: p.id, ref: cdc.ref, objet: cdc.objet, phase: ph, archive: p.archive,
      offres: ctx.offers.length, enLigne: ctx.offers.filter((o) => o.submitted).length, horsPlateforme: ctx.offers.filter((o) => o.externe).length,
      estime: estime != null ? Math.round(estime) : null, attribue, titulaire: win ? win.o.name : null,
      economie: estime != null && attribue != null ? Math.round(estime - attribue) : null,
      delais: { preparation: jours(isoSql(p.creee), j.publie), consultation: jours(j.publie, j.depouille), evaluation: jours(j.depouille, j.attribue),
        cycle: jours(j.publie, j.attribue), signature: jours(j.attribue, j.signe) },
      commandes: { nb: cmd.length, montant: Math.round(cmd.reduce((t, c) => t + c.lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0) * (c.taux || 1), 0)) } };
  });
  const avecEco = lignes.filter((l) => l.economie != null);
  const estimeTot = avecEco.reduce((t, l) => t + l.estime, 0), attribueTot = avecEco.reduce((t, l) => t + l.attribue, 0);
  const consultees = lignes.filter((l) => l.phase.rang >= 4 && l.phase.id !== 'archivee' || (l.phase.id === 'archivee' && l.offres));
  const cmdAnnee = commandes.filter((c) => c.numero && lignes.some((l) => l.id === c.procedure.id));
  res.json({
    annee, annees: [...annees].sort(), procedures: lignes,
    volumes: { procedures: lignes.length, enPreparation: lignes.filter((l) => l.phase.id === 'preparation').length,
      enCours: lignes.filter((l) => ['publiee', 'evaluation', 'approbation'].includes(l.phase.id)).length,
      attribuees: lignes.filter((l) => ['attribuee', 'signee'].includes(l.phase.id) || l.attribue != null).length,
      infructueuses: lignes.filter((l) => l.phase.id === 'infructueuse').length, montantAttribue: lignes.reduce((t, l) => t + (l.attribue || 0), 0) },
    concurrence: { offres: lignes.reduce((t, l) => t + l.offres, 0), enLigne: lignes.reduce((t, l) => t + l.enLigne, 0), horsPlateforme: lignes.reduce((t, l) => t + l.horsPlateforme, 0),
      parConsultation: resume(consultees.map((l) => l.offres)), moinsDeTrois: consultees.filter((l) => l.offres < 3).length, consultations: consultees.length },
    delais: Object.fromEntries(['preparation', 'consultation', 'evaluation', 'cycle', 'signature'].map((k) => [k, resume(lignes.map((l) => l.delais[k]))])),
    economies: { procedures: avecEco.length, estime: Math.round(estimeTot), attribue: Math.round(attribueTot), economie: Math.round(estimeTot - attribueTot),
      taux: estimeTot ? Math.round((estimeTot - attribueTot) / estimeTot * 1000) / 10 : null },
    commandes: { emises: cmdAnnee.filter((c) => c.statut !== 'annulee').length, annulees: cmdAnnee.filter((c) => c.statut === 'annulee').length,
      receptionnees: cmdAnnee.filter((c) => ['receptionnee', 'cloturee'].includes(c.statut)).length,
      montant: Math.round(cmdAnnee.filter((c) => c.statut !== 'annulee').reduce((t, c) => t + c.lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0) * (c.taux || 1), 0)) },
  });
});

module.exports = r;
