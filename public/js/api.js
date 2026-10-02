/* Client API + écran de connexion. app.js (chargé ensuite) expose window.MarchePlus. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var pollTimer = null;

  function api(method, url, body) {
    var opt = { method: method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(url, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && url.indexOf('/api/auth/login') < 0) { showLogin('Session expirée, reconnectez-vous.'); }
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
  window.MP = { api: api, upload: upload };

  function showLogin(msg) {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (window.MarchePlus) window.MarchePlus.stop();
    $('usr').hidden = true;
    $('login').hidden = false;
    var er = $('lg-err');
    er.hidden = !msg; er.textContent = msg || '';
    $('lg-pw').value = '';
    setTimeout(function () { $('lg-email').focus(); }, 0);
  }

  /* fromLogin : connexion explicite (on part de l'accueil) ; sinon rechargement de page (on reprend l'écran). */
  function enter(fromLogin) {
    return api('GET', '/api/state').then(function (p) {
      return api('GET', '/api/auth/me').then(function (m) {
        $('login').hidden = true;
        $('usr').hidden = false;
        $('usr-name').textContent = m.user.nom + ' · ' + m.user.roleLab;
        $('usr-av').textContent = m.user.nom.replace(/[^A-Za-zÀ-ÿ ]/g, ' ').split(/\s+/).filter(Boolean).map(function (x) { return x[0]; }).join('').slice(0, 2).toUpperCase();
        window.MarchePlus.start(p, { fromLogin: fromLogin === true });
        if (!pollTimer) pollTimer = setInterval(function () { window.MarchePlus.poll(); }, 8000);
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
    api('POST', '/api/auth/logout', {}).catch(function () {}).then(function () { showLogin(); });
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

  // Démarrage : session existante ? sinon écran de connexion.
  api('GET', '/api/auth/me').then(function () { return enter(false); }).catch(function () { showLogin(); });

  // Comptes de démonstration (affichés seulement si l'instance les expose)
  api('GET', '/api/auth/demo').then(function (r) {
    if (!r.accounts || !r.accounts.length) return;
    var box = $('lg-demo-list'); $('lg-demo').hidden = false;
    r.accounts.forEach(function (a) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = a.nom + ' — ' + a.roleLab + ' (' + a.email + ')';
      b.onclick = function () { $('lg-email').value = a.email; $('lg-pw').focus(); };
      box.appendChild(b);
    });
    var n = document.createElement('div'); n.className = 'muted'; n.style.marginTop = '8px'; n.textContent = 'Mot de passe de démonstration : ' + r.hint; box.appendChild(n);
  }).catch(function () {});
})();
