/* Marché+ — Le dossier d'appel d'offres en document PDF paginé : page de garde illustrée selon le thème de l'achat,
   sommaire avec numéros de page, page des informations clés, une pièce par chapitre (nouvelle page), en-tête et pied
   de page avec pagination. Généré dans le navigateur par pdfmake (servi par l'application : /vendor/pdfmake), à partir
   du contenu de buildDAO() ; le même document sert à l'acheteur (aperçu avant publication) et aux soumissionnaires.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

var PDFMAKE_PRET = null;
/* Charge pdfmake (et ses polices) à la première demande seulement. */
function chargerPdfmake(){
  if(PDFMAKE_PRET) return PDFMAKE_PRET;
  var charger=function(src){ return new Promise(function(ok,ko){ var s=document.createElement('script'); s.src=src; s.onload=ok; s.onerror=function(){ ko(new Error('Chargement impossible : '+src)); }; document.head.appendChild(s); }); };
  PDFMAKE_PRET=charger('/vendor/pdfmake/pdfmake.min.js').then(function(){ return charger('/vendor/pdfmake/vfs_fonts.js'); })
    .catch(function(e){ PDFMAKE_PRET=null; throw e; });
  return PDFMAKE_PRET;
}

var COUL_PDF = { accent:'#B4471B', doux:'#FDF0E7', encre:'#1F2430', gris:'#5C6371', trait:'#E6E1DA', fond:'#F7F4F0' };
function dateLongue(iso){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||''))) return iso||'—';
  var d=new Date(iso+'T12:00:00'); return d.toLocaleDateString('fr-FR',{ day:'numeric', month:'long', year:'numeric' });
}
var PORTEE_PIECE = { tous:'Tous les soumissionnaires', local:'Établis en Côte d’Ivoire', etranger:'Établis hors UEMOA' };

/* Définition pdfmake du dossier. */
function definitionDossier(){
  var c=state.cdc, org=state.org||{}, P=buildDAO(), th=themeDossier(c), illu=ILLUSTRATIONS[th]||ILLUSTRATIONS.generique;
  var lieu=[org.ville,org.pays].filter(Boolean).join(' · '), auj=new Date().toLocaleDateString('fr-FR',{ day:'numeric', month:'long', year:'numeric' });
  var contenu=[];

  /* Page de garde */
  contenu.push(
    { columns:[
      { stack:[{ text:c.autorite||org.nom||'', style:'garOrg' },{ text:lieu, style:'garPetit' }] },
      { stack:[{ text:[{ text:'Réf. ', color:COUL_PDF.gris },{ text:REF(), bold:true }], alignment:'right', fontSize:10 },{ text:c.cdcPublie?'Dossier publié':'Projet — non publié', style:'garPetit', alignment:'right' }] }
    ] },
    { canvas:[{ type:'line', x1:0, y1:8, x2:495, y2:8, lineWidth:2, lineColor:COUL_PDF.accent }], margin:[0,0,0,34] },
    { text:'DOSSIER D’APPEL D’OFFRES', style:'garTitre' },
    { text:c.objet||'', style:'garObjet' },
    { svg:illu.svg, width:400, alignment:'center', margin:[0,22,0,8] },
    { text:illu.lab, style:'garTheme' },
    { table:{ widths:['*','*'], body:[
      [cleValeur('Autorité contractante',c.autorite),cleValeur('Type de procédure',c.procedure)],
      [cleValeur('Date limite de dépôt des offres',dateLongue(c.ouverture)+' à 10 h 00'),cleValeur('Langue de soumission',c.langue)],
      [cleValeur('Devise de soumission',c.deviseSoumission),cleValeur('Allotissement',(c.lots||[]).length+' lot(s)')]
    ] }, layout:{ fillColor:function(){ return COUL_PDF.fond; }, hLineWidth:function(){ return 0; }, vLineWidth:function(){ return 0; },
      paddingLeft:function(){ return 12; }, paddingRight:function(){ return 12; }, paddingTop:function(){ return 8; }, paddingBottom:function(){ return 8; } },
      margin:[0,22,0,0] },
    { text:'Document établi le '+auj+' — Marché+', style:'garPetit', alignment:'center', margin:[0,30,0,0], pageBreak:'after' }
  );

  /* Sommaire */
  contenu.push({ toc:{ title:{ text:'Sommaire', style:'h1' }, numberStyle:{ bold:true }, textMargin:[0,4,0,0] }, pageBreak:'after' });

  /* Informations clés */
  contenu.push({ text:'Informations clés', style:'h1', tocItem:true, tocStyle:{ bold:true }, tocMargin:[0,8,0,0] });
  contenu.push({ text:'Allotissement et estimations', style:'h3' });
  contenu.push(tableauPdf(['Lot','Intitulé','Montant estimatif'],[80,'*',110],(c.lots||[]).map(function(l,i){ return [String(i+1),l.nom||'',{ text:l.montant||'—', alignment:'right' }]; })));
  contenu.push({ text:'Calendrier', style:'h3' });
  contenu.push(tableauPdf(['Étape','Date'],['*',170],[['Date limite de dépôt et ouverture des plis',dateLongue(c.ouverture)+' à 10 h 00']]));
  contenu.push({ text:'Critères d’évaluation', style:'h3' });
  contenu.push(tableauPdf(['Critère','Mode de notation','Pondération'],['*',180,80],(state.criteria||[]).map(function(x){
    return [x.label, x.kind==='auto'?'Calculé selon la formule du règlement':'Noté par la commission', { text:x.weight+' %', alignment:'right' }]; })));
  var pieces=(DOCS()||[]).map(function(d){ return [d.label, PORTEE_PIECE[d.scope]||d.scope||'—']; });
  if(pieces.length){ contenu.push({ text:'Pièces exigées du dossier de candidature', style:'h3' }); contenu.push(tableauPdf(['Pièce','Soumissionnaires concernés'],['*',190],pieces)); }
  contenu.push({ text:'Conditions principales', style:'h3' });
  contenu.push(tableauPdf(['Condition','Valeur'],['*',170],[
    ['Caution de soumission', c.caution!==''&&c.caution!=null ? c.caution+' % du montant de l’offre' : '—'],
    ['Délai d’exécution maximal', c.delaiMax ? c.delaiMax+' jours' : '—'],
    ['Garantie minimale', c.garantieMin ? c.garantieMin+' mois' : '—'],
    ['Pénalité de retard', c.penalite!==''&&c.penalite!=null ? c.penalite+' ‰ par jour' : '—'],
    ['Avance de démarrage', c.avance!==''&&c.avance!=null ? c.avance+' %' : '—'],
    ['Marge de préférence communautaire', c.prefActive ? c.prefTaux+' %' : 'Non appliquée']
  ]));

  /* Les pièces du dossier : une par chapitre */
  P.forEach(function(pi,i){
    contenu.push({ text:'Pièce '+(i+1), style:'surtitre', pageBreak:'before' });
    contenu.push({ text:pi.titre.replace(/^Pièce \d+ — /,''), style:'h1', tocItem:true, tocStyle:{ bold:true }, tocMargin:[0,8,0,0] });
    pi.arts.forEach(function(a){
      contenu.push({ text:'Article '+a.n+' — '+a.t, style:'h2', tocItem:true, tocStyle:{ fontSize:9.5, color:COUL_PDF.gris }, tocMargin:[14,2,0,0] });
      a.p.forEach(function(x){
        if(x.indexOf('SPÉCIFICATION MINIMALE')===0) contenu.push({ table:{ widths:['*'], body:[[{ text:x, fontSize:9.5 }]] },
          layout:{ fillColor:function(){ return COUL_PDF.doux; }, hLineWidth:function(){ return 0; }, vLineWidth:function(i){ return i===0?3:0; }, vLineColor:function(){ return COUL_PDF.accent; },
            paddingLeft:function(){ return 10; }, paddingTop:function(){ return 6; }, paddingBottom:function(){ return 6; } }, margin:[0,2,0,8] });
        else contenu.push({ text:x, style:'corps' });
      });
    });
    if(pi.id==='p5'){ // bordereau à remplir par le soumissionnaire
      contenu.push({ text:'Cadre du bordereau des prix (à compléter par le soumissionnaire)', style:'h3' });
      contenu.push(tableauPdf(['Lot','Désignation','Quantité','Prix unitaire','Montant'],[34,'*',52,72,72],
        (c.lots||[]).map(function(l,j){ return [String(j+1),l.nom||'','','','']; }).concat([[{ text:'Total général', colSpan:4, bold:true },'','','','']])));
    }
  });

  /* Additifs publiés : ils font partie du dossier et priment sur les pièces qu'ils modifient */
  var adds=state.additifs||[];
  if(adds.length){
    contenu.push({ text:'Additifs', style:'h1', tocItem:true, tocStyle:{ bold:true }, tocMargin:[0,8,0,0], pageBreak:'before' });
    contenu.push({ text:'Les additifs ci-dessous modifient ou précisent le dossier. En cas de contradiction, l’additif le plus récent prévaut.', style:'corps' });
    adds.forEach(function(a,i){
      contenu.push({ text:'Additif n° '+(a.n||i+1)+' — '+a.objet, style:'h2', tocItem:true, tocStyle:{ fontSize:9.5, color:COUL_PDF.gris }, tocMargin:[14,2,0,0] });
      contenu.push({ text:'Publié le '+a.t+(a.report ? ' — date limite de dépôt reportée au '+dateLongue(a.report)+' à 10 h 00' : ''), fontSize:9, color:COUL_PDF.gris, margin:[0,0,0,6] });
      String(a.texte||'').split(/\n\s*\n/).forEach(function(x){ if(x.trim()) contenu.push({ text:x.trim(), style:'corps' }); });
    });
  }

  return {
    pageSize:'A4', pageMargins:[50,70,50,60],
    info:{ title:'Dossier d’appel d’offres '+REF(), author:c.autorite||org.nom||'', subject:c.objet||'' },
    header:function(page){ if(page===1) return null; return { margin:[50,26,50,0], stack:[
      { columns:[{ text:REF()+' — Dossier d’appel d’offres', fontSize:8.5, color:COUL_PDF.gris },{ text:c.autorite||org.nom||'', fontSize:8.5, color:COUL_PDF.gris, alignment:'right' }] },
      { canvas:[{ type:'line', x1:0, y1:6, x2:495, y2:6, lineWidth:0.6, lineColor:COUL_PDF.trait }] }] }; },
    footer:function(page,total){ if(page===1) return null; return { margin:[50,18,50,0], columns:[
      { text:(c.objet||'').slice(0,90), fontSize:8, color:COUL_PDF.gris },{ text:'Page '+page+' sur '+total, fontSize:8.5, color:COUL_PDF.gris, alignment:'right', width:90 }] }; },
    content:contenu,
    defaultStyle:{ font:'Roboto', fontSize:10, lineHeight:1.25, color:COUL_PDF.encre },
    styles:{
      garOrg:{ fontSize:13, bold:true }, garPetit:{ fontSize:9, color:COUL_PDF.gris },
      garTitre:{ fontSize:24, bold:true, alignment:'center', characterSpacing:2 },
      garObjet:{ fontSize:13, alignment:'center', color:COUL_PDF.gris, margin:[30,10,30,0] },
      garTheme:{ fontSize:9, alignment:'center', color:COUL_PDF.accent, characterSpacing:1 },
      surtitre:{ fontSize:9, bold:true, color:COUL_PDF.accent, characterSpacing:1.5 },
      h1:{ fontSize:18, bold:true, margin:[0,2,0,14] },
      h2:{ fontSize:11.5, bold:true, margin:[0,12,0,5] },
      h3:{ fontSize:11, bold:true, color:COUL_PDF.accent, margin:[0,14,0,6] },
      corps:{ alignment:'justify', margin:[0,0,0,6] },
      th:{ bold:true, fontSize:9, color:COUL_PDF.gris, fillColor:COUL_PDF.fond }
    }
  };
}
function cleValeur(lab,val){ return { stack:[{ text:lab.toUpperCase(), fontSize:7.5, bold:true, color:COUL_PDF.gris, characterSpacing:0.6 },{ text:String(val==null||val===''?'—':val), fontSize:10.5, margin:[0,2,0,0] }] }; }
function tableauPdf(entetes, largeurs, lignes){
  return { table:{ headerRows:1, widths:largeurs, body:[entetes.map(function(e){ return { text:e, style:'th' }; })].concat(lignes.length?lignes:[[{ text:'—', colSpan:entetes.length }].concat(entetes.slice(1).map(function(){ return ''; }))]) },
    layout:{ hLineWidth:function(i){ return i===1?0.8:0.4; }, vLineWidth:function(){ return 0; }, hLineColor:function(){ return COUL_PDF.trait; },
      paddingTop:function(){ return 5; }, paddingBottom:function(){ return 5; } }, fontSize:9.5, margin:[0,0,0,6] };
}

/* Génère le PDF ; retourne une promesse de Blob. */
function genererPdfDossier(){
  return chargerPdfmake().then(function(){ return window.pdfMake.createPdf(definitionDossier()).getBlob(); });
}
function nomFichierDossier(){ return REF().replace(/[^\w.-]+/g,'-')+'-dossier-appel-offres.pdf'; }

/* Le document dans une fenêtre (lecteur PDF du navigateur : pages, zoom, impression). */
function ouvrirDossierPdf(){
  var etat={ url:null, erreur:null };
  ouvrirFenetre((state.cdc.cdcPublie?'Dossier d’appel d’offres — ':'Aperçu du dossier — ')+REF(), function(corps, pied){
    if(etat.erreur){ add(corps,'p','warn',etat.erreur); return; }
    if(!etat.url){ add(corps,'p','muted','Mise en page du document…').setAttribute('role','status'); return; }
    var f=add(corps,'iframe','dossier-pdf'); f.src=etat.url; f.title='Dossier d’appel d’offres '+REF();
    var dl=add(pied,'a','btn btn-ghost','Télécharger le PDF'); dl.href=etat.url; dl.download=nomFichierDossier();
    var fe=add(pied,'button','btn btn-primary','Fermer'); fe.setAttribute('data-consult',''); fe.addEventListener('click',fermerFenetre);
  }, { large:true });
  genererPdfDossier().then(function(b){ etat.url=URL.createObjectURL(b); dessinerFenetre(); })
    .catch(function(e){ etat.erreur='Le document n’a pas pu être généré : '+(e.message||e); dessinerFenetre(); });
}
function telechargerDossierPdf(){
  genererPdfDossier().then(function(b){
    var u=URL.createObjectURL(b), a=document.createElement('a'); a.href=u; a.download=nomFichierDossier(); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(u); },60000);
  }).catch(function(e){ toast('Le document n’a pas pu être généré : '+(e.message||e)); });
}

/* Écran du dossier publié : la page de garde en vignette, le document entier à la demande. */
function vDossierPublie(m){
  var c=state.cdc, org=state.org||{}, th=themeDossier(c), illu=ILLUSTRATIONS[th]||ILLUSTRATIONS.generique;
  var carte=add(m,'section','card doc-carte'); carte.setAttribute('aria-label','Dossier d’appel d’offres');
  var barre=add(carte,'div','doc-barre');
  add(barre,'span','doc-barre-lab','Dossier d’appel d’offres — '+REF());
  chipCellule(barre,'Publié','c-green');
  boutonIcone(barre,'download','Télécharger le PDF',telechargerDossierPdf,'dossier-telecharger').setAttribute('data-consult','');
  var voir=boutonIcone(barre,'agrandir','Ouvrir le document',ouvrirDossierPdf,'dossier-voir'); voir.setAttribute('data-consult','');

  var scene=add(carte,'div','doc-scene dossier-scene');
  var garde=add(scene,'button','dossier-garde'); garde.type='button'; garde.setAttribute('data-consult',''); garde.setAttribute('aria-label','Ouvrir le dossier d’appel d’offres');
  garde.addEventListener('click',ouvrirDossierPdf);
  var et=add(garde,'div','dg-entete'); var eg=add(et,'div'); add(eg,'strong',null,c.autorite||org.nom||''); add(eg,'span',null,[org.ville,org.pays].filter(Boolean).join(' · '));
  add(et,'span','dg-ref','Réf. '+REF());
  add(garde,'div','dg-titre','Dossier d’appel d’offres');
  add(garde,'div','dg-objet',c.objet||'');
  var im=add(garde,'div','dg-illu'); im.innerHTML=illu.svg; // illustration du thème (dessin fixe de l'application)
  add(garde,'div','dg-theme',illu.lab);
  var info=add(garde,'div','dg-infos');
  [['Procédure',c.procedure],['Date limite de dépôt',dateLongue(c.ouverture)],['Lots',(c.lots||[]).length+' lot(s)']].forEach(function(x){
    var d=add(info,'div'); add(d,'span',null,x[0]); add(d,'strong',null,x[1]||'—'); });
  var cote=add(scene,'div','dossier-cote');
  add(cote,'p',null,'Le dossier complet : page de garde, sommaire, informations clés, puis les sept pièces (avis, règlement de la consultation, clauses administratives et techniques, bordereau des prix, cadre du mémoire technique, modèles).');
  var b1=add(cote,'button','btn btn-primary','Ouvrir le document'); fk(b1,'dossier-ouvrir'); b1.setAttribute('data-consult',''); b1.addEventListener('click',ouvrirDossierPdf);
  var b2=add(cote,'button','btn btn-ghost','Télécharger le PDF'); fk(b2,'dossier-pdf'); b2.setAttribute('data-consult',''); b2.addEventListener('click',telechargerDossierPdf);
}
