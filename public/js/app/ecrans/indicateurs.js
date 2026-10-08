/* Marché+ — Indicateurs de pilotage des achats (GET /api/indicateurs) : volumes, délais entre les étapes datées par
   le serveur, économies (estimation du dossier comparée au montant attribué), concurrence et commandes, sur une
   année ou depuis l'origine. Lecture seule.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

UI.indicateursAnnee = UI.indicateursAnnee || '';
UI.indicateursOnglet = UI.indicateursOnglet || 'delais';
var ETAPES_DELAIS = [
  ['preparation','Préparation du dossier','de la création à la publication'],
  ['consultation','Consultation','de la publication à la clôture du dépouillement'],
  ['evaluation','Évaluation et approbation','de la clôture du dépouillement à l’attribution'],
  ['cycle','Cycle de passation','de la publication à l’attribution'],
  ['signature','Signature','de l’attribution à la signature du marché']
];
function joursLisibles(v){ return v==null ? '—' : (Math.round(v*10)/10).toString().replace('.',',')+' j'; }

/* Barre empilée (parts d'un tout) : segments séparés par un filet, libellés en légende ; description lue par les lecteurs d'écran. */
function barreSegments(parent, segs, titre){
  var b=add(parent,'div','segbar'); b.setAttribute('role','img');
  b.setAttribute('aria-label', titre+' : '+segs.map(function(x){ return x.n+' '+x.lab; }).join(', '));
  segs.forEach(function(x){ if(!x.n) return; var e=add(b,'span','seg '+x.cls); e.style.flexGrow=String(x.n); e.title=x.lab+' : '+x.n; });
  return b;
}
function legendeSegments(parent, segs){
  var l=add(parent,'div','ind-legende');
  segs.forEach(function(x){ var i=add(l,'span','ind-leg'); add(i,'span','ind-pastille '+x.cls); i.appendChild(document.createTextNode(x.lab+' · '+x.n)); });
}
/* Message quand il n'y a rien à montrer : dit pourquoi et ce qui le fera apparaître. */
function videIndicateur(parent, ic, titre, texte){
  var v=add(parent,'div','ind-vide'); var pic=add(v,'span','kpi-ic'); icon(pic,ic);
  var t=add(v,'div'); add(t,'strong',null,titre); add(t,'div','muted',texte);
}
var PHASE_COUL = { preparation:'c-grey', publiee:'c-amber', evaluation:'c-blue', approbation:'c-teal', attribuee:'c-teal', signee:'c-green', infructueuse:'c-red', archivee:'c-grey' };

function vIndicateurs(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Indicateurs');
  add(l,'p','muted ind-intro','Pilotage des achats : volumes, délais, économies, concurrence et budget.');
  // période : une année (date de création de l'appel d'offres) ou toutes ; posé tout de suite, rempli au chargement
  var sel=add(h,'select'); sel.setAttribute('aria-label','Période'); fk(sel,'indicateurs-annee');
  add(sel,'option',null,'Depuis l’origine').value='';
  if(UI.indicateursAnnee) add(sel,'option',null,'Année '+UI.indicateursAnnee).value=UI.indicateursAnnee;
  sel.value=UI.indicateursAnnee;
  sel.addEventListener('change',function(){ UI.indicateursAnnee=sel.value; render(); });
  var zone=add(m,'div'); add(zone,'p','muted','Chargement…');
  MP.api('GET','/api/indicateurs'+(UI.indicateursAnnee?'?annee='+UI.indicateursAnnee:'')).then(function(r){ zone.textContent=''; dessiner(r); })
    .catch(function(e){ zone.textContent=''; add(zone,'p','muted',e.message); });

  function dessiner(r){
    r.annees.slice().reverse().forEach(function(a){ if(String(a)!==UI.indicateursAnnee) add(sel,'option',null,'Année '+a).value=String(a); });
    sel.value=UI.indicateursAnnee;

    var v=r.volumes, e=r.economies, cc=r.concurrence, d=r.delais, co=r.commandes;

    /* L'essentiel : quatre chiffres. Le détail est dans les onglets dessous. */
    var kp=add(zone,'div','ind-kpis');
    function tuile(lab, valeur, sous, ic, extra){
      var t=add(kp,'div','ind-kpi card');
      var hd=add(t,'div','ind-kpi-tete'); var pic=add(hd,'span','kpi-ic'); icon(pic,ic); add(hd,'span','kpi-lab',lab);
      var va=add(t,'div','ind-val'), mx=/^(.*) (XOF)$/.exec(String(valeur));
      if(mx){ va.appendChild(document.createTextNode(mx[1]+' ')); add(va,'small',null,mx[2]); } else va.textContent=String(valeur);
      if(sous) add(t,'div','kpi-sous',sous);
      if(extra) extra(t);
    }
    var partsAO=[{n:v.attribuees,cls:'s-ok',lab:'attribué(s)'},{n:v.enCours,cls:'s-cours',lab:'en cours'},{n:v.enPreparation,cls:'s-prep',lab:'en préparation'},{n:v.infructueuses,cls:'s-ko',lab:'infructueux'}];
    tuile('Appels d’offres', v.procedures, null, 'folder', function(t){
      if(!v.procedures) return;
      barreSegments(t,partsAO,'Appels d’offres par étape'); legendeSegments(t,partsAO);
    });
    tuile('Montant attribué', xof(v.montantAttribue), 'offres retenues', 'chart');
    tuile('Économies', e.procedures ? xof(e.economie) : '—', e.procedures ? 'sur '+e.procedures+' attribution(s)' : 'aucune attribution avec estimation', 'check', function(t){
      if(e.procedures && e.taux!=null){
        var neg=e.economie<0, x=add(t,'div','ind-puce');
        chipCellule(x, String(Math.abs(e.taux)).replace('.',',')+' % '+(neg?'au-dessus de l’estimation':'sous l’estimation'), neg?'c-red':'c-green');
      }
    });
    tuile('Cycle de passation', d.cycle ? joursLisibles(d.cycle.mediane) : '—', d.cycle ? 'médiane, de la publication à l’attribution' : 'aucune attribution datée', 'clock');

    /* Onglets : un seul détail à la fois */
    var ONGLETS=[['delais','Délais','clock'],['concurrence','Concurrence','inbox'],['budget','Budget et commandes','coin'],['liste','Par appel d’offres','folder']];
    if(!ONGLETS.some(function(o){ return o[0]===UI.indicateursOnglet; })) UI.indicateursOnglet='delais';
    var bar=add(zone,'div','onglets'); bar.setAttribute('role','tablist');
    var corps=add(zone,'div','ind-onglet');
    var boutons={};
    ONGLETS.forEach(function(o){
      var b=add(bar,'button','onglet'); b.type='button'; b.setAttribute('role','tab'); fk(b,'indicateurs-onglet-'+o[0]);
      icon(b,o[2]); b.appendChild(document.createTextNode(o[1])); boutons[o[0]]=b;
      b.addEventListener('click',function(){ UI.indicateursOnglet=o[0]; afficher(); });
    });
    function afficher(){
      ONGLETS.forEach(function(o){ var on=o[0]===UI.indicateursOnglet; boutons[o[0]].classList.toggle('on',on); boutons[o[0]].setAttribute('aria-selected',on?'true':'false'); });
      corps.textContent='';
      ({ delais:ongletDelais, concurrence:ongletConcurrence, budget:ongletBudget, liste:ongletListe })[UI.indicateursOnglet](corps);
    }

    /* Délais par étape : médiane (point) et étendue du plus court au plus long (trait), sur une échelle commune */
    function ongletDelais(box){
      var kd=add(box,'div','card');
      var hd=add(kd,'div','panel-head'); add(hd,'span',null,'Délais par étape'); add(hd,'span','muted ind-aide','médiane et étendue, en jours');
      var bd=add(kd,'div','pad');
      var avec=ETAPES_DELAIS.filter(function(x){ return d[x[0]] && d[x[0]].nb; });
      if(!avec.length){ videIndicateur(bd,'clock','Aucun délai à afficher','Les délais apparaissent dès qu’un appel d’offres franchit une étape : publication, clôture du dépouillement, attribution, signature.'); return; }
      var maxi=Math.max.apply(null, avec.map(function(x){ return d[x[0]].max||0; }))||1;
      ETAPES_DELAIS.forEach(function(x){
        var sd=d[x[0]], ok=sd && sd.nb, row=add(bd,'div','ind-delai');
        var c1=add(row,'div','ind-delai-lab'); add(c1,'strong',null,x[1]); add(c1,'div','muted',x[2]);
        var pl=add(row,'div','plage');
        if(ok){
          pl.setAttribute('role','img'); pl.setAttribute('aria-label',x[1]+' : médiane '+joursLisibles(sd.mediane)+', de '+joursLisibles(sd.min)+' à '+joursLisibles(sd.max));
          pl.title='Médiane '+joursLisibles(sd.mediane)+' · de '+joursLisibles(sd.min)+' à '+joursLisibles(sd.max)+' · moyenne '+joursLisibles(sd.moyenne);
          var et=add(pl,'span','plage-etendue'); et.style.left=(sd.min/maxi*100)+'%'; et.style.width=Math.max((sd.max-sd.min)/maxi*100,1.5)+'%';
          var md=add(pl,'span','plage-med'); md.style.left=(sd.mediane/maxi*100)+'%';
        }
        var vv=add(row,'div','ind-delai-val'); add(vv,'strong',null,ok?joursLisibles(sd.mediane):'—');
        add(vv,'div','muted',ok ? sd.nb+' appel'+(sd.nb>1?'s':'')+' d’offres' : 'pas encore de donnée');
      });
      add(bd,'p','muted ind-note','Échelle commune de 0 à '+joursLisibles(maxi)+'. Les dates sont posées par le serveur au passage de chaque étape ; pour les appels d’offres antérieurs, elles sont reprises du journal d’audit.');
    }

    /* Concurrence : d'où viennent les offres, combien par consultation */
    function ongletConcurrence(box){
      var kc=add(box,'div','card');
      add(kc,'div','panel-head','Concurrence');
      var bc=add(kc,'div','pad');
      if(!cc.offres) videIndicateur(bc,'inbox','Aucune offre reçue','Les offres déposées en ligne ou enregistrées hors plateforme sont comptées ici.');
      else {
        var autres=Math.max(0,cc.offres-cc.enLigne-cc.horsPlateforme);
        var partsOffres=[{n:cc.enLigne,cls:'s-c1',lab:'déposées en ligne'},{n:cc.horsPlateforme,cls:'s-c2',lab:'reçues hors plateforme'},{n:autres,cls:'s-c3',lab:'autres'}];
        add(bc,'div','ind-sous-titre',cc.offres+' offre'+(cc.offres>1?'s':'')+' reçue'+(cc.offres>1?'s':'')+', par origine');
        barreSegments(bc,partsOffres,'Offres par origine'); legendeSegments(bc,partsOffres);
      }
      var mini=add(bc,'div','ind-minis');
      [['Consultations closes', String(cc.consultations), false],
       ['Offres par consultation (médiane)', cc.parConsultation ? String(cc.parConsultation.mediane).replace('.',',') : '—', false],
       ['Consultations avec moins de 3 offres', String(cc.moinsDeTrois), cc.moinsDeTrois>0]].forEach(function(x){
        var t=add(mini,'div','ind-mini'+(x[2]?' ind-mini-alerte':'')); add(t,'div','ind-mini-val',x[1]); add(t,'div','ind-mini-lab',x[0]);
      });
    }

    /* Budget et commandes : lignes budgétaires (si l'utilisateur peut les lire) et commandes émises */
    function ongletBudget(box){
      var kc=add(box,'div','card');
      add(kc,'div','panel-head','Commandes');
      var bc=add(kc,'div','pad');
      if(!co.emises) videIndicateur(bc,'camion','Aucune commande émise','Les commandes émises à partir des appels d’offres attribués sont comptées ici.');
      else {
        var partsCmd=[{n:co.receptionnees,cls:'s-ok',lab:'réceptionnée(s)'},{n:Math.max(0,co.emises-co.receptionnees),cls:'s-cours',lab:'en cours'}];
        add(bc,'div','ind-sous-titre',co.emises+' commande'+(co.emises>1?'s':'')+' émise'+(co.emises>1?'s':'')+' · '+xof(co.montant)+' engagés');
        barreSegments(bc,partsCmd,'Commandes'); legendeSegments(bc,partsCmd);
      }
      var sit=situationBudget();
      if(sit && sit.length){
        tableau(box,{ cle:'indicateurs-budget', titre:'Budget et engagement', lignes:sit,
          colonnes:[
            {lab:'Ligne', rendu:function(l,td){ add(td,'strong',null,l.code); add(td,'div','dt-extrait',l.libelle+' ('+l.exercice+')'); }},
            {lab:'Alloué', num:true, val:function(l){ return xof(l.montant); }},
            {lab:'Engagé', num:true, val:function(l){ return xof(l.engage); }},
            {lab:'Réservé', num:true, val:function(l){ return xof(l.reserve); }},
            {lab:'Disponible', num:true, rendu:function(l,td){ add(td,'span',l.disponible<0?'budget-epuise':null,xof(l.disponible)); }},
            {lab:'Consommation', rendu:function(l,td){
              var tot=l.montant||0, pe=tot ? Math.min(100,l.engage/tot*100) : 0, pr=tot ? Math.min(100-pe,l.reserve/tot*100) : 0;
              var pc=tot ? Math.round((l.engage+l.reserve)/tot*100) : 0, w=add(td,'div','conso-cell');
              var b=add(w,'div','conso'+(l.disponible<0?' conso-depasse':'')); b.setAttribute('role','img');
              b.setAttribute('aria-label','Engagé '+Math.round(pe)+' %, réservé '+Math.round(pr)+' %');
              b.title='Engagé '+xof(l.engage)+' · réservé '+xof(l.reserve)+' · disponible '+xof(l.disponible);
              add(b,'span','conso-e').style.width=pe+'%'; add(b,'span','conso-r').style.width=pr+'%';
              add(w,'span','conso-pc',pc+' %');
            }}
          ] });
      }
    }

    /* Le détail, appel d'offres par appel d'offres */
    function ongletListe(box){
      tableau(box,{ cle:'indicateurs', titre:'Par appel d’offres', lignes:r.procedures,
        vide:'Aucun appel d’offres sur la période.',
        colonnes:[
          {lab:'Appel d’offres', rendu:function(p,td){ add(td,'strong',null,p.ref||p.id); add(td,'div','dt-extrait',p.objet||''); }},
          {lab:'Phase', rendu:function(p,td){ chipCellule(td,p.phase.lab,PHASE_COUL[p.phase.id]||'c-grey'); }},
          {lab:'Offres', num:true, val:function(p){ return p.offres; }},
          {lab:'Estimation', num:true, val:function(p){ return p.estime!=null ? xof(p.estime) : '—'; }},
          {lab:'Attribué', num:true, val:function(p){ return p.attribue!=null ? xof(p.attribue) : '—'; }},
          {lab:'Économie', num:true, rendu:function(p,td){
            if(p.economie==null){ td.textContent='—'; return; }
            add(td,'span',null,xof(p.economie));
            if(p.estime) add(td,'div','muted',(Math.round(p.economie/p.estime*1000)/10).toString().replace('.',',')+' %');
          }},
          {lab:'Cycle', num:true, val:function(p){ return joursLisibles(p.delais.cycle); }}
        ],
        recherche:function(p){ return (p.ref||'')+' '+(p.objet||'')+' '+(p.titulaire||''); }
      });
      add(box,'p','muted','Économie : estimation du dossier (montants estimatifs des lots, à défaut budget de la demande d’achat) moins le montant attribué, en XOF. Un écart négatif signale un dépassement de l’estimation.').style.marginTop='10px';
    }

    afficher();
  }
}
