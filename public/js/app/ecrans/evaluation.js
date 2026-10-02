/* Marché+ — Écran Évaluation.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

function vEvaluation(m){
  if (!state.depClosed) return locked(m,"L'évaluation s'ouvre une fois le dépouillement clôturé.",'depouille','Aller au dépouillement');
  var c=state.cdc;
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'div','eyebrow','Évaluation comparative');
  add(l,'h1',null,'Notation des offres conformes');
  add(l,'p','lede',"Montants convertis en francs CFA, puis corrigés de la marge de préférence communautaire lorsqu'elle est active. Toute modification d'un score proposé par l'IA exige une justification écrite, horodatée et attribuée.");
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

  var coiBloque = can('eval.score') ? coiBanner(m) : false;
  var g=add(m,'div','grid4');
  ranking().forEach(function(r,idx){
    var o=r.o;
    var card=add(g,'div','card sup'+(idx===0?' lead':''));
    var top=add(card,'div'); top.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:9px';
    add(top,'span','rank'+(idx===0?' lead':''),'Rang '+(idx+1));
    originChip(top,o);
    add(card,'div',null,o.name).style.cssText='font-size:15px;font-weight:700';
    add(card,'div','muted', sep(o.montant)+' '+o.devise+' · '+o.delai+' j');
    var corr = montantCorrige(o);
    var mline = add(card,'div','muted', 'Contre-valeur : '+xof(montantXOF(o)) + (Math.abs(corr-montantXOF(o))>1 ? ' → comparé à '+xof(corr) : ''));
    mline.style.cssText+=';margin-bottom:4px';
    if (Math.abs(corr-montantXOF(o))>1) mline.style.color='var(--violet)';

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
        var mi=add(st,'button','step-btn','−'); mi.setAttribute('aria-label','Diminuer '+cr.label+' pour '+o.name);
        fk(mi,'dec-'+o.id+'-'+cr.id); guard('eval.score',mi);
        if(coiBloque){ mi.disabled=true; mi.setAttribute('title','Déclaration de conflit d\u2019intérêts requise avant toute notation.'); }
        mi.addEventListener('click',function(){
          var v=Math.max(0,cur-5);
          cibler('PUT','/scores/'+enc(o.id)+'/'+enc(cr.id),{note:v}).then(function(r){ if(r) logit('Score « '+cr.label+' » ajusté à '+v+' — '+o.name); });
        });
        add(st,'span','step-v', cur.toFixed(0)+'/100');
        var pl=add(st,'button','step-btn','+'); pl.setAttribute('aria-label','Augmenter '+cr.label+' pour '+o.name);
        fk(pl,'inc-'+o.id+'-'+cr.id); guard('eval.score',pl);
        if(coiBloque){ pl.disabled=true; pl.setAttribute('title','Déclaration de conflit d\u2019intérêts requise avant toute notation.'); }
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
              notify('ecart.ia','Écart motivé avec un score proposé par l\u2019IA',
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

  SEED_OFFERS.filter(excluded).forEach(function(o){
    var c2=add(m,'div','card pad'); c2.style.cssText+=';margin-top:14px;border-color:var(--red-line)';
    var tt=add(c2,'div'); tt.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    add(tt,'strong',null,o.name+' — écartée de l\u2019évaluation'); originChip(tt,o);
    var mis=missingDocs(o);
    add(c2,'div','muted', mis.length? 'Motif : '+mis.map(function(d){return d.label;}).join(' ; ')+'. Décision réversible depuis l\u2019écran Conformité.' : 'Écartée par décision manuelle. Réversible depuis l\u2019écran Conformité.');
  });

  var miss=missingJustifs(), wt=weightTotal();
  var foot=add(m,'div','card'); foot.style.marginTop='18px';
  var fp=add(foot,'div','panel-foot'); fp.style.borderTop='none';
  var msg=add(fp,'span',null, miss.length? miss.length+' justification(s) manquante(s) : '+miss.join(', ') : 'Toutes les modifications sont justifiées.');
  msg.style.cssText='font-size:12.5px;color:'+(miss.length?'var(--red)':'var(--muted)');
  var v=add(fp,'button','btn btn-dark btn-sm', state.evalDone?'Évaluation validée ✓':'Valider l\u2019évaluation');
  v.disabled=miss.length>0||state.evalDone||wt!==100; guard('eval.validate',v);
  fk(v,'valid-eval');
  v.addEventListener('click',function(){
    ask('Le classement sera transmis au circuit d\u2019approbation et les notes ne pourront plus être modifiées.', function(){
      state.evalDone=true; logit('Évaluation validée — classement transmis au circuit d\u2019approbation');
      var rr=ranking();
      notify('eval.validee','Évaluation validée',
        "Le classement de la procédure "+REF()+" est arrêté. Premier : "+(rr[0]?rr[0].o.name+" ("+rr[0].total.toFixed(1)+"/100)":"—")+".");
      notify('appro.attendue','Approbation attendue',
        "Le circuit d'approbation de la procédure "+REF()+" est ouvert. Premier niveau attendu : "+(state.approvals[0]?state.approvals[0].role:'—')+".");
      save(); go('decision');
    }, 'Valider l\u2019évaluation ?', 'Valider');
  });
  if(wt!==100){
    var w=add(m,'div','warn'); w.style.marginTop='14px';
    w.appendChild(document.createTextNode('Le total des pondérations est de '+wt+' % : ajustez la grille de critères avant de valider.'));
  }
}
