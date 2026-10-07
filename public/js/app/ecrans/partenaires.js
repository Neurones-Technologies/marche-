/* Marché+ — Écrans du référencement (module 1) : « Mon référencement » (prestataire) et « Partenaires » (achats).
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Les fiches appartiennent à l'organisation : elles se chargent par /api/partenaires, hors de l'état de la procédure. */
"use strict";

var STATUTS_PARTENAIRE = {
  candidat: ['Dossier à compléter','c-grey'], verification: ['En instruction','c-amber'], rejete: ['À corriger','c-red'],
  reference: ['Référencé','c-green'], suspendu: ['Suspendu','c-amber'], exclu: ['Exclu','c-red']
};
var ETATS_PIECE = {
  manquante: ['Manquante','c-red'], a_verifier: ['À vérifier','c-amber'], valide: ['Validée','c-green'],
  refuse: ['Refusée','c-red'], expiree: ['Expirée','c-red']
};
UI.partenaire = null;

function chipStatutPartenaire(parent, s){ var x=STATUTS_PARTENAIRE[s]||[s,'c-grey']; return add(parent,'span','chip '+x[1],x[0]); }

/* Questions du formulaire de référencement (Paramètres) : un champ selon le type de réponse attendue. */
var TYPES_QUESTION = { texte:'Texte', nombre:'Nombre', date:'Date', choix:'Liste de choix', ouinon:'Oui / non' };
function champQuestion(parent, q, val, inactif){
  var w=add(parent,'div'); var id='q-'+q.id;
  add(w,'label',null,q.label+(q.obligatoire?' *':'')).setAttribute('for',id);
  var i;
  if(q.type==='choix' || q.type==='ouinon'){
    i=add(w,'select'); add(i,'option',null,'—').value='';
    (q.type==='ouinon' ? [['oui','Oui'],['non','Non']] : (q.options||[]).map(function(o){ return [o,o]; }))
      .forEach(function(x){ add(i,'option',null,x[1]).value=x[0]; });
  } else if(q.type==='texte'){ i=add(w,'textarea'); i.rows=2; i.maxLength=2000; }
  else { i=add(w,'input'); i.type=q.type==='nombre'?'number':'date'; }
  i.id=id; fk(i,id); i.value=val==null?'':String(val); i.disabled=!!inactif;
  return i;
}
function valeurReponse(q, v){
  if(v==null || v==='') return '—';
  if(q.type==='ouinon') return v==='oui'?'Oui':'Non';
  if(q.type==='nombre') return Number(v).toLocaleString('fr-FR');
  return String(v);
}

/* Parcours de référencement (lecture, ou décisions pour les achats). */
function circuitPartenaire(parent, p, decider){
  if(!p.circuit || !p.circuit.length || p.statut==='candidat') return;
  var k=add(parent,'div','card'); k.style.marginTop='18px';
  add(k,'div','panel-head','Parcours de référencement');
  var b=add(k,'div','pad');
  var fp = p.statut==='verification' ? MPCircuits.prochaine(p.circuit) : -1;
  p.circuit.forEach(function(e,i){
    var row=add(b,'div','stepline');
    add(row,'div','stepnum '+(e.done?'done':(i===fp?'now':'')), e.done?'✓':String(i+1));
    var d=add(row,'div'); d.style.flex='1 1 auto';
    add(d,'strong',null,e.role); add(d,'div','muted',e.who||'');
    if(e.done){ add(row,'span','chip c-green','Franchie le '+e.at); parQui(d,e); }
    else if(i===fp){ suppleanceNiveau(row,'referencement',p.id,i,e,'Partenaire '+p.id+' — '+p.raisonSociale); if(decider) decider(row,e,i); else add(row,'span','chip c-grey','En cours'); }
    else add(row,'span','chip c-grey', i===fp ? 'En cours' : 'En attente');
  });
}
function historiquePartenaire(parent, p){
  var k=add(parent,'div','card'); k.style.marginTop='18px';
  add(k,'div','panel-head','Historique');
  var b=add(k,'div','pad');
  (p.historique||[]).slice().reverse().forEach(function(x){
    var row=add(b,'div','docline'); var lf=add(row,'div');
    add(lf,'div',null,x.action); add(lf,'div','muted',x.who);
    add(row,'span','chip c-grey',x.t);
  });
}

/* Évaluations reçues (module 5) : une par commande clôturée, et la note moyenne. */
function evaluationsPartenaire(parent, p){
  if(!p.evaluations || !p.evaluations.length) return;
  var k=add(parent,'div','card'); k.style.marginTop='18px';
  var ph=add(k,'div','panel-head'); add(ph,'span',null,'Évaluation sur les commandes exécutées');
  if(p.evaluation) add(ph,'span','chip '+(p.evaluation.alerte?'c-red':'c-green'),p.evaluation.moyenne+'/100 sur '+p.evaluation.nb+' commande(s)'+(p.evaluation.alerte?' — sous le seuil de '+p.evaluation.seuil:''));
  var b=add(k,'div','pad');
  p.evaluations.slice().reverse().forEach(function(e){
    var row=add(b,'div','docline'); var lf=add(row,'div'); lf.style.flex='1 1 260px';
    add(lf,'strong',null,(e.commande||'')+' — '+e.procedure);
    add(lf,'div','muted','Délais '+e.scores.delais+' · conformité '+e.scores.conformite+' · complétude '+e.scores.completude+' · qualité '+e.scores.qualite+(e.retard?' · '+e.retard+' jour(s) de retard':'')+(e.commentaire?' · « '+e.commentaire+' »':''));
    add(row,'span','chip c-grey',e.note+'/100');
  });
  add(add(k,'div','panel-foot'),'span','muted','Une note sous le seuil lève une alerte ; elle n\u2019entraîne jamais de suspension automatique. Les évaluateurs des offres la voient, sans effet sur le classement.');
}

/* Collaborateurs de l'entreprise : chacun a son propre compte et voit la même offre en cours, les mêmes fichiers et
   accusés. Un collaborateur invite un collègue (lien pour choisir son mot de passe) ou retire un accès. */
var INVITATION_DEMO = null; // dernier lien d'invitation, quand aucun courriel n'est envoyé (démonstration) : survit au rendu
function collaborateursPartenaire(zone, p){
  var k=add(zone,'div','card'); k.style.marginTop='18px';
  add(k,'div','panel-head','Collaborateurs');
  var b=add(k,'div','pad'); add(b,'p','muted','Chargement…');
  function dessiner(comptes){
    b.textContent='';
    add(b,'p','muted','Chaque collaborateur se connecte avec son propre compte. Tous voient et préparent la même offre de l’entreprise, sur chaque consultation.');
    comptes.filter(function(c){ return c.actif; }).forEach(function(c){
      var row=add(b,'div','docline');
      var lf=add(row,'div'); var t=add(lf,'div'); t.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
      add(t,'strong',null,c.nom);
      if(c.moi) add(t,'span','chip c-violet','Vous');
      else if(!c.derniereConnexion) add(t,'span','chip c-amber','Invitation envoyée');
      add(lf,'div','muted',c.email+(c.derniereConnexion?' · dernière connexion le '+String(c.derniereConnexion).slice(0,10).split('-').reverse().join('/'):''));
      if(c.moi) return;
      var rm=add(row,'button','btn btn-ghost btn-sm','Retirer l’accès'); fk(rm,'collab-retirer-'+c.id);
      rm.addEventListener('click',function(){
        ask(c.nom+' ne pourra plus se connecter. Les offres déjà déposées restent celles de l’entreprise.',function(){
          MP.api('DELETE','/api/partenaires/'+enc(p.id)+'/comptes/'+enc(c.id),{}).then(function(){ toast('Accès retiré à '+c.nom+'.'); charger(); })
            .catch(function(e){ toast(e.message||'Retrait impossible.'); });
        },'Retirer l’accès de '+c.nom+' ?','Retirer l’accès');
      });
    });
    if(p.statut==='exclu') return;
    var f=add(b,'div','frm'); f.style.marginTop='14px';
    var wn=add(f,'div'); add(wn,'label',null,'Nom du collègue').setAttribute('for','collab-nom');
    var nom=add(wn,'input'); nom.type='text'; nom.id='collab-nom'; nom.maxLength=120; fk(nom,'collab-nom');
    var we=add(f,'div'); add(we,'label',null,'Son courriel professionnel').setAttribute('for','collab-email');
    var em=add(we,'input'); em.type='email'; em.id='collab-email'; em.maxLength=200; fk(em,'collab-email');
    var go=add(add(b,'div','echange-actions'),'button','btn btn-ghost','Inviter ce collègue'); fk(go,'collab-inviter');
    add(go.parentNode,'span','muted','Il reçoit un lien, valable 72 heures, pour choisir son mot de passe.');
    go.addEventListener('click',function(){
      if(nom.value.trim().length<2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em.value.trim())){ toast('Indiquez le nom et le courriel du collègue.'); return; }
      go.disabled=true;
      MP.api('POST','/api/partenaires/'+enc(p.id)+'/comptes',{ nom:nom.value.trim(), email:em.value.trim() }).then(function(r){
        toast('Invitation envoyée à '+r.compte.email+'.');
        INVITATION_DEMO = r.lien ? { email:r.compte.email, lien:r.lien } : null;
        charger();
      }).catch(function(e){ go.disabled=false; toast(e.message||'Invitation impossible.'); });
    });
  }
  function charger(){
    MP.api('GET','/api/partenaires/'+enc(p.id)+'/comptes').then(function(r){
      dessiner(r.comptes);
      // démonstration sans envoi de courriel : le lien d'invitation est affiché pour pouvoir avancer
      var inv=INVITATION_DEMO;
      if(inv && r.comptes.some(function(c){ return c.email===inv.email && c.actif && !c.derniereConnexion; })){
        var n=add(b,'div','note'); n.style.marginTop='12px'; add(n,'strong',null,'Aucun courriel envoyé (démonstration). ');
        n.appendChild(document.createTextNode('Lien à transmettre à '+inv.email+' : '+inv.lien));
      }
    }).catch(function(e){ b.textContent=''; add(b,'p','muted',e.message); });
  }
  charger();
}

/* ============ Mon référencement (prestataire) ============ */
function vReferencement(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Mon référencement');
  var zone=add(m,'div'); add(zone,'p','muted','Chargement…');

  function charger(){
    MP.api('GET','/api/partenaires/moi').then(function(r){ zone.textContent=''; dessiner(r.partenaire); })
      .catch(function(e){ zone.textContent=''; add(zone,'p','muted',e.message); });
  }
  function apres(promesse, message){
    return promesse.then(function(r){ if(message) toast(message); zone.textContent=''; dessiner(r.partenaire); })
      .catch(function(e){ toast(e.message); charger(); });
  }
  function dessiner(p){
    if(!p){ vide(zone,'🏢','Aucune fiche entreprise','Votre compte n’est rattaché à aucune fiche partenaire. Contactez le service des achats.'); return; }
    var editable=['candidat','rejete','reference','suspendu'].indexOf(p.statut)>=0;
    var identiteFigee=['reference','suspendu'].indexOf(p.statut)>=0;
    var piecesOuvertes=['verification','exclu'].indexOf(p.statut)<0;

    var ks=add(zone,'div','card pad');
    var t=add(ks,'div'); t.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap';
    add(t,'strong',null,p.raisonSociale+' — '+p.id).style.fontSize='18px';
    chipStatutPartenaire(t,p.statut);
    var expl={ candidat:'Complétez la fiche et déposez toutes les pièces exigées, puis soumettez votre dossier.',
      verification:'Votre dossier est en cours d’instruction par le service des achats. Fiche et pièces sont figées le temps de l’examen.',
      rejete:'Votre dossier est à corriger (motif ci-dessous), puis à soumettre de nouveau.',
      reference:'Vous êtes référencé'+(p.referenceLe?' depuis le '+p.referenceLe:'')+'. Tenez vos pièces à jour : une pièce expirée doit être remplacée.',
      suspendu:'Votre référencement est suspendu : vous ne pouvez pas déposer d’offre là où le référencement est exigé.',
      exclu:'Votre entreprise a été exclue du référencement.' };
    add(ks,'p','muted',expl[p.statut]||'').style.marginTop='8px';
    if(p.rejet && p.statut==='rejete'){ var w=add(ks,'div','warn'); add(w,'strong',null,'Motif ('+p.rejet.role+', '+p.rejet.at+') : '); w.appendChild(document.createTextNode(p.rejet.motif)); }
    if(p.decision && (p.statut==='suspendu'||p.statut==='exclu')){ var w2=add(ks,'div','warn'); add(w2,'strong',null,'Motif : '); w2.appendChild(document.createTextNode(p.decision.motif)); }

    /* Fiche */
    var kf=add(zone,'div','card'); kf.style.marginTop='18px';
    add(kf,'div','panel-head','Fiche entreprise');
    var bf=add(kf,'div','pad'); var f=add(bf,'div','frm'), ch={};
    function champ(cle, lab, val, verrou){
      var wd=add(f,'div'); var id='ref-'+cle; add(wd,'label',null,lab).setAttribute('for',id);
      var i=add(wd,'input'); i.type='text'; i.id=id; i.value=val||''; fk(i,id); i.disabled=!editable || !!verrou; ch[cle]=i;
    }
    champ('raisonSociale','Raison sociale',p.raisonSociale,identiteFigee);
    champ('pays','Pays (code à deux lettres)',p.pays,identiteFigee);
    champ('immatriculation','Numéro d’immatriculation (RCCM ou équivalent)',p.immatriculation,identiteFigee);
    champ('adresse','Adresse',p.adresse);
    champ('cnom','Contact — nom',(p.contact||{}).nom);
    champ('cemail','Contact — courriel',(p.contact||{}).email);
    champ('ctel','Contact — téléphone',(p.contact||{}).tel);
    champ('domaines','Domaines d’activité (séparés par des virgules)',(p.domaines||[]).join(', '));
    var ff=add(kf,'div','panel-foot');
    add(ff,'span','muted', identiteFigee ? 'Raison sociale, pays et immatriculation d’un partenaire référencé ne se modifient que par le service des achats.' : 'Ces informations sont vérifiées lors de l’instruction.');
    if(editable){
      var be=add(ff,'button','btn btn-ghost btn-sm','Enregistrer la fiche'); fk(be,'ref-enr');
      be.addEventListener('click',function(){
        apres(MP.api('PUT','/api/partenaires/'+enc(p.id),{ raisonSociale:ch.raisonSociale.value, pays:ch.pays.value, immatriculation:ch.immatriculation.value,
          adresse:ch.adresse.value, contact:{nom:ch.cnom.value, email:ch.cemail.value, tel:ch.ctel.value},
          domaines:ch.domaines.value.split(',').map(function(x){ return x.trim(); }).filter(Boolean) }),'Fiche enregistrée.');
      });
    }

    /* Questionnaire (formulaire de référencement de l'organisation) */
    var questions=p.questions||[], rep=p.reponses||{};
    if(questions.length){
      var kq=add(zone,'div','card'); kq.style.marginTop='18px';
      add(kq,'div','panel-head','Questionnaire de référencement');
      var fq=add(add(kq,'div','pad'),'div','frm'), qs={};
      questions.forEach(function(q){ qs[q.id]=champQuestion(fq,q,rep[q.id],!editable); });
      var fqf=add(kq,'div','panel-foot');
      add(fqf,'span','muted','Les questions marquées * sont obligatoires pour soumettre le dossier.');
      if(editable){
        var bq=add(fqf,'button','btn btn-ghost btn-sm','Enregistrer les réponses'); fk(bq,'ref-rep');
        bq.addEventListener('click',function(){
          var r={}; questions.forEach(function(q){ r[q.id]=qs[q.id].value; });
          apres(MP.api('PUT','/api/partenaires/'+enc(p.id),{ reponses:r }),'Réponses enregistrées.');
        });
      }
    }

    /* Pièces */
    var kp=add(zone,'div','card'); kp.style.marginTop='18px';
    add(kp,'div','panel-head','Pièces administratives');
    var bp=add(kp,'div','pad');
    if(!p.pays) add(bp,'p','muted','Indiquez le pays d’établissement : la liste des pièces exigées en dépend.');
    p.exigees.forEach(function(e){
      var row=add(bp,'div','docline');
      var lf=add(row,'div'); lf.style.flex='1 1 260px';
      var tl=add(lf,'div'); add(tl,'span',null,e.label).style.fontWeight='600';
      add(tl,'span','chip '+(e.obligatoire?'c-grey':'c-teal'), e.obligatoire?'Obligatoire':'Facultative').style.marginLeft='8px';
      if(e.piece) add(lf,'div','muted',e.piece.nom+' · déposée le '+e.piece.depose+(e.piece.expire?' · valable jusqu’au '+e.piece.expire:''));
      if(e.piece && e.piece.statut==='refuse' && e.piece.motif) add(lf,'div','muted','Refusée : '+e.piece.motif);
      var x=ETATS_PIECE[e.etat]||[e.etat,'c-grey']; add(row,'span','chip '+x[1],x[0]);
      if(!piecesOuvertes) return;
      var act=add(row,'div'); act.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
      var dt=add(act,'input'); dt.type='date'; dt.setAttribute('aria-label','Date de fin de validité — '+e.label); fk(dt,'ref-exp-'+e.id);
      dt.title=e.expiration ? 'Date de fin de validité : obligatoire pour cette pièce' : 'Date de fin de validité, si la pièce en a une';
      if(e.expiration) dt.required=true;
      var inp=el('input'); inp.type='file'; inp.accept='.pdf,.png,.jpg,.jpeg,.docx,.xlsx'; inp.hidden=true; inp.setAttribute('aria-label','Choisir le fichier : '+e.label); act.appendChild(inp);
      var bt=add(act,'button','pill'+(e.piece?' on':''), e.piece?'Remplacer':'Déposer'); fk(bt,'ref-doc-'+e.id);
      bt.addEventListener('click',function(){ inp.click(); });
      inp.addEventListener('change',function(){
        var fi=inp.files&&inp.files[0]; if(!fi) return;
        if(fi.size>10*1024*1024){ toast('Fichier trop volumineux (10 Mo maximum).'); return; }
        if(e.expiration && !dt.value){ toast('Indiquez d’abord la date de fin de validité de « '+e.label+' ».'); inp.value=''; dt.focus(); return; }
        bt.disabled=true; bt.textContent='Envoi…';
        apres(MP.upload('/api/partenaires/'+enc(p.id)+'/fichiers?doc='+enc(e.id)+(dt.value?'&expire='+enc(dt.value):''), fi),'Pièce déposée.');
      });
    });
    if(p.statut==='candidat' || p.statut==='rejete'){
      var fp_=add(kp,'div','panel-foot');
      var manquent=p.exigees.filter(function(e){ return e.obligatoire && ['manquante','expiree','refuse'].indexOf(e.etat)>=0; }).length;
      var sansReponse=questions.filter(function(q){ return q.obligatoire && (rep[q.id]==null || rep[q.id]===''); }).length;
      add(fp_,'span','muted', manquent||sansReponse ? [manquent?manquent+' pièce(s) obligatoire(s) à déposer':'', sansReponse?sansReponse+' question(s) obligatoire(s) sans réponse':''].filter(Boolean).join(' et ')+' avant de soumettre le dossier.' : 'Dossier complet : vous pouvez le soumettre.');
      manquent+=sansReponse;
      var bs=add(fp_,'button','btn btn-primary','Soumettre mon dossier'); fk(bs,'ref-soum'); bs.disabled=manquent>0;
      bs.addEventListener('click',function(){
        ask('Pendant l’instruction, la fiche et les pièces ne se modifient plus.', function(){
          apres(MP.api('POST','/api/partenaires/'+enc(p.id)+'/soumettre',{}),'Dossier soumis au référencement.');
        },'Soumettre le dossier de référencement ?','Soumettre');
      });
    }
    collaborateursPartenaire(zone,p);
    evaluationsPartenaire(zone,p);
    circuitPartenaire(zone,p,null);
    historiquePartenaire(zone,p);
  }
  charger();
}

/* ============ Partenaires (achats) ============ */
function vPartenaires(m){
  if(!can('partenaires.manage')) return denyBox(m,'partenaires.manage');
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Partenaires');
  var zone=add(m,'div'); add(zone,'p','muted','Chargement…');

  function charger(){
    MP.api('GET','/api/partenaires').then(function(r){ zone.textContent=''; dessiner(r.partenaires); })
      .catch(function(e){ zone.textContent=''; add(zone,'p','muted',e.message); });
  }
  function agir(method, path, body, message){
    return MP.api(method,'/api/partenaires/'+path,body||{}).then(function(){ if(message) toast(message); charger(); })
      .catch(function(e){ toast(e.message); charger(); });
  }
  function dessiner(list){
    tableau(zone,{ cle:'partenaires', lignes:list, vide:'Aucun partenaire : les prestataires s’inscrivent sur le portail des partenaires (lien dans Paramètres).',
      colonnes:[
        {lab:'N°', val:function(p){ return p.id; }},
        {lab:'Raison sociale', val:function(p){ return p.raisonSociale; }},
        {lab:'Pays', val:function(p){ return p.pays || '—'; }},
        {lab:'Domaines', val:function(p){ return (p.domaines||[]).join(', ') || '—'; }},
        {lab:'Pièces à examiner', num:true, val:function(p){ return p.exigees.filter(function(e){ return e.etat==='expiree'||e.etat==='a_verifier'; }).length || '—'; }},
        {lab:'Note', num:true, rendu:function(p,td){ if(p.evaluation && p.evaluation.nb) chipCellule(td, p.evaluation.moyenne+'/100', p.evaluation.alerte?'c-red':'c-grey'); else td.textContent='—'; }},
        {lab:'Statut', rendu:function(p,td){ chipStatutPartenaire(td,p.statut); }}
      ],
      recherche:function(p){ return [p.id, p.raisonSociale, p.pays, p.immatriculation, (p.domaines||[]).join(' ')].join(' '); },
      filtres:[{ lab:'Statut', options:Object.keys(STATUTS_PARTENAIRE).map(function(k){ return [k, STATUTS_PARTENAIRE[k][0]]; }), test:function(p,v){ return p.statut===v; } }],
      actions:function(p,td){ boutonCellule(td, UI.partenaire===p.id?'Affiché':'Ouvrir', function(){ UI.partenaire=p.id; majUrl(); zone.textContent=''; dessiner(list); }, 'prt-open-'+p.id).disabled=UI.partenaire===p.id; }
    });
    var cur=list.filter(function(p){ return p.id===UI.partenaire; })[0];
    if(cur) fiche(cur);
  }
  function fiche(p){
    var rt=retourListe(zone,'Tous les partenaires',function(){ UI.partenaire=null; majUrl(); charger(); },'prt-retour'); rt.style.marginTop='18px';
    var k=add(zone,'div','card');
    var ph=add(k,'div','panel-head'); add(ph,'span',null,p.id+' — '+p.raisonSociale); chipStatutPartenaire(ph,p.statut);
    var b=add(k,'div','pad');
    [['Pays',p.pays],['Immatriculation',p.immatriculation],['Adresse',p.adresse],['Contact',[(p.contact||{}).nom,(p.contact||{}).email,(p.contact||{}).tel].filter(Boolean).join(' · ')],
     ['Domaines',(p.domaines||[]).join(', ')],['Fiche créée le',p.cree],['Référencé le',p.referenceLe]].forEach(function(x){
      if(!x[1]) return; var row=add(b,'div','docline'); add(row,'div','muted',x[0]); add(row,'div',null,x[1]);
    });
    if(p.rejet && p.statut==='rejete'){ var w=add(b,'div','warn'); add(w,'strong',null,'Rejeté ('+p.rejet.role+') : '); w.appendChild(document.createTextNode(p.rejet.motif)); }
    if(p.decision){ var w2=add(b,'div','note'); add(w2,'strong',null,'Dernière décision ('+p.decision.at+') : '); w2.appendChild(document.createTextNode(p.decision.vers+' — '+p.decision.motif)); }
    if((p.questions||[]).length){
      var kq=add(zone,'div','card'); kq.style.marginTop='18px';
      add(kq,'div','panel-head','Réponses au questionnaire');
      var bq=add(kq,'div','pad');
      p.questions.forEach(function(q){ var row=add(bq,'div','docline'); add(row,'div','muted',q.label); add(row,'div',null,valeurReponse(q,(p.reponses||{})[q.id])); });
    }
    var foot=add(k,'div','panel-foot');
    function bouton(lab, statut, msg, titre){
      var bt=add(foot,'button','btn btn-ghost btn-sm',lab); fk(bt,'prt-'+statut);
      bt.addEventListener('click',function(){
        demander(msg,function(motif){ agir('POST',enc(p.id)+'/statut',{statut:statut, motif:motif},'Partenaire '+p.id+' : '+lab.toLowerCase()+'.'); },titre,lab,'Motif');
      });
    }
    if(p.statut==='reference') bouton('Suspendre','suspendu','Le partenaire ne pourra plus déposer d’offre là où le référencement est exigé, jusqu’à sa réactivation.','Suspendre '+p.raisonSociale+' ?');
    if(p.statut==='suspendu') bouton('Réactiver','reference','Les pièces exigées doivent être validées et en cours de validité.','Réactiver '+p.raisonSociale+' ?');
    if(['reference','suspendu','candidat','rejete'].indexOf(p.statut)>=0) bouton('Exclure','exclu','L’exclusion est définitive.','Exclure '+p.raisonSociale+' ?');

    var kp=add(zone,'div','card'); kp.style.marginTop='18px';
    add(kp,'div','panel-head','Pièces administratives');
    var bp=add(kp,'div','pad');
    p.exigees.forEach(function(e){
      var row=add(bp,'div','docline');
      var lf=add(row,'div'); lf.style.flex='1 1 260px';
      var tl=add(lf,'div'); add(tl,'span',null,e.label).style.fontWeight='600';
      if(!e.obligatoire) add(tl,'span','chip c-teal','Facultative').style.marginLeft='8px';
      if(e.piece){
        var a=add(lf,'a',null,e.piece.nom); a.href='/api/files/'+e.piece.fichier; a.setAttribute('download',e.piece.nom); a.title='SHA-256 '+e.piece.sha256;
        add(lf,'div','muted','Déposée le '+e.piece.depose+(e.piece.expire?' · valable jusqu’au '+e.piece.expire:'')+(e.piece.motif?' · refus : '+e.piece.motif:''));
      }
      var x=ETATS_PIECE[e.etat]||[e.etat,'c-grey']; add(row,'span','chip '+x[1],x[0]);
      if(e.piece && e.etat==='a_verifier' && p.statut!=='verification'){
        var bv=add(row,'button','btn btn-primary btn-sm','Valider'); fk(bv,'prt-pv-'+e.id);
        bv.addEventListener('click',function(){ agir('PUT',enc(p.id)+'/pieces/'+enc(e.id),{statut:'valide'},'Pièce validée.'); });
        var br=add(row,'button','btn btn-ghost btn-sm','Refuser'); fk(br,'prt-pr-'+e.id);
        br.addEventListener('click',function(){ demander('Le partenaire devra déposer une nouvelle pièce.',function(motif){ agir('PUT',enc(p.id)+'/pieces/'+enc(e.id),{statut:'refuse',motif:motif},'Pièce refusée.'); },'Refuser la pièce « '+e.label+' » ?','Refuser','Motif'); });
      }
    });
    add(add(kp,'div','panel-foot'),'span','muted','Pendant l’instruction, les pièces sont validées en bloc au dernier niveau du parcours ; ensuite, chaque pièce renouvelée se valide ici.');

    evaluationsPartenaire(zone,p);
    circuitPartenaire(zone,p,function(row,e,i){
      var ba=add(row,'button','btn btn-primary btn-sm','Franchir'); fk(ba,'prt-app-'+i);
      ba.addEventListener('click',function(){
        ask('Cette décision est horodatée, nominative et consignée à la piste d’audit.',function(){ agir('POST',enc(p.id)+'/approbations/'+i,{},'Étape « '+e.role+' » franchie.'); },'Franchir l’étape « '+e.role+' » ?','Franchir');
      });
      var br=add(row,'button','btn btn-ghost btn-sm','Rejeter'); fk(br,'prt-rej-'+i);
      br.addEventListener('click',function(){
        demander('Le dossier retourne au partenaire, qui pourra le corriger et le soumettre de nouveau.',function(motif){ agir('POST',enc(p.id)+'/rejet',{motif:motif},'Dossier rejeté.'); },'Rejeter le dossier de '+p.raisonSociale+' ?','Rejeter','Motif du rejet');
      });
    });
    historiquePartenaire(zone,p);
  }
  charger();
}
