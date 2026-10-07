/* Marché+ — Budget et engagement (server/budget.js) : situation des lignes budgétaires (alloué, engagé, réservé,
   disponible), choix d'une ligne pour une demande d'achat ou une commande, saisie des lignes dans les paramètres.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

var BUDGET_SITUATION = { t:0, lignes:null, enCours:false };
/* Situation des lignes, relue au plus toutes les 20 secondes ; null tant qu'elle n'est pas arrivée (rendu ensuite). */
function situationBudget(forcer){
  var B=BUDGET_SITUATION;
  if((forcer || Date.now()-B.t>20000) && !B.enCours){
    B.enCours=true;
    MP.api('GET','/api/budget').then(function(r){ B.lignes=r.lignes; B.t=Date.now(); B.enCours=false; render(); })
      .catch(function(){ B.lignes=B.lignes||[]; B.t=Date.now(); B.enCours=false; });
  }
  return B.lignes;
}
function libelleLigneBudget(l){ return l.code+' — '+l.libelle+' ('+l.exercice+')'; }

/* Choix d'une ligne budgétaire : libellé, liste, disponible de la ligne choisie. Rien si aucune ligne n'est définie. */
function choixLigneBudget(parent, id, valeur, poser, desactive){
  var lignes=situationBudget();
  if(!lignes || !lignes.length) return null;
  var w=add(parent,'div'); add(w,'label',null,'Ligne budgétaire').setAttribute('for',id);
  var s=add(w,'select'); s.id=id; fk(s,id); s.disabled=!!desactive;
  add(s,'option',null,'— Choisir une ligne —').value='';
  lignes.forEach(function(l){ add(s,'option',null,libelleLigneBudget(l)).value=l.id; });
  s.value=valeur||'';
  var info=add(w,'div','muted');
  function maj(){
    var l=lignes.filter(function(x){ return x.id===s.value; })[0];
    info.textContent = l ? 'Disponible : '+xof(l.disponible)+' sur '+xof(l.montant)+(l.reserve?' · réservé '+xof(l.reserve):'') : '';
    if(l && l.disponible<=0) info.className='muted budget-epuise';
    else info.className='muted';
  }
  maj();
  s.addEventListener('change',function(){ maj(); poser(s.value||null); });
  return s;
}

/* Paramètres : lignes budgétaires de l'organisation, avec leur consommation. */
function vParamsBudget(m, num){
  state.budget=state.budget||{ lignes:[] };
  var lignes=state.budget.lignes, sit=situationBudget()||[];
  var k=add(m,'div','card'); k.style.marginTop='18px';
  add(k,'div','panel-head',num+' · Budget et engagement');
  var b=add(k,'div','pad');
  add(b,'p','muted','Une demande d’achat choisit sa ligne ; l’appel d’offres puis la commande en héritent. Une commande ne se soumet ni ne s’émet sans crédits disponibles sur sa ligne. Sans ligne définie, ce contrôle est inactif.');
  if(lignes.length){
    var tete=add(b,'div','budget-ligne budget-tete');
    ['Code','Libellé','Service','Exercice','Alloué (XOF)',''].forEach(function(x){ add(tete,'span',null,x); });
    lignes.forEach(function(l,i){
      var s=sit.filter(function(x){ return x.id===l.id; })[0], bloc=add(b,'div','budget-bloc'), row=add(bloc,'div','budget-ligne');
      [['code','text',40,'Code'],['libelle','text',200,'Libellé'],['service','text',120,'Service'],['exercice','number',0,'Exercice'],['montant','number',0,'Alloué (XOF)']].forEach(function(x){
        var inp=add(row,'input'); inp.type=x[1]; inp.value=l[x[0]]==null?'':l[x[0]]; if(x[2]) inp.maxLength=x[2];
        inp.setAttribute('aria-label',x[3]+' — ligne '+(i+1)); fk(inp,'bud-'+l.id+'-'+x[0]);
        inp.addEventListener('change',function(){
          l[x[0]] = x[1]==='number' ? Number(inp.value) : inp.value.trim();
          logit('Budget : ligne '+l.code+' modifiée'); save(); BUDGET_SITUATION.t=0;
        });
      });
      var act=add(row,'span');
      if(!(s && s.commandes)) boutonIcone(act,'x','Supprimer la ligne '+l.code,function(){
        ask('La ligne '+l.code+' disparaît du budget.',function(){ lignes.splice(i,1); logit('Budget : ligne '+l.code+' supprimée'); save(); render(); },'Supprimer la ligne ?','Supprimer');
      },'bud-sup-'+l.id);
      else act.title='Imputée à '+s.commandes+' commande(s) : elle ne se supprime pas.';
      // consommation : engagé, réservé, disponible
      var eng=s?s.engage:0, res=s?s.reserve:0, dispo=s?s.disponible:l.montant, tot=Math.max(l.montant,eng+res)||1;
      var co=add(bloc,'div','budget-conso');
      var barre=add(co,'div','budget-barre'); barre.setAttribute('role','img');
      barre.setAttribute('aria-label','Engagé '+sep(eng)+', réservé '+sep(res)+', disponible '+sep(dispo)+' XOF');
      add(barre,'span','budget-eng').style.width=(eng/tot*100)+'%';
      add(barre,'span','budget-res').style.width=(res/tot*100)+'%';
      var tx=add(co,'div','muted');
      add(tx,'span',null,'Engagé '+sep(eng)+' · réservé '+sep(res)+' · ');
      add(tx,'strong',dispo<0?'budget-epuise':null,'disponible '+sep(dispo)+' XOF');
    });
  } else add(b,'p','muted','Aucune ligne budgétaire : le contrôle des crédits est inactif.');
  var f=add(k,'div','panel-foot');
  var aj=add(f,'button','btn btn-ghost btn-sm','+ Ajouter une ligne'); fk(aj,'bud-ajout');
  aj.addEventListener('click',function(){
    lignes.push({ id:'b-'+Date.now().toString(36), code:'NOUV-'+(lignes.length+1), libelle:'Nouvelle ligne', service:'', exercice:new Date().getFullYear(), montant:0 });
    logit('Budget : ligne ajoutée'); save(); render();
  });
}
