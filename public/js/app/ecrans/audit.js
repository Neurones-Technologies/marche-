/* Marché+ — Écran Journal d’audit.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

function vAudit(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,"Piste d'audit");
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
  tableau(m,{ cle:'audit', titre:'Journal', lignes:state.audit, vide:'Aucune action enregistrée.',
    colonnes:[
      {lab:'Date', val:function(e){ return e.t; }},
      {lab:'Action', val:function(e){ return e.a; }},
      {lab:'Auteur', val:function(e){ return e.who; }}
    ],
    recherche:function(e){ return e.t+' '+e.a+' '+e.who; }
  });
}
