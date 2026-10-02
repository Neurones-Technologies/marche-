/* Marché+ — Composants de présentation partagés (icônes, pastilles, bandeaux, frise) et bandeau de déclaration de conflit d’intérêts.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

/* ============ Composants de présentation (styles : css/app.css, valeurs : css/tokens.css) ============ */
/* Icônes : traits vectoriels intégrés, couleur héritée du texte. */
var ICONS = {
  home:'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  bell:'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8|M10 20a2 2 0 0 0 4 0',
  file:'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z|M14 3v5h5M9 13h6M9 17h6',
  book:'M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z|M4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3',
  sliders:'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0|M16 4v4M10 10v4M18 16v4',
  chat:'M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z',
  upload:'M12 15V4M7 9l5-5 5 5|M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
  inbox:'M3 13h5l1.5 3h5L16 13h5|M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z',
  search:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z|m20 20-4-4',
  shield:'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z|m9 12 2 2 4-4',
  help:'M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z|M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6M12 16.5h.01',
  chart:'M4 20V10M10 20V4M16 20v-7M22 20H2',
  gavel:'m14 5 5 5M11 8l5 5M9 10l5-5 5 5-5 5zM4 20l7-7',
  scale:'M12 3v18M7 21h10M5 7h14|M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z',
  stamp:'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z|M14 3v5h5|m9 15 2 2 4-4',
  list:'M9 6h11M9 12h11M9 18h11|M4 6h.01M4 12h.01M4 18h.01',
  key:'M15 7a4 4 0 1 0 0 .01|M12 10 3 19v2h3l1-1v-2h2v-2h2l1.5-1.5',
  users:'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  cog:'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z|M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  ring:'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8|M10 20a2 2 0 0 0 4 0|M2 8c0-2 1-4 2.5-5M22 8c0-2-1-4-2.5-5',
  check:'m5 12 5 5 9-10',
  coin:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.8 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2',
  clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M12 7v5l3 2',
  info:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M12 11v5M12 8h.01',
  arrow:'M5 12h14M13 6l6 6-6 6',
  lock:'M6 11h12v10H6z|M8 11V7a4 4 0 0 1 8 0v4',
  folder:'M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  badge:'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z|M9 12h6M9 15h4',
  cart:'M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 8H6|M9 20h.01M17 20h.01',
  clipboard:'M9 4h6v3H9z|M9 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-3|M9 12h6M9 16h4'
};
function icon(parent, name){
  var NS='http://www.w3.org/2000/svg', s=document.createElementNS(NS,'svg');
  s.setAttribute('class','ic'); s.setAttribute('viewBox','0 0 24 24'); s.setAttribute('aria-hidden','true');
  s.setAttribute('fill','none'); s.setAttribute('stroke','currentColor'); s.setAttribute('stroke-width','1.8');
  s.setAttribute('stroke-linecap','round'); s.setAttribute('stroke-linejoin','round');
  (ICONS[name]||ICONS.info).split('|').forEach(function(d){ var p=document.createElementNS(NS,'path'); p.setAttribute('d',d); s.appendChild(p); });
  if(parent) parent.appendChild(s);
  return s;
}
/* Icône de chaque écran du menu. */
var NAV_ICONS = { accueil:'home', dashboard:'info', notifs:'bell', procedures:'folder', besoins:'clipboard', referencement:'badge', partenaires:'users', commandes:'cart', cdc:'file', dao:'book', criteres:'sliders', qa:'chat', portail:'upload',
  reception:'inbox', depouille:'search', conformite:'shield', clarifs:'help', evaluation:'chart', decision:'gavel',
  recours:'scale', pv:'stamp', audit:'list', roles:'key', comptes:'users', params:'cog', regles:'ring' };

/* Pastille de statut : kind = ok | blocked | pending | draft | info. */
function chip(parent, kind, text, ic){ var c=add(parent,'span','chip chip-'+kind); if(ic) icon(c,ic); c.appendChild(document.createTextNode(text)); return c; }
/* Infobulle d'aide, lisible au survol et au clavier. */
function tip(parent, text){
  var b=add(parent,'button','tip','?'); b.type='button';
  b.setAttribute('aria-label',text); b.setAttribute('data-tip',text);
  return b;
}
/* Bandeau d'une ligne : kind = ok | blocked | pending | info. */
function banner(parent, kind, titre, detail, aide){
  var d=add(parent,'div','banner banner-'+kind);
  d.setAttribute('role', kind==='blocked' ? 'alert' : 'status');
  add(d,'strong',null,titre);
  if(detail) add(d,'span',null,detail);
  if(aide) tip(d,aide);
  return d;
}
/* Bouton avec icône. */
function ibtn(parent, cls, text, ic, apres){
  var b=add(parent,'button','btn '+cls); b.type='button';
  if(ic && !apres) icon(b,ic);
  b.appendChild(document.createTextNode(text));
  if(ic && apres) icon(b,ic);
  return b;
}
/* Carte « Prochaine étape » : ce qu'il faut faire maintenant, en une phrase et un bouton. */
function guideCard(m, g){
  var c=add(m,'section','card guide'+(g.ok?' ok':'')); c.setAttribute('aria-label','Prochaine étape');
  icon(add(c,'span','guide-ico'), g.ok ? 'check' : (g.icon||'arrow'));
  var t=add(c,'div'); add(t,'h2',null,g.titre); if(g.texte) add(t,'p',null,g.texte);
  if(g.action){ var b=ibtn(c,'btn-primary',g.action,'arrow',true); fk(b,'guide'); if(g.go) b.addEventListener('click',g.go); }
  return c;
}
/* Montant « 84 660 000 XOF » : chiffres en mono, devise en gris, contre-valeur au taux de la procédure. */
function montant(parent, texte){
  var mt=/^([\d\s  ]+(?:[.,]\d+)?)\s+([A-Z]{3})$/.exec(String(texte));
  if(!mt){ parent.appendChild(document.createTextNode(texte)); return; }
  add(parent,'span','num',mt[1]); add(parent,'span','ccy',mt[2]);
  if(mt[2]!=='XOF'){
    var n=Number(mt[1].replace(/[\s  ]/g,'').replace(',','.'));
    add(parent,'span','alt','≈ '+sep(n*RATE(mt[2]))+' XOF · taux '+Number(RATE(mt[2])).toLocaleString('fr-FR')+(state.fxFrozen?' figé':''));
  }
}
function initiales(nom){ return String(nom).replace(/[^A-Za-zÀ-ÿ ]/g,' ').split(/\s+/).filter(function(x){ return x.length>2 || /^[A-Z]/.test(x); }).map(function(x){ return x[0]; }).join('').slice(0,2).toUpperCase(); }

/* Parcours de la procédure, en tête de chaque écran de procédure. */
/* Le déroulé d'une procédure, en six étapes. Une étape regroupe un ou plusieurs écrans (sous-onglets). La vue
   d'ensemble et le journal d'audit ne sont pas des étapes : ce sont des outils, en pied de page. */
var ETAPES = [
  {id:'prep',    lab:'Préparer',              vues:['cdc','dao','criteres']},
  {id:'publi',   lab:'Publication et offres', vues:['qa','reception']},
  {id:'depouil', lab:'Dépouiller',            vues:['depouille','conformite','clarifs']},
  {id:'eval',    lab:'Évaluer',               vues:['evaluation']},
  {id:'decide',  lab:'Décider',               vues:['decision']},
  {id:'close',   lab:'Clore',                 vues:['recours','pv']}
];
var OUTILS_PROCEDURE = ['dashboard','audit'];
var FLOW_LAB = { done:'terminée', now:'en cours', blocked:'bloquée', todo:'à venir' };
function etapesStatut(){
  var s=lifeStatus(), recu=state.depClosed || (state.cdc.cdcPublie && SEED_OFFERS.length);
  return { prep:s.prep, publi: state.depClosed ? 'done' : (state.cdc.cdcPublie ? 'now' : 'todo'),
    depouil: s.clarif==='blocked' ? 'blocked' : (state.depClosed ? 'done' : (recu ? 'now' : 'todo')),
    eval:s.eval, decide:s.appro,
    close: state.contractSigned ? 'done' : (s.recours==='blocked' ? 'blocked' : (allApproved() ? 'now' : 'todo')) };
}
function etapeDe(vue){ for(var i=0;i<ETAPES.length;i++) if(ETAPES[i].vues.indexOf(vue)>=0) return ETAPES[i]; return null; }
function vuesPermises(etape){ return etape.vues.filter(viewAllowed); }
/* Écran où reprendre une procédure : le dernier ouvert, sinon le premier écran de l'étape en cours. */
function vueProcedureCourante(){
  if(UI.derniereVueProc && viewAllowed(UI.derniereVueProc)) return UI.derniereVueProc;
  var st=etapesStatut();
  for(var i=0;i<ETAPES.length;i++){ var v=vuesPermises(ETAPES[i]); if(v.length && (st[ETAPES[i].id]==='now' || st[ETAPES[i].id]==='blocked')) return v[0]; }
  return viewAllowed('dashboard') ? 'dashboard' : (VIEWS.filter(function(x){ return x.grp==='Procédure' && vueVisible(x); })[0]||{}).id;
}
/* Le cadre (frise, sous-onglets) s'adresse à ceux qui conduisent la procédure ; un prestataire ou un demandeur
   n'en voit qu'un ou deux écrans, sans cadre. */
function avecCadreProcedure(){ return VIEWS.filter(function(v){ return v.grp==='Procédure' && vueVisible(v); }).length>=3; }

/* En-tête, frise des étapes et sous-onglets ; retourne le conteneur où l'écran se dessine. */
function cadreProcedureHaut(m){
  var c=state.cdc||{}, cur=MP.current();
  var hd=add(m,'div','proc-head');
  var g=add(hd,'div'); g.style.cssText='min-width:0;flex:1 1 320px';
  var t=add(g,'div'); add(t,'strong',null,REF()); add(t,'span','muted',' — '+(c.objet||''));
  var ch=add(g,'div'); ch.style.cssText='display:flex;gap:6px;flex-wrap:wrap;margin-top:4px';
  var ph=phase(); add(ch,'span','chip '+ph.c,ph.k);
  add(ch,'span','chip c-grey',MPProfils.profil(R.profilId(RCTX())).lab);
  var autres=MP.procs().filter(function(p){ return !p.archive || p.id===MP.pid(); });
  if(autres.length>1){
    var s=add(hd,'select'); s.setAttribute('aria-label','Changer de procédure'); fk(s,'proc-sel'); s.id='proc-sel';
    autres.forEach(function(p){ var o=add(s,'option',null,p.ref+(p.archive?' (archivée)':'')+' — '+(p.objet||'')); o.value=p.id; });
    s.value=MP.pid();
    s.addEventListener('change',function(){ ouvrirProcedure(s.value, state.view); });
  }
  if(cur && cur.archive){ var na=add(m,'div','note'); add(na,'strong',null,'Procédure archivée. '); na.appendChild(document.createTextNode('Elle se consulte mais ne se modifie plus.')); }

  var st=etapesStatut(), etape=etapeDe(state.view);
  var ol=add(m,'ol','flow'); ol.setAttribute('aria-label','Étapes de la procédure');
  ETAPES.forEach(function(e,i){
    var li=add(ol,'li','flow-step '+st[e.id]);
    var vues=vuesPermises(e), b=add(li, vues.length?'button':'span');
    var n=add(b,'span','flow-n');
    if(st[e.id]==='done') icon(n,'check'); else n.textContent=String(i+1);
    add(b,'span','flow-label',e.lab);
    if(vues.length){ b.type='button'; fk(b,'etape-'+e.id); b.addEventListener('click',function(){ go(vues[0]); }); }
    if(etape===e) b.setAttribute('aria-current','step');
    add(b,'span','sr-only',' — '+FLOW_LAB[st[e.id]]);
  });
  if(etape){
    var vues=vuesPermises(etape);
    if(vues.length>1){
      var tabs=add(m,'div','proc-tabs'); tabs.setAttribute('role','tablist');
      vues.forEach(function(v){
        var def=VIEWS.filter(function(x){ return x.id===v; })[0];
        var bt=add(tabs,'button','pill'+(v===state.view?' on':''),def.label); fk(bt,'onglet-'+v);
        bt.setAttribute('role','tab'); bt.setAttribute('aria-selected',v===state.view?'true':'false');
        var verrou=lockReason(v); if(verrou) bt.title=verrou;
        bt.addEventListener('click',function(){ go(v); });
      });
    }
  }
  return add(m,'div');
}
/* Pied : étape précédente et suivante, et les outils de la procédure. */
function cadreProcedureBas(m){
  var etape=etapeDe(state.view), pied=add(m,'div','proc-foot');
  var nav=add(pied,'div'); nav.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
  if(etape){
    var i=ETAPES.indexOf(etape);
    var prec=ETAPES[i-1], suiv=ETAPES[i+1];
    if(prec && vuesPermises(prec).length){ var bp=add(nav,'button','btn btn-ghost btn-sm','← '+prec.lab); fk(bp,'etape-prec'); bp.addEventListener('click',function(){ go(vuesPermises(prec)[0]); }); }
    if(suiv && vuesPermises(suiv).length){ var bs=add(nav,'button','btn btn-primary btn-sm','Étape suivante : '+suiv.lab+' →'); fk(bs,'etape-suiv'); bs.addEventListener('click',function(){ go(vuesPermises(suiv)[0]); }); }
  }
  var outils=add(pied,'div'); outils.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
  OUTILS_PROCEDURE.filter(viewAllowed).forEach(function(v){
    var def=VIEWS.filter(function(x){ return x.id===v; })[0];
    var bo=add(outils,'button','btn btn-ghost btn-sm'+(v===state.view?' on':''),def.label); fk(bo,'outil-'+v);
    bo.addEventListener('click',function(){ go(v); });
  });
}

/* Icône d'un champ extrait, d'après son libellé. */
function fieldIcon(k){
  if(/montant|prix/i.test(k)) return 'coin';
  if(/délai/i.test(k)) return 'clock';
  if(/garantie/i.test(k)) return 'shield';
  if(/caution|pièce|document/i.test(k)) return 'file';
  return 'info';
}
function aVerifier(o){ return o.fields.filter(function(f,i){ return f.flag && !state.confirmed[o.id+'_'+i]; }).length; }

/* ============ Déclaration de conflit d'intérêts ============ */
function coiBanner(m){
  var d=coiDe(state.me);
  if(d && d.declare && !d.conflit) return false;
  var c=add(m,'div','card pad'); c.style.cssText+=';border-color:var(--amber-line);border-width:2px;margin-bottom:18px';
  if(d && d.conflit){
    add(c,'strong',null,'Conflit d\u2019intérêts déclaré — notation impossible');
    add(c,'p','muted','Vous avez déclaré un lien avec un ou plusieurs soumissionnaires. Vous ne pouvez pas noter les offres de cette procédure. Motif consigné : '+(d.note||'non précisé')+'.');
    return true;
  }
  add(c,'strong',null,'Déclaration préalable requise');
  add(c,'p','muted',"Avant de noter, chaque évaluateur déclare l'absence de lien personnel, familial ou d'intérêt avec les soumissionnaires. Cette déclaration est horodatée et versée à la piste d'audit ; elle est la première chose qu'examine un organe de régulation saisi d'un recours.");
  var acts=add(c,'div'); acts.style.cssText='display:flex;gap:10px;flex-wrap:wrap;margin-top:12px';
  var ok=add(acts,'button','btn btn-primary','Je déclare n\u2019avoir aucun conflit'); fk(ok,'coi-ok');
  ok.addEventListener('click',function(){
    ask("Vous attestez n'avoir aucun lien personnel, familial, financier ou professionnel avec les soumissionnaires de cette procédure. Toute fausse déclaration engage votre responsabilité.",
      function(){
        state.coi[state.me]={declare:true, conflit:false, t:new Date().toLocaleString('fr-FR')};
        logit('Déclaration d\u2019absence de conflit d\u2019intérêts — '+me().nom);
        notify('coi.declare','Déclaration de conflit d\u2019intérêts', me().nom+" ("+myRole().lab+") déclare n'avoir aucun conflit d'intérêts sur la procédure "+REF()+".");
        save(); render();
      },"Confirmer la déclaration ?","Je déclare");
  });
  var ko=add(acts,'button','btn btn-danger','Je déclare un conflit'); fk(ko,'coi-ko');
  ko.addEventListener('click',function(){
    ask("Vous serez écarté de la notation de cette procédure. Le motif sera consigné et le responsable des achats devra désigner un autre évaluateur.",
      function(){
        state.coi[state.me]={declare:true, conflit:true, note:'Lien professionnel antérieur avec un soumissionnaire', t:new Date().toLocaleString('fr-FR')};
        logit('Conflit d\u2019intérêts déclaré — '+me().nom+' écarté de la notation');
        notify('coi.declare','Conflit d\u2019intérêts déclaré', me().nom+" ("+myRole().lab+") se déporte de la notation de la procédure "+REF()+". Un remplaçant doit être désigné.");
        save(); render();
      },"Déclarer un conflit d'intérêts ?","Je me déporte");
  });
  return true;
}
