/* Marché+ — Écran Grille de critères.
   Une ligne compacte par critère, regroupée par type (la part de chaque type devant son titre), avec un curseur pour
   la pondération ; le total figure en tête. Couleurs : palette catégorielle validée (8 teintes, ordre fixe, jamais
   recyclé), au-delà du gris ; le nom et la valeur sont toujours écrits à côté.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

var CRIT_TEINTES = 8; // --crit-1 … --crit-8 (css/app.css) ; au-delà : --crit-autre
function teinteCritere(i){ return i < CRIT_TEINTES ? 'var(--crit-'+(i+1)+')' : 'var(--crit-autre)'; }

function vCriteres(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Grille de critères');
  var fige=!!state.depClosed || !!state.cdc.cdcPublie, crit=state.criteria, wt=weightTotal(); // publiée au dossier : opposable aux candidats

  /* Critères, regroupés par type */
  var k2=add(m,'div','card');
  var ph2=add(k2,'div','panel-head'); add(ph2,'span',null,'Critères');
  add(ph2,'span','chip '+(wt===100?'c-green':'c-red'), wt===100 ? 'Total : 100 % ✓' : (wt<100 ? 'Total : '+wt+' % · reste '+(100-wt)+' %' : 'Total : '+wt+' % · dépassement de '+(wt-100)+' %'));
  var b2=add(k2,'div','pad');
  /* Trois groupes : critères calculés (financiers), critères financiers notés par l'évaluateur financier, critères
     techniques notés par les évaluateurs techniques assignés (leur moyenne fait la note). */
  [['auto','Calculés automatiquement · financiers'],['qualfin','Notés par l’évaluateur financier'],['qual','Notés par les évaluateurs techniques · moyenne de leurs notes, note proposée par l’IA']].forEach(function(g){
    var lignes=crit.map(function(c,i){ return {c:c,i:i}; }).filter(function(x){
      var fin=R.domaineDe(x.c)==='financier';
      return g[0]==='auto' ? x.c.kind==='auto' : g[0]==='qualfin' ? (x.c.kind!=='auto' && fin) : (x.c.kind!=='auto' && !fin);
    });
    if(g[0]==='qualfin' && !lignes.length && fige) return;
    var part=lignes.reduce(function(t,x){ return t+(Number(x.c.weight)||0); },0);
    var grp=add(b2,'div','crit-groupe');
    var gt=add(grp,'div','crit-groupe-titre'); add(gt,'span','crit-groupe-pct',part+' %'); gt.appendChild(document.createTextNode(g[1]));
    lignes.forEach(function(x){ ligneCritere(grp, x.c, x.i, fige); });
    if(g[0]!=='auto' && !fige){
      var fin=g[0]==='qualfin';
      var aj=add(grp,'button','btn btn-ghost btn-sm crit-ajout','+ Ajouter un critère'+(fin?' financier':' technique')); fk(aj,fin?'crit-ajouter-fin':'crit-ajouter');
      aj.addEventListener('click',function(){
        // Pas d'écriture dans les notes : un critère sans note vaut 70 (curScore), et noter relève des évaluateurs assignés.
        state.criteria.push({id:'c'+Date.now(),label:'Nouveau critère',weight:0,kind:'qual',domaine:fin?'financier':'technique',hint:'Notation proposée par IA, validée par un évaluateur'});
        logit('Critère ajouté à la grille'); save(); render();
      });
    }
  });

  if(fige){
    var lk=add(m,'div','warn'); lk.style.marginTop='18px';
    add(lk,'strong',null,'Grille figée. ');
    lk.appendChild(document.createTextNode(state.depClosed
      ? "Le dépouillement est clôturé : la grille publiée au dossier ne peut plus être modifiée. La changer après l'ouverture des plis serait un motif d'annulation."
      : "Le dossier est publié : la grille est opposable aux candidats, aucun critère ne peut plus être retiré ni repondéré. Pour la changer, il faudrait un nouveau dossier."));
  }
}

/* Ligne d'un critère : pastille, nom modifiable, curseur, valeur, suppression. */
function ligneCritere(parent, c, idx, fige){
  var row=add(parent,'div','crit-ligne');
  var id=add(row,'div','crit-id');
  var dot=add(id,'span','crit-pastille'); dot.style.background=teinteCritere(idx); dot.setAttribute('aria-hidden','true');
  var nom=add(id,'div','crit-nom-bloc');
  var inp=add(nom,'input','crit-nom'); inp.type='text'; inp.value=c.label; inp.disabled=fige;
  inp.setAttribute('aria-label','Nom du critère'); fk(inp,'crit-nom-'+c.id);
  inp.addEventListener('change',function(){ var v=inp.value.trim(); if(!v){ inp.value=c.label; return; } c.label=v; logit('Critère renommé : '+v); save(); render(); });
  // la formule d'un critère calculé lui est propre ; l'aide des critères notés est commune (titre du groupe)
  if(c.kind==='auto' && c.hint) add(nom,'div','crit-aide',c.hint);

  var ctl=add(row,'div','crit-poids');
  var rg=add(ctl,'input','crit-curseur'); rg.type='range'; rg.min='0'; rg.max='100'; rg.step='1'; rg.value=c.weight; rg.disabled=fige;
  rg.setAttribute('aria-label','Pondération de '+c.label); rg.style.setProperty('--teinte', teinteCritere(idx));
  rg.style.setProperty('--pct', c.weight+'%');
  var nb=add(ctl,'input','crit-valeur'); nb.type='number'; nb.min='0'; nb.max='100'; nb.value=c.weight; nb.disabled=fige;
  nb.setAttribute('aria-label','Pondération de '+c.label+' en pourcentage');
  add(ctl,'span','crit-pct','%');
  function poser(v){
    v=Math.max(0,Math.min(100,Math.round(Number(v)||0)));
    if(v===Number(c.weight)) return;
    c.weight=v; logit('Pondération « '+c.label+' » portée à '+v+' %'); save(); render();
  }
  rg.addEventListener('input',function(){ nb.value=rg.value; rg.style.setProperty('--pct', rg.value+'%'); });
  rg.addEventListener('change',function(){ poser(rg.value); });
  nb.addEventListener('change',function(){ poser(nb.value); });

  if(fige) return;
  var del=boutonIcone(row,'x','Supprimer '+c.label,function(){
    if(state.criteria.length<=1){ toast('La grille doit conserver au moins un critère.'); return; }
    ask('Le classement sera recalculé sans ce critère. Pensez à réajuster les pondérations pour retrouver un total de 100 %.', function(){
      logit('Critère supprimé : '+c.label); state.criteria.splice(idx,1); save(); render();
    }, 'Supprimer le critère « '+c.label+' » ?', 'Supprimer');
  });
  del.classList.add('crit-suppr');
}
