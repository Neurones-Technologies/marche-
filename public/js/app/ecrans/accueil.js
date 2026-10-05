/* Marché+ — Accueil de l'organisation : indicateurs, « À faire pour moi », appels d'offres par phase.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Les données viennent de /api/accueil, calculées par le serveur selon les habilitations de l'utilisateur. */
"use strict";

/* Ouvre l'écran d'une tâche : la procédure concernée si besoin, et l'élément visé (besoin, commande, partenaire). */
function ouvrirLien(lien){
  if(lien.vue==='besoins') UI.besoin=lien.id;
  if(lien.vue==='commandes') UI.commande=lien.id;
  if(lien.vue==='partenaires') UI.partenaire=lien.id;
  if(lien.procedure) MP.refreshProcs().then(function(){ ouvrirProcedure(lien.procedure, lien.vue); });
  else go(lien.vue);
}

var PHASES_AO = { preparation:'En préparation', publiee:'Publiées, dépôt des offres', evaluation:'En évaluation', approbation:'En approbation',
  attribuee:'Attribuées', signee:'Marchés signés', infructueuse:'Infructueuses', archivee:'Archivées' };

function vAccueil(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Tableau de bord');
  var zone=add(m,'div'); add(zone,'p','muted','Chargement…');
  MP.api('GET','/api/accueil').then(function(r){ zone.textContent=''; dessiner(r); })
    .catch(function(e){ zone.textContent=''; add(zone,'p','muted',e.message); });

  function dessiner(r){
    var c=r.chiffres;

    /* 1. Indicateurs clés : une tuile par chiffre utile au rôle, qui mène au registre concerné. */
    var kp=add(zone,'div','kpis');
    function tuile(lab, valeur, sous, ic, vue, alerte){
      var t=add(kp, vue?'button':'div', 'kpi card'+(alerte?' kpi-alerte':''));
      if(vue){ t.type='button'; fk(t,'kpi-'+vue+'-'+lab.length); t.addEventListener('click',function(){ go(vue); }); }
      var hd=add(t,'div','kpi-tete'); add(hd,'span','kpi-lab',lab); var pic=add(hd,'span','kpi-ic'); icon(pic,ic);
      add(t,'div','kpi-val',String(valeur));
      if(sous) add(t,'div','kpi-sous',sous);
    }
    tuile('À faire pour moi', r.taches.length, r.taches.length ? 'action(s) qui vous attendent' : 'rien en attente', 'check', null, false);
    if(c.besoins) tuile('Demandes d’achat en validation', c.besoins.soumis, c.besoins.valide+' validée(s), à transformer', 'demande', 'besoins');
    if(c.procedures && c.procedures.parPhase){
      var pp=c.procedures.parPhase, enCours=c.procedures.total-(pp.signee||0)-(pp.archivee||0)-(pp.infructueuse||0);
      tuile('Appels d’offres en cours', enCours, c.procedures.total+' au total', 'folder', 'procedures');
    }
    if(c.procedures && c.procedures.ouverts!=null) tuile('Appels d’offres ouverts', c.procedures.ouverts, 'auxquels vous pouvez répondre', 'folder', 'procedures');
    if(c.commandes) tuile('Commandes en cours', c.commandes.enCours, c.commandes.enRetard ? c.commandes.enRetard+' en retard de livraison' : 'aucune en retard', 'camion', 'commandes', c.commandes.enRetard>0);
    if(c.partenaires) tuile('Partenaires référencés', c.partenaires.references, c.partenaires.verification+' dossier(s) en instruction'+(c.partenaires.alertes?' · '+c.partenaires.alertes+' sous le seuil':''), 'users', 'partenaires', c.partenaires.alertes>0);
    if(c.monReferencement){
      var S={ candidat:'Dossier à compléter', verification:'En instruction', rejete:'À corriger', reference:'Référencé', suspendu:'Suspendu', exclu:'Exclu' };
      tuile('Mon référencement', S[c.monReferencement.statut]||c.monReferencement.statut, c.monReferencement.note!=null ? 'note '+c.monReferencement.note+'/100' : '', 'badge', 'referencement');
    }

    /* 2. « À faire pour moi » et appels d'offres par phase. */
    var g=add(zone,'div','tdb-grille');
    var gauche=add(g,'div');
    var modules=[]; r.taches.forEach(function(t){ if(modules.indexOf(t.module)<0) modules.push(t.module); });
    tableau(gauche,{ cle:'taches', titre:'À faire pour moi', lignes:r.taches, vide:'Aucune action ne vous attend pour le moment.',
      colonnes:[
        {lab:'Module', rendu:function(t,td){ chipCellule(td,t.module,'c-grey'); }},
        {lab:'Action', rendu:function(t,td){ add(td,'strong',null,t.titre); if(t.detail) add(td,'div','muted',t.detail); }}
      ],
      recherche:function(t){ return t.module+' '+t.titre+' '+(t.detail||''); },
      filtres: modules.length>1 ? [{ lab:'Module', options:modules.map(function(x){ return [x,x]; }), test:function(t,v){ return t.module===v; } }] : [],
      actions:function(t,td){ boutonCellule(td,'Ouvrir',function(){ ouvrirLien(t.lien); },'tache-'+r.taches.indexOf(t),true); }
    });
    if(c.procedures && c.procedures.parPhase) barresPhases(add(g,'div'), c.procedures.parPhase);

  }
}

/* Appels d'offres par phase : barres horizontales, une seule série (couleur --color-chart, validée), valeur en bout
   de barre, survol : libellé et nombre. Les nombres restent lisibles sans la couleur. */
function barresPhases(parent, parPhase){
  var k=add(parent,'div','card');
  var hd=add(k,'div','panel-head'); add(hd,'span',null,'Appels d’offres par phase');
  var bv=add(hd,'button','btn btn-ghost btn-sm','Voir le registre'); fk(bv,'reg-procedures'); bv.addEventListener('click',function(){ go('procedures'); });
  var b=add(k,'div','pad');
  var ids=Object.keys(PHASES_AO).filter(function(x){ return parPhase[x]; });
  if(!ids.length){ add(b,'p','muted','Aucun appel d’offres.'); return; }
  var max=Math.max.apply(null, ids.map(function(x){ return parPhase[x]; }));
  var liste=add(b,'div','barres'); liste.setAttribute('role','list');
  ids.forEach(function(x){
    var row=add(liste,'div','barre'); row.setAttribute('role','listitem');
    row.title=PHASES_AO[x]+' : '+parPhase[x]+' procédure(s)';
    add(row,'span','barre-lab',PHASES_AO[x]);
    var piste=add(row,'span','barre-piste');
    var trait=add(piste,'span','barre-trait'); trait.style.width=Math.max(4, Math.round(100*parPhase[x]/max))+'%';
    add(row,'span','barre-val',String(parPhase[x]));
  });
}
