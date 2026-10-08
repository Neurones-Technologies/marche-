/* Marché+ — Écran Dépouillement.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Les offres en tableau ; la vérification d'une offre (document reçu, valeurs lues, confirmations) se fait dans une
   fenêtre, d'où l'on passe à l'offre précédente ou suivante. */
"use strict";

function vDepouille(m){
  if (!state.cdc.cdcPublie) return locked(m,"Le dépouillement s'ouvre une fois le cahier des charges publié.",'cdc','Ouvrir le cahier des charges');
  var nb=SEED_OFFERS.length;
  var reste=flagsRemaining();
  var total=0; SEED_OFFERS.forEach(function(x){ total+=x.fields.filter(function(f){return f.flag;}).length; });

  /* Prochaine étape */
  var suivante=null;
  for(var j=0;j<nb;j++){ var x=SEED_OFFERS[(state.offerIndex+j)%nb]; if(aVerifier(x)>0){ suivante=x; break; } }
  if(!nb && !state.depClosed){
    // rien à dépouiller : la clôture n'est pas proposée (le serveur la refuse aussi)
    var ech=R.echeanceDepot(state.cdc), passee=ech && Date.now()>ech;
    guideCard(m,{ icon:'inbox', titre:'Aucune offre reçue',
      texte: passee ? 'La date limite de dépôt est passée sans aucune offre : le dépouillement ne peut pas être clôturé.'
        : 'Les offres déposées apparaîtront ici. Le dépouillement se clôture une fois au moins une offre reçue.' });
  } else if(state.depClosed){
    guideCard(m,{ ok:true, titre:'Dépouillement clôturé', texte: state.fxFrozen ? 'Données figées le '+state.fxFrozen.at+'. Les offres conformes peuvent maintenant être évaluées.' : 'Les offres conformes peuvent maintenant être évaluées.',
      action: viewAllowed('evaluation') ? 'Passer à l’évaluation' : null, go:function(){ go('evaluation'); } });
  } else if(suivante){
    var n=aVerifier(suivante);
    guideCard(m,{ icon:'check', titre:'Prochaine étape : vérifier '+n+' valeur'+(n>1?'s':'')+' de '+suivante.name,
      texte:'Le lecteur automatique n’est pas sûr de ces valeurs. Comparez-les au document, puis confirmez.',
      action: can('depouille.confirm') ? 'Commencer' : null, go:function(){ ouvrirOffreDepouillement(suivante.id); } });
  } else {
    guideCard(m,{ icon:'check', titre:'Tout est vérifié : vous pouvez clôturer', texte:'La clôture fige les données lues dans les offres et ouvre l’évaluation.',
      action: can('depouille.close') ? 'Clôturer le dépouillement' : null, go:cloturerDepouillement });
  }

  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Dépouillement');

  /* Progression de l'ensemble */
  var pc=add(m,'div','card progress-card');
  add(pc,'strong',null,'Vérification de l’ensemble des offres');
  var pg=add(pc,'progress','meter'+(reste===0?' full':'')); pg.max=total||1; pg.value=total-reste;
  pg.setAttribute('aria-label','Valeurs vérifiées');
  add(pc,'span','muted',(total-reste)+' sur '+total+' valeurs vérifiées');

  var seuil=Number(state.seuils.confianceMin)||0;
  tableau(m,{ cle:'depouille', titre:'Offres reçues', lignes:SEED_OFFERS,
    colonnes:[
      {lab:'Soumissionnaire', rendu:function(o,td){ add(td,'strong',null,o.name); add(td,'div','muted',o.doc); }},
      {lab:'Origine', rendu:function(o,td){ originChip(td,o); }},
      {lab:'Lecture', val:function(o){ return o.submitted ? 'Saisie en ligne' : (o.externe ? (o.externe.lecture==='ia' ? 'Lue par l’IA, relue' : 'Saisie à la main') : 'Lecture simulée (démonstration)'); }},
      {lab:'Confiance moyenne', rendu:function(o,td){ var a=confianceMoyenne(o); chipCellule(td,a+' %',a>=seuil?'c-green':'c-amber'); }},
      {lab:'Vérification', rendu:function(o,td){ var r=aVerifier(o); chipCellule(td, r ? r+' valeur'+(r>1?'s':'')+' à vérifier' : 'Vérifiée', r?'c-amber':'c-green'); }}
    ],
    recherche:function(o){ return o.name+' '+o.pays+' '+o.doc; },
    filtres:[{ lab:'Vérification', options:[['afaire','À vérifier'],['ok','Vérifiée']], test:function(o,v){ return (aVerifier(o)>0) === (v==='afaire'); } }],
    actions:function(o,td){ boutonDetail(td,function(){ ouvrirOffreDepouillement(o.id); },'dep-ouvrir-'+o.id, aVerifier(o)>0 && can('depouille.confirm') ? 'Vérifier' : null); }
  });
}

/* Clôture du dépouillement : fige les données lues et ouvre l'évaluation. */
function cloturerDepouillement(){
  if(!SEED_OFFERS.length || flagsRemaining()>0 || state.depClosed || !can('depouille.close')) return;
  ask('Les données lues dans les offres seront figées et l’évaluation s’ouvrira.', function(){
    state.depClosed=true; logit('Dépouillement clôturé — évaluation ouverte');
    notify('dep.cloture','Dépouillement clôturé',
      "Le dépouillement de la procédure "+REF()+" est clôturé : "+conformes().length+" offre(s) conforme(s) sur "+SEED_OFFERS.length+". L'évaluation est ouverte aux évaluateurs désignés.");
    var anoR=anomalies().filter(function(x){return x.lvl==='red';});
    if(anoR.length) notify('anomalie',''+anoR.length+' anomalie(s) critique(s) à instruire',
      anoR.slice(0,4).map(function(x){return '• '+x.who+' — '+x.t;}).join("\n"));
    save(); go('evaluation');
  }, 'Clôturer le dépouillement ?', 'Clôturer');
}

/* Fenêtre de vérification d'une offre : document reçu à gauche, valeurs lues à droite. */
function ouvrirOffreDepouillement(id){
  var courant={ id:id };
  state.offerIndex=Math.max(0,SEED_OFFERS.indexOf(offreParId(id)));
  ouvrirFenetre(function(){ var o=offreParId(courant.id); return o ? o.name : 'Offre'; }, function(c,p){
    var o=offreParId(courant.id); if(!o) return false;
    var nb=SEED_OFFERS.length, idx=SEED_OFFERS.indexOf(o), restIci=aVerifier(o);
    var seuil=Number(state.seuils.confianceMin)||0;

    var ml=add(c,'div','fen-chips');
    chip(ml,'info',(isUemoa(o)?'UEMOA · ':'Hors UEMOA · ')+o.pays);
    if(o.submitted) chip(ml,'ok','Saisie en ligne','check');
    else if(restIci>0) chip(ml,'pending',restIci+' valeur'+(restIci>1?'s':'')+' à vérifier');
    else chip(ml,'ok','Vérifiée','check');

    var sp=add(c,'div','split');
    /* Document reçu */
    var dc=add(sp,'section','card'); dc.setAttribute('aria-label','Document reçu');
    var dh=add(dc,'div','panel-head'); var dht=add(dh,'span','h'); icon(dht,'file'); dht.appendChild(document.createTextNode('Document reçu')); add(dh,'small',null,o.doc);
    if(o.submitted){
      var hs=add(dc,'p','hint top'); icon(hs,'info');
      hs.appendChild(document.createTextNode('Offre saisie en ligne par le soumissionnaire : aucune lecture automatique, rien à vérifier.'));
    } else if(o.externe){
      var he=add(dc,'p','hint top'); icon(he,'info');
      he.appendChild(document.createTextNode('Offre reçue hors plateforme le '+o.depot+(o.externe.lecture==='ia' ? ', lue par l’IA puis relue' : ', saisie à la main')+'. Vérifiez sur le document les valeurs signalées et les pièces administratives.'));
      (o.pieces||[]).forEach(function(f){
        var a=add(add(dc,'p'),'a','pill',f.name+' · '+taille(f.size)); a.href='/api/files/'+f.id; a.setAttribute('download',f.name); a.title='SHA-256 '+f.sha256;
      });
      if((o.externe.remarques||[]).length){ var nr=add(dc,'div','note'); add(nr,'strong',null,'Remarques de la lecture : '); var ur=add(nr,'ul'); ur.style.margin='6px 0 0 18px'; o.externe.remarques.forEach(function(r){ add(ur,'li',null,r); }); }
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
      hi.appendChild(document.createTextNode((en ? 'Document en '+o.devise+' : les lignes encadrées sont à vérifier avant conversion.' : 'Les lignes encadrées sont celles que vous devez vérifier.')+' Offre de démonstration : document et lecture simulés.'));
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

    /* Pied : position, offre précédente / suivante, et la prochaine offre à vérifier */
    add(p,'span','muted','Offre '+(idx+1)+' sur '+nb);
    function aller(k){ courant.id=SEED_OFFERS[k].id; state.offerIndex=k; save(); dessinerFenetre(); }
    var pv=add(p,'button','btn btn-ghost','Précédente'); pv.type='button'; fk(pv,'prev-offer');
    pv.addEventListener('click',function(){ aller((idx-1+nb)%nb); });
    var nx=add(p,'button','btn btn-ghost','Suivante'); nx.type='button'; fk(nx,'next-offer');
    nx.addEventListener('click',function(){ aller((idx+1)%nb); });
    if(!restIci){
      var suiv=null; for(var j=1;j<nb;j++){ var x=SEED_OFFERS[(idx+j)%nb]; if(aVerifier(x)>0){ suiv=x; break; } }
      if(suiv){ var bs=add(p,'button','btn btn-primary','Offre à vérifier : '+suiv.name); fk(bs,'dep-suivante'); bs.addEventListener('click',function(){ aller(SEED_OFFERS.indexOf(suiv)); }); }
    }
  }, { large:true });
}
