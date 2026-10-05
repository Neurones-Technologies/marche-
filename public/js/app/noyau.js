/* Marché+ — Noyau : référentiels, état synchronisé avec l'API, aides DOM, habilitations, notifications, cycle de vie, navigation.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

/* ============ Référentiels ============ */
var RATES_DEF = { XOF:1, EUR:655.957, USD:601.4, GHS:41.2, NGN:0.39 };
function RATE(d){ var r=(state && state.fxFrozen && state.fxFrozen.rates) || (state && state.org && state.org.rates) || RATES_DEF; return r[d]||1; }
function DOCS(){ return (state && state.docDefs) ? state.docDefs : DOC_DEFS; }

/* --- Habilitations : catalogue des permissions --- */
var PERMS = [
  {id:'cdc.edit',        lab:"Rédiger le cahier des charges",       grp:'Préparation'},
  {id:'cdc.publish',     lab:"Publier le cahier des charges",       grp:'Préparation'},
  {id:'criteres.edit',   lab:"Définir la grille de critères",       grp:'Préparation'},
  {id:'portail.use',     lab:"Déposer une offre (soumissionnaire)", grp:'Soumission'},
  {id:'offres.read',     lab:"Consulter les offres reçues",         grp:'Traitement'},
  {id:'depouille.confirm',lab:"Confirmer les données extraites",    grp:'Traitement'},
  {id:'depouille.close', lab:"Clôturer le dépouillement",           grp:'Traitement'},
  {id:'conformite.decide',lab:"Écarter ou réintégrer une offre",    grp:'Traitement'},
  {id:'eval.score',      lab:"Noter les offres",                    grp:'Décision'},
  {id:'eval.validate',   lab:"Valider l'évaluation",                grp:'Décision'},
  {id:'decision.approve',lab:"Approuver l'attribution",             grp:'Décision'},
  {id:'pv.read',         lab:"Consulter le procès-verbal",          grp:'Décision'},
  {id:'audit.read',      lab:"Consulter la piste d'audit",          grp:'Contrôle'},
  {id:'params.edit',     lab:"Modifier les paramètres",             grp:'Administration'},
  {id:'roles.edit',      lab:"Gérer les rôles et habilitations",    grp:'Administration'},
  {id:'notif.manage',    lab:"Configurer les notifications",        grp:'Administration'},
  {id:'qa.answer',       lab:"Répondre aux candidats et publier des additifs", grp:'Préparation'},
  {id:'clarif.send',     lab:"Demander une clarification à un soumissionnaire", grp:'Traitement'},
  {id:'recours.handle',  lab:"Instruire un recours",                grp:'Décision'},
  {id:'contract.sign',   lab:"Signer le marché",                    grp:'Décision'},
  {id:'besoin.create',   lab:"Exprimer une demande d’achat",       grp:'Demandes d’achat'},
  {id:'besoin.approve',  lab:"Valider une demande d’achat",        grp:'Demandes d’achat'},
  {id:'besoin.manage',   lab:"Instruire les demandes d’achat et en faire des procédures", grp:'Demandes d’achat'},
  {id:'partenaires.manage', lab:"Référencer les partenaires",          grp:'Partenaires'},
  {id:'commande.manage', lab:"Établir et émettre les bons de commande", grp:'Exécution'},
  {id:'commande.approve',lab:"Valider un bon de commande",          grp:'Exécution'}
];
/* Incompatibilites : separation des fonctions */
/* Cumuls d'habilitations à éviter (séparation des fonctions) : [habilitation, habilitation, pourquoi]. */
var INCOMPAT = [
  ['eval.score','decision.approve', "Qui note les offres ne devrait pas aussi approuver l'attribution : plus personne ne contrôlerait sa notation."],
  ['cdc.publish','portail.use',     "Qui publie le dossier ne peut pas aussi déposer une offre : il connaîtrait le dossier avant les autres candidats."],
  ['eval.validate','decision.approve', "Qui valide l'évaluation ne devrait pas aussi l'approuver : il validerait son propre travail."]
];
/* « Noter les offres » et « Approuver l'attribution » : les deux habilitations d'un cumul, en clair. */
function cumulLab(x){
  function lab(id){ var p=PERMS.filter(function(q){ return q.id===id; })[0]; return '« '+(p?p.lab:id)+' »'; }
  return lab(x[0])+' et '+lab(x[1]);
}
function permsDef(list){ var o={}; PERMS.forEach(function(p){ o[p.id]= list.indexOf(p.id)>=0; }); return o; }
function ROLES_DEF(){
  return {
    admin:    { lab:'Administrateur fonctionnel', perms:permsDef(PERMS.map(function(p){return p.id;})) },
    achats:   { lab:'Responsable des achats',     perms:permsDef(['cdc.edit','cdc.publish','criteres.edit','offres.read','depouille.confirm','depouille.close','conformite.decide','pv.read','audit.read','qa.answer','clarif.send','recours.handle']) },
    evaltech: { lab:'Évaluateur technique',       perms:permsDef(['offres.read','eval.score','pv.read']) },
    evalfin:  { lab:'Évaluateur financier',       perms:permsDef(['offres.read','depouille.confirm','eval.score','eval.validate','pv.read']) },
    approb:   { lab:"Membre du comité d'engagement", perms:permsDef(['offres.read','decision.approve','pv.read','audit.read','recours.handle','contract.sign']) },
    audit:    { lab:'Auditeur interne (lecture)', perms:permsDef(['offres.read','pv.read','audit.read']) },
    soum:     { lab:'Soumissionnaire',            perms:permsDef(['portail.use']) },
    demandeur:{ lab:'Demandeur (service interne)', perms:permsDef(['besoin.create']) }
  };
}
var EVENTS = [
  {id:'cdc.publie',    lab:"Cahier des charges publié",          def:{inapp:true, email:true,  roles:['achats','soum','audit']}},
  {id:'depot.recu',    lab:"Nouveau dépôt reçu",                 def:{inapp:true, email:true,  roles:['achats']}},
  {id:'verif.requise', lab:"Champs à vérifier signalés",         def:{inapp:true, email:false, roles:['achats','evalfin']}},
  {id:'anomalie',      lab:"Anomalie critique détectée",         def:{inapp:true, email:true,  roles:['achats','audit']}},
  {id:'offre.ecartee', lab:"Offre écartée pour non-conformité",  def:{inapp:true, email:true,  roles:['achats','audit']}},
  {id:'dep.cloture',   lab:"Dépouillement clôturé",              def:{inapp:true, email:true,  roles:['achats','evaltech','evalfin']}},
  {id:'eval.validee',  lab:"Évaluation validée",                 def:{inapp:true, email:true,  roles:['achats','approb']}},
  {id:'appro.attendue',lab:"Approbation attendue",               def:{inapp:true, email:true,  roles:['approb']}},
  {id:'attribution',   lab:"Attribution prononcée",              def:{inapp:true, email:true,  roles:['achats','approb','audit','soum']}},
  {id:'ecart.ia',      lab:"Écart avec un score proposé par l'IA",def:{inapp:true, email:false, roles:['audit']}},
  {id:'question.recue',lab:"Question d'un candidat reçue",         def:{inapp:true, email:false, roles:['achats']}},
  {id:'additif.publie',lab:"Additif publié au dossier",            def:{inapp:true, email:true,  roles:['achats','soum','audit']}},
  {id:'clarif.envoyee',lab:"Demande de clarification envoyée",     def:{inapp:true, email:true,  roles:['achats','soum']}},
  {id:'coi.declare',   lab:"Déclaration de conflit d'intérêts",    def:{inapp:true, email:false, roles:['achats','audit']}},
  {id:'standstill',    lab:"Ouverture du délai de recours",        def:{inapp:true, email:true,  roles:['achats','soum','audit']}},
  {id:'recours.depose',lab:"Recours déposé — signature suspendue", def:{inapp:true, email:true,  roles:['achats','approb','audit']}},
  {id:'infructueux',   lab:"Procédure déclarée infructueuse",      def:{inapp:true, email:true,  roles:['achats','soum','audit']}}
];
function notifRulesDef(){ var o={}; EVENTS.forEach(function(e){ o[e.id]=JSON.parse(JSON.stringify(e.def)); }); return o; }

/* Les offres, le CDC, les critères et le circuit d'approbation viennent de l'API. */
var SEED_OFFERS = [];
var META = {};

var DOC_DEFS = [
  { id:'registre',     label:'Registre du commerce (RCCM ou équivalent)', scope:'tous' },
  { id:'fiscal',       label:'Attestation de régularité fiscale',          scope:'tous' },
  { id:'cnps',         label:'Attestation organisme de prévoyance sociale (CNPS)', scope:'local' },
  { id:'caution',      label:'Caution de soumission',                      scope:'tous' },
  { id:'traduction',   label:'Traduction française certifiée des pièces',  scope:'etranger' },
  { id:'legalisation', label:'Légalisation consulaire ou apostille',       scope:'etranger' },
  { id:'contreGarantie',label:'Contre-garantie par une banque agréée UEMOA', scope:'etranger' },
  { id:'representation',label:'Engagement de représentation locale',        scope:'etranger' }
];

/* ============ État (synchronisé avec l'API) ============ */
var state = null;
var UI = { q:'', sort:'nom' };
/* Clés partagées avec le serveur ; view / offerIndex / draft restent propres à chaque session. */
var SYNC_KEYS = ['cdc','criteria','quality','justif','confirmed','excluded','depClosed','evalDone','org','seuils','docDefs','roles','users',
  'notifRules','notifs','emails','qa','additifs','clarifs','coi','recours','standstill','contractSigned','infructueux',
  'mailFrom','mailSuffix','approvals','offers','circuitModele','circuitBesoin','circuitReferencement','circuitCommande','evaluationPartenaires'];
var SERVER_ONLY = ['delegations','affectations','audit','receipts','fxFrozen','cadre','rejets','monPartenaire','evaluationsOffres','courriels'];
/* Notes, justifications, confirmations et décisions de conformité s'écrivent une par une par les routes ciblées
   (cibler ci-dessous) : elles ne partent jamais dans l'envoi en bloc, et la valeur du serveur fait toujours foi. */
var TARGETED = ['quality','justif','confirmed','excluded'];
var synced = {}, revs = {}, serverRev = 0, flushing = false, dirty = false, flushTimer = null;
var EMPTY_DRAFT = function(){ return { name:'', iso:'CI', devise:'XOF', montant:'', delai:'', garantie:'', refsCount:'', lots:[], docs:{} }; };
function uiKey(){ return 'marcheplus.ui.'+(state?state.me:''); }
function saveUI(){ try{ localStorage.setItem(uiKey(), JSON.stringify({view:state.view, offerIndex:state.offerIndex, draft:state.draft})); }catch(e){} }
function loadUI(){ try{ return JSON.parse(localStorage.getItem(uiKey())||'null')||{}; }catch(e){ return {}; } }
function snapAll(){ SYNC_KEYS.forEach(function(k){ synced[k]=JSON.stringify(state[k]); }); }
function applyServer(payload, keepPending){
  var st=payload.state, first=!state;
  if(first){ state={ view:'dashboard', offerIndex:0, draft:EMPTY_DRAFT() }; }
  SYNC_KEYS.concat(SERVER_ONLY).concat(['me','procedure']).forEach(function(k){
    if(!(k in st)) return;
    var pending = !first && keepPending && SYNC_KEYS.indexOf(k)>=0 && TARGETED.indexOf(k)<0 && JSON.stringify(state[k])!==synced[k];
    if(pending) return;
    if(k==='offers'){ SEED_OFFERS.length=0; st.offers.forEach(function(o){ SEED_OFFERS.push(o); }); state.offers=SEED_OFFERS; }
    else state[k]=st[k];
    if(SYNC_KEYS.indexOf(k)>=0) synced[k]=JSON.stringify(state[k]);
  });
  if(first){ var u=loadUI(); if(u.view) state.view=u.view; if(u.offerIndex!=null) state.offerIndex=u.offerIndex; if(u.draft) state.draft=u.draft; }
  state.submitted=[];
  SEED_OFFERS.forEach(function(o){ if(!state.quality[o.id]) state.quality[o.id]={metho:o.aiMetho, refs:o.aiRefs}; });
  if(state.offerIndex>=SEED_OFFERS.length) state.offerIndex=0;
  revs=payload.revs||revs; serverRev=payload.rev||serverRev;
  if(first || !keepPending){ SYNC_KEYS.forEach(function(k){ if(JSON.stringify(state[k])!==synced[k] && !keepPending) synced[k]=JSON.stringify(state[k]); }); }
}
function save(){ saveUI(); dirty=true; if(flushTimer) clearTimeout(flushTimer); flushTimer=setTimeout(flush,250); }
function flush(){
  if(flushing || !dirty || !state || UI.verrouille) return; // session verrouillée : l'envoi attend le déverrouillage
  var changes={}, sent={};
  SYNC_KEYS.forEach(function(k){ if(TARGETED.indexOf(k)>=0) return; var j=JSON.stringify(state[k]); if(j!==synced[k]){ changes[k]=state[k]; sent[k]=j; } });
  dirty=false;
  if(!Object.keys(changes).length) return;
  flushing=true;
  return MP.api('PATCH',MP.url('/state'),{changes:changes, base:revs}).then(function(r){
    Object.keys(sent).forEach(function(k){ synced[k]=sent[k]; if(r.revs && r.revs[k]) revs[k]=r.revs[k]; });
    serverRev=r.rev;
  }).catch(function(err){
    toast(err.message||'Enregistrement impossible.');
    return MP.api('GET',MP.url('/state')).then(function(p){ applyServer(p,false); render(); });
  }).then(function(){ flushing=false; if(dirty) flush(); });
}
/* Écriture ciblée : la réponse porte les valeurs enregistrées par le serveur. En cas de refus, message et
   rechargement ; la promesse renvoie alors null (l'appelant ne journalise rien). */
function retenir(r){
  Object.keys(r.values||{}).forEach(function(k){ state[k]=r.values[k]; synced[k]=JSON.stringify(r.values[k]); if(r.revs && r.revs[k]) revs[k]=r.revs[k]; });
  if(r.rev) serverRev=r.rev;
}
function cibler(method, path, body){
  // toujours un corps JSON : une écriture sans en-tête JSON est refusée (protection CSRF du serveur)
  return MP.api(method, MP.url(path), body||{}).then(function(r){ retenir(r); render(); return r; })
    .catch(function(err){
      toast(err.message||'Enregistrement impossible.');
      return MP.api('GET',MP.url('/state')).then(function(p){ applyServer(p,false); render(); return null; }).catch(function(){ return null; });
    });
}
/* Remplacement de clés entières (« Rétablir les scores IA ») : refusé si quelqu'un a écrit entre-temps. */
function ecrireBloc(changes){
  var base={}; Object.keys(changes).forEach(function(k){ base[k]=revs[k]; });
  return MP.api('PATCH',MP.url('/state'),{changes:changes, base:base}).then(function(r){
    Object.keys(changes).forEach(function(k){ synced[k]=JSON.stringify(changes[k]); if(r.revs && r.revs[k]) revs[k]=r.revs[k]; });
    if(r.rev) serverRev=r.rev; return r;
  }).catch(function(err){
    toast(err.message||'Enregistrement impossible.');
    return MP.api('GET',MP.url('/state')).then(function(p){ applyServer(p,false); render(); return null; }).catch(function(){ return null; });
  });
}
var enc=encodeURIComponent;
function poll(){
  if(!state || flushing || dirty) return Promise.resolve();
  return MP.api('GET',MP.url('/state?since='+serverRev)).then(function(p){
    if(p.unchanged) return;
    var ae=document.activeElement;
    // ne pas perturber une saisie en cours (la recherche d'un tableau, elle, survit au rendu)
    if(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.closest && ae.closest('#main') && !ae.classList.contains('dt-recherche') && !ae.closest('.dt-outils')) return;
    applyServer(p,true);
    return MP.refreshProcs().then(render); // une autre procédure a pu être créée, publiée ou archivée
  }).catch(function(){});
}

var TOAST_T=null;
function toast(msg){
  var t=document.getElementById('toast'); if(!t) return;
  t.textContent=msg; t.classList.add('on');
  if(TOAST_T) clearTimeout(TOAST_T);
  TOAST_T=setTimeout(function(){ t.classList.remove('on'); },3200);
}
function logit(a){
  var u=me(), who=u.nom+' — '+((state.roles[u.role]&&state.roles[u.role].lab)||u.role);
  state.audit.unshift({ t:new Date().toLocaleString('fr-FR'), who:who, a:a });
  if (state.audit.length>200) state.audit.length=200;
  MP.api('POST',MP.url('/audit'),{a:a}).catch(function(){});
  toast(a);
}
/* Conserve le focus clavier et la position de defilement au travers d'un rendu */
function fk(e,key){ e.setAttribute('data-fk',key); return e; }
/* window.confirm est bloque dans l'iframe d'execution : boite de dialogue interne */
/* Demande un texte (motif d'un rejet…) ; onOk(texte) n'est appelé qu'avec un texte non vide. */
function demander(msg, onOk, titre, libelleOui, etiquette){
  var prev=document.activeElement;
  var ov=el('div','modal-ov');
  var bx=el('div','modal');
  bx.setAttribute('role','dialog'); bx.setAttribute('aria-modal','true'); bx.setAttribute('aria-label', titre||'Saisie');
  add(bx,'h3',null,titre||'Saisie');
  add(bx,'p',null,msg);
  var lb=add(bx,'label',null,etiquette||'Motif'); lb.setAttribute('for','dlg-texte');
  var ta=add(bx,'textarea'); ta.id='dlg-texte'; ta.rows=3; ta.style.width='100%'; ta.maxLength=1000;
  var act=add(bx,'div','modal-act');
  var no=add(act,'button','btn btn-ghost','Annuler');
  var yes=add(act,'button','btn btn-primary', libelleOui||'Valider');
  function close(){
    document.removeEventListener('keydown',key,true);
    if(ov.parentNode) ov.parentNode.removeChild(ov);
    if(prev && prev.focus) try{ prev.focus(); }catch(e){}
  }
  function key(e){
    if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); close(); }
    else if(e.key==='Tab'){
      var f=[ta,no,yes], i=f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey?-1:1) + f.length) % f.length].focus();
    }
  }
  no.addEventListener('click',close);
  yes.addEventListener('click',function(){
    var t=ta.value.trim();
    if(!t){ ta.focus(); toast('Le motif est obligatoire.'); return; }
    close(); onOk(t);
  });
  ov.addEventListener('click',function(e){ if(e.target===ov) close(); });
  document.addEventListener('keydown',key,true);
  ov.appendChild(bx); document.body.appendChild(ov);
  ta.focus();
}
function ask(msg, onYes, titre, libelleOui){
  var prev=document.activeElement;
  var ov=el('div','modal-ov');
  var bx=el('div','modal');
  bx.setAttribute('role','dialog'); bx.setAttribute('aria-modal','true');
  var h=add(bx,'h3',null,titre||'Confirmation');
  bx.setAttribute('aria-label', titre||'Confirmation');
  add(bx,'p',null,msg);
  var act=add(bx,'div','modal-act');
  var no=add(act,'button','btn btn-ghost','Annuler');
  var yes=add(act,'button','btn btn-primary', libelleOui||'Confirmer');
  function close(){
    document.removeEventListener('keydown',key,true);
    if(ov.parentNode) ov.parentNode.removeChild(ov);
    if(prev && prev.focus) try{ prev.focus(); }catch(e){}
  }
  function key(e){
    if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); close(); }
    else if(e.key==='Tab'){
      var f=[no,yes], i=f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey?-1:1) + f.length) % f.length].focus();
    }
  }
  no.addEventListener('click',close);
  yes.addEventListener('click',function(){ close(); if(onYes) onYes(); });
  ov.addEventListener('click',function(e){ if(e.target===ov) close(); });
  document.addEventListener('keydown',key,true);
  ov.appendChild(bx); document.body.appendChild(ov);
  yes.focus();
}
/* L'impression peut etre bloquee par le bac a sable : on le signale au lieu de rester muet */
function imprimer(){
  try{ window.print(); }
  catch(e){ toast("Si la fenêtre d'impression ne s'ouvre pas, utilisez l'impression de votre navigateur (Ctrl+P ou Cmd+P)."); }
}

/* ============ Helpers ============ */
function el(t,c,x){ var e=document.createElement(t); if(c)e.className=c; if(x!=null)e.textContent=x; return e; }
/* Rend un tableau lisible en fiches sur petit écran : chaque cellule porte son en-tête */
function labelize(t){
  try{
    var ths=t.querySelectorAll('thead th'), heads=[];
    for(var i=0;i<ths.length;i++) heads.push(ths[i].textContent||'');
    var trs=t.querySelectorAll('tbody tr');
    for(var r=0;r<trs.length;r++){
      var tds=trs[r].children;
      for(var c=0;c<tds.length;c++){
        if(tds[c].getAttribute && tds[c].getAttribute('colspan')) continue;
        if(heads[c]) tds[c].setAttribute('data-label',heads[c]);
      }
    }
    if(t.classList) t.classList.add('resp');
  }catch(e){}
  return t;
}
function add(p,t,c,x){ var e=el(t,c,x); p.appendChild(e); return e; }
function sep(n){ return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g,' '); }
function xof(n){ return sep(n)+' XOF'; }
/* Les calculs métier vivent dans regles.js, partagé avec le serveur : mêmes résultats des deux côtés. */
var R = window.MPRegles;
function RCTX(){
  return { offers:SEED_OFFERS, org:state.org, fxFrozen:state.fxFrozen, cadre:state.cadre, cdc:state.cdc, criteria:state.criteria,
    quality:state.quality, justif:state.justif, excluded:state.excluded, confirmed:state.confirmed, docDefs:DOCS() };
}
/* Référence de la procédure : une donnée du cahier des charges, jamais une valeur écrite dans le code. */
function REF(){ return (state && state.cdc && state.cdc.ref) || '—'; }
/* Règles du profil réglementaire de la procédure (figées à la publication du dossier). */
function CADRE(){ return R.cadre(RCTX()); }
function isUemoa(o){ return R.isUemoa(RCTX(),o); }
function isLocal(o){ return R.isLocal(RCTX(),o); }
function montantXOF(o){ return R.montantXOF(RCTX(),o); }
function montantCorrige(o){ return R.montantCorrige(RCTX(),o); }
function requiredDocs(o){ return R.requiredDocs(RCTX(),o); }
function missingDocs(o){ return R.missingDocs(RCTX(),o); }
function excluded(o){ return R.isExcluded(RCTX(),o); }
function conformes(){ return R.conformes(RCTX()); }
function aiScore(o,c){ return R.aiScore(o,c); }
function curScore(o,c){ return R.curScore(RCTX(),o,c); }
function flagsRemaining(){ return R.flagsRemaining(RCTX()); }
function weightTotal(){ return R.weightTotal(RCTX()); }
function ranking(){ return R.ranking(RCTX()); }

function anomalies(){
  var out=[], c=state.cdc;
  var avg=SEED_OFFERS.reduce(function(s,o){return s+montantXOF(o);},0)/SEED_OFFERS.length;
  SEED_OFFERS.forEach(function(o){
    var d=Math.round((montantXOF(o)-avg)/avg*100);
    if (d<=-25) out.push({lvl:'red',who:o.name,t:'Prix anormalement bas',
      d:'Montant inférieur de '+Math.abs(d)+' % à la moyenne des offres converties en XOF. À rapprocher du périmètre réellement couvert avant toute conclusion.'});
    missingDocs(o).forEach(function(md){
      out.push({lvl:'red',who:o.name,t:'Pièce obligatoire manquante',d:md.label+' — exigée par le règlement de consultation pour ce profil de soumissionnaire.'});
    });
    if (o.refsCount<3) out.push({lvl:'amber',who:o.name,t:'Références insuffisantes',d:o.refsCount+' référence(s) fournie(s) pour 3 exigées.'});
    if (o.garantie<c.garantieMin) out.push({lvl:'amber',who:o.name,t:'Garantie sous le minimum',
      d:'Garantie de '+o.garantie+' mois pour '+c.garantieMin+' mois exigés au cahier des charges.'});
    if (o.delai>c.delaiMax) out.push({lvl:'amber',who:o.name,t:'Délai supérieur au plafond',
      d:'Délai proposé de '+o.delai+' jours pour un plafond de '+c.delaiMax+' jours.'});
    if (!isUemoa(o)) out.push({lvl:'info',who:o.name,t:'Soumissionnaire hors zone UEMOA',
      d:'Offre libellée en '+o.devise+', convertie au taux d\u2019ouverture. Retenue à la source de '+c.retenueNonResident+' % applicable aux prestations de source locale ; droits et taxes à l\u2019importation à la charge : '+c.douaneACharge+'.'});
    if (o.validite && o.validite < 90) out.push({lvl:'amber',who:o.name,t:'Validité de l\u2019offre courte',
      d:'Offre valable '+o.validite+' jours. Vérifier qu\u2019elle couvre la durée prévisible de la procédure et de l\u2019approbation.'});
  });
  /* Structures de prix quasi identiques entre deux soumissionnaires */
  for (var i=0;i<SEED_OFFERS.length;i++){
    for (var j=i+1;j<SEED_OFFERS.length;j++){
      var a=SEED_OFFERS[i], b=SEED_OFFERS[j];
      if(!a.structure||!b.structure) continue;
      var maxd=0;
      for (var p=0;p<a.structure.length;p++) maxd=Math.max(maxd, Math.abs(a.structure[p]-b.structure[p]));
      if (maxd < 0.8) out.push({lvl:'red', who:a.name+' / '+b.name, t:'Structures de prix quasi identiques',
        d:'La répartition des prix entre postes est identique à moins de '+maxd.toFixed(1)+' point près sur tous les postes. Signal à instruire : concertation possible, ou reprise du même sous-traitant. Ne constitue pas une preuve.'});
    }
  }
  return out;
}

function allApproved(){ return R.allApproved(state.approvals); }
function phase(){
  if (!state.cdc.cdcPublie) return {k:'Phase : préparation du DAO', c:'c-violet'};
  if (!state.depClosed) return {k:'Phase : dépouillement', c:'c-amber'};
  if (!state.evalDone) return {k:'Phase : évaluation', c:'c-blue'};
  if (allApproved()) return {k:'Phase : attribuée', c:'c-green'};
  return {k:'Phase : approbation', c:'c-teal'};
}
function missingJustifs(){ return R.missingJustifs(RCTX()); }

/* ============ Habilitations ============ */
function me(){ for(var i=0;i<state.users.length;i++) if(state.users[i].id===state.me) return state.users[i]; return state.users[0]; }
function myRole(){ var u=me(); return state.roles[u.role] || {lab:u.role, perms:{}}; }
function can(p){ return !!(myRole().perms||{})[p]; }
function guard(p, btn, raison){
  if(can(p)) return true;
  if(btn){ btn.disabled=true; btn.setAttribute('title', raison || ("Action réservée : votre rôle « "+myRole().lab+" » ne dispose pas de cette habilitation.")); }
  return false;
}
function denyBox(m, perm){
  var c=add(m,'div','card pad'); c.style.cssText='text-align:center;padding:48px 24px';
  var ic=add(c,'div',null,'⛔'); ic.style.cssText='font-size:26px;margin-bottom:6px'; ic.setAttribute('aria-hidden','true');
  add(c,'h2',null,'Accès non habilité').style.fontSize='18px';
  var lab=''; for(var i=0;i<PERMS.length;i++) if(PERMS[i].id===perm) lab=PERMS[i].lab;
  add(c,'p','lede','Votre rôle « '+myRole().lab+' » ne dispose pas de l\u2019habilitation « '+lab+' ».').style.margin='8px auto 6px';
  add(c,'p','muted','Changez de rôle depuis le sélecteur en haut de page pour parcourir la démonstration sous un autre profil.').style.margin='0 auto';
}
function incompatOf(perms){
  var out=[];
  INCOMPAT.forEach(function(x){ if(perms[x[0]] && perms[x[1]]) out.push(x); });
  return out;
}

/* ============ Notifications ============ */
function roleLab(r){ return (state.roles[r]&&state.roles[r].lab)||r; }
function destinataires(roles){
  return state.users.filter(function(u){ return roles.indexOf(u.role)>=0; });
}
function mailAdr(u){
  return u.nom.toLowerCase().replace(/[^a-z]+/g,'.').replace(/^\.|\.$/g,'')+state.mailSuffix;
}
function notify(evId, titre, corps){
  var r=state.notifRules[evId]; if(!r) return;
  var ev=null; for(var i=0;i<EVENTS.length;i++) if(EVENTS[i].id===evId) ev=EVENTS[i];
  var t=new Date().toLocaleString('fr-FR');
  if(r.inapp){
    var nid='n'+Date.now()+Math.random().toString(36).slice(2,6);
    if(UI.notifsConnues) UI.notifsConnues[nid]=1; // déclenchée ici : pas de « push » pour son auteur
    state.notifs.unshift({ id:nid, ev:evId,
      lab:(ev?ev.lab:evId), titre:titre, corps:corps, t:t, roles:r.roles.slice(), lu:[] });
    if(state.notifs.length>120) state.notifs.length=120;
  }
  if(r.email){
    var dest=destinataires(r.roles);
    // ids : le serveur envoie aux adresses réelles de ces comptes (il ignore toute adresse fournie ici)
    state.emails.unshift({ id:'m'+Date.now()+Math.random().toString(36).slice(2,6), ev:evId, ids:dest.map(function(u){ return u.id; }),
      de:state.mailFrom, a:dest.map(mailAdr), noms:dest.map(function(u){return u.nom+' ('+roleLab(u.role)+')';}),
      objet:'['+REF()+'] '+titre, corps:corps+"\n\n—\n"+state.org.nom+" — plateforme Marché+\nCe message est généré automatiquement ; ne pas y répondre.",
      t:t, statut:'simulé' });
    if(state.emails.length>80) state.emails.length=80;
  }
}
function notifsPourMoi(){
  var r=me().role;
  return state.notifs.filter(function(nn){ return nn.roles.indexOf(r)>=0 || (nn.ids||[]).indexOf(state.me)>=0; });
}
function nonLues(){
  var uid=state.me;
  return notifsPourMoi().filter(function(nn){ return nn.lu.indexOf(uid)<0; });
}
function marquerLues(){
  var uid=state.me, k=0;
  notifsPourMoi().forEach(function(nn){ if(nn.lu.indexOf(uid)<0){ nn.lu.push(uid); k++; } });
  if(k) save();
  return k;
}

/* ============ Cycle de vie de la procédure ============ */
var LIFECYCLE = [
  {id:'prep',   lab:'Préparation'},
  {id:'pub',    lab:'Publication & questions'},
  {id:'depot',  lab:'Dépôt des plis'},
  {id:'depouil',lab:'Dépouillement'},
  {id:'clarif', lab:'Clarifications'},
  {id:'eval',   lab:'Évaluation'},
  {id:'appro',  lab:'Approbation'},
  {id:'recours',lab:'Notification & recours'},
  {id:'signe',  lab:'Marché signé'}
];
function lifeStatus(){
  var st={};
  var c=state.cdc;
  st.prep   = c.cdcPublie ? 'done':'now';
  st.pub    = c.cdcPublie ? (state.depClosed?'done':'now') : 'todo';
  st.depot  = c.cdcPublie ? (state.depClosed?'done':'now') : 'todo';
  st.depouil= state.depClosed ? 'done' : (c.cdcPublie?'now':'todo');
  var clOuv = state.clarifs.filter(function(x){return x.statut==='envoyee';}).length;
  st.clarif = clOuv? 'blocked' : (state.depClosed?'done':'todo');
  st.eval   = state.evalDone ? 'done' : (state.depClosed?'now':'todo');
  st.appro  = allApproved() ? 'done' : (state.evalDone?'now':'todo');
  var rOuv  = state.recours.filter(function(x){return x.statut==='ouvert';}).length;
  st.recours= !allApproved() ? 'todo' : (rOuv?'blocked':((!state.standstill.startedAt||standstillReste()>0)?'now':'done'));
  st.signe  = state.contractSigned ? 'done' : 'todo';
  if(state.infructueux) { st.eval='blocked'; }
  return st;
}
/* Durée du délai de recours : celle fixée à la notification, sinon celle du profil réglementaire. */
function delaiJours(){ return state.standstill.startedAt ? state.standstill.days : CADRE().delaiRecoursJours; }
function standstillReste(){ return R.standstillRemaining({ days:delaiJours(), startedAt:state.standstill.startedAt }); }
function recoursOuverts(){ return state.recours.filter(function(x){return x.statut==='ouvert';}); }
function clarifsOuvertes(){ return state.clarifs.filter(function(x){return x.statut==='envoyee';}); }
function coiDe(uid){ return state.coi[uid]||null; }
function coiOk(){ var d=coiDe(state.me); return !!(d && d.declare && !d.conflit); }

function frise(parent){
  var st=lifeStatus();
  var wrap=add(parent,'div','card pad'); wrap.style.marginBottom='18px';
  add(wrap,'div','t-xs','Cycle de vie de la procédure').style.marginBottom='10px';
  var f=add(wrap,'div','life');
  LIFECYCLE.forEach(function(x){
    var cls = st[x.id]==='done'?'done':(st[x.id]==='now'?'now':(st[x.id]==='blocked'?'blocked':''));
    var sdiv=add(f,'div','life-step '+cls);
    add(sdiv,'div','life-bar');
    add(sdiv,'div','life-lab',x.lab);
  });
  var msgs=[];
  if(clarifsOuvertes().length) msgs.push(clarifsOuvertes().length+' clarification(s) en attente de réponse : l\u2019évaluation peut se poursuivre, mais les offres concernées restent instruites sous réserve.');
  if(allApproved() && !state.contractSigned){
    if(recoursOuverts().length) msgs.push(recoursOuverts().length+' recours ouvert(s) : la signature du marché est suspendue jusqu\u2019à décision.');
    else if(standstillReste()>0) msgs.push('Délai de recours en cours : '+standstillReste()+' jour(s) avant que le marché puisse être signé.');
  }
  if(state.infructueux) msgs.push('Procédure déclarée infructueuse : '+state.infructueux);
  if(msgs.length){
    var w=add(wrap,'div','warn'); w.style.marginTop='10px';
    msgs.forEach(function(x){ add(w,'div',null,x).style.marginBottom='2px'; });
  }
}
function vide(parent, ic, titre, texte){
  var e=add(parent,'div','empty');
  var i=add(e,'div','empty-ic',ic); i.setAttribute('aria-hidden','true');
  add(e,'div',null,titre).style.cssText='font-weight:700;color:var(--ink);margin-bottom:4px';
  add(e,'div',null,texte);
  return e;
}

/* ============ Navigation ============ */
/* Menu en quatre niveaux : l'accueil, les registres de l'organisation (avec leur historique), les écrans de la
   procédure ouverte (groupe « Procédure », avec son sélecteur), puis l'administration. */
var VIEWS=[
  {id:'accueil',    label:'Tableau de bord', grp:'Accueil'},
  {id:'besoins',    label:'Demandes d’achat', grp:'Registres', perms:['besoin.create','besoin.approve','besoin.manage']},
  {id:'procedures', label:'Appels d’offres', grp:'Registres'},
  {id:'commandes',  label:'Exécution', grp:'Registres'},
  {id:'partenaires', label:'Partenaires', grp:'Registres', perm:'partenaires.manage'},
  {id:'referencement', label:'Mon référencement', grp:'Registres', role:true, perm:'portail.use'},
  {id:'dashboard',  label:'Vue d’ensemble', grp:'Procédure'},
  {id:'cdc',        label:'Cahier des charges', grp:'Procédure', perm:'cdc.edit'},
  {id:'dao',        label:'DAO', grp:'Procédure', perm:'cdc.edit'},
  {id:'criteres',   label:'Grille de critères', grp:'Procédure', perm:'criteres.edit'},
  {id:'qa',         label:'Questions', grp:'Procédure', perm:'offres.read'},
  {id:'portail',    label:'Déposer une offre', grp:'Procédure', role:true, perm:'portail.use'},
  {id:'reception',  label:'Réception des offres', grp:'Procédure', perm:'offres.read'},
  {id:'depouille',  label:'Dépouillement', grp:'Procédure', perm:'offres.read'},
  {id:'conformite', label:'Conformité', grp:'Procédure', perm:'offres.read'},
  {id:'clarifs',    label:'Clarifications', grp:'Procédure', perm:'offres.read'},
  {id:'evaluation', label:'Évaluation', grp:'Procédure', perm:'offres.read'},
  {id:'decision',   label:'Décision', grp:'Procédure', perm:'offres.read'},
  {id:'recours',    label:'Recours et signature', grp:'Procédure', perm:'offres.read'},
  {id:'pv',         label:'Procès-verbal', grp:'Procédure', perm:'pv.read'},
  {id:'audit',      label:"Journal d'audit", grp:'Procédure', perm:'audit.read'},
  {id:'comptes',    label:'Comptes', grp:'Administration', perm:'roles.edit', famille:'acces'},
  {id:'roles',      label:'Rôles', grp:'Administration', perm:'roles.edit', famille:'acces'},
  {id:'suppleances', label:'Suppléances', grp:'Administration', perm:'roles.edit', famille:'acces'},
  {id:'journal',    label:'Audit', grp:'Administration', perm:'audit.read'},
  {id:'params',     label:'Paramètres', grp:'Administration', perm:'params.edit'},
  {id:'regles',     label:'Règles', grp:'Administration', perm:'notif.manage', famille:'alertes'},
  {id:'envois',     label:'Journal des envois', grp:'Administration', perm:'notif.manage', famille:'alertes'}
];
function lockReason(id){
  if(id==='portail' && !state.cdc.cdcPublie) return "Publiez le cahier des charges pour ouvrir le dépôt.";
  if(id==='depouille' && !state.cdc.cdcPublie) return "Publiez le cahier des charges pour ouvrir le dépouillement.";
  if(id==='evaluation' && !state.depClosed) return "Clôturez le dépouillement pour ouvrir l'évaluation.";
  if(id==='decision' && !state.evalDone) return "Validez l'évaluation pour ouvrir le circuit d'approbation.";
  if(id==='pv' && !allApproved()) return "Recueillez les approbations pour générer le procès-verbal.";
  if(id==='recours' && !allApproved()) return "L'attribution doit être prononcée avant la notification.";
  if(id==='qa' && !state.cdc.cdcPublie) return "Les questions des candidats s'ouvrent après publication du dossier.";
  if(id==='clarifs' && !state.cdc.cdcPublie) return "Les clarifications interviennent après réception des offres.";
  return null;
}
/* Écrans utilisables sans procédure ouverte : ils ne concernent que l'organisation. */
var SANS_PROCEDURE = ['accueil','envois','suppleances','params','procedures','besoins','referencement','partenaires','commandes','comptes','roles','journal','regles'];
/* Familles d'écrans : une seule entrée de menu, et des onglets en tête de page pour passer de l'un à l'autre. */
var FAMILLES = { acces:{ lab:'Utilisateurs et accès', icone:'users' }, alertes:{ lab:'Alertes', icone:'ring' } };
function familleDe(id){ var v=VIEWS.filter(function(x){ return x.id===id; })[0]; return v && v.famille || null; }
function avecProcedure(){ return !!(state && state.procedure); }
/* Un écran est visible si l'une de ses habilitations est accordée (perm, ou perms pour plusieurs), et, sans
   procédure ouverte, s'il ne dépend pas d'une procédure. */
function vueVisible(v){
  if(!avecProcedure() && SANS_PROCEDURE.indexOf(v.id)<0) return false;
  if(v.perms) return v.perms.some(can);
  return !v.perm || can(v.perm);
}
function viewAllowed(id){ return VIEWS.some(function(v){ return v.id===id && vueVisible(v); }); }
/* Le soumissionnaire n'a rien à faire sur le tableau de bord acheteur : il arrive sur son portail. */
/* Tout le monde arrive sur l'accueil : chiffres clés et « À faire pour moi ». */
function homeView(){ return 'accueil'; }
function renderNav(){
  var box=document.getElementById('navs'); box.textContent='';
  var grp=null;
  // les écrans de la procédure ne figurent pas dans le menu : on ouvre un appel d'offres depuis le registre, et
  // « Appels d'offres » reste l'entrée active pendant qu'on est dans son détail
  var vis=VIEWS.filter(vueVisible).filter(function(v){ return v.grp!=='Procédure' && v.menu!==false; });
  var famillesPosees={};
  vis.forEach(function(v){
    if(v.famille){
      if(famillesPosees[v.famille]) return;
      famillesPosees[v.famille]=true;
      if(v.grp!==grp){ grp=v.grp; add(box,'div','navgrp',grp); }
      var F=FAMILLES[v.famille], bf=el('button','navb');
      icon(bf,F.icone); bf.appendChild(document.createTextNode(F.lab)); fk(bf,'nav-'+v.famille);
      if(familleDe(state.view)===v.famille) bf.setAttribute('aria-current','page');
      bf.addEventListener('click',function(){ closeMenu(); go(v.id); });
      box.appendChild(bf);
      return;
    }
    if(v.grp!==grp){
      grp=v.grp;
      add(box,'div','navgrp',grp);
    }
    var b=el('button','navb'+(v.role?' role':''));
    icon(b, NAV_ICONS[v.id]);
    b.appendChild(document.createTextNode(v.label));
    var reason=lockReason(v.id);
    if(reason){
      b.classList.add('lock');
      b.setAttribute('title',reason);
      b.setAttribute('aria-describedby','');
      icon(b,'lock').setAttribute('class','ic lk');
      b.appendChild(el('span','sr-only',' — verrouillé : '+reason));
    } else if(v.id==='depouille'&&flagsRemaining()>0){
      b.appendChild(el('span','n',String(flagsRemaining())));
    }
    if(v.id===state.view || (v.id==='procedures' && vueDeProcedure(state.view))) b.setAttribute('aria-current','page');
    b.addEventListener('click',function(){ closeMenu(); go(v.id); });
    box.appendChild(b);
  });
}
/* Écran de la procédure ouverte (groupe « Procédure ») : frise, sous-onglets, pastille de phase s'y rapportent. */
function vueDeProcedure(id){ return VIEWS.some(function(v){ return v.id===id && v.grp==='Procédure'; }); }
function closeMenu(){
  var sd=document.getElementById('side'), bd=document.getElementById('backdrop'), bg=document.getElementById('burger');
  if(!sd.classList.contains('open')) return;
  sd.classList.remove('open'); bd.classList.remove('on');
  bg.setAttribute('aria-expanded','false'); bg.focus();
}
function openMenu(){
  var sd=document.getElementById('side'), bd=document.getElementById('backdrop'), bg=document.getElementById('burger');
  sd.classList.add('open'); bd.classList.add('on'); bg.setAttribute('aria-expanded','true');
  var first=sd.querySelector('.navb'); if(first) first.focus();
}
function go(v){
  var def=null; for(var i=0;i<VIEWS.length;i++) if(VIEWS[i].id===v) def=VIEWS[i];
  if(def && !vueVisible(def)){ toast('Écran non accessible avec le rôle « '+myRole().lab+' ».'); return; }
  state.view=v; save(); render(); window.scrollTo(0,0);
}
function locked(m,msg,t,l){
  var c=add(m,'div','card empty');
  add(c,'div',null,msg);
  var b=add(c,'button','btn btn-primary btn-sm',l); fk(b,'unlock');
  b.addEventListener('click',function(){ go(t); });
}
function originChip(parent,o){
  var ch=add(parent,'span','chip '+(isUemoa(o)?'c-teal':'c-violet'), (isUemoa(o)?'UEMOA · ':'Hors UEMOA · ')+o.pays);
  return ch;
}
