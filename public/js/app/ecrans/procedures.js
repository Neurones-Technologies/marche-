/* Marché+ — Écran Procédures.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

/* ============ Procédures ============ */
function statutProcedure(p){
  if(p.archive) return ['Archivée','c-grey'];
  if(p.signe) return ['Marché signé','c-green'];
  if(p.infructueux) return ['Infructueuse','c-red'];
  if(p.evaluation) return ['Évaluation validée','c-teal'];
  if(p.depouillement) return ['Dépouillement clôturé','c-teal'];
  if(p.publie) return ['Publiée','c-amber'];
  return ['En préparation','c-grey'];
}
/* Registre des appels d'offres : toutes les procédures visibles, passées et en cours, avec leur phase, le titulaire
   et le montant attribués, le besoin d'origine et les commandes ; filtres par phase, année et recherche. */
function vProcedures(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Appels d\u2019offres');
  var zone=add(m,'div'); add(zone,'p','muted','Chargement…');
  var COUL={ preparation:'c-grey', publiee:'c-amber', evaluation:'c-blue', approbation:'c-teal', attribuee:'c-teal', signee:'c-green', infructueuse:'c-red', archivee:'c-grey' };

  MP.api('GET','/api/registre').then(function(r){ zone.textContent=''; dessiner(r.procedures); })
    .catch(function(e){ zone.textContent=''; add(zone,'p','muted',e.message); });

  function archiver(p){
    var faire=function(){
      MP.api('PATCH','/api/procedures/'+encodeURIComponent(p.id),{archive:!p.archive})
        .then(function(){ return MP.refreshProcs(); }).then(function(){ toast('Procédure '+p.ref+(p.archive?' désarchivée.':' archivée.')); render(); })
        .catch(function(e){ toast(e.message); });
    };
    if(p.archive) faire();
    else ask("Une procédure archivée se consulte toujours, mais plus rien ne peut y être modifié. Elle disparaît de la liste des soumissionnaires.", faire, 'Archiver '+p.ref+' ?', 'Archiver');
  }

  function dessiner(list){
    var annees=[]; list.forEach(function(p){ var a=String(p.publieeLe||p.creee||'').match(/(\d{4})/); if(a && annees.indexOf(a[1])<0) annees.push(a[1]); });
    annees.sort().reverse();
    var phases={}; list.forEach(function(p){ phases[p.phase.id]=p.phase; });
    var interne = list.some(function(p){ return 'offres' in p; });
    var colonnes=[
      {lab:'Référence', rendu:function(p,td){ add(td,'strong','nowrap',p.ref); if(p.id===MP.pid()){ var d=add(td,'div'); d.style.marginTop='4px'; chipCellule(d,'Ouverte','c-teal'); } }},
      {lab:'Objet', rendu:function(p,td){ var o=add(td,'div','dt-extrait',p.objet||''); o.style.minWidth='180px'; o.title=p.objet||''; if(p.type) add(td,'div','muted',p.type); }},
      {lab:'Publiée le', val:function(p){ return p.publieeLe ? String(p.publieeLe).split(' ')[0] : '—'; }}
    ];
    if(interne) colonnes=colonnes.concat([
      {lab:'Offres', num:true, val:function(p){ return p.offres; }},
      {lab:'Titulaire', val:function(p){ return p.titulaire||'—'; }},
      {lab:'Montant attribué', num:true, val:function(p){ return p.montantAttribue ? xof(p.montantAttribue) : '—'; }}
    ]);
    colonnes.push({lab:'Phase', rendu:function(p,td){ chipCellule(td, p.phase.lab, COUL[p.phase.id]); }});
    tableau(zone,{ cle:'procedures', lignes:list, colonnes:colonnes,
      vide: can('cdc.edit') ? 'Aucune procédure : utilisez « Nouvelle procédure », ou partez d\u2019un besoin validé.' : 'Aucun appel d\u2019offres n\u2019est ouvert pour le moment.',
      recherche:function(p){ return [p.ref, p.objet, p.titulaire, p.besoin && p.besoin.service, p.besoin && p.besoin.id].join(' '); },
      filtres:[
        { lab:'Phase', options:Object.keys(phases).sort(function(a,b){ return phases[a].rang-phases[b].rang; }).map(function(id){ return [id, phases[id].lab]; }), test:function(p,v){ return p.phase.id===v; } },
        { lab:'Année', options:annees.map(function(a){ return [a,a]; }), test:function(p,v){ return String(p.publieeLe||p.creee||'').indexOf(v)>=0; } }
      ],
      nouveau: can('cdc.edit') ? { lab:'Nouvelle procédure', action:nouvelleProcedure } : null,
      actions:function(p,td){
        // le détail de l'appel d'offres s'ouvre d'ici (il n'a plus d'entrée dans le menu)
        // en cours : là où l'on s'était arrêté ; terminé : la clôture (vueDEntree)
        var b=boutonIcone(td,'eye','Ouvrir le détail de '+p.ref,function(){
          if(p.id===MP.pid()) ouvrirProcedure(p.id,'entree'); else MP.refreshProcs().then(function(){ ouvrirProcedure(p.id,'entree'); });
        },'proc-open-'+p.id);
        b.setAttribute('data-consult','');
        if(can('params.edit')) boutonIcone(td,'archive',(p.archive?'Désarchiver ':'Archiver ')+p.ref,function(){ archiver(p); },'proc-arch-'+p.id);
      }
    });
  }
}

/* Fenêtre « Nouvelle procédure » : référence, objet, profil réglementaire. */
function nouvelleProcedure(){
  ouvrirFenetre('Nouvelle procédure', function(c,p){
    function champ(lab,id,type){
      var d=add(c,'div','fen-champ'); add(d,'label','fen-lab',lab).htmlFor=id;
      var i=add(d,type==='textarea'?'textarea':(type==='select'?'select':'input')); i.id=id; fk(i,id);
      if(type==='textarea') i.rows=3; else if(type!=='select') i.type='text';
      return i;
    }
    var ir=champ('Référence','np-ref'); ir.maxLength=40; ir.placeholder='AO-2026-020';
    var io=champ('Objet du marché','np-objet','textarea'); io.maxLength=500;
    var sp=champ('Profil réglementaire','np-profil','select');
    Object.keys(MPProfils.PROFILS).forEach(function(id){ var op=add(sp,'option',null,MPProfils.PROFILS[id].lab); op.value=id; });
    sp.value=(state.org && state.org.profilDefaut) || MPProfils.DEFAUT;
    add(c,'p','muted','Le dossier part du cahier des charges modèle, de la grille de critères par défaut et du circuit d’approbation par défaut. Il reste à compléter avant publication.').style.marginTop='12px';
    var an=add(p,'button','btn btn-ghost','Annuler'); fk(an,'np-annuler'); an.addEventListener('click',fermerFenetre);
    var bc=add(p,'button','btn btn-primary','Créer la procédure'); fk(bc,'np-go');
    bc.addEventListener('click',function(){
      bc.disabled=true;
      MP.api('POST','/api/procedures',{ ref:ir.value.trim(), objet:io.value.trim(), profil:sp.value })
        .then(function(r){ return MP.refreshProcs().then(function(){ return r.id; }); })
        .then(function(id){ toast('Procédure '+ir.value.trim()+' créée.'); fermerFenetre(); ouvrirProcedure(id,'cdc'); })
        .catch(function(e){ toast(e.message); bc.disabled=false; });
    });
  });
}
