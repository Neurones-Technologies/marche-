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
UI.filtreAO = { phase:'', annee:'', q:'' };
/* Registre des appels d'offres : toutes les procédures visibles, passées et en cours, avec leur phase, le titulaire
   et le montant attribués, le besoin d'origine et les commandes ; filtres par phase, année et recherche. */
function vProcedures(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'div','eyebrow','Registre');
  add(l,'h1',null,'Appels d\u2019offres');
  add(l,'p','lede', can('offres.read')
    ? "Toutes les procédures de l\u2019organisation, en cours et passées. Ouvrez une procédure pour travailler dessus : ses écrans apparaissent dans le menu, sous « Procédure »."
    : "Les appels d\u2019offres publiés auxquels vous pouvez répondre.");
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
    var f=UI.filtreAO;
    var annees=[]; list.forEach(function(p){ var a=String(p.publieeLe||p.creee||'').match(/(\d{4})/); if(a && annees.indexOf(a[1])<0) annees.push(a[1]); });
    annees.sort().reverse();
    var k=add(zone,'div','card');
    var ph=add(k,'div','panel-head'); add(ph,'span',null,'Procédures');
    var filtres=add(ph,'div'); filtres.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
    var q=add(filtres,'input'); q.type='search'; q.placeholder='Référence, objet, titulaire…'; q.value=f.q; q.setAttribute('aria-label','Rechercher une procédure'); fk(q,'ao-q');
    var sp=add(filtres,'select'); sp.setAttribute('aria-label','Filtrer par phase'); fk(sp,'ao-phase');
    add(sp,'option',null,'Toutes les phases').value='';
    var phases={}; list.forEach(function(p){ phases[p.phase.id]=p.phase; });
    Object.keys(phases).sort(function(a,b){ return phases[a].rang-phases[b].rang; }).forEach(function(id){ var n=list.filter(function(p){ return p.phase.id===id; }).length; add(sp,'option',null,phases[id].lab+' ('+n+')').value=id; });
    sp.value=f.phase;
    var sa=add(filtres,'select'); sa.setAttribute('aria-label','Filtrer par année'); fk(sa,'ao-annee');
    add(sa,'option',null,'Toutes les années').value='';
    annees.forEach(function(a){ add(sa,'option',null,a).value=a; });
    sa.value=f.annee;
    var corps=add(k,'div','pad');
    function remplir(){
      corps.textContent='';
      var t=f.q.trim().toLowerCase();
      var vis=list.filter(function(p){
        if(f.phase && p.phase.id!==f.phase) return false;
        if(f.annee && String(p.publieeLe||p.creee||'').indexOf(f.annee)<0) return false;
        return !t || [p.ref,p.objet,p.titulaire,p.besoin&&p.besoin.service].join(' ').toLowerCase().indexOf(t)>=0;
      });
      if(!vis.length){ vide(corps,'📁','Aucune procédure', list.length ? 'Aucune procédure ne correspond aux filtres.' : (can('cdc.edit') ? 'Créez la première ci-dessous, ou à partir d\u2019un besoin validé.' : 'Aucun appel d\u2019offres n\u2019est ouvert pour le moment.')); return; }
      vis.forEach(function(p){
        var row=add(corps,'div','docline');
        var lf=add(row,'div'); lf.style.flex='1 1 320px';
        var tt=add(lf,'div'); add(tt,'strong',null,p.ref+' — '+(p.objet||''));
        if(p.id===MP.pid()) add(tt,'span','chip c-teal','Ouverte').style.marginLeft='8px';
        add(lf,'div','muted',[p.type, p.profil, p.publieeLe ? 'publiée le '+p.publieeLe : 'non publiée'].filter(Boolean).join(' · '));
        if('offres' in p){
          var det=[p.offres+' offre(s)'];
          if(p.titulaire) det.push('attribuée à '+p.titulaire+' pour '+xof(p.montantAttribue));
          else if(p.budgetEstime) det.push('budget estimé '+xof(p.budgetEstime));
          if(p.besoin) det.push('besoin '+p.besoin.id+(p.besoin.service?' ('+p.besoin.service+')':''));
          if(p.commandes && p.commandes.nb) det.push(p.commandes.emises+' commande(s) émise(s) — '+xof(p.commandes.montant));
          add(lf,'div','muted',det.join(' · '));
        }
        add(row,'span','chip '+(COUL[p.phase.id]||'c-grey'),p.phase.lab);
        if(p.id!==MP.pid()){
          var bo=add(row,'button','btn btn-ghost btn-sm','Ouvrir'); fk(bo,'proc-open-'+p.id);
          bo.addEventListener('click',function(){ MP.refreshProcs().then(function(){ ouvrirProcedure(p.id, can('offres.read')||can('cdc.edit') ? 'dashboard' : 'portail'); }); });
        }
        if(can('params.edit')){
          var ba=add(row,'button','btn btn-ghost btn-sm',p.archive?'Désarchiver':'Archiver'); fk(ba,'proc-arch-'+p.id);
          ba.addEventListener('click',function(){ archiver(p); });
        }
      });
    }
    q.addEventListener('input',function(){ f.q=q.value; remplir(); });
    sp.addEventListener('change',function(){ f.phase=sp.value; remplir(); });
    sa.addEventListener('change',function(){ f.annee=sa.value; remplir(); });
    remplir();
  }

  if(!can('cdc.edit')) return;
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
  var bc=add(foot,'button','btn btn-primary','Créer la procédure'); fk(bc,'np-go');
  bc.addEventListener('click',function(){
    bc.disabled=true;
    MP.api('POST','/api/procedures',{ ref:ir.value.trim(), objet:io.value.trim(), profil:sp.value })
      .then(function(r){ return MP.refreshProcs().then(function(){ return r.id; }); })
      .then(function(id){ toast('Procédure '+ir.value.trim()+' créée.'); ouvrirProcedure(id,'cdc'); })
      .catch(function(e){ toast(e.message); bc.disabled=false; });
  });
}
