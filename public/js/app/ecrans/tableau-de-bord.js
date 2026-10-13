/* Marché+ — Écran Tableau de bord.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

/* ============ Vues ============ */
/* Vue d'ensemble de la procédure ouverte (l'accueil de l'organisation est l'écran « Tableau de bord »).
   De haut en bas : l'objet et la phase, la prochaine étape, quatre chiffres, puis les offres reçues à gauche et le parcours
   daté de la procédure à droite. */
function vDashboard(m){
  var c=state.cdc, conduit=state.cdc.cdcPublie ? can('offres.read') : can('cdc.edit');
  var ouvert=depouillementOuvert();
  var h=add(m,'div','head ov-tete'); var l=add(h,'div');
  add(l,'h1',null,'Vue d’ensemble — '+REF());
  if(c.objet) add(l,'p','muted ov-objet',c.objet);
  var phase = state.contractSigned ? ['Marché signé','c-green'] : allApproved() ? ['Attribuée','c-green'] : state.evalDone ? ['En approbation','c-amber']
    : state.depClosed ? ['En évaluation','c-amber'] : ouvert ? ['Dépouillement en cours','c-amber'] : c.cdcPublie ? ['Dépôt des offres ouvert','c-teal'] : ['En préparation','c-grey'];
  chipCellule(h, phase[0], phase[1]);
  if(!avecCadreProcedure()) frise(m); // sinon, la frise des étapes du cadre suffit

  /* Prochaine étape : une seule, avec son bouton pour qui conduit la procédure */
  var nb=SEED_OFFERS.length, dateLim=c.ouverture ? dateLongue(c.ouverture)+' à 10 h 00' : null;
  var guide;
  if(!c.cdcPublie) guide={ icon:'file', titre:conduit?'Prochaine étape : finaliser et publier le cahier des charges':'Le cahier des charges est en préparation',
    texte:'Le dossier n’est pas encore publié : les soumissionnaires ne le voient pas.', action:conduit?'Ouvrir le cahier des charges':null, vue:'cdc' };
  else if(!ouvert) guide={ icon:'inbox', titre:'Dépôt des offres en cours', texte:nb+' offre'+(nb>1?'s':'')+' reçue'+(nb>1?'s':'')+'. Le dépouillement s’ouvre à la date limite'+(dateLim?' ('+dateLim+')':'')+(can('depouille.open')?', ou dès que vous l’ouvrez à la main depuis la réception des offres.':'.'),
    action:viewAllowed('reception')?'Voir les offres reçues':null, vue:'reception' };
  else if(!state.depClosed) guide={ icon:'check', titre:conduit?'Prochaine étape : dépouiller les offres':'Dépouillement en cours', texte:flagsRemaining()>0 ? flagsRemaining()+' valeur(s) lue(s) à vérifier avant la clôture.' : 'Tout est vérifié : le dépouillement peut être clôturé.',
    action:viewAllowed('depouille')?'Reprendre le dépouillement':null, vue:'depouille' };
  else if(!state.evalDone) guide={ icon:'scale', titre:conduit?'Prochaine étape : évaluer les offres':'Évaluation en cours', texte:'Les offres conformes sont notées, puis l’évaluation est validée.', action:viewAllowed('evaluation')?'Ouvrir l’évaluation':null, vue:'evaluation' };
  else if(!allApproved()) guide={ icon:'stamp', titre:'Approbations attendues', texte:'L’attribution attend les approbations du circuit de décision.', action:viewAllowed('decision')?'Ouvrir la décision':null, vue:'decision' };
  else if(!state.contractSigned) guide={ icon:'gavel', titre:'Attribution prononcée', texte:'Reste la notification aux soumissionnaires, le délai de recours puis la signature du marché.', action:viewAllowed('recours')?'Notification et signature':null, vue:'recours' };
  else guide={ ok:true, titre:'Procédure terminée', texte:'Le marché est signé.' };
  var gc=guideCard(m,{ icon:guide.icon, ok:guide.ok, titre:guide.titre, texte:guide.texte, action:guide.action, go:function(){ go(guide.vue); } });
  gc.setAttribute('data-consult','');

  /* Quatre chiffres */
  var st=add(m,'div','stats');
  [['Offres reçues',String(nb),null],
   ['Champs à vérifier',String(flagsRemaining()),flagsRemaining()>0?'var(--amber)':null],
   ['Offres conformes',conformes().length+' / '+nb,null],
   ['Anomalies',String(anomalies().length),anomalies().length?'var(--red)':null]
  ].forEach(function(x){
    var k=add(st,'div','card pad'); add(k,'div','stat-k',x[0]);
    var v=add(k,'div','stat-v',x[1]); if(x[2]) v.style.color=x[2];
  });

  var g=add(m,'div','ov-grille');

  /* Offres reçues */
  var c1=add(g,'div','card');
  var ph=add(c1,'div','panel-head'); add(ph,'span',null,'Offres reçues');
  var pivot=(state.org&&state.org.devisePivot)||'XOF', fr=function(n){ return Number(n).toLocaleString('fr-FR',{maximumFractionDigits:3}); };
  add(ph,'span','chip c-grey', ['EUR','USD'].map(function(d){ return '1 '+d+' = '+fr(RATE(d))+' '+pivot; }).join(' · ')+(state.fxFrozen?' (taux figés)':''));
  var fl=add(c1,'div','ov-filtres');
  var fw=add(fl,'div'); fw.style.flex='1 1 220px';
  add(fw,'label','ov-lab','Rechercher').setAttribute('for','offsearch');
  var fi=add(fw,'input'); fi.id='offsearch'; fi.type='search'; fi.value=UI.q; fi.style.width='100%';
  fi.placeholder='Nom du soumissionnaire ou pays…'; fk(fi,'offsearch');
  fi.addEventListener('input',function(){ UI.q=fi.value; render(); });
  var sw=add(fl,'div');
  add(sw,'label','ov-lab','Trier par').setAttribute('for','offsort');
  var ss=add(sw,'select'); ss.id='offsort'; fk(ss,'offsort');
  [['nom','Soumissionnaire'],['montant','Montant croissant'],['delai','Délai croissant'],['origine','Origine']].forEach(function(x){ add(ss,'option',null,x[1]).value=x[0]; });
  ss.value=UI.sort;
  ss.addEventListener('change',function(){ UI.sort=ss.value; render(); });
  var sx=add(c1,'div','scroll-x'); var t=add(sx,'table');
  var tr=add(add(t,'thead'),'tr');
  ['Soumissionnaire','Origine','Montant','Déposée le','Conformité'].forEach(function(x){ add(tr,'th',null,x); });
  var tb=add(t,'tbody');
  var rows=SEED_OFFERS.filter(function(o){
    if(!UI.q) return true;
    return (o.name+' '+o.pays).toLowerCase().indexOf(UI.q.toLowerCase())>=0;
  }).slice().sort(function(a,b){
    if(UI.sort==='montant') return montantXOF(a)-montantXOF(b);
    if(UI.sort==='delai') return a.delai-b.delai;
    if(UI.sort==='origine') return (isUemoa(b)?1:0)-(isUemoa(a)?1:0) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
  if(!rows.length){
    var etd=add(add(tb,'tr'),'td'); etd.colSpan=5;
    add(etd,'div','muted',nb ? 'Aucune offre ne correspond à « '+UI.q+' ».' : 'Aucune offre reçue pour le moment.');
  }
  rows.forEach(function(o){
    var r=add(tb,'tr');
    add(r,'td',null,o.name).style.fontWeight='600';
    originChip(add(r,'td'),o);
    var tm=add(r,'td'); add(tm,'div',null,sep(o.montant)+' '+o.devise); if(o.devise!=='XOF') add(tm,'div','muted','≈ '+xof(montantXOF(o)));
    add(r,'td',null,o.depot||'—');
    var mis=missingDocs(o).length;
    add(add(r,'td'),'span','chip '+(excluded(o)?'c-red':(mis?'c-amber':'c-green')), excluded(o)?'Écartée':(mis?mis+' pièce(s) manquante(s)':'Conforme'));
  });
  labelize(t);

  /* Parcours et calendrier : une seule liste, datée */
  var c2=add(g,'div','card');
  add(c2,'div','panel-head','Parcours de la procédure');
  var pd=add(c2,'div','pad');
  function dateAudit(debut){ var e=(state.audit||[]).filter(function(x){ return x.a.indexOf(debut)===0; })[0]; return e ? e.t : null; }
  var appro=(state.approvals||[]).filter(function(a){ return a.done && a.at; }).map(function(a){ return a.at; });
  var ssd=state.standstill||{}, jal=state.jalons||{};
  var etapes=[
    ['Cahier des charges publié', !!c.cdcPublie, state.cadre ? state.cadre.at : null, null],
    ['Dépôt des offres', ouvert, null, dateLim ? 'Date limite : '+dateLim : 'Date limite à fixer au cahier des charges'],
    ['Dépouillement ouvert', ouvert, jal.ouvert ? new Date(jal.ouvert).toLocaleString('fr-FR') : null, jal.ouvertureManuelle ? 'Ouvert à la main avant la date limite' : null],
    ['Dépouillement clôturé', !!state.depClosed, state.fxFrozen ? state.fxFrozen.at : null, null],
    ['Évaluation validée', !!state.evalDone, dateAudit('Évaluation validée'), null],
    ['Attribution prononcée', allApproved(), appro.length ? appro[appro.length-1] : null, null],
    ['Notification aux soumissionnaires', !!ssd.startedAt, ssd.startedAt ? new Date(ssd.startedAt).toLocaleString('fr-FR') : null, null],
    ['Signature du marché', !!state.contractSigned, dateAudit('Marché signé'), null]
  ];
  var courant=etapes.findIndex(function(x){ return !x[1]; });
  etapes.forEach(function(x,i){
    var row=add(pd,'div','stepline');
    add(row,'div','stepnum '+(x[1]?'done':(i===courant?'now':'')), x[1]?'✓':String(i+1));
    var d=add(row,'div'); d.style.flex='1 1 auto';
    add(d,'strong',null,x[0]);
    add(d,'div','muted', x[1] ? (x[2] || x[3] || 'Fait') : (x[3] || (i===courant?'En cours':'À venir')));
    if(x[1] && x[3] && x[2]) add(d,'div','muted',x[3]);
  });

  if(!preferencePossible()) return;
  var n=add(m,'div','note'); n.style.marginTop='18px';
  add(n,'strong',null,'Préférence communautaire. ');
  n.appendChild(document.createTextNode(
    state.cdc.prefActive
      ? "Une marge de préférence de "+state.cdc.prefTaux+" % est appliquée à la comparaison : les offres hors UEMOA sont majorées de ce taux pour le seul classement, sans modification du prix contractuel. Son activation et son taux se règlent au cahier des charges, et sont figés à la clôture du dépouillement."
      : "La marge de préférence communautaire est désactivée : les offres sont comparées à leur valeur convertie, sans correction d'origine."));
}
