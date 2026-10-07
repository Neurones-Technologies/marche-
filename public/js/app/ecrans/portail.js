/* Marché+ — Écran Portail de dépôt (soumissionnaire).
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

var PIECES_OK=false;
function taille(n){ return n>=1048576 ? (n/1048576).toFixed(1).replace('.',',')+' Mo' : Math.max(1,Math.round(n/1024))+' Ko'; }
/* Temps restant avant l'échéance de dépôt, en clair : « dans 7 j 23 h », « dans 3 h 05 ». */
function delaiRestant(ms){
  if(ms==null) return '';
  var min=Math.floor(ms/60000), j=Math.floor(min/1440), h=Math.floor((min%1440)/60), mn=min%60;
  return 'dans '+(j ? j+' j '+h+' h' : (h ? h+' h '+String(mn).padStart(2,'0') : mn+' min'));
}
/* Documents de l'offre elle-même (le serveur les rattache au pli au dépôt). */
var DOCS_OFFRE = [
  { id:'memoire', label:'Mémoire technique', aide:'Méthodologie, organisation, moyens et planning proposés (PDF ou Word)', accept:'.pdf,.docx' },
  { id:'bordereau', label:'Bordereau des prix', aide:'Détail chiffré des prix par lot et par poste (Excel ou PDF)', accept:'.xlsx,.pdf' }
];
/* Une ligne de fichier du dépôt : libellé, aide, fichier joint (nom, taille, empreinte), joindre, remplacer, retirer. */
function ligneFichier(parent, doc, aide, sinon){
  var d=state.draft, meta=(d.files||{})[doc.id], on=!!meta;
  var row=add(parent,'div','docline');
  var lf=add(row,'div');
  add(lf,'div',null,doc.label).style.fontWeight='600';
  add(lf,'div','muted',aide);
  if(on) add(lf,'div','muted','Fichier : '+meta.name+' ('+taille(meta.size)+') · empreinte '+meta.sha256.slice(0,12)+'…').title=meta.sha256;
  else if(sinon) add(lf,'div','muted',sinon);
  var act=add(row,'div'); act.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
  var inp=el('input'); inp.type='file'; inp.accept=doc.accept||'.pdf,.png,.jpg,.jpeg,.docx,.xlsx'; inp.hidden=true; inp.setAttribute('aria-label','Choisir le fichier : '+doc.label);
  act.appendChild(inp);
  var btn=add(act,'button','pill'+(on?' on':''), on?'Remplacer le fichier':'Joindre le fichier'); fk(btn,'doc-'+doc.id);
  btn.addEventListener('click',function(){ inp.click(); });
  inp.addEventListener('change',function(){
    var f=inp.files&&inp.files[0]; if(!f) return;
    if(f.size>10*1024*1024){ toast('Fichier trop volumineux (10 Mo maximum).'); return; }
    btn.disabled=true; btn.textContent='Envoi…';
    MP.upload(MP.url('/files?doc=')+encodeURIComponent(doc.id), f).then(function(m){
      d.files=d.files||{}; d.files[doc.id]=m; d.docs[doc.id]=true; toast('Fichier joint : '+doc.label+'.'); save(); render();
    }).catch(function(e){ toast(e.message||'Envoi impossible.'); render(); });
  });
  if(on){
    var rm=add(act,'button','btn btn-ghost btn-sm','Retirer');
    rm.setAttribute('aria-label','Retirer le fichier : '+doc.label);
    rm.addEventListener('click',function(){
      MP.api('DELETE',MP.url('/files/'+meta.id)).then(function(){ delete d.files[doc.id]; d.docs[doc.id]=false; save(); render(); })
        .catch(function(e){ toast(e.message||'Suppression impossible.'); });
    });
  }
}
function vPortail(m){
  var c=state.cdc, d=state.draft;
  if(!d.files) d.files={};
  if(!PIECES_OK){
    PIECES_OK=true;
    MP.api('GET',MP.url('/files/mine')).then(function(list){
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
  add(l,'h1',null,c.objet);
  var ech=R.echeanceDepot(c), reste=ech ? ech-Date.now() : null, clos=reste!=null && reste<=0;
  add(h,'span','chip '+(clos?'c-red':'c-amber'), clos ? 'Dépôts clos depuis le '+dateLongue(c.ouverture)+' à 10 h 00' : 'Clôture '+delaiRestant(reste)+' — le '+dateLongue(c.ouverture)+' à 10 h 00');
  if(clos){ var fin=add(m,'div','warn'); fin.style.marginBottom='18px'; add(fin,'strong',null,'Date limite dépassée. '); fin.appendChild(document.createTextNode('Les dépôts sont clos : aucune offre ni pièce ne peut plus être transmise.')); }

  vPortailResultat(m); // dès l'attribution prononcée

  /* Dossier à retirer (carte enveloppée : hors de la numérotation des sections du dépôt) */
  var k0=add(add(m,'div'),'div','card'); k0.style.marginBottom='18px';
  add(k0,'div','panel-head','Dossier d\u2019appel d\u2019offres');
  var b0=add(k0,'div','pad');
  add(b0,'p','muted','Avis, règlement de la consultation, clauses administratives et techniques, bordereau des prix et formulaires.');
  var vd=add(b0,'button','btn btn-primary btn-sm','Consulter le dossier'); vd.style.marginTop='10px'; fk(vd,'portail-dossier');
  vd.addEventListener('click',function(){ go('cdc'); });
  vPortailQuestions(m);

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
  // un montant par lot soumissionné ; le montant de l'offre en est la somme
  d.prixLots=d.prixLots||{};
  if(d.lots.length){
    var fl=add(p2,'div','frm'); fl.style.marginBottom='12px';
    c.lots.filter(function(l){ return d.lots.indexOf(l.id)>=0; }).forEach(function(l){
      fld(fl,'Prix HT — '+l.nom+' ('+d.devise+')','input',d.prixLots[l.id]||'',function(v){ d.prixLots[l.id]=v; },'number');
    });
  }
  d.montant=d.lots.reduce(function(t,id){ return t+(Number(d.prixLots[id])||0); },0) || '';
  var tot=add(p2,'div','prix-total'); add(tot,'span',null,'Montant total HT de l’offre');
  add(tot,'strong',null, d.montant ? sep(d.montant)+' '+d.devise : '—');
  var f2=add(p2,'div','frm');
  fld(f2,"Délai d'exécution (jours)",'input',d.delai,function(v){ d.delai=v; },'number');
  fld(f2,'Garantie proposée (mois)','input',d.garantie,function(v){ d.garantie=v; },'number');
  fld(f2,'Nombre de références similaires','input',d.refsCount,function(v){ d.refsCount=v; },'number');
  // documents de l'offre : ils accompagnent les montants et sont transmis à l'acheteur avec le pli
  add(p2,'div','stat-k','Documents de l’offre').style.margin='18px 0 4px';
  DOCS_OFFRE.forEach(function(x){ ligneFichier(p2, x, x.aide, ''); });

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
  // pièces validées au référencement : elles tiennent lieu de pièce du dossier (le serveur les reprend au dépôt)
  var mp=state.monPartenaire, couvertes=(mp && mp.statut==='reference' && mp.piecesValables) || {};
  req.forEach(function(doc){
    var cov=couvertes[R.pieceReferencement(doc,(state.formulaireReferencement||{}).pieces)];
    ligneFichier(b3, doc, doc.id==='caution' ? 'Montant : '+c.caution+' % du montant de l’offre' :
      (doc.id==='contreGarantie' ? 'Émise ou contre-garantie par un établissement agréé dans l’UEMOA' :
      (doc.id==='traduction' ? 'Traduction française certifiée conforme' : 'Pièce exigée au règlement de consultation')),
      cov ? 'Couverte par votre référencement : '+cov.nom+(cov.expire?' (valable jusqu\u2019au '+cov.expire+')':'')+'. Joindre un fichier ici remplace cette pièce pour cette offre.' : '');
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
  if(d.lots.some(function(id){ return !(Number((d.prixLots||{})[id])>0); })) errs.push('Prix manquant pour un lot soumissionné.');
  if(!Number(d.montant)) errs.push('Montant total non renseigné.');
  if(!Number(d.delai)) errs.push("Délai d'exécution non renseigné.");
  if(!d.lots.length) errs.push('Aucun lot sélectionné.');
  req.forEach(function(x){ if(!d.docs[x.id] && !couvertes[R.pieceReferencement(x,(state.formulaireReferencement||{}).pieces)]) errs.push('Pièce manquante : '+x.label+'.'); });
  if(clos) errs.push('La date limite de dépôt est dépassée.');
  DOCS_OFFRE.forEach(function(x){ if(!(d.files||{})[x.id]) warns.push(x.label+' non joint : l’acheteur ne pourra juger votre offre que sur les montants déclarés.'); });
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
    var pl={}; d.lots.forEach(function(id){ pl[id]=Number(d.prixLots[id]); });
    MP.api('POST',MP.url('/offers'),{ name:d.name.trim(), iso:d.iso, devise:d.devise, montant:Number(d.montant), prixLots:pl, delai:Number(d.delai)||0,
      garantie:Number(d.garantie)||0, refsCount:Number(d.refsCount)||0, lots:d.lots, docs:d.docs }).then(function(r){
      var offer=r.offer, receipt=r.receipt;
      SEED_OFFERS.push(offer); state.quality[offer.id]={metho:offer.aiMetho, refs:offer.aiRefs};
      synced.offers=JSON.stringify(state.offers); synced.quality=JSON.stringify(state.quality);
      state.receipts.push(receipt); // la notification « dépôt reçu » est émise par le serveur
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

  vPortailSuivi(m); // demandes de clarification et réclamations
}
