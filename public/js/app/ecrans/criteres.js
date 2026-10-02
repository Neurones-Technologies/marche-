/* Marché+ — Écran Grille de critères.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

function vCriteres(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Grille de critères');

  var card=add(m,'div','card');
  var ph=add(card,'div','panel-head'); add(ph,'span',null,'Critères et pondérations');
  var wt=weightTotal(); add(ph,'span','chip '+(wt===100?'c-green':'c-red'),'Total : '+wt+' %');
  var body=add(card,'div','pad');
  var hdr=add(body,'div','crow'); hdr.style.cssText+=';padding-top:0;border-top:none';
  ['Critère','Pondération (%)','Type',''].forEach(function(x){
    add(hdr,'div',null,x).style.cssText='font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em';
  });
  state.criteria.forEach(function(c,idx){
    var row=add(body,'div','crow');
    var lab=add(row,'div');
    var inp=add(lab,'input'); inp.type='text'; inp.value=c.label; inp.style.width='100%';
    inp.setAttribute('aria-label','Libellé du critère');
    inp.addEventListener('change',function(){ c.label=inp.value; logit('Critère renommé : '+inp.value); save(); render(); });
    add(lab,'div','muted',c.hint).style.marginTop='4px';
    var w=add(row,'input'); w.type='number'; w.min='0'; w.max='100'; w.value=c.weight; w.style.width='100%';
    w.setAttribute('aria-label','Pondération de '+c.label);
    w.addEventListener('change',function(){
      c.weight=Math.max(0,Math.min(100,Number(w.value)||0));
      logit('Pondération « '+c.label+' » portée à '+c.weight+' %'); save(); render();
    });
    add(add(row,'div'),'span','chip '+(c.kind==='auto'?'c-teal':'c-blue'), c.kind==='auto'?'Calculé':'Qualitatif · IA');
    var del=add(row,'button','icon-btn','×'); del.setAttribute('aria-label','Supprimer '+c.label);
    del.addEventListener('click',function(){
      if(state.criteria.length<=1){ toast('La grille doit conserver au moins un critère.'); return; }
      ask('Le classement sera recalculé sans ce critère. Pensez à réajuster les pondérations pour retrouver un total de 100 %.', function(){
        logit('Critère supprimé : '+c.label); state.criteria.splice(idx,1); save(); render();
      }, 'Supprimer le critère « '+c.label+' » ?', 'Supprimer');
    });
  });
  var foot=add(card,'div','panel-foot');
  var msg=add(foot,'span',null, wt===100?'La grille est équilibrée et applicable.':'Le total doit atteindre 100 % pour que la grille soit applicable.');
  msg.style.cssText='font-size:12.5px;color:'+(wt===100?'var(--muted)':'var(--red)');
  add(foot,'button','btn btn-ghost btn-sm','+ Ajouter un critère qualitatif').addEventListener('click',function(){
    var id='c'+Date.now();
    // Pas d'écriture dans les notes : un critère sans note vaut 70 (curScore), et noter relève de l'évaluateur.
    state.criteria.push({id:id,label:'Nouveau critère',weight:0,kind:'qual',hint:'Notation proposée par IA, validée par un évaluateur'});
    logit('Critère ajouté à la grille'); save(); render();
  });
  if(state.depClosed){
    Array.prototype.forEach.call(card.querySelectorAll('input,button'),function(x){ x.disabled=true; });
    var lk=add(m,'div','warn'); lk.style.marginTop='18px';
    add(lk,'strong',null,'Grille figée. ');
    lk.appendChild(document.createTextNode("Le dépouillement est clôturé : la grille publiée au dossier ne peut plus être modifiée. La changer après l'ouverture des plis serait un motif d'annulation."));
  }

  var n=add(m,'div','note');
  add(n,'strong',null,'Pourquoi ce paramétrage. ');
  n.appendChild(document.createTextNode("Un produit vendu à des secteurs et à des pays différents ne peut pas coder ses critères en dur : chaque organisation définit ici sa grille, et le moteur s'y conforme sans redéveloppement. Modifiez une pondération puis ouvrez l'écran Évaluation."));
}
