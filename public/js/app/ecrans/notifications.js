/* Marché+ — Notifications : panneau de la cloche, notifications « push », journal des envois.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Pas de page « Notifications » : la cloche de la barre du haut ouvre un panneau déroulant, et une notification
   qui arrive pendant la session s'affiche un instant en bas à droite. L'administration consulte tous les envois
   (application et courriel) avec leur statut dans « Alertes › Journal des envois ». */
"use strict";

/* ============ Panneau de la cloche ============ */
UI.panneauNotifs = null;
function basculerPanneauNotifs(){ if(UI.panneauNotifs) fermerPanneauNotifs(); else ouvrirPanneauNotifs(); }
function ouvrirPanneauNotifs(){
  fermerPanneauNotifs();
  var p=el('div','notif-panneau'); p.setAttribute('role','dialog'); p.setAttribute('aria-label','Notifications');
  document.body.appendChild(p);
  function dehors(e){ if(!p.contains(e.target) && !e.target.closest('#cloche')) fermerPanneauNotifs(); }
  function touche(e){ if(e.key==='Escape'){ fermerPanneauNotifs(); var b=document.getElementById('cloche'); if(b) b.focus(); } }
  document.addEventListener('mousedown',dehors,true); document.addEventListener('keydown',touche,true);
  UI.panneauNotifs={ el:p, dehors:dehors, touche:touche };
  dessinerPanneauNotifs();
  var b=document.getElementById('cloche'); if(b){ b.setAttribute('aria-expanded','true'); b.classList.add('on'); }
  var premier=p.querySelector('button'); if(premier) premier.focus();
}
function fermerPanneauNotifs(){
  var P=UI.panneauNotifs; if(!P) return;
  UI.panneauNotifs=null;
  document.removeEventListener('mousedown',P.dehors,true); document.removeEventListener('keydown',P.touche,true);
  if(P.el.parentNode) P.el.parentNode.removeChild(P.el);
  var b=document.getElementById('cloche'); if(b){ b.setAttribute('aria-expanded','false'); b.classList.remove('on'); }
}
function dessinerPanneauNotifs(){
  var P=UI.panneauNotifs; if(!P) return;
  var p=P.el; p.textContent='';
  var uid=state.me, miennes=notifsPourMoi(), nl=nonLues().length;
  var tete=add(p,'div','notif-tete');
  var tt=add(tete,'div'); add(tt,'strong',null,'Notifications'); add(tt,'span','muted', nl ? ' · '+nl+' non lue'+(nl>1?'s':'') : ' · tout est lu');
  if(nl){ var tl=add(tete,'button','notif-tout','Tout marquer comme lu'); tl.type='button'; fk(tl,'notif-tout-lu');
    tl.addEventListener('click',function(){ marquerLues(); render(); }); }
  var liste=add(p,'div','notif-liste');
  if(!miennes.length){ var v=add(liste,'div','notif-vide'); icon(add(v,'span','notif-vide-ic'),'bell'); add(v,'p',null,'Aucune notification pour le moment.'); return; }
  miennes.slice(0,20).forEach(function(n){
    var lu=n.lu.indexOf(uid)>=0;
    var b=add(liste,'button','notif-item'+(lu?'':' nonlue')); b.type='button'; fk(b,'notif-'+n.id);
    add(b,'span','notif-point').setAttribute('aria-hidden','true');
    var d=add(b,'span','notif-texte');
    add(d,'strong',null,n.titre);
    add(d,'span','notif-corps',n.corps);
    add(d,'span','notif-meta',n.t+' · '+n.lab);
    if(!lu) add(b,'span','sr-only',' — non lue');
    b.addEventListener('click',function(){ if(n.lu.indexOf(uid)<0){ n.lu.push(uid); save(); render(); } });
  });
}

/* ============ Notifications « push » ============ */
/* Identifiants déjà connus de cette session : seules les notifications arrivées ensuite s'affichent en push
   (celles déclenchées par l'utilisateur lui-même sont ajoutées dès leur création, voir notify). */
UI.notifsConnues = null; UI.notifsConnuesDe = null;
function suivreNotifs(){
  if(!state || !state.notifs || !state.me) return;
  var uid=state.me, miennes=notifsPourMoi();
  if(!UI.notifsConnues || UI.notifsConnuesDe!==uid){
    UI.notifsConnues={}; UI.notifsConnuesDe=uid;
    miennes.forEach(function(n){ UI.notifsConnues[n.id]=1; });
    return;
  }
  miennes.slice().reverse().forEach(function(n){
    if(UI.notifsConnues[n.id]) return;
    UI.notifsConnues[n.id]=1;
    if(n.lu.indexOf(uid)<0) pousser(n);
  });
}
function pousser(n){
  var pile=document.getElementById('push-pile');
  if(!pile){ pile=el('div','push-pile'); pile.id='push-pile'; pile.setAttribute('aria-live','polite'); document.body.appendChild(pile); }
  while(pile.children.length>=3) pile.removeChild(pile.firstChild);
  var c=add(pile,'div','push');
  var ic=add(c,'span','push-ic'); icon(ic,'bell');
  var b=add(c,'button','push-texte'); b.type='button';
  add(b,'strong',null,n.titre); add(b,'span',null,n.corps);
  b.addEventListener('click',function(){ retirer(); ouvrirPanneauNotifs(); });
  var x=add(c,'button','push-fermer'); x.type='button'; icon(x,'x'); x.setAttribute('aria-label','Fermer la notification');
  x.addEventListener('click',retirer);
  var minuterie=setTimeout(retirer,7000);
  c.addEventListener('mouseenter',function(){ clearTimeout(minuterie); });
  c.addEventListener('mouseleave',function(){ minuterie=setTimeout(retirer,3000); });
  function retirer(){ clearTimeout(minuterie); c.classList.add('sort'); setTimeout(function(){ if(c.parentNode) c.parentNode.removeChild(c); },200); }
}

/* ============ Journal des envois (administration) ============ */
var STATUTS_ENVOI = { 'envoyé':'c-green', 'simulé':'c-grey', 'en cours':'c-amber', 'échec':'c-red', 'sans destinataire':'c-amber' };
/* « 05/10/2026 14:42:10 » → « 20261005144210 », pour trier. */
function cleDate(t){ var m=/(\d{2})\/(\d{2})\/(\d{4})\D+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(t||'')); return m ? m[3]+m[2]+m[1]+('0'+m[4]).slice(-2)+m[5]+(m[6]||'00') : ''; }

function lignesEnvois(){
  var app=(state.notifs||[]).map(function(n){
    var dest=destinataires(n.roles), lus=n.lu.length, nb=dest.length;
    var statut = !nb ? 'sans destinataire' : (lus>=nb ? 'lue par tous' : (lus ? 'lue par '+lus+' / '+nb : 'remise'));
    return { id:n.id, canal:'Application', t:n.t, ev:n.lab, objet:n.titre, corps:n.corps, statut:statut,
      couleur: !nb ? 'c-amber' : (lus>=nb ? 'c-green' : 'c-grey'), dest:n.roles.map(roleLab).join(', '),
      lecteurs: n.lu.map(function(u){ var x=state.users.filter(function(z){ return z.id===u; })[0]; return x ? x.nom : u; }) };
  });
  var mails=(state.emails||[]).map(function(e){
    var ev=EVENTS.filter(function(x){ return x.id===e.ev; })[0];
    return { id:e.id, canal:'Courriel', t:e.t, ev:ev?ev.lab:(e.ev||'—'), objet:e.objet, corps:e.corps, statut:e.statut||'simulé',
      couleur:STATUTS_ENVOI[e.statut]||'c-grey', dest:(e.noms||[]).join(', ') || (e.a||[]).join(', '), adresses:e.a||[], de:e.de, expedie:e.expedie, erreur:e.erreur };
  });
  return app.concat(mails).sort(function(a,b){ return cleDate(b.t).localeCompare(cleDate(a.t)); });
}

function vEnvois(m){
  if(!can('notif.manage')) return denyBox(m,'notif.manage');
  var h=add(m,'div','head'); add(add(h,'div'),'h1',null,'Alertes');
  var reel=!!(state.courriels && state.courriels.mode==='microsoft365');
  var bd=add(m,'div','journal-chaine '+(reel?'ok':'info'));
  icon(add(bd,'span','journal-ic'),'chat');
  var bt=add(bd,'div');
  add(bt,'strong',null, reel ? 'Courriels envoyés par Microsoft 365' : 'Courriels en simulation');
  add(bt,'div','muted', reel ? 'Expéditeur : '+state.courriels.expediteur+'. Chaque courriel garde son statut : envoyé, ou échec avec sa cause.'
    : 'Microsoft 365 n’est pas encore configuré sur le serveur : les courriels sont préparés tels qu’ils partiraient, sans être expédiés.');

  var L=lignesEnvois(), statuts=[];
  L.forEach(function(l){ var s=l.statut.indexOf('lue par ')===0 && l.statut!=='lue par tous' ? 'lue en partie' : l.statut; if(statuts.indexOf(s)<0) statuts.push(s); });
  tableau(m,{ cle:'envois', lignes:L, vide:'Aucun envoi pour le moment : les notifications apparaissent ici dès qu’un événement en déclenche.',
    colonnes:[
      {lab:'Date', rendu:function(l,td){ add(td,'span','nowrap',l.t); }},
      {lab:'Canal', rendu:function(l,td){ var s=add(td,'span','canal'); icon(s, l.canal==='Courriel'?'chat':'bell'); s.appendChild(document.createTextNode(l.canal)); }},
      {lab:'Événement', val:function(l){ return l.ev; }},
      {lab:'Objet', rendu:function(l,td){ add(td,'div','dt-extrait',l.objet); }},
      {lab:'Destinataires', rendu:function(l,td){ add(td,'div','dt-extrait',l.dest||'—'); }},
      {lab:'Statut', rendu:function(l,td){ chipCellule(td, l.statut.charAt(0).toUpperCase()+l.statut.slice(1), l.couleur); }}
    ],
    recherche:function(l){ return [l.t,l.canal,l.ev,l.objet,l.dest,l.statut].join(' '); },
    filtres:[
      { lab:'Canal', options:[['Application','Application'],['Courriel','Courriel']], test:function(l,v){ return l.canal===v; } },
      { lab:'Statut', options:statuts.map(function(s){ return [s, s.charAt(0).toUpperCase()+s.slice(1)]; }), test:function(l,v){ return v==='lue en partie' ? (l.statut.indexOf('lue par ')===0 && l.statut!=='lue par tous') : l.statut===v; } }
    ],
    actions:function(l,td){ boutonDetail(td,function(){ ouvrirEnvoi(l); },'envoi-'+l.id); }
  });
}

function ouvrirEnvoi(l){
  ouvrirFenetre(l.objet, function(c){
    var ch=add(c,'div','fen-chips'); chipCellule(ch,l.canal,'c-grey'); chipCellule(ch,l.statut.charAt(0).toUpperCase()+l.statut.slice(1),l.couleur);
    grilleLecture(c,[['Date',l.t],['Événement',l.ev],['Expéditeur',l.de],['Expédié le',l.expedie]]);
    champLecture(c,'Destinataires',l.dest||'Aucun');
    if(l.adresses && l.adresses.length) champLecture(c,'Adresses',l.adresses.join(', '));
    if(l.lecteurs) champLecture(c,'Lue par',l.lecteurs.length ? l.lecteurs.join(', ') : 'Personne pour l’instant');
    if(l.erreur) champLecture(c,'Cause de l’échec',l.erreur);
    var corps=champLecture(c,'Message',l.corps); corps.classList.add('envoi-corps');
  }, { large:false });
}
