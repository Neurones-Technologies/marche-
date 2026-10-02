/* Règles de calcul de Marché+, partagées par le navigateur et le serveur.
   Chargé tel quel par <script> (global MPRegles) et par Node (require) : aucune étape de build.
   Fonctions pures : tout ce dont elles ont besoin arrive par le contexte `ctx`
   { offers, org, fxFrozen, cadre, cdc, criteria, quality, justif, excluded, confirmed, docDefs }.
   Dépend de profils.js, chargé avant lui dans le navigateur. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./profils.js'));
  else root.MPRegles = factory(root.MPProfils);
})(this, function (P) {
  'use strict';

  /* Profil réglementaire de la procédure : celui figé à la publication, sinon celui choisi au cahier des charges,
     sinon le profil par défaut du client. */
  function profilId(ctx) {
    return (ctx.cadre && ctx.cadre.profil) || (ctx.cdc && ctx.cdc.profil) || (ctx.org && ctx.org.profilDefaut) || P.DEFAUT;
  }
  /* Règles effectives de la procédure : figées à la publication du dossier, calculées en direct avant. */
  function cadre(ctx) {
    if (ctx.cadre && ctx.cadre.regles) return ctx.cadre.regles;
    return P.effectif(profilId(ctx), ctx.org && ctx.org.reglages);
  }

  /* Taux de change : ceux figés à la clôture du dépouillement s'ils existent, sinon ceux des paramètres.
     Une fois figés, une modification des paramètres ne fait plus bouger le classement. */
  function rates(ctx) {
    if (ctx.fxFrozen && ctx.fxFrozen.rates) return ctx.fxFrozen.rates;
    return (ctx.org && ctx.org.rates) || {};
  }
  function rate(ctx, devise) { return rates(ctx)[devise] || 1; }

  /* « UEMOA » désigne la zone de préférence du profil ; « local », le pays de l'acheteur. */
  function isUemoa(ctx, o) { return cadre(ctx).zonePreference.indexOf(o.iso) >= 0; }
  function isLocal(ctx, o) { return o.iso === cadre(ctx).paysLocal; }

  /* Marge de préférence appliquée : 0 si elle est désactivée ou interdite par le profil, plafonnée sinon. */
  function prefTaux(ctx) {
    var c = ctx.cdc || {}, k = cadre(ctx);
    if (!c.prefActive || !k.preferenceAutorisee) return 0;
    return Math.max(0, Math.min(Number(c.prefTaux || 0), k.preferenceTauxMax));
  }

  function montantXOF(ctx, o) { return o.montant * rate(ctx, o.devise); }
  /* Montant de comparaison : la marge de préférence ne s'applique qu'au classement,
     jamais au montant du marché (qui reste le montant d'offre). */
  function montantCorrige(ctx, o) {
    var m = montantXOF(ctx, o), t = prefTaux(ctx);
    if (t && !isUemoa(ctx, o)) m = m * (1 + t / 100);
    return m;
  }

  function requiredDocs(ctx, o) {
    return (ctx.docDefs || []).filter(function (d) {
      if (d.scope === 'tous') return true;
      if (d.scope === 'local') return isLocal(ctx, o);
      return !isUemoa(ctx, o);
    });
  }
  function missingDocs(ctx, o) {
    return requiredDocs(ctx, o).filter(function (d) { return !(o.docs || {})[d.id]; });
  }
  function isExcluded(ctx, o) {
    var ex = ctx.excluded || {};
    if (ex[o.id] != null) return ex[o.id];
    return missingDocs(ctx, o).length > 0;
  }
  function conformes(ctx) {
    return (ctx.offers || []).filter(function (o) { return !isExcluded(ctx, o); });
  }

  /* Score proposé par l'IA, et score retenu par l'évaluateur (70 par défaut). */
  function aiScore(o, critId) { return critId === 'metho' ? o.aiMetho : (critId === 'refs' ? o.aiRefs : 70); }
  function curScore(ctx, o, critId) {
    var q = (ctx.quality || {})[o.id] || {};
    return q[critId] != null ? q[critId] : 70;
  }

  /* Champs extraits à faible confiance qui n'ont pas encore été confirmés par un humain. */
  function flagsRemaining(ctx) {
    var n = 0, conf = ctx.confirmed || {};
    (ctx.offers || []).forEach(function (o) {
      (o.fields || []).forEach(function (f, i) { if (f.flag && !conf[o.id + '_' + i]) n++; });
    });
    return n;
  }

  function weightTotal(ctx) {
    return (ctx.criteria || []).reduce(function (s, c) { return s + Number(c.weight || 0); }, 0);
  }

  function ranking(ctx) {
    var list = conformes(ctx); if (!list.length) return [];
    var crit = ctx.criteria || [];
    var minPrix = Math.min.apply(null, list.map(function (o) { return montantCorrige(ctx, o); }));
    var minDelai = Math.min.apply(null, list.map(function (o) { return o.delai; }));
    var rows = list.map(function (o) {
      var notes = { prix: Math.round(minPrix / montantCorrige(ctx, o) * 1000) / 10, delai: Math.round(minDelai / o.delai * 1000) / 10 };
      crit.forEach(function (c) { if (c.kind === 'qual') notes[c.id] = curScore(ctx, o, c.id); });
      var t = 0; crit.forEach(function (c) { t += (notes[c.id] || 0) * Number(c.weight || 0) / 100; });
      return { o: o, notes: notes, total: Math.round(t * 10) / 10 };
    });
    rows.sort(function (a, b) { return b.total - a.total; });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return rows;
  }

  /* Écarts entre score IA et score retenu qui n'ont pas de justification écrite. */
  function missingJustifs(ctx) {
    var out = [], j = ctx.justif || {};
    (ctx.criteria || []).filter(function (c) { return c.kind === 'qual'; }).forEach(function (c) {
      conformes(ctx).forEach(function (o) {
        if (Math.abs(curScore(ctx, o, c.id) - aiScore(o, c.id)) > 0.01 && !String(j[o.id + '_' + c.id] || '').trim())
          out.push(o.name + ' / ' + c.label);
      });
    });
    return out;
  }

  function allApproved(approvals) {
    return !!(approvals && approvals.length) && approvals.every(function (a) { return a.done; });
  }

  /* Jours restants avant la fin du délai de recours ; le délai complet tant qu'il n'est pas ouvert. */
  function standstillRemaining(standstill, now) {
    var s = standstill || {};
    if (!s.startedAt) return s.days;
    var ecoule = ((now == null ? Date.now() : now) - s.startedAt) / 86400000;
    return Math.max(0, Math.ceil(s.days - ecoule));
  }

  return {
    profilId: profilId, cadre: cadre, prefTaux: prefTaux,
    rates: rates, rate: rate, isUemoa: isUemoa, isLocal: isLocal, montantXOF: montantXOF, montantCorrige: montantCorrige,
    requiredDocs: requiredDocs, missingDocs: missingDocs, isExcluded: isExcluded, conformes: conformes,
    aiScore: aiScore, curScore: curScore, flagsRemaining: flagsRemaining, weightTotal: weightTotal,
    ranking: ranking, missingJustifs: missingJustifs, allApproved: allApproved, standstillRemaining: standstillRemaining,
  };
});
