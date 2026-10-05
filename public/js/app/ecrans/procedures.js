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
UI.procedureNouvelle = false;
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
      {lab:'Référence', rendu:function(p,td){ add(td,'strong',null,p.ref); if(p.id===MP.pid()) add(td,'span','chip c-teal','Ouverte').style.marginLeft='6px'; }},
      {lab:'Objet', val:function(p){ return p.objet||''; }},
      {lab:'Type', val:function(p){ return p.type||'—'; }},
      {lab:'Publiée le', val:function(p){ return p.publieeLe ? String(p.publieeLe).split(' ')[0] : '—'; }}
    ];
    if(interne) colonnes=colonnes.concat([
      {lab:'Offres', num:true, val:function(p){ return p.offres; }},
      {lab:'Titulaire', val:function(p){ return p.titulaire||'—'; }},
      {lab:'Montant attribué', num:true, val:function(p){ return p.montantAttribue ? xof(p.montantAttribue) : '—'; }},
      {lab:'Commandes', num:true, val:function(p){ return p.commandes && p.commandes.emises ? p.commandes.emises+' — '+xof(p.commandes.montant) : '—'; }}
    ]);
    colonnes.push({lab:'Phase', rendu:function(p,td){ chipCellule(td, p.phase.lab, COUL[p.phase.id]); }});
    tableau(zone,{ cle:'procedures', titre:'Appels d\u2019offres', lignes:list, colonnes:colonnes,
      vide: can('cdc.edit') ? 'Aucune procédure : utilisez « Nouvelle procédure », ou partez d\u2019un besoin validé.' : 'Aucun appel d\u2019offres n\u2019est ouvert pour le moment.',
      recherche:function(p){ return [p.ref, p.objet, p.titulaire, p.besoin && p.besoin.service, p.besoin && p.besoin.id].join(' '); },
      filtres:[
        { lab:'Phase', options:Object.keys(phases).sort(function(a,b){ return phases[a].rang-phases[b].rang; }).map(function(id){ return [id, phases[id].lab]; }), test:function(p,v){ return p.phase.id===v; } },
        { lab:'Année', options:annees.map(function(a){ return [a,a]; }), test:function(p,v){ return String(p.publieeLe||p.creee||'').indexOf(v)>=0; } }
      ],
      nouveau: can('cdc.edit') ? { lab:'Nouvelle procédure', action:function(){ UI.procedureNouvelle=true; render(); } } : null,
      actions:function(p,td){
        if(p.id!==MP.pid()) boutonCellule(td,'Ouvrir',function(){ MP.refreshProcs().then(function(){ ouvrirProcedure(p.id, can('offres.read')||can('cdc.edit') ? 'dashboard' : 'portail'); }); },'proc-open-'+p.id);
        if(can('params.edit')) boutonCellule(td, p.archive?'Désarchiver':'Archiver', function(){ archiver(p); }, 'proc-arch-'+p.id);
      }
    });
  }

  if(!can('cdc.edit') || !UI.procedureNouvelle) return;
  var k3=add(m,'div','card'); k3.style.marginTop='18px';
  add(k3,'div','panel-head','Nouvelle procédure');
  var b3=add(k3,'div','pad');
  var f=add(b3,'div','frm');
  function champ(lab,id,type){
    var w=add(f,'div'); add(w,'label',null,lab).setAttribute('for',id);
    var i=add(w,type==='textarea'?'textarea':'input'); i.id=id; fk(i,id);
    if(type==='textarea'){ i.rows=2; w.style.gridColumn='1/-1'; } else i.type='text';
    return i;
  }
  var ir=champ('Référence','np-ref'); ir.maxLength=40; ir.placeholder='AO-2026-020';
  var io=champ('Objet du marché','np-objet','textarea'); io.maxLength=500;
  var w=add(f,'div'); add(w,'label',null,'Profil réglementaire').setAttribute('for','np-profil');
  var sp=add(w,'select'); sp.id='np-profil'; fk(sp,'np-profil');
  Object.keys(MPProfils.PROFILS).forEach(function(id){ var op=add(sp,'option',null,MPProfils.PROFILS[id].lab); op.value=id; });
  sp.value=(state.org && state.org.profilDefaut) || MPProfils.DEFAUT;
  var foot=add(k3,'div','panel-foot');
  add(foot,'span','muted','Le dossier part du cahier des charges modèle, de la grille de critères par défaut et du circuit d’approbation par défaut. Il reste à compléter avant publication.');
  var an=add(foot,'button','btn btn-ghost','Annuler'); fk(an,'np-annuler'); an.addEventListener('click',function(){ UI.procedureNouvelle=false; render(); });
  var bc=add(foot,'button','btn btn-primary','Créer la procédure'); fk(bc,'np-go');
  bc.addEventListener('click',function(){
    bc.disabled=true;
    MP.api('POST','/api/procedures',{ ref:ir.value.trim(), objet:io.value.trim(), profil:sp.value })
      .then(function(r){ return MP.refreshProcs().then(function(){ return r.id; }); })
      .then(function(id){ toast('Procédure '+ir.value.trim()+' créée.'); UI.procedureNouvelle=false; ouvrirProcedure(id,'cdc'); })
      .catch(function(e){ toast(e.message); bc.disabled=false; });
  });
}
