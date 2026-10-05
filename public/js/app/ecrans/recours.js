/* Marché+ — Écran Notification, recours et signature.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Une seule carte : l'attributaire en tête, puis les trois temps de la clôture en frise verticale (notification,
   recours, signature), chacun avec son état en une phrase et son action. Les motifs communiqués et l'instruction
   d'un recours s'ouvrent dans une fenêtre. */
"use strict";

var STATUTS_RECOURS = { ouvert:['En instruction','c-red'], rejete:['Rejeté','c-grey'], fonde:['Fondé','c-amber'] };

/* ============ Notification, délai de recours et signature ============ */
function vRecours(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Notification, recours et signature');
  var K=CADRE(), J=delaiJours();

  if(!allApproved()) return locked(m,"Cette étape s'ouvre une fois l'attribution prononcée.",'decision',"Aller au circuit d'approbation");

  var rows=ranking(), win=rows[0];
  var notifie=!!state.standstill.startedAt, reste=standstillReste(), ro=recoursOuverts().length;
  var avecRecours = K.recoursActif || state.recours.length>0;

  var carte=add(m,'section','card clore'); carte.setAttribute('aria-label','Clôture de la procédure');

  /* Attributaire */
  var tete=add(carte,'div','clore-tete');
  var tg=add(tete,'div','clore-qui');
  add(tg,'div','clore-lab','Attributaire');
  add(tg,'div','clore-nom',win.o.name);
  add(tg,'div','muted', xof(montantXOF(win.o))+' · '+win.o.delai+' jours · note '+win.total.toFixed(1)+'/100');
  var td=add(tete,'div','clore-etat');
  originChip(td,win.o);
  chipCellule(td, state.contractSigned ? 'Marché signé' : 'Clôture en cours', state.contractSigned ? 'c-green' : 'c-amber');

  var ol=add(carte,'ol','clore-etapes');
  var enCours=null; // le premier temps non terminé
  function etape(etat, titre, texte){
    if(etat!=='done' && etat!=='sans-objet' && !enCours){ enCours=etat; if(etat==='todo') etat='now'; }
    var li=add(ol,'li','clore-etape '+etat);
    var pt=add(li,'span','clore-pt'); pt.setAttribute('aria-hidden','true');
    if(etat==='done') icon(pt,'check'); else if(etat==='sans-objet') pt.textContent='–'; else pt.textContent=String(ol.children.length);
    var corps=add(li,'div','clore-corps');
    add(corps,'h3',null,titre);
    if(texte) add(corps,'p',null,texte);
    var act=add(li,'div','clore-act');
    return { corps:corps, act:act };
  }

  /* 1. Notification */
  var e1=etape(notifie?'done':'todo','Notification aux soumissionnaires',
    notifie ? 'Attribution notifiée : l’attributaire est informé, les non-retenus ont reçu le motif du rejet de leur offre.'
            : 'Informe l’attributaire et communique aux non-retenus le motif du rejet de leur offre.'+(J>0?' Elle ouvre le délai de recours.':''));
  if(!notifie){
    var bn=add(e1.act,'button','btn btn-primary', J>0 ? 'Notifier et ouvrir le délai' : 'Notifier l’attribution');
    guard('decision.approve',bn); fk(bn,'notif-att');
    bn.addEventListener('click',function(){
      ask("Chaque soumissionnaire non retenu recevra le motif du rejet de son offre et son rang."+(J>0 ? " Le marché ne pourra pas être signé avant l'expiration du délai de "+J+" jours." : ""),
        function(){
          state.standstill.startedAt=Date.now(); state.standstill.days=J;
          logit('Notification d’attribution — délai de recours ouvert');
          notify('standstill','Attribution notifiée — délai de recours ouvert',
            "Le marché "+REF()+" est attribué à "+win.o.name+"."+(J>0 ? " Les soumissionnaires non retenus disposent de "+J+" jours pour contester. La signature est suspendue jusqu'à l'expiration de ce délai." : ""));
          save(); render();
        },"Notifier l'attribution ?","Notifier");
    });
  } else {
    if(J>0){ var cd=add(e1.corps,'div','clore-info'); chipCellule(cd, reste>0 ? 'Délai de recours : '+reste+' jour(s) restant(s)' : 'Délai de recours expiré', reste>0?'c-amber':'c-green'); }
    var nbN=motifsNotifies(rows).length;
    var bv=add(e1.act,'button','btn btn-ghost btn-sm','Motifs communiqués ('+nbN+')'); fk(bv,'notif-voir');
    bv.addEventListener('click',ouvrirMotifs);
  }

  /* 2. Recours */
  if(!avecRecours){
    etape('sans-objet','Recours','Le profil « '+MPProfils.profil(R.profilId(RCTX())).lab+' » ne prévoit pas de recours des soumissionnaires.');
  } else {
    var etat2 = ro ? 'blocked' : (notifie && (reste<=0 || !J) ? 'done' : 'todo');
    var e2=etape(etat2,'Recours',
      ro ? ro+' recours en instruction : la signature est suspendue jusqu’à sa décision.'
         : (!notifie ? 'Le délai de recours s’ouvre à la notification.'
         : (reste>0 ? 'Recours recevables jusqu’à l’expiration du délai.' : 'Aucun recours en instance.')));
    state.recours.forEach(function(r,i){
      var S=STATUTS_RECOURS[r.statut]||STATUTS_RECOURS.ouvert;
      var lg=add(e2.corps,'div','clore-ligne');
      add(lg,'strong',null,'Recours '+(i+1)+' — '+r.de);
      chipCellule(lg,S[0],S[1]);
      var b=add(lg,'button','btn btn-sm '+(r.statut==='ouvert' && can('recours.handle')?'btn-primary':'btn-ghost'), r.statut==='ouvert' && can('recours.handle') ? 'Instruire' : 'Voir');
      fk(b,'recours-'+i); b.addEventListener('click',function(){ ouvrirRecours(i); });
    });
    if(K.recoursActif && notifie && !state.contractSigned){
      var bs=add(e2.act,'button','btn btn-ghost btn-sm','Simuler un recours'); fk(bs,'recours-simuler');
      bs.addEventListener('click',function(){
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

  /* 3. Signature */
  var raisons=[];
  if(!notifie) raisons.push("l'attribution n'est pas encore notifiée");
  if(reste>0 && notifie) raisons.push("le délai de recours court encore ("+reste+" jour(s))");
  if(ro) raisons.push(ro+" recours est en instruction");
  var e3=etape(state.contractSigned ? 'done' : (raisons.length && notifie ? 'blocked' : 'todo'),'Signature du marché',
    state.contractSigned ? 'Marché signé. La garantie de bonne exécution est à constituer dans les 20 jours.'
      : (raisons.length ? 'Signature bloquée : '+raisons.join(' ; ')+'.' : 'Le marché peut être signé.'));
  if(!state.contractSigned){
    var bsg=add(e3.act,'button','btn btn-primary','Signer le marché');
    bsg.disabled=raisons.length>0; guard('contract.sign',bsg); fk(bsg,'sign');
    if(raisons.length) bsg.title='Signature bloquée : '+raisons.join(' ; ')+'.';
    bsg.addEventListener('click',function(){
      ask("La signature engage l'autorité contractante pour "+xof(montantXOF(win.o))+". Vérifiez la constitution de la garantie de bonne exécution et, pour un attributaire hors zone, la validité de la contre-garantie bancaire.",
        function(){ state.contractSigned=true; logit('Marché signé — '+win.o.name); save(); render(); },"Signer le marché ?","Signer");
    });
    if(K.recoursActif || J>0) add(e3.corps,'p','clore-aide',"Le blocage protège le client : signer avant l'expiration du délai priverait l'évincé de tout recours utile, et l'annulation coûterait bien plus cher que l'attente.");
  }
}

/* Motifs communiqués aux non-retenus : rang et note, ou pièces manquantes pour une offre écartée. */
function motifsNotifies(rows){
  return rows.slice(1).map(function(r){ return { nom:r.o.name, motif:'Rang '+r.rank+' — note '+r.total.toFixed(1)+'/100, inférieure à celle de l’attributaire.', ecarte:false }; })
    .concat(SEED_OFFERS.filter(excluded).map(function(o){ var mis=missingDocs(o);
      return { nom:o.name, motif:'Offre écartée — '+(mis.length?mis.map(function(d){return d.label;}).join(' ; '):'décision du comité')+'.', ecarte:true }; }));
}
function ouvrirMotifs(){
  ouvrirFenetre('Motifs communiqués aux non-retenus', function(c){
    if(!state.standstill.startedAt) return false;
    var ul=add(c,'ul','fen-liste fen-liste-motifs');
    motifsNotifies(ranking()).forEach(function(x){
      var li=add(ul,'li');
      var g=add(li,'div'); add(g,'strong',null,x.nom); add(g,'div','muted',x.motif);
      chipCellule(li, x.ecarte?'Rejet motivé':'Notifié', x.ecarte?'c-red':'c-grey');
    });
  });
}

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
          logit('Recours déclaré fondé — procédure reprise à l’évaluation');
          save(); render();
        },"Déclarer ce recours fondé ?","Déclarer fondé");
      });
    }
  });
}
