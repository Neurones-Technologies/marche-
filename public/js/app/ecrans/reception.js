/* Marché+ — Écran Réception des offres.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Les plis reçus en tableau ; le détail d'un pli (contact, conditions, pièces déposées) s'ouvre dans une fenêtre. */
"use strict";

function confianceMoyenne(o){ return Math.round(o.fields.reduce(function(s,f){return s+f.conf;},0)/o.fields.length); }

function vReception(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Réception des offres');
  if(state.cdc.cdcPublie && !state.depClosed && can('depouille.confirm')){
    var ext=add(h,'button','btn btn-ghost','Enregistrer une offre reçue hors plateforme'); fk(ext,'offre-externe');
    ext.addEventListener('click',ouvrirOffreExterne);
  }
  // avant la date limite : le dépouillement s'ouvre à la main (habilitation dédiée), ce qui clôt le dépôt des offres
  if(state.cdc.cdcPublie && !depouillementOuvert() && can('depouille.open')){
    var op=add(h,'button','btn btn-primary','Ouvrir le dépouillement'); fk(op,'depouillement-ouvrir');
    op.addEventListener('click',function(){
      ask('Le dépôt des offres est clos immédiatement : aucun soumissionnaire ne pourra plus déposer ni joindre de pièce, même avant la date limite ('
        +(state.cdc.ouverture?String(state.cdc.ouverture).split('-').reverse().join('/'):'non fixée')+'). L’ouverture est consignée à la piste d’audit et ne se défait pas.',
      function(){
        op.disabled=true;
        MP.api('POST',MP.url('/depouillement/ouvrir'),{}).then(function(){ toast('Dépouillement ouvert : le dépôt des offres est clos.'); return relireEtat(); })
          .then(function(){ if(viewAllowed('depouille')) go('depouille'); })
          .catch(function(e){ op.disabled=false; toast(e.message||'Ouverture impossible.'); });
      },'Ouvrir le dépouillement maintenant ?','Ouvrir le dépouillement');
    });
  }
  if(state.cdc.cdcPublie && !depouillementOuvert()){
    var ns=add(m,'div','note'); ns.style.marginBottom='18px';
    add(ns,'strong',null,'Dépôt des offres ouvert. ');
    ns.appendChild(document.createTextNode('Les offres se dépouillent à la date limite ('+(state.cdc.ouverture?dateLongue(state.cdc.ouverture)+' à 10 h 00':'non fixée')+')'+(can('depouille.open')?', ou dès que vous ouvrez le dépouillement : le dépôt est alors clos.':'.')));
  }

  var seuilC=Number(state.seuils.confianceMin);
  var t=tableau(m,{ cle:'plis', titre:'Plis reçus', lignes:SEED_OFFERS,
    vide:'Aucun pli reçu pour le moment.',
    colonnes:[
      {lab:'Soumissionnaire', rendu:function(o,td){ add(td,'strong',null,o.name); add(td,'div','muted',o.doc); }},
      {lab:'Origine', rendu:function(o,td){ originChip(td,o); }},
      {lab:'Déposé le', val:function(o){ return o.depot||'—'; }},
      {lab:'Montant', num:true, rendu:function(o,td){ add(td,'div',null,sep(o.montant)+' '+o.devise); if(o.devise!=='XOF') add(td,'div','muted','≈ '+xof(montantXOF(o))); }},
      {lab:'Confiance de lecture', rendu:function(o,td){ var a=confianceMoyenne(o); chipCellule(td, a+' %', a>=seuilC?'c-green':'c-amber'); }},
      {lab:'Pièces jointes', num:true, val:function(o){ return (o.pieces||[]).length || '—'; }}
    ],
    recherche:function(o){ return o.name+' '+o.pays+' '+o.doc+' '+(o.contact||''); },
    filtres:[
      { lab:'Origine', options:[['uemoa','UEMOA'],['hors','Hors UEMOA']], test:function(o,v){ return v==='uemoa' ? isUemoa(o) : !isUemoa(o); } },
      { lab:'Confiance', options:[['sous','Sous le seuil'],['ok','Au-dessus du seuil']], test:function(o,v){ return (confianceMoyenne(o)>=seuilC) === (v==='ok'); } }
    ],
    actions:function(o,td){ boutonDetail(td,function(){ ouvrirPli(o.id); },'pli-'+o.id); }
  });
  add(t.querySelector('.dt-barre'),'span','chip c-grey', state.fxFrozen ? 'Taux figés le '+state.fxFrozen.at : 'Taux figés à la clôture du dépouillement');

  var w=add(m,'div','warn'); w.style.marginTop='18px';
  add(w,'strong',null,'Deux règles que le produit ne contourne pas. ');
  w.appendChild(document.createTextNode("Aucun montant n'est retenu sans confirmation humaine dès que sa confiance passe sous le seuil. Et le taux de conversion appliqué est celui arrêté à la date d'ouverture des plis, figé pour toute la procédure : recalculer au fil de l'eau rendrait le classement contestable."));
}

function ouvrirPli(id){
  ouvrirFenetre(function(){ var o=offreParId(id); return o ? o.name : 'Pli'; }, function(c){
    var o=offreParId(id); if(!o) return false;
    var seuilC=Number(state.seuils.confianceMin), avg=confianceMoyenne(o);
    var ch=add(c,'div','fen-chips');
    originChip(ch,o);
    chipCellule(ch,'Confiance '+avg+' % (seuil '+seuilC+' %)', avg>=seuilC?'c-green':'c-amber');
    if(o.submitted) chipCellule(ch,'Saisie en ligne','c-green');
    grilleLecture(c,[
      ['Document',o.doc], ['Déposé le',o.depot], ['Montant',sep(o.montant)+' '+o.devise],
      ['Contre-valeur', o.devise!=='XOF' ? xof(montantXOF(o)) : null], ['Délai', o.delai ? o.delai+' jours' : null],
      ['Incoterm',o.incoterm], ['Contact',o.contact], ['Validité', o.validite ? o.validite+' jours' : null], ['Paiement',o.paiement]
    ]);
    var bar=el('div','bar'); var sp=add(bar,'span'); sp.style.width=avg+'%'; if(avg<seuilC) sp.style.background='var(--amber-line)';
    champLecture(c,'Confiance de lecture — '+avg+' %',bar).parentNode.style.maxWidth='320px';
    bar.setAttribute('role','img'); bar.setAttribute('aria-label','Confiance de lecture : '+avg+' %');
    var pieces=o.pieces||[];
    if(o.externe) champLecture(c,'Reçue hors plateforme', 'le '+o.depot+(o.externe.lecture==='ia'?' — lue par l’IA puis relue':' — saisie à la main'));
    documentsOffre(c, o);
  }, { large:true });
}
function offreParId(id){ for(var i=0;i<SEED_OFFERS.length;i++) if(SEED_OFFERS[i].id===id) return SEED_OFFERS[i]; return null; }
