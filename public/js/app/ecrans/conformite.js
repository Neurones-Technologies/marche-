/* Marché+ — Écran Conformité et anomalies.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Un tableau par soumissionnaire ; sa fenêtre de détail montre les pièces exigées et les signaux détectés sur son
   offre. Écarter ou réintégrer une offre se fait depuis la ligne ou depuis sa fenêtre. */
"use strict";

var NIVEAUX_SIGNAL = { red:['Critique','c-red'], amber:['À examiner','c-amber'], info:['Information','c-violet'] };

function vConformite(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Conformité & anomalies');

  tableau(m,{ cle:'conformite', titre:'Contrôle des pièces par soumissionnaire', lignes:SEED_OFFERS,
    colonnes:[
      {lab:'Soumissionnaire', rendu:function(o,td){ add(td,'strong',null,o.name); }},
      {lab:'Origine', rendu:function(o,td){ originChip(td,o); }},
      {lab:'Pièces exigées', num:true, val:function(o){ return requiredDocs(o).length; }},
      {lab:'Manquantes', rendu:function(o,td){ var n=missingDocs(o).length; chipCellule(td, n ? n+' manquante'+(n>1?'s':'') : 'Aucune', n?'c-red':'c-green'); }},
      {lab:'Signaux', rendu:function(o,td){ signauxCellule(td,o); }},
      {lab:'Décision', rendu:function(o,td){ chipCellule(td, excluded(o)?'Écartée':'Retenue', excluded(o)?'c-red':'c-green'); }}
    ],
    recherche:function(o){ return o.name+' '+o.pays+' '+missingDocs(o).map(function(d){ return d.label; }).join(' '); },
    filtres:[
      { lab:'Pièces', options:[['manque','Pièces manquantes'],['complet','Dossier complet']], test:function(o,v){ return (missingDocs(o).length>0) === (v==='manque'); } },
      { lab:'Décision', options:[['retenue','Retenue'],['ecartee','Écartée']], test:function(o,v){ return excluded(o) === (v==='ecartee'); } }
    ],
    actions:function(o,td){
      boutonDetail(td,function(){ ouvrirConformite(o.id); },'conf-voir-'+o.id);
      boutonEcarter(td,o,true);
    }
  });

  var n=add(m,'div','note');
  add(n,'strong',null,'Sur les offres étrangères. ');
  n.appendChild(document.createTextNode("Les signaux violets ne sont pas des reproches : ils rappellent qu'une offre hors zone se compare sur une base fiscale et douanière différente. Écarter un soumissionnaire étranger pour une pièce qu'on n'a jamais exigée dans le dossier d'appel d'offres est le meilleur moyen de perdre un recours."));
}

/* Signaux détectés sur l'offre d'un soumissionnaire. */
function signauxDe(o){ return anomalies().filter(function(a){ return a.who===o.name; }); }
/* Résumé des signaux dans une cellule : le niveau le plus grave et le nombre. */
function signauxCellule(td, o){
  var s=signauxDe(o);
  if(!s.length){ add(td,'span','muted','—'); return; }
  var lvl = s.some(function(a){ return a.lvl==='red'; }) ? 'red' : (s.some(function(a){ return a.lvl==='amber'; }) ? 'amber' : 'info');
  chipCellule(td, s.length+' signal'+(s.length>1?'s':''), NIVEAUX_SIGNAL[lvl][1]);
}

/* Bouton Écarter / Réintégrer, avec confirmation et notification. */
function boutonEcarter(parent, o, petit){
  var ex=excluded(o);
  var btn=add(parent,'button','btn '+(petit?'btn-sm ':'')+(ex?'btn-ghost':'btn-danger'), ex?'Réintégrer':'Écarter');
  fk(btn,(petit?'excl-':'excl-fen-')+o.id); guard('conformite.decide',btn);
  btn.addEventListener('click',function(){
    var mis=missingDocs(o);
    var q = ex ? ('L’offre sera de nouveau notée et classée.'+(mis.length?' Elle présente encore '+mis.length+' pièce(s) manquante(s) : la réintégration devra être motivée au procès-verbal.':''))
               : ('L’offre ne sera plus notée ni classée. La décision reste réversible et sera consignée à la piste d’audit.');
    ask(q, function(){
      cibler('PUT','/conformite/'+enc(o.id),{exclue:!ex}).then(function(r){
        if(!r) return;
        logit((ex?'Réintégration':'Exclusion administrative')+' — '+o.name);
        notify('offre.ecartee', (ex?'Offre réintégrée — ':'Offre écartée — ')+o.name,
          ex ? ("L'offre de "+o.name+" est réintégrée à l'évaluation de la procédure "+REF()+".")
             : ("L'offre de "+o.name+" est écartée pour non-conformité administrative. Motif : "+(mis.length?mis.map(function(x){return x.label;}).join(' ; '):'décision du comité')+"."));
        save(); render();
      });
    }, (ex?'Réintégrer « ':'Écarter « ')+o.name+' » ?', ex?'Réintégrer':'Écarter');
  });
  return btn;
}

function ouvrirConformite(id){
  ouvrirFenetre(function(){ var o=offreParId(id); return o ? o.name : 'Soumissionnaire'; }, function(c,p){
    var o=offreParId(id); if(!o) return false;
    var ch=add(c,'div','fen-chips'); originChip(ch,o);
    chipCellule(ch, excluded(o)?'Écartée':'Retenue', excluded(o)?'c-red':'c-green');
    var manq=missingDocs(o).map(function(d){ return d.label; });
    add(c,'h3','fen-sous-titre','Pièces exigées');
    var ul=add(c,'ul','fen-liste');
    requiredDocs(o).forEach(function(d){
      var li=add(ul,'li'); add(li,'span',null,d.label);
      var ko=manq.indexOf(d.label)>=0; chipCellule(li, ko?'Manquante':'Fournie', ko?'c-red':'c-green');
    });
    var sec=add(c,'div','fen-section'); add(sec,'h3',null,'Signaux détectés');
    var sig=signauxDe(o);
    if(!sig.length) add(sec,'p','muted','Aucun signal sur cette offre.');
    sig.forEach(function(a){
      var n=NIVEAUX_SIGNAL[a.lvl]||NIVEAUX_SIGNAL.info;
      var row=add(sec,'div','fen-signal');
      var t=add(row,'div','fen-signal-t'); chipCellule(t,n[0],n[1]); add(t,'strong',null,a.t);
      add(row,'div','muted',a.d);
    });
    add(p,'span','muted','Décision réversible, consignée à la piste d’audit.');
    boutonEcarter(p,o,false);
  });
}
