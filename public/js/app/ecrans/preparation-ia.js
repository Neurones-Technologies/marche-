/* Marché+ — Préparer le cahier des charges avec l'IA : à partir d'un document chargé (PDF, Word) ou d'une idée
   décrite en quelques lignes. Le serveur rédige une proposition (server/ia.js) ; l'acheteur la relit dans une
   fenêtre et choisit, section par section, ce qu'il reprend dans le formulaire. Rien n'est écrit sans son accord.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

UI.ia = null;
function etatIA(){
  var pid=state.procedure;
  if(!UI.ia || UI.ia.pid!==pid) UI.ia={ pid:pid, actif:null, onglet:'idee', tache:null, depuis:0, erreur:null, proposition:null, source:'', choix:{} };
  return UI.ia;
}

/* Carte « Préparer avec l'IA », en tête du cahier des charges tant qu'il n'est pas publié. */
function vCdcIA(m){
  var ia=etatIA();
  if(ia.actif===null){
    ia.actif=false;
    MP.api('GET',MP.url('/ia')).then(function(r){ ia.actif=!!r.actif; render(); }).catch(function(){});
    return;
  }
  // carte enveloppée : elle reste hors du sommaire et de la numérotation des sections du cahier des charges
  var k=add(add(m,'div'),'div','card'); k.style.marginBottom='18px';
  var ph=add(k,'div','panel-head'); add(ph,'span',null,'Préparer avec l’IA');
  add(ph,'span','chip c-violet','Proposition à relire');
  var b=add(k,'div','pad');
  if(!ia.actif){
    add(b,'p','muted','L’IA n’est pas configurée sur ce serveur : la clé ANTHROPIC_API_KEY manque dans sa configuration. Le formulaire ci-dessous reste disponible.');
    return;
  }
  var seg=add(b,'div','consult-modes');
  [['idee','Décrire votre besoin','En quelques phrases : l’IA rédige un cahier des charges complet.'],
   ['document','Importer un document','Un ancien dossier, des termes de référence, une note de besoin (PDF ou Word) : l’IA en reprend les informations.']].forEach(function(x){
    var o=add(seg,'button','consult-mode'+(ia.onglet===x[0]?' on':'')); o.type='button'; fk(o,'ia-'+x[0]);
    o.setAttribute('aria-pressed',ia.onglet===x[0]?'true':'false'); o.disabled=!!ia.tache;
    add(o,'strong',null,x[1]); add(o,'span',null,x[2]);
    o.addEventListener('click',function(){ ia.onglet=x[0]; ia.erreur=null; render(); });
  });
  if(ia.tache){
    var p=add(b,'p',null,(ia.source==='document'?'Lecture du document et rédaction de la proposition…':'Rédaction du cahier des charges…')+' '+ia.depuis+' s');
    p.setAttribute('role','status');
    add(b,'p','muted','Cela prend en général une à deux minutes. Vous pouvez continuer à travailler : la proposition s’ouvrira ici.');
    return;
  }
  if(ia.erreur){ var e=add(b,'div','warn'); add(e,'strong',null,'Proposition impossible. '); e.appendChild(document.createTextNode(ia.erreur)); e.style.marginBottom='12px'; }
  if(ia.onglet==='idee'){
    var lb=add(b,'label',null,'Votre besoin'); lb.setAttribute('for','ia-idee');
    var t=add(b,'textarea'); t.id='ia-idee'; t.rows=4; fk(t,'ia-idee-txt'); t.value=ia.idee||''; t.style.width='100%';
    t.placeholder='Ex. : renouveler le parc informatique du siège, 40 postes et 5 imprimantes réseau, installation et maintenance 3 ans, livraison avant mars.';
    t.addEventListener('input',function(){ ia.idee=t.value; });
    var go=add(add(b,'div','panel-foot'),'button','btn btn-primary','Rédiger le cahier des charges'); fk(go,'ia-rediger');
    go.addEventListener('click',function(){
      var v=String(ia.idee||'').trim();
      if(v.length<15){ toast('Décrivez votre besoin en quelques phrases.'); return; }
      lancerIA('idee', MP.api('POST',MP.url('/ia/idee'),{ idee:v }));
    });
  } else {
    var lf=add(b,'label',null,'Document (PDF ou Word .docx)'); lf.setAttribute('for','ia-doc');
    var f=add(b,'input'); f.id='ia-doc'; f.type='file'; f.accept='.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    f.addEventListener('change',function(){
      var fichier=f.files && f.files[0]; if(!fichier) return;
      lancerIA('document', MP.upload(MP.url('/ia/document'), fichier));
    });
  }
  add(b,'p','muted','La proposition s’affiche pour relecture : vous choisissez ce que vous reprenez. Le texte transmis est traité par le service d’IA d’Anthropic.').style.marginTop='10px';
}

/* Demande lancée : le serveur répond tout de suite avec une tâche, dont on suit l'état. */
function lancerIA(source, demande){
  var ia=etatIA();
  ia.erreur=null; ia.source=source; ia.tache='…'; ia.depuis=0; render();
  demande.then(function(r){ ia.tache=r.tache; suivreIA(ia, r.tache); })
    .catch(function(e){ ia.tache=null; ia.erreur=e.message||'Erreur.'; render(); });
}
function suivreIA(ia, id){
  setTimeout(function(){
    if(UI.ia!==ia || ia.tache!==id) return; // procédure changée entre-temps
    MP.api('GET',MP.url('/ia/taches/'+encodeURIComponent(id))).then(function(r){
      if(r.etat==='en_cours'){ ia.depuis=r.depuis; if(state.view==='cdc') render(); suivreIA(ia,id); return; }
      ia.tache=null; ia.proposition=r.proposition; ia.choix=choixParDefaut(r.proposition);
      render(); ouvrirPropositionIA();
    }).catch(function(e){ ia.tache=null; ia.erreur=e.message||'Erreur.'; render(); });
  }, 2000);
}

/* Sections de la proposition : ce que chacune remplace dans le formulaire. */
var SECTIONS_IA=[
  { id:'ident', lab:'1 · Identification', champs:[['objet','Objet du marché'],['autorite','Autorité contractante'],['procedure','Type de procédure'],['langue','Langue de soumission'],['deviseSoumission','Devise de soumission'],['ouverture','Date d’ouverture des plis']] },
  { id:'lots', lab:'2 · Allotissement' },
  { id:'specs', lab:'3 · Spécifications techniques' },
  { id:'conditions', lab:'4 · Conditions administratives et financières', champs:[['caution','Caution de soumission (%)'],['garantieMin','Garantie minimale (mois)'],['delaiMax','Délai d’exécution maximal (jours)'],['penalite','Pénalité de retard (‰ par jour)'],['avance','Avance de démarrage (%)']] },
  { id:'fiscal', lab:'5 · Régime fiscal et douanier', champs:[['tva','TVA (%)'],['retenueNonResident','Retenue à la source — non-résidents (%)'],['douaneACharge','Droits et taxes à l’importation à la charge de']] },
  { id:'pref', lab:'6 · Préférence communautaire', champs:[['prefActive','Marge de préférence'],['prefTaux','Taux (%)']] }
];
function sectionRemplie(p, s){
  if(s.id==='lots') return p.lots.length>0;
  if(s.id==='specs') return p.specs.length>0;
  return s.champs.some(function(c){ return p[c[0]]!=null && p[c[0]]!==''; });
}
function choixParDefaut(p){ var o={}; SECTIONS_IA.forEach(function(s){ o[s.id]=sectionRemplie(p,s); }); return o; }
function valeurIA(k, v){
  if(v==null || v==='') return '—';
  if(k==='prefActive') return v?'Activée':'Désactivée';
  return String(v);
}

function ouvrirPropositionIA(){
  ouvrirFenetre('Proposition de cahier des charges', function(corps, pied){
    var ia=etatIA(), p=ia.proposition; if(!p) return false;
    if(p.resume) add(corps,'p',null,p.resume);
    if(p.aVerifier.length){
      var w=add(corps,'div','warn'); add(w,'strong',null,'À vérifier en priorité');
      var u=add(w,'ul'); p.aVerifier.forEach(function(x){ add(u,'li',null,(x.champ?x.champ+' : ':'')+x.raison); });
    }
    if(p.manquants.length){
      var n=add(corps,'div','note'); add(n,'strong',null,'Informations à compléter');
      var u2=add(n,'ul'); p.manquants.forEach(function(x){ add(u2,'li',null,x); });
    }
    add(corps,'p','muted','Cochez les sections à reprendre : elles remplacent le contenu actuel du formulaire. Les autres restent inchangées.').style.marginTop='12px';
    var liste=add(corps,'div','consult-liste'); liste.style.maxHeight='none';
    SECTIONS_IA.forEach(function(s){
      var vide=!sectionRemplie(p,s);
      var l=add(liste,'label','consult-choix'+(ia.choix[s.id]?' on':'')); l.style.alignItems='flex-start';
      var c=add(l,'input'); c.type='checkbox'; c.checked=!!ia.choix[s.id]; c.disabled=vide; fk(c,'ia-sec-'+s.id);
      c.addEventListener('change',function(){ ia.choix[s.id]=c.checked; l.classList.toggle('on',c.checked); });
      var d=add(l,'div'); add(d,'strong',null,s.lab);
      if(vide){ add(d,'span','muted','Rien de proposé.'); return; }
      if(s.id==='lots'){ var ul=add(d,'ul'); p.lots.forEach(function(x){ add(ul,'li',null,x.nom+(x.montant?' — '+x.montant:'')); }); return; }
      if(s.id==='specs'){ var us=add(d,'ul'); p.specs.forEach(function(x){ add(us,'li',null,x); }); return; }
      s.champs.forEach(function(ch){ if(p[ch[0]]==null || p[ch[0]]==='') return; add(d,'span','muted',ch[1]+' : '+valeurIA(ch[0],p[ch[0]])); });
    });
    add(pied,'button','btn btn-ghost','Fermer').addEventListener('click',fermerFenetre);
    var ok=add(pied,'button','btn btn-primary','Reprendre la sélection'); fk(ok,'ia-reprendre');
    ok.addEventListener('click',function(){ appliquerIA(p, ia.choix); });
  }, { large:true });
}

/* Reprend les sections choisies dans le cahier des charges (même chemin d'enregistrement que la saisie). */
function appliquerIA(p, choix){
  var c=state.cdc, faites=[];
  if(c.cdcPublie){ toast('Le cahier des charges est publié : il ne peut plus être remplacé.'); return; }
  SECTIONS_IA.forEach(function(s){
    if(!choix[s.id] || !sectionRemplie(p,s)) return;
    if(s.id==='lots') c.lots=p.lots.map(function(x,i){ return { id:'l'+Date.now().toString(36)+i, nom:x.nom, montant:x.montant||'— XOF' }; });
    else if(s.id==='specs') c.specs=p.specs.slice();
    else s.champs.forEach(function(ch){
      var k=ch[0], v=p[k]; if(v==null || v==='') return;
      if(k==='prefActive' && v && !CADRE().preferenceAutorisee) return; // le profil ne l'autorise pas
      if(k==='prefTaux') v=Math.max(0,Math.min(CADRE().preferenceTauxMax,Number(v)||0));
      c[k]=v;
    });
    faites.push(s.lab.replace(/^\d+ · /,''));
  });
  if(!faites.length){ toast('Aucune section cochée.'); return; }
  logit('Cahier des charges complété à partir de la proposition de l’IA — '+faites.join(', '));
  fermerFenetre(); save(); render();
  toast('Proposition reprise : relisez le formulaire avant de publier.');
}
