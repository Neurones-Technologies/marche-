/* Marché+ — Écran Alertes (règles de notification).
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Trois chiffres en tête, puis les événements rangés par moment de la procédure : pour chacun, deux interrupteurs
   (dans l'application, par courriel) et ses destinataires ; les destinataires se choisissent dans une fenêtre. */
"use strict";

var ALERTES_GROUPES = [
  { lab:'Publication', ic:'upload', ev:['cdc.publie','question.recue','additif.publie'] },
  { lab:'Offres et dépouillement', ic:'inbox', ev:['depot.recu','verif.requise','anomalie','offre.ecartee','clarif.envoyee','dep.cloture'] },
  { lab:'Évaluation et décision', ic:'scale', ev:['coi.declare','ecart.ia','eval.validee','appro.attendue','attribution','infructueux'] },
  { lab:'Recours', ic:'gavel', ev:['standstill','recours.depose'] }
];

/* ============ Règles de notification ============ */
function vRegles(m){
  if(!can('notif.manage')) return denyBox(m,'notif.manage');
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Alertes');

  var regles=state.notifRules, evs=EVENTS.filter(function(e){ return regles[e.id]; });
  var actifs=evs.filter(function(e){ return regles[e.id].inapp||regles[e.id].email; }).length;
  var mails=evs.filter(function(e){ return regles[e.id].email; }).length;
  var orphelins=evs.filter(function(e){ return (regles[e.id].inapp||regles[e.id].email) && !regles[e.id].roles.length; }).length;

  var res=add(m,'div','acces-resume');
  function chiffre(ic, n, lab, alerte){ var d=add(res,'div','acces-chiffre'+(alerte?' alerte':'')); icon(add(d,'span','acces-ic'),ic); var t=add(d,'div'); add(t,'strong',null,String(n)); add(t,'span',null,' '+lab); }
  chiffre('bell', actifs+' / '+evs.length, 'événements actifs');
  chiffre('chat', mails, 'envoyés par courriel');
  chiffre('users', orphelins, orphelins>1?'sans destinataire':'sans destinataire', orphelins>0);

  var vus={};
  ALERTES_GROUPES.forEach(function(g){ groupe(g.lab, g.ic, g.ev); g.ev.forEach(function(id){ vus[id]=true; }); });
  var autres=evs.filter(function(e){ return !vus[e.id]; }).map(function(e){ return e.id; });
  if(autres.length) groupe('Autres', 'bell', autres);

  function groupe(lab, ic, ids){
    var liste=ids.map(function(id){ return EVENTS.filter(function(e){ return e.id===id; })[0]; }).filter(function(e){ return e && regles[e.id]; });
    if(!liste.length) return;
    var k=add(m,'section','card alertes-groupe');
    var t=add(k,'div','alertes-tete'); icon(add(t,'span','alertes-ic'),ic); add(t,'h2',null,lab);
    var cols=add(t,'div','alertes-cols'); add(cols,'span',null,'Application'); add(cols,'span',null,'Courriel');
    liste.forEach(function(ev){
      var r=regles[ev.id];
      var row=add(k,'div','alerte'+(r.inapp||r.email?'':' eteinte'));
      var info=add(row,'div','alerte-info');
      add(info,'strong',null,ev.lab);
      var dest=add(info,'button','alerte-dest'); dest.type='button'; fk(dest,'ev-dest-'+ev.id);
      if(!r.roles.length){ dest.classList.add('vide'); dest.textContent='Aucun destinataire — choisir'; }
      else dest.textContent=r.roles.map(function(x){ return (state.roles[x]||{}).lab||x; }).join(' · ');
      dest.setAttribute('aria-label','Destinataires de « '+ev.lab+' »');
      dest.addEventListener('click',function(){ destinataires_(ev); });
      interrupteur(row, r.inapp, 'ev-in-'+ev.id, 'Notification dans l’application — '+ev.lab, function(){ r.inapp=!r.inapp; logit('Notification interne '+(r.inapp?'activée':'désactivée')+' — '+ev.lab); save(); render(); });
      interrupteur(row, r.email, 'ev-em-'+ev.id, 'Notification par courriel — '+ev.lab, function(){ r.email=!r.email; logit('Notification par courriel '+(r.email?'activée':'désactivée')+' — '+ev.lab); save(); render(); });
    });
  }
  function interrupteur(parent, on, fkey, lab, action){
    var sw=add(parent,'button','interrupteur'+(on?' on':'')); sw.type='button';
    sw.setAttribute('role','switch'); sw.setAttribute('aria-checked', on?'true':'false'); sw.setAttribute('aria-label',lab); fk(sw,fkey);
    sw.addEventListener('click',action);
    return sw;
  }

  var nb=add(m,'div','note'); nb.style.marginTop='18px';
  add(nb,'strong',null,'Un réglage à ne pas prendre à la légère. ');
  nb.appendChild(document.createTextNode("Notifier l'attribution aux soumissionnaires avant la fin du délai de recours, ou diffuser une anomalie de prix hors du cercle d'instruction, expose l'autorité contractante. Le paramétrage par défaut proposé ici est prudent ; toute extension des destinataires devrait être validée par le responsable de la procédure."));
}

/* Fenêtre des destinataires d'un événement : un interrupteur par rôle. */
function destinataires_(ev){
  ouvrirFenetre('Destinataires — '+ev.lab, function(c){
    var r=state.notifRules[ev.id]; if(!r) return false;
    add(c,'p','muted','Les personnes qui ont ces rôles reçoivent l’alerte, selon les canaux activés.').style.marginBottom='12px';
    var liste=add(c,'div','perm-liste');
    Object.keys(state.roles).forEach(function(rid){
      var on=r.roles.indexOf(rid)>=0, nbm=state.users.filter(function(u){ return u.role===rid; }).length;
      var row=add(liste,'div','perm-ligne');
      var t=add(row,'div'); add(t,'span',null,state.roles[rid].lab); add(t,'div','muted',nbm+' personne'+(nbm>1?'s':''));
      var sw=add(row,'button','interrupteur'+(on?' on':'')); sw.type='button';
      sw.setAttribute('role','switch'); sw.setAttribute('aria-checked', on?'true':'false'); sw.setAttribute('aria-label',state.roles[rid].lab); fk(sw,'ev-r-'+ev.id+'-'+rid);
      sw.addEventListener('click',function(){
        if(on) r.roles.splice(r.roles.indexOf(rid),1); else r.roles.push(rid);
        logit('Destinataires modifiés — '+ev.lab+' : '+state.roles[rid].lab+(on?' retiré':' ajouté'));
        save(); render();
      });
    });
  });
}
