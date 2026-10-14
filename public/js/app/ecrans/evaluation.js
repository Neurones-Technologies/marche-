/* Marché+ — Écran Évaluation.
   Chaque offre conforme est assignée à des évaluateurs techniques (leur nombre minimal est un réglage de l'organisation)
   et à un évaluateur financier : l'évaluation ne s'ouvre qu'une fois cela fait. Chacun note, dans une fenêtre, les critères
   de son domaine pour les offres qui lui sont assignées ; la note retenue d'un critère est la moyenne de leurs notes.
   Trois vues : l'assignation et le classement complet (acheteur, évaluateur financier, comité, audit), et pour un
   évaluateur technique seul, la liste de ses offres sans classement ni montants.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

/* Écarts avec le score proposé par l'IA qui attendent encore leur justification, pour une offre. */
function ecartsNonJustifies(o){
  return state.criteria.filter(function(cr){
    return cr.kind==='qual' && Math.abs(curScore(o,cr.id)-aiScore(o,cr.id))>0.01 && !state.justif[o.id+'_'+cr.id];
  }).length;
}

/* Origine de la note proposée pour les critères qualitatifs : analyse réelle du mémoire technique par l'IA, note
   provisoire d'une offre déposée en ligne pas encore analysée, ou note simulée (offres de démonstration). */
function origineNoteIA(o){
  if(o.aiIA) return { lab:'IA', cls:'ai', titre:'Note proposée par l’IA après lecture de l’offre technique ('+o.aiIA.le+')' };
  if(o.submitted || o.externe) return { lab:'Provisoire', cls:'ai ai-sim', titre:'Offre pas encore analysée : note provisoire de 70, à arrêter par l’évaluateur' };
  return { lab:'Simulé', cls:'ai ai-sim', titre:'Note simulée (offre de démonstration) : aucune analyse réelle' };
}
function badgeNoteIA(parent,o){ var x=origineNoteIA(o), b=add(parent,'span',x.cls,x.lab); b.title=x.titre; return b; }

/* Notation bloquée tant que l'évaluateur n'a pas déclaré l'absence de conflit d'intérêts (voir coiBanner). */
function coiRequise(){ var d=coiDe(state.me); return !(d && d.declare && !d.conflit); }

/* ---- Évaluateurs : qui note quoi ---- */
function notesDe(o,cr){ return ((state.notesEval||{})[o.id]||{})[cr.id]||{}; }
/* Ma note d'un critère pour une offre ; null tant que je ne l'ai pas saisie. */
function maNote(o,cr){ var n=notesDe(o,cr)[state.me]; return n!=null ? Number(n) : null; }
function suisAssigne(o,domaine){ return R.assignes(RCTX(),o,domaine).indexOf(state.me)>=0; }
/* Puis-je noter ce critère pour cette offre : habilité pour le domaine et assigné à l'offre ? */
function peutNoter(o,cr){
  var d=R.domaineDe(cr);
  return cr.kind==='qual' && can('eval.score') && can(d==='financier' ? 'eval.financier' : 'eval.technique') && suisAssigne(o,d);
}
/* [notes saisies, évaluateurs assignés] d'un critère noté. */
function avancement(o,cr){
  var ass=R.assignes(RCTX(),o,R.domaineDe(cr)), n=notesDe(o,cr);
  return [ass.filter(function(u){ return n[u]!=null; }).length, ass.length];
}
/* Offres conformes et critères notés à saisir par moi : [saisies, attendues]. */
function monAvancement(o){
  var fait=0, tot=0;
  state.criteria.forEach(function(cr){ if(peutNoter(o,cr)){ tot++; if(maNote(o,cr)!=null) fait++; } });
  return [fait,tot];
}
function aNoteOffre(offreId,uid){
  var n=(state.notesEval||{})[offreId]||{};
  return Object.keys(n).some(function(c){ return n[c] && n[c][uid]!=null; });
}

function vEvaluation(m){
  if (!state.depClosed) return locked(m,"L'évaluation s'ouvre une fois le dépouillement clôturé.",'depouille','Aller au dépouillement');
  var c=state.cdc, restreint=evaluateurRestreint();
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null, restreint ? 'Mes offres à noter' : 'Notation des offres conformes');
  var ia=etatIA();
  if(ia.actif===null){ ia.actif=false; MP.api('GET',MP.url('/ia')).then(function(r){ ia.actif=!!r.actif; render(); }).catch(function(){}); }

  // L'évaluation ne s'ouvre qu'une fois chaque offre conforme assignée à ses évaluateurs (technique et financier).
  var manque = restreint ? ((state.evalGate && state.evalGate.prete===false) ? ['à assigner'] : []) : R.assignationManquante(RCTX());
  if(manque.length && !state.evalDone){
    if(!can('eval.assign')){
      var cd=add(m,'div','card empty');
      add(cd,'div',null,"L'évaluation s'ouvre une fois que chaque offre conforme a ses évaluateurs, technique et financier. Le responsable des achats doit encore les assigner.");
      return;
    }
    var w=add(m,'div','warn'); w.style.marginTop='0'; w.style.marginBottom='18px';
    add(w,'strong',null,'Évaluation fermée. ');
    w.appendChild(document.createTextNode('Assignez à chaque offre conforme les évaluateurs techniques ('+R.minEvaluateurs(RCTX())+' au moins) et un évaluateur financier : '+manque.join(' ; ')+'.'));
    panneauAssignation(m);
    return;
  }
  if(restreint) return vMesOffres(m);

  var banner=add(preferencePossible() ? m : el('div'), 'div', c.prefActive?'warn':'note'); banner.style.marginTop='0'; // sans préférence possible : rien à dire
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
      if(cr.kind==='qual'){
        if(R.domaineDe(cr)==='technique') badgeNoteIA(td,r.o);
        var av=avancement(r.o,cr);
        if(av[1]){ var d=add(td,'div','dt-extrait', av[0]+'/'+av[1]+' note'+(av[1]>1?'s':'')); if(av[0]<av[1]) d.style.color='var(--amber)'; }
      }
    }});
  });
  colonnes.push({ lab:'Total', num:true, rendu:function(r,td){ add(td,'strong','total-v',r.total.toFixed(1)); var n=ecartsNonJustifies(r.o); if(n){ var d=add(td,'div'); chipCellule(d,n+' écart à justifier','c-red'); } }});

  tableau(m,{ cle:'evaluation', titre:'Classement', lignes:ranking().map(function(r,idx){ r.idx=idx; return r; }),
    colonnes:colonnes,
    recherche:function(r){ return r.o.name+' '+r.o.pays; },
    filtres:[{ lab:'Origine', options:[['uemoa','UEMOA'],['hors','Hors UEMOA']], test:function(r,v){ return v==='uemoa' ? isUemoa(r.o) : !isUemoa(r.o); } }],
    actions:function(r,td){ boutonDetail(td,function(){ ouvrirNotation(r.o.id); },'eval-ouvrir-'+r.o.id, monAvancement(r.o)[1] && !state.evalDone ? 'Noter' : null); }
  });

  panneauAssignation(m);

  var ecartees=SEED_OFFERS.filter(excluded);
  if(ecartees.length) tableau(m,{ cle:'eval-ecartees', titre:'Offres écartées de l’évaluation', lignes:ecartees,
    colonnes:[
      {lab:'Soumissionnaire', rendu:function(o,td){ add(td,'strong',null,o.name); }},
      {lab:'Origine', rendu:function(o,td){ originChip(td,o); }},
      {lab:'Motif', rendu:function(o,td){ var mis=missingDocs(o); add(td,'div','dt-extrait', mis.length ? mis.map(function(d){return d.label;}).join(' ; ') : 'Décision manuelle'); }}
    ],
    actions:function(o,td){ boutonCellule(td,'Conformité',function(){ go('conformite'); },'eval-conf-'+o.id).setAttribute('data-consult',''); }
  });

  var miss=missingJustifs(), wt=weightTotal(), reste=R.notationManquante(RCTX());
  var foot=add(m,'div','card'); foot.style.marginTop='18px';
  var fp=add(foot,'div','panel-foot'); fp.style.borderTop='none';
  var texte = reste.length ? reste.length+' note(s) restent à saisir par les évaluateurs assignés.'
    : miss.length ? miss.length+' justification(s) manquante(s) : '+miss.join(', ') : 'Toutes les notes sont saisies et les écarts justifiés.';
  var msg=add(fp,'span',null,texte);
  msg.style.cssText='font-size:12.5px;color:'+((miss.length||reste.length)?'var(--red)':'var(--muted)');
  var v=add(fp,'button','btn btn-dark btn-sm', state.evalDone?'Évaluation validée ✓':'Valider l’évaluation');
  v.disabled=miss.length>0||reste.length>0||state.evalDone||wt!==100; guard('eval.validate',v);
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

/* Vue d'un évaluateur technique seul : les offres qui lui sont assignées, sans montants ni classement. */
function vMesOffres(m){
  if(can('eval.score')) coiBanner(m);
  var lignes=conformes();
  var note=add(m,'div','note'); note.style.marginTop='0'; note.style.marginBottom='18px';
  add(note,'strong',null,'Critères techniques. ');
  note.appendChild(document.createTextNode('Vous ne voyez que les offres qui vous sont assignées et que vos propres notes ; la note technique de chaque offre est la moyenne des notes des évaluateurs assignés.'));
  tableau(m,{ cle:'eval-mes-offres', titre:'Offres qui me sont assignées', lignes:lignes,
    colonnes:[
      {lab:'Soumissionnaire', rendu:function(o,td){ add(td,'strong',null,o.name); var d=add(td,'div'); d.style.marginTop='4px'; originChip(d,o); }},
      {lab:'Ma notation', rendu:function(o,td){ var a=monAvancement(o); chipCellule(td, a[0]+' / '+a[1]+' critère'+(a[1]>1?'s':'')+' noté'+(a[0]>1?'s':''), a[1] && a[0]===a[1] ? 'c-green' : 'c-grey'); }}
    ],
    recherche:function(o){ return o.name; },
    actions:function(o,td){ boutonDetail(td,function(){ ouvrirNotation(o.id); },'eval-ouvrir-'+o.id, !state.evalDone && monAvancement(o)[1] ? 'Noter' : null); }
  });
  if(!lignes.length) add(m,'p','muted','Aucune offre ne vous est assignée pour le moment.');
  if(state.evalDone) add(m,'p','muted','L’évaluation est validée : les notes ne peuvent plus être modifiées.');
}

/* Évaluateurs assignés à une offre, dans une cellule de tableau. */
function listeEvaluateurs(td,o,domaine){
  var ids=R.assignes(RCTX(),o,domaine), min=domaine==='technique' ? R.minEvaluateurs(RCTX()) : 1;
  var exige = domaine==='technique' ? R.critNotes(RCTX(),'technique').length>0 : true;
  if(!ids.length){ chipCellule(td, exige ? 'À assigner' : '—', exige ? 'c-red' : 'c-grey'); return; }
  ids.forEach(function(id){ chipCellule(td, nomCompte(id), 'c-grey'); td.appendChild(document.createTextNode(' ')); });
  if(exige && ids.length<min){ var d=add(td,'div','dt-extrait', ids.length+' sur '+min+' exigés'); d.style.color='var(--amber)'; }
}

/* Assignation des évaluateurs aux offres conformes (acheteur) ; en lecture pour les autres. */
function panneauAssignation(m){
  var pouvoir=can('eval.assign') && !state.evalDone;
  tableau(m,{ cle:'eval-assign', titre:'Évaluateurs assignés aux offres', lignes:conformes(),
    colonnes:[
      {lab:'Soumissionnaire', rendu:function(o,td){ add(td,'strong',null,o.name); }},
      {lab:'Évaluateurs techniques', rendu:function(o,td){ listeEvaluateurs(td,o,'technique'); }},
      {lab:'Évaluateur financier', rendu:function(o,td){ listeEvaluateurs(td,o,'financier'); }}
    ],
    recherche:function(o){ return o.name; },
    actions:function(o,td){ if(pouvoir) boutonCellule(td,'Assigner',function(){ ouvrirAssignation(o.id); },'eval-assigner-'+o.id); }
  });
}

/* Fenêtre d'assignation d'une offre : chaque case cochée ou décochée est enregistrée aussitôt. Un évaluateur qui a déjà
   noté l'offre ne peut plus être retiré (sa note compte dans la moyenne). */
function ouvrirAssignation(id){
  ouvrirFenetre(function(){ var o=offreParId(id); return o ? 'Évaluateurs — '+o.name : 'Évaluateurs'; }, function(card){
    var o=offreParId(id); if(!o) return false;
    var a=(state.assignations||{})[id]||{tech:[],fin:[]};
    var verrou=!can('eval.assign') || state.evalDone;
    function poser(champ, liste){
      var corps={}; corps[champ]=liste;
      return cibler('PUT','/assignations/'+enc(id),corps).then(function(r){ if(r){ logit('Évaluateurs '+(champ==='tech'?'techniques':'financiers')+' de « '+o.name+' » modifiés'); return relireEtat(); } });
    }
    [['tech','Évaluateurs techniques','eval.technique'],['fin','Évaluateur financier','eval.financier']].forEach(function(g){
      var z=add(card,'div','fen-section'); z.style.borderTop='none'; z.style.marginTop='4px';
      add(z,'h3',null,g[1]);
      if(g[0]==='tech') add(z,'p','muted','Au moins '+R.minEvaluateurs(RCTX())+' évaluateur'+(R.minEvaluateurs(RCTX())>1?'s':'')+' technique'+(R.minEvaluateurs(RCTX())>1?'s':'')+' (réglage « Critères d’évaluation ») ; la note technique est la moyenne de leurs notes.');
      var candidats=state.users.filter(function(u){ return ((state.roles[u.role]||{}).perms||{})[g[2]]; });
      if(!candidats.length){ add(z,'p','muted','Aucun compte n’a l’habilitation « '+(g[0]==='tech'?'noter les critères techniques':'noter les critères financiers')+' » : accordez-la à un rôle depuis l’écran Rôles.'); return; }
      candidats.forEach(function(u){
        var lab=add(z,'label','case-param'); lab.style.display='flex';
        var cb=add(lab,'input'); cb.type='checkbox'; cb.checked=a[g[0]].indexOf(u.id)>=0; fk(cb,'assign-'+g[0]+'-'+id+'-'+u.id);
        add(lab,'span',null,u.nom+' — '+roleLab(u.role));
        var verrouNote=cb.checked && aNoteOffre(id,u.id);
        if(verrou || verrouNote){ cb.disabled=true; if(verrouNote) lab.title='A déjà noté cette offre : ne peut plus être retiré.'; }
        cb.addEventListener('change',function(){
          var liste=a[g[0]].filter(function(x){ return x!==u.id; });
          if(cb.checked) liste.push(u.id);
          poser(g[0],liste);
        });
      });
    });
    if(!verrou){
      var tous=add(card,'div','echange-actions'); tous.style.marginTop='16px';
      var bt=add(tous,'button','btn btn-ghost btn-sm','Appliquer ces évaluateurs à toutes les offres conformes'); fk(bt,'assign-toutes-'+id);
      bt.addEventListener('click',function(){
        ask('Les évaluateurs de chaque autre offre conforme seront remplacés par ceux de cette offre (sauf ceux qui ont déjà noté).', function(){
          var cur=(state.assignations||{})[id]||{tech:[],fin:[]};
          conformes().filter(function(x){ return x.id!==id; }).reduce(function(p,x){
            return p.then(function(){
              var av=(state.assignations||{})[x.id]||{tech:[],fin:[]};
              // on garde ceux qui ont déjà noté l'offre
              var garde=function(l,champ){ return l.filter(function(u){ return aNoteOffre(x.id,u); }); };
              var tech=cur.tech.concat(garde(av.tech).filter(function(u){ return cur.tech.indexOf(u)<0; }));
              var fin=cur.fin.concat(garde(av.fin).filter(function(u){ return cur.fin.indexOf(u)<0; }));
              return cibler('PUT','/assignations/'+enc(x.id),{tech:tech,fin:fin});
            });
          }, Promise.resolve()).then(function(){ logit('Évaluateurs de « '+offreParId(id).name+' » appliqués à toutes les offres conformes'); return relireEtat(); });
        }, 'Appliquer à toutes les offres ?', 'Appliquer');
      });
    }
  });
}

/* Fenêtre de notation d'une offre : chaque évaluateur note les critères de son domaine ; l'acheteur et le comité
   voient la note de chacun et la moyenne retenue. Les critères calculés (prix, délai) sont montrés à qui voit le classement. */
function ouvrirNotation(id){
  ouvrirFenetre(function(){ var o=offreParId(id); return o ? 'Notation — '+o.name : 'Notation'; }, function(card){
    var restreint=evaluateurRestreint(), r=null, idx=0, o;
    if(restreint){ o=offreParId(id); if(!o) return false; }
    else {
      ranking().forEach(function(x,i){ if(x.o.id===id){ r=x; idx=i; } });
      if(!r) return false;
      o=r.o;
    }
    var coiBloque = can('eval.score') && coiRequise();

    var top=add(card,'div','fen-chips');
    if(r) add(top,'span','rank'+(idx===0?' lead':''),'Rang '+(idx+1));
    originChip(top,o);
    if(!restreint){
      var evo=(state.evaluationsOffres||{})[o.id];
      if(evo){ var ce=add(top,'span','chip '+(evo.alerte?'c-red':'c-grey'),'Exécution passée : '+evo.moyenne+'/100 sur '+evo.nb+' commande(s)');
        ce.title='Note du partenaire sur ses commandes réceptionnées ; information pour l’évaluateur, sans effet sur le classement.'; }
      var corr = montantCorrige(o);
      grilleLecture(card,[
        ['Montant de l’offre', sep(o.montant)+' '+o.devise], ['Délai', o.delai+' jours'],
        ['Contre-valeur', xof(montantXOF(o))], ['Prix comparé', Math.abs(corr-montantXOF(o))>1 ? xof(corr) : null]
      ]);
    }
    if((o.pieces||[]).some(function(f){ return f.offre; })) documentsOffre(card,o,true); // l'offre technique et financière, pour noter sur pièces
    if(coiBloque){ var wc=add(card,'div','warn'); wc.style.margin='0 0 12px'; wc.textContent='Déclaration de conflit d’intérêts requise avant toute notation : faites-la depuis l’écran d’évaluation.'; }

    state.criteria.forEach(function(cr){
      var dom=R.domaineDe(cr);
      if(restreint && dom!=='technique') return; // un évaluateur technique ne voit pas les critères financiers
      var crit=add(card,'div','crit');
      var k=add(crit,'span','crit-k');
      k.appendChild(document.createTextNode(cr.label+' ('+cr.weight+' %)'));
      if(cr.kind==='qual' && dom==='technique') badgeNoteIA(k,o);
      if(cr.kind==='qual') add(k,'span','chip c-grey',dom==='financier' ? 'financier' : 'technique').style.marginLeft='6px';
      if(cr.kind==='auto'){
        add(crit,'span',null,(r.notes[cr.id]||0).toFixed(1)).style.fontWeight='600';
        return;
      }
      var mine=peutNoter(o,cr), mon=maNote(o,cr), ai=aiScore(o,cr.id);
      var ref = restreint ? (mon!=null ? mon : ai) : curScore(o,cr.id);
      if(mine){
        var cur = mon!=null ? mon : ai;
        var st=add(crit,'span','stepper');
        var verrou = coiBloque || state.evalDone;
        var noter=function(v){ cibler('PUT','/scores/'+enc(o.id)+'/'+enc(cr.id),{note:v}).then(function(x){ if(x) logit('Note « '+cr.label+' » : '+v+' — '+o.name); }); };
        var mi=add(st,'button','step-btn','−'); mi.setAttribute('aria-label','Diminuer '+cr.label+' pour '+o.name);
        fk(mi,'dec-'+o.id+'-'+cr.id); guard('eval.score',mi);
        if(verrou){ mi.disabled=true; }
        mi.addEventListener('click',function(){ noter(Math.max(0,cur-5)); });
        var sv=add(st,'span','step-v', cur.toFixed(0)+'/100'); if(mon==null) sv.title='Note proposée : pas encore retenue comme la vôtre';
        var pl=add(st,'button','step-btn','+'); pl.setAttribute('aria-label','Augmenter '+cr.label+' pour '+o.name);
        fk(pl,'inc-'+o.id+'-'+cr.id); guard('eval.score',pl);
        if(verrou){ pl.disabled=true; }
        pl.addEventListener('click',function(){ noter(Math.min(100,cur+5)); });
        if(mon==null && !verrou){
          var rt=add(crit,'button','btn btn-primary btn-sm','Retenir '+cur.toFixed(0)); fk(rt,'retenir-'+o.id+'-'+cr.id);
          rt.title='Enregistrer la note proposée comme la vôtre';
          rt.addEventListener('click',function(){ noter(cur); });
        } else if(mon!=null){ add(crit,'span','chip c-green','Ma note enregistrée'); }
      } else {
        add(crit,'span','step-v', ref.toFixed(0)+'/100');
      }
      // note de chaque évaluateur assigné, et moyenne retenue (pas pour l'évaluateur technique seul : il ne voit que la sienne)
      if(!restreint){
        var ass=R.assignes(RCTX(),o,dom), nn=notesDe(o,cr);
        if(ass.length){
          var det=add(card,'div','dt-extrait'); det.style.cssText='margin:0 0 6px;font-size:11.5px;color:var(--muted)';
          det.textContent=ass.map(function(u){ return nomCompte(u)+' : '+(nn[u]!=null ? Number(nn[u]).toFixed(0) : 'à noter'); }).join(' · ')+(ass.length>1 ? ' — moyenne retenue : '+curScore(o,cr.id).toFixed(1) : '');
        }
      }
      // écart avec la note proposée par l'IA : justification obligatoire
      if(Math.abs(ref-ai)>0.01 && (mine || !restreint)){
        var jk=o.id+'_'+cr.id;
        var wb=add(card,'div'); wb.style.cssText='background:var(--amber-bg);border-radius:8px;padding:9px 10px;margin:2px 0 6px';
        add(wb,'div',null,'Écart avec la note proposée ('+ai+') — justification obligatoire')
          .style.cssText='font-size:11.5px;color:var(--amber);font-weight:700;margin-bottom:6px';
        var ta=add(wb,'textarea'); ta.rows=2; ta.style.width='100%'; ta.placeholder='Motif de la modification…';
        ta.value=state.justif[jk]||'';
        ta.disabled = !can('eval.score') || state.evalDone;
        ta.setAttribute('aria-label','Justification — '+o.name+' / '+cr.label);
        fk(ta,'just-'+o.id+'-'+cr.id);
        ta.addEventListener('change',function(){
          var motif=ta.value.trim();
          cibler('PUT','/scores/'+enc(o.id)+'/'+enc(cr.id),{justification:motif}).then(function(x){
            if(!x || !motif) return;
            logit('Justification saisie — '+o.name+' / '+cr.label);
            notify('ecart.ia','Écart motivé avec un score proposé par l’IA',
              o.name+" — "+cr.label+" : score proposé "+ai+", score retenu "+ref+". Motif : "+motif);
            save(); render();
          });
        });
      }
    });
    if(r){
      var tot=add(card,'div','total');
      add(tot,'span',null,'Total pondéré').style.cssText='font-size:12px;font-weight:700;color:var(--muted)';
      add(tot,'span','total-v', r.total.toFixed(1));
    }
    if(restreint || can('eval.technique')) vAnalyseMemoire(card,o);
  });
}

/* Analyse du mémoire technique par l'IA, dans la fenêtre de notation : proposition (notes motivées, points forts et
   faibles), reprise des notes proposées, ou lancement de l'analyse quand le mémoire est joint à l'offre. Elle sert les
   évaluateurs techniques assignés à l'offre et ne porte que sur les critères techniques. */
UI.notationIA = null;
function etatNotationIA(){
  if(!UI.notationIA || UI.notationIA.pid!==state.procedure) UI.notationIA={ pid:state.procedure, taches:{}, erreurs:{} };
  return UI.notationIA;
}
function vAnalyseMemoire(card,o){
  var z=add(card,'div','fen-section analyse-ia'); z.style.marginTop='14px';
  var x=etatNotationIA(), t=x.taches[o.id], memoire=(o.pieces||[]).some(function(p){ return p.doc==='memoire' || p.doc==='offre-recue'; });
  var qual=state.criteria.filter(function(c){ return c.kind==='qual' && R.domaineDe(c)==='technique'; });
  var h=add(z,'h3',null,'Analyse de l’offre technique'); badgeNoteIA(h,o);
  if(t){ var pr=add(z,'p',null,'Lecture de l’offre technique par l’IA… '+t.depuis+' s'); pr.setAttribute('role','status'); add(z,'p','muted','Cela prend en général une à trois minutes.'); return; }
  if(x.erreurs[o.id]){ var e=add(z,'div','warn'); add(e,'strong',null,'Analyse impossible. '); e.appendChild(document.createTextNode(x.erreurs[o.id])); }
  if(o.aiIA){
    add(z,'p','muted','Notes proposées par l’IA ('+o.aiIA.modele+', le '+o.aiIA.le+'), à reprendre ou à corriger en motivant l’écart.');
    if(o.aiWhy) add(z,'p',null,o.aiWhy);
    qual.forEach(function(c){
      var j=(o.aiIA.justifications||{})[c.id]; if(!j) return;
      var d=add(z,'div','analyse-crit'); add(d,'strong',null,c.label+' — '+aiScore(o,c.id)+'/100'); add(d,'p',null,j);
    });
    [['Points forts',o.aiIA.pointsForts],['Points faibles',o.aiIA.pointsFaibles]].forEach(function(g){
      if(!(g[1]||[]).length) return;
      add(z,'div','stat-k',g[0]).style.marginTop='10px';
      var ul=add(z,'ul'); ul.style.margin='4px 0 0 18px'; g[1].forEach(function(v){ add(ul,'li',null,v); });
    });
  } else {
    add(z,'p','muted', o.submitted || o.externe ? (memoire ? 'L’offre technique jointe n’a pas encore été analysée : les notes affichées sont provisoires.' : 'Aucune offre technique jointe : les notes affichées sont provisoires, à arrêter par l’évaluateur.')
      : 'Offre de démonstration : les notes proposées sont simulées, aucune offre technique n’a été lue.');
    if(o.aiWhy) add(z,'p','muted','Appréciation simulée : '+o.aiWhy);
  }
  var verrou=!can('eval.score') || !suisAssigne(o,'technique') || coiRequise() || state.evalDone;
  var act=add(z,'div','echange-actions');
  if(o.aiIA && !verrou){
    // les notes proposées que je n'ai pas encore faites miennes
    var aReprendre=qual.filter(function(c){ var mon=maNote(o,c); return mon==null || Math.abs(mon-aiScore(o,c.id))>0.01; });
    if(aReprendre.length){
      var rp=add(act,'button','btn btn-primary btn-sm','Reprendre les notes proposées'); fk(rp,'ia-reprendre-'+o.id);
      rp.addEventListener('click',function(){
        rp.disabled=true;
        aReprendre.reduce(function(pm,c){ return pm.then(function(){ return cibler('PUT','/scores/'+enc(o.id)+'/'+enc(c.id),{note:aiScore(o,c.id)}); }); }, Promise.resolve())
          .then(function(){ logit('Notes proposées par l’IA reprises — '+o.name); render(); });
      });
    }
  }
  if(memoire && etatIA().actif && !verrou){
    var go=add(act,'button','btn btn-ghost btn-sm', o.aiIA?'Analyser à nouveau':'Analyser l’offre technique avec l’IA'); fk(go,'ia-analyser-'+o.id);
    go.addEventListener('click',function(){
      var lancer=function(){
        delete x.erreurs[o.id]; x.taches[o.id]={ id:'…', depuis:0 }; render();
        MP.api('POST',MP.url('/ia/notation/'+enc(o.id)),{}).then(function(r){ x.taches[o.id].id=r.tache; suivreNotationIA(x,o.id,r.tache); })
          .catch(function(e){ delete x.taches[o.id]; x.erreurs[o.id]=e.message||'Erreur.'; render(); });
      };
      if(o.aiIA) ask('La nouvelle analyse remplace la proposition actuelle ; vos notes ne changent pas.',lancer,'Analyser à nouveau le mémoire ?','Analyser');
      else lancer();
    });
  }
}
function suivreNotationIA(x, oid, id){
  setTimeout(function(){
    if(UI.notationIA!==x || !x.taches[oid] || x.taches[oid].id!==id) return;
    MP.api('GET',MP.url('/ia/taches/'+encodeURIComponent(id))).then(function(r){
      if(r.etat==='en_cours'){ x.taches[oid].depuis=r.depuis; render(); suivreNotationIA(x,oid,id); return; }
      delete x.taches[oid];
      toast('Notes proposées par l’IA : relisez-les avant de les reprendre.');
      return relireEtat();
    }).catch(function(e){ delete x.taches[oid]; x.erreurs[oid]=e.message||'Erreur.'; render(); });
  }, 2500);
}
