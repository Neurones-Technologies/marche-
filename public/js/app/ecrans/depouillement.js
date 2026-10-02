/* Marché+ — Écran Dépouillement.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

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
        cibler('PUT','/confirmations/'+enc(o.id)+'/'+i,{confirme:true}).then(function(r){
          if(!r) return;
          logit('Champ confirmé — '+o.name+' : '+f.k);
          if(flagsRemaining()===0) notify('verif.requise','Vérification des extractions terminée',
            "Tous les champs signalés de la procédure "+REF()+" ont été confirmés. Le dépouillement peut être clôturé.");
          save(); render();
        });
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
