/* Marché+ — Écran Réception des offres.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Les plis reçus en tableau ; le détail d'un pli (contact, conditions, pièces déposées) s'ouvre dans une fenêtre. */
"use strict";

function confianceMoyenne(o){ return Math.round(o.fields.reduce(function(s,f){return s+f.conf;},0)/o.fields.length); }

function vReception(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Réception des offres');

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
    var sec=add(c,'div','fen-section'); add(sec,'h3',null,'Pièces déposées');
    if(!o.pieces || !o.pieces.length) add(sec,'p','muted','Aucune pièce jointe enregistrée.');
    else {
      var pc=add(sec,'div'); pc.style.cssText='display:flex;gap:6px;flex-wrap:wrap';
      o.pieces.forEach(function(f){
        var a=add(pc,'a','pill',f.name+' · '+taille(f.size)); a.href='/api/files/'+f.id; a.setAttribute('download',f.name); a.title='SHA-256 '+f.sha256;
        a.setAttribute('aria-label','Télécharger '+f.name);
      });
    }
  }, { large:true });
}
function offreParId(id){ for(var i=0;i<SEED_OFFERS.length;i++) if(SEED_OFFERS[i].id===id) return SEED_OFFERS[i]; return null; }
