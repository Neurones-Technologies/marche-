/* Client API + écran de connexion. Les scripts de js/app/ (chargés ensuite) exposent window.MarchePlus. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var pollTimer = null, VERSION = null, TOURS = 0;
  var SONDAGE_MS = 4000; // mise à jour des données : toutes les 4 s, et dès qu'on revient sur l'onglet

  /* Sondage : l'état du serveur, et toutes les 30 s environ la version de l'application (rechargement après mise à
     jour). Suspendu pendant le verrouillage. */
  function sonder() {
    if (!window.MarchePlus) return;
    window.MarchePlus.poll();
    if (++TOURS % 8 === 0) verifierVersion();
  }
  function verifierVersion() {
    return api('GET', '/api/version').then(function (r) {
      if (!VERSION) { VERSION = r.version; return; }
      if (r.version !== VERSION && window.MarchePlus && window.MarchePlus.nouvelleVersion) window.MarchePlus.nouvelleVersion();
    }).catch(function () { /* serveur momentanément injoignable */ });
  }
  function reprendre() { if (!pollTimer && ME) pollTimer = setInterval(sonder, SONDAGE_MS); }
  function suspendre() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && pollTimer) sonder(); });
  window.addEventListener('focus', function () { if (pollTimer) sonder(); });

  function api(method, url, body) {
    var opt = { method: method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(url, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && url.indexOf('/api/auth/login') < 0) { showLogin('Session expirée, reconnectez-vous.'); }
        if (r.status === 403 && j.code === 'SPACE_SUSPENDED') { location.reload(); } // l'espace vient d'être suspendu : sa page le dit
        if (!r.ok) { var e = new Error(j.error || ('Erreur ' + r.status)); e.status = r.status; e.data = j; throw e; }
        return j;
      });
    });
  }
  function upload(url, file) {
    return fetch(url, { method: 'POST', credentials: 'same-origin', body: file,
      headers: { 'Content-Type': 'application/octet-stream', 'x-filename': encodeURIComponent(file.name) } })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 401) showLogin('Session expirée, reconnectez-vous.');
          if (!r.ok) { var e = new Error(j.error || ('Erreur ' + r.status)); e.status = r.status; throw e; }
          return j;
        });
      });
  }
  /* Procédure courante. La liste vient du serveur (un soumissionnaire n'y voit que les procédures publiées) ;
     le choix est mémorisé par utilisateur dans ce navigateur. */
  var PID = null, PROCS = [], ME = null, ESPACE = {};
  var procKey = function () { return 'marcheplus.proc.' + (ME ? ME.id : ''); };
  function loadProcs() {
    return api('GET', '/api/procedures').then(function (r) { PROCS = r.procedures || []; return PROCS; });
  }
  function choose() {
    var saved = null; try { saved = localStorage.getItem(procKey()); } catch (e) { /* stockage indisponible */ }
    var has = function (id) { return PROCS.some(function (p) { return p.id === id; }); };
    // adresse d'un écran de procédure (/appels-offres/<id>/…) : cette procédure, si elle est visible
    var m = /^\/appels-offres\/([^/]+)\/[^/]+\/?$/.exec(location.pathname), voulu = m ? decodeURIComponent(m[1]) : null;
    if (voulu && has(voulu)) return voulu;
    if (saved && has(saved)) return saved;
    var actives = PROCS.filter(function (p) { return !p.archive; });
    return (actives[0] || PROCS[0] || {}).id || null;
  }
  /* Sans procédure ouverte (demandeur, instance vide), les mêmes appels visent l'état de l'organisation. */
  function url(path) { return PID ? '/api/procedures/' + encodeURIComponent(PID) + path : '/api/organisation' + path; }
  /* Ouvre une procédure : charge son état et redémarre l'interface dessus. */
  function switchTo(id, opts) {
    PID = id || null;
    if (PID) try { localStorage.setItem(procKey(), PID); } catch (e) { /* stockage indisponible */ }
    return api('GET', url('/state')).then(function (p) { window.MarchePlus.start(p, opts || {}); });
  }
  window.MP = {
    api: api, upload: upload, url: url, switchTo: switchTo,
    pid: function () { return PID; },
    procs: function () { return PROCS; },
    current: function () { return PROCS.filter(function (p) { return p.id === PID; })[0] || null; },
    refreshProcs: loadProcs,
    moi: function () { return ME; },
    espace: function () { return ESPACE; }, // nom de l'organisation, réinitialisation permise (/api/espace)
    suspendre: suspendre, reprendre: reprendre,
  };

  function showLogin(msg) {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    ME = null; PID = null; PROCS = [];
    if (window.MarchePlus) window.MarchePlus.stop();
    $('usr').hidden = true;
    $('login').hidden = false;
    // l'espace de l'entreprise : son nom au-dessus du formulaire
    api('GET', '/api/espace').then(function (e) { var x = $('lg-espace'); x.hidden = !e.nom; x.textContent = e.nom ? 'Espace de ' + e.nom : ''; }).catch(function () {});
    vueConnexion('login-form');
    var er = $('lg-err');
    er.hidden = !msg; er.textContent = msg || '';
    $('lg-pw').value = '';
    setTimeout(function () { $('lg-email').focus(); }, 0);
  }

  /* fromLogin : connexion explicite (on part de l'accueil) ; sinon rechargement de page (on reprend l'écran). */
  function enter(fromLogin) {
    return api('GET', '/api/auth/me').then(function (m) {
      ME = m.user;
      return api('GET', '/api/espace').then(function (e) { ESPACE = e || {}; }, function () { ESPACE = {}; }).then(loadProcs).then(function () {
        $('login').hidden = true;
        $('usr').hidden = false;
        var un = $('usr-name'); un.textContent = '';
        var n1 = document.createElement('span'); n1.className = 'usr-nom'; n1.textContent = m.user.nom; un.appendChild(n1);
        var n2 = document.createElement('span'); n2.className = 'usr-role'; n2.textContent = m.user.roleLab; un.appendChild(n2);
        $('usr-av').textContent = m.user.nom.replace(/[^A-Za-zÀ-ÿ ]/g, ' ').split(/\s+/).filter(Boolean).map(function (x) { return x[0]; }).join('').slice(0, 2).toUpperCase();
        return switchTo(choose(), { fromLogin: fromLogin === true }).then(function () {
          reprendre();
          if (!VERSION) verifierVersion();
        });
      });
    });
  }

  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var b = $('lg-go'); b.disabled = true;
    api('POST', '/api/auth/login', { email: $('lg-email').value, password: $('lg-pw').value })
      .then(function () { return enter(true); })
      .catch(function (err) { var er = $('lg-err'); er.hidden = false; er.textContent = err.message; })
      .then(function () { b.disabled = false; });
  });

  $('btn-logout').addEventListener('click', function () {
    api('POST', '/api/auth/logout', {}).catch(function () {}).then(function () { try { history.replaceState(null, '', '/'); } catch (e) { /* sans historique */ } showLogin(); });
  });

  $('btn-pwd').addEventListener('click', function () {
    var d = $('dlg'); d.hidden = false; d.textContent = '';
    var f = document.createElement('form');
    f.innerHTML = '<strong>Changer le mot de passe</strong>' +
      '<label for="pw0">Mot de passe actuel</label><input id="pw0" type="password" autocomplete="current-password" required>' +
      '<label for="pw1">Nouveau mot de passe</label><input id="pw1" type="password" autocomplete="new-password" required>' +
      '<small class="muted">10 caractères minimum, avec majuscule, minuscule et chiffre.</small>' +
      '<div class="lg-err" id="pw-err" hidden></div>' +
      '<div class="acts"><button type="button" class="btn btn-ghost" id="pw-cancel">Annuler</button><button type="submit" class="btn btn-primary">Enregistrer</button></div>';
    d.appendChild(f);
    $('pw0').focus();
    $('pw-cancel').onclick = function () { d.hidden = true; };
    f.onsubmit = function (e) {
      e.preventDefault();
      api('POST', '/api/auth/password', { current: $('pw0').value, next: $('pw1').value })
        .then(function () { d.hidden = true; var t = $('toast'); t.textContent = 'Mot de passe modifié.'; t.classList.add('on'); setTimeout(function () { t.classList.remove('on'); }, 3000); })
        .catch(function (err) { var er = $('pw-err'); er.hidden = false; er.textContent = err.message; });
    };
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('dlg').hidden = true; });

  /* Vérification du courriel d'un partenaire inscrit sur le portail (/portail-partenaires), par le lien reçu (/?verifier=…). */
  var jeton = (location.search.match(/[?&]verifier=([0-9a-f]{64})/) || [])[1];
  if (jeton) {
    history.replaceState(null, '', location.pathname); // le jeton ne reste ni dans la barre d'adresse ni dans l'historique
    api('POST', '/api/inscription/verifier', { jeton: jeton })
      .then(function (r) { var o = $('lg-ok'); o.hidden = false; o.textContent = r.message; })
      .catch(function (err) { var er = $('lg-err'); er.hidden = false; er.textContent = err.message; });
  }

  /* Mot de passe oublié : demande du lien, puis nouveau mot de passe par le lien reçu (/?reinit=…). */
  function vueConnexion(id) { ['login-form', 'oubli-form', 'reinit-form'].forEach(function (x) { $(x).hidden = x !== id; }); }
  $('lg-oubli').addEventListener('click', function () {
    vueConnexion('oubli-form'); $('ob-email').value = $('lg-email').value; $('ob-err').hidden = true; $('ob-ok').hidden = true; $('ob-email').focus();
  });
  $('ob-retour').addEventListener('click', function () { vueConnexion('login-form'); $('lg-email').focus(); });
  $('oubli-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var b = $('ob-go'); b.disabled = true; $('ob-err').hidden = true;
    api('POST', '/api/auth/oubli', { email: $('ob-email').value })
      .then(function (r) {
        var o = $('ob-ok'); o.hidden = false; o.textContent = r.message;
        if (r.lien) { // démonstration : courriels non configurés
          o.appendChild(document.createElement('br'));
          var a = document.createElement('a'); a.href = r.lien; a.textContent = 'Ouvrir le lien (démonstration : courriels non configurés)'; o.appendChild(a);
        }
      })
      .catch(function (err) { var er = $('ob-err'); er.hidden = false; er.textContent = err.message; })
      .then(function () { b.disabled = false; });
  });
  var jetonReinit = (location.search.match(/[?&]reinit=([0-9a-f]{64})/) || [])[1];
  if (jetonReinit) history.replaceState(null, '', location.pathname); // le jeton ne reste ni dans la barre d'adresse ni dans l'historique
  $('reinit-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var er = $('ri-err'); er.hidden = true;
    if ($('ri-pw1').value !== $('ri-pw2').value) { er.hidden = false; er.textContent = 'Les deux saisies ne correspondent pas.'; return; }
    var b = $('ri-go'); b.disabled = true;
    api('POST', '/api/auth/reinit', { jeton: jetonReinit, motDePasse: $('ri-pw1').value })
      .then(function (r) { jetonReinit = null; vueConnexion('login-form'); var o = $('lg-ok'); o.hidden = false; o.textContent = r.message; $('lg-email').focus(); })
      .catch(function (err) { er.hidden = false; er.textContent = err.message; })
      .then(function () { b.disabled = false; });
  });

  // Démarrage : lien de réinitialisation ? sinon session existante, ou écran de connexion.
  if (jetonReinit) { showLogin(); vueConnexion('reinit-form'); setTimeout(function () { $('ri-pw1').focus(); }, 0); }
  else api('GET', '/api/auth/me').then(function () { return enter(false); }).catch(function () { showLogin(); });

})();
