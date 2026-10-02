/* Marché+ — Écran Clarifications.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

/* ============ Clarifications ============ */
function vClarifs(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'div','eyebrow','Phase d\u2019analyse');
  add(l,'h1',null,'Demandes de clarification');
  add(l,'p','lede',"Une clarification lève une ambiguïté sur une offre déjà déposée. Elle ne peut en aucun cas modifier le prix ni le contenu substantiel de l'offre : ce serait une négociation déguisée, et un motif de recours.");

  var k=add(m,'div','card');
  var ph=add(k,'div','panel-head');
  add(ph,'span',null,'Échanges en cours');
  var ouv=clarifsOuvertes().length;
  add(ph,'span','chip '+(ouv?'c-amber':'c-green'), ouv? ouv+' en attente de réponse':'Aucune en attente');
  var b=add(k,'div','pad');
  if(!state.clarifs.length) vide(b,'❓','Aucune demande émise',"Sélectionnez une offre ci-dessous pour demander une précision sur un point ambigu de son dossier.");
  state.clarifs.forEach(function(cl,i){
    var o=null; SEED_OFFERS.forEach(function(x){ if(x.id===cl.offerId) o=x; });
    var bx=add(b,'div'); bx.style.cssText='padding:14px 0;border-top:1px solid var(--line-2)';
    var t=add(bx,'div','msg-h');
    add(t,'strong',null,(o?o.name:cl.offerId));
    add(t,'span','chip '+(cl.statut==='envoyee'?'c-amber':'c-green'), cl.statut==='envoyee'?'En attente — échéance '+cl.echeance:'Réponse reçue');
    add(bx,'div','muted','Objet : '+cl.objet);
    var th=add(bx,'div','thread'); th.style.marginTop='8px';
    var m1=add(th,'div','msg');
    add(m1,'div','t-xs','Demande de l\u2019autorité contractante — '+cl.t);
    add(m1,'div',null,cl.question);
    if(cl.reponse){
      var m2=add(th,'div','msg');
      add(m2,'div','t-xs','Réponse du soumissionnaire — '+cl.tRep);
      add(m2,'div',null,cl.reponse);
    } else if(can('clarif.send')){
      var bt=add(bx,'button','btn btn-ghost btn-sm','Simuler la réponse du soumissionnaire'); bt.style.marginTop='8px';
      bt.addEventListener('click',function(){
        cl.reponse="Précision apportée sans modification du prix ni du périmètre : le poste visé correspond bien à la fourniture décrite au bordereau, le libellé abrégé ayant prêté à confusion.";
        cl.tRep=new Date().toLocaleString('fr-FR'); cl.statut='repondue';
        logit('Réponse de clarification reçue — '+(o?o.name:cl.offerId));
        save(); render();
      });
    }
  });

  if(can('clarif.send')){
    var f=add(k,'div','panel-foot');
    add(f,'span','muted','Délai de réponse : 3 jours ouvrés. Une absence de réponse est instruite en l\u2019état du dossier.');
    var sel=add(f,'select'); sel.setAttribute('aria-label','Offre concernée'); fk(sel,'clarif-off');
    conformes().forEach(function(o){ var op=add(sel,'option',null,o.name); op.value=o.id; });
    var bt=add(f,'button','btn btn-primary btn-sm','Demander une clarification');
    bt.addEventListener('click',function(){
      var oid=sel.value; var o=null; SEED_OFFERS.forEach(function(x){ if(x.id===oid) o=x; });
      ask("La demande porte sur une ambiguïté du dossier déposé. Elle ne peut pas conduire le soumissionnaire à modifier son prix ni le contenu de son offre — seulement à expliciter ce qu'il a déjà remis.",
        function(){
          var e=new Date(Date.now()+3*86400000).toLocaleDateString('fr-FR');
          state.clarifs.push({ offerId:oid, objet:'Libellé d\u2019un poste du bordereau des prix',
            question:"Le poste « baies de brassage » de votre bordereau ne précise pas si la fourniture inclut les unités de distribution électrique exigées à l'article 4.5 du CCTP. Merci de confirmer ce que couvre le prix indiqué, sans le modifier.",
            statut:'envoyee', t:new Date().toLocaleString('fr-FR'), echeance:e });
          logit('Demande de clarification envoyée — '+(o?o.name:oid));
          notify('clarif.envoyee','Demande de clarification — '+(o?o.name:''),
            "Une précision est demandée sur le dossier de "+(o?o.name:'')+". Réponse attendue avant le "+e+", sans modification du prix ni du contenu de l'offre.");
          save(); render();
        },"Envoyer la demande à "+(o?o.name:'')+" ?","Envoyer");
    });
  }

  var nb=add(m,'div','note');
  add(nb,'strong',null,'La frontière à ne pas franchir. ');
  nb.appendChild(document.createTextNode("Demander « pouvez-vous améliorer votre prix ? » n'est pas une clarification : c'est une négociation, interdite en appel d'offres ouvert et attaquable. La distinction doit rester lisible dans la piste d'audit — d'où l'enregistrement de l'objet, de la question et de la réponse in extenso."));
}
