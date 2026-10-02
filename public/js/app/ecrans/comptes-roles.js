/* Marché+ — Écrans Comptes et Rôles.
   Script classique partagé (voir js/app/LISEZMOI.md) : chargé par index.html dans l'ordre, sans build. */
"use strict";

/* ============ Rôles et habilitations ============ */
function vComptes(m){
  if(!can('roles.edit')) return denyBox(m,'roles.edit');
  var h=add(m,'div','head'); var l=add(h,'div');
  add(l,'h1',null,'Comptes utilisateurs');

  var card=add(m,'div','card');
  add(card,'div','panel-head','Comptes');
  var body=add(card,'div','pad'); add(body,'p','muted','Chargement…');
  var me0=state.me;
  function msg(t){ toast(t); }
  function charger(){
    MP.api('GET','/api/auth/users').then(function(list){
      body.textContent='';
      var tbl=add(body,'table','tbl'); tbl.style.width='100%';
      var thr=add(add(tbl,'thead'),'tr');
      ['Nom','Courriel','Rôle','Statut','Dernière connexion','Actions'].forEach(function(t){ add(thr,'th',null,t).style.textAlign='left'; });
      var tb=add(tbl,'tbody');
      list.forEach(function(u){
        var tr=add(tb,'tr'); tr.style.opacity=u.active?'1':'.55';
        add(tr,'td',null,u.nom).style.fontWeight='600';
        add(tr,'td',null,u.email);
        var tdr=add(tr,'td'); var sel=add(tdr,'select'); sel.setAttribute('aria-label','Rôle de '+u.nom);
        Object.keys(state.roles).forEach(function(r){ var o=add(sel,'option',null,state.roles[r].lab); o.value=r; if(r===u.role) o.selected=true; });
        sel.disabled = u.id===me0;
        sel.addEventListener('change',function(){
          MP.api('PATCH','/api/auth/users/'+u.id,{role:sel.value}).then(function(){ msg('Rôle modifié — '+u.nom); return MP.api('GET',MP.url('/state')); })
            .then(function(p){ var us=p.state.users; state.users=us; synced.users=JSON.stringify(us); charger(); })
            .catch(function(e){ msg(e.message); charger(); });
        });
        var st=add(add(tr,'td'),'span','chip '+(u.active?'c-green':'c-grey'),u.active?'Actif':'Désactivé');
        add(tr,'td','muted',u.last_login?u.last_login.replace('T',' ')+' UTC':'Jamais');
        var ta=add(tr,'td'); ta.style.cssText='display:flex;gap:6px;flex-wrap:wrap';
        var tg=add(ta,'button','btn btn-ghost btn-sm',u.active?'Désactiver':'Réactiver'); tg.disabled=u.id===me0;
        tg.addEventListener('click',function(){
          ask(u.active?u.nom+" perdra immédiatement l'accès à la plateforme.":u.nom+' retrouvera son accès.', function(){
            MP.api('PATCH','/api/auth/users/'+u.id,{active:!u.active}).then(function(){ msg(u.active?'Compte désactivé.':'Compte réactivé.'); charger(); }).catch(function(e){ msg(e.message); });
          }, u.active?'Désactiver ce compte ?':'Réactiver ce compte ?', u.active?'Désactiver':'Réactiver');
        });
        var rp=add(ta,'button','btn btn-ghost btn-sm','Réinitialiser le mot de passe'); rp.setAttribute('aria-label','Réinitialiser le mot de passe de '+u.nom);
        rp.addEventListener('click',function(){
          var pw=window.prompt('Nouveau mot de passe provisoire pour '+u.nom+' (10 caractères minimum) :');
          if(!pw) return;
          MP.api('PATCH','/api/auth/users/'+u.id,{password:pw}).then(function(){ msg('Mot de passe réinitialisé — à transmettre à '+u.nom+' par un canal sûr.'); }).catch(function(e){ msg(e.message); });
        });
      });
      labelize(tbl);
    }).catch(function(e){ body.textContent=''; add(body,'p','muted',e.message); });
  }
  charger();

  var k2=add(m,'div','card'); k2.style.marginTop='18px';
  add(k2,'div','panel-head','Créer un compte');
  var f=add(add(k2,'div','pad'),'div','frm');
  function champ(lab,type,ph){ var w=add(f,'div'); var id='c'+Math.random().toString(36).slice(2,8); add(w,'label',null,lab).setAttribute('for',id); var i=add(w,'input'); i.id=id; i.type=type; if(ph) i.placeholder=ph; return i; }
  var nom=champ('Nom','text','Ex. K. Yao'), mail=champ('Courriel','email','prenom.nom'+(state.mailSuffix||'@exemple.ci')), pw=champ('Mot de passe initial','password','10 caractères minimum');
  var rw=add(f,'div'); add(rw,'label',null,'Rôle').setAttribute('for','nc-role'); var rs=add(rw,'select'); rs.id='nc-role';
  Object.keys(state.roles).forEach(function(r){ var o=add(rs,'option',null,state.roles[r].lab); o.value=r; });
  if(state.roles.audit) rs.value='audit'; /* moindre privilège par défaut */
  var ft=add(k2,'div','panel-foot');
  add(ft,'span','muted','Le titulaire doit changer ce mot de passe à sa première connexion (bouton « Mot de passe » en haut de l\u2019écran).');
  var go=add(ft,'button','btn btn-primary','Créer le compte');
  go.addEventListener('click',function(){
    go.disabled=true;
    MP.api('POST','/api/auth/users',{nom:nom.value.trim(), email:mail.value.trim(), role:rs.value, password:pw.value}).then(function(u){
      msg('Compte créé — '+u.nom); nom.value=''; mail.value=''; pw.value='';
      return MP.api('GET',MP.url('/state')).then(function(p){ state.users=p.state.users; synced.users=JSON.stringify(p.state.users); });
    }).then(charger).catch(function(e){ msg(e.message); }).then(function(){ go.disabled=false; });
  });
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
