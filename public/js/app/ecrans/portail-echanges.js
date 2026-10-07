/* Marché+ — Portail du fournisseur : l'écran « Échanges », conversation avec l'acheteur sur une consultation (additifs,
   questions et réponses, demandes de clarification qui visent son offre, réclamations), et la carte du résultat de
   l'écran « Mon offre ». Chaque envoi passe par une route dédiée du serveur, qui pose l'auteur, la date et le statut ;
   l'état est ensuite relu.
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
  else if(r.statut!=='infructueux') add(b,'p','muted','Si vous contestez cette décision, adressez une réclamation motivée depuis l’onglet « Échanges ».');
  var o=state.monOffre||{}, mp=state.monPartenaire||{};
  var bl=add(b,'button','btn btn-ghost btn-sm','Télécharger la lettre (PDF)'); fk(bl,'ma-lettre');
  bl.addEventListener('click',function(){
    telechargerLettres([{ nom:o.name||mp.raisonSociale||'', pays:o.iso?paysLettre(o.iso):'', montant:o.montant, devise:o.devise, resultat:r }],'Résultat '+REF()+'.pdf');
  });
}

function paysLettre(iso){ return ({ CI:'Côte d’Ivoire', BF:'Burkina Faso', SN:'Sénégal', ML:'Mali', NE:'Niger', TG:'Togo', BJ:'Bénin', GW:'Guinée-Bissau' })[iso] || iso; }

/* Parcours du fournisseur sur un appel d'offres, en trois étapes : 1. cahier des charges et échanges avec l'acheteur ;
   2. préparation de l'offre ; 3. soumission (contrôle, dépôt, puis offre déposée et résultat). */
function clarifsEnAttente(){ return (state.clarifs||[]).filter(function(x){ return x.statut==='envoyee'; }).length; }
var ETAPES_FOURNISSEUR = [['echanges','Cahier des charges & échanges'],['portail','Préparation de l’offre'],['soumission','Soumission']];
function etapesFournisseur(m, actif){
  var d=state.draft||{}, o=state.monOffre;
  var prepare = !!o || ((d.lots||[]).length>0 && d.lots.every(function(id){ return Number((d.prixLots||{})[id])>0; }) && !!Number(d.delai));
  var etat={ echanges: actif!=='echanges' || prepare ? 'done' : 'now', portail: o || (prepare && actif==='soumission') ? 'done' : (actif==='portail' ? 'now' : 'todo'),
    soumission: o ? 'done' : (actif==='soumission' ? 'now' : 'todo') };
  var ol=add(m,'ol','ao-etapes'); ol.setAttribute('aria-label','Étapes de votre réponse');
  ETAPES_FOURNISSEUR.forEach(function(x,i){
    var li=add(ol,'li','ao-etape '+etat[x[0]]+(x[0]===actif?' actif':''));
    var b=add(li,'button'); b.type='button'; fk(b,'etape-f-'+x[0]);
    var n=add(b,'span','ao-etape-n'); if(etat[x[0]]==='done' && x[0]!==actif) icon(n,'check'); else n.textContent=String(i+1);
    add(b,'span','ao-etape-lab',x[1]);
    if(x[0]==='echanges'){ var k=clarifsEnAttente(); if(k){ var bd=add(b,'span','ao-etape-badge',String(k)); bd.title=k+' demande(s) de clarification en attente de votre réponse'; } }
    if(x[0]===actif) b.setAttribute('aria-current','step');
    b.addEventListener('click',function(){ if(x[0]!==actif) go(x[0]); });
  });
}

/* Date d'un échange (« 07/10/2026 13:14:34 » ou « 07/10/2026 »), pour ordonner la conversation. */
function dateEchange(t){
  var x=/^(\d{2})\/(\d{2})\/(\d{4})(?:\D+(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(t||''));
  return x ? Date.UTC(+x[3],+x[2]-1,+x[1],+(x[4]||0),+(x[5]||0),+(x[6]||0)) : 0;
}
/* Les messages de la conversation, du plus ancien au plus récent. */
function filEchanges(){
  var f=[];
  (state.additifs||[]).forEach(function(a,i){ f.push({ t:a.t, de:'acheteur', type:'Additif n° '+(a.n||i+1), titre:a.objet, texte:a.texte, report:a.report }); });
  (state.qa||[]).forEach(function(q){
    f.push({ t:q.t, de:q.mienne?'vous':'autre', type:'Question', texte:q.question });
    if(q.reponse) f.push({ t:q.tRep||q.t, de:'acheteur', type:'Réponse publiée', cite:q.question, texte:q.reponse });
  });
  (state.clarifs||[]).forEach(function(x){
    f.push({ t:x.t, de:'acheteur', type:'Demande de clarification', titre:x.objet, texte:x.question, clarif:x.statut==='envoyee'?x:null, echeance:x.echeance });
    if(x.reponse) f.push({ t:x.tRep||x.t, de:'vous', type:'Votre réponse', cite:x.objet, texte:x.reponse });
  });
  (state.reclamations||[]).forEach(function(x){
    f.push({ t:x.t, de:'vous', type:'Réclamation', titre:x.objet, texte:x.texte });
    if(x.reponse) f.push({ t:x.tRep||x.t, de:'acheteur', type:'Réponse à votre réclamation', cite:x.objet, texte:x.reponse });
  });
  return f.map(function(x,i){ x.ordre=i; return x; }).sort(function(a,b){ return (dateEchange(a.t)-dateEchange(b.t)) || (a.ordre-b.ordre); });
}

/* Écran « Échanges » : la conversation avec l'acheteur, et la saisie d'une question ou d'une réclamation. */
var AUTEURS_ECHANGE = { acheteur:'Acheteur', vous:'Vous', autre:'Une entreprise consultée' };
function vEchanges(m){
  var c=state.cdc;
  if (!c.cdcPublie) return locked(m,"Les échanges s'ouvrent une fois le dossier publié.",'cdc','Aller au dossier');
  var h=add(m,'div','head'); add(add(h,'div'),'h1',null,'Cahier des charges & échanges');
  var ech=R.echeanceDepot(c), reste=ech ? ech-Date.now() : null, clos=reste!=null && reste<=0;
  if(viewAllowed('procedures')) retourListe(m,'Appels d’offres',function(){ go('procedures'); },'retour-registre');
  etapesFournisseur(m,'echanges');
  ficheAppelOffres(m, clos, reste);

  var k=add(m,'section','card chat'); k.setAttribute('aria-label','Conversation avec l’acheteur');
  var ph=add(k,'div','panel-head'); add(ph,'span',null,'Conversation');
  add(ph,'span','muted chat-aide','Questions et réponses : visibles de toutes les entreprises consultées, sans nom. Clarifications et réclamations : entre l’acheteur et vous.');
  var fil=add(k,'div','chat-fil'); fil.setAttribute('role','log'); fil.setAttribute('aria-live','polite');
  var msgs=filEchanges();
  if(!msgs.length) add(fil,'p','muted chat-vide','Aucun échange pour l’instant. Posez une question sur le dossier ci-dessous : la réponse de l’acheteur apparaîtra ici.');
  msgs.forEach(function(x){
    var b=add(fil,'div','chat-msg de-'+x.de);
    var t=add(b,'div','chat-tete'); add(t,'strong',null,AUTEURS_ECHANGE[x.de]); add(t,'span','chat-type',x.type); add(t,'span','muted',x.t||'');
    if(x.cite) add(b,'div','chat-cite',x.cite.length>140 ? x.cite.slice(0,140)+'…' : x.cite);
    if(x.titre) add(b,'div','chat-titre',x.titre);
    String(x.texte||'').split(/\n\s*\n/).forEach(function(p){ if(p.trim()) add(b,'p',null,p.trim()); });
    if(x.report) chipCellule(b,'Date limite reportée au '+dateLongue(x.report),'c-amber');
    if(x.clarif){
      // demande de clarification en attente : réponse dans la bulle
      add(b,'div','chat-note','Votre réponse ne peut modifier ni votre prix ni le contenu de votre offre.'+(x.echeance?' Réponse attendue avant le '+x.echeance+'.':''));
      var ta=add(b,'textarea'); ta.rows=3; ta.maxLength=5000; fk(ta,'pt-clarif-'+x.clarif.i); ta.setAttribute('aria-label','Votre réponse à : '+x.titre);
      var go2=add(add(b,'div','chat-actions'),'button','btn btn-primary btn-sm','Répondre'); fk(go2,'pt-clarif-go-'+x.clarif.i);
      go2.addEventListener('click',function(){
        var v=ta.value.trim(); if(!v){ toast('La réponse est vide.'); ta.focus(); return; }
        envoyerPortail(go2,'PUT','/clarifications/'+x.clarif.i+'/reponse',{ reponse:v },'Réponse envoyée à l’acheteur.');
      });
    }
  });
  setTimeout(function(){ fil.scrollTop=fil.scrollHeight; },0);

  /* Saisie : une question (jusqu'à 3 jours avant l'échéance) ou une réclamation (après un dépôt) */
  var limite=ech ? ech-QUESTIONS_JOURS_AVANT*86400000 : null, questionOuverte=!limite || Date.now()<=limite;
  var reclamation=(state.receipts||[]).length>0;
  var sa=add(k,'div','chat-saisie');
  if(!questionOuverte && !reclamation) add(sa,'p','muted','Les questions sont closes '+QUESTIONS_JOURS_AVANT+' jours avant la date limite de dépôt.');
  else saisieEchange(sa, limite, questionOuverte, reclamation);
  var pied=add(m,'div','ao-etape-pied');
  add(pied,'span','muted', state.monOffre ? 'Votre offre est déposée.' : 'Dossier lu ? Préparez votre offre.');
  var nx=add(pied,'button','btn btn-primary', state.monOffre ? 'Voir mon offre →' : 'Préparer mon offre →'); fk(nx,'vers-preparation');
  nx.addEventListener('click',function(){ go(state.monOffre ? 'soumission' : 'portail'); });
}
/* Saisie d'une question (jusqu'à 3 jours avant l'échéance) ou d'une réclamation (après un dépôt), sous la conversation. */
function saisieEchange(sa, limite, questionOuverte, reclamation){
  UI.typeEchange = UI.typeEchange && ((UI.typeEchange==='question' && questionOuverte) || (UI.typeEchange==='reclamation' && reclamation)) ? UI.typeEchange : (questionOuverte?'question':'reclamation');
  var types=add(sa,'div','chat-types'); types.setAttribute('role','radiogroup'); types.setAttribute('aria-label','Type de message');
  [['question','Question sur le dossier',questionOuverte],['reclamation','Réclamation',reclamation]].forEach(function(o){
    if(!o[2]) return;
    var b=add(types,'button','pill'+(UI.typeEchange===o[0]?' on':''),o[1]); b.type='button'; b.setAttribute('role','radio'); b.setAttribute('aria-checked',UI.typeEchange===o[0]?'true':'false'); fk(b,'chat-type-'+o[0]);
    b.addEventListener('click',function(){ UI.typeEchange=o[0]; render(); });
  });
  var rec=UI.typeEchange==='reclamation';
  var ob=null;
  if(rec){ ob=add(sa,'input'); ob.type='text'; ob.maxLength=200; ob.placeholder='Objet de la réclamation'; ob.setAttribute('aria-label','Objet de la réclamation'); fk(ob,'pt-rec-objet'); }
  var ligne=add(sa,'div','chat-ligne');
  var tx=add(ligne,'textarea'); tx.rows=2; tx.maxLength=rec?3000:2000; fk(tx, rec?'pt-rec-texte':'pt-question');
  tx.placeholder = rec ? 'Exposez votre réclamation : ce que vous contestez et pourquoi.' : 'Votre question sur le dossier (publiée sans votre nom, avec la réponse).';
  tx.setAttribute('aria-label', rec ? 'Exposé de la réclamation' : 'Votre question');
  var env=add(ligne,'button','btn btn-primary','Envoyer'); fk(env, rec?'pt-rec-go':'pt-question-go');
  add(sa,'div','muted chat-aide', rec ? 'La réclamation et la réponse de l’acheteur restent entre lui et votre entreprise.'
    : 'Questions reçues jusqu’au '+(limite?new Date(limite).toLocaleDateString('fr-FR',{ day:'numeric', month:'long' }):'—')+'. La réponse est communiquée à toutes les entreprises consultées.');
  env.addEventListener('click',function(){
    var v=tx.value.trim();
    if(rec){
      if(!ob.value.trim() || v.length<10){ toast('Indiquez l’objet et le détail de votre réclamation.'); return; }
      envoyerPortail(env,'POST','/reclamations',{ objet:ob.value.trim(), texte:v },'Réclamation adressée à l’acheteur.');
    } else {
      if(v.length<10){ toast('Votre question est trop courte.'); tx.focus(); return; }
      envoyerPortail(env,'POST','/questions',{ question:v },'Question envoyée à l’acheteur.');
    }
  });
}
