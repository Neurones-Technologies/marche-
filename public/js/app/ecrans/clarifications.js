/* Marché+ — Écran Clarifications.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Les demandes en tableau ; l'échange s'ouvre dans une fenêtre, comme la rédaction d'une nouvelle demande. */
"use strict";

var CLARIF_MODELE = { objet:'Libellé d’un poste du bordereau des prix',
  question:"Le poste « baies de brassage » de votre bordereau ne précise pas si la fourniture inclut les unités de distribution électrique exigées à l'article 4.5 du CCTP. Merci de confirmer ce que couvre le prix indiqué, sans le modifier." };

/* ============ Clarifications ============ */
function vClarifs(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Demandes de clarification');

  var ouv=clarifsOuvertes().length;
  var t=tableau(m,{ cle:'clarifs', titre:'Échanges', lignes:state.clarifs.map(function(cl,i){ return {cl:cl,i:i}; }),
    vide:'Aucune demande émise. Une demande porte sur un point ambigu du dossier d’une offre.',
    colonnes:[
      {lab:'Soumissionnaire', rendu:function(x,td){ var o=offreParId(x.cl.offerId); add(td,'strong',null,o?o.name:x.cl.offerId); }},
      {lab:'Objet', rendu:function(x,td){ add(td,'div','dt-extrait',x.cl.objet); }},
      {lab:'Envoyée le', val:function(x){ return x.cl.t; }},
      {lab:'Statut', rendu:function(x,td){ var att=x.cl.statut==='envoyee'; chipCellule(td, att?'En attente — échéance '+x.cl.echeance:'Réponse reçue', att?'c-amber':'c-green'); }}
    ],
    recherche:function(x){ var o=offreParId(x.cl.offerId); return (o?o.name:'')+' '+x.cl.objet+' '+x.cl.question+' '+(x.cl.reponse||''); },
    filtres:[{ lab:'Statut', options:[['envoyee','En attente'],['repondue','Réponse reçue']], test:function(x,v){ return (x.cl.statut==='envoyee') === (v==='envoyee'); } }],
    nouveau: can('clarif.send') ? { lab:'Demander une clarification', action:nouvelleClarification } : null,
    actions:function(x,td){ boutonDetail(td,function(){ ouvrirClarification(x.i); },'clarif-'+x.i); }
  });
  add(t.querySelector('.dt-barre'),'span','chip '+(ouv?'c-amber':'c-green'), ouv? ouv+' en attente de réponse':'Aucune en attente');

  var nb=add(m,'div','note');
  add(nb,'strong',null,'La frontière à ne pas franchir. ');
  nb.appendChild(document.createTextNode("Demander « pouvez-vous améliorer votre prix ? » n'est pas une clarification : c'est une négociation, interdite en appel d'offres ouvert et attaquable. La distinction doit rester lisible dans la piste d'audit — d'où l'enregistrement de l'objet, de la question et de la réponse in extenso."));
}

function ouvrirClarification(i){
  ouvrirFenetre(function(){ var cl=state.clarifs[i], o=cl&&offreParId(cl.offerId); return 'Clarification — '+(o?o.name:(cl?cl.offerId:'')); }, function(c,p){
    var cl=state.clarifs[i]; if(!cl) return false;
    var o=offreParId(cl.offerId);
    var ch=add(c,'div','fen-chips');
    chipCellule(ch, cl.statut==='envoyee'?'En attente — échéance '+cl.echeance:'Réponse reçue', cl.statut==='envoyee'?'c-amber':'c-green');
    champLecture(c,'Objet',cl.objet);
    var th=add(c,'div','thread'); th.style.marginTop='16px';
    var m1=add(th,'div','msg');
    add(m1,'div','t-xs','Demande de l’autorité contractante — '+cl.t);
    add(m1,'div',null,cl.question);
    if(cl.reponse){
      var m2=add(th,'div','msg');
      add(m2,'div','t-xs','Réponse du soumissionnaire — '+cl.tRep);
      add(m2,'div',null,cl.reponse);
    } else {
      add(p,'span','muted','Le soumissionnaire répond depuis son espace ; sa réponse apparaîtra ici.');
    }
  });
}

function nouvelleClarification(){
  ouvrirFenetre('Demander une clarification', function(c,p){
    var d1=add(c,'div','fen-champ');
    var l1=add(d1,'label','fen-lab','Offre concernée'); l1.htmlFor='clarif-off';
    var sel=add(d1,'select'); sel.id='clarif-off'; fk(sel,'clarif-off');
    conformes().forEach(function(o){ var op=add(sel,'option',null,o.name); op.value=o.id; });
    var d2=add(c,'div','fen-champ');
    var l2=add(d2,'label','fen-lab','Objet'); l2.htmlFor='clarif-objet';
    var ob=add(d2,'input'); ob.type='text'; ob.id='clarif-objet'; ob.maxLength=200; ob.value=CLARIF_MODELE.objet; fk(ob,'clarif-objet');
    var d3=add(c,'div','fen-champ');
    var l3=add(d3,'label','fen-lab','Question'); l3.htmlFor='clarif-question';
    var qu=add(d3,'textarea'); qu.id='clarif-question'; qu.rows=5; qu.value=CLARIF_MODELE.question; fk(qu,'clarif-question');
    add(c,'p','muted','La demande ne peut pas conduire le soumissionnaire à modifier son prix ni le contenu de son offre — seulement à expliciter ce qu’il a déjà remis.').style.marginTop='12px';
    var an=add(p,'button','btn btn-ghost','Annuler'); an.addEventListener('click',fermerFenetre);
    var bt=add(p,'button','btn btn-primary','Envoyer la demande'); fk(bt,'clarif-envoyer');
    bt.addEventListener('click',function(){
      var oid=sel.value, o=offreParId(oid), objet=ob.value.trim(), question=qu.value.trim();
      if(!oid || !objet || !question){ toast('L’offre, l’objet et la question sont obligatoires.'); return; }
      ask("La demande porte sur une ambiguïté du dossier déposé. Elle ne peut pas conduire le soumissionnaire à modifier son prix ni le contenu de son offre — seulement à expliciter ce qu'il a déjà remis.",
        function(){
          var e=new Date(Date.now()+3*86400000).toLocaleDateString('fr-FR');
          state.clarifs.push({ offerId:oid, objet:objet, question:question, statut:'envoyee', t:new Date().toLocaleString('fr-FR'), echeance:e });
          logit('Demande de clarification envoyée — '+(o?o.name:oid));
          notify('clarif.envoyee','Demande de clarification — '+(o?o.name:''),
            "Une précision est demandée sur le dossier de "+(o?o.name:'')+". Réponse attendue avant le "+e+", sans modification du prix ni du contenu de l'offre.");
          fermerFenetre(); save(); render();
        },"Envoyer la demande à "+(o?o.name:'')+" ?","Envoyer");
    });
  });
}
