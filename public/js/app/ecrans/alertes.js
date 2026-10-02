/* Marché+ — Écran Règles de notification (Alertes).
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

/* ============ Règles de notification ============ */
function vRegles(m){
  if(!can('notif.manage')) return denyBox(m,'notif.manage');
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Règles de notification');
  add(l,'p','lede',"Pour chaque événement de la procédure : canal de diffusion et rôles destinataires. Un événement sans destinataire ne notifie personne, même si le canal est actif.");

  var rk=Object.keys(state.roles);
  var card=add(m,'div','card');
  var ph=add(card,'div','panel-head');
  add(ph,'span',null,'Matrice des événements');
  var actifs=EVENTS.filter(function(e){var r=state.notifRules[e.id];return r&&(r.inapp||r.email);}).length;
  add(ph,'span','chip '+(actifs?'c-green':'c-grey'), actifs+' / '+EVENTS.length+' événements actifs');
  var b=add(card,'div','pad');
  EVENTS.forEach(function(ev){
    var r=state.notifRules[ev.id]; if(!r) return;
    var row=add(b,'div'); row.style.cssText='padding:14px 0;border-top:1px solid var(--line-2)';
    var t=add(row,'div'); t.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px';
    add(t,'strong',null,ev.lab);
    var bi=add(t,'button','pill'+(r.inapp?' on':''),'Dans l\u2019application');
    bi.setAttribute('aria-pressed', r.inapp?'true':'false'); fk(bi,'ev-in-'+ev.id);
    bi.addEventListener('click',function(){ r.inapp=!r.inapp; logit('Notification interne '+(r.inapp?'activée':'désactivée')+' — '+ev.lab); save(); render(); });
    var be=add(t,'button','pill'+(r.email?' on':''),'Courriel');
    be.setAttribute('aria-pressed', r.email?'true':'false'); fk(be,'ev-em-'+ev.id);
    be.addEventListener('click',function(){ r.email=!r.email; logit('Notification par courriel '+(r.email?'activée':'désactivée')+' — '+ev.lab); save(); render(); });
    if(!r.roles.length) add(t,'span','chip c-amber','Aucun destinataire');
    var rr=add(row,'div'); rr.style.cssText='display:flex;gap:7px;flex-wrap:wrap';
    rk.forEach(function(rid){
      var on=r.roles.indexOf(rid)>=0;
      var p=add(rr,'button','pill'+(on?' on':''), state.roles[rid].lab);
      p.style.cssText+=';font-size:11.5px;min-height:38px';
      p.setAttribute('aria-pressed', on?'true':'false'); fk(p,'ev-r-'+ev.id+'-'+rid);
      p.addEventListener('click',function(){
        if(on) r.roles.splice(r.roles.indexOf(rid),1); else r.roles.push(rid);
        save(); render();
      });
    });
  });

  var nb=add(m,'div','note');
  add(nb,'strong',null,'Un réglage à ne pas prendre à la légère. ');
  nb.appendChild(document.createTextNode("Notifier l'attribution aux soumissionnaires avant la fin du délai de recours, ou diffuser une anomalie de prix hors du cercle d'instruction, expose l'autorité contractante. Le paramétrage par défaut proposé ici est prudent ; toute extension des destinataires devrait être validée par le responsable de la procédure."));
}
