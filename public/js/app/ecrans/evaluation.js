/* Marché+ — Écran Évaluation.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Le classement en tableau (une colonne par critère) ; la notation d'une offre se fait dans une fenêtre. */
"use strict";

/* Écarts avec le score proposé par l'IA qui attendent encore leur justification, pour une offre. */
function ecartsNonJustifies(o){
  return state.criteria.filter(function(cr){
    return cr.kind==='qual' && Math.abs(curScore(o,cr.id)-aiScore(o,cr.id))>0.01 && !state.justif[o.id+'_'+cr.id];
  }).length;
}

/* Notation bloquée tant que l'évaluateur n'a pas déclaré l'absence de conflit d'intérêts (voir coiBanner). */
function coiRequise(){ var d=coiDe(state.me); return !(d && d.declare && !d.conflit); }

function vEvaluation(m){
  if (!state.depClosed) return locked(m,"L'évaluation s'ouvre une fois le dépouillement clôturé.",'depouille','Aller au dépouillement');
  var c=state.cdc;
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Notation des offres conformes');
  var rs=add(h,'button','btn btn-ghost btn-sm','Rétablir les scores IA');
  rs.addEventListener('click',function(){
    var quality={};
    SEED_OFFERS.forEach(function(o){
      var q={metho:o.aiMetho,refs:o.aiRefs};
      state.criteria.forEach(function(x){ if(x.kind==='qual'&&q[x.id]==null) q[x.id]=70; });
      quality[o.id]=q;
    });
    ecrireBloc({quality:quality, justif:{}}).then(function(r){
      if(!r) return;
      state.quality=quality; state.justif={}; logit('Scores IA rétablis'); render();
    });
  });

  var banner=add(m,'div', c.prefActive?'warn':'note'); banner.style.marginTop='0';
  banner.style.marginBottom='18px';
  if(c.prefActive){
    add(banner,'strong',null,'Préférence communautaire active — '+c.prefTaux+' %. ');
    banner.appendChild(document.createTextNode("Les offres hors UEMOA sont majorées de "+c.prefTaux+" % pour la seule comparaison des prix. Le montant contractuel reste le montant d'offre. La marge est figée depuis la clôture du dépouillement."));
  } else {
    add(banner,'strong',null,'Préférence communautaire désactivée. ');
    banner.appendChild(document.createTextNode("Les offres sont comparées à leur contre-valeur en francs CFA, sans correction d'origine."));
  }

  if(can('eval.score')) coiBanner(m);

  var colonnes=[
    {lab:'Rang', rendu:function(r,td){ add(td,'span','rank'+(r.idx===0?' lead':''),String(r.idx+1)); }},
    {lab:'Soumissionnaire', rendu:function(r,td){ add(td,'strong',null,r.o.name); var d=add(td,'div'); d.style.marginTop='4px'; originChip(d,r.o); }}
  ];
  state.criteria.forEach(function(cr){
    colonnes.push({ lab:cr.label+' ('+cr.weight+' %)', num:true, court:true, rendu:function(r,td){
      var v = cr.kind==='auto' ? (r.notes[cr.id]||0) : curScore(r.o,cr.id);
      td.appendChild(document.createTextNode(cr.kind==='auto' ? v.toFixed(1) : v.toFixed(0)));
      if(cr.kind==='qual') add(td,'span','ai','IA');
    }});
  });
  colonnes.push({ lab:'Total', num:true, rendu:function(r,td){ add(td,'strong','total-v',r.total.toFixed(1)); var n=ecartsNonJustifies(r.o); if(n){ var d=add(td,'div'); chipCellule(d,n+' écart à justifier','c-red'); } }});

  tableau(m,{ cle:'evaluation', titre:'Classement', lignes:ranking().map(function(r,idx){ r.idx=idx; return r; }),
    colonnes:colonnes,
    recherche:function(r){ return r.o.name+' '+r.o.pays; },
    filtres:[{ lab:'Origine', options:[['uemoa','UEMOA'],['hors','Hors UEMOA']], test:function(r,v){ return v==='uemoa' ? isUemoa(r.o) : !isUemoa(r.o); } }],
    actions:function(r,td){ boutonDetail(td,function(){ ouvrirNotation(r.o.id); },'eval-ouvrir-'+r.o.id, can('eval.score') && !state.evalDone ? 'Noter' : null); }
  });

  var ecartees=SEED_OFFERS.filter(excluded);
  if(ecartees.length) tableau(m,{ cle:'eval-ecartees', titre:'Offres écartées de l’évaluation', lignes:ecartees,
    colonnes:[
      {lab:'Soumissionnaire', rendu:function(o,td){ add(td,'strong',null,o.name); }},
      {lab:'Origine', rendu:function(o,td){ originChip(td,o); }},
      {lab:'Motif', rendu:function(o,td){ var mis=missingDocs(o); add(td,'div','dt-extrait', mis.length ? mis.map(function(d){return d.label;}).join(' ; ') : 'Décision manuelle'); }}
    ],
    actions:function(o,td){ boutonCellule(td,'Conformité',function(){ go('conformite'); },'eval-conf-'+o.id).setAttribute('data-consult',''); }
  });

  var miss=missingJustifs(), wt=weightTotal();
  var foot=add(m,'div','card'); foot.style.marginTop='18px';
  var fp=add(foot,'div','panel-foot'); fp.style.borderTop='none';
  var msg=add(fp,'span',null, miss.length? miss.length+' justification(s) manquante(s) : '+miss.join(', ') : 'Toutes les modifications sont justifiées.');
  msg.style.cssText='font-size:12.5px;color:'+(miss.length?'var(--red)':'var(--muted)');
  var v=add(fp,'button','btn btn-dark btn-sm', state.evalDone?'Évaluation validée ✓':'Valider l’évaluation');
  v.disabled=miss.length>0||state.evalDone||wt!==100; guard('eval.validate',v);
  fk(v,'valid-eval');
  v.addEventListener('click',function(){
    ask('Le classement sera transmis au circuit d’approbation et les notes ne pourront plus être modifiées.', function(){
      state.evalDone=true; logit('Évaluation validée — classement transmis au circuit d’approbation');
      var rr=ranking();
      notify('eval.validee','Évaluation validée',
        "Le classement de la procédure "+REF()+" est arrêté. Premier : "+(rr[0]?rr[0].o.name+" ("+rr[0].total.toFixed(1)+"/100)":"—")+".");
      notify('appro.attendue','Approbation attendue',
        "Le circuit d'approbation de la procédure "+REF()+" est ouvert. Premier niveau attendu : "+(state.approvals[0]?state.approvals[0].role:'—')+".");
      save(); go('decision');
    }, 'Valider l’évaluation ?', 'Valider');
  });
  if(wt!==100){
    var w=add(m,'div','warn'); w.style.marginTop='14px';
    w.appendChild(document.createTextNode('Le total des pondérations est de '+wt+' % : ajustez la grille de critères avant de valider.'));
  }
}

/* Fenêtre de notation d'une offre : critères, ajustement des scores proposés par l'IA, justification des écarts. */
function ouvrirNotation(id){
  ouvrirFenetre(function(){ var o=offreParId(id); return o ? 'Notation — '+o.name : 'Notation'; }, function(card){
    var rows=ranking(), r=null, idx=0;
    rows.forEach(function(x,i){ if(x.o.id===id){ r=x; idx=i; } });
    if(!r) return false;
    var o=r.o;
    var coiBloque = can('eval.score') && coiRequise();

    var top=add(card,'div','fen-chips');
    add(top,'span','rank'+(idx===0?' lead':''),'Rang '+(idx+1));
    originChip(top,o);
    var evo=(state.evaluationsOffres||{})[o.id];
    if(evo){ var ce=add(top,'span','chip '+(evo.alerte?'c-red':'c-grey'),'Exécution passée : '+evo.moyenne+'/100 sur '+evo.nb+' commande(s)');
      ce.title='Note du partenaire sur ses commandes réceptionnées ; information pour l’évaluateur, sans effet sur le classement.'; }
    var corr = montantCorrige(o);
    grilleLecture(card,[
      ['Montant de l’offre', sep(o.montant)+' '+o.devise], ['Délai', o.delai+' jours'],
      ['Contre-valeur', xof(montantXOF(o))], ['Prix comparé', Math.abs(corr-montantXOF(o))>1 ? xof(corr) : null]
    ]);
    if(coiBloque){ var wc=add(card,'div','warn'); wc.style.margin='0 0 12px'; wc.textContent='Déclaration de conflit d’intérêts requise avant toute notation : faites-la depuis l’écran d’évaluation.'; }

    state.criteria.forEach(function(cr){
      var crit=add(card,'div','crit');
      var k=add(crit,'span','crit-k');
      k.appendChild(document.createTextNode(cr.label+' ('+cr.weight+' %)'));
      if(cr.kind==='qual') add(k,'span','ai','IA');
      if(cr.kind==='auto'){
        add(crit,'span',null,(r.notes[cr.id]||0).toFixed(1)).style.fontWeight='600';
      } else {
        var cur=curScore(o,cr.id);
        var st=add(crit,'span','stepper');
        var verrou = coiBloque || state.evalDone;
        var mi=add(st,'button','step-btn','−'); mi.setAttribute('aria-label','Diminuer '+cr.label+' pour '+o.name);
        fk(mi,'dec-'+o.id+'-'+cr.id); guard('eval.score',mi);
        if(verrou){ mi.disabled=true; }
        mi.addEventListener('click',function(){
          var v=Math.max(0,cur-5);
          cibler('PUT','/scores/'+enc(o.id)+'/'+enc(cr.id),{note:v}).then(function(r){ if(r) logit('Score « '+cr.label+' » ajusté à '+v+' — '+o.name); });
        });
        add(st,'span','step-v', cur.toFixed(0)+'/100');
        var pl=add(st,'button','step-btn','+'); pl.setAttribute('aria-label','Augmenter '+cr.label+' pour '+o.name);
        fk(pl,'inc-'+o.id+'-'+cr.id); guard('eval.score',pl);
        if(verrou){ pl.disabled=true; }
        pl.addEventListener('click',function(){
          var v=Math.min(100,cur+5);
          cibler('PUT','/scores/'+enc(o.id)+'/'+enc(cr.id),{note:v}).then(function(r){ if(r) logit('Score « '+cr.label+' » ajusté à '+v+' — '+o.name); });
        });
      }
      if(cr.kind==='qual'){
        var ai=aiScore(o,cr.id), cur2=curScore(o,cr.id);
        if(Math.abs(cur2-ai)>0.01){
          var jk=o.id+'_'+cr.id;
          var wb=add(card,'div'); wb.style.cssText='background:var(--amber-bg);border-radius:8px;padding:9px 10px;margin:2px 0 6px';
          add(wb,'div',null,'Écart avec le score IA ('+ai+') — justification obligatoire')
            .style.cssText='font-size:11.5px;color:var(--amber);font-weight:700;margin-bottom:6px';
          var ta=add(wb,'textarea'); ta.rows=2; ta.style.width='100%'; ta.placeholder='Motif de la modification…';
          ta.value=state.justif[jk]||'';
          ta.setAttribute('aria-label','Justification — '+o.name+' / '+cr.label);
          fk(ta,'just-'+o.id+'-'+cr.id);
          ta.addEventListener('change',function(){
            var motif=ta.value.trim();
            cibler('PUT','/scores/'+enc(o.id)+'/'+enc(cr.id),{justification:motif}).then(function(r){
              if(!r || !motif) return;
              logit('Justification saisie — '+o.name+' / '+cr.label);
              notify('ecart.ia','Écart motivé avec un score proposé par l’IA',
                o.name+" — "+cr.label+" : score proposé "+ai+", score retenu "+cur2+". Motif : "+motif);
              save(); render();
            });
          });
        }
      }
    });
    var tot=add(card,'div','total');
    add(tot,'span',null,'Total pondéré').style.cssText='font-size:12px;font-weight:700;color:var(--muted)';
    add(tot,'span','total-v', r.total.toFixed(1));
    add(card,'div','muted','IA : '+o.aiWhy).style.cssText+=';margin-top:10px;padding-top:10px;border-top:1px solid var(--line-2)';
  });
}
