/* Marché+ — Adresses des écrans.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Chaque écran a son adresse : /demandes-achat, /execution/<commande>, /appels-offres/<procédure>/cahier-des-charges…
   L'adresse suit la navigation (render appelle majUrl) ; Précédent et Suivant du navigateur la rejouent ; ouverte
   directement (lien copié, rechargement, après la connexion), elle mène au bon écran si le rôle y a accès.
   Le serveur renvoie la même page pour toute adresse sans extension hors /api (server/index.js). */
"use strict";

var ROUTES_VUES = { accueil:'tableau-de-bord', besoins:'demandes-achat', procedures:'appels-offres', commandes:'execution',
  partenaires:'partenaires', referencement:'mon-referencement', comptes:'utilisateurs', roles:'utilisateurs/roles',
  suppleances:'utilisateurs/suppleances', journal:'audit', params:'parametres', regles:'alertes', envois:'alertes/envois' };
var ROUTES_PROCEDURE = { dashboard:'vue-ensemble', cdc:'cahier-des-charges', prestataires:'prestataires', dao:'dao', criteres:'criteres', qa:'questions',
  reception:'reception', depouille:'depouillement', conformite:'conformite', clarifs:'clarifications', evaluation:'evaluation',
  decision:'decision', recours:'cloture', pv:'proces-verbal', audit:'journal', portail:'depot' };
/* Écrans qui affichent un élément sous leur liste : l'élément entre dans l'adresse. */
var DETAILS = { besoins:'besoin', commandes:'commande', partenaires:'partenaire' };

function cleDe(table, valeur){ for(var k in table) if(table[k]===valeur) return k; return null; }

/** Adresse de l'écran affiché. */
function cheminCourant(){
  var v=state.view;
  if(vueDeProcedure(v)) return '/appels-offres/'+encodeURIComponent(MP.pid()||'')+'/'+(ROUTES_PROCEDURE[v]||v);
  var base='/'+(ROUTES_VUES[v]||v), d=DETAILS[v] && UI[DETAILS[v]];
  return d ? base+'/'+encodeURIComponent(d) : base;
}
/** Écran désigné par une adresse : { vue, pid?, detail? }, ou null si elle n'en désigne aucun. */
function lireChemin(chemin){
  var seg=String(chemin||'').replace(/^\/+|\/+$/g,'').split('/').filter(Boolean).map(function(s){ try{ return decodeURIComponent(s); }catch(e){ return s; } });
  if(!seg.length) return null;
  if(seg[0]==='appels-offres' && seg.length===3){ var vp=cleDe(ROUTES_PROCEDURE, seg[2]); return vp ? { vue:vp, pid:seg[1] } : null; }
  if(seg.length===2){ var v2=cleDe(ROUTES_VUES, seg.join('/')); if(v2) return { vue:v2 }; }
  var v1=cleDe(ROUTES_VUES, seg[0]);
  if(!v1 || seg.length>2 || (seg.length===2 && !DETAILS[v1])) return null;
  return { vue:v1, detail: seg[1]||null };
}
/** Pose l'élément affiché sous la liste (ou l'enlève) selon l'adresse. */
function poserDetail(r){ if(DETAILS[r.vue]) UI[DETAILS[r.vue]] = r.detail || null; }

/* Adresse en accord avec l'écran : nouvelle entrée d'historique après une navigation, remplacement sinon
   (premier affichage, Précédent/Suivant, écran refusé). */
UI.remplacerUrl = true;
function majUrl(){
  if(!state || !state.view || !window.history || !history.pushState) return;
  var c=cheminCourant();
  if(location.pathname!==c){ if(UI.remplacerUrl) history.replaceState(null,'',c); else history.pushState(null,'',c); }
  UI.remplacerUrl=false;
}
window.addEventListener('popstate',function(){
  if(!state) return;
  var r=lireChemin(location.pathname);
  UI.remplacerUrl=true;
  if(!r){ go(homeView()); return; }
  poserDetail(r);
  if(r.pid && r.pid!==MP.pid()){
    if(MP.procs().some(function(p){ return p.id===r.pid; })) ouvrirProcedure(r.pid, r.vue); else go(homeView());
    return;
  }
  go(viewAllowed(r.vue) ? r.vue : homeView());
});
