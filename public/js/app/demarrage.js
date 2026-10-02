/* Marché+ — Démarrage : table des écrans, rendu, événements globaux, point d’entrée window.MarchePlus. Chargé en dernier.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

var ROUTER={dashboard:vDashboard, notifs:vNotifs, procedures:vProcedures, besoins:vBesoins, referencement:vReferencement, partenaires:vPartenaires, commandes:vCommandes, roles:vRoles, comptes:vComptes, qa:vQA, clarifs:vClarifs, recours:vRecours, params:vParams, regles:vRegles, cdc:vCDC, dao:vDAO, criteres:vCriteres, portail:vPortail, reception:vReception,
  depouille:vDepouille, conformite:vConformite, evaluation:vEvaluation, decision:vDecision, pv:vPV, audit:vAudit};

/* Les écrans d'administration concernent l'organisation, pas la procédure : pas de pastille de phase. */
function isAdminView(id){ return VIEWS.some(function(v){ return v.id===id && v.grp==='Administration'; }); }
/* Sélecteur de la procédure courante, en tête du menu. Les procédures archivées n'y figurent que si l'une est ouverte. */
function renderProcSel(){
  var box=document.getElementById('side-proc'); box.textContent='';
  var list=MP.procs().filter(function(p){ return !p.archive || p.id===MP.pid(); });
  if(!list.length){ add(box,'div','navgrp','Aucune procédure ouverte'); return; }
  add(box,'label','navgrp','Procédure').setAttribute('for','proc-sel');
  var s=add(box,'select'); s.id='proc-sel';
  list.forEach(function(p){ var o=add(s,'option',null,p.ref+(p.archive?' (archivée)':'')+' — '+(p.objet||'')); o.value=p.id; });
  s.value=MP.pid();
  s.addEventListener('change',function(){ ouvrirProcedure(s.value); });
}
/* Ouvre une autre procédure : les saisies en attente partent d'abord, l'écran courant est conservé s'il existe. */
function ouvrirProcedure(id, vue){
  if(id===MP.pid()){ if(vue) go(vue); return; }
  if(flushTimer) clearTimeout(flushTimer);
  var v=vue||state.view;
  Promise.resolve(flush()).then(function(){ return MP.switchTo(id); }).then(function(){ if(viewAllowed(v)) go(v); closeMenu(); })
    .catch(function(e){ toast(e.message||'Procédure inaccessible.'); });
}
function renderHeader(){
  var org=state.org||{};
  var t=document.getElementById('tenant'); t.textContent='';
  add(t,'b',null,org.nom||'');
  t.appendChild(document.createTextNode([org.ville, org.pays].filter(Boolean).join(' · ')));
}
function render(){
  var ae=document.activeElement;
  var prevFk = ae && ae.getAttribute ? ae.getAttribute('data-fk') : null;
  var caret = (ae && (ae.tagName==='INPUT'||ae.tagName==='TEXTAREA') && ae.selectionStart!=null) ? ae.selectionStart : null;
  var sy = window.scrollY;

  renderNav();
  renderProcSel();
  renderHeader();
  var chip=document.getElementById('phase-chip');
  if(avecProcedure()){ var ph=phase(); chip.textContent=ph.k; chip.className='chip '+ph.c; }
  chip.style.display = !avecProcedure() || isAdminView(state.view) ? 'none' : '';
  if(!viewAllowed(state.view)) state.view=homeView();
  var lbl=null;
  for(var i=0;i<VIEWS.length;i++) if(VIEWS[i].id===state.view) lbl=VIEWS[i].label;
  document.title = (lbl? lbl+' — ' : '')+'Marché+';
  var m=document.getElementById('main'); m.textContent='';
  var cur=MP.current();
  if(cur && cur.archive && !isAdminView(state.view) && state.view!=='procedures'){
    var na=add(m,'div','note'); add(na,'strong',null,'Procédure archivée. ');
    na.appendChild(document.createTextNode('Elle se consulte mais ne se modifie plus.'));
  }
  (ROUTER[state.view]||vDashboard)(m);

  if(prevFk){
    var t=document.querySelector('[data-fk="'+prevFk+'"]');
    if(t){
      t.focus();
      if(caret!=null && t.setSelectionRange){ try{ t.setSelectionRange(caret,caret); }catch(e){} }
      window.scrollTo(0,sy);
    }
  }
}
document.getElementById('burger').addEventListener('click',function(){
  var sd=document.getElementById('side');
  if(sd.classList.contains('open')) closeMenu(); else openMenu();
});
document.getElementById('backdrop').addEventListener('click',closeMenu);
document.addEventListener('keydown',function(e){
  if(e.key==='Escape') closeMenu();
});
var resetBtn=document.getElementById('btn-reset-all');
resetBtn.addEventListener('click',function(){
  ask("Toutes les saisies, les offres déposées, les décisions et la piste d'audit seront effacées. Cette action est irréversible.", function(){
    // la démonstration ne compte plus que la procédure p1 : on la rouvre
    MP.api('POST','/api/admin/reset',{}).then(function(){ return MP.refreshProcs(); }).then(function(){ return MP.switchTo('p1',{fromLogin:true}); }).then(function(){
      toast('Démonstration réinitialisée.');
    }).catch(function(e){ toast(e.message||'Réinitialisation impossible.'); });
  }, 'Réinitialiser la démonstration ?', 'Tout effacer');
});
window.MarchePlus = {
  start:function(p, opts){
    PIECES_OK=false; state=null; synced={}; applyServer(p,false);
    // Après une connexion, on part de l'accueil du rôle ; après un rechargement, on reprend l'écran mémorisé,
    // à condition qu'il figure encore dans le menu de ce rôle (le rôle a pu changer entre-temps).
    if((opts && opts.fromLogin) || !viewAllowed(state.view)){ state.view=homeView(); state.offerIndex=0; saveUI(); }
    resetBtn.style.display = can('params.edit')||can('roles.edit') ? '' : 'none'; render();
  },
  poll:poll,
  /* Aucune procédure visible (soumissionnaire sans appel d'offres publié) : rien à afficher qu'un message. */
  none:function(user){
    state=null; synced={};
    document.getElementById('navs').textContent=''; document.getElementById('side-proc').textContent='';
    document.getElementById('phase-chip').style.display='none';
    resetBtn.style.display='none';
    var m=document.getElementById('main'); m.textContent='';
    var c=add(m,'div','card empty');
    add(c,'h2',null,'Aucun appel d’offres ouvert');
    add(c,'p','muted', user && user.role==='soum' ? 'Aucune procédure n’est publiée pour le moment. Les appels d’offres apparaîtront ici dès leur publication.' : 'Aucune procédure n’est encore créée sur cette instance.');
  },
  stop:function(){ if(flushTimer) clearTimeout(flushTimer); state=null; synced={}; dirty=false; }
};
