/* Marché+ — Écran Questions des candidats et additifs.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Deux tableaux ; le détail d'une question (et la réponse) ou d'un additif s'ouvre dans une fenêtre. */
"use strict";

var QUESTIONS_EXEMPLES = ["Le lot 4 (maintenance) peut-il être soumissionné séparément des lots 1 à 3 ?",
  "La caution de soumission peut-elle être émise par une banque de notre pays d'origine avec contre-garantie locale ?",
  "Les références exigées doivent-elles porter sur le secteur bancaire ou tout secteur est-il admis ?",
  "Le délai d'acheminement maritime est-il inclus dans le délai d'exécution de 120 jours ?"];

/* ============ Questions des candidats & additifs ============ */
function vQA(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Questions des candidats et additifs');

  var ouv=state.qa.filter(function(x){return !x.reponse;}).length;
  var tq=tableau(m,{ cle:'qa', titre:'Questions reçues', lignes:state.qa.map(function(q,i){ return {q:q,i:i}; }),
    vide:'Aucune question reçue. Les questions déposées par les candidats apparaîtront ici.',
    colonnes:[
      {lab:'N°', num:true, val:function(x){ return x.i+1; }},
      {lab:'Question', rendu:function(x,td){ add(td,'div','dt-extrait',x.q.question); }},
      {lab:'Reçue le', val:function(x){ return x.q.t; }},
      {lab:'Statut', rendu:function(x,td){ chipCellule(td, x.q.reponse?'Répondue':'En attente', x.q.reponse?'c-green':'c-amber'); }}
    ],
    recherche:function(x){ return x.q.question+' '+(x.q.reponse||''); },
    filtres:[{ lab:'Statut', options:[['attente','En attente'],['repondue','Répondue']], test:function(x,v){ return v==='repondue' ? !!x.q.reponse : !x.q.reponse; } }],
    nouveau: { lab:'Simuler une question', action:simulerQuestion },
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
}

function simulerQuestion(){
  var q=QUESTIONS_EXEMPLES[state.qa.length % QUESTIONS_EXEMPLES.length];
  state.qa.push({ question:q, t:new Date().toLocaleString('fr-FR'), anonyme:true });
  logit('Question de candidat enregistrée');
  notify('question.recue','Question reçue d’un candidat', q);
  save(); render();
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
      add(p,'span','muted','Les questions sont closes 7 jours avant la date limite de dépôt.');
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
