/* Marché+ — Composants de présentation partagés (icônes, pastilles, bandeaux, frise) et bandeau de déclaration de conflit d’intérêts.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

/* ============ Composants de présentation (styles : css/app.css, valeurs : css/tokens.css) ============ */
/* Icônes : traits vectoriels intégrés, couleur héritée du texte. */
var ICONS = {
  home:'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  bell:'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8|M10 20a2 2 0 0 0 4 0',
  file:'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z|M14 3v5h5M9 13h6M9 17h6',
  book:'M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z|M4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3',
  sliders:'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0|M16 4v4M10 10v4M18 16v4',
  chat:'M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z',
  upload:'M12 15V4M7 9l5-5 5 5|M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
  inbox:'M3 13h5l1.5 3h5L16 13h5|M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z',
  search:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z|m20 20-4-4',
  shield:'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z|m9 12 2 2 4-4',
  help:'M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z|M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6M12 16.5h.01',
  chart:'M4 20V10M10 20V4M16 20v-7M22 20H2',
  gavel:'m14 5 5 5M11 8l5 5M9 10l5-5 5 5-5 5zM4 20l7-7',
  scale:'M12 3v18M7 21h10M5 7h14|M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z',
  stamp:'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z|M14 3v5h5|m9 15 2 2 4-4',
  list:'M9 6h11M9 12h11M9 18h11|M4 6h.01M4 12h.01M4 18h.01',
  key:'M15 7a4 4 0 1 0 0 .01|M12 10 3 19v2h3l1-1v-2h2v-2h2l1.5-1.5',
  users:'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  cog:'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z|M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  ring:'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8|M10 20a2 2 0 0 0 4 0|M2 8c0-2 1-4 2.5-5M22 8c0-2-1-4-2.5-5',
  check:'m5 12 5 5 9-10',
  coin:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.8 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2',
  clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M12 7v5l3 2',
  info:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M12 11v5M12 8h.01',
  arrow:'M5 12h14M13 6l6 6-6 6',
  lock:'M6 11h12v10H6z|M8 11V7a4 4 0 0 1 8 0v4',
  folder:'M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  badge:'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z|M9 12h6M9 15h4',
  cart:'M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 8H6|M9 20h.01M17 20h.01',
  printer:'M7 9V3h10v6|M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2|M7 14h10v7H7z',
  download:'M12 4v11M7 10l5 5 5-5|M4 19h16',
  chevD:'m6 9 6 6 6-6',
  arrowUp:'M12 19V5M6 11l6-6 6 6',
  chevL:'m15 6-6 6 6 6',
  chevR:'m9 6 6 6-6 6',
  plus:'M12 5v14M5 12h14',
  x:'M6 6l12 12M18 6 6 18',
  eye:'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z|M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  clipboard:'M9 4h6v3H9z|M9 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-3|M9 12h6M9 16h4'
};
function icon(parent, name){
  var NS='http://www.w3.org/2000/svg', s=document.createElementNS(NS,'svg');
  s.setAttribute('class','ic'); s.setAttribute('viewBox','0 0 24 24'); s.setAttribute('aria-hidden','true');
  s.setAttribute('fill','none'); s.setAttribute('stroke','currentColor'); s.setAttribute('stroke-width','1.8');
  s.setAttribute('stroke-linecap','round'); s.setAttribute('stroke-linejoin','round');
  (ICONS[name]||ICONS.info).split('|').forEach(function(d){ var p=document.createElementNS(NS,'path'); p.setAttribute('d',d); s.appendChild(p); });
  if(parent) parent.appendChild(s);
  return s;
}
/* Icône de chaque écran du menu. */
var NAV_ICONS = { accueil:'home', dashboard:'info', notifs:'bell', procedures:'folder', besoins:'clipboard', referencement:'badge', partenaires:'users', commandes:'cart', cdc:'file', dao:'book', criteres:'sliders', qa:'chat', portail:'upload',
  reception:'inbox', depouille:'search', conformite:'shield', clarifs:'help', evaluation:'chart', decision:'gavel',
  recours:'scale', pv:'stamp', audit:'list', roles:'key', comptes:'users', params:'cog', regles:'ring' };

/* Pastille de statut : kind = ok | blocked | pending | draft | info. */
function chip(parent, kind, text, ic){ var c=add(parent,'span','chip chip-'+kind); if(ic) icon(c,ic); c.appendChild(document.createTextNode(text)); return c; }
/* Infobulle d'aide, lisible au survol et au clavier. */
function tip(parent, text){
  var b=add(parent,'button','tip','?'); b.type='button';
  b.setAttribute('aria-label',text); b.setAttribute('data-tip',text);
  return b;
}
/* Bandeau d'une ligne : kind = ok | blocked | pending | info. */
function banner(parent, kind, titre, detail, aide){
  var d=add(parent,'div','banner banner-'+kind);
  d.setAttribute('role', kind==='blocked' ? 'alert' : 'status');
  add(d,'strong',null,titre);
  if(detail) add(d,'span',null,detail);
  if(aide) tip(d,aide);
  return d;
}
/* Bouton avec icône. */
function ibtn(parent, cls, text, ic, apres){
  var b=add(parent,'button','btn '+cls); b.type='button';
  if(ic && !apres) icon(b,ic);
  b.appendChild(document.createTextNode(text));
  if(ic && apres) icon(b,ic);
  return b;
}
/* Carte « Prochaine étape » : ce qu'il faut faire maintenant, en une phrase et un bouton. */
function guideCard(m, g){
  var c=add(m,'section','card guide'+(g.ok?' ok':'')); c.setAttribute('aria-label','Prochaine étape');
  icon(add(c,'span','guide-ico'), g.ok ? 'check' : (g.icon||'arrow'));
  var t=add(c,'div'); add(t,'h2',null,g.titre); if(g.texte) add(t,'p',null,g.texte);
  if(g.action){ var b=ibtn(c,'btn-primary',g.action,'arrow',true); fk(b,'guide'); if(g.go) b.addEventListener('click',g.go); }
  return c;
}
/* Montant « 84 660 000 XOF » : chiffres en mono, devise en gris, contre-valeur au taux de la procédure. */
function montant(parent, texte){
  var mt=/^([\d\s  ]+(?:[.,]\d+)?)\s+([A-Z]{3})$/.exec(String(texte));
  if(!mt){ parent.appendChild(document.createTextNode(texte)); return; }
  add(parent,'span','num',mt[1]); add(parent,'span','ccy',mt[2]);
  if(mt[2]!=='XOF'){
    var n=Number(mt[1].replace(/[\s  ]/g,'').replace(',','.'));
    add(parent,'span','alt','≈ '+sep(n*RATE(mt[2]))+' XOF · taux '+Number(RATE(mt[2])).toLocaleString('fr-FR')+(state.fxFrozen?' figé':''));
  }
}
function initiales(nom){ return String(nom).replace(/[^A-Za-zÀ-ÿ ]/g,' ').split(/\s+/).filter(function(x){ return x.length>2 || /^[A-Z]/.test(x); }).map(function(x){ return x[0]; }).join('').slice(0,2).toUpperCase(); }

/* Parcours de la procédure, en tête de chaque écran de procédure. */
/* Le déroulé d'une procédure, en six étapes. Une étape regroupe un ou plusieurs écrans (sous-onglets). La vue
   d'ensemble et le journal d'audit ne sont pas des étapes : ce sont des outils, en pied de page. */
var ETAPES = [
  {id:'prep',    lab:'Préparer',              vues:['cdc','dao','criteres']},
  {id:'publi',   lab:'Publication et offres', vues:['qa','reception']},
  {id:'depouil', lab:'Dépouiller',            vues:['depouille','conformite','clarifs']},
  {id:'eval',    lab:'Évaluer',               vues:['evaluation']},
  {id:'decide',  lab:'Décider',               vues:['decision']},
  {id:'close',   lab:'Clore',                 vues:['recours','pv']}
];
var OUTILS_PROCEDURE = ['dashboard','audit'];
var FLOW_LAB = { done:'terminée', now:'en cours', blocked:'bloquée', todo:'à venir' };
function etapesStatut(){
  var s=lifeStatus(), recu=state.depClosed || (state.cdc.cdcPublie && SEED_OFFERS.length);
  return { prep:s.prep, publi: state.depClosed ? 'done' : (state.cdc.cdcPublie ? 'now' : 'todo'),
    depouil: s.clarif==='blocked' ? 'blocked' : (state.depClosed ? 'done' : (recu ? 'now' : 'todo')),
    eval:s.eval, decide:s.appro,
    close: state.contractSigned ? 'done' : (s.recours==='blocked' ? 'blocked' : (allApproved() ? 'now' : 'todo')) };
}
function etapeDe(vue){ for(var i=0;i<ETAPES.length;i++) if(ETAPES[i].vues.indexOf(vue)>=0) return ETAPES[i]; return null; }
function vuesPermises(etape){ return etape.vues.filter(viewAllowed); }
/* Écran où reprendre une procédure : le dernier ouvert, sinon le premier écran de l'étape en cours. */
function vueProcedureCourante(){
  if(UI.derniereVueProc && viewAllowed(UI.derniereVueProc)) return UI.derniereVueProc;
  var st=etapesStatut();
  for(var i=0;i<ETAPES.length;i++){ var v=vuesPermises(ETAPES[i]); if(v.length && (st[ETAPES[i].id]==='now' || st[ETAPES[i].id]==='blocked')) return v[0]; }
  return viewAllowed('dashboard') ? 'dashboard' : (VIEWS.filter(function(x){ return x.grp==='Procédure' && vueVisible(x); })[0]||{}).id;
}
/* Le cadre (frise, sous-onglets) s'adresse à ceux qui conduisent la procédure ; un prestataire ou un demandeur
   n'en voit qu'un ou deux écrans, sans cadre. */
function avecCadreProcedure(){ return VIEWS.filter(function(v){ return v.grp==='Procédure' && vueVisible(v); }).length>=3; }

/* En-tête, frise des étapes et sous-onglets ; retourne le conteneur où l'écran se dessine. */
function cadreProcedureHaut(m){
  // la référence de la procédure figure dans la barre du haut, à côté du titre (placerTitre)
  var cur=MP.current();
  var autres=MP.procs().filter(function(p){ return !p.archive || p.id===MP.pid(); });
  if(autres.length>1){
    var hd=add(m,'div','proc-head');
    var s=add(hd,'select'); s.setAttribute('aria-label','Changer de procédure'); fk(s,'proc-sel'); s.id='proc-sel';
    autres.forEach(function(p){ var o=add(s,'option',null,p.ref+(p.archive?' (archivée)':'')+' — '+(p.objet||'')); o.value=p.id; });
    s.value=MP.pid();
    s.addEventListener('change',function(){ ouvrirProcedure(s.value, state.view); });
  }
  if(cur && cur.archive){ var na=add(m,'div','note'); add(na,'strong',null,'Procédure archivée. '); na.appendChild(document.createTextNode('Elle se consulte mais ne se modifie plus.')); }

  var st=etapesStatut(), etape=etapeDe(state.view);
  var ol=add(m,'ol','flow'); ol.setAttribute('aria-label','Étapes de la procédure');
  ETAPES.forEach(function(e,i){
    var li=add(ol,'li','flow-step '+st[e.id]);
    var vues=vuesPermises(e), b=add(li, vues.length?'button':'span');
    var n=add(b,'span','flow-n');
    if(st[e.id]==='done') icon(n,'check'); else n.textContent=String(i+1);
    add(b,'span','flow-label',e.lab);
    if(vues.length){ b.type='button'; fk(b,'etape-'+e.id); b.addEventListener('click',function(){ go(vues[0]); }); }
    if(etape===e) b.setAttribute('aria-current','step');
    add(b,'span','sr-only',' — '+FLOW_LAB[st[e.id]]);
  });
  if(etape){
    var vues=vuesPermises(etape);
    if(vues.length>1){
      var tabs=add(m,'div','proc-tabs'); tabs.setAttribute('role','tablist');
      vues.forEach(function(v){
        var def=VIEWS.filter(function(x){ return x.id===v; })[0];
        var bt=add(tabs,'button','pill'+(v===state.view?' on':''),def.label); fk(bt,'onglet-'+v);
        bt.setAttribute('role','tab'); bt.setAttribute('aria-selected',v===state.view?'true':'false');
        var verrou=lockReason(v); if(verrou) bt.title=verrou;
        bt.addEventListener('click',function(){ go(v); });
      });
    }
  }
  return add(m,'div');
}
/* Pied : étape précédente et suivante, et les outils de la procédure. */
function cadreProcedureBas(m){
  var etape=etapeDe(state.view), pied=add(m,'div','proc-foot');
  var nav=add(pied,'div'); nav.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
  if(etape){
    var i=ETAPES.indexOf(etape);
    var prec=ETAPES[i-1], suiv=ETAPES[i+1];
    if(prec && vuesPermises(prec).length){ var bp=add(nav,'button','btn btn-ghost btn-sm','← '+prec.lab); fk(bp,'etape-prec'); bp.addEventListener('click',function(){ go(vuesPermises(prec)[0]); }); }
    if(suiv && vuesPermises(suiv).length){ var bs=add(nav,'button','btn btn-primary btn-sm','Étape suivante : '+suiv.lab+' →'); fk(bs,'etape-suiv'); bs.addEventListener('click',function(){ go(vuesPermises(suiv)[0]); }); }
  }
  var outils=add(pied,'div'); outils.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
  OUTILS_PROCEDURE.filter(viewAllowed).forEach(function(v){
    var def=VIEWS.filter(function(x){ return x.id===v; })[0];
    var bo=add(outils,'button','btn btn-ghost btn-sm'+(v===state.view?' on':''),def.label); fk(bo,'outil-'+v);
    bo.addEventListener('click',function(){ go(v); });
  });
}

/* ============ Tableau de données ============
   Libellés de colonnes, recherche, filtres, bouton « Nouveau », pagination (10 lignes par page par défaut, icônes
   précédent / suivant). L'état (page, recherche, filtres, taille de page) est gardé par clé dans UI.tableaux : il
   survit aux rendus. La recherche et les filtres redessinent le seul tableau, sans perdre la saisie.
   o = { cle, titre?, lignes, colonnes:[{ lab, val(ligne) → texte | rendu(ligne, td), num? }],
         recherche?(ligne) → texte cherché, filtres?:[{ lab, options:[[valeur, libellé]], test(ligne, valeur) }],
         nouveau?:{ lab, action }, actions?(ligne, td), vide?, parPage? } */
UI.tableaux = {};
function tableau(parent, o){
  var st = UI.tableaux[o.cle] = UI.tableaux[o.cle] || { page:0, q:'', f:{}, parPage:o.parPage||10 };
  var carte=add(parent,'div','card dt');
  var barre=add(carte,'div','dt-barre');
  if(o.titre) add(barre,'strong','dt-titre',o.titre);
  var outils=add(barre,'div','dt-outils');
  if(o.recherche){
    var rq=add(outils,'input','dt-recherche'); rq.type='search'; rq.placeholder='Rechercher…'; rq.value=st.q;
    rq.setAttribute('aria-label','Rechercher dans le tableau'+(o.titre?' « '+o.titre+' »':'')); fk(rq,'dt-q-'+o.cle);
    rq.addEventListener('input',function(){ st.q=rq.value; st.page=0; dessiner(); });
  }
  (o.filtres||[]).forEach(function(f,i){
    var s=add(outils,'select'); s.setAttribute('aria-label',f.lab); fk(s,'dt-f'+i+'-'+o.cle);
    add(s,'option',null,f.lab+' : tous').value='';
    f.options.forEach(function(x){ add(s,'option',null,x[1]).value=x[0]; });
    s.value=st.f[i]||'';
    s.addEventListener('change',function(){ st.f[i]=s.value; st.page=0; dessiner(); });
  });
  if(o.nouveau){
    var bn=add(outils,'button','btn btn-primary btn-sm'); icon(bn,'plus'); bn.appendChild(document.createTextNode(o.nouveau.lab)); fk(bn,'dt-nouveau-'+o.cle);
    bn.addEventListener('click',o.nouveau.action);
  }
  var corps=add(carte,'div','dt-corps'), pied=add(carte,'div','dt-pied');
  function dessiner(){
    corps.textContent=''; pied.textContent='';
    var t=st.q.trim().toLowerCase();
    var vis=o.lignes.filter(function(l){
      if(t && String(o.recherche(l)||'').toLowerCase().indexOf(t)<0) return false;
      return (o.filtres||[]).every(function(f,i){ return !st.f[i] || f.test(l, st.f[i]); });
    });
    var pages=Math.max(1, Math.ceil(vis.length/st.parPage));
    if(st.page>=pages) st.page=pages-1;
    if(!vis.length){ add(corps,'p','muted dt-vide', o.lignes.length ? 'Aucune ligne ne correspond à la recherche ou aux filtres.' : (o.vide||'Aucune donnée.')); }
    else {
      var tbl=add(corps,'table','tbl dt-table');
      var tr=add(add(tbl,'thead'),'tr');
      o.colonnes.forEach(function(c){ var th=add(tr,'th',(c.num?'num':'')+(c.court?' dt-court':'')||null,c.lab); th.scope='col'; });
      if(o.actions){ var tha=add(tr,'th','dt-act','Actions'); tha.scope='col'; }
      var tb=add(tbl,'tbody');
      vis.slice(st.page*st.parPage, (st.page+1)*st.parPage).forEach(function(l){
        var r=add(tb,'tr');
        o.colonnes.forEach(function(c){ var td=add(r,'td',c.num?'num':null); if(c.rendu) c.rendu(l,td); else td.textContent=c.val(l)==null?'':String(c.val(l)); });
        if(o.actions){ var tda=add(r,'td','dt-act'); o.actions(l,tda); }
      });
    }
    // pied : taille de page, position, précédent / suivant
    var g=add(pied,'label','dt-taille'); g.appendChild(document.createTextNode('Lignes par page '));
    var sp=add(g,'select'); fk(sp,'dt-pp-'+o.cle);
    [10,25,50].forEach(function(n){ add(sp,'option',null,String(n)).value=String(n); });
    sp.value=String(st.parPage);
    sp.addEventListener('change',function(){ st.parPage=Number(sp.value); st.page=0; dessiner(); });
    var nav=add(pied,'div','dt-pages');
    var deb=vis.length ? st.page*st.parPage+1 : 0, fin=Math.min(vis.length,(st.page+1)*st.parPage);
    add(nav,'span','muted',deb+'–'+fin+' sur '+vis.length);
    var bp=add(nav,'button','icon-btn'); icon(bp,'chevL'); bp.setAttribute('aria-label','Page précédente'); bp.disabled=st.page===0; fk(bp,'dt-prec-'+o.cle);
    bp.addEventListener('click',function(){ st.page--; dessiner(); });
    add(nav,'span','dt-num','Page '+(st.page+1)+' / '+pages);
    var bs=add(nav,'button','icon-btn'); icon(bs,'chevR'); bs.setAttribute('aria-label','Page suivante'); bs.disabled=st.page>=pages-1; fk(bs,'dt-suiv-'+o.cle);
    bs.addEventListener('click',function(){ st.page++; dessiner(); });
  }
  dessiner();
  return carte;
}
/* ============ Écrans longs : sommaire collé, sections repliables ============
   Un écran d'au moins quatre sections (cartes à en-tête .panel-head, posées directement dans le contenu) reçoit à
   droite un sommaire qui reste visible pendant le défilement, suit la section lue et mène à chacune d'un clic.
   Chaque section porte une pastille numérotée, se replie depuis son en-tête et s'éclaire quand on la lit ; seule la
   première est ouverte au départ. L'état est gardé par écran dans UI.replis, pour survivre aux rendus. */
UI.replis = {};
function titreSection(head){
  var t=head.firstChild && head.firstChild.nodeType===1 ? head.firstChild.textContent : head.textContent;
  return String(t||'').trim();
}
/* Pastille de l'en-tête. « 7 · Titre » devient une pastille 7 suivie du titre ; le texte de l'en-tête reste
   « 7 · Titre » (le séparateur est seulement masqué à l'écran). Un titre sans numéro reçoit son rang, décoratif. */
function pastilleSection(head, rang){
  var n=head.firstChild, cible=null;
  if(n && n.nodeType===3) cible=n;
  else if(n && n.nodeType===1 && n.firstChild && n.firstChild.nodeType===3) cible=n.firstChild;
  var b=document.createElement('span'); b.className='sec-badge';
  var m=cible && cible.textContent.match(/^\s*(\d+)\s*·\s*/);
  if(m){
    b.textContent=m[1]; var sep=document.createElement('span'); sep.className='sr-only'; sep.textContent=' · '; b.appendChild(sep);
    cible.textContent=cible.textContent.slice(m[0].length);
    cible.parentNode.insertBefore(b,cible);
  } else {
    b.textContent=String(rang); b.setAttribute('aria-hidden','true');
    head.insertBefore(b,head.firstChild);
  }
}
function organiserSections(conteneur, cle){
  var cartes=[].slice.call(conteneur.children).filter(function(e){ return e.classList.contains('card') && e.firstElementChild && e.firstElementChild.classList.contains('panel-head'); });
  SUIVI_SECTIONS=null;
  if(cartes.length<4) return;
  var etat = UI.replis[cle] = UI.replis[cle] || {};
  var sections = cartes.map(function(c,i){
    var head=c.firstElementChild, titre=titreSection(head);
    if(!(titre in etat)) etat[titre] = i>0; // seule la première section est ouverte au départ
    c.classList.add('sec-carte'); if(!c.id) c.id='sec-'+i;
    pastilleSection(head, i+1);
    var bt=document.createElement('button'); bt.type='button'; bt.className='sec-bascule'; icon(bt,'chevD');
    head.appendChild(bt);
    function appliquer(anime){
      c.classList.toggle('replie', !!etat[titre]);
      if(anime && !etat[titre]){ c.classList.remove('sec-ouvre'); void c.offsetWidth; c.classList.add('sec-ouvre'); }
      bt.setAttribute('aria-expanded', etat[titre] ? 'false' : 'true');
      bt.setAttribute('aria-label', (etat[titre] ? 'Déplier' : 'Replier')+' la section « '+titre.replace(/^\d+\s*·\s*/,'')+' »');
    }
    function basculer(){ etat[titre]=!etat[titre]; appliquer(true); }
    bt.addEventListener('click',function(e){ e.stopPropagation(); basculer(); });
    // en-tête cliquable quand la section est repliée (sauf ses propres boutons, champs et liens)
    head.addEventListener('click',function(e){ if(etat[titre] && !e.target.closest('button,a,input,select,textarea,label')) basculer(); });
    appliquer(false);
    return { carte:c, titre:titre, ouvrir:function(){ if(etat[titre]){ etat[titre]=false; appliquer(true); } } };
  });

  conteneur.classList.add('avec-sommaire');
  var aside=add(conteneur,'aside','sec-sommaire'); aside.setAttribute('aria-label','Sommaire de la page');
  var boite=add(aside,'div','sec-boite');

  var liens=[];
  var tete=add(boite,'div','sec-titre-ligne');
    add(tete,'div','sec-titre','Sommaire');
    var tous=add(tete,'div','sec-tous');
    var bd=boutonIcone(tous,'chevD','Tout déplier',function(){ sections.forEach(function(s){ etat[s.titre]=false; }); render(); },'sommaire-deplier');
    var br=boutonIcone(tous,'chevD','Tout replier',function(){ sections.forEach(function(s){ etat[s.titre]=true; }); render(); },'sommaire-replier');
    bd.classList.add('sec-mini'); br.classList.add('sec-mini','sec-mini-replier');
  var ol=add(boite,'ol','sec-liste');
  sections.forEach(function(s,i){
      var li=add(ol,'li');
      var a=add(li,'button','sec-lien'); a.type='button'; fk(a,'sommaire-'+i);
      var m=s.titre.match(/^(\d+)\s*·\s*(.*)$/);
      add(a,'span','sec-num', m ? m[1] : String(i+1));
      var lib=add(a,'span','sec-lib', m ? m[2] : s.titre); a.title=lib.textContent;
      a.addEventListener('click',function(){ s.ouvrir(); SUIVI_VERROU=Date.now()+1200; s.carte.scrollIntoView({behavior:'smooth', block:'start'}); actif(i); });
      liens.push(a);
  });

  function actif(i){
    liens.forEach(function(a,j){
      a.classList.toggle('on', i===j); a.classList.toggle('vu', j<i);
      if(i===j) a.setAttribute('aria-current','true'); else a.removeAttribute('aria-current');
    });
    sections.forEach(function(s,j){ s.carte.classList.toggle('actif', i===j); });
    ol.style.setProperty('--avance', String(i/(sections.length-1)));
  }
  actif(0);
  // suit la section affichée : la dernière dont le haut a franchi le haut de l'écran (sous la barre du haut)
  SUIVI_SECTIONS = function(){
    if(Date.now()<SUIVI_VERROU) return; // défilement provoqué par un clic du sommaire : la section cliquée reste active
    var seuil=110, i=0;
    sections.forEach(function(s,j){ if(s.carte.getBoundingClientRect().top<=seuil) i=j; });
    if(window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-4) i=sections.length-1; // bas de page atteint
    actif(i);
  };
}
var SUIVI_SECTIONS=null, SUIVI_VERROU=0;
window.addEventListener('scroll',function(){ if(SUIVI_SECTIONS) requestAnimationFrame(SUIVI_SECTIONS); },{passive:true});

/* Bouton « haut de page », flottant, visible dès qu'on a défilé. */
(function(){
  var b=document.createElement('button'); b.type='button'; b.className='haut-page'; b.id='haut-page';
  b.setAttribute('aria-label','Revenir en haut de la page'); b.title='Haut de page'; icon(b,'arrowUp');
  b.addEventListener('click',function(){ window.scrollTo({top:0, behavior:'smooth'}); });
  document.addEventListener('DOMContentLoaded',function(){ document.body.appendChild(b); });
  window.addEventListener('scroll',function(){ b.classList.toggle('on', window.scrollY>480); },{passive:true});
})();

/* ============ Fenêtre de détail (popup) ============
   ouvrirFenetre(titre, remplir, o) ouvre une fenêtre au-dessus de l'écran. remplir(corps, pied) la dessine ; il est
   rappelé à chaque rendu tant qu'elle est ouverte, pour qu'elle suive l'état (une confirmation, une note, une
   réponse…) ; il doit donc relire l'état à chaque appel et renvoyer false si l'élément n'existe plus. titre peut être
   une fonction. Les saisies en cours sont conservées d'un rendu à l'autre. La fenêtre se ferme par Échap, la croix,
   un clic à côté, ou un changement d'écran. o.large : fenêtre large (document, offre détaillée). */
UI.fenetre = null;
function ouvrirFenetre(titre, remplir, o){
  fermerFenetre();
  o=o||{};
  var prev=document.activeElement;
  var ov=el('div','fen-ov');
  var bx=add(ov,'div','fen'+(o.large?' fen-large':''));
  bx.setAttribute('role','dialog'); bx.setAttribute('aria-modal','true'); bx.setAttribute('aria-labelledby','fen-titre');
  var hd=add(bx,'div','fen-tete');
  var h=add(hd,'h2','fen-titre'); h.id='fen-titre';
  var x=add(hd,'button','icon-btn fen-fermer'); x.type='button'; icon(x,'x'); x.setAttribute('aria-label','Fermer'); x.title='Fermer'; fk(x,'fen-fermer');
  var corps=add(bx,'div','fen-corps'), pied=add(bx,'div','fen-pied');
  var f = UI.fenetre = { titre:titre, remplir:remplir, ov:ov, bx:bx, corps:corps, pied:pied, h:h, prev:prev, vue:state.view };
  x.addEventListener('click',fermerFenetre);
  ov.addEventListener('mousedown',function(e){ if(e.target===ov) fermerFenetre(); });
  f.touche=function(e){
    if(document.querySelector('.modal-ov')) return; // une confirmation est ouverte par-dessus
    if(e.key==='Escape'){ e.preventDefault(); fermerFenetre(); }
    else if(e.key==='Tab'){
      var fo=[].slice.call(bx.querySelectorAll('button,a[href],input,select,textarea')).filter(function(z){ return !z.disabled && z.offsetParent!==null; });
      if(!fo.length) return;
      var i=fo.indexOf(document.activeElement);
      if(e.shiftKey && i<=0){ e.preventDefault(); fo[fo.length-1].focus(); }
      else if(!e.shiftKey && i===fo.length-1){ e.preventDefault(); fo[0].focus(); }
    }
  };
  document.addEventListener('keydown',f.touche,true);
  document.body.appendChild(ov);
  document.body.classList.add('fen-ouverte');
  dessinerFenetre();
  if(UI.fenetre===f){ var premier=corps.querySelector('textarea,input,select') || x; premier.focus(); }
}
function dessinerFenetre(){
  var f=UI.fenetre; if(!f) return;
  if(f.vue!==state.view){ fermerFenetre(); return; }
  var saisies={};
  [].forEach.call(f.bx.querySelectorAll('input[data-fk],textarea[data-fk],select[data-fk]'),function(z){ saisies[z.getAttribute('data-fk')]=z.value; });
  var sc=f.corps.scrollTop;
  f.corps.textContent=''; f.pied.textContent='';
  if(f.remplir(f.corps, f.pied)===false){ fermerFenetre(); return; }
  f.h.textContent = typeof f.titre==='function' ? f.titre() : f.titre;
  [].forEach.call(f.bx.querySelectorAll('input[data-fk],textarea[data-fk],select[data-fk]'),function(z){
    var k=z.getAttribute('data-fk'); if(k in saisies && z.type!=='checkbox' && z.type!=='radio') z.value=saisies[k];
  });
  f.pied.hidden=!f.pied.childNodes.length;
  f.corps.scrollTop=sc;
}
function fermerFenetre(){
  var f=UI.fenetre; if(!f) return;
  UI.fenetre=null;
  document.removeEventListener('keydown',f.touche,true);
  if(f.ov.parentNode) f.ov.parentNode.removeChild(f.ov);
  document.body.classList.remove('fen-ouverte');
  if(f.prev && f.prev.focus && document.body.contains(f.prev)) try{ f.prev.focus(); }catch(e){}
}
/* Champ en lecture dans une fenêtre : libellé, puis valeur (texte ou nœud). */
function champLecture(parent, lab, val){
  var d=add(parent,'div','fen-champ'); add(d,'div','fen-lab',lab);
  var v=add(d,'div','fen-val'); if(val && val.nodeType) v.appendChild(val); else v.textContent = val==null||val==='' ? '—' : String(val);
  return v;
}
/* Grille de champs en lecture : [[libellé, valeur], …], les valeurs vides sont omises. */
function grilleLecture(parent, paires){
  var g=add(parent,'div','fen-grille');
  paires.forEach(function(p){ if(p[1]==null || p[1]==='') return; champLecture(g,p[0],p[1]); });
  return g;
}
/* Bouton « voir le détail » d'une ligne de tableau : bouton texte si une action attend, icône sinon. */
function boutonDetail(td, action, fkey, lab){
  if(lab) return boutonCellule(td, lab, action, fkey, true);
  return boutonIcone(td, 'eye', 'Voir le détail', action, fkey);
}
/* Bouton-icône (imprimer, exporter…) : libellé au survol (title) et pour les lecteurs d'écran (aria-label). */
function boutonIcone(parent, ic, libelle, action, fkey){
  var b=add(parent,'button','icon-btn icon-action'); icon(b,ic); b.type='button';
  b.title=libelle; b.setAttribute('aria-label',libelle); if(fkey) fk(b,fkey);
  if(action) b.addEventListener('click',action);
  return b;
}
/* Pastille de statut dans une cellule. */
function chipCellule(td, lab, cls){ add(td,'span','chip '+(cls||'c-grey'),lab); }
/* Bouton d'action dans une cellule. */
function boutonCellule(td, lab, action, fkey, primaire){ var b=add(td,'button','btn btn-sm '+(primaire?'btn-primary':'btn-ghost'),lab); if(fkey) fk(b,fkey); b.addEventListener('click',action); return b; }

/* Icône d'un champ extrait, d'après son libellé. */
function fieldIcon(k){
  if(/montant|prix/i.test(k)) return 'coin';
  if(/délai/i.test(k)) return 'clock';
  if(/garantie/i.test(k)) return 'shield';
  if(/caution|pièce|document/i.test(k)) return 'file';
  return 'info';
}
function aVerifier(o){ return o.fields.filter(function(f,i){ return f.flag && !state.confirmed[o.id+'_'+i]; }).length; }

/* ============ Déclaration de conflit d'intérêts ============ */
function coiBanner(m){
  var d=coiDe(state.me);
  if(d && d.declare && !d.conflit) return false;
  var c=add(m,'div','card pad'); c.style.cssText+=';border-color:var(--amber-line);border-width:2px;margin-bottom:18px';
  if(d && d.conflit){
    add(c,'strong',null,'Conflit d\u2019intérêts déclaré — notation impossible');
    add(c,'p','muted','Vous avez déclaré un lien avec un ou plusieurs soumissionnaires. Vous ne pouvez pas noter les offres de cette procédure. Motif consigné : '+(d.note||'non précisé')+'.');
    return true;
  }
  add(c,'strong',null,'Déclaration préalable requise');
  add(c,'p','muted',"Avant de noter, chaque évaluateur déclare l'absence de lien personnel, familial ou d'intérêt avec les soumissionnaires. Cette déclaration est horodatée et versée à la piste d'audit ; elle est la première chose qu'examine un organe de régulation saisi d'un recours.");
  var acts=add(c,'div'); acts.style.cssText='display:flex;gap:10px;flex-wrap:wrap;margin-top:12px';
  var ok=add(acts,'button','btn btn-primary','Je déclare n\u2019avoir aucun conflit'); fk(ok,'coi-ok');
  ok.addEventListener('click',function(){
    ask("Vous attestez n'avoir aucun lien personnel, familial, financier ou professionnel avec les soumissionnaires de cette procédure. Toute fausse déclaration engage votre responsabilité.",
      function(){
        state.coi[state.me]={declare:true, conflit:false, t:new Date().toLocaleString('fr-FR')};
        logit('Déclaration d\u2019absence de conflit d\u2019intérêts — '+me().nom);
        notify('coi.declare','Déclaration de conflit d\u2019intérêts', me().nom+" ("+myRole().lab+") déclare n'avoir aucun conflit d'intérêts sur la procédure "+REF()+".");
        save(); render();
      },"Confirmer la déclaration ?","Je déclare");
  });
  var ko=add(acts,'button','btn btn-danger','Je déclare un conflit'); fk(ko,'coi-ko');
  ko.addEventListener('click',function(){
    ask("Vous serez écarté de la notation de cette procédure. Le motif sera consigné et le responsable des achats devra désigner un autre évaluateur.",
      function(){
        state.coi[state.me]={declare:true, conflit:true, note:'Lien professionnel antérieur avec un soumissionnaire', t:new Date().toLocaleString('fr-FR')};
        logit('Conflit d\u2019intérêts déclaré — '+me().nom+' écarté de la notation');
        notify('coi.declare','Conflit d\u2019intérêts déclaré', me().nom+" ("+myRole().lab+") se déporte de la notation de la procédure "+REF()+". Un remplaçant doit être désigné.");
        save(); render();
      },"Déclarer un conflit d'intérêts ?","Je me déporte");
  });
  return true;
}
