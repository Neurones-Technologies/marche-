/* Marché+ — Écran Notifications.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

/* ============ Notifications (centre) ============ */
function vNotifs(m){
  setTimeout(function(){ if(state.view==='notifs'){ var k=marquerLues(); if(k){ renderNav(); var bn=document.getElementById('bell-n'); if(bn){bn.textContent='';bn.style.cssText='';} } } },1500);
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Notifications');
  var mk=add(h,'button','btn btn-ghost btn-sm','Tout marquer comme lu'); fk(mk,'mk-read');
  mk.addEventListener('click',function(){ var k=marquerLues(); render(); toast(k?k+' notification(s) marquée(s) comme lue(s).':'Aucune notification non lue.'); });

  var mine=notifsPourMoi(), unread=nonLues().length;
  var envoiReel=!!(state.courriels && state.courriels.mode==='microsoft365');
  var st=add(m,'div','stats');
  [['Non lues',String(unread),unread?'var(--amber)':null],
   ['Reçues',String(mine.length),null],
   [envoiReel ? 'Courriels' : 'Courriels simulés',String(state.emails.length),null],
   ['Événements actifs',String(EVENTS.filter(function(e){var r=state.notifRules[e.id];return r&&(r.inapp||r.email);}).length)+' / '+EVENTS.length,null]
  ].forEach(function(x){ var c=add(st,'div','card pad'); add(c,'div','stat-k',x[0]); var v=add(c,'div','stat-v',x[1]); if(x[2]) v.style.color=x[2]; });

  var c1=add(m,'div','card');
  add(c1,'div','panel-head','Fil des notifications');
  var b1=add(c1,'div','pad');
  if(!mine.length) add(b1,'p','muted',"Aucune notification pour ce rôle. Réalisez une action (publier le dossier, déposer une offre, approuver) pour en déclencher.");
  var uid=state.me;
  mine.forEach(function(nn){
    var lu=nn.lu.indexOf(uid)>=0;
    var row=add(b1,'div'); row.style.cssText='display:flex;gap:12px;padding:13px 0;border-top:1px solid var(--line-2);align-items:flex-start';
    var dot=add(row,'span'); dot.setAttribute('aria-hidden','true');
    dot.style.cssText='width:9px;height:9px;border-radius:50%;margin-top:7px;flex:0 0 auto;background:'+(lu?'var(--line)':'var(--teal)');
    var d=add(row,'div'); d.style.flex='1 1 auto';
    var t=add(d,'div'); t.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    add(t,'strong',null,nn.titre);
    add(t,'span','chip c-grey',nn.lab);
    if(!lu) add(t,'span','chip c-teal','Non lue');
    add(d,'div','muted',nn.corps);
    add(d,'div','muted',nn.t+' · destinataires : '+nn.roles.map(roleLab).join(', '));
  });

  var c2=add(m,'div','card'); c2.style.marginTop='18px';
  var ph=add(c2,'div','panel-head');
  add(ph,'span',null,"Boîte d'envoi — courriels");
  add(ph,'span','chip '+(envoiReel?'c-green':'c-amber'), envoiReel ? 'Envoi par Microsoft 365 — '+state.courriels.expediteur : 'Simulation : aucun message n\u2019est réellement expédié');
  var b2=add(c2,'div','pad');
  if(!state.emails.length) add(b2,'p','muted',"Aucun courriel généré pour l'instant.");
  state.emails.slice(0,12).forEach(function(mm){
    var row=add(b2,'div'); row.style.cssText='padding:14px 0;border-top:1px solid var(--line-2)';
    var t=add(row,'div'); t.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    add(t,'strong',null,mm.objet);
    add(t,'span','chip c-grey',mm.t);
    var ST={ 'envoyé':'c-green', 'en cours':'c-amber', 'échec':'c-red', 'simulé':'c-grey', 'sans destinataire':'c-grey' };
    if(mm.statut) add(t,'span','chip '+(ST[mm.statut]||'c-grey'), mm.statut==='échec' && mm.erreur ? 'Échec : '+mm.erreur : mm.statut);
    add(row,'div','muted','De : '+mm.de+' — À : '+(mm.a.join(', ')||'(aucun destinataire pour les rôles visés)'));
    if(mm.noms.length) add(row,'div','muted','Soit : '+mm.noms.join(' · '));
    var pre=add(row,'div',null,mm.corps);
    pre.style.cssText='white-space:pre-line;background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:12px 14px;margin-top:8px;font-size:13px';
  });

  var nb=add(m,'div','note');
  add(nb,'strong',null, envoiReel ? 'Envoi des courriels. ' : 'Ce que ce module simule. ');
  nb.appendChild(document.createTextNode(envoiReel
    ? "Les courriels partent de la boîte "+state.courriels.expediteur+" par Microsoft 365, vers l'adresse réelle des comptes destinataires. Chaque message garde son statut (envoyé, ou échec avec sa cause). Vous ne voyez ici que les courriels qui vous sont adressés, sauf si vous administrez les notifications."
    : "Les notifications internes sont réelles : ciblées par rôle, marquées lues par utilisateur et persistées. L'envoi de courriel est simulé tant que Microsoft 365 n'est pas configuré sur le serveur (MAIL_MODE=graph, voir le README) : les messages sont rendus tels qu'ils partiraient."));
}
