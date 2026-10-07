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

  vParamsPiecesReferencement(m); // 4 · pièces d'adhésion des prestataires

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
  vParamsCircuitOrg(m,'circuitBesoin','8 · Demandes d’achat : circuit de validation et type de procédure','Une demande d’achat suit ce circuit à sa soumission ; un niveau avec seuil n\u2019intervient qu\u2019à partir de ce budget. Le demandeur ne valide jamais sa propre demande.',seuilsDemandes);
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
  vParamsBudget(m,15);
  vParamsSauvegardes(m,16);
}

/* Règles des appels d'offres : réglages de l'organisation, dans les bornes de son profil réglementaire (profils.js),
   regroupés par effet. Le choix du profil ne s'affiche que si les marchés publics sont ouverts (MARCHES_PUBLICS) ; les
   seuils de montant figurent avec les demandes d'achat (section 8). */
var LIB_REGLES = {
  niveauxApprobationMin:'Nombre minimum de validations', separationFonctions:'La personne qui note les offres ne peut pas approuver l’attribution',
  recoursActif:'Permettre la contestation', delaiRecoursJours:'Délai pour contester (jours)',
  preferenceAutorisee:'Favoriser les entreprises de certains pays', preferenceTauxMax:'Majoration maximale des autres offres (%)', zonePreference:'Pays favorisés',
  paysLocal:'Pays de l’organisation', piecesImposees:'Pièces exigées dans tous les appels d’offres',
  seuilConsultation:'Appel d’offres restreint à partir de (XOF)', seuilAppelOffresOuvert:'Appel d’offres ouvert à partir de (XOF)'
};
function contexteRegles(o){
  var P=MPProfils, pid=R.profilId({ cdc:state.cdc||{}, org:o }), prof=P.profil(pid);
  return { prof:prof, eff:P.effectif(pid,o.reglages) };
}
/* Une règle : libellé clair, valeur modifiable (ou imposée par le profil). */
function ligneRegle(parent, o, id){
  var ctx=contexteRegles(o), def=MPProfils.REGLES.filter(function(x){ return x.id===id; })[0], r=ctx.prof.regles[id], v=ctx.eff[id];
  var row=add(parent,'div','docline regle-ligne');
  var lf=add(row,'div'); lf.style.flex='1 1 260px';
  add(lf,'div',null,LIB_REGLES[id]||def.lab);
  if(r.impose){
    var lab=function(x){ var d=DOCS().filter(function(y){ return y.id===x; })[0]; return d?d.label:x; };
    add(row,'span','muted', def.type==='bool' ? (v?'Oui':'Non') : def.type==='liste-pays' ? v.join(', ') : def.type==='pieces' ? v.map(lab).join(' ; ') : String(v));
    return;
  }
  var set=function(val,aff){ o.reglages=o.reglages||{}; o.reglages[id]=val; logit('Réglage « '+(LIB_REGLES[id]||def.lab)+' » : '+aff); save(); render(); };
  if(def.type==='bool'){
    var p=add(row,'button','pill'+(v?' on':''), v?'Oui':'Non'); fk(p,'rg-'+id);
    p.setAttribute('aria-pressed',v?'true':'false'); p.setAttribute('aria-label',LIB_REGLES[id]||def.lab);
    p.addEventListener('click',function(){ set(!v, v?'non':'oui'); });
    return;
  }
  var i=add(row,'input'); i.setAttribute('aria-label',LIB_REGLES[id]||def.lab); fk(i,'rg-'+id);
  if(def.type==='nombre'){ i.type='number'; i.min=r.min; i.max=r.max; i.value=v; i.style.width='150px'; }
  else { i.type='text'; i.value = def.type==='liste-pays' ? v.join(', ') : v; i.style.flex='1 1 200px';
    add(lf,'div','muted', def.type==='liste-pays' ? 'Codes pays à deux lettres, séparés par des virgules.' : 'Code pays à deux lettres.'); }
  i.addEventListener('change',function(){
    var val = def.type==='nombre' ? Number(i.value)
      : def.type==='liste-pays' ? i.value.toUpperCase().split(/[\s,;]+/).filter(Boolean) : i.value.trim().toUpperCase();
    set(val, Array.isArray(val) ? val.join(', ') : String(val));
  });
}
function vParamsCadre(m,o){
  var P=MPProfils, ctx=contexteRegles(o), eff=ctx.eff;
  var k7=add(m,'div','card'); k7.style.marginTop='18px';
  var ph=add(k7,'div','panel-head'); add(ph,'span',null,'7 · Règles des appels d’offres');
  var b=add(k7,'div','pad');
  if(state.marchesPublics){
    // marchés publics ouverts : le profil (public ou privé) fixe les bornes des réglages
    chipCellule(ph, ctx.prof.lab, ctx.prof.public?'c-violet':'c-teal');
    var w=add(add(b,'div','frm'),'div');
    add(w,'label',null,'Profil par défaut des nouveaux appels d’offres').setAttribute('for','par-profil');
    var s=add(w,'select'); s.id='par-profil'; fk(s,'par-profil'); optionsProfils(s);
    s.value=o.profilDefaut||P.DEFAUT;
    s.addEventListener('change',function(){ o.profilDefaut=s.value; logit('Profil réglementaire par défaut : '+P.profil(s.value).lab); save(); render(); });
  }
  if(state.cadre) add(b,'div','note','Les règles de l’appel d’offres '+REF()+' ont été figées à sa publication, le '+state.cadre.at+' : un changement fait ici ne s’applique qu’aux appels d’offres publiés ensuite.');
  function bloc(titre, explication, ids){
    var z=add(b,'div','regle-bloc');
    add(z,'h3',null,titre); add(z,'p','muted',explication);
    ids.forEach(function(id){ ligneRegle(z,o,id); });
  }
  bloc('Validation de l’attribution','Combien de personnes doivent valider avant qu’un marché soit attribué.',
    ['niveauxApprobationMin','separationFonctions']);
  if(state.marchesPublics || eff.recoursActif) bloc('Contestation','Après l’attribution, les entreprises non retenues peuvent contester la décision pendant un délai, avant la signature du marché.',
    eff.recoursActif ? ['recoursActif','delaiRecoursJours'] : ['recoursActif']);
  if(state.marchesPublics || eff.preferenceAutorisee) bloc('Préférence géographique','Pour comparer les prix, les offres des entreprises établies hors des pays favorisés sont majorées d’un pourcentage, choisi dans chaque appel d’offres sans dépasser le maximum fixé ici. Le prix payé ne change pas.',
    eff.preferenceAutorisee ? ['preferenceAutorisee','preferenceTauxMax','zonePreference'] : ['preferenceAutorisee']);
  bloc('Entreprises locales','Les entreprises établies dans ce pays fournissent, en plus, les pièces propres au pays (attestation de sécurité sociale…).',
    ['paysLocal']);
  if((eff.piecesImposees||[]).length) bloc('Pièces imposées','Ces pièces sont exigées dans tous les appels d’offres et ne peuvent pas en être retirées.',['piecesImposees']);
}

/* Seuils de montant : le type de procédure proposé quand une demande d'achat devient un appel d'offres. */
function seuilsDemandes(b){
  var z=add(b,'div','regle-bloc');
  add(z,'h3',null,'Type de procédure selon le montant');
  add(z,'p','muted','Quand une demande d’achat est transformée, le type de procédure est proposé d’après son budget : consultation simple (demande de cotations) en dessous du premier seuil, appel d’offres restreint entre les deux, appel d’offres ouvert au-delà.');
  ligneRegle(z,state.org,'seuilConsultation');
  ligneRegle(z,state.org,'seuilAppelOffresOuvert');
}

/* Circuit d'organisation (besoins, référencement) : même moteur que le circuit d'approbation de l'attribution. */
function vParamsCircuitOrg(m, cle, titre, note, plus){
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
  if(plus) plus(b); // contenu propre à la section (seuils des demandes d'achat)
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
  add(k,'div','panel-head','10 · Questions du formulaire de référencement');
  var b=add(k,'div','pad');
  add(b,'p','muted','Les questions posées au prestataire qui demande son référencement sur le portail des partenaires (les documents à fournir se règlent à la section 4). Le dossier complet est ensuite instruit selon le parcours de la section 9.');

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
}

/* Pièces exigées pour le référencement (adhésion) des prestataires : demandées une fois pour toutes sur le portail des
   partenaires. Les pièces propres à un appel d'offres se saisissent dans son cahier des charges. */
function vParamsPiecesReferencement(m){
  var F=state.formulaireReferencement=state.formulaireReferencement||{champs:[],pieces:[]};
  var k=add(m,'div','card'); k.style.marginTop='18px';
  add(k,'div','panel-head','4 · Pièces exigées pour le référencement des prestataires');
  var b=add(k,'div','pad');
  tableau(b,{ cle:'form-pieces', lignes:F.pieces, vide:'Aucun document demandé.',
    colonnes:[
      {lab:'Document', val:function(p){ return p.label; }},
      {lab:'Concerne', val:function(p){ return SCOPES_PIECE[p.scope]||p.scope; }},
      {lab:'Obligatoire', rendu:function(p,td){ chipCellule(td,p.obligatoire?'Oui':'Non',p.obligatoire?'c-grey':'c-teal'); }},
      {lab:'Date de validité', val:function(p){ return p.expiration?'Exigée':'—'; }}
    ],
    nouveau:{ lab:'Document', action:function(){ fenPieceRef(null); } },
    actions:function(p,td){
      boutonIcone(td,'edit','Modifier « '+p.label+' »',function(){ fenPieceRef(p); },'fp-mod-'+p.id);
      boutonIcone(td,'x','Supprimer « '+p.label+' »',function(){
        ask('Ce document ne sera plus demandé aux prestataires ; les pièces déjà déposées restent archivées.',function(){
          F.pieces.splice(F.pieces.indexOf(p),1); logit('Formulaire de référencement : document retiré — '+p.label); save(); render();
        },'Retirer « '+p.label+' » ?','Retirer');
      },'fp-sup-'+p.id);
    }
  });
  add(add(k,'div','panel-foot'),'span','muted','Demandés une fois pour toutes au prestataire qui demande son adhésion (portail des partenaires, puis sa fiche). Un partenaire référencé dont la pièce est validée et en cours de validité n\u2019a pas à la joindre à ses offres.');
}

function caseParam(parent, id, lab, val){
  var w=add(parent,'label','case-param'); var c=add(w,'input'); c.type='checkbox'; c.id=id; c.checked=!!val; fk(c,id);
  w.appendChild(document.createTextNode(' '+lab)); return c;
}
function fenPieceRef(p){
  var F=state.formulaireReferencement;
  ouvrirFenetre(p?'Modifier le document':'Nouveau document',function(corps,pied){
    var f=add(corps,'div','frm');
    var w1=add(f,'div'); add(w1,'label',null,'Document demandé').setAttribute('for','fp-lab');
    var lab=add(w1,'input'); lab.type='text'; lab.id='fp-lab'; lab.maxLength=200; fk(lab,'fp-lab'); lab.value=p?p.label:'';
    var w2=add(f,'div'); add(w2,'label',null,'Prestataires concernés').setAttribute('for','fp-scope');
    var sc=add(w2,'select'); sc.id='fp-scope'; fk(sc,'fp-scope');
    Object.keys(SCOPES_PIECE).forEach(function(s){ add(sc,'option',null,SCOPES_PIECE[s]).value=s; });
    sc.value=p?p.scope:'tous';
    var ob=caseParam(corps,'fp-obl','Document obligatoire pour soumettre le dossier',p?p.obligatoire:true);
    var ex=caseParam(corps,'fp-exp','Date de fin de validité exigée (attestation, certificat…)',p?p.expiration:false);
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

/* Sauvegardes : la dernière, et la vérification de la base de cet espace (lecture seule ; voir docs/SAUVEGARDES.md). */
var SAUVEGARDES_ETAT = { t:0, e:null };
function vParamsSauvegardes(m, num){
  var S=SAUVEGARDES_ETAT;
  if(Date.now()-S.t>60000){ S.t=Date.now(); MP.api('GET','/api/sauvegardes').then(function(r){ S.e=r; render(); }).catch(function(){}); }
  var k=add(m,'div','card'); k.style.marginTop='18px';
  var ph=add(k,'div','panel-head'); add(ph,'span',null,num+' · Sauvegardes');
  var b=add(k,'div','pad'), e=S.e;
  if(!e){ add(b,'p','muted','Chargement…'); return; }
  var d=e.derniere;
  if(d) chipCellule(ph, d.statut==='ok' ? 'Vérifiée' : (d.statut==='absente' ? 'Base absente' : 'Anomalie'), d.statut==='ok' ? 'c-green' : 'c-red');
  grilleLecture(b,[
    ['Sauvegarde automatique', e.actif ? 'Toutes les '+e.intervalleHeures+' h' : 'Désactivée'],
    ['Dernière sauvegarde', d ? new Date(d.date).toLocaleString('fr-FR') : 'Aucune pour l’instant'],
    ['Taille de la base sauvegardée', d && d.taille ? taille(d.taille) : null],
    ['Sauvegardes conservées', e.nombre+' sur '+e.conserver]
  ]);
  add(add(k,'div','panel-foot'),'span','muted','Chaque sauvegarde copie la base et les pièces déposées, puis vérifie la copie. La restauration est faite par l’exploitant de la plateforme.');
}
