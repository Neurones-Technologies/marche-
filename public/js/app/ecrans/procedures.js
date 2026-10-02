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
function vProcedures(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Procédures');
  add(l,'p','lede', can('offres.read')
    ? "Chaque procédure a son dossier, ses offres, son évaluation et son journal. Les paramètres, les rôles et les comptes sont communs à toute l’organisation."
    : "Les appels d’offres publiés auxquels vous pouvez répondre.");

  var list=MP.procs();
  var actives=list.filter(function(p){ return !p.archive; }), archivees=list.filter(function(p){ return p.archive; });
  function ligne(parent,p){
    var row=add(parent,'div','docline');
    var lf=add(row,'div'); lf.style.flex='1 1 280px';
    var t=add(lf,'div'); add(t,'strong',null,p.ref);
    if(p.id===MP.pid()) add(t,'span','chip c-teal','Ouverte').style.marginLeft='8px';
    add(lf,'div','muted',p.objet||'');
    var st=statutProcedure(p); add(row,'span','chip '+st[1],st[0]);
    if(p.id!==MP.pid()){
      var bo=add(row,'button','btn btn-ghost btn-sm','Ouvrir'); fk(bo,'proc-open-'+p.id);
      bo.addEventListener('click',function(){ ouvrirProcedure(p.id,'dashboard'); });
    }
    if(can('params.edit')){
      var ba=add(row,'button','btn btn-ghost btn-sm',p.archive?'Désarchiver':'Archiver'); fk(ba,'proc-arch-'+p.id);
      ba.addEventListener('click',function(){
        var faire=function(){
          MP.api('PATCH','/api/procedures/'+encodeURIComponent(p.id),{archive:!p.archive})
            .then(function(){ return MP.refreshProcs(); }).then(function(){ toast('Procédure '+p.ref+(p.archive?' désarchivée.':' archivée.')); render(); })
            .catch(function(e){ toast(e.message); });
        };
        if(p.archive) faire();
        else ask("Une procédure archivée se consulte toujours, mais plus rien ne peut y être modifié. Elle disparaît de la liste des soumissionnaires.", faire, 'Archiver '+p.ref+' ?', 'Archiver');
      });
    }
  }
  var k1=add(m,'div','card');
  var ph=add(k1,'div','panel-head'); add(ph,'span',null,'En cours');
  add(ph,'span','chip c-grey',actives.length+' procédure(s)');
  var b1=add(k1,'div','pad');
  if(!actives.length) vide(b1,'📁','Aucune procédure en cours', can('cdc.edit') ? 'Créez la première ci-dessous.' : 'Aucun appel d’offres n’est ouvert pour le moment.');
  actives.forEach(function(p){ ligne(b1,p); });
  if(archivees.length){
    var k2=add(m,'div','card'); k2.style.marginTop='18px';
    add(k2,'div','panel-head','Archivées');
    var b2=add(k2,'div','pad');
    archivees.forEach(function(p){ ligne(b2,p); });
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
