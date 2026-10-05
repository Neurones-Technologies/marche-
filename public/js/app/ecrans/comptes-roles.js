/* Marché+ — « Utilisateurs et accès » : deux onglets, Comptes et Rôles.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Comptes : un tableau (avatar, rôle, statut, dernière connexion) ; création et modification en fenêtre.
   Rôles : une carte par rôle (membres, habilitations, points d'attention en fenêtre) ; les habilitations se règlent en
   fenêtre, par interrupteurs groupés. */
"use strict";

function initialesNom(nom){ return String(nom||'?').split(/[\s.\-]+/).filter(Boolean).slice(0,2).map(function(x){ return x[0]; }).join('').toUpperCase(); }
function avatar(parent, nom, grand){ var a=add(parent,'span','av'+(grand?' av-lg':''),initialesNom(nom)); a.setAttribute('aria-hidden','true'); return a; }

/* ============ Comptes ============ */
function vComptes(m){
  if(!can('roles.edit')) return denyBox(m,'roles.edit');
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Utilisateurs et accès');
  var zone=add(m,'div'); add(zone,'p','muted','Chargement…');
  var me0=state.me;
  function majUtilisateurs(){ return MP.api('GET',MP.url('/state')).then(function(p){ state.users=p.state.users; synced.users=JSON.stringify(p.state.users); }); }
  function charger(){
    MP.api('GET','/api/auth/users').then(function(list){
      zone.textContent='';
      var actifs=list.filter(function(u){ return u.active; }).length;
      var res=add(zone,'div','acces-resume');
      resume(res,'users',list.length,'compte'+(list.length>1?'s':''));
      resume(res,'check',actifs,'actif'+(actifs>1?'s':''));
      resume(res,'key',Object.keys(state.roles).length,'rôles');
      tableau(zone,{ cle:'comptes', lignes:list, vide:'Aucun compte.',
        colonnes:[
          {lab:'Utilisateur', rendu:function(u,td){ var w=add(td,'div','qui'); avatar(w,u.nom); var t=add(w,'div'); add(t,'strong',null,u.nom); add(t,'div','muted',u.email); if(u.id===me0) chipCellule(t,'Vous','c-teal'); }},
          {lab:'Rôle', rendu:function(u,td){ chipCellule(td,(state.roles[u.role]||{}).lab||u.role,'c-grey'); }},
          {lab:'Statut', rendu:function(u,td){ var s=add(td,'span','etat-point '+(u.active?'on':'off'),u.active?'Actif':'Désactivé'); s.title=u.active?'Peut se connecter':'Accès coupé'; }},
          {lab:'Dernière connexion', val:function(u){ return u.last_login ? u.last_login.replace('T',' ').slice(0,16)+' UTC' : 'Jamais'; }}
        ],
        recherche:function(u){ return u.nom+' '+u.email+' '+((state.roles[u.role]||{}).lab||u.role); },
        filtres:[
          { lab:'Rôle', options:Object.keys(state.roles).map(function(r){ return [r, state.roles[r].lab]; }), test:function(u,v){ return u.role===v; } },
          { lab:'Statut', options:[['1','Actif'],['0','Désactivé']], test:function(u,v){ return String(u.active?1:0)===v; } }
        ],
        nouveau:{ lab:'Nouveau compte', action:function(){ nouveauCompte(); } },
        actions:function(u,td){ boutonIcone(td,'edit','Modifier le compte de '+u.nom,function(){ modifierCompte(u); },'cpt-modifier-'+u.id); }
      });
    }).catch(function(e){ zone.textContent=''; add(zone,'p','muted',e.message); });
  }
  function resume(p, ic, n, lab){ var d=add(p,'div','acces-chiffre'); icon(add(d,'span','acces-ic'),ic); var t=add(d,'div'); add(t,'strong',null,String(n)); add(t,'span',null,' '+lab); }

  function champ(parent, lab, id, type, ph){
    var d=add(parent,'div','fen-champ'); var lb=add(d,'label','fen-lab',lab); lb.htmlFor=id;
    var i=add(d, type==='select'?'select':'input'); i.id=id; fk(i,id); if(type!=='select'){ i.type=type; if(ph) i.placeholder=ph; }
    return i;
  }
  function selectRoles(sel, val){ Object.keys(state.roles).forEach(function(r){ var o=add(sel,'option',null,state.roles[r].lab); o.value=r; }); sel.value=val; }

  function nouveauCompte(){
    ouvrirFenetre('Nouveau compte', function(c,p){
      var nom=champ(c,'Nom','nc-nom','text','Ex. K. Yao');
      var mail=champ(c,'Courriel','nc-mail','email','prenom.nom'+(state.mailSuffix||'@exemple.ci'));
      var rs=champ(c,'Rôle','nc-role','select'); selectRoles(rs, state.roles.audit ? 'audit' : Object.keys(state.roles)[0]); /* moindre privilège par défaut */
      var pw=champ(c,'Mot de passe initial','nc-pw','password','10 caractères minimum');
      add(c,'p','muted','Le titulaire change ce mot de passe à sa première connexion (menu du compte, en haut à droite).').style.marginTop='12px';
      var an=add(p,'button','btn btn-ghost','Annuler'); an.addEventListener('click',fermerFenetre);
      var go_=add(p,'button','btn btn-primary','Créer le compte'); fk(go_,'nc-creer');
      go_.addEventListener('click',function(){
        go_.disabled=true;
        MP.api('POST','/api/auth/users',{nom:nom.value.trim(), email:mail.value.trim(), role:rs.value, password:pw.value}).then(function(u){
          toast('Compte créé — '+u.nom); fermerFenetre(); return majUtilisateurs();
        }).then(charger).catch(function(e){ toast(e.message); go_.disabled=false; });
      });
    });
  }

  function modifierCompte(u){
    var moi = u.id===me0;
    ouvrirFenetre(u.nom, function(c,p){
      var tete=add(c,'div','qui qui-lg'); avatar(tete,u.nom,true); var t=add(tete,'div'); add(t,'strong',null,u.nom); add(t,'div','muted',u.email);
      var rs=champ(c,'Rôle','cpt-role-'+u.id,'select'); selectRoles(rs,u.role); rs.disabled=moi;
      if(moi) add(c,'p','muted','Vous ne pouvez pas modifier votre propre rôle ni désactiver votre compte.').style.marginTop='8px';
      var sec=add(c,'div','fen-section'); add(sec,'h3',null,'Sécurité');
      var lg=add(sec,'div','acces-ligne');
      var tl=add(lg,'div'); add(tl,'strong',null,'Mot de passe'); add(tl,'div','muted','Un mot de passe provisoire, à transmettre par un canal sûr.');
      var rp=add(lg,'button','btn btn-ghost btn-sm','Réinitialiser'); fk(rp,'cpt-mdp-'+u.id);
      rp.addEventListener('click',function(){
        demander('Saisissez un mot de passe provisoire (10 caractères minimum), à transmettre à '+u.nom+' par un canal sûr.', function(pw){
          MP.api('PATCH','/api/auth/users/'+u.id,{password:pw}).then(function(){ toast('Mot de passe réinitialisé — à transmettre à '+u.nom+' par un canal sûr.'); }).catch(function(e){ toast(e.message); });
        }, 'Réinitialiser le mot de passe de '+u.nom+' ?', 'Réinitialiser', 'Mot de passe provisoire');
      });
      var la=add(sec,'div','acces-ligne');
      var ta=add(la,'div'); add(ta,'strong',null,'Accès à la plateforme'); add(ta,'div','muted', u.active ? 'Le compte peut se connecter.' : 'Le compte est désactivé.');
      var tg=add(la,'button','btn btn-sm '+(u.active?'btn-danger':'btn-ghost'), u.active?'Désactiver':'Réactiver'); fk(tg,'cpt-actif-'+u.id); tg.disabled=moi;
      tg.addEventListener('click',function(){
        ask(u.active?u.nom+" perdra immédiatement l'accès à la plateforme.":u.nom+' retrouvera son accès.', function(){
          MP.api('PATCH','/api/auth/users/'+u.id,{active:!u.active}).then(function(){ toast(u.active?'Compte désactivé.':'Compte réactivé.'); fermerFenetre(); charger(); }).catch(function(e){ toast(e.message); });
        }, u.active?'Désactiver ce compte ?':'Réactiver ce compte ?', u.active?'Désactiver':'Réactiver');
      });
      var an=add(p,'button','btn btn-ghost','Fermer'); an.addEventListener('click',fermerFenetre);
      var ok=add(p,'button','btn btn-primary','Enregistrer le rôle'); fk(ok,'cpt-enregistrer-'+u.id); ok.disabled=moi;
      ok.addEventListener('click',function(){
        if(rs.value===u.role){ fermerFenetre(); return; }
        MP.api('PATCH','/api/auth/users/'+u.id,{role:rs.value}).then(function(){ toast('Rôle modifié — '+u.nom); fermerFenetre(); return majUtilisateurs(); })
          .then(charger).catch(function(e){ toast(e.message); });
      });
    });
  }
  charger();
}

/* ============ Rôles ============ */
function vRoles(m){
  if(!can('roles.edit')) return denyBox(m,'roles.edit');
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Utilisateurs et accès');

  var rk=Object.keys(state.roles);

  var barre=add(m,'div','roles-barre');
  add(barre,'span','muted',rk.length+' rôles');
  var bn=add(barre,'button','btn btn-primary btn-sm'); icon(bn,'plus'); bn.appendChild(document.createTextNode('Nouveau rôle')); fk(bn,'role-nouveau');
  bn.addEventListener('click',nouveauRole);

  var g=add(m,'div','roles-grille');
  rk.forEach(function(r){
    var R_=state.roles[r], membres=state.users.filter(function(u){ return u.role===r; });
    var nb=PERMS.filter(function(pp){ return R_.perms[pp.id]; }).length, inc=incompatOf(R_.perms).length;
    var k=add(g,'article','card role-carte');
    var t=add(k,'div','role-tete');
    icon(add(t,'span','role-ic'),'key');
    var tt=add(t,'div'); add(tt,'h3',null,R_.lab); add(tt,'div','muted',nb+' habilitation'+(nb>1?'s':'')+' sur '+PERMS.length);
    boutonIcone(t,'edit','Renommer ou supprimer le rôle « '+R_.lab+' »',function(){ modifierRole(r); },'role-modifier-'+r).classList.add('role-modifier');
    var jauge=add(k,'div','role-jauge'); var jr=add(jauge,'span'); jr.style.width=Math.round(100*nb/PERMS.length)+'%';
    jauge.setAttribute('role','img'); jauge.setAttribute('aria-label',nb+' habilitations sur '+PERMS.length);
    var mb=add(k,'div','role-membres');
    if(!membres.length) add(mb,'span','muted','Aucun membre');
    else {
      var pile=add(mb,'div','av-pile'); membres.slice(0,5).forEach(function(u){ avatar(pile,u.nom).title=u.nom; });
      add(mb,'span','muted', membres.length===1 ? membres[0].nom : membres.length+' membres');
    }
    if(inc){
      var pa=add(k,'div','attention');
      add(pa,'span',null, inc+' point'+(inc>1?'s':'')+' d’attention');
      var bi=boutonIcone(pa,'info','Voir le détail des points d’attention — '+R_.lab,function(){ pointsAttention(r); },'attention-'+r);
      bi.classList.add('attention-info');
    }
    var pied=add(k,'div','role-pied');
    var b=add(pied,'button','btn btn-ghost btn-sm','Habilitations'); fk(b,'role-'+r);
    b.addEventListener('click',function(){ ouvrirHabilitations(r); });
  });
}

/* Rôles dont la plateforme a besoin (administrateur initial, prestataires inscrits en ligne) : renommables, pas
   supprimables. Le serveur applique la même règle. */
var ROLES_SYSTEME = ['admin','soum'];
/* Identifiant d'un nouveau rôle, tiré de son libellé : « Contrôle de gestion » → « controle-de-gestion ». */
function idRole(lab){
  var b=String(lab).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,34);
  if(!/^[a-z]/.test(b)) b='role-'+b;
  if(b.length<2) b='role';
  var id=b, n=2; while(state.roles[id]){ id=b+'-'+n; n++; }
  return id;
}
/* Libellé de rôle : obligatoire, 80 caractères au plus, différent de ceux des autres rôles. */
function erreurLibelle(lab, sauf){
  lab=String(lab||'').trim();
  if(!lab) return 'Le libellé est obligatoire.';
  if(lab.length>80) return 'Le libellé fait 80 caractères au plus.';
  var pris=Object.keys(state.roles).some(function(r){ return r!==sauf && state.roles[r].lab.trim().toLowerCase()===lab.toLowerCase(); });
  return pris ? 'Un autre rôle porte déjà ce libellé.' : null;
}

/* Fenêtre « Nouveau rôle » : libellé, et habilitations de départ copiées d'un rôle existant (ou aucune). */
function nouveauRole(){
  ouvrirFenetre('Nouveau rôle', function(c,p){
    var d1=add(c,'div','fen-champ'); add(d1,'label','fen-lab','Libellé').htmlFor='role-lab';
    var lab=add(d1,'input'); lab.type='text'; lab.id='role-lab'; lab.maxLength=80; lab.placeholder='Ex. Contrôle de gestion'; fk(lab,'role-lab');
    var d2=add(c,'div','fen-champ'); add(d2,'label','fen-lab','Habilitations de départ').htmlFor='role-modele';
    var mod=add(d2,'select'); mod.id='role-modele'; fk(mod,'role-modele');
    add(mod,'option',null,'Aucune (à régler ensuite)').value='';
    Object.keys(state.roles).forEach(function(r){ add(mod,'option',null,'Copier « '+state.roles[r].lab+' »').value=r; });
    add(c,'p','muted','Le rôle est créé tout de suite ; ses habilitations s’ouvrent ensuite pour être ajustées.').style.marginTop='12px';
    var an=add(p,'button','btn btn-ghost','Annuler'); an.addEventListener('click',fermerFenetre);
    var ok=add(p,'button','btn btn-primary','Créer le rôle'); fk(ok,'role-creer');
    ok.addEventListener('click',function(){
      var err=erreurLibelle(lab.value); if(err){ toast(err); lab.focus(); return; }
      var id=idRole(lab.value.trim());
      var perms = mod.value ? JSON.parse(JSON.stringify(state.roles[mod.value].perms)) : permsDef([]);
      state.roles[id]={ lab:lab.value.trim(), perms:perms };
      logit('Rôle créé — '+lab.value.trim());
      save(); render(); ouvrirHabilitations(id);
    });
  });
}

/* Fenêtre « Modifier le rôle » : renommer ; supprimer s'il n'a aucun membre et n'est pas un rôle de la plateforme. */
function modifierRole(r){
  ouvrirFenetre(function(){ return 'Rôle — '+((state.roles[r]||{}).lab||r); }, function(c,p){
    var R_=state.roles[r]; if(!R_) return false;
    var membres=state.users.filter(function(u){ return u.role===r; });
    var d1=add(c,'div','fen-champ'); add(d1,'label','fen-lab','Libellé').htmlFor='role-renommer';
    var lab=add(d1,'input'); lab.type='text'; lab.id='role-renommer'; lab.maxLength=80; lab.value=R_.lab; fk(lab,'role-renommer');
    add(c,'p','muted', membres.length ? membres.length+' compte(s) ont ce rôle : '+membres.map(function(u){ return u.nom; }).join(', ')+'.' : 'Aucun compte n’a ce rôle.').style.marginTop='12px';
    var raison = ROLES_SYSTEME.indexOf(r)>=0 ? 'Ce rôle est utilisé par la plateforme : il peut être renommé, pas supprimé.'
      : (membres.length ? 'Changez d’abord le rôle des comptes qui l’ont.' : null);
    var sup=add(p,'button','btn btn-danger','Supprimer'); fk(sup,'role-supprimer'); sup.style.marginRight='auto';
    if(raison){ sup.disabled=true; sup.title=raison; }
    sup.addEventListener('click',function(){
      ask('Le rôle « '+R_.lab+' » sera supprimé, et retiré des destinataires des alertes.', function(){
        delete state.roles[r];
        Object.keys(state.notifRules||{}).forEach(function(e){ var x=state.notifRules[e].roles, i=x.indexOf(r); if(i>=0) x.splice(i,1); });
        logit('Rôle supprimé — '+R_.lab);
        fermerFenetre(); save(); render();
      }, 'Supprimer le rôle « '+R_.lab+' » ?', 'Supprimer');
    });
    var an=add(p,'button','btn btn-ghost','Annuler'); an.addEventListener('click',fermerFenetre);
    var ok=add(p,'button','btn btn-primary','Enregistrer'); fk(ok,'role-enregistrer');
    ok.addEventListener('click',function(){
      var v=lab.value.trim();
      if(v===R_.lab){ fermerFenetre(); return; }
      var err=erreurLibelle(v,r); if(err){ toast(err); lab.focus(); return; }
      logit('Rôle renommé — '+R_.lab+' → '+v);
      R_.lab=v; fermerFenetre(); save(); render();
    });
  });
}

/* Fenêtre « points d'attention » d'un rôle : les habilitations qu'il cumule alors qu'elles devraient revenir à
   des personnes différentes (séparation des fonctions), et pourquoi. */
function pointsAttention(r){
  ouvrirFenetre(function(){ return 'Points d’attention — '+((state.roles[r]||{}).lab||r); }, function(c,p){
    var R_=state.roles[r]; if(!R_) return false;
    var inc=incompatOf(R_.perms); if(!inc.length) return false;
    add(c,'p','muted','Certaines tâches doivent être faites par des personnes différentes, pour qu’un contrôle existe. Ce rôle en réunit deux : l’outil le signale sans l’interdire. Si ce n’est pas voulu, retirez l’une des deux habilitations.').style.marginBottom='14px';
    var ul=add(c,'ul','fen-liste attention-liste');
    inc.forEach(function(x){
      var li=add(ul,'li'); var d=add(li,'div');
      add(d,'strong',null,'Peut à la fois '+cumulLab(x)+'.');
      add(d,'div','muted',x[2]);
    });
    var bh=add(p,'button','btn btn-primary','Modifier les habilitations'); fk(bh,'attention-habilitations');
    bh.addEventListener('click',function(){ ouvrirHabilitations(r); });
  });
}

/* Fenêtre des habilitations d'un rôle : un interrupteur par permission, rangées par groupe. */
function ouvrirHabilitations(r){
  ouvrirFenetre(function(){ return 'Habilitations — '+((state.roles[r]||{}).lab||r); }, function(c){
    var R_=state.roles[r]; if(!R_) return false;
    var inc=incompatOf(R_.perms);
    if(inc.length){ var w=add(c,'div','warn'); w.style.marginBottom='14px'; inc.forEach(function(x){ var d=add(w,'div'); add(d,'strong',null,'Ce rôle peut à la fois '+cumulLab(x)+'. '); d.appendChild(document.createTextNode(x[2])); }); }
    // permissions rangées par groupe (PERMS n'est pas trié : un groupe peut y revenir plus loin)
    var groupes=[]; PERMS.forEach(function(pp){ if(groupes.indexOf(pp.grp)<0) groupes.push(pp.grp); });
    var ordre=[]; groupes.forEach(function(g){ PERMS.forEach(function(pp){ if(pp.grp===g) ordre.push(pp); }); });
    var grp=null, bloc=null;
    ordre.forEach(function(pp){
      if(pp.grp!==grp){ grp=pp.grp; var s=add(c,'div','perm-groupe'); add(s,'div','fen-lab',grp); bloc=add(s,'div','perm-liste'); }
      var on=!!R_.perms[pp.id];
      var row=add(bloc,'div','perm-ligne');
      add(row,'span',null,pp.lab);
      var sw=add(row,'button','interrupteur'+(on?' on':'')); sw.type='button';
      sw.setAttribute('role','switch'); sw.setAttribute('aria-checked', on?'true':'false');
      sw.setAttribute('aria-label',pp.lab+' — '+R_.lab); fk(sw,'perm-'+r+'-'+pp.id);
      sw.addEventListener('click',function(){
        R_.perms[pp.id]=!on;
        logit('Habilitation '+(on?'retirée':'accordée')+' — '+R_.lab+' : '+pp.lab);
        var cf=incompatOf(R_.perms);
        save(); render();
        if(!on && cf.length) toast('Attention : ce cumul crée une incompatibilité de séparation des fonctions.');
      });
    });
  }, { large:false });
}
