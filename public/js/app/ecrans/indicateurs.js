/* Marché+ — Indicateurs de pilotage des achats (GET /api/indicateurs) : volumes, délais entre les étapes datées par
   le serveur, économies (estimation du dossier comparée au montant attribué), concurrence et commandes, sur une
   année ou depuis l'origine. Lecture seule.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

UI.indicateursAnnee = UI.indicateursAnnee || '';
var ETAPES_DELAIS = [
  ['preparation','Préparation du dossier','de la création à la publication'],
  ['consultation','Consultation','de la publication à la clôture du dépouillement'],
  ['evaluation','Évaluation et approbation','de la clôture du dépouillement à l’attribution'],
  ['cycle','Cycle de passation','de la publication à l’attribution'],
  ['signature','Signature','de l’attribution à la signature du marché']
];
function joursLisibles(v){ return v==null ? '—' : (Math.round(v*10)/10).toString().replace('.',',')+' j'; }

function vIndicateurs(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Indicateurs');
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
    var kp=add(zone,'div','kpis');
    function tuile(lab, valeur, sous, ic){
      var t=add(kp,'div','kpi card');
      var hd=add(t,'div','kpi-tete'); add(hd,'span','kpi-lab',lab); var pic=add(hd,'span','kpi-ic'); icon(pic,ic);
      add(t,'div','kpi-val',String(valeur));
      if(sous) add(t,'div','kpi-sous',sous);
    }
    tuile('Appels d’offres', v.procedures, v.attribuees+' attribué(s) · '+v.enCours+' en cours · '+v.infructueuses+' infructueux', 'folder');
    tuile('Montant attribué', xof(v.montantAttribue), 'offres retenues, contre-valeur au taux figé', 'chart');
    tuile('Économies', e.procedures ? xof(e.economie) : '—', e.procedures ? (e.taux!=null ? String(e.taux).replace('.',',')+' % de l’estimation, sur '+e.procedures+' attribution(s)' : '') : 'aucune attribution avec estimation', 'check');
    tuile('Offres par consultation', cc.parConsultation ? String(cc.parConsultation.mediane).replace('.',',') : '—',
      cc.consultations ? 'médiane · '+cc.moinsDeTrois+' consultation(s) avec moins de 3 offres' : 'aucune consultation close', 'inbox');
    tuile('Cycle de passation', d.cycle ? joursLisibles(d.cycle.mediane) : '—', d.cycle ? 'médiane, de la publication à l’attribution' : 'aucune attribution datée', 'clock');
    tuile('Commandes émises', co.emises, co.emises ? xof(co.montant)+' engagés · '+co.receptionnees+' réceptionnée(s)' : 'aucune commande', 'camion');

    /* Délais par étape */
    var kd=add(zone,'div','card'); kd.style.marginTop='18px';
    add(kd,'div','panel-head','Délais par étape');
    var bd=add(kd,'div','pad');
    var sc=add(bd,'div'); sc.style.overflowX='auto'; var tb=add(sc,'table','tbl'); tb.style.width='100%';
    var tr=add(add(tb,'thead'),'tr');
    ['Étape','Médiane','Moyenne','Plus court','Plus long','Appels d’offres'].forEach(function(x,i){ var th=add(tr,'th',null,x); if(i) th.className='num'; });
    var tby=add(tb,'tbody');
    ETAPES_DELAIS.forEach(function(x){
      var s=d[x[0]], row=add(tby,'tr');
      var c1=add(row,'td'); add(c1,'strong',null,x[1]); add(c1,'div','muted',x[2]);
      [s&&s.mediane, s&&s.moyenne, s&&s.min, s&&s.max].forEach(function(n){ add(row,'td','num',joursLisibles(n)); });
      add(row,'td','num',s?String(s.nb):'0');
    });
    add(bd,'p','muted','Les dates sont posées par le serveur au passage de chaque étape ; pour les appels d’offres antérieurs, elles sont reprises du journal d’audit.').style.marginTop='10px';

    /* Concurrence */
    var kc=add(zone,'div','card'); kc.style.marginTop='18px';
    add(kc,'div','panel-head','Concurrence');
    grilleLecture(add(kc,'div','pad'),[
      ['Offres reçues', String(cc.offres)], ['Déposées en ligne', String(cc.enLigne)], ['Reçues hors plateforme', String(cc.horsPlateforme)],
      ['Consultations closes', String(cc.consultations)], ['Moins de 3 offres', String(cc.moinsDeTrois)],
      ['Offres par consultation (moyenne)', cc.parConsultation ? String(cc.parConsultation.moyenne).replace('.',',') : '—']
    ]);

    /* Budget : situation des lignes (si l'utilisateur peut la lire) */
    var sit=situationBudget();
    if(sit && sit.length){
      tableau(zone,{ cle:'indicateurs-budget', titre:'Budget et engagement', lignes:sit,
        colonnes:[
          {lab:'Ligne', rendu:function(l,td){ add(td,'strong',null,l.code); add(td,'div','dt-extrait',l.libelle+' ('+l.exercice+')'); }},
          {lab:'Alloué', num:true, val:function(l){ return xof(l.montant); }},
          {lab:'Engagé', num:true, val:function(l){ return xof(l.engage); }},
          {lab:'Réservé', num:true, val:function(l){ return xof(l.reserve); }},
          {lab:'Disponible', num:true, rendu:function(l,td){ add(td,'span',l.disponible<0?'budget-epuise':null,xof(l.disponible)); }},
          {lab:'Consommé', num:true, val:function(l){ return l.montant ? Math.round((l.engage+l.reserve)/l.montant*100)+' %' : '—'; }}
        ] });
    }

    /* Par appel d'offres */
    tableau(zone,{ cle:'indicateurs', titre:'Par appel d’offres', lignes:r.procedures,
      vide:'Aucun appel d’offres sur la période.',
      colonnes:[
        {lab:'Appel d’offres', rendu:function(p,td){ add(td,'strong',null,p.ref||p.id); add(td,'div','dt-extrait',p.objet||''); }},
        {lab:'Phase', rendu:function(p,td){ chipCellule(td,p.phase.lab,'c-grey'); }},
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
    add(zone,'p','muted','Économie : estimation du dossier (montants estimatifs des lots, à défaut budget de la demande d’achat) moins le montant attribué, en XOF. Un écart négatif signale un dépassement de l’estimation.').style.marginTop='10px';
  }
}
