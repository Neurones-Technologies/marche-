/* Marché+ — Clauses techniques (CCTP) propres à l'achat, dans le cahier des charges. L'IA les rédige à partir du
   cahier des charges enregistré (server/ia.js, tâche de fond suivie ici) ; l'acheteur les relit, les modifie article
   par article, en ajoute ou en retire. Sans clauses rédigées, le dossier publié contient un CCTP générique tiré de
   l'objet, des lots et des conditions (cctpGenerique, dao.js). L'article des spécifications minimales est toujours
   construit depuis la section « Spécifications techniques ».
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

UI.cctp = null;
function etatCctp(){
  var pid=state.procedure;
  if(!UI.cctp || UI.cctp.pid!==pid) UI.cctp={ pid:pid, tache:null, depuis:0, erreur:null };
  return UI.cctp;
}
var SOURCES_CCTP = { ia:['Rédigé par l’IA','c-violet'], exemple:['Exemple de démonstration','c-grey'], saisie:['Saisi par l’acheteur','c-grey'] };

/* Section du cahier des charges. num : son numéro dans le formulaire. */
function vCdcCctp(m, num){
  var c=state.cdc, ia=etatIA(), x=etatCctp(), cc=c.cctp, arts=(cc && cc.articles) || [];
  var k=add(m,'div','card'); k.style.marginTop='18px';
  var ph=add(k,'div','panel-head'); add(ph,'span',null,num+' · Clauses techniques (CCTP)');
  if(arts.length){ var so=SOURCES_CCTP[cc.source]||SOURCES_CCTP.saisie; chipCellule(ph, so[0]+(cc.le?' le '+cc.le:''), so[1]); }
  var b=add(k,'div','pad');

  if(x.tache){
    var pr=add(b,'p',null,'Rédaction des clauses techniques… '+x.depuis+' s'); pr.setAttribute('role','status');
    add(b,'p','muted','Cela prend en général une à trois minutes. Vous pouvez continuer à remplir le cahier des charges : les clauses apparaîtront ici.');
    return;
  }
  if(x.erreur){ var e=add(b,'div','warn'); add(e,'strong',null,'Rédaction impossible. '); e.appendChild(document.createTextNode(x.erreur)); e.style.marginBottom='12px'; }

  if(!arts.length){
    add(b,'p','muted','Aucune clause propre à cet achat : le dossier contiendra un CCTP générique (objet, lots, délais, réception, garantie). '+
      (ia.actif ? 'Faites rédiger par l’IA des clauses adaptées à l’objet et aux lots, puis relisez-les.' : 'Rédigez vos articles ci-dessous.'));
  } else {
    if((cc.aVerifier||[]).length){
      var n=add(b,'details','note cctp-verifier'); n.style.marginBottom='12px';
      add(n,'summary',null,cc.aVerifier.length+' point(s) à vérifier avant publication (valeurs supposées, données manquantes)');
      var ul=add(n,'ul'); ul.style.margin='8px 0 0 18px';
      cc.aVerifier.forEach(function(v){ add(ul,'li',null,v); });
    }
    add(b,'p','muted',arts.length+' article(s). L’article « Spécifications minimales » est ajouté au dossier à partir de la section 3.').style.marginBottom='8px';
    arts.forEach(function(a,i){ articleCctp(b, cc, a, i); });
  }

  var f=add(k,'div','panel-foot');
  var aj=add(f,'button','btn btn-ghost btn-sm','+ Ajouter un article'); fk(aj,'cctp-ajout');
  aj.addEventListener('click',function(){
    if(!c.cctp) c.cctp={ source:'saisie', articles:[] };
    c.cctp.articles.push({ titre:'Nouvel article', paragraphes:['Texte de l’article.'] });
    UI.cctpOuvert=c.cctp.articles.length-1; logit('CCTP : article ajouté'); save(); render();
  });
  if(ia.actif){
    var go=add(f,'button','btn '+(arts.length?'btn-ghost':'btn-primary')+' btn-sm', arts.length?'Rédiger à nouveau avec l’IA':'Rédiger avec l’IA'); fk(go,'cctp-ia');
    go.addEventListener('click',function(){
      if(!String(c.objet||'').trim()){ toast('Renseignez d’abord l’objet du marché.'); return; }
      var lancer=function(){ redigerCctpIA(); };
      if(arts.length) ask('Les '+arts.length+' article(s) actuels seront remplacés par une nouvelle rédaction, y compris vos modifications.',lancer,'Rédiger à nouveau le CCTP ?','Remplacer');
      else lancer();
    });
  }
  if(arts.length){
    var rt=add(f,'button','btn btn-ghost btn-sm','Revenir au CCTP générique'); fk(rt,'cctp-retirer');
    rt.addEventListener('click',function(){
      ask('Les articles rédigés sont supprimés ; le dossier contiendra le CCTP générique.',function(){
        delete c.cctp; logit('CCTP : clauses propres retirées (CCTP générique)'); save(); render();
      },'Revenir au CCTP générique ?','Supprimer les articles');
    });
  }
}

/* Un article : replié par défaut ; titre et texte modifiables (paragraphes séparés par une ligne vide). */
function articleCctp(parent, cc, a, i){
  var d=add(parent,'details','cctp-article'); if(UI.cctpOuvert===i) d.open=true;
  d.addEventListener('toggle',function(){ if(d.open) UI.cctpOuvert=i; else if(UI.cctpOuvert===i) UI.cctpOuvert=null; });
  var s=add(d,'summary'); add(s,'span',null,a.titre);
  add(s,'span','muted',a.paragraphes.length+' §');
  var z=add(d,'div','cctp-corps');
  var lt=add(z,'label',null,'Titre de l’article'); lt.setAttribute('for','cctp-titre-'+i);
  var ti=add(z,'input'); ti.type='text'; ti.id='cctp-titre-'+i; ti.value=a.titre; ti.maxLength=200; fk(ti,'cctp-titre-'+i);
  var lx=add(z,'label',null,'Texte (un paragraphe par bloc, séparés par une ligne vide)'); lx.setAttribute('for','cctp-texte-'+i);
  var ta=add(z,'textarea'); ta.id='cctp-texte-'+i; ta.rows=Math.min(16,4+a.paragraphes.length*3); ta.value=a.paragraphes.join('\n\n'); fk(ta,'cctp-texte-'+i);
  function enregistrer(){
    var t=ti.value.trim(), ps=ta.value.split(/\n\s*\n/).map(function(p){ return p.replace(/\s*\n\s*/g,' ').trim(); }).filter(Boolean);
    if(!t){ ti.value=a.titre; toast('Le titre ne peut pas être vide.'); return; }
    if(!ps.length){ toast('Le texte de l’article est vide : supprimez l’article s’il n’a plus lieu d’être.'); return; }
    if(ps.length>15) ps=ps.slice(0,14).concat([ps.slice(14).join(' ')]);
    if(t===a.titre && ps.join('\n')===a.paragraphes.join('\n')) return;
    a.titre=t; a.paragraphes=ps.map(function(p){ return p.slice(0,4000); }); cc.modifie=true;
    logit('CCTP : article '+(i+1)+' modifié'); save(); render();
  }
  ti.addEventListener('change',enregistrer); ta.addEventListener('change',enregistrer);
  var act=add(z,'div','cctp-actions');
  var sup=add(act,'button','btn btn-ghost btn-sm','Supprimer l’article'); fk(sup,'cctp-sup-'+i);
  sup.addEventListener('click',function(){
    ask('L’article « '+a.titre+' » disparaîtra du dossier.',function(){
      cc.articles.splice(i,1); UI.cctpOuvert=null;
      if(!cc.articles.length) delete state.cdc.cctp;
      logit('CCTP : article supprimé — '+a.titre); save(); render();
    },'Supprimer cet article ?','Supprimer');
  });
}

/* Demande à l'IA ; la tâche est suivie jusqu'à son terme, puis les clauses remplacent les précédentes. */
function redigerCctpIA(){
  var x=etatCctp();
  x.erreur=null; x.tache='…'; x.depuis=0; render();
  // le serveur rédige à partir du cahier des charges enregistré : on enregistre d'abord la saisie en cours
  Promise.resolve(typeof flush==='function' ? flush() : null).then(function(){ return MP.api('POST',MP.url('/ia/cctp'),{}); })
    .then(function(r){ x.tache=r.tache; suivreCctp(x, r.tache); })
    .catch(function(e){ x.tache=null; x.erreur=e.message||'Erreur.'; render(); });
}
function suivreCctp(x, id){
  setTimeout(function(){
    if(UI.cctp!==x || x.tache!==id) return; // procédure changée entre-temps
    MP.api('GET',MP.url('/ia/taches/'+encodeURIComponent(id))).then(function(r){
      if(r.etat==='en_cours'){ x.depuis=r.depuis; if(state.view==='cdc') render(); suivreCctp(x,id); return; }
      x.tache=null;
      if(!r.cctp || !r.cctp.articles.length){ x.erreur='Aucun article rédigé : réessayez.'; render(); return; }
      state.cdc.cctp={ source:'ia', modele:r.modele, le:new Date().toLocaleDateString('fr-FR'), articles:r.cctp.articles, aVerifier:r.cctp.aVerifier||[] };
      UI.cctpOuvert=0; logit('CCTP rédigé par l’IA — '+r.cctp.articles.length+' article(s)'); save(); render();
      toast('Clauses techniques rédigées : relisez-les avant de publier.');
    }).catch(function(e){ x.tache=null; x.erreur=e.message||'Erreur.'; render(); });
  }, 2500);
}
