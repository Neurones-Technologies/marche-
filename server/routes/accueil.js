/* Accueil de l'organisation et registre des appels d'offres.
   - GET /api/accueil : chiffres clés de chaque registre que l'utilisateur peut voir, et « À faire pour moi » :
     les actions qui l'attendent, calculées par le serveur selon ses habilitations (validations à donner,
     dossiers à instruire, commandes à émettre ou à réceptionner…), avec de quoi ouvrir l'écran concerné.
   - GET /api/registre : toutes les procédures visibles, passées et en cours, avec leur phase, le titulaire et le
     montant attribués, le besoin d'origine et les commandes passées. */
const express = require('express');
const { db, store, proceduresAll, besoinsAll, commandesAll, partenairesAll, partenaireDe, auditList } = require('../db');
const { requireAuth } = require('../auth');
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
    if (!voitTout(req)) return ligne; // soumissionnaire, demandeur : pas de données internes
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
      if (b.par === moi && b.statut === 'rejete') tache('Besoins', `Corriger le besoin ${b.id}`, b.objet + ' — rejeté : ' + (b.rejet || {}).motif, { vue: 'besoins', id: b.id });
      if (b.par === moi && b.statut === 'brouillon') tache('Besoins', `Soumettre le besoin ${b.id}`, b.objet, { vue: 'besoins', id: b.id });
      if (b.statut === 'soumis' && can('besoin.approve')) {
        const i = C.prochaine(b.circuit);
        if (i >= 0 && !C.controle(b.circuit, i, req.user, [b.par])) tache('Besoins', `Valider le besoin ${b.id}`, `${b.objet} — ${b.circuit[i].role}`, { vue: 'besoins', id: b.id });
      }
      if (b.statut === 'valide' && can('besoin.manage')) tache('Besoins', `Transformer le besoin ${b.id} en procédure`, b.objet, { vue: 'besoins', id: b.id });
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
        if (i >= 0 && !C.controle(ctx.approvals, i, req.user, [])) tache('Appels d’offres', `Approuver l’attribution de ${ref}`, ctx.approvals[i].role, L('decision'));
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
      if (c.statut === 'validation' && can('commande.approve')) { const i = C.prochaine(c.circuit); if (i >= 0 && !C.controle(c.circuit, i, req.user, [c.creePar])) tache('Commandes', `Valider la commande ${nom}`, c.circuit[i].role, L); }
      (c.avenants || []).forEach((a) => {
        if (a.statut === 'validation' && can('commande.approve')) { const i = C.prochaine(a.circuit); if (i >= 0 && !C.controle(a.circuit, i, req.user, [a.creePar])) tache('Commandes', `Valider l’avenant n° ${a.n} de ${nom}`, a.motif, L); }
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

module.exports = r;
