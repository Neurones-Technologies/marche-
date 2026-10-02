/* Marché+ — Écran Questions des candidats et additifs.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

/* ============ Questions des candidats & additifs ============ */
function vQA(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Questions des candidats et additifs');

  var k1=add(m,'div','card');
  var ph=add(k1,'div','panel-head');
  add(ph,'span',null,'Questions reçues');
  var ouv=state.qa.filter(function(x){return !x.reponse;}).length;
  add(ph,'span','chip '+(ouv?'c-amber':'c-green'), ouv? ouv+' sans réponse':'Toutes traitées');
  var b1=add(k1,'div','pad');
  if(!state.qa.length) vide(b1,'💬','Aucune question reçue',"Les questions déposées par les candidats apparaîtront ici. Simulez-en une pour voir le traitement.");
  state.qa.forEach(function(q,i){
    var bx=add(b1,'div'); bx.style.cssText='padding:14px 0;border-top:1px solid var(--line-2)';
    var t=add(bx,'div','msg-h');
    add(t,'strong',null,'Question '+(i+1));
    add(t,'span','chip c-grey',q.t);
    add(t,'span','chip '+(q.reponse?'c-green':'c-amber'), q.reponse?'Répondue':'En attente');
    if(q.anonyme) add(t,'span','chip c-violet','Anonymisée à la diffusion');
    add(bx,'div',null,q.question).style.marginBottom='8px';
    if(q.reponse){
      var th=add(bx,'div','thread');
      add(th,'div','t-xs','Réponse diffusée à tous les candidats');
      add(th,'div',null,q.reponse);
    } else if(can('qa.answer')){
      var ta=add(bx,'textarea'); ta.rows=2; ta.style.width='100%'; ta.placeholder='Réponse — elle sera communiquée à tous les candidats…';
      ta.setAttribute('aria-label','Réponse à la question '+(i+1)); fk(ta,'qa-'+i);
      var bt=add(bx,'button','btn btn-primary btn-sm','Publier la réponse'); bt.style.marginTop='8px';
      bt.addEventListener('click',function(){
        if(!ta.value.trim()){ toast('La réponse ne peut pas être vide.'); return; }
        q.reponse=ta.value.trim(); q.tRep=new Date().toLocaleString('fr-FR');
        logit('Réponse publiée à une question de candidat');
        notify('additif.publie','Réponse aux candidats publiée', q.question+"\n\nRéponse : "+q.reponse);
        save(); render();
      });
    }
  });
  var f1=add(k1,'div','panel-foot');
  add(f1,'span','muted','Les questions sont closes 7 jours avant la date limite de dépôt.');
  var sim=add(f1,'button','btn btn-ghost btn-sm','Simuler une question');
  sim.addEventListener('click',function(){
    var ex=["Le lot 4 (maintenance) peut-il être soumissionné séparément des lots 1 à 3 ?",
      "La caution de soumission peut-elle être émise par une banque de notre pays d'origine avec contre-garantie locale ?",
      "Les références exigées doivent-elles porter sur le secteur bancaire ou tout secteur est-il admis ?",
      "Le délai d'acheminement maritime est-il inclus dans le délai d'exécution de 120 jours ?"];
    state.qa.push({ question: ex[state.qa.length % ex.length], t:new Date().toLocaleString('fr-FR'), anonyme:true });
    logit('Question de candidat enregistrée');
    notify('question.recue','Question reçue d\u2019un candidat', ex[(state.qa.length-1) % ex.length]);
    save(); render();
  });

  var k2=add(m,'div','card'); k2.style.marginTop='18px';
  add(k2,'div','panel-head','Additifs au dossier');
  var b2=add(k2,'div','pad');
  if(!state.additifs.length) vide(b2,'📎','Aucun additif publié',"Un additif modifie le dossier après publication. S'il change substantiellement la préparation des offres, il reporte la date limite.");
  state.additifs.forEach(function(a,i){
    var row=add(b2,'div','docline');
    var lf=add(row,'div');
    add(lf,'div',null,'Additif n° '+(i+1)+' — '+a.objet).style.fontWeight='600';
    add(lf,'div','muted',a.t+(a.report?' · date limite reportée au '+a.report:' · sans incidence sur la date limite'));
    add(row,'span','chip '+(a.report?'c-amber':'c-grey'), a.report?'Report de délai':'Précision');
  });
  if(can('qa.answer')){
    var f2=add(k2,'div','panel-foot');
    add(f2,'span','muted','Un additif publié moins de 5 jours avant la date limite impose un report.');
    var ba=add(f2,'button','btn btn-ghost btn-sm','Publier un additif');
    ba.addEventListener('click',function(){
      ask("L'additif sera diffusé à tous les candidats ayant retiré le dossier et fera partie intégrante du dossier d'appel d'offres. S'il modifie substantiellement la préparation des offres, reportez la date limite en conséquence.",
        function(){
          var rep2 = state.additifs.length===0 ? '29/10/2026' : null;
          state.additifs.push({objet:'Précision sur les pièces exigées des soumissionnaires hors UEMOA',
            t:new Date().toLocaleString('fr-FR'), report:rep2});
          if(rep2) state.cdc.ouverture='2026-10-29';
          logit('Additif publié au dossier d\u2019appel d\u2019offres');
          notify('additif.publie','Additif publié','Un additif modifie le dossier '+REF()+'.'+(rep2?' La date limite de dépôt est reportée au '+rep2+'.':''));
          save(); render();
        },"Publier un additif ?","Publier");
    });
  }
}
