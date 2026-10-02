/* Marché+ — Écran Tableau de bord.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

/* ============ Vues ============ */
function vDashboard(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Tableau de bord');
  add(l,'p','lede',"Prototype de démonstration — données fictives. Procédure d'appel d'offres ouvert international : soumissionnaires de la zone UEMOA et hors zone, offres en plusieurs devises converties en francs CFA.");
  var b=add(h,'button','btn btn-primary', state.cdc.cdcPublie?'Reprendre le dépouillement':'Préparer le cahier des charges');
  b.addEventListener('click',function(){ go(state.cdc.cdcPublie?'depouille':'cdc'); });
  frise(m);

  var st=add(m,'div','stats');
  var etr=SEED_OFFERS.filter(function(o){return !isUemoa(o);}).length;
  [['Offres reçues',String(SEED_OFFERS.length),null],
   ['Dont hors UEMOA',String(etr),'var(--violet)'],
   ['Champs à vérifier',String(flagsRemaining()),flagsRemaining()>0?'var(--amber)':null],
   ['Offres conformes',conformes().length+' / '+SEED_OFFERS.length,null],
   ['Anomalies',String(anomalies().length),'var(--red)']
  ].forEach(function(s){
    var c=add(st,'div','card pad'); add(c,'div','stat-k',s[0]);
    var v=add(c,'div','stat-v',s[1]); if(s[2]) v.style.color=s[2];
  });

  var g=add(m,'div'); g.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:18px;align-items:start';

  var c1=add(g,'div','card');
  var ph=add(c1,'div','panel-head'); add(ph,'span',null,'Offres reçues');
  var pivot=(state.org&&state.org.devisePivot)||'XOF', fr=function(n){ return Number(n).toLocaleString('fr-FR',{maximumFractionDigits:3}); };
  add(ph,'span','chip c-grey', ['EUR','USD'].map(function(d){ return '1 '+d+' = '+fr(RATE(d))+' '+pivot; }).join(' · ')+(state.fxFrozen?' (taux figés)':''));
  var fl=add(c1,'div','pad'); fl.style.cssText='padding:14px 18px 0;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end';
  var fw=add(fl,'div'); fw.style.flex='1 1 220px';
  var flab=add(fw,'label',null,'Rechercher'); flab.setAttribute('for','offsearch');
  flab.style.cssText='display:block;font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px';
  var fi=add(fw,'input'); fi.id='offsearch'; fi.type='search'; fi.value=UI.q; fi.style.width='100%';
  fi.placeholder='Nom du soumissionnaire ou pays…'; fk(fi,'offsearch');
  fi.addEventListener('input',function(){ UI.q=fi.value; render(); });
  var sw=add(fl,'div');
  var slab=add(sw,'label',null,'Trier par'); slab.setAttribute('for','offsort');
  slab.style.cssText='display:block;font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px';
  var ss=add(sw,'select'); ss.id='offsort'; fk(ss,'offsort');
  [['nom','Soumissionnaire'],['montant','Montant croissant'],['delai','Délai croissant'],['origine','Origine']].forEach(function(x){
    var op=add(ss,'option',null,x[1]); op.value=x[0];
  });
  ss.value=UI.sort;
  ss.addEventListener('change',function(){ UI.sort=ss.value; render(); });
  var sx=add(c1,'div','scroll-x'); var t=add(sx,'table');
  var tr=add(add(t,'thead'),'tr');
  ['Soumissionnaire','Origine','Montant offre','Équivalent XOF','Conformité'].forEach(function(x){ add(tr,'th',null,x); });
  var tb=add(t,'tbody');
  var rows=SEED_OFFERS.filter(function(o){
    if(!UI.q) return true;
    var q=UI.q.toLowerCase();
    return (o.name+' '+o.pays).toLowerCase().indexOf(q)>=0;
  }).slice().sort(function(a,b){
    if(UI.sort==='montant') return montantXOF(a)-montantXOF(b);
    if(UI.sort==='delai') return a.delai-b.delai;
    if(UI.sort==='origine') return (isUemoa(b)?1:0)-(isUemoa(a)?1:0) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
  if(!rows.length){
    var er=add(tb,'tr'); var etd=add(er,'td'); etd.colSpan=5;
    add(etd,'div','muted','Aucune offre ne correspond à « '+UI.q+' ».');
  }
  rows.forEach(function(o){
    var r=add(tb,'tr');
    add(r,'td',null,o.name).style.fontWeight='600';
    var td=add(r,'td'); originChip(td,o);
    add(r,'td',null, sep(o.montant)+' '+o.devise);
    add(r,'td',null, xof(montantXOF(o)));
    var mis=missingDocs(o).length;
    add(add(r,'td'),'span','chip '+(excluded(o)?'c-red':(mis?'c-amber':'c-green')), excluded(o)?'Écartée':(mis?mis+' pièce(s) manquante(s)':'Conforme'));
  });
  labelize(t);

  var c2=add(g,'div','card');
  add(c2,'div','panel-head','Avancement de la procédure');
  var pd=add(c2,'div','pad');
  [['Cahier des charges publié', state.cdc.cdcPublie],
   ['Dépouillement clôturé', state.depClosed],
   ['Évaluation validée', state.evalDone],
   ['Approbations recueillies', allApproved()],
   ['Procès-verbal généré', allApproved()]
  ].forEach(function(s,i){
    var row=add(pd,'div','stepline');
    add(row,'div','stepnum'+(s[1]?' done':''), s[1]?'✓':String(i+1));
    var d=add(row,'div'); add(d,'strong',null,s[0]); add(d,'div','muted', s[1]?'Terminé':'En attente');
  });

  var g2=add(m,'div'); g2.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:18px;align-items:start;margin-top:18px';

  var cal=add(g2,'div','card');
  add(cal,'div','panel-head','Calendrier de la procédure');
  var cb=add(cal,'div','pad');
  [['Publication de l\u2019avis','28/09/2026',true],
   ['Visite de site obligatoire','06/10/2026',true],
   ['Date limite de questions des candidats','08/10/2026',true],
   ['Date limite de dépôt des plis','15/10/2026 à 10h00',state.cdc.cdcPublie],
   ['Séance d\u2019ouverture des plis','15/10/2026 à 11h00',state.depClosed],
   ['Notification d\u2019attribution','à fixer',allApproved()]
  ].forEach(function(x){
    var r=add(cb,'div','docline');
    var lf=add(r,'div');
    add(lf,'div',null,x[0]).style.fontWeight='600';
    add(lf,'div','muted',x[1]);
    add(r,'span','chip '+(x[2]?'c-green':'c-grey'), x[2]?'Fait':'À venir');
  });

  var oth=add(g2,'div','card');
  add(oth,'div','panel-head','Autres procédures en cours');
  var ob=add(oth,'div','pad');
  var autres=MP.procs().filter(function(p){ return p.id!==MP.pid() && !p.archive; });
  if(!autres.length) add(ob,'p','muted','Aucune autre procédure en cours.');
  autres.forEach(function(p){
    var r=add(ob,'div','docline');
    var lf=add(r,'div');
    add(lf,'div',null,p.ref+' — '+(p.objet||'')).style.fontWeight='600';
    var st=statutProcedure(p); add(r,'span','chip '+st[1],st[0]);
    var bo=add(r,'button','btn btn-ghost btn-sm','Ouvrir');
    bo.addEventListener('click',function(){ ouvrirProcedure(p.id,'dashboard'); });
  });
  var fo=add(oth,'div','panel-foot');
  add(fo,'span','muted','Toutes les procédures, y compris archivées, sont dans l’écran Procédures.');

  var n=add(m,'div','note');
  add(n,'strong',null,'Préférence communautaire. ');
  n.appendChild(document.createTextNode(
    state.cdc.prefActive
      ? "Une marge de préférence de "+state.cdc.prefTaux+" % est appliquée à la comparaison : les offres hors UEMOA sont majorées de ce taux pour le seul classement, sans modification du prix contractuel. Son activation et son taux se règlent au cahier des charges, et sont figés à la clôture du dépouillement."
      : "La marge de préférence communautaire est désactivée : les offres sont comparées à leur valeur convertie, sans correction d'origine."));
}
