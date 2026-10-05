/* Marché+ — Écran Notification, recours et signature.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Les soumissionnaires notifiés et les recours sont en tableaux ; un recours s'instruit dans une fenêtre. */
"use strict";

var STATUTS_RECOURS = { ouvert:['En instruction','c-red'], rejete:['Rejeté','c-grey'], fonde:['Fondé','c-amber'] };

/* Fenêtre d'instruction d'un recours : objet, décision, et les deux issues possibles. */
function ouvrirRecours(i){
  ouvrirFenetre(function(){ var r=state.recours[i]; return 'Recours '+(i+1)+(r?' — '+r.de:''); }, function(c,p){
    var r=state.recours[i]; if(!r) return false;
    var S=STATUTS_RECOURS[r.statut]||STATUTS_RECOURS.ouvert;
    var ch=add(c,'div','fen-chips'); chipCellule(ch,S[0],S[1]); chipCellule(ch,'Déposé le '+r.t,'c-grey');
    champLecture(c,'Objet',r.objet);
    if(r.decision) champLecture(c,'Décision',r.decision);
    if(r.statut==='ouvert' && can('recours.handle')){
      var rj=add(p,'button','btn btn-ghost','Rejeter le recours'); fk(rj,'recours-rejeter-'+i);
      rj.addEventListener('click',function(){
        ask("Le rejet doit être motivé par écrit et communiqué au requérant, qui conserve la faculté de saisir l'organe de régulation.",function(){
          r.statut='rejete'; r.decision="Recours rejeté : la procédure de notation a été appliquée conformément à la grille publiée, et la piste d'audit atteste l'intervention humaine sur chaque score retenu.";
          logit('Recours rejeté — '+r.de); save(); render();
        },"Rejeter ce recours ?","Rejeter");
      });
      var fd=add(p,'button','btn btn-danger','Déclarer le recours fondé'); fk(fd,'recours-fonde-'+i);
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
}

/* ============ Notification, délai de recours et signature ============ */
function vRecours(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Notification, recours et signature');
  var K=CADRE(), J=delaiJours();

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
  }
  if(state.standstill.startedAt){
    var notifies = rows.slice(1).map(function(r){ return { nom:r.o.name, rang:'Rang '+r.rank, motif:'Note '+r.total.toFixed(1)+'/100, inférieure à celle de l\u2019attributaire.', ecarte:false }; })
      .concat(SEED_OFFERS.filter(excluded).map(function(o){ var mis=missingDocs(o);
        return { nom:o.name, rang:'Écartée', motif:'Offre écartée — '+(mis.length?mis.map(function(d){return d.label;}).join(' ; '):'décision du comité'), ecarte:true }; }));
    tableau(m,{ cle:'notifies', titre:'Motifs communiqués aux non-retenus', lignes:notifies,
      colonnes:[
        {lab:'Soumissionnaire', rendu:function(x,td){ add(td,'strong',null,x.nom); }},
        {lab:'Rang', val:function(x){ return x.rang; }},
        {lab:'Motif communiqué', rendu:function(x,td){ add(td,'div','dt-extrait',x.motif); }},
        {lab:'Statut', rendu:function(x,td){ chipCellule(td, x.ecarte?'Rejet motivé':'Notifié', x.ecarte?'c-red':'c-grey'); }}
      ],
      recherche:function(x){ return x.nom+' '+x.motif; }
    });
  }

  var k2=add(m,'div','card'); k2.style.marginTop='18px';
  if(!K.recoursActif && !state.recours.length){
    add(k2,'div','panel-head','2 · Recours');
    add(add(k2,'div','pad'),'p','muted','Le profil « '+MPProfils.profil(R.profilId(RCTX())).lab+' » ne prévoit pas de recours des soumissionnaires.');
  } else {
  if(k2.parentNode) k2.parentNode.removeChild(k2);
  var ro=recoursOuverts().length;
  var simul = K.recoursActif && state.standstill.startedAt && !state.contractSigned;
  var tr=tableau(m,{ cle:'recours', titre:'2 · Recours déposés', lignes:state.recours.map(function(r,i){ return {r:r,i:i}; }),
    vide:'Aucun recours enregistré. Un recours déposé dans le délai suspend la signature du marché jusqu’à ce qu’il soit instruit.',
    colonnes:[
      {lab:'N°', num:true, val:function(x){ return x.i+1; }},
      {lab:'Requérant', rendu:function(x,td){ add(td,'strong',null,x.r.de); }},
      {lab:'Objet', rendu:function(x,td){ add(td,'div','dt-extrait',x.r.objet); }},
      {lab:'Déposé le', val:function(x){ return x.r.t; }},
      {lab:'Statut', rendu:function(x,td){ var S=STATUTS_RECOURS[x.r.statut]||STATUTS_RECOURS.ouvert; chipCellule(td,S[0],S[1]); }}
    ],
    recherche:function(x){ return x.r.de+' '+x.r.objet+' '+(x.r.decision||''); },
    nouveau: simul ? { lab:'Simuler un recours', action:function(){
      var perdant = rows[1] ? rows[1].o.name : 'Un soumissionnaire';
      state.recours.push({ de:perdant, statut:'ouvert', t:new Date().toLocaleString('fr-FR'),
        objet:"Le requérant conteste la notation du critère « Méthodologie » et demande communication des éléments ayant fondé l'écart avec sa propre offre." });
      logit('Recours déposé — '+perdant+' — signature suspendue');
      notify('recours.depose','Recours déposé — signature suspendue',
        perdant+" conteste l'attribution de la procédure "+REF()+". La signature du marché est suspendue jusqu'à instruction du recours.");
      save(); render();
    } } : null,
    actions:function(x,td){ boutonDetail(td,function(){ ouvrirRecours(x.i); },'recours-'+x.i, x.r.statut==='ouvert' && can('recours.handle') ? 'Instruire' : null); }
  });
  add(tr.querySelector('.dt-barre'),'span','chip '+(ro?'c-red':'c-green'), ro? ro+' recours ouvert(s)':'Aucun recours');
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
