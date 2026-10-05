/* Marché+ — « Utilisateurs et accès » : deux onglets, Comptes et Rôles.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build.
   Comptes : un tableau (avatar, rôle, statut, dernière connexion) ; création et modification en fenêtre.
   Rôles : une carte par rôle (membres, habilitations, cumuls incompatibles) ; les habilitations se règlent en
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
  var confl=[];
  rk.forEach(function(r){ incompatOf(state.roles[r].perms).forEach(function(x){ confl.push({r:r,x:x}); }); });
  if(confl.length){
    // séparation des fonctions : un rôle qui cumule deux habilitations à confier à des personnes différentes
    var w=add(m,'div','cumuls');
    var wt=add(w,'div','cumuls-tete'); icon(add(wt,'span','cumuls-ic'),'shield');
    var wx=add(wt,'div');
    add(wx,'strong',null,'Séparation des fonctions : '+confl.length+' point'+(confl.length>1?'s':'')+' d’attention');
    add(wx,'p',null,'Certaines tâches doivent être faites par des personnes différentes, pour qu’un contrôle existe. Les rôles ci-dessous réunissent deux de ces tâches : l’outil le signale sans l’interdire. Si ce n’est pas voulu, retirez l’une des deux habilitations du rôle.');
    var ul=add(w,'ul','cumuls-liste');
    confl.forEach(function(cc){
      var li=add(ul,'li');
      var t=add(li,'div'); add(t,'strong',null,state.roles[cc.r].lab); t.appendChild(document.createTextNode(' peut à la fois '+cumulLab(cc.x)+'.'));
      add(li,'div','muted',cc.x[2]);
    });
  }

  var g=add(m,'div','roles-grille');
  rk.forEach(function(r){
    var R_=state.roles[r], membres=state.users.filter(function(u){ return u.role===r; });
    var nb=PERMS.filter(function(pp){ return R_.perms[pp.id]; }).length, inc=incompatOf(R_.perms).length;
    var k=add(g,'article','card role-carte');
    var t=add(k,'div','role-tete');
    icon(add(t,'span','role-ic'),'key');
    var tt=add(t,'div'); add(tt,'h3',null,R_.lab); add(tt,'div','muted',nb+' habilitation'+(nb>1?'s':'')+' sur '+PERMS.length);
    var jauge=add(k,'div','role-jauge'); var jr=add(jauge,'span'); jr.style.width=Math.round(100*nb/PERMS.length)+'%';
    jauge.setAttribute('role','img'); jauge.setAttribute('aria-label',nb+' habilitations sur '+PERMS.length);
    var mb=add(k,'div','role-membres');
    if(!membres.length) add(mb,'span','muted','Aucun membre');
    else {
      var pile=add(mb,'div','av-pile'); membres.slice(0,5).forEach(function(u){ avatar(pile,u.nom).title=u.nom; });
      add(mb,'span','muted', membres.length===1 ? membres[0].nom : membres.length+' membres');
    }
    if(inc) chipCellule(k, inc+' point'+(inc>1?'s':'')+' d’attention','c-amber');
    var pied=add(k,'div','role-pied');
    var b=add(pied,'button','btn btn-ghost btn-sm','Habilitations'); fk(b,'role-'+r);
    b.addEventListener('click',function(){ ouvrirHabilitations(r); });
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
