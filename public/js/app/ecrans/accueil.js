/* Marché+ — Accueil de l'organisation : « À faire pour moi » et chiffres clés de chaque registre.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Les tâches sont calculées par le serveur (/api/accueil) selon les habilitations de l'utilisateur. */
"use strict";

/* Ouvre l'écran d'une tâche : la procédure concernée si besoin, et l'élément visé (besoin, commande, partenaire). */
function ouvrirLien(lien){
  if(lien.vue==='besoins') UI.besoin=lien.id;
  if(lien.vue==='commandes') UI.commande=lien.id;
  if(lien.vue==='partenaires') UI.partenaire=lien.id;
  if(lien.procedure) MP.refreshProcs().then(function(){ ouvrirProcedure(lien.procedure, lien.vue); });
  else go(lien.vue);
}

function vAccueil(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Tableau de bord');
  var zone=add(m,'div'); add(zone,'p','muted','Chargement…');

  MP.api('GET','/api/accueil').then(function(r){ zone.textContent=''; dessiner(r); })
    .catch(function(e){ zone.textContent=''; add(zone,'p','muted',e.message); });

  function dessiner(r){
    /* À faire pour moi */
    var k=add(zone,'div','card');
    var ph=add(k,'div','panel-head'); add(ph,'span',null,'À faire pour moi');
    add(ph,'span','chip '+(r.taches.length?'c-amber':'c-green'), r.taches.length ? r.taches.length+' action(s)' : 'Rien en attente');
    var b=add(k,'div','pad');
    if(!r.taches.length) add(b,'p','muted','Aucune action ne vous attend pour le moment.');
    var mod=null;
    r.taches.forEach(function(t,i){
      if(t.module!==mod){ mod=t.module; add(b,'div','t-xs',mod).style.marginTop = i ? '14px' : '0'; }
      var row=add(b,'div','docline');
      var lf=add(row,'div'); lf.style.flex='1 1 300px';
      add(lf,'strong',null,t.titre);
      if(t.detail) add(lf,'div','muted',t.detail);
      var bo=add(row,'button','btn btn-primary btn-sm','Ouvrir'); fk(bo,'tache-'+i);
      bo.addEventListener('click',function(){ ouvrirLien(t.lien); });
    });

    /* Chiffres clés */
    var c=r.chiffres, g=add(zone,'div'); g.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;margin-top:18px;align-items:start';
    function carte(titre, vue, lignes){
      var kc=add(g,'div','card');
      var hd=add(kc,'div','panel-head'); add(hd,'span',null,titre);
      if(vue){ var bv=add(hd,'button','btn btn-ghost btn-sm','Voir le registre'); fk(bv,'reg-'+vue); bv.addEventListener('click',function(){ go(vue); }); }
      var bd=add(kc,'div','pad');
      lignes.forEach(function(x){ var row=add(bd,'div','docline'); add(row,'div',null,x[0]); var v=add(row,'strong',null,String(x[1])); if(x[2]) v.style.color='var(--color-blocked)'; });
    }
    if(c.besoins) carte('Besoins','besoins',[['En validation',c.besoins.soumis],['Validés, à transformer',c.besoins.valide],['À corriger',c.besoins.rejete],['Devenus procédures',c.besoins.transforme]]);
    if(c.procedures && c.procedures.parPhase){
      var LAB={ preparation:'En préparation', publiee:'Publiées, dépôt des offres', evaluation:'En évaluation', approbation:'En approbation', attribuee:'Attribuées', signee:'Marchés signés', infructueuse:'Infructueuses', archivee:'Archivées' };
      var lp=Object.keys(LAB).filter(function(k){ return c.procedures.parPhase[k]; }).map(function(k){ return [LAB[k], c.procedures.parPhase[k]]; });
      carte('Appels d’offres','procedures',[['Total',c.procedures.total]].concat(lp));
    }
    if(c.procedures && c.procedures.ouverts!=null) carte('Appels d’offres','procedures',[['Ouverts au dépôt',c.procedures.ouverts]]);
    if(c.commandes) carte('Commandes','commandes',[['Brouillons et à corriger',c.commandes.brouillon],['En validation ou à émettre',c.commandes.validation],['En cours d’exécution',c.commandes.enCours],['En retard de livraison',c.commandes.enRetard,c.commandes.enRetard>0],['Réception définitive',c.commandes.cloturees]]);
    if(c.partenaires) carte('Partenaires','partenaires',[['Dossiers en instruction',c.partenaires.verification],['Référencés',c.partenaires.references],['Sous le seuil d’alerte',c.partenaires.alertes,c.partenaires.alertes>0]]);
    if(c.monReferencement){
      var S={ candidat:'Dossier à compléter', verification:'En instruction', rejete:'À corriger', reference:'Référencé', suspendu:'Suspendu', exclu:'Exclu' };
      carte('Mon référencement','referencement',[['Statut',S[c.monReferencement.statut]||c.monReferencement.statut]].concat(c.monReferencement.note!=null?[['Note sur les commandes exécutées',c.monReferencement.note+'/100']]:[]));
    }
  }
}
