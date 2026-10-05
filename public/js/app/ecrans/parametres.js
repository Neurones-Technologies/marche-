/* Marché+ — Écran Paramètres (dont le cadre réglementaire).
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

/* ============ Paramètres ============ */
function vParams(m){
  if(!can('params.edit')) return denyBox(m,'params.edit');
  var o=state.org, sx=state.seuils;
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Paramètres');

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
  champ(f1,'Raison sociale',o.nom,function(v){ o.nom=v; if(state.cdc) state.cdc.autorite=v; logit('Raison sociale modifiée'); });
  champ(f1,'Pays',o.pays,function(v){ o.pays=v; });
  champ(f1,'Ville',o.ville,function(v){ o.ville=v; });
  champ(f1,'Initiales (badge)',o.initiales,function(v){ o.initiales=v.slice(0,3).toUpperCase(); });
  champ(f1,'Devise pivot',o.devisePivot,function(v){ o.devisePivot=v.toUpperCase(); },'select',[['XOF','Franc CFA (XOF)'],['XAF','Franc CFA CEMAC (XAF)'],['GHS','Cedi (GHS)'],['NGN','Naira (NGN)']]);
  champ(f1,"Couleur d'accent",o.accent,function(v){ o.accent=v; logit('Couleur d\u2019accent modifiée'); },'color');
  champ(f1,'Verrouillage après inactivité',String(o.verrouillageMinutes||15),function(v){ o.verrouillageMinutes=Number(v); logit('Verrouillage après '+v+' minutes d\u2019inactivité'); },'select',
    [['5','5 minutes'],['10','10 minutes'],['15','15 minutes'],['30','30 minutes'],['60','1 heure']]);

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
  add(k4,'div','panel-head','4 · Pièces exigées dans une offre');
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
  add(f4b,'span','muted','Pièces du dossier de candidature à chaque appel d\u2019offres : le contrôle de conformité et le dépôt des offres suivent ce référentiel. Les pièces du référencement des partenaires se règlent à la section 10.');
  add(f4b,'button','btn btn-ghost btn-sm','+ Ajouter une pièce').addEventListener('click',function(){
    state.docDefs.push({id:'d'+Date.now(), label:'Nouvelle pièce exigée', scope:'tous'});
    SEED_OFFERS.forEach(function(oo){ oo.docs['d'+0]=true; });
    logit('Pièce ajoutée au référentiel'); save(); render();
  });

  var k5=add(m,'div','card'); k5.style.marginTop='18px';
  // sans procédure ouverte (espace neuf) : le circuit par défaut des appels d'offres, que chaque nouvelle procédure reprend
  var sansProc=!avecProcedure();
  if(sansProc && !Array.isArray(state.circuitModele)) state.circuitModele=[];
  var circ = sansProc ? state.circuitModele : state.approvals;
  add(k5,'div','panel-head', sansProc ? '5 · Circuit d’approbation par défaut des appels d’offres' : '5 · Circuit d’approbation de la procédure '+REF());
  var b5=add(k5,'div','pad');
  var rk=Object.keys(state.roles);
  circ.forEach(function(a,i){
    var row=add(b5,'div','docline');
    var lf=add(row,'div'); lf.style.flex='1 1 240px';
    var ti=add(lf,'input'); ti.type='text'; ti.value=a.role; ti.style.width='100%';
    ti.setAttribute('aria-label','Intitulé du niveau'); fk(ti,'appr-lab-'+i);
    ti.addEventListener('change',function(){ a.role=ti.value; save(); });
    var wi=add(lf,'input'); wi.type='text'; wi.value=a.who; wi.style.cssText='width:100%;margin-top:6px';
    wi.setAttribute('aria-label','Titulaire du niveau'); fk(wi,'appr-who-'+i);
    wi.addEventListener('change',function(){ a.who=wi.value; save(); });
    var opts=add(lf,'div'); opts.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:6px';
    var se=add(opts,'input'); se.type='number'; se.min='0'; se.step='1000000'; se.placeholder='Seuil (XOF), facultatif';
    se.value=Number(a.seuil)>0?a.seuil:''; se.style.flex='1 1 160px';
    se.setAttribute('aria-label','Montant à partir duquel ce niveau intervient'); fk(se,'appr-seuil-'+i);
    se.addEventListener('change',function(){ var v=Number(se.value); if(v>0) a.seuil=v; else delete a.seuil; logit('Seuil du niveau « '+a.role+' » : '+(v>0?xof(v):'aucun')); save(); render(); });
    var sr=add(opts,'select'); sr.style.flex='1 1 160px';
    sr.setAttribute('aria-label','Rôle réservé pour ce niveau'); fk(sr,'appr-role-'+i);
    add(sr,'option',null,'Toute personne habilitée').value='';
    rk.forEach(function(r){ var op=add(sr,'option',null,'Réservé : '+state.roles[r].lab); op.value=r; });
    sr.value=a.roleId||'';
    sr.addEventListener('change',function(){ if(sr.value) a.roleId=sr.value; else delete a.roleId; save(); render(); });
    var up=add(row,'button','icon-btn','↑'); up.setAttribute('aria-label','Remonter ce niveau');
    up.disabled = i===0;
    up.addEventListener('click',function(){
      var t=circ[i-1]; circ[i-1]=circ[i]; circ[i]=t;
      logit('Ordre du circuit d\u2019approbation modifié'); save(); render();
    });
    var del=add(row,'button','icon-btn','×'); del.setAttribute('aria-label','Supprimer ce niveau');
    del.addEventListener('click',function(){
      var nmin=Math.max(1,CADRE().niveauxApprobationMin);
      if(circ.length<=nmin){ toast('Le profil réglementaire exige au moins '+nmin+' niveau(x) d’approbation.'); return; }
      ask('Ce niveau de validation disparaîtra du circuit et du procès-verbal.', function(){
        circ.splice(i,1); logit('Niveau d\u2019approbation supprimé : '+a.role); save(); render();
      },'Supprimer « '+a.role+' » ?','Supprimer');
    });
  });
  var f5=add(k5,'div','panel-foot');
  add(f5,'span','muted',circ.length+' niveau(x) configuré(s). L\u2019ordre détermine la séquence d\u2019approbation ; un niveau avec seuil n\u2019intervient qu\u2019à partir de ce montant (offre classée première, en XOF). Une nouvelle procédure part du circuit par défaut.');
  if(!sansProc) add(f5,'button','btn btn-ghost btn-sm','Enregistrer comme circuit par défaut').addEventListener('click',function(){
    state.circuitModele=circ.map(function(a){ var e={role:a.role, who:a.who}; if(Number(a.seuil)>0) e.seuil=Number(a.seuil); if(a.roleId) e.roleId=a.roleId; return e; });
    logit('Circuit d\u2019approbation par défaut : '+state.circuitModele.map(function(a){ return a.role; }).join(' → ')); save(); render();
  });
  add(f5,'button','btn btn-ghost btn-sm','+ Ajouter un niveau').addEventListener('click',function(){
    circ.push(sansProc ? {role:'Nouveau niveau de validation', who:'À désigner'} : {role:'Nouveau niveau de validation', who:'À désigner', done:false});
    logit('Niveau d\u2019approbation ajouté'); save(); render();
  });

  var k6=add(m,'div','card'); k6.style.marginTop='18px';
  add(k6,'div','panel-head','6 · Messagerie');
  var f6=add(add(k6,'div','pad'),'div','frm');
  champ(f6,'Adresse expéditrice',state.mailFrom,function(v){ state.mailFrom=v; });
  champ(f6,'Domaine des destinataires',state.mailSuffix,function(v){ state.mailSuffix=v; });
  vParamsCadre(m,o);
  vParamsCircuitOrg(m,'circuitBesoin','8 · Circuit de validation des demandes d’achat','Une demande d’achat suit ce circuit à sa soumission ; un niveau avec seuil n\u2019intervient qu\u2019à partir de ce budget. Le demandeur ne valide jamais sa propre demande.');
  vParamsCircuitOrg(m,'circuitReferencement','9 · Parcours de référencement des partenaires','Un dossier de référencement suit ces étapes ; les pièces déposées sont validées au dernier niveau.');
  vParamsFormulaire(m);
  vParamsInscription(m,o);
  vParamsCircuitOrg(m,'circuitCommande','12 · Circuit de validation des bons de commande','Une commande suit ce circuit avant émission ; un niveau avec seuil n\u2019intervient qu\u2019à partir de ce montant (en XOF). Celui qui établit la commande ne la valide pas.');
  vParamsEvaluation(m);
  var kc=add(m,'div','card'); kc.style.marginTop='18px';
  add(kc,'div','panel-head','14 · Numérotation des bons de commande');
  var fc=add(add(kc,'div','pad'),'div','frm');
  champ(fc,'Préfixe des numéros',o.prefixeCommande||'BC',function(v){ o.prefixeCommande=String(v).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)||'BC'; logit('Préfixe des bons de commande : '+o.prefixeCommande); });
  add(add(kc,'div','panel-foot'),'span','muted','Numéros continus et sans trou, attribués par le serveur à l\u2019émission : '+(o.prefixeCommande||'BC')+'-'+new Date().getFullYear()+'-0001, puis 0002…');
  add(add(k6,'div','panel-foot'),'span','muted','Aucun message n\u2019est réellement expédié dans cette maquette : la boîte d\u2019envoi restitue ce qui partirait.');
}

/* Cadre réglementaire : profil par défaut et réglages du client, dans les bornes du profil (profils.js). */
function vParamsCadre(m,o){
  var P=MPProfils, pid=R.profilId({ cdc:state.cdc||{}, org:o }), prof=P.profil(pid);
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

/* Circuit d'organisation (besoins, référencement) : même moteur que le circuit d'approbation de l'attribution. */
function vParamsCircuitOrg(m, cle, titre, note){
  var c=state[cle]=state[cle]||[];
  var k=add(m,'div','card'); k.style.marginTop='18px';
  add(k,'div','panel-head',titre);
  var b=add(k,'div','pad');
  var rk=Object.keys(state.roles);
  c.forEach(function(a,i){
    var row=add(b,'div','docline');
    var lf=add(row,'div'); lf.style.flex='1 1 240px';
    var ti=add(lf,'input'); ti.type='text'; ti.value=a.role; ti.style.width='100%';
    ti.setAttribute('aria-label','Intitulé du niveau'); fk(ti,cle+'-lab-'+i);
    ti.addEventListener('change',function(){ a.role=ti.value; save(); });
    var wi=add(lf,'input'); wi.type='text'; wi.value=a.who||''; wi.style.cssText='width:100%;margin-top:6px';
    wi.setAttribute('aria-label','Titulaire du niveau'); fk(wi,cle+'-who-'+i);
    wi.addEventListener('change',function(){ a.who=wi.value; save(); });
    var opts=add(lf,'div'); opts.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:6px';
    var se=add(opts,'input'); se.type='number'; se.min='0'; se.step='1000000'; se.placeholder='Seuil (XOF), facultatif';
    se.value=Number(a.seuil)>0?a.seuil:''; se.style.flex='1 1 160px';
    se.setAttribute('aria-label','Montant à partir duquel ce niveau intervient'); fk(se,cle+'-seuil-'+i);
    se.addEventListener('change',function(){ var v=Number(se.value); if(v>0) a.seuil=v; else delete a.seuil; save(); render(); });
    var sr=add(opts,'select'); sr.style.flex='1 1 160px';
    sr.setAttribute('aria-label','Rôle réservé pour ce niveau'); fk(sr,cle+'-role-'+i);
    add(sr,'option',null,'Toute personne habilitée').value='';
    rk.forEach(function(r){ var op=add(sr,'option',null,'Réservé : '+state.roles[r].lab); op.value=r; });
    sr.value=a.roleId||'';
    sr.addEventListener('change',function(){ if(sr.value) a.roleId=sr.value; else delete a.roleId; save(); render(); });
    var del=add(row,'button','icon-btn','×'); del.setAttribute('aria-label','Supprimer ce niveau');
    del.disabled=c.length<=1;
    del.addEventListener('click',function(){ c.splice(i,1); logit(titre.replace(/^\d+ · /,'')+' — niveau supprimé : '+a.role); save(); render(); });
  });
  var f=add(k,'div','panel-foot');
  add(f,'span','muted',note);
  add(f,'button','btn btn-ghost btn-sm','+ Ajouter un niveau').addEventListener('click',function(){
    c.push({role:'Nouveau niveau de validation', who:'À désigner'}); logit(titre.replace(/^\d+ · /,'')+' — niveau ajouté'); save(); render();
  });
}

/* Évaluation des partenaires (module 5) : poids des critères (total 100), seuil d'alerte, retard plafond. */
function vParamsEvaluation(m){
  var e=state.evaluationPartenaires=state.evaluationPartenaires||{criteres:{delais:30,conformite:30,completude:20,qualite:20},seuilAlerte:60,plafondRetardJours:30};
  var k=add(m,'div','card'); k.style.marginTop='18px';
  var ph=add(k,'div','panel-head'); add(ph,'span',null,'13 · Évaluation des partenaires');
  var somme=['delais','conformite','completude','qualite'].reduce(function(t,x){ return t+Number(e.criteres[x]||0); },0);
  add(ph,'span','chip '+(somme===100?'c-green':'c-red'),'Total des poids : '+somme);
  var f=add(add(k,'div','pad'),'div','frm');
  function nb(lab, val, cb, id){
    var w=add(f,'div'); add(w,'label',null,lab).setAttribute('for',id);
    var i=add(w,'input'); i.type='number'; i.id=id; i.value=val; fk(i,id);
    i.addEventListener('change',function(){ cb(Number(i.value)); save(); render(); });
  }
  nb('Poids — respect des délais',e.criteres.delais,function(v){ e.criteres.delais=v; },'ev-delais');
  nb('Poids — conformité (réceptions sans réserve)',e.criteres.conformite,function(v){ e.criteres.conformite=v; },'ev-conformite');
  nb('Poids — complétude à la date prévue',e.criteres.completude,function(v){ e.criteres.completude=v; },'ev-completude');
  nb('Poids — qualité appréciée par le réceptionnaire',e.criteres.qualite,function(v){ e.criteres.qualite=v; },'ev-qualite');
  nb('Seuil d\u2019alerte (sur 100)',e.seuilAlerte,function(v){ e.seuilAlerte=v; logit('Seuil d\u2019alerte des partenaires : '+v+'/100'); },'ev-seuil');
  nb('Retard qui annule la note « délais » (jours)',e.plafondRetardJours,function(v){ e.plafondRetardJours=v; },'ev-plafond');
  add(add(k,'div','panel-foot'),'span','muted','La note d\u2019une commande est calculée à sa réception définitive, avec les réglages en vigueur ce jour-là. Les poids doivent totaliser 100 pour être enregistrés.');
}

/* Formulaire de référencement des partenaires : les questions posées et les documents demandés au prestataire,
   sur le portail des partenaires et dans sa fiche. Distinct des pièces d'une offre (section 4). */
var SCOPES_PIECE = { tous:'Tous les prestataires', local:'Prestataires locaux', etranger:'Prestataires hors UEMOA' };
function vParamsFormulaire(m){
  var F=state.formulaireReferencement=state.formulaireReferencement||{champs:[],pieces:[]};
  var k=add(m,'div','card'); k.style.marginTop='18px';
  add(k,'div','panel-head','10 · Formulaire de référencement des partenaires');
  var b=add(k,'div','pad');
  add(b,'p','muted','Ce que le prestataire renseigne et dépose pour demander son référencement, sur le portail des partenaires. Le dossier complet est ensuite instruit selon le parcours de la section 9.');

  add(b,'h3','sous-titre-param','Questions');
  tableau(b,{ cle:'form-questions', lignes:F.champs, vide:'Aucune question : seules les informations de l\u2019entreprise sont demandées.',
    colonnes:[
      {lab:'Question', val:function(q){ return q.label; }},
      {lab:'Réponse', val:function(q){ return TYPES_QUESTION[q.type]+(q.type==='choix'?' ('+(q.options||[]).join(', ')+')':''); }},
      {lab:'Obligatoire', rendu:function(q,td){ chipCellule(td,q.obligatoire?'Oui':'Non',q.obligatoire?'c-grey':'c-teal'); }}
    ],
    nouveau:{ lab:'Question', action:function(){ fenQuestion(null); } },
    actions:function(q,td){
      boutonIcone(td,'edit','Modifier « '+q.label+' »',function(){ fenQuestion(q); },'fq-mod-'+q.id);
      boutonIcone(td,'x','Supprimer « '+q.label+' »',function(){
        ask('Les réponses déjà données à cette question ne seront plus affichées.',function(){
          F.champs.splice(F.champs.indexOf(q),1); logit('Formulaire de référencement : question retirée — '+q.label); save(); render();
        },'Supprimer la question « '+q.label+' » ?','Supprimer');
      },'fq-sup-'+q.id);
    }
  });

  add(b,'h3','sous-titre-param','Documents à fournir');
  tableau(b,{ cle:'form-pieces', lignes:F.pieces, vide:'Aucun document demandé.',
    colonnes:[
      {lab:'Document', val:function(p){ return p.label; }},
      {lab:'Concerne', val:function(p){ return SCOPES_PIECE[p.scope]||p.scope; }},
      {lab:'Obligatoire', rendu:function(p,td){ chipCellule(td,p.obligatoire?'Oui':'Non',p.obligatoire?'c-grey':'c-teal'); }},
      {lab:'Date de validité', val:function(p){ return p.expiration?'Exigée':'—'; }}
    ],
    nouveau:{ lab:'Document', action:function(){ fenPiece(null); } },
    actions:function(p,td){
      boutonIcone(td,'edit','Modifier « '+p.label+' »',function(){ fenPiece(p); },'fp-mod-'+p.id);
      boutonIcone(td,'x','Supprimer « '+p.label+' »',function(){
        ask('Ce document ne sera plus demandé aux prestataires ; les pièces déjà déposées restent archivées.',function(){
          F.pieces.splice(F.pieces.indexOf(p),1); logit('Formulaire de référencement : document retiré — '+p.label); save(); render();
        },'Retirer « '+p.label+' » ?','Retirer');
      },'fp-sup-'+p.id);
    }
  });
  add(add(k,'div','panel-foot'),'span','muted','Une pièce de même nature validée au référencement (même document dans la section 4) tient lieu de pièce d\u2019offre au dépôt.');

  function caseACocher(parent, id, lab, val){
    var w=add(parent,'label','case-param'); var c=add(w,'input'); c.type='checkbox'; c.id=id; c.checked=!!val; fk(c,id);
    w.appendChild(document.createTextNode(' '+lab)); return c;
  }
  function fenQuestion(q){
    ouvrirFenetre(q?'Modifier la question':'Nouvelle question',function(corps,pied){
      var f=add(corps,'div','frm');
      var w1=add(f,'div'); add(w1,'label',null,'Question').setAttribute('for','fq-lab');
      var lab=add(w1,'input'); lab.type='text'; lab.id='fq-lab'; lab.maxLength=200; fk(lab,'fq-lab'); lab.value=q?q.label:'';
      var w2=add(f,'div'); add(w2,'label',null,'Type de réponse').setAttribute('for','fq-type');
      var ty=add(w2,'select'); ty.id='fq-type'; fk(ty,'fq-type');
      Object.keys(TYPES_QUESTION).forEach(function(t){ add(ty,'option',null,TYPES_QUESTION[t]).value=t; });
      ty.value=q?q.type:'texte';
      var w3=add(corps,'div'); w3.style.marginTop='12px';
      add(w3,'label',null,'Choix proposés (un par ligne)').setAttribute('for','fq-opt');
      var op=add(w3,'textarea'); op.id='fq-opt'; op.rows=4; fk(op,'fq-opt'); op.value=q&&q.options?q.options.join('\n'):'';
      var majChoix=function(){ w3.hidden=ty.value!=='choix'; }; ty.addEventListener('change',majChoix); majChoix();
      var ob=caseACocher(corps,'fq-obl','Réponse obligatoire pour soumettre le dossier',q?q.obligatoire:true);
      var err=add(corps,'div','lg-err'); err.hidden=true;
      add(pied,'button','btn btn-ghost','Annuler').addEventListener('click',fermerFenetre);
      add(pied,'button','btn btn-primary',q?'Enregistrer':'Ajouter').addEventListener('click',function(){
        var v={ id:q?q.id:'q'+Date.now().toString(36), label:lab.value.trim(), type:ty.value, obligatoire:ob.checked };
        if(v.type==='choix') v.options=op.value.split('\n').map(function(x){ return x.trim(); }).filter(Boolean);
        if(!v.label){ err.textContent='Saisissez la question.'; err.hidden=false; return; }
        if(v.type==='choix' && v.options.length<2){ err.textContent='Proposez au moins deux choix.'; err.hidden=false; return; }
        if(q) F.champs[F.champs.indexOf(q)]=v; else F.champs.push(v);
        logit('Formulaire de référencement : question '+(q?'modifiée':'ajoutée')+' — '+v.label);
        fermerFenetre(); save(); render();
      });
    });
  }
  function fenPiece(p){
    ouvrirFenetre(p?'Modifier le document':'Nouveau document',function(corps,pied){
      var f=add(corps,'div','frm');
      var w1=add(f,'div'); add(w1,'label',null,'Document demandé').setAttribute('for','fp-lab');
      var lab=add(w1,'input'); lab.type='text'; lab.id='fp-lab'; lab.maxLength=200; fk(lab,'fp-lab'); lab.value=p?p.label:'';
      var w2=add(f,'div'); add(w2,'label',null,'Prestataires concernés').setAttribute('for','fp-scope');
      var sc=add(w2,'select'); sc.id='fp-scope'; fk(sc,'fp-scope');
      Object.keys(SCOPES_PIECE).forEach(function(s){ add(sc,'option',null,SCOPES_PIECE[s]).value=s; });
      sc.value=p?p.scope:'tous';
      var ob=caseACocher(corps,'fp-obl','Document obligatoire pour soumettre le dossier',p?p.obligatoire:true);
      var ex=caseACocher(corps,'fp-exp','Date de fin de validité exigée (attestation, certificat…)',p?p.expiration:false);
      var err=add(corps,'div','lg-err'); err.hidden=true;
      add(pied,'button','btn btn-ghost','Annuler').addEventListener('click',fermerFenetre);
      add(pied,'button','btn btn-primary',p?'Enregistrer':'Ajouter').addEventListener('click',function(){
        var v={ id:p?p.id:'d'+Date.now().toString(36), label:lab.value.trim(), scope:sc.value, obligatoire:ob.checked, expiration:ex.checked };
        if(!v.label){ err.textContent='Saisissez le nom du document.'; err.hidden=false; return; }
        if(p) F.pieces[F.pieces.indexOf(p)]=v; else F.pieces.push(v);
        logit('Formulaire de référencement : document '+(p?'modifié':'ajouté')+' — '+v.label);
        fermerFenetre(); save(); render();
      });
    });
  }
}

/* Inscription en ligne des prestataires : ouverte ou fermée par l'organisation. */
function vParamsInscription(m,o){
  var k=add(m,'div','card'); k.style.marginTop='18px';
  add(k,'div','panel-head','11 · Inscription en ligne des prestataires');
  var b=add(k,'div','pad');
  var ouverte=o.inscriptionOuverte!==false;
  var p=add(b,'button','pill'+(ouverte?' on':''), ouverte?'Inscription ouverte':'Inscription fermée'); fk(p,'par-inscription');
  p.setAttribute('aria-pressed',ouverte?'true':'false');
  p.addEventListener('click',function(){ o.inscriptionOuverte=!ouverte; logit('Inscription en ligne des prestataires '+(ouverte?'fermée':'ouverte')); save(); render(); });
  add(b,'p','muted','Ouverte, un prestataire crée lui-même le compte de son entreprise sur le portail des partenaires ; le compte n\u2019est actif qu\u2019après vérification de son courriel. Fermée, le portail l\u2019indique et seuls les comptes créés par l\u2019administrateur existent.').style.marginTop='10px';
  // adresse du portail, à communiquer aux prestataires (elle n'apparaît pas sur la page de connexion)
  var lien=location.origin+'/portail-partenaires';
  var l=add(b,'div','portail-lien');
  add(l,'span','muted','Portail des partenaires');
  var a=add(l,'a','',lien.replace(/^https?:\/\//,'')); a.href=lien; a.target='_blank'; a.rel='noopener';
  var c=add(l,'button','btn btn-ghost btn-sm','Copier le lien'); c.type='button';
  c.addEventListener('click',function(){ (navigator.clipboard?navigator.clipboard.writeText(lien):Promise.reject()).then(function(){ toast('Lien du portail copié.'); },function(){ toast(lien); }); });
}
