/* Marché+ — Suppléance des valideurs absents.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   - Délégation : un titulaire (menu du compte, « Mes suppléances ») ou l'administration (Utilisateurs et accès ›
     Suppléances) désigne un suppléant pour une période et des circuits.
   - Affectation : sur un dossier bloqué, l'administration confie le niveau en attente à une personne nommée.
   Le serveur décide (server/suppleance.js, routes /api/suppleances) ; ces fonctions servent l'affichage. */
"use strict";

var TYPES_SUPPLEANCE = { attribution:'Attribution d’un appel d’offres', besoin:'Validation des besoins', commande:'Bons de commande et avenants', referencement:'Référencement des partenaires' };
var ETATS_DELEGATION = { en_cours:['En cours','c-green'], a_venir:['À venir','c-amber'], terminee:['Terminée','c-grey'], annulee:['Annulée','c-grey'] };
function dateFr(d){ return String(d||'').split('-').reverse().join('/'); }
function aujourdhuiIso(){ return new Date().toISOString().slice(0,10); }
function nomCompte(id){ var u=(state.users||[]).filter(function(x){ return x.id===id; })[0]; return u ? u.nom : (id||'—'); }

/* Suppléance de l'utilisateur connecté pour un dossier, au format de MPCircuits.controle (affichage seulement). */
function supClient(type, cible){
  var t = type==='avenant' ? 'commande' : type, j=aujourdhuiIso(), roles={}, affectes={}, moi=me();
  (state.delegations||[]).forEach(function(d){
    if(d.a!==state.me || d.annulee || d.du>j || d.au<j || (d.types||[]).indexOf(t)<0) return;
    var u=(state.users||[]).filter(function(x){ return x.id===d.de; })[0];
    if(u && u.role!==moi.role && !roles[u.role]) roles[u.role]={ id:u.id, nom:u.nom, du:d.du, au:d.au };
  });
  (state.affectations||[]).forEach(function(a){
    if(!a.annulee && a.a===state.me && a.type===type && a.cible===String(cible)) affectes[a.niveau]={ motif:a.motif, par:a.parNom };
  });
  return { roles:roles, affectes:affectes };
}
/* Affectation en cours d'un niveau de dossier (l'administration les voit toutes, chacun voit les siennes). */
function affectationDe(type, cible, niveau){
  return (state.affectations||[]).filter(function(a){ return !a.annulee && a.type===type && a.cible===String(cible) && a.niveau===niveau; })[0] || null;
}
/* « pour A. Diomandé (délégation) » / « sur affectation : motif ». */
function mentionPour(p){
  if(!p) return '';
  return p.via==='delegation' ? 'pour '+p.nom+' (délégation du '+dateFr(p.du)+' au '+dateFr(p.au)+')' : 'sur affectation'+(p.motif ? ' — '+p.motif : '');
}
/* Ligne « Par X, pour Y » sous un niveau franchi. */
function parQui(parent, e){
  if(!e || !e.by) return;
  var u=(state.users||[]).filter(function(x){ return x.id===e.by; })[0];
  if(!u) return; // compte inconnu de ce lecteur (prestataire) : rien à afficher
  add(parent,'div','muted','Par '+u.nom+(e.pour ? ', '+mentionPour(e.pour) : ''));
}
/* Pastille « Affecté à X » et bouton « Affecter » (administration) sur le niveau en attente d'un dossier. */
function suppleanceNiveau(parent, type, cible, niveau, etape, ref){
  var af=affectationDe(type, cible, niveau);
  if(af){ var ch=add(parent,'span','chip c-amber','Affecté à '+af.aNom); ch.title='Motif : '+af.motif+' — par '+af.parNom+', le '+af.le; }
  if(can('roles.edit')){
    var b=boutonIcone(parent,'users', af ? 'Changer l’affectation de ce niveau' : 'Affecter ce niveau à une autre personne', function(){ affecterNiveau(type, cible, niveau, etape, ref); }, 'affecter-'+type+'-'+niveau);
    b.setAttribute('data-consult','');
  }
}
function rechargerEtat(){
  return MP.api('GET',MP.url('/state')).then(function(p){ applyServer(p,false); render(); }).catch(function(){ render(); });
}

/* Fenêtre « Affecter le niveau » : la personne (habilitée à valider ce circuit) et le motif. */
function affecterNiveau(type, cible, niveau, etape, ref){
  var donnees=null, erreur=null;
  MP.api('GET','/api/suppleances').then(function(r){ donnees=r; dessinerFenetre(); }).catch(function(e){ erreur=e.message; dessinerFenetre(); });
  ouvrirFenetre('Affecter un niveau de validation', function(c,p){
    add(c,'p','muted', ref+' — niveau « '+etape.role+' »'+(etape.who?' ('+etape.who+')':'')+'.').style.marginBottom='12px';
    if(erreur){ add(c,'p','muted',erreur); return; }
    if(!donnees){ add(c,'p','muted','Chargement…'); return; }
    var t = type==='avenant' ? 'commande' : type;
    var candidats=donnees.comptes.filter(function(u){ return u.circuits.indexOf(t)>=0; });
    var d1=add(c,'div','fen-champ'); add(d1,'label','fen-lab','Confier ce niveau à').htmlFor='af-a';
    var sel=add(d1,'select'); sel.id='af-a'; fk(sel,'af-a');
    candidats.forEach(function(u){ add(sel,'option',null,u.nom+' — '+u.roleLab).value=u.id; });
    var d2=add(c,'div','fen-champ'); add(d2,'label','fen-lab','Motif').htmlFor='af-motif';
    var mo=add(d2,'textarea'); mo.id='af-motif'; mo.rows=3; mo.maxLength=300; mo.placeholder='Ex. Titulaire en mission jusqu’au 20/10, dossier urgent.'; fk(mo,'af-motif');
    add(c,'p','muted','Seules les personnes habilitées à valider ce circuit sont proposées. La personne choisie ne doit pas être déjà intervenue sur le dossier ; le serveur le vérifie. La décision portera la mention « sur affectation ».').style.marginTop='12px';
    var an=add(p,'button','btn btn-ghost','Annuler'); an.addEventListener('click',fermerFenetre);
    var ok=add(p,'button','btn btn-primary','Affecter'); fk(ok,'af-ok');
    ok.addEventListener('click',function(){
      if(!mo.value.trim()){ toast('Le motif est obligatoire.'); mo.focus(); return; }
      ok.disabled=true;
      MP.api('POST','/api/suppleances/affectations',{ type:type, cible:String(cible), niveau:niveau, a:sel.value, motif:mo.value.trim() })
        .then(function(r){ toast('Niveau « '+etape.role+' » confié à '+r.affectation.aNom+'.'); fermerFenetre(); return rechargerEtat(); })
        .catch(function(e){ toast(e.message); ok.disabled=false; });
    });
  });
}

/* Fenêtre « Nouvelle délégation ». titulaireFixe : l'utilisateur pour lui-même (menu du compte). */
function nouvelleDelegation(donnees, titulaireFixe, apres){
  ouvrirFenetre(titulaireFixe ? 'Me faire suppléer' : 'Nouvelle délégation', function(c,p){
    var g=add(c,'div','fen-grille');
    var de;
    if(!titulaireFixe){
      var d0=add(g,'div','fen-champ'); add(d0,'label','fen-lab','Titulaire absent').htmlFor='dl-de';
      de=add(d0,'select'); de.id='dl-de'; fk(de,'dl-de');
      donnees.comptes.forEach(function(u){ add(de,'option',null,u.nom+' — '+u.roleLab).value=u.id; });
    }
    var d1=add(g,'div','fen-champ'); add(d1,'label','fen-lab','Suppléant').htmlFor='dl-a';
    var sa=add(d1,'select'); sa.id='dl-a'; fk(sa,'dl-a');
    var d2=add(g,'div','fen-champ'); add(d2,'label','fen-lab','Du').htmlFor='dl-du';
    var du=add(d2,'input'); du.type='date'; du.id='dl-du'; du.value=aujourdhuiIso(); fk(du,'dl-du');
    var d3=add(g,'div','fen-champ'); add(d3,'label','fen-lab','Au').htmlFor='dl-au';
    var au=add(d3,'input'); au.type='date'; au.id='dl-au'; au.value=new Date(Date.now()+7*86400000).toISOString().slice(0,10); fk(au,'dl-au');
    var bloc=add(c,'div','fen-champ'); add(bloc,'div','fen-lab','Circuits délégués');
    var cases=add(bloc,'div','dl-circuits'), coches={};
    Object.keys(TYPES_SUPPLEANCE).forEach(function(t){
      var l=add(cases,'label','dl-circuit'); var x=add(l,'input'); x.type='checkbox'; x.value=t; fk(x,'dl-type-'+t);
      l.appendChild(document.createTextNode(TYPES_SUPPLEANCE[t])); coches[t]=x;
    });
    var d4=add(c,'div','fen-champ'); add(d4,'label','fen-lab','Motif (facultatif)').htmlFor='dl-motif';
    var mo=add(d4,'input'); mo.type='text'; mo.id='dl-motif'; mo.maxLength=300; mo.placeholder='Ex. Congés annuels'; fk(mo,'dl-motif');
    var aide=add(c,'p','muted'); aide.style.marginTop='12px';
    aide.textContent='Pendant la période, le suppléant valide à la place du titulaire les niveaux réservés à son rôle, pour les circuits cochés. Il doit déjà être habilité à valider ces circuits : la délégation transfère un niveau, pas une habilitation.';

    function titulaire(){ return titulaireFixe || de.value; }
    // suppléants possibles : un autre compte ; circuits proposés : ceux que le titulaire valide
    function maj(){
      var t=titulaire(), u=donnees.comptes.filter(function(x){ return x.id===t; })[0], valeur=sa.value;
      sa.textContent='';
      donnees.comptes.filter(function(x){ return x.id!==t; }).forEach(function(x){ add(sa,'option',null,x.nom+' — '+x.roleLab).value=x.id; });
      if(valeur) sa.value=valeur;
      Object.keys(coches).forEach(function(k){ var dispo=!u || u.circuits.indexOf(k)>=0; coches[k].parentNode.hidden=!dispo; if(!dispo) coches[k].checked=false; });
      majCoches();
    }
    // un circuit ne se coche que si le suppléant choisi peut le valider
    function majCoches(){
      var s=donnees.comptes.filter(function(x){ return x.id===sa.value; })[0];
      Object.keys(coches).forEach(function(k){
        var possible=!!s && s.circuits.indexOf(k)>=0;
        coches[k].disabled=!possible; if(!possible) coches[k].checked=false;
        coches[k].parentNode.title = possible ? '' : (s ? s.nom+' n’est pas habilité à valider ce circuit.' : '');
      });
      if(!Object.keys(coches).some(function(k){ return coches[k].checked; })) Object.keys(coches).forEach(function(k){ if(!coches[k].disabled && !coches[k].parentNode.hidden) coches[k].checked=true; });
    }
    if(de) de.addEventListener('change',maj);
    sa.addEventListener('change',majCoches);
    maj();

    var an=add(p,'button','btn btn-ghost','Annuler'); an.addEventListener('click',fermerFenetre);
    var ok=add(p,'button','btn btn-primary','Créer la délégation'); fk(ok,'dl-ok');
    ok.addEventListener('click',function(){
      var types=Object.keys(coches).filter(function(k){ return coches[k].checked; });
      if(!types.length){ toast('Cochez au moins un circuit.'); return; }
      ok.disabled=true;
      MP.api('POST','/api/suppleances/delegations',{ de:titulaire(), a:sa.value, du:du.value, au:au.value, types:types, motif:mo.value.trim() })
        .then(function(r){ toast(r.delegation.aNom+' supplée '+r.delegation.deNom+' du '+dateFr(r.delegation.du)+' au '+dateFr(r.delegation.au)+'.'); fermerFenetre(); return rechargerEtat(); })
        .then(function(){ if(apres) apres(); })
        .catch(function(e){ toast(e.message); ok.disabled=false; });
    });
  });
}
function annulerDelegation(d, apres){
  ask('La délégation de '+d.deNom+' à '+d.aNom+' prend fin immédiatement.', function(){
    MP.api('POST','/api/suppleances/delegations/'+encodeURIComponent(d.id)+'/annuler',{}).then(function(){ toast('Délégation terminée.'); return rechargerEtat(); })
      .then(function(){ if(apres) apres(); }).catch(function(e){ toast(e.message); });
  }, 'Mettre fin à cette délégation ?', 'Mettre fin');
}

/* ============ Utilisateurs et accès › Suppléances (administration) ============ */
function vSuppleances(m){
  if(!can('roles.edit')) return denyBox(m,'roles.edit');
  var h=add(m,'div','head'); add(add(h,'div'),'h1',null,'Utilisateurs et accès');
  var zone=add(m,'div'); add(zone,'p','muted','Chargement…');
  function charger(){
    MP.api('GET','/api/suppleances').then(function(r){
      zone.textContent='';
      tableau(zone,{ cle:'delegations', titre:'Délégations', lignes:r.delegations,
        vide:'Aucune délégation. Un titulaire absent désigne un suppléant pour une période ; vous pouvez aussi le faire pour lui.',
        colonnes:[
          {lab:'Titulaire', rendu:function(d,td){ add(td,'strong',null,d.deNom); }},
          {lab:'Suppléant', rendu:function(d,td){ add(td,'strong',null,d.aNom); }},
          {lab:'Période', rendu:function(d,td){ add(td,'span','nowrap','du '+dateFr(d.du)+' au '+dateFr(d.au)); }},
          {lab:'Circuits', rendu:function(d,td){ add(td,'div','dt-extrait',(d.types||[]).map(function(t){ return TYPES_SUPPLEANCE[t]||t; }).join(' · ')); }},
          {lab:'État', rendu:function(d,td){ var e=ETATS_DELEGATION[d.etat]||[d.etat,'c-grey']; chipCellule(td,e[0],e[1]); }}
        ],
        recherche:function(d){ return [d.deNom,d.aNom,d.motif].join(' '); },
        filtres:[{ lab:'État', options:Object.keys(ETATS_DELEGATION).map(function(k){ return [k,ETATS_DELEGATION[k][0]]; }), test:function(d,v){ return d.etat===v; } }],
        nouveau:{ lab:'Nouvelle délégation', action:function(){ nouvelleDelegation(r, null, charger); } },
        actions:function(d,td){
          boutonDetail(td,function(){ ouvrirFenetre('Délégation', function(c){
            grilleLecture(c,[['Titulaire',d.deNom],['Suppléant',d.aNom],['Du',dateFr(d.du)],['Au',dateFr(d.au)],['Créée par',d.parNom],['Le',d.le]]);
            champLecture(c,'Circuits',(d.types||[]).map(function(t){ return TYPES_SUPPLEANCE[t]||t; }).join(', '));
            if(d.motif) champLecture(c,'Motif',d.motif);
            if(d.annulee) champLecture(c,'Fin anticipée','Par '+d.annulee.parNom+', le '+d.annulee.le);
          }); },'dl-voir-'+d.id);
          if(d.etat==='en_cours' || d.etat==='a_venir') boutonIcone(td,'x','Mettre fin à la délégation',function(){ annulerDelegation(d, charger); },'dl-fin-'+d.id);
        }
      });
      tableau(zone,{ cle:'affectations', titre:'Dossiers affectés', lignes:r.affectations,
        vide:'Aucun dossier affecté. Sur un dossier bloqué, l’icône « Affecter » du niveau en attente le confie à une autre personne.',
        colonnes:[
          {lab:'Dossier', rendu:function(a,td){ add(td,'strong',null,a.ref); add(td,'div','muted','Niveau « '+a.role+' »'); }},
          {lab:'Confié à', val:function(a){ return a.aNom; }},
          {lab:'Motif', rendu:function(a,td){ add(td,'div','dt-extrait',a.motif); }},
          {lab:'Le', val:function(a){ return a.le; }},
          {lab:'État', rendu:function(a,td){ chipCellule(td, a.annulee ? (a.annulee.remplacee?'Remplacée':'Annulée') : 'Active', a.annulee ? 'c-grey' : 'c-green'); }}
        ],
        recherche:function(a){ return [a.ref,a.role,a.aNom,a.motif].join(' '); },
        actions:function(a,td){
          if(!a.annulee) boutonIcone(td,'x','Annuler l’affectation',function(){
            ask('Le niveau « '+a.role+' » de '+a.ref+' ne sera plus confié à '+a.aNom+'.', function(){
              MP.api('POST','/api/suppleances/affectations/'+encodeURIComponent(a.id)+'/annuler',{}).then(function(){ toast('Affectation annulée.'); return rechargerEtat(); }).catch(function(e){ toast(e.message); });
            }, 'Annuler cette affectation ?', 'Annuler l’affectation');
          },'af-fin-'+a.id);
        }
      });
    }).catch(function(e){ zone.textContent=''; add(zone,'p','muted',e.message); });
  }
  charger();
}

/* ============ Menu du compte › « Mes suppléances » (tout valideur) ============ */
function ouvrirMesSuppleances(){
  var donnees=null, erreur=null;
  function charger(){ MP.api('GET','/api/suppleances').then(function(r){ donnees=r; dessinerFenetre(); }).catch(function(e){ erreur=e.message; dessinerFenetre(); }); }
  charger();
  ouvrirFenetre('Mes suppléances', function(c,p){
    if(erreur){ add(c,'p','muted',erreur); return; }
    if(!donnees){ add(c,'p','muted','Chargement…'); return; }
    var moi=state.me, miennes=donnees.delegations.filter(function(d){ return d.de===moi; }), pourMoi=donnees.delegations.filter(function(d){ return d.a===moi; });
    function liste(titre, ds, vide, autre){
      var s=add(c,'div','fen-section'); add(s,'h3',null,titre);
      if(!ds.length){ add(s,'p','muted',vide); return; }
      var ul=add(s,'ul','fen-liste');
      ds.forEach(function(d){
        var li=add(ul,'li'); var t=add(li,'div');
        add(t,'strong',null,autre(d)); add(t,'div','muted','Du '+dateFr(d.du)+' au '+dateFr(d.au)+' — '+(d.types||[]).map(function(x){ return TYPES_SUPPLEANCE[x]||x; }).join(', '));
        var dr=add(li,'div'); dr.style.cssText='display:flex;gap:6px;align-items:center';
        var e=ETATS_DELEGATION[d.etat]||[d.etat,'c-grey']; chipCellule(dr,e[0],e[1]);
        if(d.etat==='en_cours'||d.etat==='a_venir') boutonIcone(dr,'x','Mettre fin',function(){ annulerDelegation(d, charger); },'ma-fin-'+d.id);
      });
    }
    liste('Qui me supplée', miennes, 'Personne ne vous supplée pour le moment.', function(d){ return d.aNom; });
    liste('Qui je supplée', pourMoi, 'Vous ne suppléez personne.', function(d){ return d.deNom; });
    c.firstChild.style.marginTop='0'; c.firstChild.style.paddingTop='0'; c.firstChild.style.borderTop='none';
    var ok=add(p,'button','btn btn-primary','Me faire suppléer'); fk(ok,'ma-nouvelle');
    ok.addEventListener('click',function(){ nouvelleDelegation(donnees, moi, null); });
  });
}
