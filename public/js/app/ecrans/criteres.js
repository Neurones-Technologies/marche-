/* Marché+ — Écran Grille de critères.
   Une barre de répartition montre d'un coup d'œil le poids de chaque critère (et la part non attribuée) ; dessous,
   une ligne compacte par critère, regroupée par type, avec un curseur pour la pondération.
   Couleurs : palette catégorielle validée (8 teintes, ordre fixe, jamais recyclé) ; au-delà, gris et regroupement
   « Autres » dans la barre. Le nom et le pourcentage sont toujours écrits : la couleur ne porte jamais seule l'identité.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

var CRIT_TEINTES = 8; // --crit-1 … --crit-8 (css/app.css) ; au-delà : --crit-autre
function teinteCritere(i){ return i < CRIT_TEINTES ? 'var(--crit-'+(i+1)+')' : 'var(--crit-autre)'; }

function vCriteres(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Grille de critères');
  var fige=!!state.depClosed, crit=state.criteria, wt=weightTotal();

  /* Répartition */
  var k1=add(m,'div','card');
  var ph=add(k1,'div','panel-head'); add(ph,'span',null,'Répartition des pondérations');
  add(ph,'span','chip '+(wt===100?'c-green':'c-red'), wt===100 ? 'Total : 100 % ✓' : 'Total : '+wt+' %');
  var b1=add(k1,'div','pad');
  var barre=add(b1,'div','crit-barre'); barre.setAttribute('role','img');
  barre.setAttribute('aria-label','Répartition : '+crit.map(function(c){ return c.label+' '+c.weight+' %'; }).join(', ')+(wt<100?', non attribué '+(100-wt)+' %':''));
  var echelle=Math.max(100,wt), autres=0, nAutres=0;
  crit.forEach(function(c,i){
    if(i>=CRIT_TEINTES){ autres+=Number(c.weight)||0; nAutres++; return; }
    segment(barre, c.label, Number(c.weight)||0, echelle, teinteCritere(i));
  });
  if(nAutres) segment(barre, 'Autres ('+nAutres+')', autres, echelle, 'var(--crit-autre)');
  if(wt<100) segment(barre, 'Non attribué', 100-wt, echelle, null);
  var auto=0, qual=0; crit.forEach(function(c){ if(c.kind==='auto') auto+=Number(c.weight)||0; else qual+=Number(c.weight)||0; });
  var res=add(b1,'div','crit-resume');
  add(res,'span',null,'Calculés automatiquement : '+auto+' %');
  add(res,'span',null,'Notés par l’évaluateur : '+qual+' %');
  if(wt>100) add(res,'span','crit-alerte','Dépassement : +'+(wt-100)+' %');
  else if(wt<100) add(res,'span','crit-alerte','Reste à répartir : '+(100-wt)+' %');

  /* Critères, regroupés par type */
  var k2=add(m,'div','card'); k2.style.marginTop='18px';
  var ph2=add(k2,'div','panel-head'); add(ph2,'span',null,'Critères');
  add(ph2,'span','chip c-grey',crit.length+' critère'+(crit.length>1?'s':''));
  var b2=add(k2,'div','pad');
  [['auto','Calculés automatiquement'],['qual','Notés par l’évaluateur · note proposée par l’IA']].forEach(function(g){
    var lignes=crit.map(function(c,i){ return {c:c,i:i}; }).filter(function(x){ return (x.c.kind==='auto')===(g[0]==='auto'); });
    var grp=add(b2,'div','crit-groupe');
    add(grp,'div','crit-groupe-titre',g[1]);
    lignes.forEach(function(x){ ligneCritere(grp, x.c, x.i, fige); });
    if(g[0]==='qual' && !fige){
      var aj=add(grp,'button','btn btn-ghost btn-sm crit-ajout','+ Ajouter un critère'); fk(aj,'crit-ajouter');
      aj.addEventListener('click',function(){
        // Pas d'écriture dans les notes : un critère sans note vaut 70 (curScore), et noter relève de l'évaluateur.
        state.criteria.push({id:'c'+Date.now(),label:'Nouveau critère',weight:0,kind:'qual',hint:'Notation proposée par IA, validée par un évaluateur'});
        logit('Critère ajouté à la grille'); save(); render();
      });
    }
  });

  if(fige){
    var lk=add(m,'div','warn'); lk.style.marginTop='18px';
    add(lk,'strong',null,'Grille figée. ');
    lk.appendChild(document.createTextNode("Le dépouillement est clôturé : la grille publiée au dossier ne peut plus être modifiée. La changer après l'ouverture des plis serait un motif d'annulation."));
  }
}

/* Un segment de la barre ; teinte null : la part non attribuée (hachurée). Libellé écrit dès que la place le permet. */
function segment(barre, lab, poids, echelle, teinte){
  if(poids<=0) return;
  var s=add(barre,'div','crit-seg'+(teinte?'':' vide'));
  s.style.flexGrow=String(poids); s.style.flexBasis='0';
  if(teinte) s.style.background=teinte;
  s.title=lab+' — '+poids+' %';
  if(poids/echelle>=0.12){ add(s,'span','crit-seg-lab',lab); add(s,'span','crit-seg-val',poids+' %'); }
  else if(poids/echelle>=0.05) add(s,'span','crit-seg-val',poids+' %');
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
