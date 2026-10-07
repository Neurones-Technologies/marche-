/* Marché+ — Écran Questions des candidats et additifs.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Questions des fournisseurs (posées depuis leur espace), additifs, réclamations ; le détail s'ouvre dans une fenêtre. */
"use strict";

/* ============ Questions des candidats & additifs ============ */
function vQA(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Questions des candidats et additifs');

  var ouv=state.qa.filter(function(x){return !x.reponse;}).length;
  var tq=tableau(m,{ cle:'qa', titre:'Questions reçues', lignes:state.qa.map(function(q,i){ return {q:q,i:i}; }),
    vide:'Aucune question reçue. Les fournisseurs consultés posent leurs questions depuis leur espace, jusqu’à 3 jours avant la date limite.',
    colonnes:[
      {lab:'N°', num:true, val:function(x){ return x.i+1; }},
      {lab:'Question', rendu:function(x,td){ add(td,'div','dt-extrait',x.q.question); }},
      {lab:'Reçue le', val:function(x){ return x.q.t; }},
      {lab:'Statut', rendu:function(x,td){ chipCellule(td, x.q.reponse?'Répondue':'En attente', x.q.reponse?'c-green':'c-amber'); }}
    ],
    recherche:function(x){ return x.q.question+' '+(x.q.reponse||''); },
    filtres:[{ lab:'Statut', options:[['attente','En attente'],['repondue','Répondue']], test:function(x,v){ return v==='repondue' ? !!x.q.reponse : !x.q.reponse; } }],
    actions:function(x,td){ boutonDetail(td,function(){ ouvrirQuestion(x.i); },'qa-ouvrir-'+x.i, !x.q.reponse && can('qa.answer') ? 'Répondre' : null); }
  });
  add(tq.querySelector('.dt-barre'),'span','chip '+(ouv?'c-amber':'c-green'), ouv? ouv+' sans réponse':'Toutes traitées');

  tableau(m,{ cle:'additifs', titre:'Additifs au dossier', lignes:state.additifs.map(function(a,i){ return {a:a,i:i}; }),
    vide:'Aucun additif publié. Un additif modifie le dossier après publication ; s’il change substantiellement la préparation des offres, il reporte la date limite.',
    colonnes:[
      {lab:'N°', num:true, val:function(x){ return x.i+1; }},
      {lab:'Objet', rendu:function(x,td){ add(td,'div','dt-extrait',x.a.objet); }},
      {lab:'Publié le', val:function(x){ return x.a.t; }},
      {lab:'Incidence', rendu:function(x,td){ chipCellule(td, x.a.report?'Report au '+x.a.report:'Précision', x.a.report?'c-amber':'c-grey'); }}
    ],
    recherche:function(x){ return x.a.objet; },
    nouveau: can('qa.answer') ? { lab:'Publier un additif', action:publierAdditif } : null,
    actions:function(x,td){ boutonDetail(td,function(){ ouvrirAdditif(x.i); },'add-ouvrir-'+x.i); }
  });

  // réclamations adressées par les fournisseurs ayant déposé une offre
  var rec=state.reclamations||[], ouvertes=rec.filter(function(x){ return x.statut==='ouverte'; }).length;
  var tr=tableau(m,{ cle:'reclamations', titre:'Réclamations des fournisseurs', lignes:rec,
    vide:'Aucune réclamation. Un fournisseur ayant déposé une offre peut en adresser une depuis son espace.',
    colonnes:[
      {lab:'Fournisseur', val:function(x){ return x.de; }},
      {lab:'Objet', rendu:function(x,td){ add(td,'div','dt-extrait',x.objet); }},
      {lab:'Reçue le', val:function(x){ return x.t; }},
      {lab:'Statut', rendu:function(x,td){ chipCellule(td, x.statut==='traitee'?'Répondue':'À traiter', x.statut==='traitee'?'c-green':'c-amber'); }}
    ],
    recherche:function(x){ return x.de+' '+x.objet+' '+x.texte; },
    actions:function(x,td){ boutonDetail(td,function(){ ouvrirReclamation(x.id); },'rec-'+x.id, x.statut==='ouverte' && (can('recours.handle')||can('qa.answer')) ? 'Répondre' : null); }
  });
  add(tr.querySelector('.dt-barre'),'span','chip '+(ouvertes?'c-amber':'c-green'), ouvertes? ouvertes+' à traiter':'Aucune à traiter');
}

/* Réclamation d'un fournisseur : exposé, et réponse de l'acheteur (elle la clôt et prévient son auteur). */
function ouvrirReclamation(id){
  ouvrirFenetre(function(){ var x=(state.reclamations||[]).filter(function(r){ return r.id===id; })[0]; return 'Réclamation — '+(x?x.de:''); }, function(c,p){
    var x=(state.reclamations||[]).filter(function(r){ return r.id===id; })[0]; if(!x) return false;
    var ch=add(c,'div','fen-chips');
    chipCellule(ch,'Reçue le '+x.t,'c-grey');
    chipCellule(ch, x.statut==='traitee'?'Répondue':'À traiter', x.statut==='traitee'?'c-green':'c-amber');
    champLecture(c,'Objet',x.objet);
    champLecture(c,'Exposé du fournisseur',x.texte);
    if(x.reponse){ champLecture(c,'Réponse — '+(x.reponduPar||'')+(x.tRep?' — '+x.tRep:''),x.reponse); return; }
    if(!can('recours.handle') && !can('qa.answer')) return;
    var d=add(c,'div','fen-champ');
    var lb=add(d,'label','fen-lab','Réponse au fournisseur'); lb.htmlFor='rec-reponse';
    var ta=add(d,'textarea'); ta.id='rec-reponse'; ta.rows=5; fk(ta,'rec-rep-'+id);
    add(p,'span','muted','La réponse est communiquée au seul fournisseur concerné.');
    var bt=add(p,'button','btn btn-primary','Envoyer la réponse'); fk(bt,'rec-envoyer-'+id);
    bt.addEventListener('click',function(){
      var v=ta.value.trim(); if(!v){ toast('La réponse ne peut pas être vide.'); ta.focus(); return; }
      bt.disabled=true;
      MP.api('PUT',MP.url('/reclamations/'+encodeURIComponent(id)+'/reponse'),{ reponse:v })
        .then(function(){ toast('Réponse envoyée à '+x.de+'.'); return relireEtat(); })
        .catch(function(e){ bt.disabled=false; toast(e.message||'Envoi impossible.'); });
    });
  });
}

function ouvrirQuestion(i){
  ouvrirFenetre('Question '+(i+1), function(c,p){
    var q=state.qa[i]; if(!q) return false;
    var ch=add(c,'div','fen-chips');
    chipCellule(ch,'Reçue le '+q.t,'c-grey');
    chipCellule(ch, q.reponse?'Répondue':'En attente', q.reponse?'c-green':'c-amber');
    if(q.anonyme) chipCellule(ch,'Anonymisée à la diffusion','c-violet');
    champLecture(c,'Question',q.question);
    if(q.reponse){
      champLecture(c,'Réponse diffusée à tous les candidats'+(q.tRep?' — '+q.tRep:''),q.reponse);
    } else if(can('qa.answer')){
      var d=add(c,'div','fen-champ');
      var lb=add(d,'label','fen-lab','Réponse — elle sera communiquée à tous les candidats'); lb.htmlFor='qa-reponse';
      var ta=add(d,'textarea'); ta.id='qa-reponse'; ta.rows=5; fk(ta,'qa-'+i);
      add(p,'span','muted','La réponse est publiée à tous les fournisseurs consultés, sans le nom de l’auteur de la question.');
      var bt=add(p,'button','btn btn-primary','Publier la réponse'); fk(bt,'qa-publier-'+i);
      bt.addEventListener('click',function(){
        if(!ta.value.trim()){ toast('La réponse ne peut pas être vide.'); ta.focus(); return; }
        q.reponse=ta.value.trim(); q.tRep=new Date().toLocaleString('fr-FR');
        logit('Réponse publiée à une question de candidat');
        notify('additif.publie','Réponse aux candidats publiée', q.question+"\n\nRéponse : "+q.reponse);
        save(); render();
      });
    }
  });
}

function publierAdditif(){
  ask("L'additif sera diffusé à tous les candidats ayant retiré le dossier et fera partie intégrante du dossier d'appel d'offres. S'il modifie substantiellement la préparation des offres, reportez la date limite en conséquence.",
    function(){
      var rep2 = state.additifs.length===0 ? '29/10/2026' : null;
      state.additifs.push({objet:'Précision sur les pièces exigées des soumissionnaires hors UEMOA',
        t:new Date().toLocaleString('fr-FR'), report:rep2});
      if(rep2) state.cdc.ouverture='2026-10-29';
      logit('Additif publié au dossier d’appel d’offres');
      notify('additif.publie','Additif publié','Un additif modifie le dossier '+REF()+'.'+(rep2?' La date limite de dépôt est reportée au '+rep2+'.':''));
      save(); render();
    },"Publier un additif ?","Publier");
}

function ouvrirAdditif(i){
  ouvrirFenetre('Additif n° '+(i+1), function(c){
    var a=state.additifs[i]; if(!a) return false;
    var ch=add(c,'div','fen-chips');
    chipCellule(ch,'Publié le '+a.t,'c-grey');
    chipCellule(ch, a.report?'Report de délai':'Précision', a.report?'c-amber':'c-grey');
    champLecture(c,'Objet',a.objet);
    champLecture(c,'Incidence sur la date limite', a.report ? 'Date limite de dépôt reportée au '+a.report+'.' : 'Sans incidence sur la date limite.');
    add(c,'p','muted','Un additif publié moins de 5 jours avant la date limite impose un report.').style.marginTop='16px';
  });
}
