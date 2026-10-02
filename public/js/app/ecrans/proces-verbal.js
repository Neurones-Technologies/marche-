/* Marché+ — Écran Procès-verbal.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

function vPV(m){
  if(!allApproved()) return locked(m,"Le procès-verbal est généré une fois les niveaux d'approbation franchis.",'decision',"Aller au circuit d'approbation");
  var rows=ranking(), win=rows[0], c=state.cdc;
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'div','eyebrow',REF()); add(l,'h1',null,"Procès-verbal d'attribution");
  add(l,'p','lede',"Brouillon généré à partir des données validées à chaque étape. Il reste à relire et à signer — le document produit par le système est un projet, jamais un acte définitif.");
  add(h,'button','btn btn-ghost btn-sm','Imprimer / exporter').addEventListener('click',function(){ imprimer(); });

  var card=add(m,'div','card pad'); var pv=add(card,'div','pv');
  add(pv,'div',null,'PROCÈS-VERBAL D\u2019ANALYSE ET D\u2019ATTRIBUTION').style.cssText='font-weight:700;font-size:15px;color:var(--ink)';
  add(pv,'div',null,'Référence : '+REF()+' — '+c.objet).style.marginTop='4px';
  add(pv,'div',null, c.autorite+' — '+c.procedure+' — ouverture des plis : '+c.ouverture);

  add(pv,'h4',null,'1. Offres reçues et conversion');
  add(pv,'p',null,'Taux arrêtés à la date d\u2019ouverture : 1 EUR = 655,957 XOF ; 1 USD = 601,40 XOF.');
  var u=add(pv,'ul');
  SEED_OFFERS.forEach(function(o){
    add(u,'li',null, o.name+' ('+o.pays+') — '+sep(o.montant)+' '+o.devise+' soit '+xof(montantXOF(o))+' — délai '+o.delai+' jours'+(excluded(o)?' — écartée':''));
  });

  add(pv,'h4',null,'2. Conformité administrative');
  add(pv,'p',null, conformes().length+' offre(s) déclarée(s) conforme(s) sur '+SEED_OFFERS.length+'. Les pièces exigées varient selon que le soumissionnaire est établi en Côte d\u2019Ivoire, dans l\u2019espace UEMOA ou hors zone.');
  var u0=add(pv,'ul');
  SEED_OFFERS.filter(excluded).forEach(function(o){
    var mis=missingDocs(o);
    add(u0,'li',null, o.name+' — '+(mis.length? mis.map(function(d){return d.label;}).join(' ; ') : 'écartée par décision du comité'));
  });

  add(pv,'h4',null,'3. Préférence communautaire');
  add(pv,'p',null, c.prefActive
    ? 'Une marge de préférence de '+c.prefTaux+' % a été appliquée en faveur des soumissionnaires établis dans l\u2019espace UEMOA, aux seules fins de comparaison des offres.'
    : 'Aucune marge de préférence communautaire n\u2019a été appliquée.');

  add(pv,'h4',null,'4. Grille d\u2019évaluation appliquée');
  add(pv,'p',null, state.criteria.map(function(x){ return x.label+' ('+x.weight+' %)'; }).join(' · '));

  add(pv,'h4',null,'5. Classement');
  var ol=add(pv,'ol');
  rows.forEach(function(r){ add(ol,'li',null, r.o.name+' ('+r.o.pays+') — '+r.total.toFixed(1)+'/100'); });

  add(pv,'h4',null,'6. Attribution proposée');
  add(pv,'p',null,'Le marché est proposé à l\u2019attribution en faveur de '+win.o.name+' ('+win.o.pays+'), pour un montant de '+sep(win.o.montant)+' '+win.o.devise+' soit '+xof(montantXOF(win.o))+', et un délai d\u2019exécution de '+win.o.delai+' jours.');
  if(!isUemoa(win.o)) add(pv,'p',null,'L\u2019attributaire n\u2019étant pas établi dans l\u2019espace UEMOA, le marché est soumis à la retenue à la source de '+c.retenueNonResident+' % sur les prestations de source locale ; les droits et taxes à l\u2019importation sont à la charge de : '+c.douaneACharge+'.');

  add(pv,'h4',null,'7. Approbations recueillies');
  var u2=add(pv,'ul'); state.approvals.forEach(function(a){ add(u2,'li',null, a.role+' — '+a.who+' — approuvé'); });

  add(pv,'h4',null,'8. Questions, additifs et clarifications');
  add(pv,'p',null, state.qa.length+' question(s) de candidats traitée(s) · '+state.additifs.length+' additif(s) publié(s) · '+state.clarifs.length+' demande(s) de clarification, sans modification de prix ni de contenu des offres.');

  add(pv,'h4',null,'9. Déclarations de conflit d\u2019intérêts');
  var dcl=Object.keys(state.coi);
  if(!dcl.length) add(pv,'p',null,'Aucune déclaration enregistrée à ce stade.');
  else { var ud=add(pv,'ul'); dcl.forEach(function(uid){
    var u=null; state.users.forEach(function(x){ if(x.id===uid) u=x; });
    var d=state.coi[uid];
    add(ud,'li',null,(u?u.nom:uid)+' — '+(d.conflit?'conflit déclaré, déport de la notation':'absence de conflit déclarée')+' le '+d.t);
  }); }

  add(pv,'h4',null,'10. Recours');
  if(!state.recours.length) add(pv,'p',null, state.standstill.startedAt? 'Aucun recours déposé dans le délai ouvert.' : 'Délai de recours non encore ouvert à la date du présent procès-verbal.');
  else { var ur=add(pv,'ul'); state.recours.forEach(function(r){
    add(ur,'li',null, r.de+' — '+r.objet+' — '+(r.statut==='ouvert'?'en instruction':(r.statut==='rejete'?'rejeté':'déclaré fondé'))); }); }

  add(pv,'h4',null,'11. Traçabilité');
  add(pv,'p',null, state.audit.length+' action(s) consignée(s) dans la piste d\u2019audit, dont les confirmations d\u2019extraction, les décisions de conformité et les écarts motivés entre score proposé et score retenu.');
}
