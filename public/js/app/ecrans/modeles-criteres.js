/* Marché+ — Écran Critères d'évaluation (paramétrage de l'organisation).
   Deux modèles de critères : techniques (avec le nombre minimal d'évaluateurs techniques par offre) et financiers (les
   critères calculés prix et délai, plus ceux qu'un évaluateur financier note). Chaque appel d'offres neuf en reçoit la
   copie comme grille, que l'acheteur ajuste avant la publication.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

function modeleCriteres(domaine){
  var cle = domaine==='technique' ? 'criteresTechniques' : 'criteresFinanciers';
  if(!state[cle]) state[cle] = domaine==='technique' ? { minEvaluateurs:1, criteres:[] } : { criteres:[] };
  return state[cle];
}
function totalModele(m){ return (m.criteres||[]).reduce(function(t,c){ return t+(Number(c.weight)||0); },0); }

function vModelesCriteres(m){
  var peutTech = can('params.edit'), peutFin = can('params.edit') || can('criteres.edit');
  if(!peutTech && !peutFin) return denyBox(m,'criteres.edit');
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Critères d’évaluation');
  var t=modeleCriteres('technique'), f=modeleCriteres('financier'), total=totalModele(t)+totalModele(f);

  var tot=add(m,'div','chip '+(total===100?'c-green':'c-red'), total===100 ? 'Total des deux modèles : 100 % ✓' : 'Total des deux modèles : '+total+' % — il doit faire 100 % pour publier un dossier');
  tot.style.marginBottom='14px';

  blocModele(m, 'technique', t, peutTech);
  blocModele(m, 'financier', f, peutFin);
}

function blocModele(m, domaine, modele, editable){
  var tech = domaine==='technique';
  var k=add(m,'div','card'); k.style.marginTop='18px';
  var ph=add(k,'div','panel-head'); add(ph,'span',null, tech ? 'Critères techniques' : 'Critères financiers (définis par l’acheteur)');
  add(ph,'span','chip c-grey', totalModele(modele)+' %');
  var b=add(k,'div','pad');
  if(!editable) add(b,'p','muted','Lecture seule : ce modèle est défini par l’administration.').style.marginTop='0';

  if(tech){
    var w=add(b,'div','frm'); var d=add(w,'div');
    var id='me'+Math.random().toString(36).slice(2,8);
    add(d,'label',null,'Nombre minimal d’évaluateurs techniques par offre').setAttribute('for',id);
    var n=add(d,'input'); n.id=id; n.type='number'; n.min='1'; n.max='10'; n.value=modele.minEvaluateurs||1; n.disabled=!editable; fk(n,'modele-min-evaluateurs');
    n.addEventListener('change',function(){
      var v=Math.max(1,Math.min(10,Math.round(Number(n.value)||1)));
      if(v===modele.minEvaluateurs) { n.value=v; return; }
      modele.minEvaluateurs=v; logit('Évaluateurs techniques exigés par offre : '+v); save(); render();
    });
    add(b,'p','muted','L’évaluation d’une offre ne s’ouvre qu’une fois ce nombre d’évaluateurs techniques assigné ; la note technique est la moyenne de leurs notes.').style.margin='8px 0 14px';
  }

  var liste=add(b,'div');
  if(!modele.criteres.length) add(liste,'p','muted', tech ? 'Aucun critère technique : ajoutez-en (méthodologie, références, moyens…).' : 'Aucun critère financier.');
  modele.criteres.forEach(function(c,i){ ligneModele(liste, modele, c, i, domaine, editable); });

  if(editable){
    var aj=add(b,'button','btn btn-ghost btn-sm crit-ajout','+ Ajouter un critère'+(tech?' technique':' financier noté par l’évaluateur financier')); fk(aj,'modele-ajouter-'+domaine);
    aj.style.marginTop='10px';
    aj.addEventListener('click',function(){
      modele.criteres.push({ id:'c'+Date.now().toString(36), label:'Nouveau critère', weight:0, kind:'qual', domaine:domaine, hint:'Notation proposée par IA, validée par un évaluateur' });
      logit('Critère ajouté au modèle '+(tech?'technique':'financier')); save(); render();
    });
  }
}

function ligneModele(parent, modele, c, idx, domaine, editable){
  var calcule = c.kind==='auto';
  var row=add(parent,'div','crit-ligne');
  var id=add(row,'div','crit-id');
  var dot=add(id,'span','crit-pastille'); dot.style.background=teinteCritere(idx); dot.setAttribute('aria-hidden','true');
  var nom=add(id,'div','crit-nom-bloc');
  var inp=add(nom,'input','crit-nom'); inp.type='text'; inp.value=c.label; inp.disabled=!editable; inp.maxLength=120;
  inp.setAttribute('aria-label','Nom du critère'); fk(inp,'modele-nom-'+c.id);
  inp.addEventListener('change',function(){ var v=inp.value.trim(); if(!v){ inp.value=c.label; return; } c.label=v; logit('Critère de modèle renommé : '+v); save(); render(); });
  add(nom,'div','crit-aide', calcule ? 'Calculé par la formule du règlement' : (domaine==='technique' ? 'Noté par les évaluateurs techniques' : 'Noté par l’évaluateur financier'));

  var ctl=add(row,'div','crit-poids');
  var nb=add(ctl,'input','crit-valeur'); nb.type='number'; nb.min='0'; nb.max='100'; nb.value=c.weight; nb.disabled=!editable;
  nb.setAttribute('aria-label','Pondération de '+c.label+' en pourcentage'); fk(nb,'modele-poids-'+c.id);
  add(ctl,'span','crit-pct','%');
  nb.addEventListener('change',function(){
    var v=Math.max(0,Math.min(100,Math.round(Number(nb.value)||0)));
    if(v===Number(c.weight)){ nb.value=v; return; }
    c.weight=v; logit('Pondération du modèle « '+c.label+' » portée à '+v+' %'); save(); render();
  });
  if(!editable || calcule) return; // les critères calculés (prix, délai) font partie du règlement : on les repondère, on ne les retire pas
  var del=boutonIcone(row,'x','Supprimer '+c.label,function(){
    ask('Les appels d’offres déjà créés gardent leur grille ; seuls les nouveaux n’auront plus ce critère.', function(){
      logit('Critère retiré du modèle : '+c.label); modele.criteres.splice(idx,1); save(); render();
    }, 'Retirer le critère « '+c.label+' » du modèle ?', 'Retirer');
  });
  del.classList.add('crit-suppr');
}
