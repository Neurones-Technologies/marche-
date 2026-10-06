/* Marché+ — Écran Cahier des charges.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

function vCDC(m){
  var c=state.cdc;
  // publié : le dossier mis en page, en lecture seule pour tous
  if(c.cdcPublie){ vDossierPublie(m); return; }
  if(!can('cdc.edit') && !can('cdc.publish')) return locked(m,"Le dossier sera consultable ici une fois publié.",'dashboard','Aller à la vue d’ensemble');
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Cahier des charges');
  // « Aperçu » et « Publier » n'apparaissent que lorsque le dossier est prêt (le serveur refuse aussi un dossier incomplet)
  // données fictives : uniquement sur demande (un appel d'offres neuf naît vide)
  if(can('cdc.edit')){
    var fx=add(h,'button','btn btn-ghost','Générer des données fictives'); fk(fx,'cdc-fictif');
    fx.addEventListener('click',function(){
      var plein=(c.lots||[]).length || (c.specs||[]).length || String(c.procedure||'').trim();
      if(!plein) return genererDonneesFictives();
      ask('Le cahier des charges et la grille de critères seront remplacés par un exemple.', genererDonneesFictives, 'Générer des données fictives ?', 'Remplacer');
    });
  }
  var manque=R.cdcManquants({ cdc:c, org:state.org, cadre:state.cadre, criteria:state.criteria, consultes:state.consultes, docDefs:state.docDefs });
  if(!manque.length){
    var ap=add(h,'button','btn btn-ghost','Aperçu du dossier'); fk(ap,'cdc-apercu');
    ap.addEventListener('click',ouvrirDossier);
  }
  var pb=manque.length ? null : add(h,'button','btn btn-primary','Publier le cahier des charges');
  if(pb) guard('cdc.publish',pb);
  if(pb) pb.addEventListener('click',function(){
    ask('Le dossier devient opposable aux candidats et le portail de dépôt s\u2019ouvre.', function(){
      c.cdcPublie=true; logit('Cahier des charges publié — ouverture aux soumissions');
      notify('cdc.publie', 'Cahier des charges publié',
        "Le dossier d'appel d'offres "+REF()+" est publié. Objet : "+c.objet+". Date limite de dépôt : "+c.ouverture+" à 10 h 00.");
      save(); render();
    }, 'Publier le cahier des charges ?', 'Publier');
  });
  // mode de saisie (formulaire, document, idée) : seul ce qu'exige le mode choisi s'affiche
  if(can('cdc.edit') && !c.cdcPublie && !vCdcModes(m)) return;
  if(manque.length){
    var av=add(add(m,'div'),'div','note'); av.style.marginBottom='18px';
    add(av,'strong',null,'Avant de publier, complétez : ');
    av.appendChild(document.createTextNode(manque.join(' ; ')+'.'));
  }

  /* Identification */
  var k1=add(m,'div','card'); add(k1,'div','panel-head','1 · Identification de la procédure');
  var f1=add(add(k1,'div','pad'),'div','frm');
  function txt(parent,lab,val,cb,type){
    var w=add(parent,'div'); var id='f'+Math.random().toString(36).slice(2,8);
    var lb=add(w,'label',null,lab); lb.setAttribute('for',id);
    var i=add(w,type==='textarea'?'textarea':'input'); i.id=id;
    if(type==='number'){ i.type='number'; } else if(type!=='textarea'){ i.type='text'; }
    if(type==='textarea'){ i.rows=2; }
    i.value=val; fk(i,'cdc-'+lab.slice(0,16));
    i.addEventListener('change',function(){ cb(i.value); save(); render(); });
    return i;
  }
  txt(f1,"Référence de la procédure",c.ref,function(v){ c.ref=String(v).trim(); logit('Référence de la procédure : '+c.ref); });
  txt(f1,"Objet du marché",c.objet,function(v){ c.objet=v; logit('Objet du marché modifié'); },'textarea').style.gridColumn='1/-1';
  txt(f1,"Autorité contractante",c.autorite,function(v){ c.autorite=v; });
  txt(f1,"Type de procédure",c.procedure,function(v){ c.procedure=v; });
  (function(){
    var w=add(f1,'div'); add(w,'label',null,'Profil réglementaire').setAttribute('for','cdc-profil');
    var s=add(w,'select'); s.id='cdc-profil'; fk(s,'cdc-profil');
    Object.keys(MPProfils.PROFILS).forEach(function(id){ var op=add(s,'option',null,MPProfils.PROFILS[id].lab); op.value=id; });
    s.value=R.profilId(RCTX());
    s.disabled=!!c.cdcPublie;
    s.addEventListener('change',function(){
      c.profil=s.value; logit('Profil réglementaire de la procédure : '+MPProfils.profil(s.value).lab);
      // pièces imposées par le nouveau profil, ajoutées si elles manquent
      state.docDefs=state.docDefs||[];
      (CADRE().piecesImposees||[]).forEach(function(id){
        if(state.docDefs.some(function(d){ return d.id===id; })) return;
        var mod=DOC_DEFS.filter(function(d){ return d.id===id; })[0] || { id:id, label:id, scope:'tous' };
        state.docDefs.push({ id:mod.id, label:mod.label, scope:mod.scope||'tous' });
      });
      save(); render();
    });
    if(c.cdcPublie) add(w,'div','muted','Figé à la publication du dossier.');
  })();
  txt(f1,"Langue de soumission",c.langue,function(v){ c.langue=v; });
  txt(f1,"Devise de soumission",c.deviseSoumission,function(v){ c.deviseSoumission=v; });
  txt(f1,"Date d'ouverture des plis",c.ouverture,function(v){ c.ouverture=v; });

  /* Allotissement */
  var k2=add(m,'div','card'); k2.style.marginTop='18px';
  add(k2,'div','panel-head','2 · Allotissement');
  var b2=add(k2,'div','pad');
  c.lots.forEach(function(lot,i){
    var row=add(b2,'div','lot');
    var n=add(row,'input'); n.type='text'; n.value=lot.nom; n.style.flex='2 1 260px';
    n.setAttribute('aria-label','Intitulé du lot');
    n.addEventListener('change',function(){ lot.nom=n.value; save(); });
    var mt=add(row,'input'); mt.type='text'; mt.value=lot.montant; mt.style.flex='1 1 150px';
    mt.setAttribute('aria-label','Montant estimatif du lot');
    mt.addEventListener('change',function(){ lot.montant=mt.value; save(); });
    var d=add(row,'button','icon-btn','×'); d.setAttribute('aria-label','Supprimer le lot');
    d.addEventListener('click',function(){
      ask('Le lot « '+lot.nom+' » sera retiré du cahier des charges et du dossier généré.', function(){
        c.lots.splice(i,1); logit('Lot supprimé du cahier des charges'); save(); render();
      }, 'Supprimer ce lot ?', 'Supprimer');
    });
  });
  var f2=add(k2,'div','panel-foot');
  add(f2,'span','muted','Un marché alloti permet aux PME locales de soumissionner sur un lot sans porter l\u2019ensemble du marché.');
  add(f2,'button','btn btn-ghost btn-sm','+ Ajouter un lot').addEventListener('click',function(){
    c.lots.push({id:'l'+Date.now(), nom:'Nouveau lot', montant:'— XOF'});
    logit('Lot ajouté au cahier des charges'); save(); render();
  });

  /* Spécifications */
  var k3=add(m,'div','card'); k3.style.marginTop='18px';
  add(k3,'div','panel-head','3 · Spécifications techniques');
  var b3=add(k3,'div','pad');
  c.specs.forEach(function(s,i){
    var row=add(b3,'div','lot');
    var t=add(row,'input'); t.type='text'; t.value=s; t.style.flex='1 1 320px';
    t.setAttribute('aria-label','Spécification technique');
    t.addEventListener('change',function(){ c.specs[i]=t.value; save(); });
    var d=add(row,'button','icon-btn','×'); d.setAttribute('aria-label','Supprimer la spécification');
    d.addEventListener('click',function(){
      ask('Cette exigence disparaîtra du CCTP et ne sera plus opposable aux soumissionnaires.', function(){
        c.specs.splice(i,1); logit('Spécification technique supprimée'); save(); render();
      }, 'Supprimer cette spécification ?', 'Supprimer');
    });
  });
  var f3=add(k3,'div','panel-foot');
  add(f3,'span','muted','Rédigez des spécifications fonctionnelles neutres : citer une marque restreint la concurrence et fragilise la procédure.');
  add(f3,'button','btn btn-ghost btn-sm','+ Ajouter une spécification').addEventListener('click',function(){
    c.specs.push('Nouvelle spécification'); save(); render();
  });

  /* Conditions */
  var k4=add(m,'div','card'); k4.style.marginTop='18px';
  add(k4,'div','panel-head','4 · Conditions administratives et financières');
  var f4=add(add(k4,'div','pad'),'div','frm');
  txt(f4,"Caution de soumission (% du montant)",c.caution,function(v){ c.caution=Number(v)||0; logit('Taux de caution porté à '+v+' %'); },'number');
  txt(f4,"Garantie minimale exigée (mois)",c.garantieMin,function(v){ c.garantieMin=Number(v)||0; logit('Garantie minimale portée à '+v+' mois'); },'number');
  txt(f4,"Délai d'exécution maximal (jours)",c.delaiMax,function(v){ c.delaiMax=Number(v)||0; logit('Délai maximal porté à '+v+' jours'); },'number');
  txt(f4,"Pénalité de retard (‰ par jour)",c.penalite,function(v){ c.penalite=Number(v)||0; },'number');
  txt(f4,"Avance de démarrage (%)",c.avance,function(v){ c.avance=Number(v)||0; },'number');

  /* Fiscal */
  var k5=add(m,'div','card'); k5.style.marginTop='18px';
  add(k5,'div','panel-head','5 · Régime fiscal et douanier');
  var f5=add(add(k5,'div','pad'),'div','frm');
  txt(f5,"TVA applicable (%)",c.tva,function(v){ c.tva=Number(v)||0; },'number');
  txt(f5,"Retenue à la source — non-résidents (%)",c.retenueNonResident,function(v){ c.retenueNonResident=Number(v)||0; },'number');
  txt(f5,"Droits et taxes à l'importation à la charge de",c.douaneACharge,function(v){ c.douaneACharge=v; });
  var w5=add(add(k5,'div','pad'),'div','warn'); w5.style.marginTop='0';
  add(w5,'strong',null,'Pourquoi ce bloc compte pour les offres étrangères. ');
  w5.appendChild(document.createTextNode("Une offre hors zone peut paraître moins-disante et se révéler plus chère une fois la retenue à la source et les droits d'entrée intégrés. Le cahier des charges doit dire explicitement qui les supporte, sinon la comparaison entre offres locales et étrangères n'a pas de base commune."));

  /* Préférence */
  var k6=add(m,'div','card'); k6.style.marginTop='18px';
  add(k6,'div','panel-head','6 · Préférence communautaire UEMOA');
  var b6=add(k6,'div','pad');
  var row6=add(b6,'div'); row6.style.cssText='display:flex;gap:12px;align-items:center;flex-wrap:wrap';
  var K=CADRE();
  var pill=add(row6,'button','pill'+(c.prefActive?' on':''), c.prefActive?'Marge de préférence activée':'Marge de préférence désactivée');
  pill.disabled=!K.preferenceAutorisee && !c.prefActive;
  pill.addEventListener('click',function(){
    c.prefActive=!c.prefActive;
    logit('Marge de préférence communautaire '+(c.prefActive?'activée':'désactivée'));
    save(); render();
  });
  var wr=add(row6,'div');
  var lb=add(wr,'label',null,'Taux (%)'); lb.setAttribute('for','preftaux');
  lb.style.cssText='font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;display:block';
  var pi=add(wr,'input'); pi.id='preftaux'; pi.type='number'; pi.min='0'; pi.max=String(K.preferenceTauxMax); pi.value=c.prefTaux; pi.style.width='110px';
  pi.disabled=!c.prefActive;
  pi.addEventListener('change',function(){
    c.prefTaux=Math.max(0,Math.min(K.preferenceTauxMax,Number(pi.value)||0));
    logit('Taux de préférence communautaire porté à '+c.prefTaux+' %'); save(); render();
  });
  if(state.depClosed){
    pill.disabled=true; pi.disabled=true;
    add(b6,'p','muted',"Dépouillement clôturé : la marge est figée, elle conditionne le classement.").style.marginTop='12px';
  }
  add(b6,'p','muted', K.preferenceAutorisee
    ? 'Profil « '+MPProfils.profil(R.profilId(RCTX())).lab+' » : taux de '+K.preferenceTauxMax+' % au plus.'
    : 'Le profil « '+MPProfils.profil(R.profilId(RCTX())).lab+' » n’autorise pas de marge de préférence.').style.marginTop='12px';
  add(b6,'p','muted',"Mécanisme : les offres de soumissionnaires établis hors de l'espace communautaire sont majorées du taux retenu pour les seuls besoins de la comparaison. Le prix contractuel du titulaire reste son prix d'offre.").style.marginTop='12px';

  /* Pièces propres à l'offre, saisies à la main pour cet appel d'offres. Celles du référencement restent exigées des
     entreprises non référencées (dossier publié, article 2.4) sans être redemandées à un partenaire référencé. */
  var k7=add(m,'div','card'); k7.style.marginTop='18px';
  add(k7,'div','panel-head','7 · Pièces à joindre à chaque offre');
  var b7=add(k7,'div','pad');
  var pr7=(state.formulaireReferencement||{}).pieces||[], imposees=CADRE().piecesImposees||[];
  state.docDefs=state.docDefs||[];
  var aJoindre=state.docDefs.filter(function(d){ return !R.pieceReferencement(d,pr7); });
  if(!aJoindre.length) add(b7,'p','muted','Aucune pièce propre à l’offre. Ajoutez par exemple la caution de soumission.');
  aJoindre.forEach(function(d){
    var row=add(b7,'div','docline');
    var ti=add(row,'input'); ti.type='text'; ti.value=d.label; ti.maxLength=200; ti.style.flex='1 1 280px';
    ti.setAttribute('aria-label','Pièce à joindre'); fk(ti,'cdc-piece-'+d.id);
    ti.addEventListener('change',function(){ var v=ti.value.trim(); if(!v){ ti.value=d.label; return; } d.label=v; logit('Pièce à joindre renommée : '+v); save(); });
    var se=add(row,'select'); se.setAttribute('aria-label','Soumissionnaires concernés'); fk(se,'cdc-piece-scope-'+d.id);
    [['tous','Tous les soumissionnaires'],['local','Établis en Côte d’Ivoire'],['etranger','Établis hors UEMOA']].forEach(function(x){ add(se,'option',null,x[1]).value=x[0]; });
    se.value=d.scope||'tous';
    se.addEventListener('change',function(){ d.scope=se.value; logit('Pièce « '+d.label+' » : soumissionnaires concernés modifiés'); save(); });
    if(imposees.indexOf(d.id)>=0) add(row,'span','chip c-grey','Imposée par le profil');
    else boutonIcone(row,'x','Retirer « '+d.label+' »',function(){
      ask('Cette pièce ne sera plus exigée des soumissionnaires de cet appel d’offres.',function(){
        state.docDefs.splice(state.docDefs.indexOf(d),1); logit('Pièce retirée de l’appel d’offres : '+d.label); save(); render();
      },'Retirer « '+d.label+' » ?','Retirer');
    },'cdc-piece-sup-'+d.id);
  });
  var f7=add(k7,'div','panel-foot');
  var aj7=add(f7,'button','btn btn-ghost btn-sm','+ Ajouter une pièce'); fk(aj7,'cdc-piece-ajout');
  aj7.addEventListener('click',function(){
    state.docDefs.push({ id:'d'+Date.now().toString(36), label:'Nouvelle pièce', scope:'tous' });
    logit('Pièce ajoutée à l’appel d’offres'); save(); render();
  });
}

/* Écran « Prestataires consultés » (étape Préparer) : qui peut voir le dossier publié et soumissionner. */
function vPrestataires(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Prestataires consultés');
  vCdcConsultation(m);
}

/* Partenaires consultés. Achats privés : seuls les partenaires référencés sélectionnés voient le dossier publié et
   déposent une offre. Acheteur public : appel d'offres ouvert à toute entreprise (obligation légale), ou consultation
   restreinte aux partenaires sélectionnés. La sélection se fait parmi les seuls partenaires référencés. */
UI.references = null;
function vCdcConsultation(m){
  var co=state.consultes||{}, pub=!!MPProfils.profil(R.profilId(RCTX())).public;
  var mode = pub && co.mode!=='restreint' ? 'ouvert' : 'restreint', ids=co.partenaires||[];
  var peut=can('cdc.edit')||can('cdc.publish');
  var ecrire=function(v, message){ state.consultes=v; logit(message); save(); render(); };
  var k=add(m,'div','card');
  var ph=add(k,'div','panel-head'); add(ph,'span',null,'Mode de consultation');
  add(ph,'span','chip '+(mode==='ouvert'?'c-violet':'c-teal'), mode==='ouvert' ? 'Ouvert à toute entreprise' : ids.length+' partenaire'+(ids.length>1?'s':'')+' consulté'+(ids.length>1?'s':''));
  var b=add(k,'div','pad');
  if(pub){
    var seg=add(b,'div','consult-modes');
    [['ouvert','Appel d’offres ouvert','Toute entreprise inscrite sur le portail, référencée ou non, voit le dossier publié et peut déposer une offre.'],
     ['restreint','Consultation restreinte','Seuls les partenaires référencés que vous sélectionnez voient le dossier et déposent une offre.']].forEach(function(x){
      var o=add(seg,'button','consult-mode'+(mode===x[0]?' on':'')); o.type='button'; fk(o,'consult-'+x[0]);
      o.setAttribute('aria-pressed',mode===x[0]?'true':'false'); o.disabled=!peut;
      add(o,'strong',null,x[1]); add(o,'span',null,x[2]);
      o.addEventListener('click',function(){ if(mode!==x[0]) ecrire({ mode:x[0], partenaires:ids }, 'Consultation : '+x[1].toLowerCase()); });
    });
  }
  if(mode==='ouvert') return;
  if(!UI.references){
    add(b,'p','muted','Chargement des partenaires référencés…');
    if(!UI.referencesEnCours){
      UI.referencesEnCours=true;
      MP.api('GET','/api/partenaires/references').then(function(r){ UI.references=r.partenaires; }).catch(function(){ UI.references=[]; })
        .then(function(){ UI.referencesEnCours=false; render(); });
    }
    return;
  }
  var parId={}; UI.references.forEach(function(p){ parId[p.id]=p; });
  var lignes=ids.map(function(id){ return parId[id] || { id:id, raisonSociale:id, pays:'', domaines:[], horsListe:true }; });
  tableau(b,{ cle:'consultes', lignes:lignes,
    vide:'Aucun partenaire consulté : sélectionnez les partenaires référencés invités à soumissionner.',
    colonnes:[
      {lab:'Partenaire', rendu:function(p,td){ add(td,'strong',null,p.raisonSociale); add(td,'div','muted',p.id+(p.pays?' · '+p.pays:'')); }},
      {lab:'Activité', val:function(p){ return p.activite || (p.domaines||[]).join(', ') || '—'; }},
      {lab:'Note', num:true, rendu:function(p,td){ if(p.evaluation && p.evaluation.nb) chipCellule(td,p.evaluation.moyenne+'/100',p.evaluation.alerte?'c-red':'c-grey'); else td.textContent='—'; }},
      {lab:'Statut', rendu:function(p,td){ chipCellule(td, p.horsListe?'Plus référencé':'Référencé', p.horsListe?'c-amber':'c-green'); }}
    ],
    recherche:function(p){ return [p.raisonSociale,p.id,p.pays,p.activite,(p.domaines||[]).join(' ')].join(' '); },
    nouveau: peut ? { lab:'Partenaires', action:function(){ choisirPartenaires(ids, function(ajout){
      ecrire({ mode:'restreint', partenaires:ids.concat(ajout) }, 'Partenaires consultés ajoutés : '+ajout.length); }); } } : null,
    actions: peut ? function(p,td){
      boutonIcone(td,'x','Retirer '+p.raisonSociale,function(){
        ask('Le partenaire ne verra plus le dossier. Un partenaire qui a déjà déposé une offre ne peut pas être retiré.',function(){
          ecrire({ mode:'restreint', partenaires:ids.filter(function(x){ return x!==p.id; }) }, 'Partenaire retiré de la consultation : '+p.raisonSociale);
        },'Retirer '+p.raisonSociale+' de la consultation ?','Retirer');
      },'consult-ret-'+p.id);
    } : null
  });
}
/* Fenêtre de choix : partenaires référencés pas encore consultés, avec recherche. */
function choisirPartenaires(deja, valider){
  var choisis={}, q='';
  ouvrirFenetre('Consulter des partenaires référencés',function(corps,pied){
    var dispo=(UI.references||[]).filter(function(p){ return deja.indexOf(p.id)<0; });
    if(!dispo.length){ add(corps,'p','muted', (UI.references||[]).length ? 'Tous les partenaires référencés sont déjà consultés.' : 'Aucun partenaire référencé : les prestataires déposent leur dossier sur le portail des partenaires, puis le service des achats les référence.'); }
    else {
      var rq=add(corps,'input','dt-recherche'); rq.type='search'; rq.placeholder='Rechercher un partenaire, une activité…'; rq.value=q; fk(rq,'consult-q');
      rq.setAttribute('aria-label','Rechercher un partenaire');
      var liste=add(corps,'div','consult-liste');
      var dessiner=function(){
        liste.textContent='';
        var t=q.trim().toLowerCase();
        dispo.filter(function(p){ return !t || [p.raisonSociale,p.id,p.pays,p.activite,(p.domaines||[]).join(' ')].join(' ').toLowerCase().indexOf(t)>=0; }).forEach(function(p){
          var l=add(liste,'label','consult-choix'+(choisis[p.id]?' on':''));
          var c=add(l,'input'); c.type='checkbox'; c.checked=!!choisis[p.id];
          c.addEventListener('change',function(){ if(c.checked) choisis[p.id]=true; else delete choisis[p.id]; l.classList.toggle('on',c.checked); maj(); });
          var d=add(l,'div'); add(d,'strong',null,p.raisonSociale);
          add(d,'span','muted',[p.id,p.pays,p.activite||(p.domaines||[]).join(', ')].filter(Boolean).join(' · '));
          if(p.evaluation && p.evaluation.nb) add(l,'span','chip '+(p.evaluation.alerte?'c-red':'c-grey'),p.evaluation.moyenne+'/100');
        });
        if(!liste.childNodes.length) add(liste,'p','muted','Aucun partenaire ne correspond à la recherche.');
      };
      rq.addEventListener('input',function(){ q=rq.value; dessiner(); });
      dessiner();
    }
    add(pied,'button','btn btn-ghost','Annuler').addEventListener('click',fermerFenetre);
    var go=add(pied,'button','btn btn-primary','Consulter'); fk(go,'consult-ok');
    var maj=function(){ var n=Object.keys(choisis).length; go.textContent=n?'Consulter '+n+' partenaire'+(n>1?'s':''):'Consulter'; go.disabled=!n; };
    maj();
    go.addEventListener('click',function(){ var ajout=Object.keys(choisis); fermerFenetre(); valider(ajout); });
  },{ large:true });
}
