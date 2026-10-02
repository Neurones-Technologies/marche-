/* Marché+ — Écran Portail de dépôt (soumissionnaire).
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

var PIECES_OK=false;
function taille(n){ return n>=1048576 ? (n/1048576).toFixed(1).replace('.',',')+' Mo' : Math.max(1,Math.round(n/1024))+' Ko'; }
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
  // pièces validées au référencement : elles tiennent lieu de pièce du dossier (le serveur les reprend au dépôt)
  var mp=state.monPartenaire, couvertes=(mp && mp.statut==='reference' && mp.piecesValables) || {};
  req.forEach(function(doc){
    var meta=(d.files||{})[doc.id], on=!!meta, cov=couvertes[doc.id];
    var row=add(b3,'div','docline');
    var lf=add(row,'div');
    add(lf,'div',null,doc.label).style.fontWeight='600';
    add(lf,'div','muted', doc.id==='caution' ? 'Montant : '+c.caution+' % du montant de l’offre' :
      (doc.id==='contreGarantie' ? 'Émise ou contre-garantie par un établissement agréé dans l’UEMOA' :
      (doc.id==='traduction' ? 'Traduction française certifiée conforme' : 'Pièce exigée au règlement de consultation')));
    if(on) add(lf,'div','muted','Fichier : '+meta.name+' ('+taille(meta.size)+') · empreinte '+meta.sha256.slice(0,12)+'…').title=meta.sha256;
    else if(cov) add(lf,'div','muted','Couverte par votre référencement : '+cov.nom+(cov.expire?' (valable jusqu\u2019au '+cov.expire+')':'')+'. Joindre un fichier ici remplace cette pièce pour cette offre.');
    var act=add(row,'div'); act.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    var inp=el('input'); inp.type='file'; inp.accept='.pdf,.png,.jpg,.jpeg,.docx,.xlsx'; inp.hidden=true; inp.setAttribute('aria-label','Choisir le fichier : '+doc.label);
    act.appendChild(inp);
    var btn=add(act,'button','pill'+(on?' on':''), on?'Remplacer le fichier':'Joindre la pièce'); fk(btn,'doc-'+doc.id);
    btn.addEventListener('click',function(){ inp.click(); });
    inp.addEventListener('change',function(){
      var f=inp.files&&inp.files[0]; if(!f) return;
      if(f.size>10*1024*1024){ toast('Fichier trop volumineux (10 Mo maximum).'); return; }
      btn.disabled=true; btn.textContent='Envoi…';
      MP.upload(MP.url('/files?doc=')+encodeURIComponent(doc.id), f).then(function(m){
        d.files=d.files||{}; d.files[doc.id]=m; d.docs[doc.id]=true; toast('Pièce jointe enregistrée.'); save(); render();
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
  req.forEach(function(x){ if(!d.docs[x.id] && !couvertes[x.id]) errs.push('Pièce manquante : '+x.label+'.'); });
  if(CADRE().depotReserveReferences && !(mp && mp.statut==='reference'))
    errs.push('Dépôt réservé aux partenaires référencés : complétez et soumettez votre dossier dans « Mon référencement ».');
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
    MP.api('POST',MP.url('/offers'),{ name:d.name.trim(), iso:d.iso, devise:d.devise, montant:Number(d.montant), delai:Number(d.delai)||0,
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
