(function(){
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
  {id:'contract.sign',   lab:"Signer le marché",                    grp:'Décision'}
];
/* Incompatibilites : separation des fonctions */
var INCOMPAT = [
  ['eval.score','decision.approve', "Noter et approuver relèvent de personnes distinctes : cumuler les deux prive la procédure de tout contrôle croisé."],
  ['cdc.publish','portail.use',     "Publier le dossier et y répondre est un conflit d'intérêts caractérisé."],
  ['eval.validate','decision.approve', "Valider l'évaluation et l'approuver ne peuvent relever du même titulaire."]
];
function permsDef(list){ var o={}; PERMS.forEach(function(p){ o[p.id]= list.indexOf(p.id)>=0; }); return o; }
function ROLES_DEF(){
  return {
    admin:    { lab:'Administrateur fonctionnel', perms:permsDef(PERMS.map(function(p){return p.id;})) },
    achats:   { lab:'Responsable des achats',     perms:permsDef(['cdc.edit','cdc.publish','criteres.edit','offres.read','depouille.confirm','depouille.close','conformite.decide','pv.read','audit.read','qa.answer','clarif.send','recours.handle']) },
    evaltech: { lab:'Évaluateur technique',       perms:permsDef(['offres.read','eval.score','pv.read']) },
    evalfin:  { lab:'Évaluateur financier',       perms:permsDef(['offres.read','depouille.confirm','eval.score','eval.validate','pv.read']) },
    approb:   { lab:"Membre du comité d'engagement", perms:permsDef(['offres.read','decision.approve','pv.read','audit.read','recours.handle','contract.sign']) },
    audit:    { lab:'Auditeur interne (lecture)', perms:permsDef(['offres.read','pv.read','audit.read']) },
    soum:     { lab:'Soumissionnaire',            perms:permsDef(['portail.use']) }
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
  'notifRules','notifs','emails','qa','additifs','clarifs','coi','delegations','recours','standstill','contractSigned','infructueux',
  'mailFrom','mailSuffix','approvals','offers'];
var SERVER_ONLY = ['audit','receipts','fxFrozen','cadre'];
var synced = {}, revs = {}, serverRev = 0, flushing = false, dirty = false, flushTimer = null;
var EMPTY_DRAFT = function(){ return { name:'', iso:'CI', devise:'XOF', montant:'', delai:'', garantie:'', refsCount:'', lots:[], docs:{} }; };
function uiKey(){ return 'marcheplus.ui.'+(state?state.me:''); }
function saveUI(){ try{ localStorage.setItem(uiKey(), JSON.stringify({view:state.view, offerIndex:state.offerIndex, draft:state.draft})); }catch(e){} }
function loadUI(){ try{ return JSON.parse(localStorage.getItem(uiKey())||'null')||{}; }catch(e){ return {}; } }
function snapAll(){ SYNC_KEYS.forEach(function(k){ synced[k]=JSON.stringify(state[k]); }); }
function applyServer(payload, keepPending){
  var st=payload.state, first=!state;
  if(first){ state={ view:'dashboard', offerIndex:0, draft:EMPTY_DRAFT() }; }
  SYNC_KEYS.concat(SERVER_ONLY).concat(['me']).forEach(function(k){
    if(!(k in st)) return;
    var pending = !first && keepPending && SYNC_KEYS.indexOf(k)>=0 && JSON.stringify(state[k])!==synced[k];
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
  if(flushing || !dirty || !state) return;
  var changes={}, sent={};
  SYNC_KEYS.forEach(function(k){ var j=JSON.stringify(state[k]); if(j!==synced[k]){ changes[k]=state[k]; sent[k]=j; } });
  dirty=false;
  if(!Object.keys(changes).length) return;
  flushing=true;
  MP.api('PATCH','/api/state',{changes:changes, base:revs}).then(function(r){
    Object.keys(sent).forEach(function(k){ synced[k]=sent[k]; if(r.revs && r.revs[k]) revs[k]=r.revs[k]; });
    serverRev=r.rev;
  }).catch(function(err){
    toast(err.message||'Enregistrement impossible.');
    return MP.api('GET','/api/state').then(function(p){ applyServer(p,false); render(); });
  }).then(function(){ flushing=false; if(dirty) flush(); });
}
function poll(){
  if(!state || flushing || dirty) return Promise.resolve();
  return MP.api('GET','/api/state?since='+serverRev).then(function(p){
    if(p.unchanged) return;
    var ae=document.activeElement;
    if(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.closest && ae.closest('#main')) return; // ne pas perturber une saisie
    applyServer(p,true); render();
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
  MP.api('POST','/api/audit',{a:a}).catch(function(){});
  toast(a);
}
/* Conserve le focus clavier et la position de defilement au travers d'un rendu */
function fk(e,key){ e.setAttribute('data-fk',key); return e; }
/* window.confirm est bloque dans l'iframe d'execution : boite de dialogue interne */
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
  try{ imprimer(); }catch(e){}
  toast("Si la fenêtre d'impression ne s'ouvre pas, utilisez l'impression de votre navigateur (Ctrl+P ou Cmd+P).");
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

/* ============ Générateur de dossier d'appel d'offres ============ */
function A(n,t,cat,paras){ return {n:n,t:t,cat:cat,p:paras}; }

function buildDAO(){
  var c=state.cdc;
  var P=[];
  var lots=c.lots, specs=c.specs;

  /* ---------- PIÈCE 1 : AVIS ---------- */
  P.push({ id:'p1', titre:"Pièce 1 — Avis d'appel d'offres", cat:'admin', arts:[
    A('1.1',"Objet et identification",'admin',[
      c.autorite+" lance un "+c.procedure.toLowerCase()+" sous la référence "+REF()+" ayant pour objet : "+c.objet+".",
      "Le marché est passé en "+lots.length+" lot(s) distinct(s), pouvant être attribués séparément. Un même soumissionnaire peut présenter une offre pour un seul lot, pour plusieurs lots ou pour l'ensemble des lots ; il précise dans son acte d'engagement les lots pour lesquels il soumissionne et, le cas échéant, les remises consenties en cas d'attribution multiple.",
      "La procédure est ouverte aux entreprises établies dans l'espace UEMOA comme aux entreprises établies hors de cet espace, sous réserve de la production des pièces exigées à l'article 2.4 du règlement de la consultation."
    ]),
    A('1.2',"Conditions de participation et retrait du dossier",'admin',[
      "Le dossier d'appel d'offres est retiré au siège de l'autorité contractante ou téléchargé sur la plateforme de dématérialisation. Le retrait est gratuit et n'emporte aucune obligation de soumissionner ; il donne lieu à inscription au registre des retraits, qui sert de base à la diffusion des additifs et réponses aux questions.",
      "Les offres sont rédigées en "+c.langue.toLowerCase()+". Les documents établis dans une autre langue sont accompagnés d'une traduction française certifiée conforme, seule la version française faisant foi en cas de divergence.",
      "Les plis sont déposés au plus tard le "+c.ouverture+" à 10 h 00, heure locale d'Abidjan, sous double enveloppe cachetée ou par dépôt dématérialisé sur le portail. Tout pli parvenu après l'heure limite est écarté sans être ouvert et retourné au soumissionnaire à ses frais."
    ])
  ]});

  /* ---------- PIÈCE 2 : RÈGLEMENT DE LA CONSULTATION ---------- */
  P.push({ id:'p2', titre:"Pièce 2 — Règlement de la consultation", cat:'admin', arts:[
    A('2.1',"Forme et contenu des offres",'admin',[
      "L'offre comprend deux enveloppes intérieures distinctes et séparément cachetées : l'enveloppe « A — offre technique et pièces administratives » et l'enveloppe « B — offre financière ». Aucune indication de prix ne doit figurer dans l'enveloppe A ; la présence d'un élément de prix dans l'offre technique entraîne le rejet de l'offre.",
      "L'offre technique comprend le mémoire technique renseigné selon le cadre imposé en pièce 6, les fiches techniques des matériels proposés, le planning d'exécution, l'organigramme de l'équipe affectée et les curriculums des intervenants clés.",
      "L'offre financière comprend l'acte d'engagement signé, le bordereau des prix unitaires et le détail quantitatif estimatif, complétés sans rature ni surcharge. En cas de discordance entre le prix unitaire et le prix total d'une ligne, le prix unitaire fait foi et le total est rectifié en conséquence ; la correction est notifiée au soumissionnaire, qui peut la refuser, son offre étant alors écartée."
    ]),
    A('2.2',"Durée de validité et caution de soumission",'admin',[
      "Les offres demeurent valables pendant quatre-vingt-dix (90) jours calendaires à compter de la date limite de dépôt. L'autorité contractante peut solliciter une prorogation de ce délai ; le soumissionnaire qui refuse la prorogation voit son offre écartée sans que sa caution soit saisie.",
      "Chaque offre est accompagnée d'une caution de soumission d'un montant égal à "+c.caution+" % du montant de l'offre hors taxes, émise par un établissement bancaire agréé dans l'espace UEMOA ou, pour les soumissionnaires établis hors de cet espace, contre-garantie par un tel établissement.",
      "La caution de soumission est libérée dans les trente (30) jours suivant la notification d'attribution pour les soumissionnaires non retenus, et après constitution de la garantie de bonne exécution pour l'attributaire. Elle est acquise à l'autorité contractante en cas de retrait de l'offre pendant sa durée de validité ou de refus de signer le marché."
    ]),
    A('2.3',"Questions, additifs et visite de site",'admin',[
      "Les candidats adressent leurs demandes d'éclaircissement par écrit au plus tard sept (7) jours avant la date limite de dépôt. Les réponses, rendues anonymes, sont communiquées simultanément à tous les candidats ayant retiré le dossier et font partie intégrante du dossier d'appel d'offres.",
      "Une visite de site est organisée sur trois agences représentatives du parc : une agence du district d'Abidjan, une agence de ville secondaire et une agence isolée alimentée par groupe électrogène. La visite est obligatoire ; l'attestation de visite délivrée à cette occasion est une pièce du dossier de candidature.",
      "L'autorité contractante peut publier des additifs modifiant le dossier jusqu'à cinq (5) jours avant la date limite. Si un additif est de nature à modifier substantiellement la préparation des offres, la date limite de dépôt est reportée d'une durée au moins égale au délai restant à courir."
    ]),
    A('2.4',"Pièces du dossier de candidature",'admin',[
      "Tout soumissionnaire produit : le registre du commerce ou un document équivalent du pays d'établissement ; une attestation de régularité fiscale de moins de trois mois ; la caution de soumission ; les états financiers certifiés des trois derniers exercices ; la liste des marchés similaires exécutés au cours des cinq dernières années, appuyée d'attestations de bonne exécution.",
      "Les soumissionnaires établis en Côte d'Ivoire produisent en outre une attestation de l'organisme de prévoyance sociale de moins de trois mois.",
      "Les soumissionnaires établis hors de l'espace UEMOA produisent en outre : la traduction française certifiée de leurs pièces, la légalisation consulaire ou l'apostille de leurs documents officiels, la contre-garantie bancaire mentionnée à l'article 2.2, et un engagement de représentation locale précisant l'identité du représentant, l'adresse du domicile élu en Côte d'Ivoire et l'étendue de son mandat pendant la durée du marché et de la garantie.",
      "L'absence d'une pièce essentielle entraîne le rejet de l'offre. L'autorité contractante peut toutefois inviter un soumissionnaire à compléter une pièce purement formelle, dans un délai qu'elle fixe, dès lors que cette régularisation n'a pas pour effet de modifier le contenu de l'offre ni d'avantager son auteur."
    ]),
    A('2.5',"Évaluation des offres",'admin',[
      "L'évaluation se déroule en trois temps : examen de la conformité administrative, examen de la conformité technique au regard des spécifications minimales du CCTP, puis notation des offres techniquement conformes selon la grille pondérée annexée.",
      "La grille de notation en vigueur pour la présente consultation est la suivante : "+state.criteria.map(function(x){return x.label+" ("+x.weight+" %)";}).join(" ; ")+".",
      "Une offre qui ne satisfait pas une spécification minimale du CCTP est écartée sans être notée, quelle que soit la qualité du reste de la proposition. Les spécifications minimales sont celles expressément désignées comme telles au CCTP."
    ]),
    A('2.6',"Préférence communautaire et comparaison des offres",'admin', c.prefActive ? [
      "Une marge de préférence de "+c.prefTaux+" % est appliquée en faveur des soumissionnaires établis dans l'espace UEMOA. Pour les seuls besoins de la comparaison, le montant des offres présentées par des soumissionnaires établis hors de cet espace est majoré de ce taux.",
      "Cette majoration est une opération de comparaison et non de négociation : elle ne modifie ni le montant de l'offre, ni le prix du marché en cas d'attribution. Le montant contractuel demeure celui figurant à l'acte d'engagement de l'attributaire.",
      "Les offres libellées en devises étrangères sont converties en francs CFA au taux de change en vigueur à la date d'ouverture des plis, taux qui demeure figé pour toute la durée de l'évaluation. Cette règle vaut quelle que soit l'évolution ultérieure des cours."
    ] : [
      "Aucune marge de préférence communautaire n'est appliquée dans le cadre de la présente consultation. Les offres sont comparées à leur contre-valeur en francs CFA, sans correction tenant au lieu d'établissement du soumissionnaire.",
      "Les offres libellées en devises étrangères sont converties en francs CFA au taux de change en vigueur à la date d'ouverture des plis, taux qui demeure figé pour toute la durée de l'évaluation."
    ]),
    A('2.7',"Attribution, recours et abandon de la procédure",'admin',[
      "Le marché est attribué au soumissionnaire dont l'offre, techniquement conforme, obtient la note pondérée la plus élevée. L'attribution est notifiée à l'attributaire et l'information est communiquée aux soumissionnaires non retenus, avec indication des motifs du rejet de leur offre.",
      "Les soumissionnaires disposent d'un délai de recours auprès de l'autorité contractante puis, le cas échéant, de l'organe de régulation compétent. L'exercice d'un recours dans les délais suspend la signature du marché jusqu'à décision.",
      "L'autorité contractante peut déclarer la procédure infructueuse ou l'abandonner pour motif d'intérêt général, sans que les soumissionnaires puissent prétendre à indemnité. Cette décision est motivée et portée à la connaissance de tous les soumissionnaires."
    ])
  ]});

  /* ---------- PIÈCE 3 : CCAP ---------- */
  P.push({ id:'p3', titre:"Pièce 3 — Cahier des clauses administratives particulières", cat:'admin', arts:[
    A('3.1',"Pièces constitutives et ordre de priorité",'admin',[
      "Le marché est constitué, par ordre de priorité décroissant, de : l'acte d'engagement et ses annexes ; le présent CCAP ; le CCTP ; le bordereau des prix unitaires et le détail quantitatif estimatif ; le mémoire technique de l'attributaire ; les additifs publiés au cours de la consultation.",
      "En cas de contradiction entre deux pièces, la pièce de rang supérieur prévaut. Toute clause du mémoire technique de l'attributaire contraire au CCTP est réputée non écrite, sauf lorsqu'elle est plus favorable à l'autorité contractante."
    ]),
    A('3.2',"Prix, révision et régime fiscal",'admin',[
      "Les prix sont fermes et non révisables pendant les douze (12) premiers mois d'exécution. Au-delà, ils peuvent être actualisés selon la formule d'actualisation annexée à l'acte d'engagement, dans la limite d'une variation annuelle plafonnée.",
      "La taxe sur la valeur ajoutée est applicable au taux de "+c.tva+" %. Les prestations réalisées par un prestataire non résident sont soumises à une retenue à la source de "+c.retenueNonResident+" % sur la part de rémunération de source locale, opérée par l'autorité contractante et reversée à l'administration fiscale.",
      "Les droits et taxes à l'importation des matériels sont à la charge de : "+c.douaneACharge+". Le soumissionnaire intègre dans son prix l'ensemble des frais d'acheminement, d'assurance, de manutention, de dédouanement et de transport intérieur jusqu'aux sites d'installation, sauf stipulation contraire de l'acte d'engagement."
    ]),
    A('3.3',"Avance de démarrage et modalités de paiement",'admin',[
      "Une avance de démarrage de "+c.avance+" % du montant du marché est versée à l'attributaire sur présentation d'une garantie de restitution d'avance de même montant, émise par un établissement agréé dans l'espace UEMOA. L'avance est remboursée par retenues proportionnelles sur les acomptes.",
      "Les paiements sont effectués par virement dans un délai de trente (30) jours à compter de la réception de la facture accompagnée des pièces justificatives et du procès-verbal de service fait.",
      "Les acomptes sont versés selon l'avancement constaté : trente pour cent (30 %) à la livraison des matériels sur site, quarante pour cent (40 %) après installation et essais partiels concluants, vingt pour cent (20 %) à la réception provisoire, dix pour cent (10 %) à la réception définitive."
    ]),
    A('3.4',"Garanties, pénalités et résiliation",'admin',[
      "Une garantie de bonne exécution égale à cinq pour cent (5 %) du montant du marché est constituée dans les vingt (20) jours suivant la notification. Elle est libérée après la réception définitive, déduction faite des sommes éventuellement dues par le titulaire.",
      "Le délai d'exécution ne peut excéder "+c.delaiMax+" jours calendaires à compter de l'ordre de service de démarrage. Tout retard imputable au titulaire donne lieu à une pénalité de "+c.penalite+" ‰ du montant du marché par jour calendaire de retard, plafonnée à dix pour cent (10 %) du montant du marché.",
      "Le marché peut être résilié aux torts du titulaire en cas de manquement grave persistant après mise en demeure restée sans effet pendant quinze (15) jours, d'atteinte du plafond des pénalités, ou de fausse déclaration ayant déterminé l'attribution. La résiliation entraîne la saisie de la garantie de bonne exécution, sans préjudice des dommages et intérêts.",
      "Les différends sont réglés prioritairement à l'amiable. À défaut d'accord dans un délai de soixante (60) jours, ils relèvent des juridictions compétentes du lieu d'exécution du marché, le droit applicable étant celui de l'État de l'autorité contractante."
    ]),
    A('3.5',"Assurances, sous-traitance et confidentialité",'admin',[
      "Le titulaire justifie, avant tout démarrage, d'une assurance responsabilité civile professionnelle et d'une assurance couvrant les matériels jusqu'à leur réception, pour des montants adaptés à l'importance du marché.",
      "La sous-traitance est admise dans la limite de quarante pour cent (40 %) du montant du marché, sous réserve de l'agrément préalable et écrit de l'autorité contractante sur l'identité et les capacités du sous-traitant. Le titulaire demeure seul responsable de l'exécution vis-à-vis de l'autorité contractante.",
      "Le titulaire et ses intervenants sont tenus à une obligation de confidentialité absolue sur toute information relative aux systèmes, aux données et à l'organisation de l'autorité contractante, dont ils auraient connaissance à l'occasion du marché. Cette obligation survit cinq (5) ans à l'expiration du marché. Le personnel intervenant sur site fait l'objet d'une enquête de moralité préalable."
    ])
  ]});

  /* ---------- PIÈCE 4 : CCTP (volume technique dominant) ---------- */
  var cctp=[];
  cctp.push(A('4.1',"Contexte, périmètre et objectifs",'tech',[
    "L'autorité contractante exploite un réseau d'agences bancaires réparties sur l'ensemble du territoire, comprenant des agences urbaines raccordées à la fibre optique, des agences de villes secondaires desservies par liaison radio ou cuivre, et des agences isolées dont la connectivité repose sur une liaison satellitaire de secours. Le présent marché a pour objet la modernisation de l'infrastructure réseau locale de ces agences.",
    "Le périmètre couvre la fourniture, le transport, l'installation, le paramétrage, les essais, la mise en service, la documentation, la formation et la maintenance des équipements décrits ci-après. Il inclut la dépose et l'évacuation des équipements remplacés, ainsi que la reprise du câblage existant lorsque celui-ci ne satisfait pas les exigences de la présente pièce.",
    "Les objectifs assignés au marché sont : porter la disponibilité du réseau d'agence à un niveau compatible avec l'activité bancaire de guichet ; segmenter les flux métier, monétique et bureautique ; réduire le délai de remise en service après incident ; et doter l'exploitant d'une supervision centralisée couvrant l'ensemble du parc.",
    "Les quantités indiquées au détail quantitatif estimatif sont données à titre indicatif et pourront varier de plus ou moins vingt pour cent (20 %) sans que le titulaire puisse prétendre à une modification de ses prix unitaires."
  ]));
  cctp.push(A('4.2',"Architecture cible et principes de conception",'tech',[
    "L'architecture cible repose sur une topologie en étoile au niveau de chaque agence, avec un équipement de distribution unique assurant la commutation locale et le raccordement aux liaisons opérateur. Les agences de plus de vingt postes disposent de deux équipements de commutation en cascade, dimensionnés pour absorber la charge en cas de défaillance de l'un d'eux.",
    "Le raccordement au réseau étendu est assuré par un routeur d'agence disposant d'au moins deux interfaces WAN actives, permettant une bascule automatique vers la liaison de secours sans intervention humaine et sans coupure de session supérieure à trente (30) secondes.",
    "La segmentation logique est obligatoire et repose sur des réseaux locaux virtuels distincts pour : les postes de travail bureautiques, les applications métier bancaires, les automates et la monétique, la téléphonie sur IP, la vidéosurveillance, et l'administration des équipements. Aucun flux ne transite entre ces segments sans passer par un point de filtrage explicite.",
    "La conception proposée est justifiée dans le mémoire technique par un schéma d'architecture par type d'agence, un plan d'adressage cohérent avec le plan existant, et une matrice des flux autorisés entre segments.",
    "Le soumissionnaire propose une architecture homogène sur l'ensemble du parc. Les solutions reposant sur plusieurs gammes hétérogènes d'équipements pour une même fonction sont écartées, sauf justification technique circonstanciée acceptée par l'autorité contractante."
  ]));
  cctp.push(A('4.3',"Contraintes d'environnement — climat, énergie et sûreté",'tech',[
    "SPÉCIFICATION MINIMALE. Les matériels fonctionnent sans dégradation de performance dans une plage de température ambiante comprise entre 0 et 45 °C et une humidité relative pouvant atteindre 95 % sans condensation. Les équipements dont la plage de fonctionnement nominale est inférieure sont écartés, sauf à être livrés avec un dispositif de conditionnement d'air dédié chiffré dans l'offre.",
    "Les matériels installés en zone sahélienne ou exposés à l'harmattan présentent un indice de protection contre la poussière au moins égal à IP 4X au niveau des entrées d'air, ou sont installés dans des baies équipées de filtres à poussière démontables et remplaçables sans outil. Le titulaire fournit un jeu de filtres de rechange par site.",
    "L'alimentation électrique est réputée instable : le titulaire dimensionne ses équipements pour supporter des variations de tension comprises entre 170 et 260 volts, des microcoupures répétées et des retours de tension brutaux après reprise du groupe électrogène. Les alimentations acceptant une plage plus étroite sont protégées par un régulateur de tension chiffré dans l'offre.",
    "Chaque site est équipé d'un onduleur dimensionné pour assurer une autonomie minimale de trente (30) minutes à pleine charge de l'ensemble des équipements réseau et de sécurité, avec bypass automatique et report d'alarme vers la supervision. Le calcul de dimensionnement est joint à l'offre.",
    "Les équipements sont installés dans des locaux techniques fermant à clé, dans des baies verrouillables. Les ports non utilisés sont désactivés administrativement. Les câbles de brassage sont repérés aux deux extrémités selon une convention de nommage soumise à l'approbation de l'autorité contractante avant déploiement."
  ]));

  /* Spécifications par lot, générées depuis la configuration */
  var LOTTEXT = [
    ["Les équipements actifs sont administrables, alimentés en courant alternatif et dotés d'alimentations redondées pour les agences de plus de vingt postes. Ils supportent le marquage de réseaux locaux virtuels selon la norme 802.1Q, la qualité de service à huit files d'attente, l'agrégation de liens et le contrôle d'accès au port selon la norme 802.1X.",
     "Les commutateurs proposent au minimum vingt-quatre ports gigabit cuivre et deux ports optiques de liaison montante. La fourniture d'électricité par le port selon la norme 802.3at est exigée sur au moins la moitié des ports afin d'alimenter les téléphones IP, les caméras et les bornes sans fil, avec un budget de puissance total explicitement chiffré.",
     "Les routeurs d'agence assurent le chiffrement des flux inter-sites, la bascule automatique entre liaisons, le marquage et la priorisation des flux applicatifs bancaires, et l'ouverture d'un tunnel de secours sur liaison satellitaire avec gestion de la latence associée.",
     "Les matériels proposés ne font pas l'objet d'une annonce de fin de commercialisation à la date de remise des offres, et bénéficient d'un support constructeur garanti pendant au moins cinq (5) ans à compter de la réception provisoire. Une attestation du constructeur ou de son distributeur agréé est jointe à l'offre."],
    ["Le câblage est réalisé en cuivre catégorie 6A blindé, avec une garantie système constructeur de vingt-cinq (25) ans couvrant les composants et les performances de la liaison. Les liaisons dépassant quatre-vingt-dix (90) mètres sont réalisées en fibre optique.",
     "Chaque poste de travail est desservi par deux prises RJ45. Les liaisons vers les automates bancaires et les équipements monétiques sont physiquement distinctes et repérées par un code couleur dédié, afin d'interdire tout brassage accidentel avec le réseau bureautique.",
     "Les baies de brassage sont de hauteur 42U, équipées de panneaux de brassage, de passe-câbles horizontaux, de deux unités de distribution électrique sur départs distincts, d'un éclairage intérieur et d'une sonde de température reportée à la supervision.",
     "SPÉCIFICATION MINIMALE. Chaque lien cuivre installé fait l'objet d'un test de certification au moyen d'un appareil étalonné de moins de douze mois. Les rapports de certification, lien par lien, sont remis sous forme numérique exploitable et conditionnent la réception provisoire du lot."],
    ["L'installation est réalisée sans interruption de l'activité de guichet. Les interventions nécessitant une coupure sont planifiées en dehors des heures d'ouverture et font l'objet d'une demande de changement approuvée au moins cinq (5) jours ouvrés à l'avance.",
     "Chaque site fait l'objet d'une visite préalable contradictoire donnant lieu à un relevé d'existant et à une fiche de préparation validée par l'exploitant. Le déploiement est organisé par vagues géographiques, avec un site pilote dont la recette complète conditionne la poursuite du déploiement.",
     "La formation porte sur l'exploitation courante, le diagnostic de premier niveau et les procédures de remise en service. Elle est dispensée en français, sur site, en groupes de huit personnes au maximum, et donne lieu à la remise d'un support pédagogique et à une évaluation individuelle des acquis.",
     "Le titulaire assure un accompagnement renforcé pendant les quinze (15) jours ouvrés suivant la mise en service de chaque vague, avec présence sur site ou astreinte dédiée selon la criticité des agences concernées."],
    ["La maintenance couvre la maintenance préventive, la maintenance corrective et la gestion des pièces de rechange pendant toute la durée du contrat, sur l'ensemble des sites déployés.",
     "La maintenance préventive comprend au minimum deux visites annuelles par site, portant sur le nettoyage des filtres, le contrôle des serrages et des températures, la vérification des batteries d'onduleur, la mise à jour des micrologiciels validés et le contrôle de la sauvegarde des configurations. Chaque visite donne lieu à un rapport signé par l'exploitant du site.",
     "Un stock de pièces de rechange est constitué et maintenu sur le territoire national, représentant au minimum dix pour cent (10 %) des équipements déployés par référence, avec un minimum d'une unité par référence. L'inventaire de ce stock est communiqué trimestriellement à l'autorité contractante.",
     "Le titulaire s'engage sur la disponibilité des pièces pendant toute la durée du contrat. En cas d'obsolescence d'une référence, il propose un équipement de remplacement de caractéristiques au moins équivalentes, sans surcoût pour l'autorité contractante."]
  ];
  lots.forEach(function(lot,i){
    var base = LOTTEXT[i] || ["Les prestations de ce lot sont exécutées conformément aux règles de l'art et aux normes en vigueur. Le soumissionnaire détaille dans son mémoire technique les moyens matériels et humains qu'il affecte à ce lot, ainsi que le planning d'exécution correspondant."];
    var paras = [ "Le présent chapitre définit les exigences applicables au "+lot.nom.toLowerCase()+", dont le montant estimatif s'établit à "+lot.montant+"." ].concat(base);
    cctp.push(A('4.'+(4+i), "Exigences techniques — "+lot.nom, 'tech', paras));
  });

  var nx = 4+lots.length;
  cctp.push(A('4.'+nx,"Spécifications minimales et fonctionnalités exigées",'tech',
    [ "Les spécifications ci-après constituent des exigences minimales au sens de l'article 2.5 du règlement de la consultation. Une offre qui n'en satisfait pas une seule est écartée sans être notée. Le soumissionnaire renseigne, pour chacune, la référence précise de la page de son offre où la conformité est démontrée." ]
    .concat(specs.map(function(s,i){ return "Exigence "+(i+1)+" — "+s+"."; }))
    .concat([ "Toute proposition de variante par rapport à ces exigences est présentée séparément, chiffrée distinctement, et ne dispense pas le soumissionnaire de présenter une offre de base strictement conforme." ])));

  cctp.push(A('4.'+(nx+1),"Normes, homologations et origine des matériels",'tech',[
    "Les matériels sont neufs, d'origine, et n'ont fait l'objet d'aucun reconditionnement. Le soumissionnaire produit une attestation du constructeur ou de son distributeur agréé pour la zone, certifiant l'authenticité des matériels et l'ouverture des droits au support et aux mises à jour de sécurité.",
    "Les équipements sont conformes aux normes internationales applicables en matière de compatibilité électromagnétique et de sécurité électrique, ainsi qu'aux exigences de l'autorité nationale de régulation des télécommunications lorsqu'ils comportent des fonctions radioélectriques. Les certificats correspondants sont joints.",
    "Les interfaces d'administration, la documentation et les messages système sont disponibles en français ou en anglais. Lorsqu'ils ne sont disponibles qu'en anglais, le titulaire fournit un référentiel de traduction des messages d'alarme et des procédures d'exploitation critiques.",
    "SPÉCIFICATION MINIMALE. Les équipements bénéficient de mises à jour de sécurité publiées par le constructeur pendant au moins cinq (5) ans. Les matériels en fin de support à la date de remise des offres sont écartés."
  ]));

  cctp.push(A('4.'+(nx+2),"Sécurité des systèmes d'information bancaires",'tech',[
    "L'administration des équipements s'effectue exclusivement par protocole chiffré, depuis un réseau d'administration dédié et isolé. Les protocoles d'administration en clair sont désactivés sur l'ensemble du parc, sans exception, y compris pendant les phases de déploiement.",
    "Les comptes d'administration par défaut sont supprimés ou renommés et leurs mots de passe modifiés avant mise en service. L'authentification des administrateurs s'appuie sur un annuaire central avec traçabilité nominative des actions ; l'usage de comptes génériques partagés est proscrit.",
    "Les segments portant des flux monétiques respectent les exigences de cloisonnement applicables aux données de porteurs de cartes : séparation physique ou logique stricte, filtrage explicite, journalisation des accès et interdiction de tout transit par le segment bureautique.",
    "Les journaux des équipements sont exportés en temps réel vers un collecteur central, horodatés par une source de temps commune, et conservés pendant douze (12) mois au minimum. Le titulaire fournit la configuration permettant cet export et vérifie sa complétude lors de la recette.",
    "Les configurations sont sauvegardées automatiquement après chaque modification et archivées de manière versionnée. Le titulaire remet une procédure documentée de restauration complète d'un équipement à partir de sa sauvegarde, testée en présence de l'exploitant lors de la recette."
  ]));

  cctp.push(A('4.'+(nx+3),"Supervision, exploitation et indicateurs",'tech',[
    "L'ensemble des équipements est supervisé depuis la plateforme centrale de l'autorité contractante au moyen du protocole SNMP version 3, à l'exclusion des versions antérieures non chiffrées. Le titulaire fournit les fichiers de définition des objets gérés et assiste l'exploitant dans leur intégration.",
    "Sont remontés au minimum : la disponibilité de chaque équipement et de chaque liaison, l'état des alimentations et des ventilateurs, la température interne, le taux d'utilisation des interfaces, le taux d'erreurs, l'état des batteries d'onduleur et les bascules de liaison WAN.",
    "Le titulaire propose un jeu de seuils d'alerte argumenté et un tableau de bord d'exploitation présentant l'état du parc par région, par type d'agence et par criticité. Ce tableau de bord est livré paramétré et fonctionnel à la réception provisoire.",
    "Les indicateurs contractuels de disponibilité sont calculés mensuellement à partir des données de supervision, sur la base de relevés contradictoires. Toute divergence entre les relevés du titulaire et ceux de l'exploitant est tranchée au profit des relevés de l'autorité contractante, sauf preuve contraire apportée par le titulaire."
  ]));

  cctp.push(A('4.'+(nx+4),"Essais, recette et réception",'tech',[
    "Les essais se déroulent en trois phases : essais en usine ou en plateau sur un échantillon représentatif avant expédition ; essais de mise en service site par site ; recette globale portant sur l'ensemble du parc déployé.",
    "Le plan de recette est proposé par le titulaire et approuvé par l'autorité contractante avant tout démarrage. Il comporte, pour chaque exigence du présent CCTP, un scénario de test, un résultat attendu et un mode de preuve. Une exigence sans scénario de test associé est réputée non recettée.",
    "Les essais comprennent au minimum : la certification de chaque lien de câblage, la vérification de la segmentation par tentative de flux interdits, l'essai de bascule automatique de liaison WAN avec chronométrage de la reprise, l'essai d'autonomie sur onduleur, la vérification des remontées de supervision et la restauration d'une configuration depuis sauvegarde.",
    "La réception provisoire est prononcée après levée de toutes les réserves bloquantes et remise complète de la documentation. La réception définitive intervient au terme d'une période d'observation de trois (3) mois d'exploitation sans incident bloquant imputable au titulaire.",
    "Tout incident survenu pendant la période d'observation et imputable au titulaire suspend le décompte de celle-ci jusqu'à correction définitive et validation par l'exploitant."
  ]));

  cctp.push(A('4.'+(nx+5),"Documentation et transfert de compétences",'tech',[
    "Le titulaire remet, en français et sous format numérique modifiable : le dossier des ouvrages exécutés par site, les schémas d'architecture et de câblage mis à jour, le plan d'adressage, la matrice des flux, les configurations commentées, les procédures d'exploitation courante et les procédures de reprise après incident.",
    "Le dossier de chaque site comporte le relevé des liens certifiés, les photographies des installations avant et après intervention, la liste des matériels installés avec leurs numéros de série, et le procès-verbal de mise en service signé par le responsable d'agence.",
    "Le transfert de compétences porte sur l'exploitation, le diagnostic et la maintenance de premier niveau. Il comprend des sessions théoriques et des travaux pratiques sur maquette, et fait l'objet d'une évaluation des acquis dont les résultats sont communiqués à l'autorité contractante.",
    "La documentation est mise à jour par le titulaire à chaque modification intervenant pendant la période de garantie. Une documentation non à jour constitue une réserve bloquante à la réception définitive."
  ]));

  cctp.push(A('4.'+(nx+6),"Niveaux de service, délais d'intervention et astreinte",'tech',[
    "SPÉCIFICATION MINIMALE. Le délai d'intervention sur site est inférieur à huit (8) heures ouvrées pour les agences du district d'Abidjan et à vingt-quatre (24) heures ouvrées pour les autres agences du territoire, à compter de la déclaration de l'incident.",
    "Le délai de remise en service est de quatre (4) heures pour un incident bloquant l'activité de guichet en agence urbaine et de vingt-quatre (24) heures pour les autres sites. Lorsque la remise en service exige une pièce non disponible en stock local, le titulaire met en place une solution de contournement dans ces mêmes délais.",
    "Le titulaire met en place un point d'entrée unique joignable en français, disponible pendant les heures ouvrées et en astreinte pour les incidents bloquants, avec accusé de prise en compte sous trente (30) minutes et suivi traçable de chaque incident jusqu'à clôture contradictoire.",
    "Le non-respect d'un délai contractuel donne lieu à l'application de pénalités spécifiques, cumulables avec les pénalités de retard prévues au CCAP, selon le barème annexé à l'acte d'engagement.",
    "Un comité de suivi trimestriel réunit le titulaire et l'exploitant pour examiner les indicateurs, les incidents récurrents et les actions correctives engagées. Le compte rendu de ce comité est annexé au dossier de marché."
  ]));

  cctp.push(A('4.'+(nx+7),"Logistique, transport, dédouanement et délais d'acheminement",'tech',[
    "Le soumissionnaire détaille dans son offre la chaîne logistique retenue : lieu d'expédition, mode de transport, incoterm proposé, délai d'acheminement prévisionnel et marges prises en compte pour les opérations de dédouanement.",
    "Les délais d'acheminement et de dédouanement sont inclus dans le délai global d'exécution. Aucune prolongation de délai ne sera accordée au titre de difficultés logistiques ou douanières ordinaires, celles-ci étant réputées connues et intégrées au planning.",
    "Les matériels sont conditionnés pour un transport maritime ou aérien en zone tropicale, avec protection contre l'humidité et les chocs. Tout matériel livré avec un emballage détérioré fait l'objet de réserves à la livraison et peut être refusé.",
    "Le titulaire supporte les frais de stockage et de magasinage en cas de retard qui lui est imputable. Il assure les matériels jusqu'à leur réception provisoire par l'autorité contractante."
  ]));

  cctp.push(A('4.'+(nx+8),"Environnement, sécurité au travail et gestion des déchets",'tech',[
    "Les interventions sont conduites dans le respect des règles de sécurité applicables aux établissements recevant du public. Le personnel intervenant dispose des équipements de protection individuelle adaptés et d'une habilitation électrique en cours de validité pour les travaux concernés.",
    "Les équipements déposés sont évacués par le titulaire et traités dans une filière conforme à la réglementation applicable aux déchets d'équipements électriques et électroniques. Un bordereau de suivi des déchets est remis à l'autorité contractante pour chaque enlèvement.",
    "Les batteries d'onduleur remplacées font l'objet d'une reprise systématique par le titulaire et d'un traitement en filière spécialisée. Leur abandon sur site constitue un manquement grave au sens du CCAP.",
    "Le titulaire propose, à performances égales, les matériels présentant la consommation électrique la plus faible, et documente dans son mémoire technique la consommation prévisionnelle du parc installé."
  ]));

  cctp.push(A('4.'+(nx+9),"Liaisons étendues, qualité de service et performance applicative",'tech',[
    "Le titulaire configure la priorisation des flux de sorte que les applications de guichet et la monétique disposent d'une bande passante garantie, y compris en période de saturation. Les flux de sauvegarde, de mise à jour et de bureautique lourde sont relégués en classe non prioritaire et peuvent être écrêtés.",
    "SPÉCIFICATION MINIMALE. La latence aller-retour entre une agence raccordée par liaison terrestre et le centre de traitement n'excède pas cent cinquante (150) millisecondes en heure de pointe, et la perte de paquets sur les flux prioritaires demeure inférieure à un pour mille (1 ‰) mesuré sur une heure glissante.",
    "Les agences desservies par liaison satellitaire font l'objet d'un paramétrage spécifique tenant compte de la latence propre à ce mode de transport : adaptation des temporisations applicatives, compression des en-têtes lorsque cela est pertinent, et exclusion explicite des flux non critiques pendant les heures d'ouverture.",
    "Le titulaire réalise, avant réception provisoire, une campagne de mesure de performance sur un échantillon représentatif d'au moins quinze pour cent (15 %) des sites, couvrant chaque type de raccordement. Les résultats sont consignés dans un rapport contradictoire.",
    "Le dimensionnement proposé tient compte d'une croissance de trafic de vingt pour cent (20 %) par an sur trois ans. Le soumissionnaire justifie ses hypothèses de dimensionnement dans son mémoire technique."
  ]));
  cctp.push(A('4.'+(nx+10),"Téléphonie sur IP et intégration des services de communication",'tech',[
    "Les équipements de commutation assurent l'alimentation électrique des postes téléphoniques par le port et leur affectation automatique au réseau local virtuel dédié à la voix, sans configuration manuelle poste par poste.",
    "Les flux de signalisation et de média sont marqués et priorisés de bout en bout. Le titulaire vérifie lors de la recette que la qualité vocale mesurée demeure satisfaisante en situation de charge, y compris lors d'une bascule de liaison WAN.",
    "L'acheminement des appels d'urgence et des appels vers le centre de sécurité de l'autorité contractante reste opérationnel en cas de perte de la liaison principale. Le dispositif de secours proposé est décrit et testé lors de la recette.",
    "Les postes existants conservés sont inventoriés et leur compatibilité avec l'infrastructure proposée est vérifiée avant déploiement. Tout poste incompatible est signalé à l'autorité contractante, qui décide de son remplacement ou de son maintien sur infrastructure dédiée."
  ]));
  cctp.push(A('4.'+(nx+11),"Réseau sans fil en agence",'tech',[
    "Le réseau sans fil comporte deux services distincts : un service interne réservé aux équipements professionnels, authentifié par certificat ou par annuaire, et un service invité strictement isolé du réseau interne, sans aucune route vers les segments métier ou monétique.",
    "SPÉCIFICATION MINIMALE. Le service invité est cloisonné au niveau du port et au niveau du routage. Une architecture reposant uniquement sur un filtrage applicatif pour séparer le service invité du réseau interne est refusée.",
    "La couverture radio est dimensionnée à partir d'une étude par type d'agence, tenant compte des cloisons, des espaces de caisse et des zones de coffre. Une étude de couverture après installation est réalisée sur un échantillon de sites et remise à l'autorité contractante.",
    "Les bornes sont administrables de manière centralisée, avec application automatique des politiques de sécurité et des mises à jour. Le remplacement d'une borne défaillante s'effectue sans reconfiguration manuelle, la configuration étant restituée depuis le contrôleur central."
  ]));
  cctp.push(A('4.'+(nx+12),"Courants faibles, vidéosurveillance et systèmes de sûreté",'tech',[
    "Les flux de vidéosurveillance sont portés par un réseau local virtuel dédié et n'empruntent en aucun cas le segment bureautique. Le dimensionnement des liens tient compte du débit cumulé des caméras et de la durée de rétention exigée par la politique de sûreté de l'autorité contractante.",
    "Les équipements de contrôle d'accès et de détection d'intrusion raccordés au réseau font l'objet d'un segment spécifique, dont les flux sortants sont limités aux seuls serveurs de gestion identifiés dans la matrice des flux.",
    "La perte de la liaison étendue ne doit pas interrompre l'enregistrement local des images ni le fonctionnement autonome du contrôle d'accès. Le titulaire vérifie ce comportement lors de la recette, liaison débranchée.",
    "Le titulaire coordonne ses interventions avec les prestataires de sûreté en place. Toute intervention susceptible d'interrompre un système de sûreté fait l'objet d'une autorisation écrite préalable du responsable sûreté de l'autorité contractante."
  ]));
  cctp.push(A('4.'+(nx+13),"Reprise de l'existant et migration",'tech',[
    "Le titulaire réalise un inventaire contradictoire de l'existant par site avant toute dépose : équipements, versions, configurations, raccordements opérateur et servitudes particulières. Cet inventaire est validé par l'exploitant et sert de référence en cas de litige.",
    "Les configurations existantes sont sauvegardées et archivées avant toute modification. Aucune dépose n'intervient avant que la sauvegarde ne soit vérifiée comme exploitable.",
    "La migration s'effectue site par site, avec une fenêtre de bascule définie et un point de non-retour explicite. Au-delà de ce point, si la bascule n'est pas achevée, le plan de repli est déclenché et le site est restitué dans son état initial avant la reprise de l'activité.",
    "SPÉCIFICATION MINIMALE. Aucune agence ne peut rester indisponible au-delà de l'ouverture des guichets du fait d'une opération de migration. Le plan de repli est documenté, testé sur le site pilote et approuvé avant tout déploiement de masse.",
    "Les équipements déposés sont conservés en quarantaine pendant trente (30) jours avant évacuation, afin de permettre une restitution rapide en cas de difficulté post-migration."
  ]));
  cctp.push(A('4.'+(nx+14),"Continuité d'activité et résilience des agences",'tech',[
    "L'architecture proposée permet le maintien de l'activité de guichet en mode dégradé en cas de perte de la liaison principale, par bascule automatique sur la liaison de secours. Le mode dégradé et ses limites fonctionnelles sont documentés et portés à la connaissance des exploitants d'agence.",
    "Le titulaire fournit, pour chaque type d'agence, une fiche de conduite à tenir en cas d'incident majeur : diagnostic de premier niveau, actions autorisées à l'agent d'agence, seuil d'escalade et coordonnées du support.",
    "Un exercice de simulation d'incident est organisé avant la réception définitive sur au moins trois sites de typologies différentes, en présence de l'exploitant. Le compte rendu de cet exercice, incluant les délais constatés, est annexé au dossier de réception.",
    "Les temps de reprise constatés lors de ces exercices constituent la référence contractuelle. Un écart significatif entre les délais annoncés à l'offre et les délais constatés donne lieu à un plan d'action correctif à la charge du titulaire."
  ]));
  cctp.push(A('4.'+(nx+15),"Gestion des versions, obsolescence et évolutions",'tech',[
    "Le titulaire maintient un référentiel des versions de micrologiciels déployées par référence d'équipement et par site. Toute mise à jour est précédée d'une validation en maquette et d'une demande de changement approuvée.",
    "Les mises à jour correctives de sécurité qualifiées de critiques par le constructeur sont déployées dans un délai de trente (30) jours à compter de leur publication, après validation en maquette. Les mises à jour fonctionnelles suivent le calendrier convenu en comité de suivi.",
    "Le titulaire informe l'autorité contractante de toute annonce de fin de commercialisation ou de fin de support affectant un matériel déployé, dans le mois suivant l'annonce, et propose une trajectoire de remplacement.",
    "Aucune modification de configuration n'est apportée en production sans demande de changement tracée, comportant la description de l'opération, l'analyse d'impact, la procédure de retour arrière et la fenêtre d'intervention."
  ]));
  cctp.push(A('4.'+(nx+16),"Contrôle de capacité, métrologie et amélioration continue",'tech',[
    "Le titulaire met en place une métrologie permettant de suivre l'évolution de la charge des liens, l'occupation des ports, la consommation électrique et la température des locaux techniques, avec conservation des historiques sur douze (12) mois glissants.",
    "Un rapport trimestriel de capacité est remis à l'autorité contractante, identifiant les sites approchant leurs limites, les incidents récurrents et les recommandations d'évolution argumentées et chiffrées.",
    "Les incidents récurrents font l'objet d'une analyse de cause racine formalisée, distincte du simple rétablissement du service. L'analyse est présentée en comité de suivi avec le plan d'action correspondant et son échéancier.",
    "Les recommandations du titulaire n'engagent l'autorité contractante que lorsqu'elles sont acceptées par écrit. Une recommandation formulée et non suivie d'effet ne dégage pas le titulaire de ses obligations de résultat sur le périmètre contractuel."
  ]));

  cctp.push(A('4.'+(nx+17),"Mise à la terre, protection foudre et surtensions",'tech',[
    "SPÉCIFICATION MINIMALE. Chaque local technique dispose d'une prise de terre dont la résistance mesurée est inférieure à dix (10) ohms. La mesure est réalisée contradictoirement avant installation ; lorsque la valeur n'est pas atteinte, le titulaire chiffre et réalise la reprise de la prise de terre au titre du marché.",
    "L'ensemble des masses métalliques des baies, chemins de câbles et coffrets est relié à une barrette de terre unique par site, selon un maillage documenté au dossier des ouvrages exécutés. Les liaisons équipotentielles sont réalisées en conducteur de section adaptée et repérées.",
    "Des parafoudres de type adapté sont installés en tête d'alimentation électrique de chaque local technique ainsi que sur les arrivées de liaisons cuivre extérieures. Les parafoudres comportent un report d'état de fin de vie vers la supervision.",
    "Les liaisons cuivre entre bâtiments distincts d'un même site sont proscrites : elles sont réalisées en fibre optique, y compris sur de courtes distances, afin d'éviter la propagation des surtensions d'origine atmosphérique.",
    "Le titulaire remet, pour chaque site, un procès-verbal de mesure de terre et de continuité des liaisons équipotentielles, daté et signé. L'absence de ce procès-verbal constitue une réserve bloquante à la réception provisoire du site concerné."
  ]));
  cctp.push(A('4.'+(nx+18),"Prérequis de site, génie civil et servitudes",'tech',[
    "Le titulaire établit, pour chaque site, une fiche de prérequis précisant les besoins en alimentation électrique, en espace, en ventilation, en cheminement de câbles et en travaux de percement éventuels. Cette fiche est transmise à l'autorité contractante au moins quinze (15) jours avant l'intervention.",
    "Les travaux de génie civil légers nécessaires au cheminement des câbles, à la pose des chemins de câbles et à la fixation des baies sont inclus dans le marché, ainsi que les rebouchages, les reprises de peinture et le nettoyage des zones d'intervention.",
    "Les percements de parois coupe-feu sont rebouchés au moyen de dispositifs conservant le degré coupe-feu d'origine. Un relevé photographique des rebouchages est joint au dossier des ouvrages exécutés.",
    "Le titulaire est réputé avoir pris connaissance de l'état des sites lors de la visite obligatoire. Aucune plus-value ne sera accordée au titre de sujétions de site qu'une visite attentive aurait permis d'identifier.",
    "Les interventions en agence sont conduites de manière à préserver l'accueil du public : protection des sols, limitation du bruit pendant les heures d'ouverture, dégagement quotidien des zones de circulation et évacuation des gravats en fin de journée."
  ]));
  cctp.push(A('4.'+(nx+19),"Interopérabilité avec le système d'information et la monétique",'tech',[
    "L'infrastructure proposée s'intègre sans adaptation du système d'information existant. Le soumissionnaire identifie dans son mémoire technique les éventuels points d'adhérence et les modalités de vérification préalable qu'il propose.",
    "Les automates bancaires et terminaux monétiques conservent leur adressage et leur cheminement réseau après migration, sauf décision contraire de l'autorité contractante. Toute modification affectant ces équipements fait l'objet d'une validation préalable de l'exploitant monétique.",
    "SPÉCIFICATION MINIMALE. Les flux à destination des automates bancaires ne transitent par aucun équipement partagé avec le réseau invité, et sont filtrés de manière explicite à chaque franchissement de segment.",
    "Le titulaire réalise, avant bascule de chaque site comportant un automate, un essai de transaction de bout en bout en condition réelle, tracé et validé par l'exploitant monétique. Aucune bascule n'est réputée achevée sans cet essai.",
    "Les fenêtres d'intervention sur les segments monétiques sont arrêtées conjointement avec les exploitants concernés et tiennent compte des périodes de forte affluence, notamment les fins de mois et les veilles de jours fériés."
  ]));
  cctp.push(A('4.'+(nx+20),"Gestion des identités, administration déléguée et traçabilité",'tech',[
    "Les droits d'administration sont attribués selon le principe du moindre privilège, par profils distincts : administration complète, exploitation courante, consultation seule. Les profils et leurs périmètres sont définis avec l'autorité contractante avant mise en service.",
    "Les intervenants du titulaire disposent de comptes nominatifs, individuellement identifiés, dont la création et la suppression suivent une procédure formalisée. La sortie d'un intervenant de l'équipe projet entraîne la révocation de ses accès sous vingt-quatre (24) heures.",
    "Les accès distants du titulaire aux équipements sont soumis à autorisation préalable pour chaque intervention, transitent par un point d'accès contrôlé par l'autorité contractante, et sont intégralement journalisés.",
    "Un relevé trimestriel des comptes actifs et des accès effectués est remis à l'autorité contractante. Tout écart entre les comptes déclarés et les comptes constatés donne lieu à explication écrite du titulaire."
  ]));
  cctp.push(A('4.'+(nx+21),"Repérage, inventaire et gestion des actifs",'tech',[
    "Chaque équipement installé est étiqueté de manière durable et lisible, résistante à la chaleur et à l'humidité, mentionnant l'identifiant du site, l'identifiant de l'équipement et sa fonction, selon la convention de nommage approuvée.",
    "Le titulaire constitue et remet un inventaire complet du parc déployé, exploitable sous format tableur, comportant par équipement : le site, la localisation précise, la référence, le numéro de série, la version de micrologiciel, la date de mise en service et la date d'échéance de garantie.",
    "Cet inventaire est tenu à jour pendant toute la durée du marché et remis actualisé à chaque comité de suivi trimestriel. Il est également remis lors de la réception définitive dans un format permettant sa reprise dans l'outil de gestion des actifs de l'autorité contractante.",
    "Les numéros de série déclarés sont vérifiables auprès du constructeur. Toute discordance entre l'inventaire déclaré et le parc constaté lors d'un contrôle inopiné constitue un manquement au sens du CCAP."
  ]));
  cctp.push(A('4.'+(nx+22),"Variantes, équivalences techniques et propriété des livrables",'tech',[
    "Les soumissionnaires peuvent proposer des variantes techniques, à la condition expresse de présenter également une offre de base strictement conforme aux exigences du présent CCTP. Une offre composée exclusivement de variantes est écartée.",
    "Toute proposition présentée comme équivalente à une exigence du CCTP est accompagnée d'une démonstration technique documentée de cette équivalence, pièce à pièce. La charge de la preuve incombe au soumissionnaire ; l'appréciation de l'équivalence relève de l'autorité contractante.",
    "Les configurations, scripts, procédures, schémas et documentations produits au titre du marché deviennent la propriété de l'autorité contractante, qui peut les utiliser, les modifier et les communiquer à un tiers intervenant sur son infrastructure, sans que le titulaire puisse s'y opposer.",
    "Les licences logicielles nécessaires au fonctionnement des équipements sont acquises au nom de l'autorité contractante et transférables. Les licences nominatives au titulaire ou non transférables sont refusées.",
    "À l'expiration du marché, le titulaire assure la réversibilité : remise de l'ensemble des éléments d'exploitation à jour, transfert des accès, et accompagnement du prestataire entrant pendant une période de trente (30) jours, incluse dans le prix du marché."
  ]));

  cctp.push(A('4.'+(nx+23),"Réception des matériels sur site, stockage et conservation",'tech',[
    "Les matériels sont réceptionnés contradictoirement sur chaque site ou sur la plateforme logistique du titulaire, en présence d'un représentant de l'autorité contractante. La réception donne lieu à un procès-verbal mentionnant les références, les quantités, les numéros de série et l'état des emballages.",
    "Le stockage intermédiaire est assuré dans des locaux fermés, secs et ventilés, à l'abri de l'ensoleillement direct et des infiltrations. Les matériels sont stockés sur palettes ou étagères, jamais à même le sol, afin de prévenir les dommages en cas d'inondation saisonnière.",
    "Les matériels demeurent sous la garde et la responsabilité du titulaire jusqu'à leur installation et leur mise en service. Toute perte, vol ou détérioration survenant avant réception provisoire est à sa charge exclusive, y compris lorsque le stockage s'effectue dans les locaux de l'autorité contractante.",
    "Les équipements sensibles à l'humidité sont conservés dans leur emballage d'origine avec dessiccant jusqu'à l'installation. Un matériel dont l'emballage a été ouvert plus de trente (30) jours avant installation fait l'objet d'un contrôle de bon fonctionnement documenté avant mise en service.",
    "Le titulaire tient un registre de mouvement des matériels, du port ou de l'entrepôt jusqu'au site d'installation, consultable à tout moment par l'autorité contractante."
  ]));
  cctp.push(A('4.'+(nx+24),"Sites isolés et contraintes d'accès",'tech',[
    "Certaines agences sont situées hors des grands axes et peuvent être difficilement accessibles en saison des pluies. Le soumissionnaire intègre cette contrainte dans son planning et précise, pour chacun de ces sites, la fenêtre d'intervention qu'il retient et les moyens logistiques mobilisés.",
    "SPÉCIFICATION MINIMALE. Pour les sites isolés, le titulaire constitue sur place un jeu de pièces de rechange de premier niveau permettant le remplacement des composants les plus exposés sans attendre un acheminement depuis Abidjan. La liste de ce jeu est soumise à l'approbation de l'autorité contractante.",
    "Les interventions sur ces sites sont regroupées afin de limiter les déplacements. Le titulaire propose un calendrier de tournées préventives cohérent avec les contraintes saisonnières d'accès.",
    "Lorsque l'accès physique est temporairement impossible, le titulaire met en œuvre les moyens de diagnostic et de correction à distance dont il dispose, et en informe l'exploitant. L'impossibilité d'accès dûment constatée suspend le décompte des délais d'intervention, à charge pour le titulaire d'en apporter la preuve.",
    "Le titulaire prend à sa charge l'ensemble des frais de déplacement, d'hébergement et de mission de ses équipes, quels que soient l'éloignement du site et la durée de l'intervention. Aucune facturation complémentaire à ce titre ne sera admise."
  ]));
  cctp.push(A('4.'+(nx+25),"Essais de montée en charge et vérification du dimensionnement",'tech',[
    "Avant la réception provisoire, le titulaire réalise des essais de montée en charge sur un site représentatif de chaque typologie d'agence, visant à vérifier le comportement de l'infrastructure en conditions de trafic soutenu.",
    "Les essais portent notamment sur : la saturation progressive des liens montants, le comportement de la qualité de service sous charge, la tenue des équipements en température après plusieurs heures de fonctionnement à charge élevée, et le comportement du dispositif lors d'une bascule de liaison en pleine charge.",
    "Les résultats sont comparés aux hypothèses de dimensionnement présentées dans le mémoire technique. Un écart défavorable significatif entre les performances annoncées et les performances constatées engage le titulaire à renforcer le dimensionnement à ses frais.",
    "Les essais sont conduits en dehors des heures d'ouverture au public et selon un protocole approuvé préalablement. Les mesures sont relevées contradictoirement et consignées dans un rapport d'essais annexé au dossier de réception.",
    "Le titulaire fournit l'ensemble des moyens de test nécessaires à ces essais : générateurs de trafic, appareils de mesure étalonnés, sondes de température. Ces moyens demeurent sa propriété et sont retirés à l'issue des essais."
  ]));

  P.push({ id:'p4', titre:"Pièce 4 — Cahier des clauses techniques particulières", cat:'tech', arts:cctp });

  /* ---------- PIÈCE 5 : BORDEREAU ---------- */
  P.push({ id:'p5', titre:"Pièce 5 — Bordereau des prix et détail quantitatif estimatif", cat:'admin', arts:[
    A('5.1',"Structure des prix",'admin',[
      "Le bordereau est renseigné ligne à ligne, sans ajout ni suppression de poste. Les prix unitaires sont exprimés hors taxes, dans la devise de soumission retenue, et s'entendent toutes sujétions comprises : fourniture, transport, assurance, dédouanement, installation, essais, documentation et formation afférents au poste.",
      "Un poste laissé vide est réputé inclus dans les autres prix du bordereau et ne pourra donner lieu à rémunération complémentaire. Un prix manifestement anormal au regard de la prestation attendue peut donner lieu à demande de justification écrite avant toute décision d'écartement.",
      "Le détail quantitatif estimatif est établi sur la base des quantités prévisionnelles indiquées. La rémunération du titulaire s'effectue sur la base des quantités réellement exécutées, constatées contradictoirement."
    ]),
    A('5.2',"Décomposition par lot et sous-détail",'admin',
      [ "Le bordereau comporte une section par lot, dont la structure est la suivante :" ]
      .concat(lots.map(function(l,i){ return "Section "+(i+1)+" — "+l.nom+" : postes de fourniture, postes de main-d'œuvre d'installation, postes d'essais et de recette, poste de documentation et de formation. Montant estimatif : "+l.montant+"."; }))
      .concat([ "Pour les postes dont le montant unitaire dépasse cinq millions (5 000 000) de francs CFA, un sous-détail de prix est joint, faisant apparaître la part de fourniture, la part de main-d'œuvre, les frais généraux et la marge." ]))
  ]});

  /* ---------- PIÈCE 6 : CADRE DU MÉMOIRE TECHNIQUE ---------- */
  P.push({ id:'p6', titre:"Pièce 6 — Cadre du mémoire technique", cat:'tech', arts:[
    A('6.1',"Structure imposée du mémoire technique",'tech',[
      "Le mémoire technique est présenté selon la structure imposée ci-après, sans inversion ni fusion de chapitres. Un mémoire ne respectant pas cette structure est plus difficilement comparable et s'expose à une notation défavorable sur le critère de méthodologie.",
      "Chapitre 1 — Compréhension du besoin et analyse du contexte : reformulation des enjeux, identification des contraintes propres au parc d'agences, points de vigilance relevés lors de la visite de site.",
      "Chapitre 2 — Architecture technique proposée : schémas par type d'agence, plan d'adressage, matrice des flux, justification des choix au regard des exigences du CCTP.",
      "Chapitre 3 — Matériels proposés : fiches techniques, tableau de conformité exigence par exigence avec renvoi de page, attestations constructeur, engagements de support et de disponibilité des pièces.",
      "Chapitre 4 — Méthodologie de déploiement : découpage en vagues, site pilote, procédure de bascule, gestion des interruptions de service, plan de repli en cas d'échec d'une bascule.",
      "Chapitre 5 — Organisation et moyens : organigramme nominatif, curriculums des intervenants clés, moyens matériels affectés, localisation des équipes, part de sous-traitance envisagée.",
      "Chapitre 6 — Planning détaillé : planning par lot et par vague, chemin critique identifié, jalons de contrôle, marges prévues pour l'acheminement et le dédouanement.",
      "Chapitre 7 — Plan de recette : scénarios de test par exigence, modes de preuve, critères d'acceptation, modèle de procès-verbal.",
      "Chapitre 8 — Maintenance et niveaux de service : organisation du support, localisation du stock de pièces, engagements de délais par zone géographique, dispositif d'astreinte.",
      "Chapitre 9 — Analyse et maîtrise des risques : registre des risques identifiés, probabilité, impact, mesures de prévention et plans de contingence associés.",
      "Chapitre 10 — Références : marchés similaires exécutés, périmètre, montant, année, attestations de bonne exécution, contacts joignables pour vérification."
    ]),
    A('6.2',"Éléments attendus à l'appui de la notation qualitative",'tech',[
      "La notation du critère de méthodologie s'appuie sur le caractère spécifique et vérifiable des éléments produits. Un mémoire reprenant les termes du CCTP sans les traduire en organisation concrète est considéré comme générique et noté en conséquence.",
      "Sont particulièrement valorisés : un planning dont le chemin critique est identifié et argumenté, un plan de repli documenté pour chaque bascule, un registre des risques comportant des mesures opérationnelles et non des intentions, et des références vérifiables auprès de contacts joignables.",
      "Sont considérés comme insuffisants : les plannings sans jalon de contrôle, les organigrammes sans nom ni curriculum, les engagements de délai non assortis de moyens correspondants, et les références dont le périmètre n'est pas comparable à celui du présent marché."
    ])
  ]});

  /* ---------- PIÈCE 7 : MODÈLES ---------- */
  P.push({ id:'p7', titre:"Pièce 7 — Modèles et formulaires", cat:'admin', arts:[
    A('7.1',"Liste des modèles annexés",'admin',[
      "Sont annexés au présent dossier, à utiliser sans modification : le modèle d'acte d'engagement ; le modèle de caution de soumission ; le modèle de garantie de bonne exécution ; le modèle de garantie de restitution d'avance ; la déclaration sur l'honneur de non-exclusion ; le formulaire de renseignements sur le candidat ; le tableau de conformité aux spécifications minimales ; le modèle d'attestation de visite de site.",
      "Toute modification apportée par un soumissionnaire au texte d'un modèle de garantie bancaire est signalée à l'autorité contractante, qui apprécie si elle en altère la portée. Une garantie dont la rédaction prive l'autorité contractante de son caractère à première demande est réputée non conforme."
    ])
  ]});

  return P;
}

function daoVolume(P){
  var tech=0, admin=0;
  P.forEach(function(pi){
    pi.arts.forEach(function(a){
      var n=a.t.length; a.p.forEach(function(x){ n+=x.length; });
      if(a.cat==='tech') tech+=n; else admin+=n;
    });
  });
  var total=tech+admin;
  return { tech:tech, admin:admin, total:total,
    pages:Math.max(1,Math.round(total/2600)),
    pctTech: total? Math.round(tech/total*100):0,
    pctAdmin: total? Math.round(admin/total*100):0 };
}

function vDAO(m){
  var c=state.cdc, P=buildDAO(), V=daoVolume(P);
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'div','eyebrow',REF());
  add(l,'h1',null,"Dossier d'appel d'offres généré");
  add(l,'p','lede',"Document complet assemblé à partir des paramètres du cahier des charges : "+P.length+" pièces, "+P.reduce(function(s,x){return s+x.arts.length;},0)+" articles, volume estimé à "+V.pages+" pages. Toute modification du cahier des charges régénère le document.");
  add(h,'button','btn btn-ghost btn-sm','Imprimer / exporter').addEventListener('click',function(){ imprimer(); });

  /* Composition */
  var comp=add(m,'div','card');
  var cph=add(comp,'div','panel-head');
  add(cph,'span',null,'Composition du dossier');
  add(cph,'span','chip '+(V.pages>=20?'c-green':'c-amber'), V.pages+' pages estimées');
  var cb=add(comp,'div','pad');
  var cible=Number(c.partTechnique||75);
  var barw=add(cb,'div'); barw.style.cssText='display:flex;height:26px;border-radius:8px;overflow:hidden;border:1px solid var(--line)';
  var bt=add(barw,'div',null, 'Technique '+V.pctTech+' %');
  bt.style.cssText='width:'+V.pctTech+'%;background:var(--teal);color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;white-space:nowrap';
  var ba=add(barw,'div',null,'Administratif et financier '+V.pctAdmin+' %');
  ba.style.cssText='width:'+V.pctAdmin+'%;background:var(--nav);color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;white-space:nowrap';
  var ecart=V.pctTech-cible;
  var msg=add(cb,'p',null, 'Cible fixée : '+cible+' % technique / '+(100-cible)+' % administratif et financier. Écart constaté : '+(ecart>=0?'+':'')+ecart+' point(s).');
  msg.style.cssText='font-size:13px;margin:12px 0 0;color:'+(Math.abs(ecart)<=5?'var(--muted)':'var(--amber)');
  var ctl=add(cb,'div'); ctl.style.cssText='display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-top:12px';
  var wc=add(ctl,'div');
  var lab=add(wc,'label',null,'Part technique cible (%)'); lab.setAttribute('for','parttech');
  lab.style.cssText='display:block;font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px';
  var pi=add(wc,'input'); pi.id='parttech'; pi.type='number'; pi.min='50'; pi.max='90'; pi.value=cible; pi.style.width='120px';
  pi.addEventListener('change',function(){
    c.partTechnique=Math.max(50,Math.min(90,Number(pi.value)||75));
    logit('Part technique cible du dossier portée à '+c.partTechnique+' %'); save(); render();
  });
  add(ctl,'span','muted','Pour augmenter la part technique, enrichissez les lots et les spécifications du cahier des charges : le CCTP se développe à proportion.');

  /* Sommaire */
  var som=add(m,'div','card'); som.id='dao-sommaire'; som.style.marginTop='18px';
  add(som,'div','panel-head','Sommaire');
  var sb=add(som,'div','pad');
  P.forEach(function(pi){
    var v=daoVolume([pi]);
    var row=add(sb,'div','docline');
    var go2=add(row,'button','btn btn-ghost btn-sm');
    go2.style.cssText='text-align:left;flex:1 1 300px;border:none;background:none;padding:6px 0;min-height:44px';
    var lf=add(go2,'div');
    add(lf,'div',null,pi.titre).style.cssText='font-weight:600;color:var(--teal-dark)';
    add(lf,'div','muted', pi.arts.length+' article(s) · environ '+v.pages+' page(s)');
    go2.addEventListener('click',function(){
      var t=document.getElementById('dao-'+pi.id);
      if(t){ t.scrollIntoView({behavior:'smooth',block:'start'}); t.setAttribute('tabindex','-1'); t.focus({preventScroll:true}); }
    });
    add(row,'span','chip '+(pi.cat==='tech'?'c-teal':'c-grey'), pi.cat==='tech'?'Technique':'Administratif / financier');
  });

  /* Document */
  var doc=add(m,'div','card'); doc.style.marginTop='18px';
  add(doc,'div','panel-head','Corps du dossier');
  var db=add(doc,'div','pad'); var pv=add(db,'div','pv');
  add(pv,'div',null,'DOSSIER D\u2019APPEL D\u2019OFFRES — '+REF()).style.cssText='font-weight:700;font-size:16px;color:var(--ink)';
  add(pv,'p',null, c.autorite+' — '+c.procedure);
  add(pv,'p',null, 'Objet : '+c.objet);
  add(pv,'p',null, 'Langue : '+c.langue+' · Devise : '+c.deviseSoumission+' · Date limite de dépôt : '+c.ouverture);
  P.forEach(function(pi){
    var t=add(pv,'h4',null,pi.titre);
    t.id='dao-'+pi.id;
    t.style.cssText='margin:26px 0 10px;font-size:13px;color:var(--ink);border-bottom:1px solid var(--line);padding-bottom:6px;text-transform:none;letter-spacing:0;scroll-margin-top:90px';
    pi.arts.forEach(function(a){
      var at=add(pv,'div',null,'Article '+a.n+' — '+a.t);
      at.style.cssText='font-weight:700;color:var(--ink);margin:14px 0 4px;font-size:13.5px';
      a.p.forEach(function(x){
        var p=add(pv,'p',null,x); p.style.margin='0 0 8px';
        if(x.indexOf('SPÉCIFICATION MINIMALE')===0){
          p.style.cssText+=';background:var(--amber-bg);border-left:3px solid var(--amber-line);padding:8px 12px';
        }
      });
    });
    var back=add(pv,'button','btn btn-ghost btn-sm','↑ Retour au sommaire');
    back.style.marginTop='6px';
    back.addEventListener('click',function(){
      var so=document.getElementById('dao-sommaire');
      if(so) so.scrollIntoView({behavior:'smooth',block:'start'});
    });
  });

  var n=add(m,'div','note');
  add(n,'strong',null,'Ce que ce générateur fait et ne fait pas. ');
  n.appendChild(document.createTextNode("Il assemble un dossier structuré et cohérent avec vos paramètres, en donnant au volet technique le poids que vous avez fixé. Il ne remplace ni le juriste marchés publics, qui doit viser les clauses au regard du code applicable et des règles du bailleur, ni l'ingénieur métier, qui doit valider que les spécifications correspondent au besoin réel. Un dossier généré et non relu est un risque de recours, pas un gain de temps."));
}

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
    state.notifs.unshift({ id:'n'+Date.now()+Math.random().toString(36).slice(2,6), ev:evId,
      lab:(ev?ev.lab:evId), titre:titre, corps:corps, t:t, roles:r.roles.slice(), lu:[] });
    if(state.notifs.length>120) state.notifs.length=120;
  }
  if(r.email){
    var dest=destinataires(r.roles);
    state.emails.unshift({ id:'m'+Date.now()+Math.random().toString(36).slice(2,6), ev:evId,
      de:state.mailFrom, a:dest.map(mailAdr), noms:dest.map(function(u){return u.nom+' ('+roleLab(u.role)+')';}),
      objet:'['+REF()+'] '+titre, corps:corps+"\n\n—\n"+state.org.nom+" — plateforme Marché+\nCe message est généré automatiquement ; ne pas y répondre.",
      t:t, statut:'simulé' });
    if(state.emails.length>80) state.emails.length=80;
  }
}
function notifsPourMoi(){
  var r=me().role;
  return state.notifs.filter(function(nn){ return nn.roles.indexOf(r)>=0; });
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
var VIEWS=[
  {id:'dashboard',  label:'Tableau de bord', grp:'Pilotage'},
  {id:'notifs',     label:'Notifications', grp:'Pilotage'},
  {id:'cdc',        label:'Cahier des charges', grp:'Préparation', perm:'cdc.edit'},
  {id:'dao',        label:'DAO', grp:'Préparation', perm:'cdc.edit'},
  {id:'criteres',   label:'Grille de critères', grp:'Préparation', perm:'criteres.edit'},
  {id:'qa',         label:'Questions', grp:'Préparation', perm:'offres.read'},
  {id:'portail',    label:'Portail de dépôt', grp:'Soumission', role:true, perm:'portail.use'},
  {id:'reception',  label:'Réception', grp:'Offres', perm:'offres.read'},
  {id:'depouille',  label:'Dépouillement', grp:'Offres', perm:'offres.read'},
  {id:'conformite', label:'Conformité', grp:'Offres', perm:'offres.read'},
  {id:'clarifs',    label:'Clarifications', grp:'Offres', perm:'offres.read'},
  {id:'evaluation', label:'Évaluation', grp:'Décision', perm:'offres.read'},
  {id:'decision',   label:'Décision', grp:'Décision', perm:'offres.read'},
  {id:'recours',    label:'Recours', grp:'Décision', perm:'offres.read'},
  {id:'pv',         label:'Procès-verbal', grp:'Décision', perm:'pv.read'},
  {id:'audit',      label:"Journal d'audit", grp:'Décision', perm:'audit.read'},
  {id:'roles',      label:'Rôles', grp:'Administration', perm:'roles.edit'},
  {id:'comptes',    label:'Comptes', grp:'Administration', perm:'roles.edit'},
  {id:'params',     label:'Paramètres', grp:'Administration', perm:'params.edit'},
  {id:'regles',     label:'Alertes', grp:'Administration', perm:'notif.manage'}
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
function viewAllowed(id){ return VIEWS.some(function(v){ return v.id===id && (!v.perm || can(v.perm)); }); }
/* Le soumissionnaire n'a rien à faire sur le tableau de bord acheteur : il arrive sur son portail. */
function homeView(){ return (!can('offres.read') && can('portail.use')) ? 'portail' : 'dashboard'; }
function renderNav(){
  var box=document.getElementById('navs'); box.textContent='';
  var grp=null;
  var vis=VIEWS.filter(function(v){ return !v.perm || can(v.perm); });
  vis.forEach(function(v){
    if(v.grp!==grp){ grp=v.grp; add(box,'div','navgrp',grp); }
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
    } else if(v.id==='notifs'&&nonLues().length>0){
      b.appendChild(el('span','n',String(nonLues().length)));
    }
    if(v.id===state.view) b.setAttribute('aria-current','page');
    b.addEventListener('click',function(){ closeMenu(); go(v.id); });
    box.appendChild(b);
  });
}
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
  if(def && def.perm && !can(def.perm)){ toast('Écran non accessible avec le rôle « '+myRole().lab+' ».'); return; }
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
  add(oth,'div','panel-head','Autres procédures du portefeuille');
  var ob=add(oth,'div','pad');
  [['AO-2026-013','Travaux de rénovation — siège régional','Évaluation','c-blue','11 offres'],
   ['DC-2026-041','Maintenance climatisation — agences Abidjan','Dépouillement','c-amber','5 offres'],
   ['RC-2026-008','Audit sécurité — infrastructure IT','Brouillon','c-grey','—'],
   ['AO-2026-012','Acquisition de véhicules de service','Attribué','c-green','9 offres'],
   ['AO-2026-009','Fourniture de groupes électrogènes','Attribué','c-green','6 offres']
  ].forEach(function(x){
    var r=add(ob,'div','docline');
    var lf=add(r,'div');
    add(lf,'div',null,x[0]+' — '+x[1]).style.fontWeight='600';
    add(lf,'div','muted',x[4]);
    add(r,'span','chip '+x[3],x[2]);
  });
  add(add(oth,'div','panel-foot'),'span','muted','Contexte de démonstration : seule la procédure '+REF()+' est instrumentée dans ce prototype.');

  var n=add(m,'div','note');
  add(n,'strong',null,'Préférence communautaire. ');
  n.appendChild(document.createTextNode(
    state.cdc.prefActive
      ? "Une marge de préférence de "+state.cdc.prefTaux+" % est appliquée à la comparaison : les offres hors UEMOA sont majorées de ce taux pour le seul classement, sans modification du prix contractuel. Son activation et son taux se règlent au cahier des charges, et sont figés à la clôture du dépouillement."
      : "La marge de préférence communautaire est désactivée : les offres sont comparées à leur valeur convertie, sans correction d'origine."));
}

function vCDC(m){
  var c=state.cdc;
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Cahier des charges');
  add(l,'p','lede',"Construction du dossier d'appel d'offres : objet, allotissement, spécifications, pièces exigées selon l'origine du soumissionnaire, régime fiscal et douanier, préférence communautaire. Ces paramètres alimentent ensuite tout le reste de la procédure.");
  var pb=add(h,'button','btn '+(c.cdcPublie?'btn-ghost':'btn-primary'), c.cdcPublie?'Cahier des charges publié ✓':'Publier le cahier des charges');
  pb.disabled=c.cdcPublie; guard('cdc.publish',pb);
  pb.addEventListener('click',function(){
    ask('Le dossier devient opposable aux candidats et le portail de dépôt s\u2019ouvre.', function(){
      c.cdcPublie=true; logit('Cahier des charges publié — ouverture aux soumissions');
      notify('cdc.publie', 'Cahier des charges publié',
        "Le dossier d'appel d'offres "+REF()+" est publié. Objet : "+c.objet+". Date limite de dépôt : "+c.ouverture+" à 10 h 00.");
      save(); render();
    }, 'Publier le cahier des charges ?', 'Publier');
  });

  /* Identification */
  var k1=add(m,'div','card'); add(k1,'div','panel-head','1 · Identification de la procédure');
  var f1=add(add(k1,'div','pad'),'div','frm');
  function txt(parent,lab,val,cb,type){
    var w=add(parent,'div'); var id='f'+Math.random().toString(36).slice(2,8);
    var lb=add(w,'label',null,lab); lb.setAttribute('for',id);
    var i=add(w,type==='textarea'?'textarea':'input'); i.id=id;
    if(type==='number'){ i.type='number'; } else if(type!=='textarea'){ i.type='text'; }
    if(type==='textarea'){ i.rows=2; }
    i.value=val; fk(i,'cdc-'+lab.slice(0,16));
    i.addEventListener('change',function(){ cb(i.value); save(); render(); });
    return i;
  }
  txt(f1,"Référence de la procédure",c.ref,function(v){ c.ref=String(v).trim(); logit('Référence de la procédure : '+c.ref); });
  txt(f1,"Objet du marché",c.objet,function(v){ c.objet=v; logit('Objet du marché modifié'); },'textarea').style.gridColumn='1/-1';
  txt(f1,"Autorité contractante",c.autorite,function(v){ c.autorite=v; });
  txt(f1,"Type de procédure",c.procedure,function(v){ c.procedure=v; });
  (function(){
    var w=add(f1,'div'); add(w,'label',null,'Profil réglementaire').setAttribute('for','cdc-profil');
    var s=add(w,'select'); s.id='cdc-profil'; fk(s,'cdc-profil');
    Object.keys(MPProfils.PROFILS).forEach(function(id){ var op=add(s,'option',null,MPProfils.PROFILS[id].lab); op.value=id; });
    s.value=R.profilId(RCTX());
    s.disabled=!!c.cdcPublie;
    s.addEventListener('change',function(){ c.profil=s.value; logit('Profil réglementaire de la procédure : '+MPProfils.profil(s.value).lab); save(); render(); });
    if(c.cdcPublie) add(w,'div','muted','Figé à la publication du dossier.');
  })();
  txt(f1,"Langue de soumission",c.langue,function(v){ c.langue=v; });
  txt(f1,"Devise de soumission",c.deviseSoumission,function(v){ c.deviseSoumission=v; });
  txt(f1,"Date d'ouverture des plis",c.ouverture,function(v){ c.ouverture=v; });

  /* Allotissement */
  var k2=add(m,'div','card'); k2.style.marginTop='18px';
  add(k2,'div','panel-head','2 · Allotissement');
  var b2=add(k2,'div','pad');
  c.lots.forEach(function(lot,i){
    var row=add(b2,'div','lot');
    var n=add(row,'input'); n.type='text'; n.value=lot.nom; n.style.flex='2 1 260px';
    n.setAttribute('aria-label','Intitulé du lot');
    n.addEventListener('change',function(){ lot.nom=n.value; save(); });
    var mt=add(row,'input'); mt.type='text'; mt.value=lot.montant; mt.style.flex='1 1 150px';
    mt.setAttribute('aria-label','Montant estimatif du lot');
    mt.addEventListener('change',function(){ lot.montant=mt.value; save(); });
    var d=add(row,'button','icon-btn','×'); d.setAttribute('aria-label','Supprimer le lot');
    d.addEventListener('click',function(){
      ask('Le lot « '+lot.nom+' » sera retiré du cahier des charges et du dossier généré.', function(){
        c.lots.splice(i,1); logit('Lot supprimé du cahier des charges'); save(); render();
      }, 'Supprimer ce lot ?', 'Supprimer');
    });
  });
  var f2=add(k2,'div','panel-foot');
  add(f2,'span','muted','Un marché alloti permet aux PME locales de soumissionner sur un lot sans porter l\u2019ensemble du marché.');
  add(f2,'button','btn btn-ghost btn-sm','+ Ajouter un lot').addEventListener('click',function(){
    c.lots.push({id:'l'+Date.now(), nom:'Nouveau lot', montant:'— XOF'});
    logit('Lot ajouté au cahier des charges'); save(); render();
  });

  /* Spécifications */
  var k3=add(m,'div','card'); k3.style.marginTop='18px';
  add(k3,'div','panel-head','3 · Spécifications techniques');
  var b3=add(k3,'div','pad');
  c.specs.forEach(function(s,i){
    var row=add(b3,'div','lot');
    var t=add(row,'input'); t.type='text'; t.value=s; t.style.flex='1 1 320px';
    t.setAttribute('aria-label','Spécification technique');
    t.addEventListener('change',function(){ c.specs[i]=t.value; save(); });
    var d=add(row,'button','icon-btn','×'); d.setAttribute('aria-label','Supprimer la spécification');
    d.addEventListener('click',function(){
      ask('Cette exigence disparaîtra du CCTP et ne sera plus opposable aux soumissionnaires.', function(){
        c.specs.splice(i,1); logit('Spécification technique supprimée'); save(); render();
      }, 'Supprimer cette spécification ?', 'Supprimer');
    });
  });
  var f3=add(k3,'div','panel-foot');
  add(f3,'span','muted','Rédigez des spécifications fonctionnelles neutres : citer une marque restreint la concurrence et fragilise la procédure.');
  add(f3,'button','btn btn-ghost btn-sm','+ Ajouter une spécification').addEventListener('click',function(){
    c.specs.push('Nouvelle spécification'); save(); render();
  });

  /* Conditions */
  var k4=add(m,'div','card'); k4.style.marginTop='18px';
  add(k4,'div','panel-head','4 · Conditions administratives et financières');
  var f4=add(add(k4,'div','pad'),'div','frm');
  txt(f4,"Caution de soumission (% du montant)",c.caution,function(v){ c.caution=Number(v)||0; logit('Taux de caution porté à '+v+' %'); },'number');
  txt(f4,"Garantie minimale exigée (mois)",c.garantieMin,function(v){ c.garantieMin=Number(v)||0; logit('Garantie minimale portée à '+v+' mois'); },'number');
  txt(f4,"Délai d'exécution maximal (jours)",c.delaiMax,function(v){ c.delaiMax=Number(v)||0; logit('Délai maximal porté à '+v+' jours'); },'number');
  txt(f4,"Pénalité de retard (‰ par jour)",c.penalite,function(v){ c.penalite=Number(v)||0; },'number');
  txt(f4,"Avance de démarrage (%)",c.avance,function(v){ c.avance=Number(v)||0; },'number');

  /* Fiscal */
  var k5=add(m,'div','card'); k5.style.marginTop='18px';
  add(k5,'div','panel-head','5 · Régime fiscal et douanier');
  var f5=add(add(k5,'div','pad'),'div','frm');
  txt(f5,"TVA applicable (%)",c.tva,function(v){ c.tva=Number(v)||0; },'number');
  txt(f5,"Retenue à la source — non-résidents (%)",c.retenueNonResident,function(v){ c.retenueNonResident=Number(v)||0; },'number');
  txt(f5,"Droits et taxes à l'importation à la charge de",c.douaneACharge,function(v){ c.douaneACharge=v; });
  var w5=add(add(k5,'div','pad'),'div','warn'); w5.style.marginTop='0';
  add(w5,'strong',null,'Pourquoi ce bloc compte pour les offres étrangères. ');
  w5.appendChild(document.createTextNode("Une offre hors zone peut paraître moins-disante et se révéler plus chère une fois la retenue à la source et les droits d'entrée intégrés. Le cahier des charges doit dire explicitement qui les supporte, sinon la comparaison entre offres locales et étrangères n'a pas de base commune."));

  /* Préférence */
  var k6=add(m,'div','card'); k6.style.marginTop='18px';
  add(k6,'div','panel-head','6 · Préférence communautaire UEMOA');
  var b6=add(k6,'div','pad');
  var row6=add(b6,'div'); row6.style.cssText='display:flex;gap:12px;align-items:center;flex-wrap:wrap';
  var K=CADRE();
  var pill=add(row6,'button','pill'+(c.prefActive?' on':''), c.prefActive?'Marge de préférence activée':'Marge de préférence désactivée');
  pill.disabled=!K.preferenceAutorisee && !c.prefActive;
  pill.addEventListener('click',function(){
    c.prefActive=!c.prefActive;
    logit('Marge de préférence communautaire '+(c.prefActive?'activée':'désactivée'));
    save(); render();
  });
  var wr=add(row6,'div');
  var lb=add(wr,'label',null,'Taux (%)'); lb.setAttribute('for','preftaux');
  lb.style.cssText='font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;display:block';
  var pi=add(wr,'input'); pi.id='preftaux'; pi.type='number'; pi.min='0'; pi.max=String(K.preferenceTauxMax); pi.value=c.prefTaux; pi.style.width='110px';
  pi.disabled=!c.prefActive;
  pi.addEventListener('change',function(){
    c.prefTaux=Math.max(0,Math.min(K.preferenceTauxMax,Number(pi.value)||0));
    logit('Taux de préférence communautaire porté à '+c.prefTaux+' %'); save(); render();
  });
  if(state.depClosed){
    pill.disabled=true; pi.disabled=true;
    add(b6,'p','muted',"Dépouillement clôturé : la marge est figée, elle conditionne le classement.").style.marginTop='12px';
  }
  add(b6,'p','muted', K.preferenceAutorisee
    ? 'Profil « '+MPProfils.profil(R.profilId(RCTX())).lab+' » : taux de '+K.preferenceTauxMax+' % au plus.'
    : 'Le profil « '+MPProfils.profil(R.profilId(RCTX())).lab+' » n’autorise pas de marge de préférence.').style.marginTop='12px';
  add(b6,'p','muted',"Mécanisme : les offres de soumissionnaires établis hors de l'espace communautaire sont majorées du taux retenu pour les seuls besoins de la comparaison. Le prix contractuel du titulaire reste son prix d'offre.").style.marginTop='12px';

  /* Pièces */
  var k7=add(m,'div','card'); k7.style.marginTop='18px';
  add(k7,'div','panel-head','7 · Pièces exigées du dossier de candidature');
  var b7=add(k7,'div','pad');
  DOCS().forEach(function(d){
    var row=add(b7,'div','docline');
    var lf=add(row,'div');
    add(lf,'div',null,d.label).style.fontWeight='600';
    add(lf,'div','muted', d.scope==='tous'?'Exigée de tous les soumissionnaires'
      : (d.scope==='local'?'Exigée des soumissionnaires établis en Côte d\u2019Ivoire'
      : 'Exigée des soumissionnaires établis hors zone UEMOA'));
    add(row,'span','chip '+(d.scope==='tous'?'c-grey':(d.scope==='local'?'c-teal':'c-violet')),
      d.scope==='tous'?'Tous':(d.scope==='local'?'Local':'Étranger'));
  });
  add(add(k7,'div','panel-foot'),'span','muted',"Le dossier d'un soumissionnaire étranger n'est pas « allégé » : il est différent. Exiger une attestation CNPS d'une entreprise allemande n'a pas de sens ; exiger une contre-garantie bancaire locale et une traduction certifiée en a un.");

  /* Aperçu DAO */
  var k8=add(m,'div','card'); k8.style.marginTop='18px';
  var ph8=add(k8,'div','panel-head'); add(ph8,'span',null,'8 · Génération du dossier d\u2019appel d\u2019offres');
  var gob=add(ph8,'button','btn btn-primary btn-sm','Générer le dossier complet →');
  gob.addEventListener('click',function(){ logit('Dossier d\u2019appel d\u2019offres généré'); go('dao'); });
  var prb=add(ph8,'button','btn btn-ghost btn-sm','Imprimer l\u2019extrait');
  prb.addEventListener('click',function(){ imprimer(); });
  var b8=add(k8,'div','pad'); var pv=add(b8,'div','pv');
  add(pv,'div',null,'DOSSIER D\u2019APPEL D\u2019OFFRES — '+REF()).style.cssText='font-weight:700;font-size:15px;color:var(--ink)';
  add(pv,'p',null, c.autorite+' — '+c.procedure+' — langue : '+c.langue+' — ouverture des plis : '+c.ouverture);
  add(pv,'h4',null,'Objet'); add(pv,'p',null,c.objet);
  add(pv,'h4',null,'Allotissement');
  var u1=add(pv,'ul'); c.lots.forEach(function(x){ add(u1,'li',null, x.nom+' — estimation : '+x.montant); });
  add(pv,'h4',null,'Spécifications techniques');
  var u2=add(pv,'ul'); c.specs.forEach(function(x){ add(u2,'li',null,x); });
  add(pv,'h4',null,'Conditions');
  add(pv,'p',null,'Caution de soumission : '+c.caution+' % du montant de l\u2019offre · Garantie minimale : '+c.garantieMin+' mois · Délai maximal : '+c.delaiMax+' jours · Pénalité de retard : '+c.penalite+' ‰ par jour · Avance de démarrage : '+c.avance+' %.');
  add(pv,'h4',null,'Régime fiscal et douanier');
  add(pv,'p',null,'TVA : '+c.tva+' % · Retenue à la source applicable aux non-résidents : '+c.retenueNonResident+' % · Droits et taxes à l\u2019importation à la charge de : '+c.douaneACharge+'.');
  add(pv,'h4',null,'Préférence communautaire');
  add(pv,'p',null, c.prefActive ? 'Une marge de préférence de '+c.prefTaux+' % est appliquée aux fins de comparaison en faveur des soumissionnaires établis dans l\u2019espace UEMOA.' : 'Aucune marge de préférence communautaire n\u2019est appliquée.');
  add(pv,'h4',null,'Critères d\u2019évaluation');
  add(pv,'p',null, state.criteria.map(function(x){ return x.label+' ('+x.weight+' %)'; }).join(' · '));
  add(pv,'h4',null,'Pièces exigées');
  var u3=add(pv,'ul');
  DOCS().forEach(function(d){ add(u3,'li',null, d.label+' — '+(d.scope==='tous'?'tous soumissionnaires':(d.scope==='local'?'soumissionnaires locaux':'soumissionnaires hors UEMOA'))); });

  var n=add(m,'div','note');
  add(n,'strong',null,'Ce module produit un projet, pas un acte juridique. ');
  n.appendChild(document.createTextNode("Le dossier généré doit être relu par le juriste de l'autorité contractante et mis en conformité avec le code des marchés publics applicable et, le cas échéant, les procédures du bailleur de fonds, qui priment sur tout gabarit logiciel."));
}

function vCriteres(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Grille de critères');
  add(l,'p','lede',"Grille paramétrable par organisation et par type de procédure. Les critères « calculés » sont notés par formule sur les montants convertis et corrigés de la préférence ; les critères qualitatifs reçoivent une proposition de l'IA validée par un évaluateur.");

  var card=add(m,'div','card');
  var ph=add(card,'div','panel-head'); add(ph,'span',null,'Critères et pondérations');
  var wt=weightTotal(); add(ph,'span','chip '+(wt===100?'c-green':'c-red'),'Total : '+wt+' %');
  var body=add(card,'div','pad');
  var hdr=add(body,'div','crow'); hdr.style.cssText+=';padding-top:0;border-top:none';
  ['Critère','Pondération (%)','Type',''].forEach(function(x){
    add(hdr,'div',null,x).style.cssText='font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em';
  });
  state.criteria.forEach(function(c,idx){
    var row=add(body,'div','crow');
    var lab=add(row,'div');
    var inp=add(lab,'input'); inp.type='text'; inp.value=c.label; inp.style.width='100%';
    inp.setAttribute('aria-label','Libellé du critère');
    inp.addEventListener('change',function(){ c.label=inp.value; logit('Critère renommé : '+inp.value); save(); render(); });
    add(lab,'div','muted',c.hint).style.marginTop='4px';
    var w=add(row,'input'); w.type='number'; w.min='0'; w.max='100'; w.value=c.weight; w.style.width='100%';
    w.setAttribute('aria-label','Pondération de '+c.label);
    w.addEventListener('change',function(){
      c.weight=Math.max(0,Math.min(100,Number(w.value)||0));
      logit('Pondération « '+c.label+' » portée à '+c.weight+' %'); save(); render();
    });
    add(add(row,'div'),'span','chip '+(c.kind==='auto'?'c-teal':'c-blue'), c.kind==='auto'?'Calculé':'Qualitatif · IA');
    var del=add(row,'button','icon-btn','×'); del.setAttribute('aria-label','Supprimer '+c.label);
    del.addEventListener('click',function(){
      if(state.criteria.length<=1){ toast('La grille doit conserver au moins un critère.'); return; }
      ask('Le classement sera recalculé sans ce critère. Pensez à réajuster les pondérations pour retrouver un total de 100 %.', function(){
        logit('Critère supprimé : '+c.label); state.criteria.splice(idx,1); save(); render();
      }, 'Supprimer le critère « '+c.label+' » ?', 'Supprimer');
    });
  });
  var foot=add(card,'div','panel-foot');
  var msg=add(foot,'span',null, wt===100?'La grille est équilibrée et applicable.':'Le total doit atteindre 100 % pour que la grille soit applicable.');
  msg.style.cssText='font-size:12.5px;color:'+(wt===100?'var(--muted)':'var(--red)');
  add(foot,'button','btn btn-ghost btn-sm','+ Ajouter un critère qualitatif').addEventListener('click',function(){
    var id='c'+Date.now();
    // Pas d'écriture dans les notes : un critère sans note vaut 70 (curScore), et noter relève de l'évaluateur.
    state.criteria.push({id:id,label:'Nouveau critère',weight:0,kind:'qual',hint:'Notation proposée par IA, validée par un évaluateur'});
    logit('Critère ajouté à la grille'); save(); render();
  });
  if(state.depClosed){
    Array.prototype.forEach.call(card.querySelectorAll('input,button'),function(x){ x.disabled=true; });
    var lk=add(m,'div','warn'); lk.style.marginTop='18px';
    add(lk,'strong',null,'Grille figée. ');
    lk.appendChild(document.createTextNode("Le dépouillement est clôturé : la grille publiée au dossier ne peut plus être modifiée. La changer après l'ouverture des plis serait un motif d'annulation."));
  }

  var n=add(m,'div','note');
  add(n,'strong',null,'Pourquoi ce paramétrage. ');
  n.appendChild(document.createTextNode("Un produit vendu à des secteurs et à des pays différents ne peut pas coder ses critères en dur : chaque organisation définit ici sa grille, et le moteur s'y conforme sans redéveloppement. Modifiez une pondération puis ouvrez l'écran Évaluation."));
}

function vReception(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Réception des offres');
  add(l,'p','lede',"Dépôt des plis puis traitement automatique : OCR, détection de structure, extraction guidée par la grille, conversion des montants en francs CFA au taux arrêté à l'ouverture. Chaque champ extrait porte son indice de confiance.");

  var card=add(m,'div','card');
  var ph=add(card,'div','panel-head'); add(ph,'span',null,'Plis reçus et traitement');
  add(ph,'span','chip c-grey', state.fxFrozen ? 'Taux figés le '+state.fxFrozen.at : 'Taux figés à la clôture du dépouillement');
  var b=add(card,'div','pad');
  SEED_OFFERS.forEach(function(o){
    var row=add(b,'div'); row.style.cssText='padding:14px 0;border-top:1px solid var(--line-2)';
    var top=add(row,'div'); top.style.cssText='display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center';
    var lf=add(top,'div');
    var nm=add(lf,'div'); nm.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    add(nm,'strong',null,o.name); originChip(nm,o);
    add(lf,'div','muted',o.doc+' · déposé en '+o.devise+(o.depot?' · le '+o.depot:'')+(o.incoterm?' · '+o.incoterm:''));
    if(o.contact) add(lf,'div','muted','Contact : '+o.contact+' · validité '+(o.validite||'—')+' j · '+(o.paiement||'—'));
    var avg=Math.round(o.fields.reduce(function(s,f){return s+f.conf;},0)/o.fields.length);
    var rg=add(top,'div'); rg.style.cssText='display:flex;align-items:center;gap:10px;flex-wrap:wrap';
    if(o.devise!=='XOF') add(rg,'span','chip c-violet', sep(o.montant)+' '+o.devise+' → '+xof(montantXOF(o)));
    var seuilC=Number(state.seuils.confianceMin);
    add(rg,'span','chip '+(avg>=seuilC?'c-green':'c-amber'),'Confiance '+avg+' % (seuil '+seuilC+' %)');
    if(o.pieces && o.pieces.length){
      var pc=add(row,'div'); pc.style.cssText='margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center';
      add(pc,'span','muted','Pièces déposées :');
      o.pieces.forEach(function(f){
        var a=add(pc,'a','pill',f.name+' · '+taille(f.size)); a.href='/api/files/'+f.id; a.setAttribute('download',f.name); a.title='SHA-256 '+f.sha256;
        a.setAttribute('aria-label','Télécharger '+f.name);
      });
    }
    var bar=add(row,'div','bar'); bar.style.marginTop='10px';
    var sp=add(bar,'span'); sp.style.width=avg+'%'; if(avg<seuilC) sp.style.background='var(--amber-line)';
  });

  var w=add(m,'div','warn'); w.style.marginTop='18px';
  add(w,'strong',null,'Deux règles que le produit ne contourne pas. ');
  w.appendChild(document.createTextNode("Aucun montant n'est retenu sans confirmation humaine dès que sa confiance passe sous le seuil. Et le taux de conversion appliqué est celui arrêté à la date d'ouverture des plis, figé pour toute la procédure : recalculer au fil de l'eau rendrait le classement contestable."));
}

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
  lock:'M6 11h12v10H6z|M8 11V7a4 4 0 0 1 8 0v4'
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
var NAV_ICONS = { dashboard:'home', notifs:'bell', cdc:'file', dao:'book', criteres:'sliders', qa:'chat', portail:'upload',
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
var FLOW = [
  {id:'prep',    lab:'Préparer',   view:'cdc'},
  {id:'recv',    lab:'Recevoir',   view:'reception'},
  {id:'depouil', lab:'Dépouiller', view:'depouille'},
  {id:'conf',    lab:'Conformité', view:'conformite'},
  {id:'eval',    lab:'Évaluer',    view:'evaluation'},
  {id:'decide',  lab:'Décider',    view:'decision'},
  {id:'close',   lab:'Clore',      view:'recours'}
];
var FLOW_LAB = { done:'terminé', now:'en cours', blocked:'bloqué', todo:'à venir' };
function flowStatus(){
  var s=lifeStatus();
  // Une seule étape « en cours » : dès que des offres sont arrivées, on est au dépouillement.
  return { prep:s.prep, recv: (state.depClosed || (state.cdc.cdcPublie && SEED_OFFERS.length)) ? 'done' : s.depot, depouil:s.depouil,
    conf: s.clarif==='blocked' ? 'blocked' : (state.depClosed ? 'done' : 'todo'),
    eval:s.eval, decide:s.appro,
    close: state.contractSigned ? 'done' : (s.recours==='blocked' ? 'blocked' : (allApproved() ? 'now' : 'todo')) };
}
function stepper(m){
  var st=flowStatus();
  var ol=add(m,'ol','flow'); ol.setAttribute('aria-label','Parcours de la procédure');
  FLOW.forEach(function(f,i){
    var li=add(ol,'li','flow-step '+st[f.id]);
    var ok=viewAllowed(f.view);
    var b=add(li, ok?'button':'span');
    var n=add(b,'span','flow-n');
    if(st[f.id]==='done') icon(n,'check'); else n.textContent=String(i+1);
    add(b,'span','flow-label',f.lab);
    if(ok){ b.type='button'; b.addEventListener('click',function(){ go(f.view); }); }
    if(state.view===f.view) b.setAttribute('aria-current','step');
    add(b,'span','sr-only',' — '+FLOW_LAB[st[f.id]]);
  });
}

/* Icône d'un champ extrait, d'après son libellé. */
function fieldIcon(k){
  if(/montant|prix/i.test(k)) return 'coin';
  if(/délai/i.test(k)) return 'clock';
  if(/garantie/i.test(k)) return 'shield';
  if(/caution|pièce|document/i.test(k)) return 'file';
  return 'info';
}
function aVerifier(o){ return o.fields.filter(function(f,i){ return f.flag && !state.confirmed[o.id+'_'+i]; }).length; }

function vDepouille(m){
  stepper(m);
  if (!state.cdc.cdcPublie) return locked(m,"Le dépouillement s'ouvre une fois le cahier des charges publié.",'cdc','Ouvrir le cahier des charges');
  var o=SEED_OFFERS[state.offerIndex], nb=SEED_OFFERS.length;
  var seuil=Number(state.seuils.confianceMin)||0;
  var reste=flagsRemaining(), restIci=aVerifier(o);
  var total=0; SEED_OFFERS.forEach(function(x){ total+=x.fields.filter(function(f){return f.flag;}).length; });

  /* Prochaine étape */
  var suivante=null;
  for(var j=1;j<=nb;j++){ var x=SEED_OFFERS[(state.offerIndex+j)%nb]; if(aVerifier(x)>0){ suivante=x; break; } }
  if(state.depClosed){
    guideCard(m,{ ok:true, titre:'Dépouillement clôturé', texte: state.fxFrozen ? 'Données figées le '+state.fxFrozen.at+'. Les offres conformes peuvent maintenant être évaluées.' : 'Les offres conformes peuvent maintenant être évaluées.',
      action: viewAllowed('evaluation') ? 'Passer à l’évaluation' : null, go:function(){ go('evaluation'); } });
  } else if(restIci>0){
    guideCard(m,{ icon:'check', titre:'Prochaine étape : vérifier '+restIci+' valeur'+(restIci>1?'s':'')+' de '+o.name,
      texte:'Le lecteur automatique n’est pas sûr de ces valeurs. Comparez-les au document, puis confirmez.',
      action: can('depouille.confirm') ? 'Commencer' : null,
      go:function(){ var b=document.querySelector('.xf-row.pending .btn'); if(b){ b.scrollIntoView({block:'center'}); b.focus(); } } });
  } else if(suivante){
    guideCard(m,{ icon:'arrow', titre:'Cette offre est vérifiée', texte:'Offre suivante à vérifier : '+suivante.name+' ('+aVerifier(suivante)+' valeur'+(aVerifier(suivante)>1?'s':'')+').',
      action:'Ouvrir l’offre suivante', go:function(){ state.offerIndex=SEED_OFFERS.indexOf(suivante); save(); render(); } });
  } else {
    guideCard(m,{ icon:'check', titre:'Tout est vérifié : vous pouvez clôturer', texte:'La clôture fige les données lues dans les offres et ouvre l’évaluation.',
      action: can('depouille.close') ? 'Clôturer le dépouillement' : null, go:function(){ var b=document.querySelector('[data-fk="close-dep"]'); if(b) b.click(); } });
  }

  /* Offre affichée */
  var h=add(m,'div','head'); var l=add(h,'div','who-head');
  add(l,'span','initials',initiales(o.name)).setAttribute('aria-hidden','true');
  var lt=add(l,'div');
  add(lt,'h1',null,o.name);
  var ml=add(lt,'div','meta-line');
  chip(ml,'info',(isUemoa(o)?'UEMOA · ':'Hors UEMOA · ')+o.pays);
  if(o.submitted) chip(ml,'ok','Saisie en ligne','check');
  else if(restIci>0) chip(ml,'pending',restIci+' valeur'+(restIci>1?'s':'')+' à vérifier');
  else chip(ml,'ok','Vérifiée','check');
  var nav=add(h,'div','actions');
  add(nav,'span','muted','Offre '+(state.offerIndex+1)+' sur '+nb);
  var pv=add(nav,'button','btn btn-ghost','Précédente'); pv.type='button'; fk(pv,'prev-offer');
  pv.addEventListener('click',function(){ state.offerIndex=(state.offerIndex-1+nb)%nb; save(); render(); });
  var nx=add(nav,'button','btn btn-ghost','Suivante'); nx.type='button'; fk(nx,'next-offer');
  nx.addEventListener('click',function(){ state.offerIndex=(state.offerIndex+1)%nb; save(); render(); });

  /* Progression de l'ensemble */
  var pc=add(m,'div','card progress-card');
  add(pc,'strong',null,'Vérification de l’ensemble des offres');
  var pg=add(pc,'progress','meter'+(reste===0?' full':'')); pg.max=total||1; pg.value=total-reste;
  pg.setAttribute('aria-label','Valeurs vérifiées');
  add(pc,'span','muted',(total-reste)+' sur '+total+' valeurs vérifiées');

  var sp=add(m,'div','split');

  /* Document reçu */
  var dc=add(sp,'section','card'); dc.setAttribute('aria-label','Document reçu');
  var dh=add(dc,'div','panel-head'); var dht=add(dh,'span','h'); icon(dht,'file'); dht.appendChild(document.createTextNode('Document reçu')); add(dh,'small',null,o.doc);
  if(o.submitted){
    var hs=add(dc,'p','hint top'); icon(hs,'info');
    hs.appendChild(document.createTextNode('Offre saisie en ligne par le soumissionnaire : aucune lecture automatique, rien à vérifier.'));
  } else {
    var en=o.devise!=='XOF';
    var sheet=add(add(dc,'div','doc-stage'),'div','doc-sheet');
    add(sheet,'div','doc-head', en?'PRICE SCHEDULE — BILL OF QUANTITIES':'BORDEREAU DES PRIX UNITAIRES');
    var th=add(sheet,'div','doc-row doc-th');
    (en?['Description','Unit','Qty','Unit price']:['Désignation','Unité','Qté','P.U.']).forEach(function(x){ add(th,'span',null,x); });
    [[en?'Network switches, 24 ports':'Commutateurs réseau 24 ports','U','18','—',false],
     [en?'Item flagged for review':'Poste concerné par l’alerte','U','6','voir →',true],
     [en?'Copper cabling cat. 6A':'Câblage cuivre cat. 6A','ml','2 400','—',false],
     [en?'Commissioning and testing':'Mise en service et tests','Fft','1','—',false]
    ].forEach(function(rw){
      var d=add(sheet,'div','doc-row'+(rw[4]?' doc-hl':''));
      for(var i=0;i<4;i++) add(d,'span',null,rw[i]);
    });
    var hi=add(dc,'p','hint'); icon(hi,'info');
    hi.appendChild(document.createTextNode(en ? 'Document en '+o.devise+' : les lignes encadrées sont à vérifier avant conversion.' : 'Les lignes encadrées sont celles que vous devez vérifier.'));
  }
  var dl=add(dc,'dl','dl');
  [['Contact',o.contact],['Déposé le',o.depot],['Validité',o.validite?o.validite+' jours':null],
   ['Incoterm',o.submitted?null:(o.incoterm||'Sans objet')],['Paiement',o.paiement]].forEach(function(x){
    if(x[1]==null) return;
    add(dl,'dt',null,x[0]); add(dl,'dd',null,x[1]);
  });

  /* Informations lues dans l'offre */
  var fc=add(sp,'section','card'); fc.setAttribute('aria-label','Informations lues dans l’offre');
  var fh=add(fc,'div','panel-head'); var fht=add(fh,'span','h'); icon(fht,'search'); fht.appendChild(document.createTextNode('Informations lues dans l’offre'));
  add(fh,'small',null,'Confiance attendue : '+seuil+' %');
  var ul=add(fc,'ul','xf');
  o.fields.forEach(function(f,i){
    var key=o.id+'_'+i, aConfirmer=f.flag && !state.confirmed[key];
    var li=add(ul,'li','xf-row'+(aConfirmer?' pending':''));
    icon(add(li,'span','tile'), fieldIcon(f.k));
    var c1=add(li,'div','xf-main');
    add(c1,'div','xf-k',f.k);
    montant(add(c1,'div','xf-v'), f.v);
    var act=add(li,'div','xf-act');
    var cf=add(act,'span','conf'+(f.conf<seuil?' low':''),f.conf+' %'); cf.setAttribute('title','Confiance de lecture');
    cf.setAttribute('aria-label','Confiance de lecture : '+f.conf+' %');
    if(aConfirmer){
      var b=ibtn(act,'btn-primary','Confirmer','check');
      b.setAttribute('aria-label','Confirmer — '+f.k);
      fk(b,'conf-'+key); guard('depouille.confirm',b);
      b.addEventListener('click',function(){
        state.confirmed[key]=true; logit('Champ confirmé — '+o.name+' : '+f.k);
        if(flagsRemaining()===0) notify('verif.requise','Vérification des extractions terminée',
          "Tous les champs signalés de la procédure "+REF()+" ont été confirmés. Le dépouillement peut être clôturé.");
        save(); render();
      });
    } else chip(act,'ok', f.flag ? 'Confirmé' : 'Fiable','check');
  });
  var foot=add(fc,'div','panel-foot');
  add(foot,'span',null, reste>0 ? 'Encore '+reste+' valeur'+(reste>1?'s':'')+' à vérifier sur l’ensemble des offres' : 'Toutes les valeurs sont vérifiées');
  var cl=add(foot,'button','btn btn-primary', state.depClosed?'Dépouillement clôturé':'Clôturer le dépouillement'); cl.type='button';
  cl.disabled=reste>0||state.depClosed; guard('depouille.close',cl);
  fk(cl,'close-dep');
  cl.addEventListener('click',function(){
    ask('Les données lues dans les offres seront figées et l’évaluation s’ouvrira.', function(){
      state.depClosed=true; logit('Dépouillement clôturé — évaluation ouverte');
      notify('dep.cloture','Dépouillement clôturé',
        "Le dépouillement de la procédure "+REF()+" est clôturé : "+conformes().length+" offre(s) conforme(s) sur "+SEED_OFFERS.length+". L'évaluation est ouverte aux évaluateurs désignés.");
      var anoR=anomalies().filter(function(x){return x.lvl==='red';});
      if(anoR.length) notify('anomalie',''+anoR.length+' anomalie(s) critique(s) à instruire',
        anoR.slice(0,4).map(function(x){return '• '+x.who+' — '+x.t;}).join("\n"));
      save(); go('evaluation');
    }, 'Clôturer le dépouillement ?', 'Clôturer');
  });
}

function vConformite(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Conformité & anomalies');
  add(l,'p','lede',"Contrôle des pièces exigées selon l'origine du soumissionnaire, et signaux de cohérence. Chaque signal est une alerte à instruire, jamais une décision : l'exclusion reste un acte humain, réversible et tracé.");

  var c1=add(m,'div','card');
  add(c1,'div','panel-head','Contrôle des pièces par soumissionnaire');
  var sx=add(c1,'div','scroll-x'); var t=add(sx,'table');
  var tr=add(add(t,'thead'),'tr');
  ['Soumissionnaire','Origine','Pièces exigées','Manquantes','Décision'].forEach(function(x){ add(tr,'th',null,x); });
  var tb=add(t,'tbody');
  SEED_OFFERS.forEach(function(o){
    var r=add(tb,'tr');
    add(r,'td',null,o.name).style.fontWeight='600';
    originChip(add(r,'td'),o);
    add(r,'td',null, String(requiredDocs(o).length));
    var mis=missingDocs(o);
    var tdm=add(r,'td');
    if(!mis.length) add(tdm,'span','chip c-green','Aucune');
    else mis.forEach(function(d){ var c=add(tdm,'span','chip c-red',d.label); c.style.margin='2px 4px 2px 0'; });
    var ex=excluded(o);
    var btn=add(add(r,'td'),'button','btn btn-sm '+(ex?'btn-ghost':'btn-danger'), ex?'Réintégrer':'Écarter');
    fk(btn,'excl-'+o.id); guard('conformite.decide',btn);
    btn.addEventListener('click',function(){
      var mis=missingDocs(o);
      var q = ex ? ('L\u2019offre sera de nouveau notée et classée.'+(mis.length?' Elle présente encore '+mis.length+' pièce(s) manquante(s) : la réintégration devra être motivée au procès-verbal.':''))
                 : ('L\u2019offre ne sera plus notée ni classée. La décision reste réversible et sera consignée à la piste d\u2019audit.');
      ask(q, function(){
        state.excluded[o.id]=!ex;
        logit((ex?'Réintégration':'Exclusion administrative')+' — '+o.name);
        notify('offre.ecartee', (ex?'Offre réintégrée — ':'Offre écartée — ')+o.name,
          ex ? ("L'offre de "+o.name+" est réintégrée à l'évaluation de la procédure "+REF()+".")
             : ("L'offre de "+o.name+" est écartée pour non-conformité administrative. Motif : "+(mis.length?mis.map(function(x){return x.label;}).join(' ; '):'décision du comité')+"."));
        save(); render();
      }, (ex?'Réintégrer « ':'Écarter « ')+o.name+' » ?', ex?'Réintégrer':'Écarter');
    });
  });
  labelize(t);

  var c2=add(m,'div','card'); c2.style.marginTop='18px';
  add(c2,'div','panel-head','Signaux détectés');
  var b=add(c2,'div','pad');
  anomalies().forEach(function(a){
    var row=add(b,'div'); row.style.cssText='display:flex;gap:14px;padding:14px 0;border-top:1px solid var(--line-2);align-items:flex-start';
    var col = a.lvl==='red'?'var(--red)':(a.lvl==='amber'?'var(--amber-line)':'var(--violet)');
    var dot=add(row,'span',null, a.lvl==='info'?'i':'!');
    dot.style.cssText='width:22px;height:22px;border-radius:50%;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;background:'+col;
    var d=add(row,'div');
    var tt=add(d,'div'); tt.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    add(tt,'strong',null,a.t); add(tt,'span','chip c-grey',a.who);
    add(d,'div','muted',a.d).style.marginTop='3px';
  });

  var n=add(m,'div','note');
  add(n,'strong',null,'Sur les offres étrangères. ');
  n.appendChild(document.createTextNode("Les signaux violets ne sont pas des reproches : ils rappellent qu'une offre hors zone se compare sur une base fiscale et douanière différente. Écarter un soumissionnaire étranger pour une pièce qu'on n'a jamais exigée dans le dossier d'appel d'offres est le meilleur moyen de perdre un recours."));
}

function vEvaluation(m){
  if (!state.depClosed) return locked(m,"L'évaluation s'ouvre une fois le dépouillement clôturé.",'depouille','Aller au dépouillement');
  var c=state.cdc;
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'div','eyebrow','Évaluation comparative');
  add(l,'h1',null,'Notation des offres conformes');
  add(l,'p','lede',"Montants convertis en francs CFA, puis corrigés de la marge de préférence communautaire lorsqu'elle est active. Toute modification d'un score proposé par l'IA exige une justification écrite, horodatée et attribuée.");
  var rs=add(h,'button','btn btn-ghost btn-sm','Rétablir les scores IA');
  rs.addEventListener('click',function(){
    SEED_OFFERS.forEach(function(o){
      var q={metho:o.aiMetho,refs:o.aiRefs};
      state.criteria.forEach(function(x){ if(x.kind==='qual'&&q[x.id]==null) q[x.id]=70; });
      state.quality[o.id]=q;
    });
    state.justif={}; logit('Scores IA rétablis'); save(); render();
  });

  var banner=add(m,'div', c.prefActive?'warn':'note'); banner.style.marginTop='0';
  banner.style.marginBottom='18px';
  if(c.prefActive){
    add(banner,'strong',null,'Préférence communautaire active — '+c.prefTaux+' %. ');
    banner.appendChild(document.createTextNode("Les offres hors UEMOA sont majorées de "+c.prefTaux+" % pour la seule comparaison des prix. Le montant contractuel reste le montant d'offre. La marge est figée depuis la clôture du dépouillement."));
  } else {
    add(banner,'strong',null,'Préférence communautaire désactivée. ');
    banner.appendChild(document.createTextNode("Les offres sont comparées à leur contre-valeur en francs CFA, sans correction d'origine."));
  }

  var coiBloque = can('eval.score') ? coiBanner(m) : false;
  var g=add(m,'div','grid4');
  ranking().forEach(function(r,idx){
    var o=r.o;
    var card=add(g,'div','card sup'+(idx===0?' lead':''));
    var top=add(card,'div'); top.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:9px';
    add(top,'span','rank'+(idx===0?' lead':''),'Rang '+(idx+1));
    originChip(top,o);
    add(card,'div',null,o.name).style.cssText='font-size:15px;font-weight:700';
    add(card,'div','muted', sep(o.montant)+' '+o.devise+' · '+o.delai+' j');
    var corr = montantCorrige(o);
    var mline = add(card,'div','muted', 'Contre-valeur : '+xof(montantXOF(o)) + (Math.abs(corr-montantXOF(o))>1 ? ' → comparé à '+xof(corr) : ''));
    mline.style.cssText+=';margin-bottom:4px';
    if (Math.abs(corr-montantXOF(o))>1) mline.style.color='var(--violet)';

    state.criteria.forEach(function(cr){
      var crit=add(card,'div','crit');
      var k=add(crit,'span','crit-k');
      k.appendChild(document.createTextNode(cr.label+' ('+cr.weight+' %)'));
      if(cr.kind==='qual') add(k,'span','ai','IA');
      if(cr.kind==='auto'){
        add(crit,'span',null,(r.notes[cr.id]||0).toFixed(1)).style.fontWeight='600';
      } else {
        var cur=curScore(o,cr.id);
        var st=add(crit,'span','stepper');
        var mi=add(st,'button','step-btn','−'); mi.setAttribute('aria-label','Diminuer '+cr.label+' pour '+o.name);
        fk(mi,'dec-'+o.id+'-'+cr.id); guard('eval.score',mi);
        if(coiBloque){ mi.disabled=true; mi.setAttribute('title','Déclaration de conflit d\u2019intérêts requise avant toute notation.'); }
        mi.addEventListener('click',function(){
          state.quality[o.id][cr.id]=Math.max(0,cur-5);
          logit('Score « '+cr.label+' » ajusté à '+Math.max(0,cur-5)+' — '+o.name); save(); render();
        });
        add(st,'span','step-v', cur.toFixed(0)+'/100');
        var pl=add(st,'button','step-btn','+'); pl.setAttribute('aria-label','Augmenter '+cr.label+' pour '+o.name);
        fk(pl,'inc-'+o.id+'-'+cr.id); guard('eval.score',pl);
        if(coiBloque){ pl.disabled=true; pl.setAttribute('title','Déclaration de conflit d\u2019intérêts requise avant toute notation.'); }
        pl.addEventListener('click',function(){
          state.quality[o.id][cr.id]=Math.min(100,cur+5);
          logit('Score « '+cr.label+' » ajusté à '+Math.min(100,cur+5)+' — '+o.name); save(); render();
        });
      }
      if(cr.kind==='qual'){
        var ai=aiScore(o,cr.id), cur2=curScore(o,cr.id);
        if(Math.abs(cur2-ai)>0.01){
          var jk=o.id+'_'+cr.id;
          var wb=add(card,'div'); wb.style.cssText='background:var(--amber-bg);border-radius:8px;padding:9px 10px;margin:2px 0 6px';
          add(wb,'div',null,'Écart avec le score IA ('+ai+') — justification obligatoire')
            .style.cssText='font-size:11.5px;color:var(--amber);font-weight:700;margin-bottom:6px';
          var ta=add(wb,'textarea'); ta.rows=2; ta.style.width='100%'; ta.placeholder='Motif de la modification…';
          ta.value=state.justif[jk]||'';
          ta.setAttribute('aria-label','Justification — '+o.name+' / '+cr.label);
          fk(ta,'just-'+o.id+'-'+cr.id);
          ta.addEventListener('change',function(){
            state.justif[jk]=ta.value.trim();
            if(ta.value.trim()){
              logit('Justification saisie — '+o.name+' / '+cr.label);
              notify('ecart.ia','Écart motivé avec un score proposé par l\u2019IA',
                o.name+" — "+cr.label+" : score proposé "+ai+", score retenu "+cur2+". Motif : "+ta.value.trim());
            }
            save(); render();
          });
        }
      }
    });
    var tot=add(card,'div','total');
    add(tot,'span',null,'Total pondéré').style.cssText='font-size:12px;font-weight:700;color:var(--muted)';
    add(tot,'span','total-v', r.total.toFixed(1));
    add(card,'div','muted','IA : '+o.aiWhy).style.cssText+=';margin-top:10px;padding-top:10px;border-top:1px solid var(--line-2)';
  });

  SEED_OFFERS.filter(excluded).forEach(function(o){
    var c2=add(m,'div','card pad'); c2.style.cssText+=';margin-top:14px;border-color:var(--red-line)';
    var tt=add(c2,'div'); tt.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    add(tt,'strong',null,o.name+' — écartée de l\u2019évaluation'); originChip(tt,o);
    var mis=missingDocs(o);
    add(c2,'div','muted', mis.length? 'Motif : '+mis.map(function(d){return d.label;}).join(' ; ')+'. Décision réversible depuis l\u2019écran Conformité.' : 'Écartée par décision manuelle. Réversible depuis l\u2019écran Conformité.');
  });

  var miss=missingJustifs(), wt=weightTotal();
  var foot=add(m,'div','card'); foot.style.marginTop='18px';
  var fp=add(foot,'div','panel-foot'); fp.style.borderTop='none';
  var msg=add(fp,'span',null, miss.length? miss.length+' justification(s) manquante(s) : '+miss.join(', ') : 'Toutes les modifications sont justifiées.');
  msg.style.cssText='font-size:12.5px;color:'+(miss.length?'var(--red)':'var(--muted)');
  var v=add(fp,'button','btn btn-dark btn-sm', state.evalDone?'Évaluation validée ✓':'Valider l\u2019évaluation');
  v.disabled=miss.length>0||state.evalDone||wt!==100; guard('eval.validate',v);
  fk(v,'valid-eval');
  v.addEventListener('click',function(){
    ask('Le classement sera transmis au circuit d\u2019approbation et les notes ne pourront plus être modifiées.', function(){
      state.evalDone=true; logit('Évaluation validée — classement transmis au circuit d\u2019approbation');
      var rr=ranking();
      notify('eval.validee','Évaluation validée',
        "Le classement de la procédure "+REF()+" est arrêté. Premier : "+(rr[0]?rr[0].o.name+" ("+rr[0].total.toFixed(1)+"/100)":"—")+".");
      notify('appro.attendue','Approbation attendue',
        "Le circuit d'approbation de la procédure "+REF()+" est ouvert. Premier niveau attendu : "+(state.approvals[0]?state.approvals[0].role:'—')+".");
      save(); go('decision');
    }, 'Valider l\u2019évaluation ?', 'Valider');
  });
  if(wt!==100){
    var w=add(m,'div','warn'); w.style.marginTop='14px';
    w.appendChild(document.createTextNode('Le total des pondérations est de '+wt+' % : ajustez la grille de critères avant de valider.'));
  }
}

function vDecision(m){
  if(!state.evalDone) return locked(m,"Le circuit d'approbation s'ouvre une fois l'évaluation validée.",'evaluation',"Aller à l'évaluation");
  var rows=ranking(), win=rows[0], c=state.cdc;
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'div','eyebrow','Décision'); add(l,'h1',null,"Proposition d'attribution");

  var card=add(m,'div','card pad');
  add(card,'div','stat-k','Attributaire proposé par le classement');
  var nm=add(card,'div'); nm.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:4px 0 2px';
  add(nm,'span',null,win.o.name).style.cssText='font-size:24px;font-weight:700';
  originChip(nm,win.o);
  add(card,'div','muted', sep(win.o.montant)+' '+win.o.devise+' ('+xof(montantXOF(win.o))+') · '+win.o.delai+' jours · note '+win.total.toFixed(1)+'/100');
  if(rows[1]) add(card,'div','muted','Écart avec le 2ᵉ ('+rows[1].o.name+') : '+(win.total-rows[1].total).toFixed(1)+' point(s).').style.marginTop='8px';
  if(!isUemoa(win.o)){
    var wn=add(card,'div','warn'); wn.style.marginTop='14px';
    add(wn,'strong',null,'Attributaire hors zone UEMOA. ');
    wn.appendChild(document.createTextNode("Vérifier avant signature : retenue à la source de "+c.retenueNonResident+" % sur les prestations de source locale, régime douanier des équipements importés (à la charge de "+c.douaneACharge.toLowerCase()+"), validité de la contre-garantie bancaire auprès d'un établissement agréé, et modalités de représentation locale pendant la garantie de "+c.garantieMin+" mois minimum."));
  }

  var wf=add(m,'div','card'); wf.style.marginTop='18px';
  add(wf,'div','panel-head','Circuit d\u2019approbation — 3 niveaux configurés');
  var b=add(wf,'div','pad');
  var fp=-1; for(var i=0;i<state.approvals.length;i++){ if(!state.approvals[i].done){ fp=i; break; } }
  state.approvals.forEach(function(a,i){
    var row=add(b,'div','stepline');
    add(row,'div','stepnum '+(a.done?'done':(i===fp?'now':'')), a.done?'✓':String(i+1));
    var d=add(row,'div'); d.style.flex='1 1 auto';
    add(d,'strong',null,a.role); add(d,'div','muted',a.who);
    if(a.done) add(row,'span','chip c-green','Approuvé');
    else if(i===fp){
      var btn=add(row,'button','btn btn-primary btn-sm','Approuver');
      fk(btn,'appr-'+i); guard('decision.approve',btn);
      btn.addEventListener('click',function(){
        ask('Cette approbation est horodatée, nominative et consignée à la piste d\u2019audit.', function(){
          a.done=true; logit('Approbation — '+a.role+' ('+a.who+')');
          if(allApproved()){
            logit('Attribution prononcée — '+win.o.name);
            notify('attribution','Attribution prononcée',
              "Le marché "+REF()+" est attribué à "+win.o.name+" ("+win.o.pays+") pour "+xof(montantXOF(win.o))+", délai "+win.o.delai+" jours. Notification aux soumissionnaires non retenus à préparer, sous réserve du délai de recours.");
            save(); go('pv'); return;
          }
          var nxt=null; for(var z=0;z<state.approvals.length;z++) if(!state.approvals[z].done){ nxt=state.approvals[z]; break; }
          if(nxt) notify('appro.attendue','Approbation attendue — '+nxt.role,
            "Le niveau « "+a.role+" » a approuvé. Niveau suivant attendu : "+nxt.role+" ("+nxt.who+").");
          save(); render();
        }, 'Approuver au titre « '+a.role+' » ?', 'Approuver');
      });
    } else add(row,'span','chip c-grey','En attente');
  });

  var n=add(m,'div','note');
  add(n,'strong',null,'La décision reste humaine. ');
  n.appendChild(document.createTextNode("Le classement est une proposition issue de la grille ; l'attribution n'existe qu'une fois les niveaux d'approbation franchis. Un comité peut s'écarter du classement — l'écart est alors consigné au procès-verbal, comme l'exige la contestabilité de la procédure."));
}

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

function vAudit(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,"Piste d'audit");
  add(l,'p','lede',"Journal horodaté de toutes les actions de la procédure. C'est cette trace qui permet de démontrer, en cas de recours devant l'organe de régulation, que chaque score retenu a été validé ou corrigé par une personne identifiée.");
  var vb=add(m,'div'); vb.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px';
  var vbtn=add(vb,'button','btn btn-ghost btn-sm',"Vérifier l'intégrité du journal");
  var vres=add(vb,'span','chip c-grey','Non vérifié'); vres.setAttribute('role','status');
  vbtn.addEventListener('click',function(){
    vbtn.disabled=true;
    MP.api('GET','/api/audit/verify').then(function(r){
      vres.className='chip '+(r.ok?'c-green':'c-red');
      vres.textContent=r.ok ? 'Intact — '+r.entries+' entrée(s) chaînée(s), empreinte '+r.head.slice(0,12)+'…' : 'ALTÉRÉ à l’entrée n° '+r.brokenAt;
    }).catch(function(e){ vres.className='chip c-red'; vres.textContent=e.message; }).then(function(){ vbtn.disabled=false; });
  });
  var card=add(m,'div','card');
  add(card,'div','panel-head','Journal — '+state.audit.length+' entrée(s)');
  var b=add(card,'div','pad');
  if(!state.audit.length) add(b,'p','muted','Aucune action enregistrée. Modifiez le cahier des charges, confirmez un champ ou ajustez un score pour alimenter le journal.');
  state.audit.forEach(function(e){
    var row=add(b,'div','log');
    add(row,'time',null,e.t);
    var d=add(row,'div'); d.style.flex='1 1 240px';
    add(d,'div',null,e.a); add(d,'div','muted',e.who);
  });
}

var PIECES_OK=false;
function taille(n){ return n>=1048576 ? (n/1048576).toFixed(1).replace('.',',')+' Mo' : Math.max(1,Math.round(n/1024))+' Ko'; }
function vPortail(m){
  var c=state.cdc, d=state.draft;
  if(!d.files) d.files={};
  if(!PIECES_OK){
    PIECES_OK=true;
    MP.api('GET','/api/files/mine').then(function(list){
      d.files={}; Object.keys(d.docs).forEach(function(k){ d.docs[k]=false; });
      list.forEach(function(f){ d.files[f.doc]=f; d.docs[f.doc]=true; });
      if(state.view==='portail') render();
    }).catch(function(){});
  }
  var PAYS=[['CI','Côte d\u2019Ivoire'],['BF','Burkina Faso'],['SN','Sénégal'],['ML','Mali'],['BJ','Bénin'],
    ['TG','Togo'],['NE','Niger'],['GW','Guinée-Bissau'],['GH','Ghana'],['NG','Nigeria'],['GN','Guinée'],
    ['MA','Maroc'],['TN','Tunisie'],['FR','France'],['DE','Allemagne'],['CN','Chine'],['IN','Inde'],
    ['AE','Émirats arabes unis'],['US','États-Unis']];
  var DEV=[['XOF','Franc CFA (XOF)'],['EUR','Euro (EUR)'],['USD','Dollar US (USD)'],['GHS','Cedi (GHS)'],['NGN','Naira (NGN)']];
  function paysNom(iso){ for(var i=0;i<PAYS.length;i++) if(PAYS[i][0]===iso) return PAYS[i][1]; return iso; }
  var uem = isUemoa(d), loc = isLocal(d);

  var band=add(m,'div','card'); band.style.cssText='border-color:var(--violet);border-width:2px;margin-bottom:18px';
  var bp=add(band,'div','pad');
  var bt=add(bp,'div'); bt.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap';
  add(bt,'span','chip c-violet','Espace soumissionnaire');
  add(bt,'strong',null,'Portail de dépôt des offres');
  add(bp,'p','muted',"Cet écran présente ce que voit l'entreprise qui répond, et non l'acheteur. En exploitation réelle, il s'agit d'une application distincte, avec son authentification propre : l'acheteur n'a accès à aucun brouillon tant qu'un pli n'est pas déposé. Les deux espaces sont réunis ici pour les besoins de la démonstration.").style.marginTop='4px';

  if (!c.cdcPublie) return locked(m,"Le portail n'accepte les dépôts qu'une fois le cahier des charges publié.",'cdc','Aller au cahier des charges');

  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'div','eyebrow',REF()+' · '+c.procedure);
  add(l,'h1',null,c.objet);
  add(l,'p','lede','Autorité contractante : '+c.autorite+' · Langue : '+c.langue+' · Devise : '+c.deviseSoumission);
  add(h,'span','chip c-amber','Date limite de dépôt : '+c.ouverture);

  /* Dossier à retirer */
  var k0=add(m,'div','card');
  add(k0,'div','panel-head','Dossier d\u2019appel d\u2019offres');
  var b0=add(k0,'div','pad');
  ['Règlement de consultation','Cahier des clauses techniques particulières','Cadre du bordereau des prix unitaires',
   "Modèle d'acte d'engagement","Modèle de caution de soumission"].forEach(function(x){
    var row=add(b0,'div','docline');
    add(row,'div',null,x).style.fontWeight='600';
    add(row,'span','chip c-grey','PDF');
  });

  /* Identification */
  var k1=add(m,'div','card'); k1.style.marginTop='18px';
  add(k1,'div','panel-head','1 · Identification du soumissionnaire');
  var f1=add(add(k1,'div','pad'),'div','frm');
  function fld(parent,lab,tag,val,cb,opts){
    var w=add(parent,'div'); var id='p'+Math.random().toString(36).slice(2,8);
    add(w,'label',null,lab).setAttribute('for',id);
    var i=add(w,tag); i.id=id;
    if(tag==='select'){ (opts||[]).forEach(function(o){ var op=add(i,'option',null,o[1]); op.value=o[0]; }); i.value=val; }
    else { i.type=(opts==='number'?'number':'text'); i.value=val; }
    fk(i,'p-'+lab.slice(0,14));
    i.addEventListener('change',function(){ cb(i.value); save(); render(); });
    return i;
  }
  fld(f1,'Raison sociale','input',d.name,function(v){ d.name=v; });
  fld(f1,"Pays d'établissement",'select',d.iso,function(v){ d.iso=v; },PAYS);
  fld(f1,'Devise de soumission','select',d.devise,function(v){ d.devise=v; },DEV);

  var st=add(add(k1,'div','pad'),'div');
  st.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding-top:0';
  add(st,'span','chip '+(uem?'c-teal':'c-violet'), uem?'Zone UEMOA — '+paysNom(d.iso):'Hors zone UEMOA — '+paysNom(d.iso));
  if(!uem && c.prefActive) add(st,'span','chip c-amber','Offre majorée de '+c.prefTaux+' % pour la comparaison');
  if(!uem) add(st,'span','chip c-grey','Retenue à la source : '+c.retenueNonResident+' %');

  /* Offre */
  var k2=add(m,'div','card'); k2.style.marginTop='18px';
  add(k2,'div','panel-head','2 · Contenu de l\u2019offre');
  var p2=add(k2,'div','pad');
  add(p2,'div','stat-k','Lots soumissionnés').style.marginBottom='8px';
  var lb=add(p2,'div'); lb.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px';
  c.lots.forEach(function(lot){
    var on=d.lots.indexOf(lot.id)>=0;
    var p=add(lb,'button','pill'+(on?' on':''), lot.nom);
    p.setAttribute('aria-pressed', on?'true':'false'); fk(p,'lot-'+lot.id);
    p.addEventListener('click',function(){
      if(on) d.lots.splice(d.lots.indexOf(lot.id),1); else d.lots.push(lot.id);
      save(); render();
    });
  });
  var f2=add(p2,'div','frm');
  fld(f2,'Montant total HT ('+d.devise+')','input',d.montant,function(v){ d.montant=v; },'number');
  fld(f2,"Délai d'exécution (jours)",'input',d.delai,function(v){ d.delai=v; },'number');
  fld(f2,'Garantie proposée (mois)','input',d.garantie,function(v){ d.garantie=v; },'number');
  fld(f2,'Nombre de références similaires','input',d.refsCount,function(v){ d.refsCount=v; },'number');

  /* Pièces */
  var k3=add(m,'div','card'); k3.style.marginTop='18px';
  var ph3=add(k3,'div','panel-head');
  add(ph3,'span',null,'3 · Pièces du dossier de candidature');
  add(ph3,'span','chip '+(uem?'c-teal':'c-violet'), uem?'Liste applicable aux soumissionnaires UEMOA':'Liste applicable aux soumissionnaires hors zone');
  var b3=add(k3,'div','pad');
  var req = DOCS().filter(function(x){
    if(x.scope==='tous') return true;
    if(x.scope==='local') return loc;
    return !uem;
  });
  req.forEach(function(doc){
    var meta=(d.files||{})[doc.id], on=!!meta;
    var row=add(b3,'div','docline');
    var lf=add(row,'div');
    add(lf,'div',null,doc.label).style.fontWeight='600';
    add(lf,'div','muted', doc.id==='caution' ? 'Montant : '+c.caution+' % du montant de l’offre' :
      (doc.id==='contreGarantie' ? 'Émise ou contre-garantie par un établissement agréé dans l’UEMOA' :
      (doc.id==='traduction' ? 'Traduction française certifiée conforme' : 'Pièce exigée au règlement de consultation')));
    if(on) add(lf,'div','muted','Fichier : '+meta.name+' ('+taille(meta.size)+') · empreinte '+meta.sha256.slice(0,12)+'…').title=meta.sha256;
    var act=add(row,'div'); act.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    var inp=el('input'); inp.type='file'; inp.accept='.pdf,.png,.jpg,.jpeg,.docx,.xlsx'; inp.hidden=true; inp.setAttribute('aria-label','Choisir le fichier : '+doc.label);
    act.appendChild(inp);
    var btn=add(act,'button','pill'+(on?' on':''), on?'Remplacer le fichier':'Joindre la pièce'); fk(btn,'doc-'+doc.id);
    btn.addEventListener('click',function(){ inp.click(); });
    inp.addEventListener('change',function(){
      var f=inp.files&&inp.files[0]; if(!f) return;
      if(f.size>10*1024*1024){ toast('Fichier trop volumineux (10 Mo maximum).'); return; }
      btn.disabled=true; btn.textContent='Envoi…';
      MP.upload('/api/files?doc='+encodeURIComponent(doc.id), f).then(function(m){
        d.files=d.files||{}; d.files[doc.id]=m; d.docs[doc.id]=true; toast('Pièce jointe enregistrée.'); save(); render();
      }).catch(function(e){ toast(e.message||'Envoi impossible.'); render(); });
    });
    if(on){
      var rm=add(act,'button','btn btn-ghost btn-sm','Retirer');
      rm.setAttribute('aria-label','Retirer le fichier : '+doc.label);
      rm.addEventListener('click',function(){
        MP.api('DELETE','/api/files/'+meta.id).then(function(){ delete d.files[doc.id]; d.docs[doc.id]=false; save(); render(); })
          .catch(function(e){ toast(e.message||'Suppression impossible.'); });
      });
    }
  });
  var non = DOCS().filter(function(x){ return req.indexOf(x)<0; });
  if(non.length){
    var nb=add(k3,'div','panel-foot');
    add(nb,'span','muted','Non exigé de votre profil : '+non.map(function(x){return x.label;}).join(' · '));
  }

  /* Contrôle avant dépôt */
  var k4=add(m,'div','card'); k4.style.marginTop='18px';
  add(k4,'div','panel-head','4 · Contrôle avant dépôt');
  var b4=add(k4,'div','pad');
  var errs=[], warns=[], infos=[];
  if(!d.name.trim()) errs.push('Raison sociale non renseignée.');
  if(!Number(d.montant)) errs.push('Montant total non renseigné.');
  if(!Number(d.delai)) errs.push("Délai d'exécution non renseigné.");
  if(!d.lots.length) errs.push('Aucun lot sélectionné.');
  req.forEach(function(x){ if(!d.docs[x.id]) errs.push('Pièce manquante : '+x.label+'.'); });
  if(Number(d.delai) > c.delaiMax) warns.push('Délai proposé ('+d.delai+' j) supérieur au plafond du cahier des charges ('+c.delaiMax+' j).');
  if(Number(d.garantie) && Number(d.garantie) < c.garantieMin) warns.push('Garantie proposée ('+d.garantie+' mois) inférieure au minimum exigé ('+c.garantieMin+' mois).');
  if(Number(d.refsCount) && Number(d.refsCount) < 3) warns.push('Références déclarées : '+d.refsCount+' pour 3 exigées.');
  if(Number(d.montant) && d.devise!=='XOF'){
    infos.push('Contre-valeur indicative : '+xof(Number(d.montant)*RATE(d.devise))+' au taux d\u2019ouverture.');
  }
  if(Number(d.montant)) infos.push('Caution de soumission attendue : '+c.caution+' % soit '+sep(Number(d.montant)*c.caution/100)+' '+d.devise+'.');
  if(!uem && c.prefActive && Number(d.montant)){
    infos.push('Montant retenu pour la comparaison après majoration de '+c.prefTaux+' % : '+xof(Number(d.montant)*RATE(d.devise)*(1+c.prefTaux/100))+'.');
  }
  function bloc(arr,lvl,titre){
    if(!arr.length) return;
    var box=add(b4,'div'); box.style.cssText='margin-bottom:12px';
    add(box,'div',null,titre).style.cssText='font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;color:'+
      (lvl==='e'?'var(--red)':(lvl==='w'?'var(--amber)':'var(--blue)'));
    arr.forEach(function(x){
      var r=add(box,'div'); r.style.cssText='display:flex;gap:9px;padding:5px 0;font-size:13.5px;align-items:flex-start';
      var dt=add(r,'span',null, lvl==='i'?'i':'!');
      dt.style.cssText='width:19px;height:19px;border-radius:50%;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;background:'+
        (lvl==='e'?'var(--red)':(lvl==='w'?'var(--amber-line)':'var(--blue)'));
      add(r,'span',null,x);
    });
  }
  bloc(errs,'e','Bloquant — dépôt impossible');
  bloc(warns,'w','Avertissement — dépôt possible, écart signalé à l\u2019acheteur');
  bloc(infos,'i','Informations');
  if(!errs.length && !warns.length) add(b4,'p','ok','Le dossier est complet et conforme aux exigences du règlement de consultation.');

  var f4=add(k4,'div','panel-foot');
  add(f4,'span','muted', errs.length? errs.length+' point(s) bloquant(s) à corriger avant dépôt.' : 'Le dépôt vaut engagement ferme du soumissionnaire pour la durée de validité des offres.');
  var sub=add(f4,'button','btn btn-primary','Déposer mon offre');
  sub.disabled = errs.length>0; guard('portail.use',sub);
  sub.addEventListener('click',function(){
    sub.disabled=true;
    MP.api('POST','/api/offers',{ name:d.name.trim(), iso:d.iso, devise:d.devise, montant:Number(d.montant), delai:Number(d.delai)||0,
      garantie:Number(d.garantie)||0, refsCount:Number(d.refsCount)||0, lots:d.lots, docs:d.docs }).then(function(r){
      var offer=r.offer, receipt=r.receipt;
      SEED_OFFERS.push(offer); state.quality[offer.id]={metho:offer.aiMetho, refs:offer.aiRefs};
      synced.offers=JSON.stringify(state.offers); synced.quality=JSON.stringify(state.quality);
      state.receipts.push(receipt);
      notify('depot.recu','Nouveau dépôt — '+offer.name,
        "Accusé "+receipt.num+". Soumissionnaire : "+offer.name+" ("+offer.pays+"). Montant : "+sep(offer.montant)+" "+offer.devise+
        (offer.devise!=='XOF' ? " soit "+xof(montantXOF(offer)) : "")+". Lots : "+d.lots.length+".");
      state.audit.unshift({t:receipt.t, who:me().nom, a:'Dépôt enregistré — '+offer.name+' ('+offer.pays+') — accusé '+receipt.num});
      toast('Offre déposée — accusé '+receipt.num);
      state.draft={ name:'', iso:d.iso, devise:d.devise, montant:'', delai:'', garantie:'', refsCount:'', lots:[], docs:{}, files:{} };
      save(); render();
    }).catch(function(err){ sub.disabled=false; toast(err.message||'Dépôt impossible.'); });
  });

  /* Accusés */
  if(state.receipts.length){
    var k5=add(m,'div','card'); k5.style.marginTop='18px';
    add(k5,'div','panel-head','Accusés de dépôt');
    var b5=add(k5,'div','pad');
    state.receipts.slice().reverse().forEach(function(r){
      var row=add(b5,'div','docline');
      var lf=add(row,'div');
      var t=add(lf,'div'); t.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
      add(t,'strong',null,r.num); add(t,'span','chip c-green','Dépôt enregistré');
      add(lf,'div','muted', r.name+' ('+r.pays+') — '+r.montant+' — '+r.lots+' lot(s) — horodaté le '+r.t);
    });
  }

  var n=add(m,'div','note');
  add(n,'strong',null,'Le dépôt dématérialisé supprime le problème d\u2019extraction. ');
  n.appendChild(document.createTextNode("Une offre saisie dans ce formulaire arrive structurée : aucun OCR, aucun champ à confiance faible, aucune vérification manuelle. C'est l'argument le plus solide pour pousser vos clients à basculer leurs fournisseurs sur le portail, en gardant le module d'extraction pour les plis papier et les dossiers reçus par courriel."));
}

/* ============ Notifications (centre) ============ */
function vNotifs(m){
  setTimeout(function(){ if(state.view==='notifs'){ var k=marquerLues(); if(k){ renderNav(); var bn=document.getElementById('bell-n'); if(bn){bn.textContent='';bn.style.cssText='';} } } },1500);
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Notifications');
  add(l,'p','lede',"Messages adressés au rôle « "+myRole().lab+" ». Les destinataires de chaque événement sont définis dans les règles de notification.");
  var mk=add(h,'button','btn btn-ghost btn-sm','Tout marquer comme lu'); fk(mk,'mk-read');
  mk.addEventListener('click',function(){ var k=marquerLues(); render(); toast(k?k+' notification(s) marquée(s) comme lue(s).':'Aucune notification non lue.'); });

  var mine=notifsPourMoi(), unread=nonLues().length;
  var st=add(m,'div','stats');
  [['Non lues',String(unread),unread?'var(--amber)':null],
   ['Reçues',String(mine.length),null],
   ['Courriels simulés',String(state.emails.length),null],
   ['Événements actifs',String(EVENTS.filter(function(e){var r=state.notifRules[e.id];return r&&(r.inapp||r.email);}).length)+' / '+EVENTS.length,null]
  ].forEach(function(x){ var c=add(st,'div','card pad'); add(c,'div','stat-k',x[0]); var v=add(c,'div','stat-v',x[1]); if(x[2]) v.style.color=x[2]; });

  var c1=add(m,'div','card');
  add(c1,'div','panel-head','Fil des notifications');
  var b1=add(c1,'div','pad');
  if(!mine.length) add(b1,'p','muted',"Aucune notification pour ce rôle. Réalisez une action (publier le dossier, déposer une offre, approuver) pour en déclencher.");
  var uid=state.me;
  mine.forEach(function(nn){
    var lu=nn.lu.indexOf(uid)>=0;
    var row=add(b1,'div'); row.style.cssText='display:flex;gap:12px;padding:13px 0;border-top:1px solid var(--line-2);align-items:flex-start';
    var dot=add(row,'span'); dot.setAttribute('aria-hidden','true');
    dot.style.cssText='width:9px;height:9px;border-radius:50%;margin-top:7px;flex:0 0 auto;background:'+(lu?'var(--line)':'var(--teal)');
    var d=add(row,'div'); d.style.flex='1 1 auto';
    var t=add(d,'div'); t.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    add(t,'strong',null,nn.titre);
    add(t,'span','chip c-grey',nn.lab);
    if(!lu) add(t,'span','chip c-teal','Non lue');
    add(d,'div','muted',nn.corps);
    add(d,'div','muted',nn.t+' · destinataires : '+nn.roles.map(roleLab).join(', '));
  });

  var c2=add(m,'div','card'); c2.style.marginTop='18px';
  var ph=add(c2,'div','panel-head');
  add(ph,'span',null,"Boîte d'envoi — courriels");
  add(ph,'span','chip c-amber','Simulation : aucun message n\u2019est réellement expédié');
  var b2=add(c2,'div','pad');
  if(!state.emails.length) add(b2,'p','muted',"Aucun courriel généré pour l'instant.");
  state.emails.slice(0,12).forEach(function(mm){
    var row=add(b2,'div'); row.style.cssText='padding:14px 0;border-top:1px solid var(--line-2)';
    var t=add(row,'div'); t.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    add(t,'strong',null,mm.objet);
    add(t,'span','chip c-grey',mm.t);
    add(row,'div','muted','De : '+mm.de+' — À : '+(mm.a.join(', ')||'(aucun destinataire pour les rôles visés)'));
    if(mm.noms.length) add(row,'div','muted','Soit : '+mm.noms.join(' · '));
    var pre=add(row,'div',null,mm.corps);
    pre.style.cssText='white-space:pre-line;background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:12px 14px;margin-top:8px;font-size:13px';
  });

  var nb=add(m,'div','note');
  add(nb,'strong',null,'Ce que ce module simule. ');
  nb.appendChild(document.createTextNode("Les notifications internes sont réelles dans la maquette : elles sont ciblées par rôle, marquées lues par utilisateur et persistées. L'envoi de courriel, lui, est simulé : les messages sont rendus tels qu'ils partiraient, mais aucun serveur de messagerie n'est branché. En production, ce module nécessite un service d'envoi, une gestion des rebonds et un traitement du désabonnement."));
}

/* ============ Rôles et habilitations ============ */
function vComptes(m){
  if(!can('roles.edit')) return denyBox(m,'roles.edit');
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Comptes utilisateurs');
  add(l,'p','lede',"Création, rôle, activation et réinitialisation de mot de passe. Toute action est consignée dans la piste d'audit. Un compte désactivé perd son accès immédiatement.");

  var card=add(m,'div','card');
  add(card,'div','panel-head','Comptes');
  var body=add(card,'div','pad'); add(body,'p','muted','Chargement…');
  var me0=state.me;
  function msg(t){ toast(t); }
  function charger(){
    MP.api('GET','/api/auth/users').then(function(list){
      body.textContent='';
      var tbl=add(body,'table','tbl'); tbl.style.width='100%';
      var thr=add(add(tbl,'thead'),'tr');
      ['Nom','Courriel','Rôle','Statut','Dernière connexion','Actions'].forEach(function(t){ add(thr,'th',null,t).style.textAlign='left'; });
      var tb=add(tbl,'tbody');
      list.forEach(function(u){
        var tr=add(tb,'tr'); tr.style.opacity=u.active?'1':'.55';
        add(tr,'td',null,u.nom).style.fontWeight='600';
        add(tr,'td',null,u.email);
        var tdr=add(tr,'td'); var sel=add(tdr,'select'); sel.setAttribute('aria-label','Rôle de '+u.nom);
        Object.keys(state.roles).forEach(function(r){ var o=add(sel,'option',null,state.roles[r].lab); o.value=r; if(r===u.role) o.selected=true; });
        sel.disabled = u.id===me0;
        sel.addEventListener('change',function(){
          MP.api('PATCH','/api/auth/users/'+u.id,{role:sel.value}).then(function(){ msg('Rôle modifié — '+u.nom); return MP.api('GET','/api/state'); })
            .then(function(p){ var us=p.state.users; state.users=us; synced.users=JSON.stringify(us); charger(); })
            .catch(function(e){ msg(e.message); charger(); });
        });
        var st=add(add(tr,'td'),'span','chip '+(u.active?'c-green':'c-grey'),u.active?'Actif':'Désactivé');
        add(tr,'td','muted',u.last_login?u.last_login.replace('T',' ')+' UTC':'Jamais');
        var ta=add(tr,'td'); ta.style.cssText='display:flex;gap:6px;flex-wrap:wrap';
        var tg=add(ta,'button','btn btn-ghost btn-sm',u.active?'Désactiver':'Réactiver'); tg.disabled=u.id===me0;
        tg.addEventListener('click',function(){
          ask(u.active?u.nom+" perdra immédiatement l'accès à la plateforme.":u.nom+' retrouvera son accès.', function(){
            MP.api('PATCH','/api/auth/users/'+u.id,{active:!u.active}).then(function(){ msg(u.active?'Compte désactivé.':'Compte réactivé.'); charger(); }).catch(function(e){ msg(e.message); });
          }, u.active?'Désactiver ce compte ?':'Réactiver ce compte ?', u.active?'Désactiver':'Réactiver');
        });
        var rp=add(ta,'button','btn btn-ghost btn-sm','Réinitialiser le mot de passe'); rp.setAttribute('aria-label','Réinitialiser le mot de passe de '+u.nom);
        rp.addEventListener('click',function(){
          var pw=window.prompt('Nouveau mot de passe provisoire pour '+u.nom+' (10 caractères minimum) :');
          if(!pw) return;
          MP.api('PATCH','/api/auth/users/'+u.id,{password:pw}).then(function(){ msg('Mot de passe réinitialisé — à transmettre à '+u.nom+' par un canal sûr.'); }).catch(function(e){ msg(e.message); });
        });
      });
      labelize(tbl);
    }).catch(function(e){ body.textContent=''; add(body,'p','muted',e.message); });
  }
  charger();

  var k2=add(m,'div','card'); k2.style.marginTop='18px';
  add(k2,'div','panel-head','Créer un compte');
  var f=add(add(k2,'div','pad'),'div','frm');
  function champ(lab,type,ph){ var w=add(f,'div'); var id='c'+Math.random().toString(36).slice(2,8); add(w,'label',null,lab).setAttribute('for',id); var i=add(w,'input'); i.id=id; i.type=type; if(ph) i.placeholder=ph; return i; }
  var nom=champ('Nom','text','Ex. K. Yao'), mail=champ('Courriel','email','prenom.nom'+(state.mailSuffix||'@exemple.ci')), pw=champ('Mot de passe initial','password','10 caractères minimum');
  var rw=add(f,'div'); add(rw,'label',null,'Rôle').setAttribute('for','nc-role'); var rs=add(rw,'select'); rs.id='nc-role';
  Object.keys(state.roles).forEach(function(r){ var o=add(rs,'option',null,state.roles[r].lab); o.value=r; });
  if(state.roles.audit) rs.value='audit'; /* moindre privilège par défaut */
  var ft=add(k2,'div','panel-foot');
  add(ft,'span','muted','Le titulaire doit changer ce mot de passe à sa première connexion (bouton « Mot de passe » en haut de l\u2019écran).');
  var go=add(ft,'button','btn btn-primary','Créer le compte');
  go.addEventListener('click',function(){
    go.disabled=true;
    MP.api('POST','/api/auth/users',{nom:nom.value.trim(), email:mail.value.trim(), role:rs.value, password:pw.value}).then(function(u){
      msg('Compte créé — '+u.nom); nom.value=''; mail.value=''; pw.value='';
      return MP.api('GET','/api/state').then(function(p){ state.users=p.state.users; synced.users=JSON.stringify(p.state.users); });
    }).then(charger).catch(function(e){ msg(e.message); }).then(function(){ go.disabled=false; });
  });
}

function vRoles(m){
  if(!can('roles.edit')) return denyBox(m,'roles.edit');
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Rôles et habilitations');
  add(l,'p','lede',"Matrice des permissions par rôle. Les cumuls incompatibles au regard de la séparation des fonctions sont signalés : ils restent techniquement possibles, mais doivent être justifiés.");

  var rk=Object.keys(state.roles);
  var confl=[];
  rk.forEach(function(r){ incompatOf(state.roles[r].perms).forEach(function(x){ confl.push({r:r,x:x}); }); });
  if(confl.length){
    var w=add(m,'div','warn'); w.style.marginBottom='18px';
    add(w,'strong',null,confl.length+' cumul(s) incompatible(s) détecté(s). ');
    confl.forEach(function(cc){
      add(w,'div','muted','« '+state.roles[cc.r].lab+' » : '+cc.x[2]);
    });
  }

  var grp=null;
  var card=add(m,'div','card');
  var ph=add(card,'div','panel-head');
  add(ph,'span',null,'Matrice des permissions');
  add(ph,'span','chip c-grey',rk.length+' rôles · '+PERMS.length+' permissions');
  var sx=add(card,'div','scroll-x'); var t=add(sx,'table'); t.style.minWidth='820px';
  t.classList.add('mx');
  var tr=add(add(t,'thead'),'tr');
  add(tr,'th',null,'Permission');
  rk.forEach(function(r){ add(tr,'th',null,state.roles[r].lab); });
  var tb=add(t,'tbody');
  PERMS.forEach(function(pp){
    if(pp.grp!==grp){
      grp=pp.grp;
      var gr=add(tb,'tr'); var gtd=add(gr,'td'); gtd.colSpan=rk.length+1;
      gtd.style.cssText='background:var(--surface-2);font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em';
      gtd.textContent=grp;
    }
    var row=add(tb,'tr');
    add(row,'td',null,pp.lab).style.fontWeight='600';
    rk.forEach(function(r){
      var td=add(row,'td'); td.style.textAlign='center';
      var on=!!state.roles[r].perms[pp.id];
      var b=add(td,'button','pill'+(on?' on':''), on?'✓':'—');
      b.style.cssText+=';min-width:52px;justify-content:center';
      b.setAttribute('aria-pressed', on?'true':'false');
      b.setAttribute('aria-label',(on?'Retirer':'Accorder')+' « '+pp.lab+' » au rôle '+state.roles[r].lab);
      fk(b,'perm-'+r+'-'+pp.id);
      b.addEventListener('click',function(){
        state.roles[r].perms[pp.id]=!on;
        var cf=incompatOf(state.roles[r].perms);
        logit('Habilitation '+(on?'retirée':'accordée')+' — '+state.roles[r].lab+' : '+pp.lab);
        save(); render();
        if(!on && cf.length) toast('Attention : ce cumul crée une incompatibilité de séparation des fonctions.');
      });
    });
  });
  labelize(t);

  var c2=add(m,'div','card'); c2.style.marginTop='18px';
  add(c2,'div','panel-head','Utilisateurs et affectation');
  var b2=add(c2,'div','pad');
  state.users.forEach(function(u){
    var row=add(b2,'div','docline');
    var lf=add(row,'div');
    add(lf,'div',null,u.nom).style.fontWeight='600';
    add(lf,'div','muted', mailAdr(u));
    var sel=add(row,'select'); sel.setAttribute('aria-label','Rôle de '+u.nom); fk(sel,'user-'+u.id);
    rk.forEach(function(r){ var op=add(sel,'option',null,state.roles[r].lab); op.value=r; });
    sel.value=u.role;
    sel.addEventListener('change',function(){
      u.role=sel.value; logit('Affectation modifiée — '+u.nom+' : '+roleLab(u.role)); save(); render();
    });
  });

  var nb=add(m,'div','note');
  add(nb,'strong',null,'Pourquoi la séparation des fonctions compte ici. ');
  nb.appendChild(document.createTextNode("Un même agent qui note les offres et approuve l'attribution rend la procédure indéfendable en cas de recours : il n'existe plus de contrôle croisé à opposer au soumissionnaire évincé. L'outil signale ces cumuls sans les interdire, parce que dans une petite structure ils sont parfois inévitables — mais ils doivent alors être assumés et documentés."));
}

/* ============ Paramètres ============ */
function vParams(m){
  if(!can('params.edit')) return denyBox(m,'params.edit');
  var o=state.org, sx=state.seuils;
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Paramètres');
  add(l,'p','lede',"Tout ce qui varie d'une organisation à l'autre se règle ici : identité, devises, seuils de détection, pièces exigibles et circuit d'approbation. Aucune de ces valeurs n'est codée en dur dans les écrans.");

  function champ(parent,lab,val,cb,type,opts){
    var w=add(parent,'div'); var id='s'+Math.random().toString(36).slice(2,8);
    add(w,'label',null,lab).setAttribute('for',id);
    var i=add(w, type==='select'?'select':'input'); i.id=id; fk(i,'par-'+lab.slice(0,16));
    if(type==='select'){ (opts||[]).forEach(function(x){ var op=add(i,'option',null,x[1]); op.value=x[0]; }); i.value=val; }
    else { i.type=(type==='number'?'number':(type==='color'?'color':'text')); i.value=val; }
    i.addEventListener('change',function(){ cb(i.value); save(); render(); });
    return i;
  }

  var k1=add(m,'div','card'); add(k1,'div','panel-head','1 · Organisation');
  var f1=add(add(k1,'div','pad'),'div','frm');
  champ(f1,'Raison sociale',o.nom,function(v){ o.nom=v; state.cdc.autorite=v; logit('Raison sociale modifiée'); });
  champ(f1,'Pays',o.pays,function(v){ o.pays=v; });
  champ(f1,'Ville',o.ville,function(v){ o.ville=v; });
  champ(f1,'Initiales (badge)',o.initiales,function(v){ o.initiales=v.slice(0,3).toUpperCase(); });
  champ(f1,'Devise pivot',o.devisePivot,function(v){ o.devisePivot=v.toUpperCase(); },'select',[['XOF','Franc CFA (XOF)'],['XAF','Franc CFA CEMAC (XAF)'],['GHS','Cedi (GHS)'],['NGN','Naira (NGN)']]);
  champ(f1,"Couleur d'accent",o.accent,function(v){ o.accent=v; logit('Couleur d\u2019accent modifiée'); },'color');

  var k2=add(m,'div','card'); k2.style.marginTop='18px';
  var ph2=add(k2,'div','panel-head'); add(ph2,'span',null,'2 · Taux de conversion');
  add(ph2,'span','chip c-grey','Arrêtés à la date d\u2019ouverture des plis');
  var f2=add(add(k2,'div','pad'),'div','frm');
  Object.keys(o.rates).forEach(function(d){
    if(d===o.devisePivot) return;
    champ(f2,'1 '+d+' = ? '+o.devisePivot, o.rates[d], function(v){
      o.rates[d]=Number(v)||o.rates[d]; logit('Taux '+d+' porté à '+o.rates[d]);
    },'number');
  });
  add(add(k2,'div','panel-foot'),'span','muted','La parité EUR/XOF est fixe ; les autres taux sont à relever auprès de la banque centrale à la date d\u2019ouverture et à figer pour toute la procédure.');
  if(state.fxFrozen){
    var fz=add(add(k2,'div','pad'),'div','note'); fz.style.marginTop='0';
    add(fz,'strong',null,'Taux de la procédure figés le '+state.fxFrozen.at+'. ');
    fz.appendChild(document.createTextNode("Une modification ci-dessus ne change plus le classement en cours, calculé avec les taux figés : "+
      Object.keys(state.fxFrozen.rates).filter(function(k){ return k!==o.devisePivot; }).map(function(k){ return k+' '+state.fxFrozen.rates[k]; }).join(', ')+'.'));
  }

  var k3=add(m,'div','card'); k3.style.marginTop='18px';
  add(k3,'div','panel-head','3 · Seuils de détection et de contrôle');
  var f3=add(add(k3,'div','pad'),'div','frm');
  champ(f3,'Confiance minimale d\u2019extraction (%)',sx.confianceMin,function(v){ sx.confianceMin=Number(v)||0; logit('Seuil de confiance porté à '+sx.confianceMin+' %'); },'number');
  champ(f3,'Écart déclenchant « prix bas » (%)',sx.prixBas,function(v){ sx.prixBas=Number(v)||0; logit('Seuil de prix anormalement bas porté à '+sx.prixBas+' %'); },'number');
  champ(f3,'Écart max. structures de prix (points)',sx.structureEcart,function(v){ sx.structureEcart=Number(v)||0; },'number');
  champ(f3,'Références minimales exigées',sx.refsMin,function(v){ sx.refsMin=Number(v)||0; },'number');
  champ(f3,'Validité minimale des offres (jours)',sx.validiteMin,function(v){ sx.validiteMin=Number(v)||0; },'number');
  add(add(k3,'div','panel-foot'),'span','muted','Abaisser le seuil de confiance réduit le nombre de vérifications manuelles — et augmente le risque qu\u2019un montant mal extrait fausse le classement. Ce réglage engage l\u2019organisation.');

  var k4=add(m,'div','card'); k4.style.marginTop='18px';
  add(k4,'div','panel-head','4 · Pièces exigibles du dossier de candidature');
  var b4=add(k4,'div','pad');
  state.docDefs.forEach(function(d,i){
    var row=add(b4,'div','docline');
    var ti=add(row,'input'); ti.type='text'; ti.value=d.label; ti.style.flex='1 1 280px';
    ti.setAttribute('aria-label','Libellé de la pièce'); fk(ti,'doc-lab-'+d.id);
    ti.addEventListener('change',function(){ d.label=ti.value; save(); });
    var se=add(row,'select'); se.setAttribute('aria-label','Profil concerné'); fk(se,'doc-scope-'+d.id);
    [['tous','Tous les soumissionnaires'],['local','Soumissionnaires locaux'],['etranger','Soumissionnaires hors UEMOA']].forEach(function(x){
      var op=add(se,'option',null,x[1]); op.value=x[0];
    });
    se.value=d.scope;
    se.addEventListener('change',function(){ d.scope=se.value; logit('Pièce « '+d.label+' » : profil concerné modifié'); save(); render(); });
    var del=add(row,'button','icon-btn','×'); del.setAttribute('aria-label','Supprimer la pièce '+d.label);
    if(CADRE().piecesImposees.indexOf(d.id)>=0){ del.disabled=true; del.title='Pièce exigée par le profil réglementaire'; }
    del.addEventListener('click',function(){
      ask('Cette pièce ne sera plus exigée ni contrôlée sur aucune offre.', function(){
        state.docDefs.splice(i,1); logit('Pièce retirée du référentiel : '+d.label); save(); render();
      },'Retirer « '+d.label+' » ?','Retirer');
    });
  });
  var f4b=add(k4,'div','panel-foot');
  add(f4b,'span','muted','Le contrôle de conformité et le portail de dépôt se reconfigurent automatiquement sur ce référentiel.');
  add(f4b,'button','btn btn-ghost btn-sm','+ Ajouter une pièce').addEventListener('click',function(){
    state.docDefs.push({id:'d'+Date.now(), label:'Nouvelle pièce exigée', scope:'tous'});
    SEED_OFFERS.forEach(function(oo){ oo.docs['d'+0]=true; });
    logit('Pièce ajoutée au référentiel'); save(); render();
  });

  var k5=add(m,'div','card'); k5.style.marginTop='18px';
  add(k5,'div','panel-head','5 · Circuit d\u2019approbation');
  var b5=add(k5,'div','pad');
  var rk=Object.keys(state.roles);
  state.approvals.forEach(function(a,i){
    var row=add(b5,'div','docline');
    var lf=add(row,'div'); lf.style.flex='1 1 240px';
    var ti=add(lf,'input'); ti.type='text'; ti.value=a.role; ti.style.width='100%';
    ti.setAttribute('aria-label','Intitulé du niveau'); fk(ti,'appr-lab-'+i);
    ti.addEventListener('change',function(){ a.role=ti.value; save(); });
    var wi=add(lf,'input'); wi.type='text'; wi.value=a.who; wi.style.cssText='width:100%;margin-top:6px';
    wi.setAttribute('aria-label','Titulaire du niveau'); fk(wi,'appr-who-'+i);
    wi.addEventListener('change',function(){ a.who=wi.value; save(); });
    var up=add(row,'button','icon-btn','↑'); up.setAttribute('aria-label','Remonter ce niveau');
    up.disabled = i===0;
    up.addEventListener('click',function(){
      var t=state.approvals[i-1]; state.approvals[i-1]=state.approvals[i]; state.approvals[i]=t;
      logit('Ordre du circuit d\u2019approbation modifié'); save(); render();
    });
    var del=add(row,'button','icon-btn','×'); del.setAttribute('aria-label','Supprimer ce niveau');
    del.addEventListener('click',function(){
      var nmin=Math.max(1,CADRE().niveauxApprobationMin);
      if(state.approvals.length<=nmin){ toast('Le profil réglementaire exige au moins '+nmin+' niveau(x) d’approbation.'); return; }
      ask('Ce niveau de validation disparaîtra du circuit et du procès-verbal.', function(){
        state.approvals.splice(i,1); logit('Niveau d\u2019approbation supprimé : '+a.role); save(); render();
      },'Supprimer « '+a.role+' » ?','Supprimer');
    });
  });
  var f5=add(k5,'div','panel-foot');
  add(f5,'span','muted',state.approvals.length+' niveau(x) configuré(s). L\u2019ordre détermine la séquence d\u2019approbation.');
  add(f5,'button','btn btn-ghost btn-sm','+ Ajouter un niveau').addEventListener('click',function(){
    state.approvals.push({role:'Nouveau niveau de validation', who:'À désigner', done:false});
    logit('Niveau d\u2019approbation ajouté'); save(); render();
  });

  var k6=add(m,'div','card'); k6.style.marginTop='18px';
  add(k6,'div','panel-head','6 · Messagerie');
  var f6=add(add(k6,'div','pad'),'div','frm');
  champ(f6,'Adresse expéditrice',state.mailFrom,function(v){ state.mailFrom=v; });
  champ(f6,'Domaine des destinataires',state.mailSuffix,function(v){ state.mailSuffix=v; });
  vParamsCadre(m,o);
  add(add(k6,'div','panel-foot'),'span','muted','Aucun message n\u2019est réellement expédié dans cette maquette : la boîte d\u2019envoi restitue ce qui partirait.');
}

/* Cadre réglementaire : profil par défaut et réglages du client, dans les bornes du profil (profils.js). */
function vParamsCadre(m,o){
  var P=MPProfils, pid=R.profilId({ cdc:state.cdc, org:o }), prof=P.profil(pid);
  var eff=P.effectif(pid,o.reglages);
  var k7=add(m,'div','card'); k7.style.marginTop='18px';
  var ph=add(k7,'div','panel-head'); add(ph,'span',null,'7 · Cadre réglementaire');
  add(ph,'span','chip '+(prof.public?'c-violet':'c-teal'), prof.lab);
  var b=add(k7,'div','pad');
  var w=add(add(b,'div','frm'),'div');
  add(w,'label',null,'Profil par défaut des nouvelles procédures').setAttribute('for','par-profil');
  var s=add(w,'select'); s.id='par-profil'; fk(s,'par-profil');
  Object.keys(P.PROFILS).forEach(function(id){ var op=add(s,'option',null,P.PROFILS[id].lab); op.value=id; });
  s.value=o.profilDefaut||P.DEFAUT;
  s.addEventListener('change',function(){ o.profilDefaut=s.value; logit('Profil réglementaire par défaut : '+P.profil(s.value).lab); save(); render(); });
  add(b,'p','muted','Règles du profil « '+prof.lab+' », celui de la procédure en cours. '+prof.note).style.marginTop='12px';
  if(state.cadre) add(b,'div','note','Le cadre de la procédure '+REF()+' a été figé à sa publication, le '+state.cadre.at+' : un réglage modifié ici ne s’appliquera qu’aux procédures publiées ensuite.');
  var lab=function(id){ var d=DOCS().filter(function(x){ return x.id===id; })[0]; return d?d.label:id; };
  P.REGLES.forEach(function(def){
    var r=prof.regles[def.id], v=eff[def.id];
    var row=add(b,'div','docline');
    var lf=add(row,'div'); lf.style.flex='1 1 260px';
    add(lf,'div',null,def.lab).style.fontWeight='600';
    if(def.type==='pieces' && !v.length){ add(lf,'div','muted','Aucune : toutes les pièces du référentiel peuvent être retirées.'); return; }
    if(r.impose){
      add(lf,'div','muted', def.type==='bool' ? (v?'Oui':'Non') : def.type==='liste-pays' ? v.join(', ')
        : def.type==='pieces' ? (v.length ? v.map(lab).join(' ; ') : 'Aucune') : String(v));
      add(row,'span','chip c-grey','Imposé par le profil');
      return;
    }
    var set=function(val,aff){ o.reglages=o.reglages||{}; o.reglages[def.id]=val; logit('Réglage « '+def.lab+' » : '+aff); save(); render(); };
    if(def.type==='bool'){
      var p=add(row,'button','pill'+(v?' on':''), v?'Oui':'Non'); fk(p,'rg-'+def.id);
      p.setAttribute('aria-pressed',v?'true':'false'); p.setAttribute('aria-label',def.lab);
      p.addEventListener('click',function(){ set(!v, v?'non':'oui'); });
      return;
    }
    var i=add(row,'input'); i.setAttribute('aria-label',def.lab); fk(i,'rg-'+def.id);
    if(def.type==='nombre'){
      i.type='number'; i.min=r.min; i.max=r.max; i.value=v; i.style.width='110px';
      add(lf,'div','muted','Entre '+r.min+' et '+r.max+'.');
    } else {
      i.type='text'; i.value = def.type==='liste-pays' ? v.join(', ') : v; i.style.flex='1 1 200px';
      add(lf,'div','muted', def.type==='liste-pays' ? 'Codes pays à deux lettres, séparés par des virgules.' : 'Code pays à deux lettres.');
    }
    i.addEventListener('change',function(){
      var val = def.type==='nombre' ? Number(i.value)
        : def.type==='liste-pays' ? i.value.toUpperCase().split(/[\s,;]+/).filter(Boolean) : i.value.trim().toUpperCase();
      set(val, Array.isArray(val) ? val.join(', ') : String(val));
    });
  });
  add(add(k7,'div','panel-foot'),'span','muted','Les valeurs du profil public sont à faire valider par un juriste marchés publics avant tout usage réel.');
}

/* ============ Règles de notification ============ */
function vRegles(m){
  if(!can('notif.manage')) return denyBox(m,'notif.manage');
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Règles de notification');
  add(l,'p','lede',"Pour chaque événement de la procédure : canal de diffusion et rôles destinataires. Un événement sans destinataire ne notifie personne, même si le canal est actif.");

  var rk=Object.keys(state.roles);
  var card=add(m,'div','card');
  var ph=add(card,'div','panel-head');
  add(ph,'span',null,'Matrice des événements');
  var actifs=EVENTS.filter(function(e){var r=state.notifRules[e.id];return r&&(r.inapp||r.email);}).length;
  add(ph,'span','chip '+(actifs?'c-green':'c-grey'), actifs+' / '+EVENTS.length+' événements actifs');
  var b=add(card,'div','pad');
  EVENTS.forEach(function(ev){
    var r=state.notifRules[ev.id]; if(!r) return;
    var row=add(b,'div'); row.style.cssText='padding:14px 0;border-top:1px solid var(--line-2)';
    var t=add(row,'div'); t.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px';
    add(t,'strong',null,ev.lab);
    var bi=add(t,'button','pill'+(r.inapp?' on':''),'Dans l\u2019application');
    bi.setAttribute('aria-pressed', r.inapp?'true':'false'); fk(bi,'ev-in-'+ev.id);
    bi.addEventListener('click',function(){ r.inapp=!r.inapp; logit('Notification interne '+(r.inapp?'activée':'désactivée')+' — '+ev.lab); save(); render(); });
    var be=add(t,'button','pill'+(r.email?' on':''),'Courriel');
    be.setAttribute('aria-pressed', r.email?'true':'false'); fk(be,'ev-em-'+ev.id);
    be.addEventListener('click',function(){ r.email=!r.email; logit('Notification par courriel '+(r.email?'activée':'désactivée')+' — '+ev.lab); save(); render(); });
    if(!r.roles.length) add(t,'span','chip c-amber','Aucun destinataire');
    var rr=add(row,'div'); rr.style.cssText='display:flex;gap:7px;flex-wrap:wrap';
    rk.forEach(function(rid){
      var on=r.roles.indexOf(rid)>=0;
      var p=add(rr,'button','pill'+(on?' on':''), state.roles[rid].lab);
      p.style.cssText+=';font-size:11.5px;min-height:38px';
      p.setAttribute('aria-pressed', on?'true':'false'); fk(p,'ev-r-'+ev.id+'-'+rid);
      p.addEventListener('click',function(){
        if(on) r.roles.splice(r.roles.indexOf(rid),1); else r.roles.push(rid);
        save(); render();
      });
    });
  });

  var nb=add(m,'div','note');
  add(nb,'strong',null,'Un réglage à ne pas prendre à la légère. ');
  nb.appendChild(document.createTextNode("Notifier l'attribution aux soumissionnaires avant la fin du délai de recours, ou diffuser une anomalie de prix hors du cercle d'instruction, expose l'autorité contractante. Le paramétrage par défaut proposé ici est prudent ; toute extension des destinataires devrait être validée par le responsable de la procédure."));
}

/* ============ Questions des candidats & additifs ============ */
function vQA(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'div','eyebrow','Phase de publication');
  add(l,'h1',null,'Questions des candidats et additifs');
  add(l,'p','lede',"Les réponses sont rendues anonymes et communiquées à tous les candidats ayant retiré le dossier. Un additif modifiant substantiellement la préparation des offres reporte la date limite de dépôt.");

  var k1=add(m,'div','card');
  var ph=add(k1,'div','panel-head');
  add(ph,'span',null,'Questions reçues');
  var ouv=state.qa.filter(function(x){return !x.reponse;}).length;
  add(ph,'span','chip '+(ouv?'c-amber':'c-green'), ouv? ouv+' sans réponse':'Toutes traitées');
  var b1=add(k1,'div','pad');
  if(!state.qa.length) vide(b1,'💬','Aucune question reçue',"Les questions déposées par les candidats apparaîtront ici. Simulez-en une pour voir le traitement.");
  state.qa.forEach(function(q,i){
    var bx=add(b1,'div'); bx.style.cssText='padding:14px 0;border-top:1px solid var(--line-2)';
    var t=add(bx,'div','msg-h');
    add(t,'strong',null,'Question '+(i+1));
    add(t,'span','chip c-grey',q.t);
    add(t,'span','chip '+(q.reponse?'c-green':'c-amber'), q.reponse?'Répondue':'En attente');
    if(q.anonyme) add(t,'span','chip c-violet','Anonymisée à la diffusion');
    add(bx,'div',null,q.question).style.marginBottom='8px';
    if(q.reponse){
      var th=add(bx,'div','thread');
      add(th,'div','t-xs','Réponse diffusée à tous les candidats');
      add(th,'div',null,q.reponse);
    } else if(can('qa.answer')){
      var ta=add(bx,'textarea'); ta.rows=2; ta.style.width='100%'; ta.placeholder='Réponse — elle sera communiquée à tous les candidats…';
      ta.setAttribute('aria-label','Réponse à la question '+(i+1)); fk(ta,'qa-'+i);
      var bt=add(bx,'button','btn btn-primary btn-sm','Publier la réponse'); bt.style.marginTop='8px';
      bt.addEventListener('click',function(){
        if(!ta.value.trim()){ toast('La réponse ne peut pas être vide.'); return; }
        q.reponse=ta.value.trim(); q.tRep=new Date().toLocaleString('fr-FR');
        logit('Réponse publiée à une question de candidat');
        notify('additif.publie','Réponse aux candidats publiée', q.question+"\n\nRéponse : "+q.reponse);
        save(); render();
      });
    }
  });
  var f1=add(k1,'div','panel-foot');
  add(f1,'span','muted','Les questions sont closes 7 jours avant la date limite de dépôt.');
  var sim=add(f1,'button','btn btn-ghost btn-sm','Simuler une question');
  sim.addEventListener('click',function(){
    var ex=["Le lot 4 (maintenance) peut-il être soumissionné séparément des lots 1 à 3 ?",
      "La caution de soumission peut-elle être émise par une banque de notre pays d'origine avec contre-garantie locale ?",
      "Les références exigées doivent-elles porter sur le secteur bancaire ou tout secteur est-il admis ?",
      "Le délai d'acheminement maritime est-il inclus dans le délai d'exécution de 120 jours ?"];
    state.qa.push({ question: ex[state.qa.length % ex.length], t:new Date().toLocaleString('fr-FR'), anonyme:true });
    logit('Question de candidat enregistrée');
    notify('question.recue','Question reçue d\u2019un candidat', ex[(state.qa.length-1) % ex.length]);
    save(); render();
  });

  var k2=add(m,'div','card'); k2.style.marginTop='18px';
  add(k2,'div','panel-head','Additifs au dossier');
  var b2=add(k2,'div','pad');
  if(!state.additifs.length) vide(b2,'📎','Aucun additif publié',"Un additif modifie le dossier après publication. S'il change substantiellement la préparation des offres, il reporte la date limite.");
  state.additifs.forEach(function(a,i){
    var row=add(b2,'div','docline');
    var lf=add(row,'div');
    add(lf,'div',null,'Additif n° '+(i+1)+' — '+a.objet).style.fontWeight='600';
    add(lf,'div','muted',a.t+(a.report?' · date limite reportée au '+a.report:' · sans incidence sur la date limite'));
    add(row,'span','chip '+(a.report?'c-amber':'c-grey'), a.report?'Report de délai':'Précision');
  });
  if(can('qa.answer')){
    var f2=add(k2,'div','panel-foot');
    add(f2,'span','muted','Un additif publié moins de 5 jours avant la date limite impose un report.');
    var ba=add(f2,'button','btn btn-ghost btn-sm','Publier un additif');
    ba.addEventListener('click',function(){
      ask("L'additif sera diffusé à tous les candidats ayant retiré le dossier et fera partie intégrante du dossier d'appel d'offres. S'il modifie substantiellement la préparation des offres, reportez la date limite en conséquence.",
        function(){
          var rep2 = state.additifs.length===0 ? '29/10/2026' : null;
          state.additifs.push({objet:'Précision sur les pièces exigées des soumissionnaires hors UEMOA',
            t:new Date().toLocaleString('fr-FR'), report:rep2});
          if(rep2) state.cdc.ouverture='2026-10-29';
          logit('Additif publié au dossier d\u2019appel d\u2019offres');
          notify('additif.publie','Additif publié','Un additif modifie le dossier '+REF()+'.'+(rep2?' La date limite de dépôt est reportée au '+rep2+'.':''));
          save(); render();
        },"Publier un additif ?","Publier");
    });
  }
}

/* ============ Clarifications ============ */
function vClarifs(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'div','eyebrow','Phase d\u2019analyse');
  add(l,'h1',null,'Demandes de clarification');
  add(l,'p','lede',"Une clarification lève une ambiguïté sur une offre déjà déposée. Elle ne peut en aucun cas modifier le prix ni le contenu substantiel de l'offre : ce serait une négociation déguisée, et un motif de recours.");

  var k=add(m,'div','card');
  var ph=add(k,'div','panel-head');
  add(ph,'span',null,'Échanges en cours');
  var ouv=clarifsOuvertes().length;
  add(ph,'span','chip '+(ouv?'c-amber':'c-green'), ouv? ouv+' en attente de réponse':'Aucune en attente');
  var b=add(k,'div','pad');
  if(!state.clarifs.length) vide(b,'❓','Aucune demande émise',"Sélectionnez une offre ci-dessous pour demander une précision sur un point ambigu de son dossier.");
  state.clarifs.forEach(function(cl,i){
    var o=null; SEED_OFFERS.forEach(function(x){ if(x.id===cl.offerId) o=x; });
    var bx=add(b,'div'); bx.style.cssText='padding:14px 0;border-top:1px solid var(--line-2)';
    var t=add(bx,'div','msg-h');
    add(t,'strong',null,(o?o.name:cl.offerId));
    add(t,'span','chip '+(cl.statut==='envoyee'?'c-amber':'c-green'), cl.statut==='envoyee'?'En attente — échéance '+cl.echeance:'Réponse reçue');
    add(bx,'div','muted','Objet : '+cl.objet);
    var th=add(bx,'div','thread'); th.style.marginTop='8px';
    var m1=add(th,'div','msg');
    add(m1,'div','t-xs','Demande de l\u2019autorité contractante — '+cl.t);
    add(m1,'div',null,cl.question);
    if(cl.reponse){
      var m2=add(th,'div','msg');
      add(m2,'div','t-xs','Réponse du soumissionnaire — '+cl.tRep);
      add(m2,'div',null,cl.reponse);
    } else if(can('clarif.send')){
      var bt=add(bx,'button','btn btn-ghost btn-sm','Simuler la réponse du soumissionnaire'); bt.style.marginTop='8px';
      bt.addEventListener('click',function(){
        cl.reponse="Précision apportée sans modification du prix ni du périmètre : le poste visé correspond bien à la fourniture décrite au bordereau, le libellé abrégé ayant prêté à confusion.";
        cl.tRep=new Date().toLocaleString('fr-FR'); cl.statut='repondue';
        logit('Réponse de clarification reçue — '+(o?o.name:cl.offerId));
        save(); render();
      });
    }
  });

  if(can('clarif.send')){
    var f=add(k,'div','panel-foot');
    add(f,'span','muted','Délai de réponse : 3 jours ouvrés. Une absence de réponse est instruite en l\u2019état du dossier.');
    var sel=add(f,'select'); sel.setAttribute('aria-label','Offre concernée'); fk(sel,'clarif-off');
    conformes().forEach(function(o){ var op=add(sel,'option',null,o.name); op.value=o.id; });
    var bt=add(f,'button','btn btn-primary btn-sm','Demander une clarification');
    bt.addEventListener('click',function(){
      var oid=sel.value; var o=null; SEED_OFFERS.forEach(function(x){ if(x.id===oid) o=x; });
      ask("La demande porte sur une ambiguïté du dossier déposé. Elle ne peut pas conduire le soumissionnaire à modifier son prix ni le contenu de son offre — seulement à expliciter ce qu'il a déjà remis.",
        function(){
          var e=new Date(Date.now()+3*86400000).toLocaleDateString('fr-FR');
          state.clarifs.push({ offerId:oid, objet:'Libellé d\u2019un poste du bordereau des prix',
            question:"Le poste « baies de brassage » de votre bordereau ne précise pas si la fourniture inclut les unités de distribution électrique exigées à l'article 4.5 du CCTP. Merci de confirmer ce que couvre le prix indiqué, sans le modifier.",
            statut:'envoyee', t:new Date().toLocaleString('fr-FR'), echeance:e });
          logit('Demande de clarification envoyée — '+(o?o.name:oid));
          notify('clarif.envoyee','Demande de clarification — '+(o?o.name:''),
            "Une précision est demandée sur le dossier de "+(o?o.name:'')+". Réponse attendue avant le "+e+", sans modification du prix ni du contenu de l'offre.");
          save(); render();
        },"Envoyer la demande à "+(o?o.name:'')+" ?","Envoyer");
    });
  }

  var nb=add(m,'div','note');
  add(nb,'strong',null,'La frontière à ne pas franchir. ');
  nb.appendChild(document.createTextNode("Demander « pouvez-vous améliorer votre prix ? » n'est pas une clarification : c'est une négociation, interdite en appel d'offres ouvert et attaquable. La distinction doit rester lisible dans la piste d'audit — d'où l'enregistrement de l'objet, de la question et de la réponse in extenso."));
}

/* ============ Notification, délai de recours et signature ============ */
function vRecours(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'div','eyebrow','Après attribution');
  add(l,'h1',null,'Notification, recours et signature');
  var K=CADRE(), J=delaiJours();
  add(l,'p','lede', K.recoursActif
    ? "L'attribution notifiée ouvre un délai pendant lequel le marché ne peut pas être signé. Tout recours déposé dans ce délai suspend la signature jusqu'à décision."
    : (J>0 ? "L'attribution notifiée ouvre un délai de "+J+" jour(s) avant la signature. Le profil réglementaire de la procédure ne prévoit pas de recours."
           : "Le profil réglementaire de la procédure ne prévoit ni recours ni délai : le marché peut être signé dès la notification."));

  if(!allApproved()) return locked(m,"Cette étape s'ouvre une fois l'attribution prononcée.",'decision',"Aller au circuit d'approbation");

  var rows=ranking(), win=rows[0];

  var k0=add(m,'div','card pad accent');
  add(k0,'div','t-xs','Attributaire');
  add(k0,'div',null,win.o.name).style.cssText='font-size:21px;font-weight:700;margin:3px 0';
  add(k0,'div','muted', xof(montantXOF(win.o))+' · '+win.o.delai+' jours · note '+win.total.toFixed(1)+'/100');

  var k1=add(m,'div','card'); k1.style.marginTop='18px';
  add(k1,'div','panel-head','1 · Notification aux soumissionnaires');
  var b1=add(k1,'div','pad');
  if(!state.standstill.startedAt){
    add(b1,'p','muted',"La notification informe l'attributaire et communique aux non-retenus les motifs du rejet de leur offre."+(J>0 ? " Elle déclenche le délai de recours." : ""));
    var bn=add(b1,'button','btn btn-primary', J>0 ? 'Notifier et ouvrir le délai de recours' : 'Notifier l’attribution');
    guard('decision.approve',bn); fk(bn,'notif-att');
    bn.addEventListener('click',function(){
      ask("Chaque soumissionnaire non retenu recevra le motif du rejet de son offre et son rang."+(J>0 ? " Le marché ne pourra pas être signé avant l'expiration du délai de "+J+" jours." : ""),
        function(){
          state.standstill.startedAt=Date.now(); state.standstill.days=J;
          logit('Notification d\u2019attribution — délai de recours ouvert');
          notify('standstill','Attribution notifiée — délai de recours ouvert',
            "Le marché "+REF()+" est attribué à "+win.o.name+"."+(J>0 ? " Les soumissionnaires non retenus disposent de "+J+" jours pour contester. La signature est suspendue jusqu'à l'expiration de ce délai." : ""));
          save(); render();
        },"Notifier l'attribution ?","Notifier");
    });
  } else {
    var reste=standstillReste();
    var box=add(b1,'div'); box.style.cssText='display:flex;gap:18px;align-items:center;flex-wrap:wrap';
    var cd=add(box,'div');
    add(cd,'div','t-xs','Délai de recours');
    add(cd,'div','countdown', reste>0 ? reste+' jour(s) restant(s)' : 'Délai expiré');
    add(box,'span','chip '+(reste>0?'c-amber':'c-green'), reste>0?'Signature suspendue':'Signature possible');
    var tb=add(b1,'div'); tb.style.marginTop='14px';
    add(tb,'div','t-xs','Motifs communiqués aux non-retenus');
    rows.slice(1).forEach(function(r){
      var row=add(tb,'div','docline');
      var lf=add(row,'div');
      add(lf,'div',null,r.o.name).style.fontWeight='600';
      add(lf,'div','muted','Rang '+r.rank+' — note '+r.total.toFixed(1)+'/100, inférieure à celle de l\u2019attributaire.');
      add(row,'span','chip c-grey','Notifié');
    });
    SEED_OFFERS.filter(excluded).forEach(function(o){
      var mis=missingDocs(o);
      var row=add(tb,'div','docline');
      var lf=add(row,'div');
      add(lf,'div',null,o.name).style.fontWeight='600';
      add(lf,'div','muted','Offre écartée — '+(mis.length?mis.map(function(d){return d.label;}).join(' ; '):'décision du comité'));
      add(row,'span','chip c-red','Rejet motivé');
    });
  }

  var k2=add(m,'div','card'); k2.style.marginTop='18px';
  if(!K.recoursActif && !state.recours.length){
    add(k2,'div','panel-head','2 · Recours');
    add(add(k2,'div','pad'),'p','muted','Le profil « '+MPProfils.profil(R.profilId(RCTX())).lab+' » ne prévoit pas de recours des soumissionnaires.');
  } else {
  var ph2=add(k2,'div','panel-head');
  add(ph2,'span',null,'2 · Recours déposés');
  var ro=recoursOuverts().length;
  add(ph2,'span','chip '+(ro?'c-red':'c-green'), ro? ro+' recours ouvert(s)':'Aucun recours');
  var b2=add(k2,'div','pad');
  if(!state.recours.length) vide(b2,'⚖️','Aucun recours enregistré',"Un recours déposé dans le délai suspend la signature du marché jusqu'à ce qu'il soit instruit.");
  state.recours.forEach(function(r,i){
    var bx=add(b2,'div'); bx.style.cssText='padding:13px 0;border-top:1px solid var(--line-2)';
    var t=add(bx,'div','msg-h');
    add(t,'strong',null,'Recours '+(i+1)+' — '+r.de);
    add(t,'span','chip '+(r.statut==='ouvert'?'c-red':(r.statut==='rejete'?'c-grey':'c-amber')),
      r.statut==='ouvert'?'En instruction':(r.statut==='rejete'?'Rejeté':'Fondé'));
    add(t,'span','chip c-grey',r.t);
    add(bx,'div',null,r.objet);
    if(r.decision) add(bx,'div','muted','Décision : '+r.decision);
    if(r.statut==='ouvert' && can('recours.handle')){
      var acts=add(bx,'div'); acts.style.cssText='display:flex;gap:8px;margin-top:10px;flex-wrap:wrap';
      var rj=add(acts,'button','btn btn-ghost btn-sm','Rejeter le recours');
      rj.addEventListener('click',function(){
        ask("Le rejet doit être motivé par écrit et communiqué au requérant, qui conserve la faculté de saisir l'organe de régulation.",function(){
          r.statut='rejete'; r.decision="Recours rejeté : la procédure de notation a été appliquée conformément à la grille publiée, et la piste d'audit atteste l'intervention humaine sur chaque score retenu.";
          logit('Recours rejeté — '+r.de); save(); render();
        },"Rejeter ce recours ?","Rejeter");
      });
      var fd=add(acts,'button','btn btn-danger btn-sm','Déclarer le recours fondé');
      fd.addEventListener('click',function(){
        ask("Déclarer le recours fondé ramène la procédure à l'étape entachée. Cette décision doit être motivée et consignée au procès-verbal.",function(){
          r.statut='fonde'; r.decision="Recours fondé : reprise de la procédure à l'étape concernée.";
          state.evalDone=false; state.approvals.forEach(function(a){ a.done=false; });
          state.standstill.startedAt=null;
          logit('Recours déclaré fondé — procédure reprise à l\u2019évaluation');
          save(); render();
        },"Déclarer ce recours fondé ?","Déclarer fondé");
      });
    }
  });
  if(K.recoursActif && state.standstill.startedAt && !state.contractSigned){
    var f2=add(k2,'div','panel-foot');
    add(f2,'span','muted','Recours recevable jusqu\u2019à l\u2019expiration du délai.');
    var br=add(f2,'button','btn btn-ghost btn-sm','Simuler un recours');
    br.addEventListener('click',function(){
      var perdant = rows[1] ? rows[1].o.name : 'Un soumissionnaire';
      state.recours.push({ de:perdant, statut:'ouvert', t:new Date().toLocaleString('fr-FR'),
        objet:"Le requérant conteste la notation du critère « Méthodologie » et demande communication des éléments ayant fondé l'écart avec sa propre offre." });
      logit('Recours déposé — '+perdant+' — signature suspendue');
      notify('recours.depose','Recours déposé — signature suspendue',
        perdant+" conteste l'attribution de la procédure "+REF()+". La signature du marché est suspendue jusqu'à instruction du recours.");
      save(); render();
    });
  }
  }

  var k3=add(m,'div','card'); k3.style.marginTop='18px';
  add(k3,'div','panel-head','3 · Signature du marché');
  var b3=add(k3,'div','pad');
  var reste=standstillReste(), bloque = recoursOuverts().length>0 || reste>0 || !state.standstill.startedAt;
  if(state.contractSigned){
    add(b3,'p',null,'Le marché est signé. La garantie de bonne exécution est à constituer dans les 20 jours.').style.color='var(--green)';
  } else {
    var raisons=[];
    if(!state.standstill.startedAt) raisons.push("L'attribution n'a pas encore été notifiée.");
    if(reste>0 && state.standstill.startedAt) raisons.push("Le délai de recours court encore ("+reste+" jour(s)).");
    if(recoursOuverts().length) raisons.push(recoursOuverts().length+" recours est en instruction.");
    if(raisons.length){
      var w=add(b3,'div','warn');
      add(w,'strong',null,'Signature bloquée. ');
      raisons.forEach(function(x){ add(w,'div',null,x); });
    } else {
      add(b3,'p','muted', J>0 || K.recoursActif ? 'Délai expiré, aucun recours en instance : le marché peut être signé.' : 'Attribution notifiée : le marché peut être signé.');
    }
    var bs=add(b3,'button','btn btn-dark','Signer le marché'); bs.style.marginTop='12px';
    bs.disabled=bloque; guard('contract.sign',bs); fk(bs,'sign');
    bs.addEventListener('click',function(){
      ask("La signature engage l'autorité contractante pour "+xof(montantXOF(win.o))+". Vérifiez la constitution de la garantie de bonne exécution et, pour un attributaire hors zone, la validité de la contre-garantie bancaire.",
        function(){
          state.contractSigned=true; logit('Marché signé — '+win.o.name); save(); render();
        },"Signer le marché ?","Signer");
    });
  }

  if(!K.recoursActif && J===0) return;
  var nb=add(m,'div','note');
  add(nb,'strong',null,'Pourquoi ce verrou existe. ');
  nb.appendChild(document.createTextNode("Signer avant l'expiration du délai prive le soumissionnaire évincé de tout recours utile : à ce stade, l'annulation coûte bien plus cher que l'attente. Le blocage est technique et non contournable depuis l'interface — c'est précisément ce qui protège le client."));
}

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

var ROUTER={dashboard:vDashboard, notifs:vNotifs, roles:vRoles, comptes:vComptes, qa:vQA, clarifs:vClarifs, recours:vRecours, params:vParams, regles:vRegles, cdc:vCDC, dao:vDAO, criteres:vCriteres, portail:vPortail, reception:vReception,
  depouille:vDepouille, conformite:vConformite, evaluation:vEvaluation, decision:vDecision, pv:vPV, audit:vAudit};

/* Les écrans d'administration concernent l'organisation, pas la procédure : pas de pastille de phase. */
function isAdminView(id){ return VIEWS.some(function(v){ return v.id===id && v.grp==='Administration'; }); }
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
  renderHeader();
  var ph=phase(), chip=document.getElementById('phase-chip');
  chip.textContent=ph.k; chip.className='chip '+ph.c;
  chip.style.display = isAdminView(state.view) ? 'none' : '';
  var lbl=null;
  for(var i=0;i<VIEWS.length;i++) if(VIEWS[i].id===state.view) lbl=VIEWS[i].label;
  document.title = (lbl? lbl+' — ' : '')+'Marché+';
  var m=document.getElementById('main'); m.textContent='';
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
    MP.api('POST','/api/admin/reset',{}).then(function(){ return MP.api('GET','/api/state'); }).then(function(p){
      state=null; synced={}; applyServer(p,false); state.view='dashboard'; render(); toast('Démonstration réinitialisée.');
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
  stop:function(){ if(flushTimer) clearTimeout(flushTimer); state=null; synced={}; dirty=false; }
};
})();
