/* Marché+ — Verrouillage après inactivité, et rechargement après une mise à jour de l'application.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.

   Verrouillage : passé le délai fixé dans Paramètres (Organisation, 15 minutes par défaut) sans souris, clavier ni
   toucher, la session est fermée côté serveur (cookie retiré) et l'écran reste en place sous un panneau qui
   demande le mot de passe. Le déverrouillage reconnecte la même personne : l'écran, les fenêtres et les saisies
   en cours sont intacts, les envois en attente partent. L'activité et le verrouillage sont partagés entre les
   onglets (localStorage) ; une page restée ouverte trop longtemps se verrouille dès son rechargement. */
"use strict";

var CLE_ACTIVITE = 'marcheplus.activite', CLE_VERROU = 'marcheplus.verrou';
// pret : l'activité ne compte qu'après le premier contrôle, pour qu'une page restée ouverte trop longtemps se
// verrouille avant que le premier mouvement de souris ne remette le compteur à zéro.
var VERROU = { derniere: 0, ecrite: 0, el: null, echecs: 0, prevenu: false, pret: false };
UI.verrouille = false;

function lireStockage(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function ecrireStockage(k, v){ try{ if(v==null) localStorage.removeItem(k); else localStorage.setItem(k, v); }catch(e){} }
function delaiVerrouillage(){ var m=Number(state && state.org && state.org.verrouillageMinutes) || 15; return m*60000; }
function derniereActivite(){ return Math.max(VERROU.derniere, Number(lireStockage(CLE_ACTIVITE)) || 0) || Date.now(); }
/* Au démarrage de la session : une connexion compte comme activité ; un rechargement contrôle d'abord le délai. */
function demarrerVerrou(depuisConnexion){
  if(depuisConnexion){ VERROU.pret=true; VERROU.ecrite=0; noterActivite(); return; }
  if(VERROU.pret) return;
  VERROU.pret=true;
  verifierVerrou();
}

/* Activité : souris, clavier, toucher, défilement ; écrite au plus toutes les 5 s pour les autres onglets. */
function noterActivite(){
  if(UI.verrouille || !VERROU.pret) return;
  VERROU.derniere=Date.now(); VERROU.prevenu=false;
  if(VERROU.derniere-VERROU.ecrite>5000){ VERROU.ecrite=VERROU.derniere; ecrireStockage(CLE_ACTIVITE, String(VERROU.derniere)); }
}
['mousemove','mousedown','keydown','touchstart','wheel','scroll'].forEach(function(t){ window.addEventListener(t, noterActivite, { passive:true, capture:true }); });

/* Contrôle toutes les 10 s (et au démarrage) : prévenir une minute avant, puis verrouiller. */
function verifierVerrou(){
  if(!state || UI.verrouille || !MP.moi() || !document.getElementById('login').hidden) return;
  var reste = delaiVerrouillage() - (Date.now() - derniereActivite());
  if(reste<=0){ verrouiller(); return; }
  if(reste<=60000 && !VERROU.prevenu){ VERROU.prevenu=true; toast('Sans activité, la session sera verrouillée dans une minute.'); }
}
setInterval(verifierVerrou, 10000);

function verrouiller(depuisAutreOnglet){
  if(UI.verrouille) return;
  UI.verrouille=true;
  MP.suspendre();
  if(!depuisAutreOnglet){
    ecrireStockage(CLE_VERROU, String(Date.now()));
    MP.api('POST','/api/auth/logout',{}).catch(function(){});
  }
  afficherVerrou();
}
function afficherVerrou(){
  var u=MP.moi()||{}, minutes=Math.round(delaiVerrouillage()/60000);
  var ov=el('div','verrou'); ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true'); ov.setAttribute('aria-labelledby','verrou-t');
  var c=add(ov,'form','verrou-carte'); c.noValidate=true;
  var b=add(c,'div','verrou-ic'); icon(b,'lock');
  add(c,'h2',null,'Session verrouillée').id='verrou-t';
  add(c,'p','muted','Après '+minutes+' minutes sans activité, Marché+ a verrouillé votre session. Votre écran et vos saisies sont conservés.');
  var qui=add(c,'div','qui verrou-qui'); avatar(qui,u.nom||'?'); var t=add(qui,'div'); add(t,'strong',null,u.nom||''); add(t,'div','muted',u.email||'');
  var lb=add(c,'label','fen-lab','Mot de passe'); lb.htmlFor='verrou-pw';
  var pw=add(c,'input'); pw.type='password'; pw.id='verrou-pw'; pw.autocomplete='current-password'; fk(pw,'verrou-pw');
  var er=add(c,'div','lg-err'); er.setAttribute('role','alert'); er.hidden=true;
  var ok=add(c,'button','btn btn-primary','Déverrouiller'); ok.type='submit'; fk(ok,'verrou-ok');
  var autre=add(c,'button','verrou-autre','Se connecter avec un autre compte'); autre.type='button'; fk(autre,'verrou-autre');
  c.addEventListener('submit',function(e){
    e.preventDefault();
    if(!pw.value){ pw.focus(); return; }
    ok.disabled=true;
    MP.api('POST','/api/auth/login',{ email:u.email, password:pw.value }).then(function(){
      ecrireStockage(CLE_VERROU, null);
      deverrouiller();
    }).catch(function(err){
      ok.disabled=false; pw.value=''; pw.focus();
      VERROU.echecs++;
      if(VERROU.echecs>=5){ changerDeCompte(); return; }
      er.hidden=false; er.textContent=err.message||'Mot de passe incorrect.';
    });
  });
  autre.addEventListener('click',changerDeCompte);
  document.body.appendChild(ov);
  VERROU.el=ov;
  setTimeout(function(){ pw.focus(); },0);
}
function deverrouiller(){
  if(!UI.verrouille) return;
  UI.verrouille=false; VERROU.echecs=0;
  if(VERROU.el && VERROU.el.parentNode) VERROU.el.parentNode.removeChild(VERROU.el);
  VERROU.el=null;
  VERROU.ecrite=0; noterActivite();
  MP.reprendre();
  flush(); poll(); // envois restés en attente, puis l'état du serveur
}
/* Autre compte (ou trop d'échecs) : retour à la page de connexion. */
function changerDeCompte(){
  ecrireStockage(CLE_VERROU, null);
  try{ history.replaceState(null,'','/'); }catch(e){}
  location.reload();
}
/* Les autres onglets suivent : verrouillés ensemble, déverrouillés ensemble. */
window.addEventListener('storage',function(e){
  if(e.key===CLE_VERROU){ if(e.newValue) verrouiller(true); else deverrouiller(); }
});

/* ============ Mise à jour de l'application ============ */
/* Nouvelle version sur le serveur : rechargement immédiat si rien n'est en cours (pas de fenêtre ouverte, de saisie
   ni d'envoi en attente), sinon un bandeau propose de recharger ; l'adresse ramène au même écran. */
function nouvelleVersion(){
  if(UI.verrouille) return;
  var ae=document.activeElement, saisie = ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && !ae.classList.contains('dt-recherche');
  if(!UI.fenetre && !saisie && !dirty && !flushing && !document.querySelector('.modal-ov')){ location.reload(); return; }
  if(document.getElementById('maj-bandeau')) return;
  var b=el('div','maj-bandeau'); b.id='maj-bandeau'; b.setAttribute('role','status');
  icon(add(b,'span','maj-ic'),'download');
  add(b,'span',null,'Une nouvelle version de Marché+ est disponible.');
  var r=add(b,'button','btn btn-primary btn-sm','Recharger'); r.type='button'; fk(r,'maj-recharger');
  r.addEventListener('click',function(){ flush(); setTimeout(function(){ location.reload(); }, 300); });
  document.body.appendChild(b);
}
