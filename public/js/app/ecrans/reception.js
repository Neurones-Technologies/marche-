/* Marché+ — Écran Réception des offres.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

function vReception(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Réception des offres');

  var card=add(m,'div','card');
  var ph=add(card,'div','panel-head'); add(ph,'span',null,'Plis reçus et traitement');
  add(ph,'span','chip c-grey', state.fxFrozen ? 'Taux figés le '+state.fxFrozen.at : 'Taux figés à la clôture du dépouillement');
  var b=add(card,'div','pad');
  SEED_OFFERS.forEach(function(o){
    var row=add(b,'div'); row.style.cssText='padding:14px 0;border-top:1px solid var(--line-2)';
    var top=add(row,'div'); top.style.cssText='display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center';
    var lf=add(top,'div');
    var nm=add(lf,'div'); nm.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    add(nm,'strong',null,o.name); originChip(nm,o);
    add(lf,'div','muted',o.doc+' · déposé en '+o.devise+(o.depot?' · le '+o.depot:'')+(o.incoterm?' · '+o.incoterm:''));
    if(o.contact) add(lf,'div','muted','Contact : '+o.contact+' · validité '+(o.validite||'—')+' j · '+(o.paiement||'—'));
    var avg=Math.round(o.fields.reduce(function(s,f){return s+f.conf;},0)/o.fields.length);
    var rg=add(top,'div'); rg.style.cssText='display:flex;align-items:center;gap:10px;flex-wrap:wrap';
    if(o.devise!=='XOF') add(rg,'span','chip c-violet', sep(o.montant)+' '+o.devise+' → '+xof(montantXOF(o)));
    var seuilC=Number(state.seuils.confianceMin);
    add(rg,'span','chip '+(avg>=seuilC?'c-green':'c-amber'),'Confiance '+avg+' % (seuil '+seuilC+' %)');
    if(o.pieces && o.pieces.length){
      var pc=add(row,'div'); pc.style.cssText='margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center';
      add(pc,'span','muted','Pièces déposées :');
      o.pieces.forEach(function(f){
        var a=add(pc,'a','pill',f.name+' · '+taille(f.size)); a.href='/api/files/'+f.id; a.setAttribute('download',f.name); a.title='SHA-256 '+f.sha256;
        a.setAttribute('aria-label','Télécharger '+f.name);
      });
    }
    var bar=add(row,'div','bar'); bar.style.marginTop='10px';
    var sp=add(bar,'span'); sp.style.width=avg+'%'; if(avg<seuilC) sp.style.background='var(--amber-line)';
  });

  var w=add(m,'div','warn'); w.style.marginTop='18px';
  add(w,'strong',null,'Deux règles que le produit ne contourne pas. ');
  w.appendChild(document.createTextNode("Aucun montant n'est retenu sans confirmation humaine dès que sa confiance passe sous le seuil. Et le taux de conversion appliqué est celui arrêté à la date d'ouverture des plis, figé pour toute la procédure : recalculer au fil de l'eau rendrait le classement contestable."));
}
