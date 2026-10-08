/* Marché+ — Écran Audit : le journal de toute l'instance (date, auteur, action, procédure, adresse IP).
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Les entrées viennent de /api/audit, avec l'état de la chaîne d'empreintes ; le détail s'ouvre en fenêtre. */
"use strict";

function vJournal(m){
  if(!can('audit.read')) return denyBox(m,'audit.read');
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Audit');
  var zone=add(m,'div'); add(zone,'p','muted','Chargement…');
  MP.api('GET','/api/audit').then(function(r){
    zone.textContent='';
    var v=r.verification||{};
    var bd=add(zone,'div','journal-chaine '+(v.ok?'ok':'ko'));
    icon(add(bd,'span','journal-ic'), v.ok?'shield':'info');
    var bt=add(bd,'div');
    add(bt,'strong',null, v.ok ? 'Chaîne d’empreintes intègre' : 'Chaîne d’empreintes rompue');
    add(bt,'div','muted', v.ok ? v.entries+' entrée(s) vérifiée(s) : aucune n’a été modifiée, supprimée ou déplacée.' : 'Rupture à l’entrée n° '+v.brokenAt+' : le journal a été altéré à partir de ce point.');

    /* Adresse vue par le serveur pour la connexion de l'auditeur : si aucun proxy ne la transmet, toutes les actions
       portent l'adresse du dernier relais (passerelle Docker, nginx local), la même pour tout le monde. */
    var cn=r.connexion;
    if(cn){
      var interne=/^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd])/i.test(cn.ip||'');
      var bi=add(zone,'div',interne ? 'warn' : 'note'); bi.style.marginTop='12px';
      add(bi,'strong',null,'Votre connexion, vue par le serveur : ');
      bi.appendChild(document.createTextNode(cn.ip+'. '+(cn.chaine ? 'Adresse transmise par le proxy (X-Forwarded-For) : '+cn.chaine+'.' : 'Aucune adresse transmise par un proxy ; adresse du dernier relais : '+cn.pair+'.')));
      if(interne) bi.appendChild(document.createTextNode(' Cette adresse est interne : tant que le proxy inverse ne transmet pas l’adresse des postes (en-tête X-Forwarded-For, TRUST_PROXY='+cn.proxys+'), toutes les actions du journal portent la même adresse.'));
    }
    var E=r.entrees||[];
    var auteurs=[], procs=[];
    E.forEach(function(e){ if(auteurs.indexOf(e.who)<0) auteurs.push(e.who); if(e.procedure && procs.indexOf(e.procedure)<0) procs.push(e.procedure); });
    auteurs.sort();
    tableau(zone,{ cle:'journal', lignes:E, vide:'Aucune action enregistrée.',
      colonnes:[
        {lab:'Date', rendu:function(e,td){ add(td,'span','nowrap',e.t); }},
        {lab:'Auteur', rendu:function(e,td){ add(td,'strong',null,e.who); }},
        {lab:'Action', rendu:function(e,td){ add(td,'div','dt-extrait',e.a); }},
        {lab:'Procédure', rendu:function(e,td){ if(e.procedure) chipCellule(td,e.procedure,'c-grey'); else add(td,'span','muted','Organisation'); }},
        {lab:'Adresse IP', rendu:function(e,td){ add(td,'span','mono',e.ip||'—'); if(e.relais) add(td,'div','muted','relayée : '+e.relais); }},
        {lab:'Poste', rendu:function(e,td){ add(td,'span','dt-extrait',e.poste||'—'); }}
      ],
      recherche:function(e){ return [e.t,e.who,e.a,e.procedure,e.ip,e.poste,e.relais].join(' '); },
      filtres:[
        { lab:'Auteur', options:auteurs.map(function(a){ return [a,a]; }), test:function(e,x){ return e.who===x; } },
        { lab:'Procédure', options:[['-','Organisation']].concat(procs.map(function(p){ return [p,p]; })), test:function(e,x){ return x==='-' ? !e.procedure : e.procedure===x; } }
      ],
      actions:function(e,td){ boutonDetail(td,function(){ ouvrirEntree(e); },'journal-'+e.seq); }
    });
  }).catch(function(e){ zone.textContent=''; add(zone,'p','muted',e.message); });
}

function ouvrirEntree(e){
  ouvrirFenetre('Entrée n° '+e.seq, function(c){
    grilleLecture(c,[['Date',e.t],['Auteur',e.who],['Procédure',e.procedure||'Organisation'],['Adresse IP',e.ip||'Non enregistrée'],
      ['Poste (navigateur, système, identifiant du navigateur)',e.poste||'Non enregistré'],['Adresses relayées par les proxys (indicatif)',e.relais||'Aucune : la requête ne porte qu’une adresse']]);
    champLecture(c,'Action',e.a);
    var em=champLecture(c,'Empreinte (SHA-256)',e.hash); em.classList.add('mono','journal-empreinte');
  });
}
