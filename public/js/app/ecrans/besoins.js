/* Marché+ — Écran Besoins (module 2 : de l'intention à la publication).
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
  add(l,'h1',null,'Besoins');

  var grille=add(m,'div'); grille.style.cssText='display:grid;grid-template-columns:minmax(0,1fr);gap:18px';
  var zoneListe=add(grille,'div'); add(zoneListe,'p','muted','Chargement…');
  var formulaire=add(grille,'div');
  var detail=add(grille,'div');

  function charger(){
    MP.api('GET','/api/besoins').then(function(r){
      zoneListe.textContent=''; detail.textContent=''; formulaire.textContent='';
      var liste_=(r.besoins||[]).slice().reverse();
      tableau(zoneListe,{ cle:'besoins', lignes:liste_,
        vide: can('besoin.create') ? 'Aucun besoin : utilisez « Nouveau besoin ».' : 'Aucun besoin n’a encore été exprimé.',
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
        nouveau: can('besoin.create') ? { lab:'Nouveau besoin', action:function(){ creation(r.regles); } } : null,
        actions:function(b,td){
          boutonCellule(td, UI.besoin===b.id ? 'Affiché' : 'Ouvrir', function(){ UI.besoin=b.id; charger(); }, 'bes-open-'+b.id).disabled = UI.besoin===b.id;
        }
      });
      var cur=liste_.filter(function(b){ return b.id===UI.besoin; })[0];
      if(cur) fiche(detail,cur,r.regles);
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
    champ('objet','Objet du besoin','textarea');
    champ('service','Service demandeur');
    var bu=champ('budget','Budget estimé (XOF)','number'); bu.min='0'; bu.step='100000';
    champ('dateSouhaitee','Date souhaitée','date');
    champ('description','Description (quantités, spécifications)','textarea');
    champ('justification','Justification','textarea');
    var typ=add(parent,'p','muted'); typ.style.marginTop='10px';
    function majType(){
      var mt=Number(bu.value);
      typ.textContent = mt>0 && regles ? 'Type de procédure pressenti pour ce montant : '+MPProfils.typeProcedure(regles,mt).lab+' (seuils provisoires, à valider par un juriste).' : '';
    }
    if(editable){ bu.addEventListener('input',majType); majType(); } // une fois soumis, le type retenu est affiché à la place
    return function(){
      var o={}; Object.keys(vals).forEach(function(k){ o[k]= k==='budget' ? Number(vals[k].value) : vals[k].value.trim(); }); return o;
    };
  }

  /* Fenêtre « Nouveau besoin ». */
  function creation(regles){
    ouvrirFenetre('Exprimer un nouveau besoin', function(c,foot){
      var lire=champs(c,{},true,regles);
      add(foot,'span','muted','Enregistré en brouillon ; vous le soumettez ensuite à validation.');
      var an=add(foot,'button','btn btn-ghost','Annuler'); fk(an,'bes-annuler'); an.addEventListener('click',fermerFenetre);
      var go_=add(foot,'button','btn btn-primary','Enregistrer le brouillon'); fk(go_,'bes-creer');
      go_.addEventListener('click',function(){
        go_.disabled=true;
        MP.api('POST','/api/besoins',lire()).then(function(r){ toast('Besoin '+r.besoin.id+' enregistré.'); fermerFenetre(); UI.besoin=r.besoin.id; charger(); })
          .catch(function(e){ toast(e.message); go_.disabled=false; });
      });
    }, { large:true });
  }

  function fiche(parent, b, regles){
    retourListe(parent,'Tous les besoins',function(){ UI.besoin=null; charger(); },'bes-retour');
    var k=add(parent,'div','card');
    var ph=add(k,'div','panel-head'); add(ph,'span',null,b.id+' — '+b.objet);
    var st=STATUTS_BESOIN[b.statut]||[b.statut,'c-grey']; add(ph,'span','chip '+st[1],st[0]);
    var corps=add(k,'div','pad');
    var mien = b.par===state.me, editable = mien && (b.statut==='brouillon' || b.statut==='rejete');
    if(b.rejet){
      var w=add(corps,'div','warn'); w.style.marginTop='0';
      add(w,'strong',null,'Rejeté au niveau « '+b.rejet.role+' », le '+b.rejet.at+'. ');
      w.appendChild(document.createTextNode('Motif : '+b.rejet.motif+(mien?' Corrigez le besoin puis soumettez-le de nouveau.':'')));
    }
    var lire=champs(corps,b,editable,regles);
    if(b.typeLab) add(corps,'p',null,'Type de procédure retenu à la soumission : '+b.typeLab+'.').style.marginTop='8px';

    var foot=add(k,'div','panel-foot');
    add(foot,'span','muted','Demandé par '+b.parNom+' le '+b.cree+'.');
    if(editable){
      var be=add(foot,'button','btn btn-ghost btn-sm','Enregistrer'); fk(be,'bes-enr-'+b.id);
      be.addEventListener('click',function(){ agir('PUT','/'+enc(b.id),lire(),'Besoin '+b.id+' enregistré.'); });
      var bs=add(foot,'button','btn btn-primary btn-sm','Soumettre à validation'); fk(bs,'bes-soum-'+b.id);
      bs.addEventListener('click',function(){
        ask('Une fois soumis, le besoin ne se modifie plus, sauf s’il est rejeté. Il suit le circuit de validation de l’organisation.', function(){
          MP.api('PUT','/api/besoins/'+enc(b.id),lire())
            .then(function(){ return agir('POST','/'+enc(b.id)+'/soumettre',{},'Besoin '+b.id+' soumis à validation.'); })
            .catch(function(e){ toast(e.message); });
        },'Soumettre le besoin '+b.id+' ?','Soumettre');
      });
    }

    if(b.circuit && b.circuit.length && b.statut!=='brouillon'){
      var kc=add(parent,'div','card'); kc.style.marginTop='18px';
      add(kc,'div','panel-head','Circuit de validation — '+MPCircuits.nbRequises(b.circuit)+' niveau(x) requis');
      var bc=add(kc,'div','pad');
      var fp = b.statut==='soumis' ? MPCircuits.prochaine(b.circuit) : -1;
      b.circuit.forEach(function(e,i){
        var row=add(bc,'div','stepline');
        add(row,'div','stepnum '+(e.done?'done':(i===fp?'now':'')), e.done?'✓':String(i+1));
        var d=add(row,'div'); d.style.flex='1 1 auto';
        add(d,'strong',null,e.role); add(d,'div','muted',e.who||'');
        if(Number(e.seuil)>0) add(d,'div','muted','à partir de '+xof(Number(e.seuil)));
        if(e.done) add(row,'span','chip c-green','Validé le '+e.at);
        else if(!MPCircuits.requise(e)) add(row,'span','chip c-grey','Non requis pour ce montant');
        else if(i===fp && can('besoin.approve') && !mien){
          var ba=add(row,'button','btn btn-primary btn-sm','Valider'); fk(ba,'bes-val-'+i);
          ba.addEventListener('click',function(){
            ask('Cette validation est horodatée, nominative et consignée à la piste d’audit.', function(){
              agir('POST','/'+enc(b.id)+'/approbations/'+i,{},'Besoin '+b.id+' validé au niveau « '+e.role+' ».');
            },'Valider au titre « '+e.role+' » ?','Valider');
          });
          var br=add(row,'button','btn btn-ghost btn-sm','Rejeter'); fk(br,'bes-rej-'+i);
          br.addEventListener('click',function(){
            demander('Le besoin retourne au demandeur, qui pourra le corriger et le soumettre de nouveau.', function(motif){
              agir('POST','/'+enc(b.id)+'/rejet',{motif:motif},'Besoin '+b.id+' rejeté.');
            },'Rejeter le besoin '+b.id+' ?','Rejeter','Motif du rejet');
          });
        } else if(i===fp) add(row,'span','chip c-amber', mien && can('besoin.approve') ? 'Validation par une autre personne' : 'En attente');
        else add(row,'span','chip c-grey','En attente');
      });
    }

    if(b.statut==='valide' && can('besoin.manage') && can('cdc.edit')){
      var kp=add(parent,'div','card'); kp.style.marginTop='18px';
      add(kp,'div','panel-head','Créer la procédure');
      var bp=add(kp,'div','pad'); var f=add(bp,'div','frm');
      var w1=add(f,'div'); add(w1,'label',null,'Référence de la procédure').setAttribute('for','bes-ref');
      var ir=add(w1,'input'); ir.type='text'; ir.id='bes-ref'; ir.maxLength=40; ir.placeholder='AO-2026-040'; fk(ir,'bes-ref');
      var w2=add(f,'div'); add(w2,'label',null,'Profil réglementaire').setAttribute('for','bes-profil');
      var sp=add(w2,'select'); sp.id='bes-profil'; fk(sp,'bes-profil');
      Object.keys(MPProfils.PROFILS).forEach(function(id){ var op=add(sp,'option',null,MPProfils.PROFILS[id].lab); op.value=id; });
      sp.value=(state.org && state.org.profilDefaut) || MPProfils.DEFAUT;
      var fp2=add(kp,'div','panel-foot');
      add(fp2,'span','muted','Objet, budget estimé, service demandeur et type de procédure ('+b.typeLab+') sont repris dans le cahier des charges.');
      var bc2=add(fp2,'button','btn btn-primary','Créer la procédure'); fk(bc2,'bes-proc');
      bc2.addEventListener('click',function(){
        bc2.disabled=true;
        MP.api('POST','/api/besoins/'+enc(b.id)+'/procedure',{ref:ir.value.trim(), profil:sp.value})
          .then(function(r){ toast('Procédure '+ir.value.trim()+' créée à partir du besoin '+b.id+'.'); return MP.refreshProcs().then(function(){ ouvrirProcedure(r.procedure,'cdc'); }); })
          .catch(function(e){ toast(e.message); bc2.disabled=false; });
      });
    }
    if(b.statut==='transforme' && b.procedure){
      var kt=add(parent,'div','note'); kt.style.marginTop='18px';
      add(kt,'strong',null,'Procédure '+b.procedureRef+'. ');
      kt.appendChild(document.createTextNode('Ce besoin a été transformé en procédure. '));
      var bo=add(kt,'button','btn btn-ghost btn-sm','Ouvrir la procédure'); fk(bo,'bes-ouvrir');
      bo.addEventListener('click',function(){ MP.refreshProcs().then(function(){ ouvrirProcedure(b.procedure,'dashboard'); }); });
    }

    var kh=add(parent,'div','card'); kh.style.marginTop='18px';
    add(kh,'div','panel-head','Historique');
    var bh=add(kh,'div','pad');
    (b.historique||[]).slice().reverse().forEach(function(x){
      var row=add(bh,'div','docline'); var lf=add(row,'div');
      add(lf,'div',null,x.action); add(lf,'div','muted',x.who);
      add(row,'span','chip c-grey',x.t);
    });
  }

  charger();
}
