/* Marché+ — Portail du fournisseur : ses échanges avec l'acheteur sur une consultation. Le résultat (dès l'attribution
   prononcée), les questions et réponses (questions posées jusqu'à 3 jours avant l'échéance), les demandes de clarification
   qui visent son offre, et ses réclamations. Chaque envoi passe par une route dédiée du serveur, qui pose l'auteur, la
   date et le statut ; l'état est ensuite relu.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

var QUESTIONS_JOURS_AVANT = 3;
/* Relit l'état de la procédure après un envoi. */
function relireEtat(){ return MP.api('GET',MP.url('/state')).then(function(p){ applyServer(p,false); render(); }); }
/* Envoi d'un formulaire du portail : bouton bloqué pendant l'envoi, message, relecture de l'état. */
function envoyerPortail(bouton, methode, chemin, corps, message){
  bouton.disabled=true;
  return MP.api(methode, MP.url(chemin), corps).then(function(){ toast(message); return relireEtat(); })
    .catch(function(e){ bouton.disabled=false; toast(e.message||'Envoi impossible.'); });
}
/* Carte hors de la numérotation des sections du dépôt. */
function carteEchange(m, titre){
  var k=add(add(m,'div'),'div','card'); k.style.marginTop='18px';
  add(k,'div','panel-head',titre);
  return add(k,'div','pad');
}

/* Résultat de la consultation pour le fournisseur, dès l'attribution prononcée. */
var RESULTATS = { retenue:['Offre retenue','c-green'], non_retenue:['Offre non retenue','c-grey'], ecartee:['Offre écartée','c-red'], infructueux:['Consultation infructueuse','c-amber'] };
function vPortailResultat(m){
  var r=state.monResultat; if(!r) return;
  var k=add(add(m,'div'),'div','card portail-resultat '+(r.statut==='retenue'?'ok':'')); k.style.marginBottom='18px';
  var ph=add(k,'div','panel-head'); add(ph,'span',null,'Résultat de la consultation');
  chipCellule(ph,(RESULTATS[r.statut]||[r.statut])[0],(RESULTATS[r.statut]||[0,'c-grey'])[1]);
  var b=add(k,'div','pad');
  add(b,'p',null,r.motif);
  if(r.statut==='retenue') add(b,'p','muted','L’acheteur vous contactera pour la suite : mise au point et bon de commande.');
  else if(r.statut!=='infructueux') add(b,'p','muted','Vous pouvez adresser une réclamation motivée ci-dessous si vous contestez cette décision.');
  var o=state.monOffre||{}, mp=state.monPartenaire||{};
  var bl=add(b,'button','btn btn-ghost btn-sm','Télécharger la lettre (PDF)'); fk(bl,'ma-lettre');
  bl.addEventListener('click',function(){
    telechargerLettres([{ nom:o.name||mp.raisonSociale||'', pays:o.iso?paysLettre(o.iso):'', montant:o.montant, devise:o.devise, resultat:r }],'Résultat '+REF()+'.pdf');
  });
}

/* Additifs au dossier : ce qui modifie ou précise le dossier depuis sa publication (repris aussi dans le PDF). */
function vPortailAdditifs(m){
  var adds=state.additifs||[];
  if(!adds.length) return;
  var b=carteEchange(m,'Additifs au dossier ('+adds.length+')');
  add(b,'p','muted','Ils font partie du dossier et priment sur les pièces qu’ils modifient. Tenez-en compte dans votre offre.');
  adds.slice().reverse().forEach(function(a,k){
    var e=add(b,'div','echange');
    var t=add(e,'div','echange-tete'); add(t,'strong',null,'Additif n° '+(a.n||adds.length-k)+' — '+a.objet); add(t,'span','muted','Publié le '+a.t);
    if(a.report) chipCellule(t,'Date limite reportée au '+dateLongue(a.report),'c-amber');
    String(a.texte||'').split(/\n\s*\n/).forEach(function(x){ if(x.trim()) add(e,'p',null,x.trim()); });
  });
}

function paysLettre(iso){ return ({ CI:'Côte d’Ivoire', BF:'Burkina Faso', SN:'Sénégal', ML:'Mali', NE:'Niger', TG:'Togo', BJ:'Bénin', GW:'Guinée-Bissau' })[iso] || iso; }

/* Questions et réponses : publiées sans leur auteur ; on pose la sienne jusqu'à 3 jours avant l'échéance. */
function vPortailQuestions(m){
  var b=carteEchange(m,'Questions et réponses');
  var qa=state.qa||[];
  if(!qa.length) add(b,'p','muted','Aucune question pour l’instant. Les questions et leurs réponses sont communiquées à toutes les entreprises consultées, sans le nom de leur auteur.');
  var liste=add(b,'div','echanges');
  qa.forEach(function(q){
    var e=add(liste,'div','echange');
    var t=add(e,'div','echange-tete'); add(t,'strong',null,'Question'); add(t,'span','muted',q.t||'');
    if(q.mienne) chipCellule(t,'Votre question','c-violet');
    add(e,'p',null,q.question);
    if(q.reponse){ var rp=add(e,'div','echange-reponse'); add(rp,'strong',null,'Réponse de l’acheteur'); add(rp,'p',null,q.reponse); }
    else add(e,'p','muted','En attente de réponse.');
  });
  var ech=R.echeanceDepot(state.cdc), limite=ech ? ech-QUESTIONS_JOURS_AVANT*86400000 : null;
  if(limite && Date.now()>limite){ add(b,'p','muted','Les questions sont closes '+QUESTIONS_JOURS_AVANT+' jours avant la date limite de dépôt.').style.marginTop='12px'; return; }
  var lb=add(b,'label',null,'Votre question'); lb.setAttribute('for','pt-question'); lb.style.marginTop='14px';
  var ta=add(b,'textarea'); ta.id='pt-question'; ta.rows=3; ta.maxLength=2000; fk(ta,'pt-question'); ta.style.width='100%';
  ta.placeholder='Votre question sur le dossier (elle sera publiée sans votre nom, avec la réponse).';
  var go=add(add(b,'div','echange-actions'),'button','btn btn-ghost','Envoyer la question'); fk(go,'pt-question-go');
  if(limite) add(go.parentNode,'span','muted','Questions reçues jusqu’au '+new Date(limite).toLocaleDateString('fr-FR',{ day:'numeric', month:'long' })+'.');
  go.addEventListener('click',function(){
    var v=ta.value.trim(); if(v.length<10){ toast('Votre question est trop courte.'); ta.focus(); return; }
    envoyerPortail(go,'POST','/questions',{ question:v },'Question envoyée à l’acheteur.');
  });
}

/* Après le dépôt : demandes de clarification qui visent son offre, et réclamations. */
function vPortailSuivi(m){
  var cl=state.clarifs||[];
  if(cl.length){
    var b=carteEchange(m,'Demandes de clarification');
    add(b,'p','muted','L’acheteur vous demande de préciser un point de votre offre. Votre réponse ne peut modifier ni votre prix ni le contenu de votre offre.');
    cl.forEach(function(x){
      var e=add(b,'div','echange');
      var t=add(e,'div','echange-tete'); add(t,'strong',null,x.objet); add(t,'span','muted','Reçue le '+x.t+(x.echeance?' · réponse attendue avant le '+x.echeance:''));
      add(e,'p',null,x.question);
      if(x.statut!=='envoyee'){ var rp=add(e,'div','echange-reponse'); add(rp,'strong',null,'Votre réponse — '+(x.tRep||'')); add(rp,'p',null,x.reponse||''); return; }
      var ta=add(e,'textarea'); ta.rows=3; ta.maxLength=5000; fk(ta,'pt-clarif-'+x.i); ta.style.width='100%'; ta.setAttribute('aria-label','Votre réponse à : '+x.objet);
      var go=add(add(e,'div','echange-actions'),'button','btn btn-primary btn-sm','Envoyer ma réponse'); fk(go,'pt-clarif-go-'+x.i);
      go.addEventListener('click',function(){
        var v=ta.value.trim(); if(!v){ toast('La réponse est vide.'); ta.focus(); return; }
        envoyerPortail(go,'PUT','/clarifications/'+x.i+'/reponse',{ reponse:v },'Réponse envoyée à l’acheteur.');
      });
    });
  }
  if(!(state.receipts||[]).length) return; // réclamation réservée à qui a déposé une offre
  var br=carteEchange(m,'Réclamations');
  (state.reclamations||[]).forEach(function(x){
    var e=add(br,'div','echange');
    var t=add(e,'div','echange-tete'); add(t,'strong',null,x.objet); add(t,'span','muted','Adressée le '+x.t);
    chipCellule(t, x.statut==='traitee'?'Réponse reçue':'En cours d’examen', x.statut==='traitee'?'c-green':'c-amber');
    add(e,'p',null,x.texte);
    if(x.reponse){ var rp=add(e,'div','echange-reponse'); add(rp,'strong',null,'Réponse de l’acheteur — '+(x.tRep||'')); add(rp,'p',null,x.reponse); }
  });
  var d=add(br,'details','echange-nouvelle'); if(!(state.reclamations||[]).length) d.open=false;
  add(d,'summary',null,'Adresser une réclamation');
  var lo=add(d,'label',null,'Objet'); lo.setAttribute('for','pt-rec-objet');
  var ob=add(d,'input'); ob.type='text'; ob.id='pt-rec-objet'; ob.maxLength=200; fk(ob,'pt-rec-objet');
  var lt=add(d,'label',null,'Exposé de la réclamation'); lt.setAttribute('for','pt-rec-texte');
  var tx=add(d,'textarea'); tx.id='pt-rec-texte'; tx.rows=4; tx.maxLength=3000; fk(tx,'pt-rec-texte'); tx.style.width='100%';
  var go=add(add(d,'div','echange-actions'),'button','btn btn-ghost','Adresser la réclamation'); fk(go,'pt-rec-go');
  go.addEventListener('click',function(){
    if(ob.value.trim().length<3 || tx.value.trim().length<10){ toast('Indiquez l’objet et le détail de votre réclamation.'); return; }
    envoyerPortail(go,'POST','/reclamations',{ objet:ob.value.trim(), texte:tx.value.trim() },'Réclamation adressée à l’acheteur.');
  });
}
