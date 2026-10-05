/* Marché+ — Écrans Comptes et Rôles.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

/* ============ Rôles et habilitations ============ */
UI.compteNouveau = false;
function vComptes(m){
  if(!can('roles.edit')) return denyBox(m,'roles.edit');
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Comptes utilisateurs');
  var zone=add(m,'div'); add(zone,'p','muted','Chargement…');
  var formulaire=add(m,'div');
  var me0=state.me;
  function msg(t){ toast(t); }
  function majUtilisateurs(){ return MP.api('GET',MP.url('/state')).then(function(p){ state.users=p.state.users; synced.users=JSON.stringify(p.state.users); }); }
  function charger(){
    MP.api('GET','/api/auth/users').then(function(list){
      zone.textContent=''; formulaire.textContent='';
      tableau(zone,{ cle:'comptes', titre:'Comptes', lignes:list, vide:'Aucun compte.',
        colonnes:[
          {lab:'Nom', val:function(u){ return u.nom; }},
          {lab:'Courriel', val:function(u){ return u.email; }},
          {lab:'Rôle', rendu:function(u,td){
            var sel=add(td,'select'); sel.setAttribute('aria-label','Rôle de '+u.nom); fk(sel,'cpt-role-'+u.id);
            Object.keys(state.roles).forEach(function(r){ var o=add(sel,'option',null,state.roles[r].lab); o.value=r; });
            sel.value=u.role; sel.disabled = u.id===me0;
            sel.addEventListener('change',function(){
              MP.api('PATCH','/api/auth/users/'+u.id,{role:sel.value}).then(function(){ msg('Rôle modifié — '+u.nom); return majUtilisateurs(); })
                .then(charger).catch(function(e){ msg(e.message); charger(); });
            });
          }},
          {lab:'Statut', rendu:function(u,td){ chipCellule(td, u.active?'Actif':'Désactivé', u.active?'c-green':'c-grey'); }},
          {lab:'Dernière connexion', val:function(u){ return u.last_login ? u.last_login.replace('T',' ')+' UTC' : 'Jamais'; }}
        ],
        recherche:function(u){ return u.nom+' '+u.email+' '+((state.roles[u.role]||{}).lab||u.role); },
        filtres:[
          { lab:'Rôle', options:Object.keys(state.roles).map(function(r){ return [r, state.roles[r].lab]; }), test:function(u,v){ return u.role===v; } },
          { lab:'Statut', options:[['1','Actif'],['0','Désactivé']], test:function(u,v){ return String(u.active?1:0)===v; } }
        ],
        nouveau:{ lab:'Nouveau compte', action:function(){ UI.compteNouveau=true; charger(); } },
        actions:function(u,td){
          var tg=boutonCellule(td, u.active?'Désactiver':'Réactiver', function(){
            ask(u.active?u.nom+" perdra immédiatement l'accès à la plateforme.":u.nom+' retrouvera son accès.', function(){
              MP.api('PATCH','/api/auth/users/'+u.id,{active:!u.active}).then(function(){ msg(u.active?'Compte désactivé.':'Compte réactivé.'); charger(); }).catch(function(e){ msg(e.message); });
            }, u.active?'Désactiver ce compte ?':'Réactiver ce compte ?', u.active?'Désactiver':'Réactiver');
          }, 'cpt-actif-'+u.id);
          tg.disabled = u.id===me0;
          var rp=boutonCellule(td, 'Mot de passe', function(){
            demander('Saisissez un mot de passe provisoire (10 caractères minimum), à transmettre à '+u.nom+' par un canal sûr.', function(pw){
              MP.api('PATCH','/api/auth/users/'+u.id,{password:pw}).then(function(){ msg('Mot de passe réinitialisé — à transmettre à '+u.nom+' par un canal sûr.'); }).catch(function(e){ msg(e.message); });
            }, 'Réinitialiser le mot de passe de '+u.nom+' ?', 'Réinitialiser', 'Mot de passe provisoire');
          }, 'cpt-mdp-'+u.id);
          rp.setAttribute('aria-label','Réinitialiser le mot de passe de '+u.nom);
        }
      });
      if(UI.compteNouveau) creation();
    }).catch(function(e){ zone.textContent=''; add(zone,'p','muted',e.message); });
  }
  function creation(){
    var k2=add(formulaire,'div','card'); k2.style.marginTop='18px';
    add(k2,'div','panel-head','Nouveau compte');
    var f=add(add(k2,'div','pad'),'div','frm');
    function champ(lab,type,ph){ var w=add(f,'div'); var id='c'+Math.random().toString(36).slice(2,8); add(w,'label',null,lab).setAttribute('for',id); var i=add(w,'input'); i.id=id; i.type=type; if(ph) i.placeholder=ph; return i; }
    var nom=champ('Nom','text','Ex. K. Yao'), mail=champ('Courriel','email','prenom.nom'+(state.mailSuffix||'@exemple.ci')), pw=champ('Mot de passe initial','password','10 caractères minimum');
    var rw=add(f,'div'); add(rw,'label',null,'Rôle').setAttribute('for','nc-role'); var rs=add(rw,'select'); rs.id='nc-role';
    Object.keys(state.roles).forEach(function(r){ var o=add(rs,'option',null,state.roles[r].lab); o.value=r; });
    if(state.roles.audit) rs.value='audit'; /* moindre privilège par défaut */
    var ft=add(k2,'div','panel-foot');
    add(ft,'span','muted','Le titulaire doit changer ce mot de passe à sa première connexion (menu du compte, en haut à droite).');
    var an=add(ft,'button','btn btn-ghost','Annuler'); an.addEventListener('click',function(){ UI.compteNouveau=false; charger(); });
    var go=add(ft,'button','btn btn-primary','Créer le compte');
    go.addEventListener('click',function(){
      go.disabled=true;
      MP.api('POST','/api/auth/users',{nom:nom.value.trim(), email:mail.value.trim(), role:rs.value, password:pw.value}).then(function(u){
        msg('Compte créé — '+u.nom); UI.compteNouveau=false; return majUtilisateurs();
      }).then(charger).catch(function(e){ msg(e.message); go.disabled=false; });
    });
    k2.scrollIntoView({block:'nearest'});
  }
  charger();
}

function vRoles(m){
  if(!can('roles.edit')) return denyBox(m,'roles.edit');
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Rôles et habilitations');

  var rk=Object.keys(state.roles);
  var confl=[];
  rk.forEach(function(r){ incompatOf(state.roles[r].perms).forEach(function(x){ confl.push({r:r,x:x}); }); });
  if(confl.length){
    var w=add(m,'div','warn'); w.style.marginBottom='18px';
    add(w,'strong',null,confl.length+' cumul(s) incompatible(s) détecté(s). ');
    confl.forEach(function(cc){
      add(w,'div','muted','« '+state.roles[cc.r].lab+' » : '+cc.x[2]);
    });
  }

  var grp=null;
  var card=add(m,'div','card');
  var ph=add(card,'div','panel-head');
  add(ph,'span',null,'Matrice des permissions');
  add(ph,'span','chip c-grey',rk.length+' rôles · '+PERMS.length+' permissions');
  var sx=add(card,'div','scroll-x'); var t=add(sx,'table'); t.style.minWidth='820px';
  t.classList.add('mx');
  var tr=add(add(t,'thead'),'tr');
  add(tr,'th',null,'Permission');
  rk.forEach(function(r){ add(tr,'th',null,state.roles[r].lab); });
  var tb=add(t,'tbody');
  PERMS.forEach(function(pp){
    if(pp.grp!==grp){
      grp=pp.grp;
      var gr=add(tb,'tr'); var gtd=add(gr,'td'); gtd.colSpan=rk.length+1;
      gtd.style.cssText='background:var(--surface-2);font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em';
      gtd.textContent=grp;
    }
    var row=add(tb,'tr');
    add(row,'td',null,pp.lab).style.fontWeight='600';
    rk.forEach(function(r){
      var td=add(row,'td'); td.style.textAlign='center';
      var on=!!state.roles[r].perms[pp.id];
      var b=add(td,'button','pill'+(on?' on':''), on?'✓':'—');
      b.style.cssText+=';min-width:52px;justify-content:center';
      b.setAttribute('aria-pressed', on?'true':'false');
      b.setAttribute('aria-label',(on?'Retirer':'Accorder')+' « '+pp.lab+' » au rôle '+state.roles[r].lab);
      fk(b,'perm-'+r+'-'+pp.id);
      b.addEventListener('click',function(){
        state.roles[r].perms[pp.id]=!on;
        var cf=incompatOf(state.roles[r].perms);
        logit('Habilitation '+(on?'retirée':'accordée')+' — '+state.roles[r].lab+' : '+pp.lab);
        save(); render();
        if(!on && cf.length) toast('Attention : ce cumul crée une incompatibilité de séparation des fonctions.');
      });
    });
  });
  labelize(t);

  var c2=add(m,'div','card'); c2.style.marginTop='18px';
  add(c2,'div','panel-head','Utilisateurs et affectation');
  var b2=add(c2,'div','pad');
  state.users.forEach(function(u){
    var row=add(b2,'div','docline');
    var lf=add(row,'div');
    add(lf,'div',null,u.nom).style.fontWeight='600';
    add(lf,'div','muted', mailAdr(u));
    var sel=add(row,'select'); sel.setAttribute('aria-label','Rôle de '+u.nom); fk(sel,'user-'+u.id);
    rk.forEach(function(r){ var op=add(sel,'option',null,state.roles[r].lab); op.value=r; });
    sel.value=u.role;
    sel.addEventListener('change',function(){
      u.role=sel.value; logit('Affectation modifiée — '+u.nom+' : '+roleLab(u.role)); save(); render();
    });
  });

  var nb=add(m,'div','note');
  add(nb,'strong',null,'Pourquoi la séparation des fonctions compte ici. ');
  nb.appendChild(document.createTextNode("Un même agent qui note les offres et approuve l'attribution rend la procédure indéfendable en cas de recours : il n'existe plus de contrôle croisé à opposer au soumissionnaire évincé. L'outil signale ces cumuls sans les interdire, parce que dans une petite structure ils sont parfois inévitables — mais ils doivent alors être assumés et documentés."));
}
