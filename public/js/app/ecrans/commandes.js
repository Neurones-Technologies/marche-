/* Marché+ — Écran Exécution : commandes et réceptions (module 4 : bon de commande et suivi d'exécution). Le titulaire
   y accuse réception du bon de commande, déclare ses livraisons et dépose ses factures ; les achats rapprochent et
   décident des factures (bon à payer ou rejet motivé).
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Les commandes se chargent par /api/commandes ; le serveur filtre ce que chacun voit (achats, valideurs,
   réceptionnaire désigné, titulaire par le portail). */
"use strict";

var STATUTS_COMMANDE = {
  brouillon: ['Brouillon','c-grey'], validation: ['En validation','c-amber'], rejete: ['À corriger','c-red'],
  validee: ['Validée, à émettre','c-teal'], emise: ['Émise','c-blue'], en_reception: ['Livraison partielle','c-amber'],
  receptionnee: ['Réception provisoire','c-teal'], cloturee: ['Réception définitive','c-green'], annulee: ['Annulée','c-grey']
};
UI.commande = null;
var STATUTS_FACTURE = { deposee:['À traiter','c-amber'], acceptee:['Acceptée pour paiement','c-green'], rejetee:['Rejetée','c-red'] };
/* Le compte connecté est-il le titulaire (portail) plutôt qu'un acheteur ? */
function vueTitulaireCommande(){ return can('portail.use') && !can('commande.manage') && !can('commande.approve'); }
/* Lien de téléchargement d'une pièce d'exécution (bon de livraison, facture). */
function lienPieceExecution(parent, f){
  if(!f) return null;
  var a=add(parent,'a','pill',f.name+' · '+taille(f.size)); a.href='/api/files/'+f.id; a.setAttribute('download',f.name); a.title='SHA-256 '+f.sha256;
  return a;
}

function montantDevise(n, devise){ return sep(Math.round(Number(n)||0))+' '+(devise||'XOF'); }

function vCommandes(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Exécution');
  var zone=add(m,'div'); add(zone,'p','muted','Chargement…');
  var corps=null, piedFen=null, cmds=[]; // contenu et pied de la fenêtre ouverte ; commandes chargées

  function charger(){
    MP.api('GET','/api/commandes').then(function(r){
      var suite = can('commande.manage') ? MP.api('GET','/api/commandes/eligibles') : Promise.resolve({procedures:[]});
      return suite.then(function(e){ zone.textContent=''; dessiner(r.commandes, e.procedures); });
    }).catch(function(e){ zone.textContent=''; add(zone,'p','muted',e.message); });
  }
  function agir(method, path, body, message){
    return MP.api(method,'/api/commandes/'+path,body||{}).then(function(r){ if(message) toast(message); charger(); return r; })
      .catch(function(e){ toast(e.message); charger(); return null; });
  }

  function dessiner(list, eligibles){
    tableau(zone,{ cle:'commandes', lignes:list.slice().reverse(),
      vide: can('commande.manage') ? 'Aucune commande : utilisez « Nouvelle commande » à partir d’une procédure attribuée.' : 'Aucune commande ne vous concerne pour le moment.',
      colonnes:[
        {lab:'N°', val:function(c){ return c.numero || 'Brouillon'; }},
        {lab:'Titulaire', val:function(c){ return c.titulaire.nom; }},
        {lab:'Procédure', val:function(c){ return c.procedure.ref; }},
        {lab:'Montant', num:true, val:function(c){ return montantDevise(c.total,c.devise); }},
        {lab:'Livraison prévue', val:function(c){ return c.dateLivraison.split('-').reverse().join('/'); }},
        {lab:'Statut', rendu:function(c,td){ var st=STATUTS_COMMANDE[c.statut]||[c.statut,'c-grey']; chipCellule(td,st[0],st[1]); }}
      ],
      recherche:function(c){ return [c.numero, c.titulaire.nom, c.procedure.ref, c.procedure.objet].join(' '); },
      filtres:[{ lab:'Statut', options:Object.keys(STATUTS_COMMANDE).map(function(k){ return [k, STATUTS_COMMANDE[k][0]]; }), test:function(c,v){ return c.statut===v; } }],
      nouveau: can('commande.manage') ? { lab:'Nouvelle commande', action:function(){ nouvelleCommande(eligibles); } } : null,
      actions:function(c,td){ boutonCellule(td,'Ouvrir',function(){ ouvrirCommande(c.id); },'cmd-open-'+c.id); }
    });
    cmds=list;
    // adresse d'une commande (/execution/<commande>) : sa fenêtre s'ouvre ; une fenêtre déjà ouverte se met à jour
    if(UI.fenetre) dessinerFenetre();
    else if(UI.commande && list.some(function(c){ return c.id===UI.commande; })) ouvrirCommande(UI.commande);
  }

  /* Fenêtre d'une commande : en-tête, document, circuit de validation, actions, avenants, réceptions, historique. */
  function ouvrirCommande(id){
    UI.commande=id; majUrl();
    ouvrirFenetre(function(){
      var c=cmds.filter(function(x){ return x.id===id; })[0];
      return !c ? 'Commande' : (c.numero ? 'Bon de commande '+c.numero : 'Commande — '+c.titulaire.nom);
    }, function(f,pied){
      var c=cmds.filter(function(x){ return x.id===id; })[0]; if(!c) return false;
      corps=f; piedFen=pied;
      fiche(c);
      if(!pied.children.length){ add(pied,'span','muted','Commande '+(c.numero||'en brouillon')+' · '+c.procedure.ref); var fe=add(pied,'button','btn btn-ghost','Fermer'); fk(fe,'cmd-fermer'); fe.addEventListener('click',fermerFenetre); }
    }, { large:true, fermer:function(){ UI.commande=null; majUrl(); } });
  }

  /* Fenêtre « Nouvelle commande » : la procédure attribuée à commander. */
  function nouvelleCommande(eligibles){
    var dispo=eligibles.filter(function(e){ return e.restant>0; }); // montant déjà entièrement engagé : rien à commander
    ouvrirFenetre('Nouvelle commande', function(c,p){
      var an=add(p,'button','btn btn-ghost','Annuler'); fk(an,'cmd-annuler'); an.addEventListener('click',fermerFenetre);
      if(!dispo.length){ add(c,'p','muted','Aucune procédure ne permet encore d’établir une commande : attribution prononcée et, en marché public, marché signé.'); return; }
      var d=add(c,'div','fen-champ'); add(d,'label','fen-lab','Procédure attribuée').htmlFor='cmd-proc';
      var sel=add(d,'select'); sel.id='cmd-proc'; fk(sel,'cmd-proc');
      dispo.forEach(function(e){ var o=add(sel,'option',null,e.ref+' — '+e.titulaire+' — reste '+montantDevise(e.restant,e.devise)); o.value=e.procedure; });
      add(c,'p','muted','La commande est établie en brouillon, au nom du titulaire, avec le reste à engager du marché ; vous la complétez ensuite.').style.marginTop='12px';
      var bn=add(p,'button','btn btn-primary','Établir la commande'); fk(bn,'cmd-new');
      bn.addEventListener('click',function(){
        bn.disabled=true;
        MP.api('POST','/api/commandes',{procedure:sel.value}).then(function(r){ UI.commande=r.commande.id; majUrl(); toast('Brouillon de commande établi.'); fermerFenetre(); charger(); })
          .catch(function(e){ toast(e.message); bn.disabled=false; });
      });
    });
  }

  /* Parcours d'une commande : où elle en est de son cycle de vie. */
  var PARCOURS=['Brouillon','Validation','Émission','Réception','Clôture'];
  var RANG_PARCOURS={ brouillon:0, rejete:0, validation:1, validee:2, emise:3, en_reception:3, receptionnee:4, cloturee:5 };
  function fait(parent, lab, val, large){
    var w=add(parent,'div','fait'+(large?' fait-large':'')); add(w,'div','fait-k',lab); add(w,'div','fait-v',val||'—'); return w;
  }
  function enteteCommande(c){
    var st=STATUTS_COMMANDE[c.statut]||[c.statut,'c-grey'];
    var ch=add(corps,'div','fen-chips'); chipCellule(ch,st[0],st[1]); chipCellule(ch,montantDevise(c.total,c.devise),'c-grey');
    if(c.retard>0) chipCellule(ch,'Retard de '+c.retard+' j','c-red');
    if(c.reservesOuvertes) chipCellule(ch,c.reservesOuvertes+' réserve(s) ouverte(s)','c-amber');
    add(corps,'h3','fen-objet',c.procedure.objet||c.procedure.ref);
    add(corps,'p','muted fen-origine','Procédure '+c.procedure.ref+' · titulaire '+c.titulaire.nom);
    if(c.statut!=='annulee'){
      var rang=RANG_PARCOURS[c.statut]; if(rang==null) rang=0;
      var pc=add(corps,'div','parcours'); pc.setAttribute('role','list');
      PARCOURS.forEach(function(lab,i){
        var e=add(pc,'div','parcours-etape'+(i<rang?' acquis':(i===rang?' now':''))); e.setAttribute('role','listitem');
        add(e,'div','parcours-pt', i<rang?'✓':String(i+1)); add(e,'div','parcours-lab',lab);
      });
    }
    var g=add(corps,'div','faits');
    fait(g,'Titulaire',c.titulaire.nom+(c.titulaire.pays?' ('+c.titulaire.pays+')':''));
    fait(g,'Montant total HT',montantDevise(c.total,c.devise));
    fait(g,'Livraison prévue',(c.dateLivraison||'').split('-').reverse().join('/'));
    if(c.receptionnaire) fait(g,'Réceptionnaire',c.receptionnaire.nom);
    var lb=c.ligneBudget && (situationBudget()||[]).filter(function(x){ return x.id===c.ligneBudget; })[0];
    if(lb) fait(g,'Imputation budgétaire',libelleLigneBudget(lb),true);
    if(c.penalite>0) fait(g,'Pénalité de retard estimée',montantDevise(c.penalite,c.devise));
  }

  function fiche(c){
    enteteCommande(c);
    var modifiable = can('commande.manage') && (c.statut==='brouillon' || c.statut==='rejete');
    if(c.rejet && c.statut==='rejete'){ var w=add(corps,'div','warn'); w.style.marginTop='18px'; add(w,'strong',null,'Rejetée ('+c.rejet.role+', '+c.rejet.at+') : '); w.appendChild(document.createTextNode(c.rejet.motif)); }
    if(c.annulation){ var wa=add(corps,'div','warn'); wa.style.marginTop='18px'; add(wa,'strong',null,'Annulée le '+c.annulation.at+' : '); wa.appendChild(document.createTextNode(c.annulation.motif)); }
    if(modifiable) brouillon(c); else documentCommande(c);
    if(vueTitulaireCommande()){ executionTitulaire(c); return; } // le titulaire : son exécution, sans le circuit interne
    circuitCommande(c);
    actions(c);
    avenants(c);
    if(c.numero && c.statut!=='annulee'){ suiviTitulaire(c); receptions(c); }
    var kh=add(corps,'div','card'); kh.style.marginTop='18px';
    add(kh,'div','panel-head','Historique');
    var bh=add(kh,'div','pad');
    c.historique.slice().reverse().forEach(function(x){ var row=add(bh,'div','docline'); var lf=add(row,'div'); add(lf,'div',null,x.action); add(lf,'div','muted',x.who); add(row,'span','chip c-grey',x.t); });
  }

  /* Brouillon : lignes, jalons, date de livraison, réceptionnaire. */
  function brouillon(c){
    var k=add(corps,'div','card'); k.style.marginTop='18px';
    add(k,'div','panel-head','Brouillon — '+c.titulaire.nom+' ('+c.procedure.ref+')');
    var b=add(k,'div','pad');
    var lignes=JSON.parse(JSON.stringify(c.lignes)), jalons=JSON.parse(JSON.stringify(c.jalons));
    var tl=add(b,'table','tbl'); tl.style.width='100%';
    var hr=add(add(tl,'thead'),'tr'); ['Désignation','Quantité','Unité','Prix unitaire ('+c.devise+')',''].forEach(function(t){ add(hr,'th',null,t); });
    var tb=add(tl,'tbody');
    function ligne(lg,i){
      var tr=add(tb,'tr');
      var cell=function(prop,type,larg){ var td=add(tr,'td'); var i_=add(td,'input'); i_.type=type; i_.value=lg[prop]; i_.style.width=larg; i_.setAttribute('aria-label',prop+' ligne '+(i+1)); fk(i_,'cmd-l'+i+'-'+prop); i_.addEventListener('input',function(){ lg[prop]= type==='number'?Number(i_.value):i_.value; totalTxt(); }); };
      cell('designation','text','100%'); cell('quantite','number','90px'); cell('unite','text','90px'); cell('prixUnitaire','number','150px');
      var td=add(tr,'td'); var x=add(td,'button','icon-btn','×'); x.setAttribute('aria-label','Supprimer la ligne '+(i+1)); x.disabled=lignes.length<=1;
      x.addEventListener('click',function(){ lignes.splice(i,1); redessiner(); });
    }
    function redessiner(){ tb.textContent=''; lignes.forEach(ligne); totalTxt(); }
    var tot=add(b,'p',null,''); tot.style.fontWeight='600';
    function totalTxt(){ var t=lignes.reduce(function(s,x){ return s+Number(x.quantite||0)*Number(x.prixUnitaire||0); },0); tot.textContent='Total : '+montantDevise(t,c.devise)+' — montant de l’offre retenue : '+montantDevise(c.montantOffre,c.devise); }
    var al=add(b,'button','btn btn-ghost btn-sm','+ Ajouter une ligne'); fk(al,'cmd-add');
    al.addEventListener('click',function(){ lignes.push({designation:'',quantite:1,unite:'unité',prixUnitaire:0}); redessiner(); });
    redessiner();

    add(b,'h3',null,'Jalons de paiement').style.marginTop='18px';
    var bj=add(b,'div');
    function dessinerJalons(){
      bj.textContent='';
      jalons.forEach(function(j,i){
        var row=add(bj,'div','docline');
        var li=add(row,'input'); li.type='text'; li.value=j.libelle; li.style.flex='1 1 240px'; li.setAttribute('aria-label','Jalon '+(i+1)); fk(li,'cmd-j'+i);
        li.addEventListener('input',function(){ j.libelle=li.value; });
        var pc=add(row,'input'); pc.type='number'; pc.value=j.pourcentage; pc.style.width='90px'; pc.setAttribute('aria-label','Pourcentage du jalon '+(i+1)); fk(pc,'cmd-jp'+i);
        pc.addEventListener('input',function(){ j.pourcentage=Number(pc.value); });
        add(row,'span','muted','%');
      });
    }
    dessinerJalons();

    var f=add(b,'div','frm'); f.style.marginTop='14px';
    var w1=add(f,'div'); add(w1,'label',null,'Livraison prévue le').setAttribute('for','cmd-date');
    var dl=add(w1,'input'); dl.type='date'; dl.id='cmd-date'; dl.value=c.dateLivraison; fk(dl,'cmd-date');
    var w2=add(f,'div'); add(w2,'label',null,'Réceptionnaire').setAttribute('for','cmd-recep');
    var rs=add(w2,'select'); rs.id='cmd-recep'; fk(rs,'cmd-recep');
    (state.users||[]).filter(function(u){ return u.role!=='soum'; }).forEach(function(u){ var o=add(rs,'option',null,u.nom+' — '+roleLab(u.role)); o.value=u.id; });
    rs.value=c.receptionnaire.id;
    var ligneBudget=c.ligneBudget||null;
    choixLigneBudget(f,'cmd-ligne',ligneBudget,function(v){ ligneBudget=v; });
    var cd=c.conditions||{};
    add(b,'p','muted','Conditions reprises du cahier des charges : pénalité de retard de '+cd.penaliteParJour+' ‰ par jour, plafonnée à '+cd.plafondPenalite+' % ; garantie de '+cd.garantieMois+' mois ; avance de démarrage de '+cd.avance+' % ; TVA '+cd.tva+' %.').style.marginTop='10px';

    var foot=piedFen;
    add(foot,'span','muted','Le brouillon n’a aucune valeur d’engagement tant qu’il n’est pas émis.');
    var be=add(foot,'button','btn btn-ghost','Enregistrer'); fk(be,'cmd-enr');
    var saisie=function(){ return { lignes:lignes, jalons:jalons, dateLivraison:dl.value, receptionnaire:rs.value, ligneBudget:ligneBudget||'' }; };
    be.addEventListener('click',function(){ agir('PUT',enc(c.id),saisie(),'Brouillon enregistré.'); });
    var bs=add(foot,'button','btn btn-primary','Soumettre à validation'); fk(bs,'cmd-soum');
    bs.addEventListener('click',function(){
      MP.api('PUT','/api/commandes/'+enc(c.id),saisie()).then(function(){ return agir('POST',enc(c.id)+'/soumettre',{},'Commande soumise.'); })
        .catch(function(e){ toast(e.message); });
    });
  }

  /* Document : la pièce telle qu'elle est (ou sera) émise ; imprimable et enregistrable en PDF depuis le navigateur. */
  function documentCommande(c){
    var k=add(corps,'div','card pad bc-doc doc-imprimable'); k.id='bc-doc'; k.style.marginTop='18px';
    var t=add(k,'div'); t.style.cssText='display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap';
    var g=add(t,'div'); add(g,'strong',null,(c.emetteur||state.org||{}).nom||''); add(g,'div','muted',[(c.emetteur||state.org||{}).ville,(c.emetteur||state.org||{}).pays].filter(Boolean).join(' · '));
    var d=add(t,'div'); d.style.textAlign='right';
    add(d,'h2',null, c.numero ? 'Bon de commande '+c.numero : 'Projet de bon de commande');
    add(d,'div','muted', c.emiseLe ? 'Émis le '+c.emiseLe+(c.emisePar?' par '+c.emisePar.nom:'') : 'Non émis : sans valeur d’engagement');
    add(k,'p',null,'Titulaire : '+c.titulaire.nom+(c.titulaire.pays?' ('+c.titulaire.pays+')':'')+' — procédure '+c.procedure.ref+' : '+c.procedure.objet);
    var tl=add(k,'table'); var hr=add(add(tl,'thead'),'tr');
    [['Désignation',''],['Quantité','num'],['Unité',''],['Prix unitaire','num'],['Montant','num']].forEach(function(x){ add(hr,'th',x[1],x[0]); });
    var tb=add(tl,'tbody');
    c.lignes.forEach(function(lg){ var tr=add(tb,'tr'); add(tr,'td',null,lg.designation); add(tr,'td','num',String(lg.quantite)); add(tr,'td',null,lg.unite); add(tr,'td','num',sep(lg.prixUnitaire)); add(tr,'td','num',sep(lg.quantite*lg.prixUnitaire)); });
    var tf=add(add(tl,'tfoot'),'tr'); add(tf,'td',null,'Total hors taxes ('+c.devise+')').colSpan=4; add(tf,'td','num',sep(c.total)).style.fontWeight='700';
    add(k,'p',null,'Livraison prévue le '+c.dateLivraison+' · réceptionnaire : '+c.receptionnaire.nom+'.');
    var lb=c.ligneBudget && (situationBudget()||[]).filter(function(x){ return x.id===c.ligneBudget; })[0];
    if(lb) add(k,'p',null,'Imputation budgétaire : '+libelleLigneBudget(lb)+'.');
    add(k,'p',null,'Jalons de paiement : '+c.jalons.map(function(j){ return j.libelle+' '+j.pourcentage+' %'; }).join(' · ')+'.');
    var cd=c.conditions||{};
    add(k,'p','muted','Pénalité de retard : '+cd.penaliteParJour+' ‰ du montant par jour calendaire, plafonnée à '+cd.plafondPenalite+' %. Garantie : '+cd.garantieMois+' mois. TVA applicable : '+cd.tva+' %. Conditions générales : cahier des charges de la procédure '+c.procedure.ref+'.');
    var emis=(c.avenants||[]).filter(function(a){ return a.statut==='emis'; });
    if(emis.length) add(k,'p',null,'Version en vigueur : modifiée par '+emis.map(function(a){ return 'l’avenant '+a.numero+' du '+a.emisLe; }).join(', ')+'.');
    if(c.empreinte) add(k,'div','bc-empreinte','Empreinte SHA-256 du document émis : '+c.empreinte);
    emis.forEach(function(a){ add(k,'div','bc-empreinte','Empreinte SHA-256 de l’avenant '+a.numero+' : '+a.empreinte); });
    var pr=add(k,'div','no-print'); pr.style.marginTop='12px';
    boutonIcone(pr,'printer','Imprimer ou enregistrer en PDF',function(){ window.print(); },'cmd-print');
  }

  function circuitCommande(c){
    if(!c.circuit || !c.circuit.length) return;
    var k=add(corps,'div','card'); k.style.marginTop='18px';
    add(k,'div','panel-head','Circuit de validation — '+MPCircuits.nbRequises(c.circuit)+' niveau(x) requis');
    var b=add(k,'div','pad');
    var fp = c.statut==='validation' ? MPCircuits.prochaine(c.circuit) : -1;
    c.circuit.forEach(function(e,i){
      var row=add(b,'div','stepline');
      add(row,'div','stepnum '+(e.done?'done':(i===fp?'now':'')), e.done?'✓':String(i+1));
      var d=add(row,'div'); d.style.flex='1 1 auto'; add(d,'strong',null,e.role); add(d,'div','muted',e.who||'');
      if(Number(e.seuil)>0) add(d,'div','muted','à partir de '+xof(Number(e.seuil)));
      if(e.done){ add(row,'span','chip c-green','Validé le '+e.at); parQui(d,e); }
      else if(!MPCircuits.requise(e)) add(row,'span','chip c-grey','Non requis pour ce montant');
      else if(i===fp && can('roles.edit') && !can('commande.approve')) suppleanceNiveau(row,'commande',c.id,i,e,'Commande '+(c.numero||c.id));
      else if(i===fp && can('commande.approve')){
        suppleanceNiveau(row,'commande',c.id,i,e,'Commande '+(c.numero||c.id));
        var ba=add(row,'button','btn btn-primary btn-sm','Valider'); fk(ba,'cmd-val-'+i);
        ba.addEventListener('click',function(){ ask('Cette validation engage l’organisation pour '+montantDevise(c.total,c.devise)+'.',function(){ agir('POST',enc(c.id)+'/approbations/'+i,{},'Commande validée au niveau « '+e.role+' ».'); },'Valider au titre « '+e.role+' » ?','Valider'); });
        var br=add(row,'button','btn btn-ghost btn-sm','Rejeter'); fk(br,'cmd-rej-'+i);
        br.addEventListener('click',function(){ demander('La commande retourne aux achats pour correction.',function(motif){ agir('POST',enc(c.id)+'/rejet',{motif:motif},'Commande rejetée.'); },'Rejeter la commande ?','Rejeter','Motif du rejet'); });
      } else add(row,'span','chip c-grey', i===fp?'En attente':'À venir');
    });
  }

  function actions(c){
    if(!can('commande.manage')) return;
    var foot=null;
    function barre(){ if(!foot){ foot=add(corps,'div','note'); foot.style.cssText='margin-top:18px;display:flex;gap:10px;align-items:center;flex-wrap:wrap'; } return foot; }
    if(c.statut==='validee'){
      var be=add(barre(),'button','btn btn-primary','Émettre le bon de commande'); fk(be,'cmd-emettre');
      be.addEventListener('click',function(){ ask('Le serveur attribue le numéro et scelle le document : il ne pourra plus être modifié. Le titulaire le verra dans son portail.',function(){ agir('POST',enc(c.id)+'/emettre',{},'Bon de commande émis.'); },'Émettre le bon de commande ?','Émettre'); });
    }
    if(c.statut!=='annulee' && !c.receptions.length){
      var ba=add(barre(),'button','btn btn-ghost btn-sm','Annuler la commande'); fk(ba,'cmd-annuler');
      ba.addEventListener('click',function(){ demander(c.numero ? 'Le numéro '+c.numero+' reste attribué : la numérotation ne comporte pas de trou.' : 'Le brouillon est abandonné.',function(motif){ agir('POST',enc(c.id)+'/annuler',{motif:motif},'Commande annulée.'); },'Annuler la commande ?','Annuler la commande','Motif'); });
    }
  }

  /* Avenants : proposés par les achats, validés par le même circuit, émis sous le numéro de la commande suivi de -An. */
  function avenants(c){
    var liste=c.avenants||[], ouvert=liste.some(function(a){ return a.statut==='validation' || a.statut==='validee'; });
    var possible = can('commande.manage') && ['emise','en_reception','receptionnee'].indexOf(c.statut)>=0 && !ouvert;
    if(!liste.length && !possible) return;
    var k=add(corps,'div','card'); k.style.marginTop='18px';
    add(k,'div','panel-head','Avenants');
    var b=add(k,'div','pad');
    var ST={ validation:['En validation','c-amber'], validee:['Validé, à émettre','c-teal'], emis:['Émis','c-green'], rejete:['Rejeté','c-red'] };
    liste.slice().reverse().forEach(function(a){
      var row=add(b,'div','docline'); var lf=add(row,'div'); lf.style.flex='1 1 280px';
      add(lf,'strong',null,(a.numero||'Avenant n° '+a.n)+' — '+montantDevise(a.ancienTotal,c.devise)+' → '+montantDevise(a.nouveauTotal,c.devise));
      add(lf,'div','muted','Motif : '+a.motif+(a.rejet?' · rejeté ('+a.rejet.role+') : '+a.rejet.motif:'')+' · livraison prévue le '+a.dateLivraison);
      var st=ST[a.statut]||[a.statut,'c-grey']; add(row,'span','chip '+st[1],st[0]);
      if(a.statut==='validation' && can('commande.approve')){
        var i=MPCircuits.prochaine(a.circuit), e=a.circuit[i];
        suppleanceNiveau(row,'avenant',c.id+'#'+a.n,i,e,'Commande '+(c.numero||c.id)+', avenant n° '+a.n);
        var bv=add(row,'button','btn btn-primary btn-sm','Valider ('+e.role+')'); fk(bv,'av-val-'+a.n);
        bv.addEventListener('click',function(){ ask('L’avenant porte la commande à '+montantDevise(a.nouveauTotal,c.devise)+'.',function(){ agir('POST',enc(c.id)+'/avenants/'+a.n+'/approbations/'+i,{},'Avenant validé.'); },'Valider l’avenant n° '+a.n+' ?','Valider'); });
        var br=add(row,'button','btn btn-ghost btn-sm','Rejeter'); fk(br,'av-rej-'+a.n);
        br.addEventListener('click',function(){ demander('L’avenant est abandonné ; un autre pourra être proposé.',function(motif){ agir('POST',enc(c.id)+'/avenants/'+a.n+'/rejet',{motif:motif},'Avenant rejeté.'); },'Rejeter l’avenant n° '+a.n+' ?','Rejeter','Motif du rejet'); });
      }
      if(a.statut==='validee' && can('commande.manage')){
        var be=add(row,'button','btn btn-primary btn-sm','Émettre l’avenant'); fk(be,'av-emettre-'+a.n);
        be.addEventListener('click',function(){ ask('Le serveur attribue le numéro '+c.numero+'-A'+a.n+' et scelle l’avenant ; la commande passe à sa nouvelle version.',function(){ agir('POST',enc(c.id)+'/avenants/'+a.n+'/emettre',{},'Avenant émis.'); },'Émettre l’avenant ?','Émettre'); });
      }
    });
    if(!possible) return;
    var lignes=JSON.parse(JSON.stringify(c.lignes)), recu=c.rapprochement.map(function(x){ return x.recu; });
    var ed=add(k,'div','pad'); ed.style.borderTop='1px solid var(--color-border)';
    add(ed,'h3',null,'Proposer un avenant');
    var tl=add(ed,'table','tbl'); tl.style.width='100%';
    var hr=add(add(tl,'thead'),'tr'); ['Désignation','Quantité','Unité','Prix unitaire ('+c.devise+')','Déjà reçu'].forEach(function(t){ add(hr,'th',null,t); });
    var tb=add(tl,'tbody');
    function dessiner(){
      tb.textContent='';
      lignes.forEach(function(lg,i){
        var tr=add(tb,'tr');
        [['designation','text','100%'],['quantite','number','90px'],['unite','text','90px'],['prixUnitaire','number','150px']].forEach(function(x){
          var td=add(tr,'td'); var inp=add(td,'input'); inp.type=x[1]; inp.value=lg[x[0]]; inp.style.width=x[2];
          inp.setAttribute('aria-label',x[0]+' ligne '+(i+1)); fk(inp,'av-l'+i+'-'+x[0]);
          if(x[0]==='quantite' && i<recu.length) inp.min=String(recu[i]);
          inp.addEventListener('input',function(){ lg[x[0]] = x[1]==='number' ? Number(inp.value) : inp.value; });
        });
        add(tr,'td','muted', i<recu.length ? String(recu[i]) : 'nouvelle ligne');
      });
    }
    dessiner();
    var al=add(ed,'button','btn btn-ghost btn-sm','+ Ajouter une ligne'); fk(al,'av-add');
    al.addEventListener('click',function(){ lignes.push({designation:'',quantite:1,unite:'unité',prixUnitaire:0}); dessiner(); });
    var f=add(ed,'div','frm'); f.style.marginTop='12px';
    var w1=add(f,'div'); add(w1,'label',null,'Nouvelle date de livraison').setAttribute('for','av-date');
    var dl=add(w1,'input'); dl.type='date'; dl.id='av-date'; dl.value=c.dateLivraison; fk(dl,'av-date');
    var w2=add(f,'div'); w2.style.gridColumn='1/-1'; add(w2,'label',null,'Motif de l’avenant').setAttribute('for','av-motif');
    var mo=add(w2,'textarea'); mo.id='av-motif'; mo.rows=2; mo.style.width='100%'; fk(mo,'av-motif');
    add(ed,'p','muted','Une ligne existante ne se supprime pas et sa quantité ne descend pas sous ce qui a déjà été reçu. Le nouveau total reste plafonné au montant de l’offre retenue.').style.marginTop='8px';
    var bp=add(ed,'button','btn btn-primary btn-sm','Proposer l’avenant'); fk(bp,'av-proposer');
    bp.addEventListener('click',function(){ agir('POST',enc(c.id)+'/avenants',{lignes:lignes, dateLivraison:dl.value, motif:mo.value},'Avenant proposé.'); });
  }

  /* Réceptions, rapprochement commandé / reçu, réserves, retard et pénalités. */
  function receptions(c){
    var k=add(corps,'div','card'); k.style.marginTop='18px';
    var ph=add(k,'div','panel-head'); add(ph,'span',null,'Réceptions');
    if(c.retard>0) add(ph,'span','chip c-red','Retard : '+c.retard+' jour(s) · pénalité '+montantDevise(c.penalite,c.devise));
    var b=add(k,'div','pad');
    var tl=add(b,'table','tbl'); tl.style.width='100%';
    var hr=add(add(tl,'thead'),'tr'); ['Ligne','Commandé','Reçu','Reste à livrer'].forEach(function(t){ add(hr,'th',null,t); });
    var tb=add(tl,'tbody');
    c.rapprochement.forEach(function(x){ var tr=add(tb,'tr'); add(tr,'td',null,x.designation); add(tr,'td',null,String(x.commande)); add(tr,'td',null,String(x.recu)); add(tr,'td',null,String(x.ecart)).style.fontWeight = x.ecart>0?'700':''; });
    var moi = c.receptionnaire.id===state.me;
    c.receptions.forEach(function(x){
      var row=add(b,'div','docline'); var lf=add(row,'div'); lf.style.flex='1 1 260px';
      add(lf,'strong',null,'Réception n° '+x.n+' du '+x.date+' — '+x.par.nom);
      add(lf,'div','muted','Quantités : '+x.quantites.join(' · ')+(x.reserves?' · réserves : '+x.reserves:''));
      if(x.levee) add(lf,'div','muted','Réserves levées le '+x.levee.t+' : '+x.levee.motif);
      if(x.reserves && !x.levee){
        add(row,'span','chip c-amber','Réserves ouvertes');
        if(moi){ var bl=add(row,'button','btn btn-ghost btn-sm','Lever les réserves'); fk(bl,'cmd-lever-'+x.n);
          bl.addEventListener('click',function(){ demander('Indiquez comment les réserves ont été levées.',function(motif){ agir('POST',enc(c.id)+'/receptions/'+x.n+'/levee',{motif:motif},'Réserves levées.'); },'Lever les réserves de la réception n° '+x.n+' ?','Lever','Constat'); }); }
      }
    });
    if(moi && (c.statut==='emise' || c.statut==='en_reception')){
      var annoncee=(c.livraisons||[]).filter(function(l){ return l.statut==='declaree'; })[0];
      add(b,'h3',null, annoncee ? 'Constater la livraison n° '+annoncee.n+' annoncée par le titulaire' : 'Constater une livraison').style.marginTop='14px';
      var champs=[];
      c.rapprochement.forEach(function(x,i){
        var w=add(b,'div','docline'); add(w,'div',null,x.designation+' — reste '+x.ecart+(annoncee?' · annoncé : '+annoncee.quantites[i]:''));
        var q=add(w,'input'); q.type='number'; q.min='0'; q.max=String(x.ecart); q.value=String(annoncee ? Math.min(annoncee.quantites[i],x.ecart) : x.ecart); q.style.width='110px'; q.setAttribute('aria-label','Quantité reçue — '+x.designation); fk(q,'cmd-q'+i);
        champs.push(q);
      });
      var lr=add(b,'label',null,'Réserves (facultatif)'); lr.setAttribute('for','cmd-reserves');
      var rv=add(b,'textarea'); rv.id='cmd-reserves'; rv.rows=2; rv.style.width='100%'; fk(rv,'cmd-reserves');
      var bc=add(b,'button','btn btn-primary btn-sm','Enregistrer la réception'); bc.style.marginTop='10px'; fk(bc,'cmd-recevoir');
      bc.addEventListener('click',function(){ agir('POST',enc(c.id)+'/receptions',{quantites:champs.map(function(q){ return Number(q.value); }), reserves:rv.value, livraison:annoncee?annoncee.n:null},'Réception enregistrée.'); });
    }
    if(c.receptionProvisoire) add(b,'p',null,'Réception provisoire le '+c.receptionProvisoire.date+'.'+(c.receptionDefinitive?' Réception définitive le '+c.receptionDefinitive.date+'.':'')).style.marginTop='10px';
    if(moi && c.statut==='receptionnee'){
      add(b,'h3',null,'Réception définitive et appréciation').style.marginTop='14px';
      var fq=add(b,'div','frm');
      var wq=add(fq,'div'); add(wq,'label',null,'Qualité de la prestation').setAttribute('for','cmd-qualite');
      var sq=add(wq,'select'); sq.id='cmd-qualite'; fk(sq,'cmd-qualite');
      [['','Choisir…'],['5','5 — Excellente'],['4','4 — Bonne'],['3','3 — Correcte'],['2','2 — Médiocre'],['1','1 — Insuffisante']].forEach(function(x){ add(sq,'option',null,x[1]).value=x[0]; });
      var wc=add(fq,'div'); wc.style.gridColumn='1/-1'; add(wc,'label',null,'Commentaire (facultatif)').setAttribute('for','cmd-commentaire');
      var tc=add(wc,'textarea'); tc.id='cmd-commentaire'; tc.rows=2; tc.style.width='100%'; fk(tc,'cmd-commentaire');
      add(b,'p','muted','Avec les délais, la conformité et la complétude des livraisons, cette appréciation forme la note du titulaire.').style.marginTop='8px';
      var bd=add(b,'button','btn btn-primary btn-sm','Prononcer la réception définitive'); fk(bd,'cmd-definitive'); bd.disabled=c.reservesOuvertes>0;
      if(c.reservesOuvertes) bd.title='Levez d\u2019abord les réserves ouvertes.';
      bd.addEventListener('click',function(){
        if(!sq.value){ toast('Choisissez l\u2019appréciation de la qualité.'); sq.focus(); return; }
        ask('La réception définitive clôt l\u2019exécution de la commande dans Marché+ et évalue le titulaire.',function(){
          agir('POST',enc(c.id)+'/definitive',{qualite:Number(sq.value), commentaire:tc.value},'Réception définitive prononcée.').then(function(r){
            var ep=r && r.evaluationPartenaire;
            if(ep && ep.alerte) toast('Alerte : la note du titulaire ('+ep.moyenne+'/100) passe sous le seuil de '+ep.seuil+'.');
          });
        },'Prononcer la réception définitive ?','Prononcer');
      });
    }
    if(c.evaluation){
      var ev=c.evaluation, ke=add(b,'div','note'); ke.style.marginTop='12px';
      add(ke,'strong',null,'Évaluation du titulaire : '+ev.note+'/100. ');
      ke.appendChild(document.createTextNode('Délais '+ev.scores.delais+' · conformité '+ev.scores.conformite+' · complétude '+ev.scores.completude+' · qualité '+ev.scores.qualite+
        ' (poids '+ev.poids.delais+'/'+ev.poids.conformite+'/'+ev.poids.completude+'/'+ev.poids.qualite+')'+(ev.commentaire?' — « '+ev.commentaire+' »':'')+'.'));
    }
    if(!moi) add(b,'p','muted','Réceptionnaire désigné : '+c.receptionnaire.nom+'. Seul le réceptionnaire constate les livraisons.').style.marginTop='10px';
  }

  /* Côté achats : accusé du titulaire, livraisons qu'il a déclarées, factures à rapprocher et à décider. */
  function suiviTitulaire(c){
    var liv=c.livraisons||[], fac=c.factures||[];
    var k=add(corps,'div','card'); k.style.marginTop='18px';
    var ph=add(k,'div','panel-head'); add(ph,'span',null,'Titulaire : livraisons et factures');
    chipCellule(ph, c.accuse ? 'Bon de commande accepté le '+c.accuse.t : 'Pas encore accusé par le titulaire', c.accuse ? 'c-green' : 'c-amber');
    var b=add(k,'div','pad');
    if(!liv.length && !fac.length){ add(b,'p','muted','Le titulaire n’a encore déclaré aucune livraison ni déposé de facture.'); return; }
    liv.forEach(function(l){
      var row=add(b,'div','docline'), lf=add(row,'div'); lf.style.flex='1 1 260px';
      add(lf,'strong',null,'Livraison n° '+l.n+' du '+l.date.split('-').reverse().join('/')+' — déclarée par '+l.par.nom);
      add(lf,'div','muted','Quantités : '+l.quantites.join(' · ')+(l.commentaire?' · '+l.commentaire:''));
      lienPieceExecution(lf,l.bon);
      chipCellule(row, l.statut==='constatee' ? 'Constatée (réception n° '+l.reception+')' : 'À constater', l.statut==='constatee'?'c-green':'c-amber');
    });
    var dejaAccepte=0;
    fac.forEach(function(f){
      var row=add(b,'div','docline'), lf=add(row,'div'); lf.style.flex='1 1 300px';
      add(lf,'strong',null,'Facture '+f.numero+' du '+f.date.split('-').reverse().join('/')+' — '+montantDevise(f.montantHT,c.devise)+' HT ('+montantDevise(f.montantTTC,c.devise)+' TTC)');
      var ecart=Math.round(f.montantHT-f.attendu);
      add(lf,'div','muted','Jalon « '+f.jalonLib+' » : attendu '+montantDevise(f.attendu,c.devise)+' HT'+(ecart ? ' · écart '+(ecart>0?'+':'')+montantDevise(ecart,c.devise) : ' · conforme'));
      if(f.decision && f.decision.motif) add(lf,'div','muted','Motif : '+f.decision.motif);
      lienPieceExecution(lf,f.fichier);
      var st=STATUTS_FACTURE[f.statut]||[f.statut,'c-grey']; chipCellule(row,st[0],st[1]);
      if(ecart && f.statut==='deposee') chipCellule(row,'Écart avec le jalon','c-red');
      if(f.statut==='acceptee') dejaAccepte+=f.montantHT;
      if(f.statut==='deposee' && can('commande.manage')){
        var ba=add(row,'button','btn btn-primary btn-sm','Accepter pour paiement'); fk(ba,'fac-ok-'+f.n);
        if(!c.receptions.length){ ba.disabled=true; ba.title='Aucune réception constatée : pas de paiement sans service fait.'; }
        ba.addEventListener('click',function(){ ask('La facture '+f.numero+' est transmise pour paiement ('+montantDevise(f.montantTTC,c.devise)+' TTC).',function(){ agir('POST',enc(c.id)+'/factures/'+f.n+'/decision',{decision:'acceptee'},'Facture acceptée pour paiement.'); },'Accepter la facture ?','Accepter'); });
        var br=add(row,'button','btn btn-ghost btn-sm','Rejeter'); fk(br,'fac-rej-'+f.n);
        br.addEventListener('click',function(){ demander('Le titulaire est prévenu du motif et peut déposer une facture corrigée.',function(motif){ agir('POST',enc(c.id)+'/factures/'+f.n+'/decision',{decision:'rejetee',motif:motif},'Facture rejetée.'); },'Rejeter la facture '+f.numero+' ?','Rejeter'); });
      }
    });
    if(fac.length) add(b,'p','muted','Accepté pour paiement : '+montantDevise(dejaAccepte,c.devise)+' HT sur '+montantDevise(c.total,c.devise)+'. Le paiement est fait dans l’ERP (export « Factures acceptées »).').style.marginTop='10px';
    if(can('commande.manage')){ var ex=add(b,'a','btn btn-ghost btn-sm','Exporter les factures acceptées (CSV)'); ex.href='/api/commandes/factures.csv'; ex.setAttribute('download','factures.csv'); }
  }

  /* Côté titulaire : accusé de réception, livraisons déclarées, factures déposées. */
  function executionTitulaire(c){
    var enCours=['emise','en_reception','receptionnee','cloturee'].indexOf(c.statut)>=0;
    var k=add(corps,'div','card'); k.style.marginTop='18px';
    var ph=add(k,'div','panel-head'); add(ph,'span',null,'Votre exécution');
    var b=add(k,'div','pad');
    if(!c.accuse && enCours){
      var na=add(b,'div','note'); add(na,'strong',null,'Bon de commande à accepter. ');
      na.appendChild(document.createTextNode('Accusez-en réception pour confirmer à l’acheteur que vous l’exécutez aux conditions indiquées.'));
      var acc=add(b,'button','btn btn-primary btn-sm','Accuser réception du bon de commande'); acc.style.marginTop='10px'; fk(acc,'cmd-accuse');
      acc.addEventListener('click',function(){ agir('POST',enc(c.id)+'/accuse',{},'Bon de commande accepté.'); });
    } else if(c.accuse) chipCellule(ph,'Accepté le '+c.accuse.t,'c-green');
    (c.avenants||[]).forEach(function(a){ add(b,'p','muted','Avenant '+a.numero+' émis le '+a.emisLe+' : nouveau total '+montantDevise(a.nouveauTotal,c.devise)+' — '+a.motif); });

    /* Livraisons */
    add(b,'h3',null,'Livraisons').style.marginTop='14px';
    var liv=c.livraisons||[];
    if(!liv.length) add(b,'p','muted','Aucune livraison déclarée.');
    liv.forEach(function(l){
      var row=add(b,'div','docline'), lf=add(row,'div'); lf.style.flex='1 1 260px';
      add(lf,'strong',null,'Livraison n° '+l.n+' du '+l.date.split('-').reverse().join('/'));
      add(lf,'div','muted','Quantités : '+l.quantites.join(' · ')+(l.commentaire?' · '+l.commentaire:''));
      lienPieceExecution(lf,l.bon);
      chipCellule(row, l.statut==='constatee' ? 'Constatée par l’acheteur' : 'En attente de constat', l.statut==='constatee'?'c-green':'c-amber');
    });
    if(c.statut==='emise' || c.statut==='en_reception'){
      var fl=add(b,'details','echange-nouvelle'); add(fl,'summary',null,'Déclarer une livraison');
      var qs=[];
      c.rapprochement.forEach(function(x,i){
        var w=add(fl,'div','docline'); add(w,'div',null,x.designation+' — reste à livrer '+x.ecart);
        var q=add(w,'input'); q.type='number'; q.min='0'; q.max=String(x.ecart); q.value=String(x.ecart); q.style.width='110px';
        q.setAttribute('aria-label','Quantité livrée — '+x.designation); fk(q,'liv-q'+i); qs.push(q);
      });
      var fd=add(fl,'div','frm'); fd.style.marginTop='10px';
      var wd=add(fd,'div'); add(wd,'label',null,'Date de livraison').setAttribute('for','liv-date');
      var dd=add(wd,'input'); dd.type='date'; dd.id='liv-date'; dd.value=new Date().toISOString().slice(0,10); fk(dd,'liv-date');
      var wb=add(fd,'div'); add(wb,'label',null,'Bon de livraison (PDF ou image)').setAttribute('for','liv-bon');
      var fb=add(wb,'input'); fb.type='file'; fb.id='liv-bon'; fb.accept='.pdf,.png,.jpg,.jpeg';
      var wc=add(fl,'div'); add(wc,'label',null,'Commentaire (facultatif)').setAttribute('for','liv-com');
      var tc=add(wc,'textarea'); tc.id='liv-com'; tc.rows=2; tc.style.width='100%'; fk(tc,'liv-com');
      var gl=add(add(fl,'div','echange-actions'),'button','btn btn-primary btn-sm','Déclarer la livraison'); fk(gl,'liv-go');
      gl.addEventListener('click',function(){
        gl.disabled=true;
        var f=fb.files && fb.files[0];
        (f ? MP.upload('/api/commandes/'+enc(c.id)+'/fichiers?doc=bon-livraison',f) : Promise.resolve(null)).then(function(p){
          return agir('POST',enc(c.id)+'/livraisons',{ quantites:qs.map(function(q){ return Number(q.value); }), date:dd.value, bon:p?p.id:null, commentaire:tc.value },'Livraison déclarée : l’acheteur la constatera.');
        }).catch(function(e){ gl.disabled=false; toast(e.message||'Envoi impossible.'); });
      });
    }

    /* Factures */
    add(b,'h3',null,'Factures').style.marginTop='18px';
    var fac=c.factures||[];
    if(!fac.length) add(b,'p','muted','Aucune facture déposée.');
    fac.forEach(function(f){
      var row=add(b,'div','docline'), lf=add(row,'div'); lf.style.flex='1 1 280px';
      add(lf,'strong',null,'Facture '+f.numero+' — '+montantDevise(f.montantHT,c.devise)+' HT');
      add(lf,'div','muted','Jalon « '+f.jalonLib+' » · déposée le '+f.deposee+(f.decision && f.decision.motif ? ' · motif du rejet : '+f.decision.motif : ''));
      lienPieceExecution(lf,f.fichier);
      var st=STATUTS_FACTURE[f.statut]||[f.statut,'c-grey']; chipCellule(row, f.statut==='deposee'?'En cours d’examen':st[0], st[1]);
    });
    var actives=fac.filter(function(f){ return f.statut!=='rejetee'; }), libres=c.jalons.map(function(j,i){ return i; }).filter(function(i){ return !actives.some(function(f){ return f.jalon===i; }); });
    if(enCours && libres.length){
      var ff=add(b,'details','echange-nouvelle'); add(ff,'summary',null,'Déposer une facture');
      var fr=add(ff,'div','frm');
      var w1=add(fr,'div'); add(w1,'label',null,'Numéro de facture').setAttribute('for','fac-num');
      var nu=add(w1,'input'); nu.type='text'; nu.id='fac-num'; nu.maxLength=40; fk(nu,'fac-num');
      var w2=add(fr,'div'); add(w2,'label',null,'Date').setAttribute('for','fac-date');
      var da=add(w2,'input'); da.type='date'; da.id='fac-date'; da.value=new Date().toISOString().slice(0,10); fk(da,'fac-date');
      var w3=add(fr,'div'); add(w3,'label',null,'Jalon de paiement').setAttribute('for','fac-jalon');
      var sj=add(w3,'select'); sj.id='fac-jalon'; fk(sj,'fac-jalon');
      libres.forEach(function(i){ var j=c.jalons[i]; add(sj,'option',null,j.libelle+' — '+j.pourcentage+' % soit '+montantDevise(c.total*j.pourcentage/100,c.devise)+' HT').value=String(i); });
      var w4=add(fr,'div'); add(w4,'label',null,'Montant hors taxes ('+c.devise+')').setAttribute('for','fac-ht');
      var ht=add(w4,'input'); ht.type='number'; ht.id='fac-ht'; ht.min='0'; fk(ht,'fac-ht');
      var majHt=function(){ ht.value=String(Math.round(c.total*c.jalons[Number(sj.value)].pourcentage)/100); };
      majHt(); sj.addEventListener('change',majHt);
      var w5=add(fr,'div'); add(w5,'label',null,'Facture (PDF ou image)').setAttribute('for','fac-fichier');
      var fi=add(w5,'input'); fi.type='file'; fi.id='fac-fichier'; fi.accept='.pdf,.png,.jpg,.jpeg';
      var gf=add(add(ff,'div','echange-actions'),'button','btn btn-primary btn-sm','Déposer la facture'); fk(gf,'fac-go');
      add(gf.parentNode,'span','muted','TVA appliquée : '+((c.conditions||{}).tva||0)+' %.');
      gf.addEventListener('click',function(){
        var f=fi.files && fi.files[0];
        if(!nu.value.trim()){ toast('Indiquez le numéro de la facture.'); nu.focus(); return; }
        if(!f){ toast('Joignez la facture.'); return; }
        gf.disabled=true;
        MP.upload('/api/commandes/'+enc(c.id)+'/fichiers?doc=facture',f).then(function(p){
          return agir('POST',enc(c.id)+'/factures',{ numero:nu.value.trim(), date:da.value, montantHT:Number(ht.value), jalon:Number(sj.value), fichier:p.id },'Facture déposée.');
        }).catch(function(e){ gf.disabled=false; toast(e.message||'Envoi impossible.'); });
      });
    }
  }

  charger();
}
