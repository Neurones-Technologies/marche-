/* Marché+ — Écran Conformité et anomalies.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Deux tableaux : le contrôle des pièces par soumissionnaire et les signaux détectés ; le détail s'ouvre dans une
   fenêtre. Écarter ou réintégrer une offre se fait depuis la ligne ou depuis sa fenêtre. */
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

  var sig=anomalies();
  tableau(m,{ cle:'signaux', titre:'Signaux détectés', lignes:sig.map(function(a,i){ return {a:a,i:i}; }),
    vide:'Aucun signal détecté.',
    colonnes:[
      {lab:'Niveau', rendu:function(x,td){ var n=NIVEAUX_SIGNAL[x.a.lvl]||NIVEAUX_SIGNAL.info; chipCellule(td,n[0],n[1]); }},
      {lab:'Signal', rendu:function(x,td){ add(td,'strong',null,x.a.t); }},
      {lab:'Soumissionnaire', val:function(x){ return x.a.who; }}
    ],
    recherche:function(x){ return x.a.t+' '+x.a.who+' '+x.a.d; },
    filtres:[{ lab:'Niveau', options:[['red','Critique'],['amber','À examiner'],['info','Information']], test:function(x,v){ return x.a.lvl===v; } }],
    actions:function(x,td){ boutonDetail(td,function(){ ouvrirSignal(x.i); },'sig-'+x.i); }
  });

  var n=add(m,'div','note');
  add(n,'strong',null,'Sur les offres étrangères. ');
  n.appendChild(document.createTextNode("Les signaux violets ne sont pas des reproches : ils rappellent qu'une offre hors zone se compare sur une base fiscale et douanière différente. Écarter un soumissionnaire étranger pour une pièce qu'on n'a jamais exigée dans le dossier d'appel d'offres est le meilleur moyen de perdre un recours."));
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
  ouvrirFenetre(function(){ var o=offreParId(id); return o ? 'Pièces — '+o.name : 'Pièces'; }, function(c,p){
    var o=offreParId(id); if(!o) return false;
    var ch=add(c,'div','fen-chips'); originChip(ch,o);
    chipCellule(ch, excluded(o)?'Écartée':'Retenue', excluded(o)?'c-red':'c-green');
    var manq=missingDocs(o).map(function(d){ return d.label; });
    var ul=add(c,'ul','fen-liste');
    requiredDocs(o).forEach(function(d){
      var li=add(ul,'li'); add(li,'span',null,d.label);
      var ko=manq.indexOf(d.label)>=0; chipCellule(li, ko?'Manquante':'Fournie', ko?'c-red':'c-green');
    });
    add(p,'span','muted','Décision réversible, consignée à la piste d’audit.');
    boutonEcarter(p,o,false);
  });
}

function ouvrirSignal(i){
  ouvrirFenetre(function(){ var a=anomalies()[i]; return a ? a.t : 'Signal'; }, function(c){
    var a=anomalies()[i]; if(!a) return false;
    var n=NIVEAUX_SIGNAL[a.lvl]||NIVEAUX_SIGNAL.info;
    var ch=add(c,'div','fen-chips'); chipCellule(ch,n[0],n[1]); chipCellule(ch,a.who,'c-grey');
    champLecture(c,'Détail',a.d);
  });
}
