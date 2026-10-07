/* Marché+ — Lettres de résultat : une lettre par soumissionnaire (offre retenue, non retenue, écartée, consultation
   infructueuse), en PDF généré dans le navigateur par pdfmake (comme le dossier, dossier-pdf.js). Le fournisseur
   télécharge la sienne depuis son espace ; l'acheteur, celles de tous les soumissionnaires en un seul document.
   La lettre ne nomme pas les concurrents.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

/* Corps de la lettre selon le résultat ; lettre : { nom, pays, contact, montant, devise, resultat }. */
function paragraphesLettre(l, c){
  var r=l.resultat||{}, ref=c.ref||REF(), obj=c.objet||'';
  var intro='Vous avez répondu à l’appel d’offres '+ref+' ayant pour objet : '+obj+'.';
  var J=(state.standstill||{}).days;
  var recours='Si vous contestez cette décision, vous pouvez nous adresser une réclamation motivée '+(l.horsPlateforme?'par écrit au service des achats':'depuis votre espace fournisseur')+(J?', dans un délai de '+J+' jours à compter de la présente notification':'')+'.';
  if(r.statut==='retenue') return [intro,
    'Nous avons le plaisir de vous informer que votre offre est retenue'+(l.montant?', pour un montant de '+sep(l.montant)+' '+(l.devise||'XOF')+' hors taxes':'')+'. Elle est classée première sur '+r.nb+' offre(s) conforme(s)'+(r.total!=null?', avec une note de '+String(r.total).replace('.',',')+'/100':'')+'.',
    'Nos services prendront prochainement contact avec vous pour la mise au point du marché et l’émission du bon de commande. Votre offre vous engage jusqu’à cette étape.'];
  if(r.statut==='non_retenue') return [intro,
    'Nous vous informons que votre offre n’a pas été retenue. Elle est classée '+r.rang+'e sur '+r.nb+' offre(s) conforme(s), avec une note de '+String(r.total).replace('.',',')+'/100'+(r.attributaire?' ; l’offre retenue a obtenu '+String(r.attributaire.total).replace('.',',')+'/100':'')+'.',
    recours, 'Nous vous remercions de l’intérêt porté à cette consultation.'];
  if(r.statut==='ecartee') return [intro,
    'Nous vous informons que votre offre a été écartée avant notation. '+String(r.motif||'').replace(/^Offre écartée — /,'Motif : ')+(/\.$/.test(r.motif||'')?'':'.'),
    recours, 'Nous vous remercions de l’intérêt porté à cette consultation.'];
  if(r.statut==='infructueux') return [intro,
    String(r.motif||'La consultation a été déclarée infructueuse.'),
    'Nous vous remercions de votre participation. Une nouvelle consultation pourra être lancée ; vous en serez informé si votre entreprise est concernée.'];
  return [intro, String(r.motif||'')];
}

/* Définition pdfmake : une lettre par page. */
function definitionLettres(lettres){
  var c=state.cdc||{}, org=state.org||{}, lieu=[org.ville,org.pays].filter(Boolean).join(', ');
  var date=new Date().toLocaleDateString('fr-FR',{ day:'numeric', month:'long', year:'numeric' });
  var contenu=[];
  lettres.forEach(function(l,i){
    contenu.push(
      { columns:[
        { stack:[{ text:org.nom||c.autorite||'', bold:true, fontSize:12 },{ text:'Service des achats', fontSize:9, color:COUL_PDF.gris },{ text:lieu, fontSize:9, color:COUL_PDF.gris }] },
        { stack:[{ text:(lieu?(org.ville||lieu)+', le ':'Le ')+date, alignment:'right', fontSize:10 },{ text:'Réf. '+(c.ref||REF()), alignment:'right', fontSize:9, color:COUL_PDF.gris }] }
      ], pageBreak: i ? 'before' : undefined },
      { canvas:[{ type:'line', x1:0, y1:6, x2:495, y2:6, lineWidth:1.5, lineColor:COUL_PDF.accent }], margin:[0,0,0,26] },
      { stack:[{ text:l.nom, bold:true },{ text:l.pays||'' },{ text:l.contact?'À l’attention de '+l.contact:'' }], margin:[280,0,0,26], fontSize:10.5 },
      { text:[{ text:'Objet : ', bold:true },'résultat de l’appel d’offres '+(c.ref||REF())], margin:[0,0,0,16] },
      { text:'Madame, Monsieur,', margin:[0,0,0,10] }
    );
    paragraphesLettre(l,c).forEach(function(p){ contenu.push({ text:p, style:'corps' }); });
    contenu.push(
      { text:'Nous vous prions d’agréer, Madame, Monsieur, l’expression de nos salutations distinguées.', style:'corps', margin:[0,6,0,30] },
      { text:'Le service des achats', alignment:'right' },
      { text:org.nom||c.autorite||'', alignment:'right', bold:true }
    );
  });
  return { pageSize:'A4', pageMargins:[50,60,50,60], content:contenu,
    info:{ title:'Résultat de l’appel d’offres '+(c.ref||REF()), author:org.nom||'' },
    footer:function(p,n){ return { text:'Marché+ — lettre générée le '+date+(n>1?' — page '+p+' / '+n:''), alignment:'center', fontSize:7.5, color:COUL_PDF.gris, margin:[0,20,0,0] }; },
    styles:{ corps:{ fontSize:10.5, lineHeight:1.3, alignment:'justify', margin:[0,0,0,10] } },
    defaultStyle:{ fontSize:10.5, color:COUL_PDF.encre } };
}

/* Téléchargement des lettres (pdfmake chargé à la demande). */
function telechargerLettres(lettres, nomFichier){
  if(!lettres.length){ toast('Aucune lettre à produire.'); return; }
  toast('Préparation de la lettre…');
  chargerPdfmake().then(function(){ pdfMake.createPdf(definitionLettres(lettres)).download(nomFichier); })
    .catch(function(e){ toast(e.message||'Génération impossible.'); });
}

/* Lettres de tous les soumissionnaires (acheteur), d'après le classement et les exclusions. */
function lettresSoumissionnaires(){
  var ctx=Object.assign(RCTX(),{ evalDone:state.evalDone, approvals:state.approvals });
  return SEED_OFFERS.map(function(o){
    var r = state.infructueux ? { statut:'infructueux', motif:'La consultation a été déclarée infructueuse'+(state.infructueux.motif?' : '+state.infructueux.motif:'')+'.' } : R.resultatOffre(ctx,o.id);
    return r && { nom:o.name, pays:o.pays, contact:o.contact, montant:o.montant, devise:o.devise, resultat:r, horsPlateforme:!o.submitted };
  }).filter(Boolean);
}
