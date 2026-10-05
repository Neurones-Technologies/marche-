/* Marché+ — Écran Procès-verbal.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Le procès-verbal se présente comme un document : une page posée sur une table grise, avec en-tête de
   l'autorité contractante, titre, informations de la procédure, sections numérotées, tableaux et cartouches de
   signature. L'écran n'en montre que le haut ; l'icône ou le bouton « Voir le document complet » l'ouvre en entier dans
   une fenêtre. La barre de la carte porte la référence, l'état, l'impression (document complet) et l'agrandissement. */
"use strict";

function vPV(m){
  if(!allApproved()) return locked(m,"Le procès-verbal est généré une fois les niveaux d'approbation franchis.",'decision',"Aller au circuit d'approbation");
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,"Procès-verbal d'attribution");

  var carte=add(m,'section','card doc-carte'); carte.setAttribute('aria-label','Procès-verbal');
  var barre=add(carte,'div','doc-barre');
  add(barre,'span','doc-barre-lab','Procès-verbal — '+REF());
  chipCellule(barre, state.contractSigned ? 'Marché signé' : 'Attribution prononcée', state.contractSigned ? 'c-green' : 'c-amber');
  boutonIcone(barre,'printer','Imprimer ou enregistrer en PDF',function(){ imprimer(); },'pv-imprimer');

  var voir=boutonIcone(barre,'agrandir','Voir le procès-verbal en entier',ouvrirPV,'pv-voir'); voir.setAttribute('data-consult','');

  // aperçu : le haut du document ; le document entier s'ouvre en fenêtre (l'impression reste complète)
  var scene=add(carte,'div','doc-scene doc-apercu');
  remplirPV(add(scene,'article','pv-doc doc-imprimable'));
  var suite=add(scene,'div','doc-suite');
  var bs=add(suite,'button','btn btn-primary'); bs.type='button'; icon(bs,'agrandir'); bs.appendChild(document.createTextNode('Voir le document complet'));
  fk(bs,'pv-voir-tout'); bs.setAttribute('data-consult',''); bs.addEventListener('click',ouvrirPV);
}

/* Le procès-verbal entier, dans une fenêtre large. */
function ouvrirPV(){
  ouvrirFenetre('Procès-verbal — '+REF(), function(c){
    if(!allApproved()) return false;
    remplirPV(add(add(c,'div','doc-scene'),'article','pv-doc'));
  }, { large:true });
}

/* Contenu du procès-verbal, dans l'élément pv. */
function remplirPV(pv){
  var rows=ranking(), win=rows[0], c=state.cdc, org=state.org||{};

  /* En-tête */
  var et=add(pv,'header','pvd-entete');
  var eg=add(et,'div'); add(eg,'div','pvd-org',org.nom||c.autorite); add(eg,'div',null,[org.ville,org.pays].filter(Boolean).join(' · '));
  var ed=add(et,'div','pvd-ref'); var r1=add(ed,'div'); r1.appendChild(document.createTextNode('Réf. ')); add(r1,'strong',null,REF());
  add(ed,'div',null,'Établi le '+new Date().toLocaleDateString('fr-FR'));

  var ti=add(pv,'div','pvd-titre');
  add(ti,'h2',null,'Procès-verbal d’analyse et d’attribution');
  add(ti,'p',null,c.objet);

  var dl=add(pv,'dl','pvd-meta');
  [['Autorité contractante',c.autorite],['Procédure',c.procedure],['Ouverture des plis',c.ouverture],['Taux arrêtés','1 EUR = 655,957 XOF ; 1 USD = 601,40 XOF']].forEach(function(x){
    var d=add(dl,'div'); add(d,'dt',null,x[0]); add(d,'dd',null,x[1]||'—');
  });

  var n=0;
  function section(titre){ var s=add(pv,'section','pvd-sec'); var h3=add(s,'h3'); add(h3,'span','pvd-n',String(++n)); h3.appendChild(document.createTextNode(titre)); return s; }
  function table(parent, entetes, lignes){
    var t=add(parent,'table','pvd-table'), tr=add(add(t,'thead'),'tr');
    entetes.forEach(function(e){ add(tr,'th',e.num?'num':null,e.lab); });
    var tb=add(t,'tbody');
    lignes.forEach(function(lg){ var r=add(tb,'tr',lg.cls||null); lg.v.forEach(function(v,i){ add(r,'td',entetes[i].num?'num':null,v); }); });
    return t;
  }

  /* 1. Offres reçues */
  var s1=section('Offres reçues et conversion');
  table(s1,[{lab:'Soumissionnaire'},{lab:'Pays'},{lab:'Montant',num:true},{lab:'Contre-valeur',num:true},{lab:'Délai',num:true},{lab:'Statut'}],
    SEED_OFFERS.map(function(o){ return { cls:excluded(o)?'pvd-ecarte':null, v:[o.name,o.pays,sep(o.montant)+' '+o.devise,xof(montantXOF(o)),o.delai+' j',excluded(o)?'Écartée':'Conforme'] }; }));

  /* 2. Conformité */
  var s2=section('Conformité administrative');
  add(s2,'p',null, conformes().length+' offre(s) déclarée(s) conforme(s) sur '+SEED_OFFERS.length+'. Les pièces exigées varient selon que le soumissionnaire est établi en Côte d’Ivoire, dans l’espace UEMOA ou hors zone.');
  var ec=SEED_OFFERS.filter(excluded);
  if(ec.length){ var u0=add(s2,'ul'); ec.forEach(function(o){ var mis=missingDocs(o);
    add(u0,'li',null, o.name+' — '+(mis.length? mis.map(function(d){return d.label;}).join(' ; ') : 'écartée par décision du comité')); }); }

  /* 3. Préférence communautaire */
  add(section('Préférence communautaire'),'p',null, c.prefActive
    ? 'Une marge de préférence de '+c.prefTaux+' % a été appliquée en faveur des soumissionnaires établis dans l’espace UEMOA, aux seules fins de comparaison des offres.'
    : 'Aucune marge de préférence communautaire n’a été appliquée.');

  /* 4. Grille */
  table(section('Grille d’évaluation appliquée'),[{lab:'Critère'},{lab:'Pondération',num:true}],
    state.criteria.map(function(x){ return { v:[x.label, x.weight+' %'] }; }));

  /* 5. Classement */
  table(section('Classement'),[{lab:'Rang',num:true},{lab:'Soumissionnaire'},{lab:'Pays'},{lab:'Note',num:true}],
    rows.map(function(r,i){ return { cls:i===0?'pvd-premier':null, v:[String(i+1), r.o.name, r.o.pays, r.total.toFixed(1)+' / 100'] }; }));

  /* 6. Attribution */
  var s6=section('Attribution proposée');
  add(s6,'p','pvd-encadre','Le marché est proposé à l’attribution en faveur de '+win.o.name+' ('+win.o.pays+'), pour un montant de '+sep(win.o.montant)+' '+win.o.devise+' soit '+xof(montantXOF(win.o))+', et un délai d’exécution de '+win.o.delai+' jours.');
  if(!isUemoa(win.o)) add(s6,'p',null,'L’attributaire n’étant pas établi dans l’espace UEMOA, le marché est soumis à la retenue à la source de '+c.retenueNonResident+' % sur les prestations de source locale ; les droits et taxes à l’importation sont à la charge de : '+c.douaneACharge+'.');

  /* 7. Approbations : cartouches de signature */
  var s7=section('Approbations recueillies');
  var sg=add(s7,'div','pvd-signatures');
  state.approvals.forEach(function(a){
    var b=add(sg,'div','pvd-sign');
    add(b,'strong',null,a.role); add(b,'div','muted',a.who);
    add(b,'div','pvd-sign-etat'+(a.done?'':' non'), a.done ? 'Approuvé'+(a.at?' le '+a.at:'') : 'Non requis pour ce montant');
  });
  (state.rejets||[]).forEach(function(x){
    add(s7,'p',null,'Rejet antérieur au niveau « '+x.role+' », le '+x.at+' — motif : '+x.motif+'. La procédure a été reprise à l’évaluation.').style.marginTop='12px';
  });

  /* 8. Questions, additifs, clarifications */
  add(section('Questions, additifs et clarifications'),'p',null, state.qa.length+' question(s) de candidats traitée(s) · '+state.additifs.length+' additif(s) publié(s) · '+state.clarifs.length+' demande(s) de clarification, sans modification de prix ni de contenu des offres.');

  /* 9. Conflits d'intérêts */
  var s9=section('Déclarations de conflit d’intérêts');
  var dcl=Object.keys(state.coi);
  if(!dcl.length) add(s9,'p',null,'Aucune déclaration enregistrée à ce stade.');
  else { var ud=add(s9,'ul'); dcl.forEach(function(uid){
    var u=null; state.users.forEach(function(x){ if(x.id===uid) u=x; });
    var d=state.coi[uid];
    add(ud,'li',null,(u?u.nom:uid)+' — '+(d.conflit?'conflit déclaré, déport de la notation':'absence de conflit déclarée')+' le '+d.t);
  }); }

  /* 10. Recours */
  var s10=section('Recours');
  if(!state.recours.length) add(s10,'p',null, state.standstill.startedAt? 'Aucun recours déposé dans le délai ouvert.' : 'Délai de recours non encore ouvert à la date du présent procès-verbal.');
  else { var ur=add(s10,'ul'); state.recours.forEach(function(r){
    add(ur,'li',null, r.de+' — '+r.objet+' — '+(r.statut==='ouvert'?'en instruction':(r.statut==='rejete'?'rejeté':'déclaré fondé'))); }); }

  /* 11. Traçabilité */
  add(section('Traçabilité'),'p',null, state.audit.length+' action(s) consignée(s) dans la piste d’audit, dont les confirmations d’extraction, les décisions de conformité et les écarts motivés entre score proposé et score retenu.');

  add(pv,'footer','pvd-pied','Document établi avec Marché+ le '+new Date().toLocaleString('fr-FR')+' — '+REF());
}
