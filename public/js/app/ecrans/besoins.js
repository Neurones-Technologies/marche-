/* Marché+ — Écran Demandes d'achat (module 2 : de l'intention à la publication).
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Les besoins appartiennent à l'organisation : ils se chargent par /api/besoins, hors de l'état de la procédure. */
"use strict";

var STATUTS_BESOIN = {
  brouillon: ['Brouillon','c-grey'], soumis: ['En validation','c-amber'], valide: ['Validé','c-teal'],
  rejete: ['Rejeté','c-red'], transforme: ['Procédure créée','c-green']
};
UI.besoin = null;

function vBesoins(m){
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Demandes d’achat');

  var zoneListe=add(m,'div'); add(zoneListe,'p','muted','Chargement…');
  var liste_=[], regles_=null;

  function charger(){
    MP.api('GET','/api/besoins').then(function(r){
      zoneListe.textContent='';
      liste_=(r.besoins||[]).slice().reverse(); regles_=r.regles;
      tableau(zoneListe,{ cle:'besoins', lignes:liste_,
        vide: can('besoin.create') ? 'Aucune demande d’achat : utilisez « Nouvelle demande ».' : 'Aucune demande d’achat n’a encore été exprimée.',
        colonnes:[
          {lab:'N°', val:function(b){ return b.id; }},
          {lab:'Objet', val:function(b){ return b.objet; }},
          {lab:'Demandeur', val:function(b){ return [b.parNom, b.service].filter(Boolean).join(' — '); }},
          {lab:'Budget estimé', num:true, val:function(b){ return xof(b.budget); }},
          {lab:'Type pressenti', val:function(b){ return b.typeLab || '—'; }},
          {lab:'Statut', rendu:function(b,td){ var st=STATUTS_BESOIN[b.statut]||[b.statut,'c-grey']; chipCellule(td,st[0],st[1]); }}
        ],
        recherche:function(b){ return [b.id, b.objet, b.parNom, b.service].join(' '); },
        filtres:[{ lab:'Statut', options:Object.keys(STATUTS_BESOIN).map(function(k){ return [k, STATUTS_BESOIN[k][0]]; }), test:function(b,v){ return b.statut===v; } }],
        nouveau: can('besoin.create') ? { lab:'Nouvelle demande', action:function(){ creation(r.regles); } } : null,
        actions:function(b,td){
          boutonCellule(td,'Ouvrir',function(){ ouvrirBesoin(b.id); },'bes-open-'+b.id);
        }
      });
      // adresse d'une demande (/demandes-achat/B-2026-0001) : sa fenêtre s'ouvre ; une fenêtre ouverte se met à jour
      if(UI.fenetre) dessinerFenetre();
      else if(UI.besoin && liste_.some(function(b){ return b.id===UI.besoin; })) ouvrirBesoin(UI.besoin);
    }).catch(function(e){ zoneListe.textContent=''; add(zoneListe,'p','muted',e.message); });
  }
  function agir(method, path, body, message){
    return MP.api(method,'/api/besoins'+path,body||{}).then(function(r){ if(message) toast(message); charger(); return r; })
      .catch(function(e){ toast(e.message); charger(); return null; });
  }

  /* Champs d'un besoin ; lecture seule hors brouillon ou rejet, et pour tout autre que le demandeur. */
  function champs(parent, b, editable, regles){
    var f=add(parent,'div','frm'), vals={};
    function champ(cle, lab, type){
      var w=add(f,'div'); var id='bes-'+cle+'-'+(b.id||'neuf');
      add(w,'label',null,lab).setAttribute('for',id);
      var i=add(w,type==='textarea'?'textarea':'input'); i.id=id; fk(i,id);
      if(type==='textarea'){ i.rows=2; w.style.gridColumn='1/-1'; } else i.type=type||'text';
      i.value = b[cle]!=null ? b[cle] : '';
      i.disabled=!editable;
      vals[cle]=i;
      return i;
    }
    champ('objet','Objet de la demande','textarea');
    champ('service','Service demandeur');
    var bu=champ('budget','Budget estimé (XOF)','number'); bu.min='0'; bu.step='100000';
    champ('dateSouhaitee','Date souhaitée','date');
    var ligneBudget=b.ligneBudget||'';
    choixLigneBudget(f,'bes-ligne-'+(b.id||'neuf'),ligneBudget,function(v){ ligneBudget=v||''; },!editable);
    champ('description','Description (quantités, spécifications)','textarea');
    champ('justification','Justification','textarea');
    var typ=add(parent,'p','muted'); typ.style.marginTop='10px';
    function majType(){
      var mt=Number(bu.value);
      typ.textContent = mt>0 && regles ? 'Type de procédure pressenti pour ce montant : '+MPProfils.typeProcedure(regles,mt).lab+' (seuils provisoires, à valider par un juriste).' : '';
    }
    if(editable){ bu.addEventListener('input',majType); majType(); } // une fois soumis, le type retenu est affiché à la place
    return function(){
      var o={}; Object.keys(vals).forEach(function(k){ o[k]= k==='budget' ? Number(vals[k].value) : vals[k].value.trim(); });
      o.ligneBudget=ligneBudget||null; return o;
    };
  }

  /* Fenêtre « Nouveau besoin ». */
  function creation(regles){
    ouvrirFenetre('Nouvelle demande d’achat', function(c,foot){
      var lire=champs(c,{},true,regles);
      add(foot,'span','muted','Enregistré en brouillon ; vous le soumettez ensuite à validation.');
      var an=add(foot,'button','btn btn-ghost','Annuler'); fk(an,'bes-annuler'); an.addEventListener('click',fermerFenetre);
      var go_=add(foot,'button','btn btn-primary','Enregistrer le brouillon'); fk(go_,'bes-creer');
      go_.addEventListener('click',function(){
        go_.disabled=true;
        MP.api('POST','/api/besoins',lire()).then(function(r){ toast('Demande '+r.besoin.id+' enregistrée.'); fermerFenetre(); UI.besoin=r.besoin.id; charger(); })
          .catch(function(e){ toast(e.message); go_.disabled=false; });
      });
    }, { large:true });
  }

  /* Fenêtre d'une demande : en-tête (statut, montant, type), faits ou formulaire, circuit de validation, création de
     la procédure, historique. Les actions du demandeur sont dans le pied. */
  function ouvrirBesoin(id){
    UI.besoin=id; majUrl();
    ouvrirFenetre(function(){ return 'Demande '+id; }, function(c,pied){
      var b=liste_.filter(function(x){ return x.id===id; })[0]; if(!b) return false;
      corpsBesoin(c, pied, b, regles_);
    }, { large:true, fermer:function(){ UI.besoin=null; majUrl(); } });
  }

  /* Un fait de la fiche : libellé discret au-dessus de la valeur. */
  function fait(parent, lab, val, large){
    var w=add(parent,'div','fait'+(large?' fait-large':'')); add(w,'div','fait-k',lab);
    add(w,'div','fait-v',val || '—'); return w;
  }
  function texteFait(parent, lab, val){
    if(!val) return;
    var w=add(parent,'div','fait-texte'); add(w,'h4',null,lab); add(w,'p',null,val);
  }

  function corpsBesoin(c, pied, b, regles){
    var mien = b.par===state.me, editable = mien && (b.statut==='brouillon' || b.statut==='rejete');
    var st=STATUTS_BESOIN[b.statut]||[b.statut,'c-grey'];

    /* En-tête : statut, montant, type de procédure */
    var ch=add(c,'div','fen-chips');
    chipCellule(ch,st[0],st[1]);
    chipCellule(ch,xof(b.budget),'c-grey');
    if(b.typeLab) chipCellule(ch,b.typeLab,'c-teal');
    if(!editable) add(c,'h3','bes-objet',b.objet); // modifiable : l'objet est un champ du formulaire, juste dessous
    add(c,'p','muted bes-origine','Demandé par '+b.parNom+(b.service?' ('+b.service+')':'')+' le '+b.cree+'.');

    if(b.rejet){
      var w=add(c,'div','warn');
      add(w,'strong',null,'Rejeté au niveau « '+b.rejet.role+' », le '+b.rejet.at+'. ');
      w.appendChild(document.createTextNode('Motif : '+b.rejet.motif+(mien?' Corrigez la demande puis soumettez-la de nouveau.':'')));
    }

    /* Contenu : formulaire pour le demandeur, faits en lecture sinon */
    var lire=null;
    if(editable){
      var sf=add(c,'div','fen-section'); add(sf,'h3',null,'Votre demande');
      lire=champs(sf,b,true,regles);
    } else {
      var g=add(c,'div','faits');
      fait(g,'Budget estimé',xof(b.budget));
      fait(g,'Date souhaitée',(b.dateSouhaitee||'').replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$3/$2/$1'));
      fait(g,'Service demandeur',b.service);
      var ligne=((situationBudget()||[]).filter(function(l){ return l.id===b.ligneBudget; })[0]);
      fait(g,'Ligne budgétaire',ligne ? libelleLigneBudget(ligne) : (b.ligneBudget ? 'Ligne '+b.ligneBudget : ''),true);
      texteFait(c,'Description',b.description);
      texteFait(c,'Justification',b.justification);
    }

    /* Actions du demandeur */
    if(editable){
      add(pied,'span','muted','Une fois soumise, la demande ne se modifie plus, sauf rejet.');
      var be=add(pied,'button','btn btn-ghost','Enregistrer'); fk(be,'bes-enr-'+b.id);
      be.addEventListener('click',function(){ agir('PUT','/'+enc(b.id),lire(),'Demande '+b.id+' enregistrée.'); });
      var bs=add(pied,'button','btn btn-primary','Soumettre à validation'); fk(bs,'bes-soum-'+b.id);
      bs.addEventListener('click',function(){
        ask('Une fois soumise, la demande ne se modifie plus, sauf si elle est rejetée. Elle suit le circuit de validation de l’organisation.', function(){
          MP.api('PUT','/api/besoins/'+enc(b.id),lire())
            .then(function(){ return agir('POST','/'+enc(b.id)+'/soumettre',{},'Demande '+b.id+' soumise à validation.'); })
            .catch(function(e){ toast(e.message); });
        },'Soumettre la demande '+b.id+' ?','Soumettre');
      });
    } else {
      add(pied,'span','muted',b.statut==='transforme' ? 'Transformée en procédure '+(b.procedureRef||'')+'.' : 'Demande '+b.id);
      var fe=add(pied,'button','btn btn-ghost','Fermer'); fk(fe,'bes-fermer'); fe.addEventListener('click',fermerFenetre);
    }

    /* Circuit de validation */
    if(b.circuit && b.circuit.length && b.statut!=='brouillon'){
      var kc=add(c,'div','fen-section');
      add(kc,'h3',null,'Circuit de validation — '+MPCircuits.nbRequises(b.circuit)+' niveau(x) requis');
      var fp = b.statut==='soumis' ? MPCircuits.prochaine(b.circuit) : -1;
      b.circuit.forEach(function(e,i){
        var row=add(kc,'div','stepline');
        add(row,'div','stepnum '+(e.done?'done':(i===fp?'now':'')), e.done?'✓':String(i+1));
        var d=add(row,'div'); d.style.flex='1 1 auto';
        add(d,'strong',null,e.role); add(d,'div','muted',e.who||'');
        if(Number(e.seuil)>0) add(d,'div','muted','à partir de '+xof(Number(e.seuil)));
        if(e.done){ add(row,'span','chip c-green','Validé le '+e.at); parQui(d,e); }
        else if(!MPCircuits.requise(e)) add(row,'span','chip c-grey','Non requis pour ce montant');
        else if(i===fp && can('roles.edit') && !(can('besoin.approve') && !mien)) suppleanceNiveau(row,'besoin',b.id,i,e,'Demande '+b.id);
        else if(i===fp && can('besoin.approve') && !mien){
          suppleanceNiveau(row,'besoin',b.id,i,e,'Demande '+b.id);
          var ba=add(row,'button','btn btn-primary btn-sm','Valider'); fk(ba,'bes-val-'+i);
          ba.addEventListener('click',function(){
            ask('Cette validation est horodatée, nominative et consignée à la piste d’audit.', function(){
              agir('POST','/'+enc(b.id)+'/approbations/'+i,{},'Demande '+b.id+' validée au niveau « '+e.role+' ».');
            },'Valider au titre « '+e.role+' » ?','Valider');
          });
          var br=add(row,'button','btn btn-ghost btn-sm','Rejeter'); fk(br,'bes-rej-'+i);
          br.addEventListener('click',function(){
            demander('La demande retourne au demandeur, qui pourra la corriger et la soumettre de nouveau.', function(motif){
              agir('POST','/'+enc(b.id)+'/rejet',{motif:motif},'Demande '+b.id+' rejetée.');
            },'Rejeter la demande '+b.id+' ?','Rejeter','Motif du rejet');
          });
        } else if(i===fp) add(row,'span','chip c-amber', mien && can('besoin.approve') ? 'Validation par une autre personne' : 'En attente');
        else add(row,'span','chip c-grey','En attente');
      });
    }

    /* Création de la procédure (achats), une fois la demande validée */
    if(b.statut==='valide' && can('besoin.manage') && can('cdc.edit')){
      var kp=add(c,'div','fen-section');
      add(kp,'h3',null,'Créer la procédure');
      add(kp,'p','muted','Objet, budget estimé, service demandeur et type de procédure ('+b.typeLab+') sont repris dans le cahier des charges.');
      var f=add(kp,'div','frm');
      var w1=add(f,'div'); add(w1,'label',null,'Référence de la procédure').setAttribute('for','bes-ref');
      var ir=add(w1,'input'); ir.type='text'; ir.id='bes-ref'; ir.maxLength=40; ir.placeholder='AO-2026-040'; fk(ir,'bes-ref');
      var w2=add(f,'div'); add(w2,'label',null,'Profil réglementaire').setAttribute('for','bes-profil');
      var sp=add(w2,'select'); sp.id='bes-profil'; fk(sp,'bes-profil');
      optionsProfils(sp);
      sp.value=(state.org && state.org.profilDefaut) || MPProfils.DEFAUT;
      var bc2=add(kp,'button','btn btn-primary','Créer la procédure'); fk(bc2,'bes-proc'); bc2.style.marginTop='12px';
      bc2.addEventListener('click',function(){
        bc2.disabled=true;
        MP.api('POST','/api/besoins/'+enc(b.id)+'/procedure',{ref:ir.value.trim(), profil:sp.value})
          .then(function(r){ toast('Procédure '+ir.value.trim()+' créée à partir de la demande '+b.id+'.'); fermerFenetre(); return MP.refreshProcs().then(function(){ ouvrirProcedure(r.procedure,'cdc'); }); })
          .catch(function(e){ toast(e.message); bc2.disabled=false; });
      });
    }
    if(b.statut==='transforme' && b.procedure){
      var kt=add(c,'div','note'); kt.style.marginTop='18px';
      add(kt,'strong',null,'Procédure '+b.procedureRef+'. ');
      kt.appendChild(document.createTextNode('Cette demande a été transformée en procédure. '));
      var bo=add(kt,'button','btn btn-ghost btn-sm','Ouvrir la procédure'); fk(bo,'bes-ouvrir');
      bo.addEventListener('click',function(){ fermerFenetre(); MP.refreshProcs().then(function(){ ouvrirProcedure(b.procedure,'dashboard'); }); });
    }

    /* Historique */
    var kh=add(c,'div','fen-section');
    add(kh,'h3',null,'Historique');
    (b.historique||[]).slice().reverse().forEach(function(x){
      var row=add(kh,'div','docline'); var lf=add(row,'div');
      add(lf,'div',null,x.action); add(lf,'div','muted',x.who);
      add(row,'span','chip c-grey',x.t);
    });
  }

  charger();
}
