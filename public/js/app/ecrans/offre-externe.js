/* Marché+ — Offre reçue hors plateforme (pli papier numérisé, document reçu par courriel). L'acheteur charge le
   document et indique quand il a été reçu ; l'IA en lit les informations (server/ia.js, tâche de fond), avec une
   confiance par valeur ; l'acheteur relit, corrige et enregistre (POST /offers/externe). Une valeur sous le seuil de
   confiance, non corrigée, reste à confirmer au dépouillement ; les pièces administratives sont à contrôler sur le pli.
   Sans IA configurée, le document est joint et l'offre se saisit à la main.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

UI.offreExterne = null;
/* Valeur d'un champ de la lecture IA : les nombres en chiffres seuls, le reste tel quel. */
function valeurLue(lecture, cle){ var c=lecture && lecture.champs[cle]; return c && c.valeur!=null ? String(c.valeur) : ''; }
function nombreLu(v){ var n=String(v||'').replace(/[^\d,.]/g,'').replace(/\s/g,'').replace(',','.'); return n && isFinite(Number(n)) ? String(Number(n)) : ''; }

function ouvrirOffreExterne(){
  var ia=etatIA();
  if(ia.actif===null){ ia.actif=false; MP.api('GET',MP.url('/ia')).then(function(r){ ia.actif=!!r.actif; dessinerFenetre(); }).catch(function(){}); }
  var maintenant=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
  var x=UI.offreExterne={ pid:state.procedure, etape:'fichier', fichierLocal:null, recuLe:maintenant, tache:null, depuis:0, erreur:null,
    fichier:null, lecture:null, v:{ lots:[], prixLots:{} }, confiances:{} };
  ouvrirFenetre('Offre reçue hors plateforme', function(c,p){
    if(UI.offreExterne!==x) return false;
    if(x.erreur){ var e=add(c,'div','warn'); e.style.marginBottom='12px'; add(e,'strong',null,'Opération impossible. '); e.appendChild(document.createTextNode(x.erreur)); }
    if(x.etape==='fichier') etapeFichierExterne(c,p,x);
    else if(x.etape==='lecture'){ var s=add(c,'p',null,'Lecture du document par l’IA… '+x.depuis+' s'); s.setAttribute('role','status'); add(c,'p','muted','Cela prend en général moins d’une minute.'); }
    else etapeSaisieExterne(c,p,x);
  }, { large:true });
}

/* Étape 1 : le document reçu et sa date de réception. */
function etapeFichierExterne(c,p,x){
  var ia=etatIA();
  add(c,'p','muted','Chargez le document de l’offre tel qu’il a été reçu (pli numérisé ou fichier reçu par courriel) : il est conservé avec son empreinte et rattaché à l’offre. '+
    (ia.actif ? 'L’IA en lit les informations ; vous les relisez avant d’enregistrer.' : 'L’IA n’est pas configurée : vous saisirez les informations à la main.'));
  var f=add(c,'div','frm');
  var w1=add(f,'div'); add(w1,'label',null,'Document de l’offre (PDF, Word, PNG ou JPEG)').setAttribute('for','ext-fichier');
  var inp=add(w1,'input'); inp.type='file'; inp.id='ext-fichier'; inp.accept='.pdf,.docx,.png,.jpg,.jpeg';
  if(x.fichierLocal) add(w1,'div','muted','Choisi : '+x.fichierLocal.name+' ('+taille(x.fichierLocal.size)+')');
  inp.addEventListener('change',function(){ x.fichierLocal=inp.files&&inp.files[0]||null; dessinerFenetre(); });
  var w2=add(f,'div'); add(w2,'label',null,'Reçue le').setAttribute('for','ext-recu');
  var dt=add(w2,'input'); dt.type='datetime-local'; dt.id='ext-recu'; dt.value=x.recuLe; fk(dt,'ext-recu');
  dt.addEventListener('change',function(){ x.recuLe=dt.value; });
  var ech=R.echeanceDepot(state.cdc);
  if(ech) add(c,'p','muted','Date limite de dépôt : '+dateLongue(state.cdc.ouverture)+' à 10 h 00. Un pli reçu après cette heure est écarté et ne s’enregistre pas.');
  var go=add(p,'button','btn btn-primary', ia.actif?'Lire le document avec l’IA':'Joindre et saisir'); fk(go,'ext-lire');
  go.disabled=!x.fichierLocal;
  go.addEventListener('click',function(){
    if(!x.fichierLocal) return;
    if(x.fichierLocal.size>10*1024*1024){ toast('Fichier trop volumineux (10 Mo maximum).'); return; }
    if(ech && new Date(x.recuLe).getTime()>ech){ x.erreur='Pli reçu après la date limite de dépôt : il est écarté et ne s’enregistre pas.'; dessinerFenetre(); return; }
    x.erreur=null; go.disabled=true;
    MP.upload(MP.url('/ia/offre-externe'),x.fichierLocal).then(function(r){
      if(r.fichier){ x.fichier=r.fichier; x.etape='saisie'; x.lecture=null; dessinerFenetre(); return; } // sans IA
      x.tache=r.tache; x.etape='lecture'; dessinerFenetre(); suivreOffreExterne(x,r.tache);
    }).catch(function(e){ go.disabled=false; x.erreur=e.message||'Envoi impossible.'; dessinerFenetre(); });
  });
}
function suivreOffreExterne(x,id){
  setTimeout(function(){
    if(UI.offreExterne!==x || x.tache!==id) return;
    MP.api('GET',MP.url('/ia/taches/'+encodeURIComponent(id))).then(function(r){
      if(r.etat==='en_cours'){ x.depuis=r.depuis; dessinerFenetre(); suivreOffreExterne(x,id); return; }
      x.tache=null; x.fichier=r.fichier; x.lecture=r.lecture; x.etape='saisie'; preremplirExterne(x); dessinerFenetre();
    }).catch(function(e){ x.tache=null; x.etape='fichier'; x.erreur=e.message||'Lecture impossible.'; dessinerFenetre(); });
  }, 2000);
}
/* Valeurs et confiances tirées de la lecture. */
function preremplirExterne(x){
  var L=x.lecture, v=x.v, cf=x.confiances;
  [['name','soumissionnaire'],['iso','pays'],['devise','devise'],['contact','contact'],['paiement','paiement'],['incoterm','incoterm'],['caution','caution']].forEach(function(k){
    v[k[0]]=valeurLue(L,k[1]); if(v[k[0]]) cf[k[0]==='name'?'nom':k[0]]=L.champs[k[1]].confiance;
  });
  v.iso=String(v.iso||'').toUpperCase().slice(0,2); v.devise=String(v.devise||'').toUpperCase().slice(0,3);
  [['montant','montant'],['delai','delai'],['garantie','garantie'],['validite','validite'],['refsCount','references']].forEach(function(k){
    v[k[0]]=nombreLu(valeurLue(L,k[1])); if(v[k[0]]) cf[k[0]]=L.champs[k[1]].confiance;
  });
  (L.lots||[]).forEach(function(l){ v.lots.push(l.id); v.prixLots[l.id]=nombreLu(l.montant); if(v.prixLots[l.id]) cf['lot:'+l.id]=l.confiance; });
}

/* Étape 2 : relecture et saisie. */
function etapeSaisieExterne(c,p,x){
  var v=x.v, cf=x.confiances, L=x.lecture, seuil=Number(state.seuils.confianceMin)||75;
  var tete=add(c,'div','fen-chips');
  chipCellule(tete,'Document : '+x.fichier.name+' ('+taille(x.fichier.size)+')','c-grey');
  chipCellule(tete, L ? 'Lu par l’IA — relisez chaque valeur' : 'Saisie à la main', L ? 'c-violet' : 'c-grey');
  if(L && (L.remarques||[]).length){
    var n=add(c,'div','note'); n.style.marginBottom='12px'; add(n,'strong',null,'Remarques de la lecture : ');
    var ul=add(n,'ul'); ul.style.margin='6px 0 0 18px'; L.remarques.forEach(function(r){ add(ul,'li',null,r); });
  }
  // un champ : libellé, confiance de lecture (sous le seuil : à confirmer), saisie qui la remet à 100
  function champ(parent, cle, lab, conf, type, val, poser){
    var w=add(parent,'div'), id='ext-'+cle.replace(':','-');
    var lb=add(w,'label',null,lab); lb.setAttribute('for',id);
    if(conf!=null){ var ch=add(lb,'span','conf'+(conf<seuil?' low':''),' '+conf+' %'); ch.title=conf<seuil?'Lecture incertaine : à vérifier sur le document (sera à confirmer au dépouillement si vous ne la corrigez pas)':'Confiance de lecture'; }
    var i=add(w,'input'); i.type=type||'text'; i.id=id; i.value=val||''; fk(i,id);
    i.addEventListener('change',function(){ poser(i.value); delete cf[cle]; });
    return i;
  }
  var f=add(c,'div','frm');
  champ(f,'nom','Raison sociale',cf.nom,'text',v.name,function(s){ v.name=s; });
  champ(f,'iso','Pays (code à deux lettres)',cf.iso,'text',v.iso,function(s){ v.iso=s.toUpperCase(); });
  var wd=add(f,'div'); add(wd,'label',null,'Devise').setAttribute('for','ext-devise');
  var sd=add(wd,'select'); sd.id='ext-devise'; fk(sd,'ext-devise');
  Object.keys(state.org.rates||{XOF:1}).forEach(function(k){ add(sd,'option',null,k).value=k; });
  sd.value=v.devise && (state.org.rates||{})[v.devise] ? v.devise : 'XOF'; v.devise=sd.value;
  sd.addEventListener('change',function(){ v.devise=sd.value; delete cf.devise; });
  champ(f,'contact','Contact',cf.contact,'text',v.contact,function(s){ v.contact=s; });

  add(c,'div','stat-k','Lots et prix HT').style.margin='16px 0 6px';
  (state.cdc.lots||[]).forEach(function(l){
    var row=add(c,'div','docline'), on=v.lots.indexOf(l.id)>=0;
    var lab=add(row,'label'); var cb=add(lab,'input'); cb.type='checkbox'; cb.checked=on; fk(cb,'ext-lot-'+l.id);
    lab.appendChild(document.createTextNode(' '+l.nom));
    cb.addEventListener('change',function(){ if(cb.checked) v.lots.push(l.id); else v.lots.splice(v.lots.indexOf(l.id),1); dessinerFenetre(); });
    if(on) champ(row,'lot:'+l.id,'Prix HT',cf['lot:'+l.id],'number',v.prixLots[l.id],function(s){ v.prixLots[l.id]=s; dessinerFenetre(); });
  });
  var avecLots=v.lots.length && v.lots.every(function(id){ return Number(v.prixLots[id])>0; });
  var f2=add(c,'div','frm'); f2.style.marginTop='12px';
  if(avecLots){ var w=add(f2,'div'); add(w,'label',null,'Montant total HT'); add(w,'strong',null,sep(v.lots.reduce(function(t,id){ return t+Number(v.prixLots[id]); },0))+' '+v.devise); }
  else champ(f2,'montant','Montant total HT',cf.montant,'number',v.montant,function(s){ v.montant=s; });
  champ(f2,'delai','Délai d’exécution (jours)',cf.delai,'number',v.delai,function(s){ v.delai=s; });
  champ(f2,'garantie','Garantie (mois)',cf.garantie,'number',v.garantie,function(s){ v.garantie=s; });
  champ(f2,'validite','Validité de l’offre (jours)',cf.validite,'number',v.validite,function(s){ v.validite=s; });
  champ(f2,'refsCount','Références similaires',cf.refsCount,'number',v.refsCount,function(s){ v.refsCount=s; });
  champ(f2,'caution','Caution de soumission',cf.caution,'text',v.caution,function(s){ v.caution=s; });
  champ(f2,'paiement','Conditions de paiement',cf.paiement,'text',v.paiement,function(s){ v.paiement=s; });
  champ(f2,'incoterm','Incoterm',cf.incoterm,'text',v.incoterm,function(s){ v.incoterm=s; });

  // valeurs qui deviennent des champs à confirmer au dépouillement (montant, prix par lot, délai, garantie, validité, caution)
  var incertains=Object.keys(cf).filter(function(k){ return cf[k]<seuil && (/^lot:/.test(k) ? v.lots.indexOf(k.slice(4))>=0 && avecLots : ['delai','garantie','validite','caution'].indexOf(k)>=0 || (k==='montant' && !avecLots)); }).length;
  add(p,'span','muted', incertains ? incertains+' valeur(s) incertaine(s) non corrigée(s) : à confirmer au dépouillement.' : 'Les pièces administratives restent à contrôler sur le pli au dépouillement.');
  var ok=add(p,'button','btn btn-primary','Enregistrer l’offre'); fk(ok,'ext-enregistrer');
  ok.addEventListener('click',function(){
    var conf={}; Object.keys(cf).forEach(function(k){ conf[k]=cf[k]; });
    var pl={}; v.lots.forEach(function(id){ pl[id]=Number(v.prixLots[id]); });
    ok.disabled=true;
    MP.api('POST',MP.url('/offers/externe'),{ fichier:x.fichier.id, recuLe:new Date(x.recuLe).toISOString(), lecture:L?'ia':'manuelle',
      name:String(v.name||'').trim(), iso:String(v.iso||'').trim(), devise:v.devise, montant:Number(v.montant)||0, prixLots:avecLots?pl:null, lots:v.lots,
      delai:v.delai, garantie:v.garantie, validite:v.validite, refsCount:v.refsCount, contact:v.contact, paiement:v.paiement, incoterm:v.incoterm, caution:v.caution,
      confiances:conf, remarques:L?L.remarques:[] }).then(function(r){
      UI.offreExterne=null; fermerFenetre(); toast('Offre de '+r.offer.name+' enregistrée.'); // journalisée par le serveur
      return relireEtat();
    }).catch(function(e){ ok.disabled=false; x.erreur=e.message||'Enregistrement impossible.'; dessinerFenetre(); });
  });
}
