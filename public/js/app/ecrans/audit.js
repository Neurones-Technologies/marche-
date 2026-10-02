/* Marché+ — Écran Journal d’audit.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

function vAudit(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,"Piste d'audit");
  add(l,'p','lede',"Journal horodaté de toutes les actions de la procédure. C'est cette trace qui permet de démontrer, en cas de recours devant l'organe de régulation, que chaque score retenu a été validé ou corrigé par une personne identifiée.");
  var vb=add(m,'div'); vb.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px';
  var vbtn=add(vb,'button','btn btn-ghost btn-sm',"Vérifier l'intégrité du journal");
  var vres=add(vb,'span','chip c-grey','Non vérifié'); vres.setAttribute('role','status');
  vbtn.addEventListener('click',function(){
    vbtn.disabled=true;
    MP.api('GET','/api/audit/verify').then(function(r){
      vres.className='chip '+(r.ok?'c-green':'c-red');
      vres.textContent=r.ok ? 'Intact — '+r.entries+' entrée(s) chaînée(s), empreinte '+r.head.slice(0,12)+'…' : 'ALTÉRÉ à l’entrée n° '+r.brokenAt;
    }).catch(function(e){ vres.className='chip c-red'; vres.textContent=e.message; }).then(function(){ vbtn.disabled=false; });
  });
  var card=add(m,'div','card');
  add(card,'div','panel-head','Journal — '+state.audit.length+' entrée(s)');
  var b=add(card,'div','pad');
  if(!state.audit.length) add(b,'p','muted','Aucune action enregistrée. Modifiez le cahier des charges, confirmez un champ ou ajustez un score pour alimenter le journal.');
  state.audit.forEach(function(e){
    var row=add(b,'div','log');
    add(row,'time',null,e.t);
    var d=add(row,'div'); d.style.flex='1 1 240px';
    add(d,'div',null,e.a); add(d,'div','muted',e.who);
  });
}
