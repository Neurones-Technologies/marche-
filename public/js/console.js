/* Console de la plateforme : demandes d'espace à examiner, espaces (activité, suspension, suppression, création à
   la main), opérateurs et journal. JS natif, sans dépendance ; l'API est /api/console. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ICONES = {
    ok: '<path d="m5 12 5 5 9-10"/>',
    non: '<path d="M6 6l12 12M18 6 6 18"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    lecture: '<path d="M7 5v14l11-7z"/>',
    poubelle: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    lien: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    oeil: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    recherche: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    attente: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    espace: '<path d="M4 20V8l8-4 8 4v12"/><path d="M9 20v-6h6v6"/>',
    pause2: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
    personnes: '<path d="M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1"/><circle cx="9" cy="8" r="4"/><path d="M22 20v-1a4 4 0 0 0-3-3.9M16 4.1a4 4 0 0 1 0 7.8"/>',
    vide: '<path d="M3 7l9-4 9 4-9 4z"/><path d="M3 12l9 4 9-4M3 17l9 4 9-4"/>',
  };
  var ic = function (n, cls) { return '<svg class="cs-ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + ICONES[n] + '</svg>'; };
  var PROFILS = { 'uemoa-ci': 'Marchés publics', prive: 'Achats privés' };
  var profilLab = function (p) { return PROFILS[p] || (window.MPProfils && p ? MPProfils.profil(p).lab : '—'); };
  /* Dates du registre : UTC « AAAA-MM-JJ HH:MM:SS ». */
  function date(t, avecHeure) {
    if (!t) return '—';
    var d = new Date(String(t).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? '' : 'Z'));
    if (isNaN(d)) return esc(t);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) + (avecHeure ? ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '');
  }
  function depuis(t) {
    if (!t) return 'jamais';
    var d = new Date(String(t).replace(' ', 'T') + 'Z'), s = (Date.now() - d) / 1000;
    if (isNaN(s)) return '—';
    if (s < 3600) return 'il y a ' + Math.max(1, Math.round(s / 60)) + ' min';
    if (s < 86400) return 'il y a ' + Math.round(s / 3600) + ' h';
    if (s < 86400 * 30) return 'il y a ' + Math.round(s / 86400) + ' j';
    return date(t);
  }
  var taille = function (o) { return !o ? '—' : o < 1048576 ? Math.max(1, Math.round(o / 1024)) + ' Ko' : (o / 1048576).toFixed(1).replace('.', ',') + ' Mo'; };
  var initiales = function (n) { return String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (m) { return m[0]; }).join('').toUpperCase(); };

  function api(method, url, body) {
    var opt = { method: method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch('/api/console' + url, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && url !== '/connexion') { afficherConnexion(); }
        if (!r.ok) { var e = new Error(j.error || 'Erreur ' + r.status); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  var toastMinuterie = null;
  function toast(t) { var e = $('cs-toast'); e.textContent = t; e.hidden = false; clearTimeout(toastMinuterie); toastMinuterie = setTimeout(function () { e.hidden = true; }, 3200); }

  /* ── Fenêtre (popup) ── */
  var fen = $('cs-fenetre');
  function ouvrir(titre, html, apres) {
    $('cs-fenetre-titre').textContent = titre;
    $('cs-fenetre-corps').innerHTML = html;
    if (!fen.open) fen.showModal();
    if (apres) apres($('cs-fenetre-corps'));
    var champ = $('cs-fenetre-corps').querySelector('input:not([type=hidden]),textarea,select');
    if (champ) champ.focus();
  }
  function fermer() { if (fen.open) fen.close(); }
  fen.addEventListener('click', function (e) { if (e.target === fen) fermer(); });
  function erreurFenetre(m) { var e = $('cs-fenetre-corps').querySelector('.pf-message'); if (e) { e.textContent = m; e.hidden = !m; } }

  /* ── Connexion ── */
  var MOI = null, ETAT = { inscriptions: [], espaces: [] }, ONGLET = 'demandes', RECHERCHE = '', FILTRE = 'tous';
  function afficherConnexion() { MOI = null; $('cs-app').hidden = true; $('cs-connexion').hidden = false; $('cs-email').focus(); }
  $('cs-login').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('cs-login-erreur'); err.hidden = true;
    api('POST', '/connexion', { email: $('cs-email').value.trim(), motDePasse: $('cs-mdp').value })
      .then(function () { $('cs-mdp').value = ''; demarrer(); })
      .catch(function (x) { err.textContent = x.message; err.hidden = false; });
  });

  function demarrer() {
    api('GET', '/moi').then(function (j) {
      MOI = j;
      $('cs-connexion').hidden = true; $('cs-app').hidden = false;
      $('cs-moi').textContent = initiales(j.operateur.nom);
      $('cs-menu-tete').innerHTML = '<strong>' + esc(j.operateur.nom) + '</strong><small>' + esc(j.operateur.email) + '</small>';
      var o = (location.hash || '').replace('#', '');
      if (['demandes', 'espaces', 'operateurs', 'journal'].indexOf(o) >= 0) ONGLET = o;
      charger();
    }).catch(function () {});
  }

  function charger() {
    return api('GET', '/tableau').then(function (j) { ETAT = j; dessiner(); });
  }

  /* ── Rendu ── */
  function dessiner() {
    var attente = ETAT.inscriptions.filter(function (i) { return i.statut === 'attente'; });
    var actifs = ETAT.espaces.filter(function (e) { return e.actif; });
    var comptes = ETAT.espaces.reduce(function (s, e) { return s + ((e.activite || {}).comptes || 0); }, 0);
    var nb = $('cs-nb-attente'); nb.textContent = attente.length; nb.hidden = !attente.length;
    $('cs-chiffres').innerHTML = [
      ['attente', attente.length, 'Demande' + (attente.length > 1 ? 's' : '') + ' à examiner', attente.length ? 'chaud' : ''],
      ['espace', actifs.length, 'Espace' + (actifs.length > 1 ? 's' : '') + ' actif' + (actifs.length > 1 ? 's' : ''), ''],
      ['pause2', ETAT.espaces.length - actifs.length, 'Suspendu' + (ETAT.espaces.length - actifs.length > 1 ? 's' : ''), ''],
      ['personnes', comptes, 'Utilisateurs au total', ''],
    ].map(function (c) {
      return '<div class="cs-chiffre ' + c[3] + '">' + ic(c[0]) + '<div><strong>' + c[1] + '</strong><span>' + c[2] + '</span></div></div>';
    }).join('');
    var avis = $('cs-avis');
    avis.hidden = !(MOI && !MOI.courriels);
    avis.innerHTML = 'Les courriels ne sont pas encore envoyés (Microsoft 365 non configuré) : prévenez vous-même les entreprises de vos décisions.';
    document.querySelectorAll('#cs-onglets [data-onglet]').forEach(function (b) { b.classList.toggle('on', b.dataset.onglet === ONGLET); b.setAttribute('aria-current', b.dataset.onglet === ONGLET ? 'page' : 'false'); });
    if (ONGLET === 'demandes') vueDemandes();
    else if (ONGLET === 'espaces') vueEspaces();
    else if (ONGLET === 'operateurs') vueOperateurs();
    else vueJournal();
  }

  function vide(titre, texte) {
    return '<div class="cs-vide">' + ic('vide') + '<strong>' + titre + '</strong><span>' + texte + '</span></div>';
  }

  function vueDemandes() {
    var attente = ETAT.inscriptions.filter(function (i) { return i.statut === 'attente'; });
    var traitees = ETAT.inscriptions.filter(function (i) { return i.statut !== 'attente'; });
    var h = '<div class="cs-entete"><div><h1>Demandes d’espace</h1><p>Les entreprises qui ont confirmé leur courriel attendent votre accord.</p></div></div>';
    h += attente.length ? '<div class="cs-cartes">' + attente.map(function (i) {
      return '<article class="cs-demande">' +
        '<div class="cs-demande-tete"><span class="cs-logo-ent">' + esc(initiales(i.nom)) + '</span><div><h3>' + esc(i.nom) + '</h3><span class="cs-muet">' + esc(i.pays || '—') + ' · ' + esc(profilLab(i.profil)) + '</span></div><span class="cs-statut attente">' + ic('attente') + 'En attente</span></div>' +
        '<dl class="cs-dl">' +
          '<div><dt>Adresse demandée</dt><dd class="cs-adresse">' + esc(i.adresse.replace(/^https?:\/\//, '')) + '</dd></div>' +
          '<div><dt>Administrateur</dt><dd>' + esc(i.admin.nom) + '<small>' + esc(i.admin.email) + '</small></dd></div>' +
          '<div><dt>Reçue</dt><dd>' + date(i.recueLe, true) + '<small>' + depuis(i.recueLe) + '</small></dd></div>' +
        '</dl>' +
        '<div class="cs-demande-actions"><button class="btn btn-ghost" data-action="refuser" data-id="' + i.id + '">' + ic('non') + 'Refuser</button>' +
        '<button class="btn btn-primary" data-action="accepter" data-id="' + i.id + '">' + ic('ok') + 'Accepter et ouvrir l’espace</button></div>' +
      '</article>';
    }).join('') + '</div>' : vide('Aucune demande en attente', 'Les nouvelles inscriptions apparaîtront ici dès que leur courriel sera confirmé.');
    if (traitees.length) {
      h += '<h2 class="cs-sous-titre">Décisions des 90 derniers jours</h2><div class="cs-table-cadre"><table class="cs-table"><thead><tr><th>Entreprise</th><th>Adresse</th><th>Décision</th><th>Par</th><th>Le</th></tr></thead><tbody>' +
        traitees.map(function (i) {
          var ok = i.statut === 'acceptee';
          return '<tr><td><strong>' + esc(i.nom) + '</strong><small>' + esc(i.admin.email) + '</small></td><td class="cs-adresse">' + esc(i.slug) + '</td>' +
            '<td><span class="cs-statut ' + (ok ? 'actif' : 'refuse') + '">' + (ok ? 'Acceptée' : 'Refusée') + '</span>' + (i.motif ? '<small>' + esc(i.motif) + '</small>' : '') + '</td>' +
            '<td>' + esc(i.decideePar || '—') + '</td><td>' + date(i.decideeLe) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    $('cs-vue').innerHTML = h;
  }

  function vueEspaces() {
    var q = RECHERCHE.toLowerCase();
    var liste = ETAT.espaces.filter(function (e) {
      if (FILTRE === 'actifs' && !e.actif) return false;
      if (FILTRE === 'suspendus' && e.actif) return false;
      return !q || (e.nom + ' ' + e.slug + ' ' + (e.adminEmail || '')).toLowerCase().indexOf(q) >= 0;
    });
    var h = '<div class="cs-entete"><div><h1>Espaces</h1><p>Chaque entreprise, son adresse, son activité.</p></div>' +
      '<button class="btn btn-primary" data-action="nouvel-espace">' + ic('plus') + 'Nouvel espace</button></div>';
    h += '<div class="cs-outils"><label class="cs-recherche">' + ic('recherche') + '<span class="pf-sr">Rechercher</span><input id="cs-recherche" type="search" placeholder="Rechercher une entreprise, une adresse, un courriel" value="' + esc(RECHERCHE) + '"></label>' +
      '<div class="cs-segments" role="group" aria-label="Filtrer">' + [['tous', 'Tous'], ['actifs', 'Actifs'], ['suspendus', 'Suspendus']].map(function (f) {
        return '<button type="button" data-filtre="' + f[0] + '" class="' + (FILTRE === f[0] ? 'on' : '') + '">' + f[1] + '</button>';
      }).join('') + '</div></div>';
    if (!liste.length) { $('cs-vue').innerHTML = h + vide('Aucun espace', RECHERCHE || FILTRE !== 'tous' ? 'Aucun espace ne correspond à ce filtre.' : 'Les espaces ouverts apparaîtront ici.'); lierRecherche(); return; }
    h += '<div class="cs-table-cadre"><table class="cs-table"><thead><tr><th>Entreprise</th><th>Statut</th><th class="n">Utilisateurs</th><th class="n">Prestataires</th><th class="n">Appels d’offres</th><th>Dernière connexion</th><th>Créé le</th><th><span class="pf-sr">Actions</span></th></tr></thead><tbody>' +
      liste.map(function (e) {
        var a = e.activite || {};
        return '<tr data-action="detail" data-slug="' + esc(e.slug) + '" class="cs-ligne">' +
          '<td><div class="cs-ent"><span class="cs-logo-ent petit">' + esc(initiales(e.nom)) + '</span><div><strong>' + esc(e.nom) + '</strong><small class="cs-adresse">' + esc(e.adresse.replace(/^https?:\/\//, '')) + '</small></div></div></td>' +
          '<td>' + statut(e) + '</td>' +
          '<td class="n">' + (a.comptes == null ? '—' : a.comptes) + '</td><td class="n">' + (a.prestataires == null ? '—' : a.prestataires) + '</td><td class="n">' + (a.procedures == null ? '—' : a.procedures) + '</td>' +
          '<td>' + depuis(a.derniereConnexion) + '</td><td>' + date(e.creeLe) + '</td>' +
          '<td class="cs-actions">' +
            '<a class="cs-icone" href="' + esc(e.adresse) + '/" target="_blank" rel="noopener" title="Ouvrir l’espace" aria-label="Ouvrir l’espace ' + esc(e.nom) + '">' + ic('lien') + '</a>' +
            (e.actif
              ? (e.initial ? '' : '<button class="cs-icone" data-action="suspendre" data-slug="' + esc(e.slug) + '" title="Suspendre" aria-label="Suspendre ' + esc(e.nom) + '">' + ic('pause') + '</button>')
              : '<button class="cs-icone" data-action="reactiver" data-slug="' + esc(e.slug) + '" title="Réactiver" aria-label="Réactiver ' + esc(e.nom) + '">' + ic('lecture') + '</button>' +
                '<button class="cs-icone danger" data-action="supprimer" data-slug="' + esc(e.slug) + '" title="Supprimer définitivement" aria-label="Supprimer ' + esc(e.nom) + '">' + ic('poubelle') + '</button>') +
          '</td></tr>';
      }).join('') + '</tbody></table></div>';
    $('cs-vue').innerHTML = h;
    lierRecherche();
  }
  function statut(e) {
    if (!e.actif) return '<span class="cs-statut suspendu">Suspendu</span>';
    return '<span class="cs-statut actif">Actif</span>' + (e.initial ? '<span class="cs-statut neutre">Démo</span>' : '');
  }
  function lierRecherche() {
    var r = $('cs-recherche'); if (!r) return;
    r.addEventListener('input', function () { RECHERCHE = r.value; var pos = r.selectionStart; vueEspaces(); var n = $('cs-recherche'); n.focus(); n.setSelectionRange(pos, pos); });
  }

  function vueOperateurs() {
    $('cs-vue').innerHTML = '<div class="cs-entete"><div><h1>Opérateurs</h1><p>Les personnes qui ont accès à cette console.</p></div><button class="btn btn-primary" data-action="nouvel-operateur">' + ic('plus') + 'Ajouter un opérateur</button></div><div id="cs-ops" class="cs-charge">Chargement…</div>';
    api('GET', '/operateurs').then(function (j) {
      $('cs-ops').outerHTML = '<div class="cs-table-cadre"><table class="cs-table"><thead><tr><th>Opérateur</th><th>Statut</th><th>Dernière connexion</th><th>Ajouté le</th><th><span class="pf-sr">Actions</span></th></tr></thead><tbody>' +
        j.operateurs.map(function (o) {
          var moi = MOI && o.id === MOI.operateur.id;
          return '<tr><td><div class="cs-ent"><span class="cs-avatar petit">' + esc(initiales(o.nom)) + '</span><div><strong>' + esc(o.nom) + (moi ? ' <span class="cs-muet">(vous)</span>' : '') + '</strong><small>' + esc(o.email) + '</small></div></div></td>' +
            '<td>' + (o.actif ? '<span class="cs-statut actif">Actif</span>' : '<span class="cs-statut suspendu">Désactivé</span>') + '</td>' +
            '<td>' + depuis(o.derniere_connexion) + '</td><td>' + date(o.cree_le) + '</td>' +
            '<td class="cs-actions">' + (moi ? '' : '<button class="btn btn-ghost btn-sm" data-action="basculer-operateur" data-id="' + o.id + '" data-actif="' + (o.actif ? 0 : 1) + '">' + (o.actif ? 'Désactiver' : 'Réactiver') + '</button>') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }).catch(function (x) { $('cs-ops').textContent = x.message; });
  }

  function vueJournal() {
    $('cs-vue').innerHTML = '<div class="cs-entete"><div><h1>Journal</h1><p>Toutes les actions menées sur la plateforme, les plus récentes d’abord.</p></div></div><div id="cs-jn" class="cs-charge">Chargement…</div>';
    api('GET', '/journal').then(function (j) {
      $('cs-jn').outerHTML = j.journal.length ? '<div class="cs-table-cadre"><table class="cs-table"><thead><tr><th>Date</th><th>Auteur</th><th>Action</th><th>Adresse IP</th></tr></thead><tbody>' +
        j.journal.map(function (l) { return '<tr><td class="cs-nowrap">' + date(l.t, true) + '</td><td>' + esc(l.auteur) + '</td><td>' + esc(l.action) + '</td><td class="cs-mono">' + esc(l.ip || '—') + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : vide('Journal vide', 'Les actions apparaîtront ici.');
    }).catch(function (x) { $('cs-jn').textContent = x.message; });
  }

  /* ── Actions ── */
  var espaceDe = function (slug) { return ETAT.espaces.filter(function (e) { return e.slug === slug; })[0]; };
  var demandeDe = function (id) { return ETAT.inscriptions.filter(function (i) { return String(i.id) === String(id); })[0]; };
  var MSG = '<div class="pf-message" role="alert" hidden></div>';

  function detail(e) {
    var a = e.activite || {};
    ouvrir(e.nom, '<div class="cs-detail-tete"><span class="cs-logo-ent">' + esc(initiales(e.nom)) + '</span><div><a class="cs-adresse" href="' + esc(e.adresse) + '/" target="_blank" rel="noopener">' + esc(e.adresse.replace(/^https?:\/\//, '')) + ' ' + ic('lien') + '</a><div>' + statut(e) + '</div></div></div>' +
      (!e.actif ? '<div class="cs-bandeau">Suspendu le ' + date(e.suspenduLe, true) + (e.motif ? ' — ' + esc(e.motif) : '') + '</div>' : '') +
      '<div class="cs-mini-chiffres">' + [['Utilisateurs', a.comptes], ['Prestataires', a.prestataires], ['Appels d’offres', a.procedures], ['Commandes', a.commandes]].map(function (c) {
        return '<div><strong>' + (c[1] == null ? '—' : c[1]) + '</strong><span>' + c[0] + '</span></div>'; }).join('') + '</div>' +
      '<dl class="cs-dl deux">' +
        '<div><dt>Pays</dt><dd>' + esc(e.pays || '—') + '</dd></div>' +
        '<div><dt>Type d’acheteur</dt><dd>' + esc(profilLab(e.profil)) + '</dd></div>' +
        '<div><dt>Administrateur</dt><dd>' + esc(e.adminEmail || '—') + '</dd></div>' +
        '<div><dt>Origine</dt><dd>' + esc(e.origine === 'console' ? 'créé dans la console' : e.origine === 'en ligne' ? 'inscription en ligne' : e.origine) + '</dd></div>' +
        '<div><dt>Créé le</dt><dd>' + date(e.creeLe, true) + '</dd></div>' +
        '<div><dt>Dernière connexion</dt><dd>' + depuis(a.derniereConnexion) + '</dd></div>' +
        '<div><dt>Volume</dt><dd>' + taille(a.octets) + '</dd></div>' +
      '</dl>' +
      '<div class="cs-pied-fen">' + (e.actif
        ? (e.initial ? '<span class="cs-muet">L’espace de démonstration ne peut être ni suspendu ni supprimé.</span>' : '<button class="btn btn-ghost" data-action="suspendre" data-slug="' + esc(e.slug) + '">' + ic('pause') + 'Suspendre</button>')
        : '<button class="btn btn-ghost danger" data-action="supprimer" data-slug="' + esc(e.slug) + '">' + ic('poubelle') + 'Supprimer</button><button class="btn btn-primary" data-action="reactiver" data-slug="' + esc(e.slug) + '">' + ic('lecture') + 'Réactiver</button>') + '</div>');
  }

  function formMotif(titre, intro, libelle, bouton, cls, envoyer) {
    ouvrir(titre, '<form class="cs-form" novalidate>' + MSG + '<p class="cs-intro">' + intro + '</p><label for="cs-motif">' + libelle + '</label><textarea id="cs-motif" rows="3" maxlength="500" required></textarea>' +
      '<div class="cs-pied-fen"><button type="button" class="btn btn-ghost" data-action="fermer">Annuler</button><button class="btn ' + cls + '" type="submit">' + bouton + '</button></div></form>', function (c) {
      c.querySelector('form').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var m = $('cs-motif').value.trim();
        if (!m) { erreurFenetre('Indiquez le motif.'); return; }
        envoyer(m);
      });
    });
  }

  var ACTIONS = {
    accepter: function (b) {
      var i = demandeDe(b.dataset.id); if (!i) return;
      ouvrir('Ouvrir l’espace de ' + i.nom, MSG + '<p class="cs-intro">L’espace <strong class="cs-adresse">' + esc(i.adresse.replace(/^https?:\/\//, '')) + '</strong> sera créé, et <strong>' + esc(i.admin.nom) + '</strong> pourra s’y connecter avec le mot de passe choisi à l’inscription.' + (MOI.courriels ? ' Un courriel le lui annoncera.' : ' Les courriels n’étant pas configurés, prévenez-le vous-même.') + '</p>' +
        '<div class="cs-pied-fen"><button type="button" class="btn btn-ghost" data-action="fermer">Annuler</button><button class="btn btn-primary" data-action="confirmer-acceptation" data-id="' + i.id + '">' + ic('ok') + 'Accepter et ouvrir</button></div>');
    },
    'confirmer-acceptation': function (b) {
      b.disabled = true;
      api('POST', '/inscriptions/' + b.dataset.id + '/accepter', {}).then(function (j) { fermer(); toast('Espace ' + j.espace.slug + ' ouvert.'); charger(); })
        .catch(function (x) { erreurFenetre(x.message); b.disabled = false; });
    },
    refuser: function (b) {
      var i = demandeDe(b.dataset.id); if (!i) return;
      formMotif('Refuser la demande de ' + i.nom, 'L’adresse <strong class="cs-adresse">' + esc(i.slug) + '</strong> redeviendra libre.' + (MOI.courriels ? ' Le motif sera envoyé à ' + esc(i.admin.email) + '.' : ''),
        'Motif du refus', 'Refuser la demande', 'btn-danger', function (m) {
          api('POST', '/inscriptions/' + i.id + '/refuser', { motif: m }).then(function () { fermer(); toast('Demande refusée.'); charger(); }).catch(function (x) { erreurFenetre(x.message); });
        });
    },
    detail: function (b, ev) { if (ev.target.closest('a,button')) return; var e = espaceDe(b.dataset.slug); if (e) detail(e); },
    suspendre: function (b) {
      var e = espaceDe(b.dataset.slug); if (!e) return;
      formMotif('Suspendre ' + e.nom, 'Plus personne ne pourra se connecter à <strong class="cs-adresse">' + esc(e.slug) + '</strong> : ses utilisateurs et ses prestataires verront une page « espace suspendu ». Les données sont conservées ; vous pourrez le réactiver.',
        'Motif de la suspension (visible dans la console)', 'Suspendre l’espace', 'btn-danger', function (m) {
          api('POST', '/espaces/' + e.slug + '/suspendre', { motif: m }).then(function () { fermer(); toast('Espace ' + e.slug + ' suspendu.'); charger(); }).catch(function (x) { erreurFenetre(x.message); });
        });
    },
    reactiver: function (b) {
      var e = espaceDe(b.dataset.slug); if (!e) return;
      api('POST', '/espaces/' + e.slug + '/reactiver', {}).then(function () { fermer(); toast('Espace ' + e.slug + ' réactivé.'); charger(); }).catch(function (x) { toast(x.message); });
    },
    supprimer: function (b) {
      var e = espaceDe(b.dataset.slug); if (!e) return;
      ouvrir('Supprimer ' + e.nom, '<form class="cs-form" novalidate>' + MSG + '<div class="cs-bandeau danger"><strong>Suppression définitive.</strong> La base de l’espace, ses comptes, ses appels d’offres, ses prestataires et toutes ses pièces seront effacés. Rien ne pourra être récupéré.</div>' +
        '<label for="cs-conf">Pour confirmer, saisissez l’adresse de l’espace : <strong class="cs-adresse">' + esc(e.slug) + '</strong></label><input id="cs-conf" type="text" autocomplete="off" spellcheck="false">' +
        '<div class="cs-pied-fen"><button type="button" class="btn btn-ghost" data-action="fermer">Annuler</button><button class="btn btn-danger" type="submit" id="cs-conf-go" disabled>' + ic('poubelle') + 'Supprimer définitivement</button></div></form>', function (c) {
        var champ = $('cs-conf'), go = $('cs-conf-go');
        champ.addEventListener('input', function () { go.disabled = champ.value.trim().toLowerCase() !== e.slug; });
        c.querySelector('form').addEventListener('submit', function (ev) {
          ev.preventDefault(); if (go.disabled) return;
          go.disabled = true;
          api('DELETE', '/espaces/' + e.slug, { confirmation: champ.value.trim() }).then(function () { fermer(); toast('Espace ' + e.slug + ' supprimé.'); charger(); })
            .catch(function (x) { erreurFenetre(x.message); go.disabled = false; });
        });
      });
    },
    'nouvel-espace': function () {
      ouvrir('Nouvel espace', '<form class="cs-form" novalidate>' + MSG +
        '<fieldset><legend>L’entreprise</legend>' +
        '<label for="ne-nom">Raison sociale</label><input id="ne-nom" type="text" maxlength="120">' +
        '<div class="cs-deux"><div><label for="ne-pays">Pays</label><select id="ne-pays"><option>Côte d’Ivoire</option><option>Sénégal</option><option>Burkina Faso</option><option>Mali</option><option>Bénin</option><option>Togo</option><option>Niger</option><option>Guinée-Bissau</option><option>Autre</option></select></div>' +
        '<div><label for="ne-profil">Type d’acheteur</label><select id="ne-profil"><option value="uemoa-ci">Marchés publics</option><option value="prive">Achats privés</option></select></div></div>' +
        '<label for="ne-slug">Adresse</label><div class="pf-adresse"><input id="ne-slug" type="text" maxlength="30" autocomplete="off" spellcheck="false"><span class="pf-suffixe">.' + esc(location.hostname) + '</span></div><div class="pf-aide" id="ne-dispo"></div></fieldset>' +
        '<fieldset><legend>L’administrateur</legend>' +
        '<div class="cs-deux"><div><label for="ne-admin">Nom et prénom</label><input id="ne-admin" type="text" maxlength="120"></div><div><label for="ne-email">Courriel</label><input id="ne-email" type="email"></div></div>' +
        '<label for="ne-mdp">Mot de passe initial</label><div class="cs-mdp"><input id="ne-mdp" type="text" autocomplete="off" spellcheck="false"><button type="button" class="btn btn-ghost btn-sm" data-action="generer">Générer</button></div>' +
        '<div class="pf-aide">À transmettre vous-même à l’administrateur ; il pourra le changer depuis son compte.</div></fieldset>' +
        '<div class="cs-pied-fen"><button type="button" class="btn btn-ghost" data-action="fermer">Annuler</button><button class="btn btn-primary" type="submit">Créer l’espace</button></div></form>', function (c) {
        var slug = $('ne-slug'), touche = false, minut = null;
        var verifier = function () {
          clearTimeout(minut); var s = slug.value, d = $('ne-dispo');
          if (!s) { d.textContent = ''; d.className = 'pf-aide'; return; }
          minut = setTimeout(function () {
            fetch('/api/plateforme/disponible?slug=' + encodeURIComponent(s)).then(function (r) { return r.json(); }).then(function (j) {
              if (s !== slug.value) return;
              d.textContent = j.libre ? 'Disponible' : j.raison; d.className = 'pf-aide ' + (j.libre ? 'ok' : 'ko');
            }).catch(function () {});
          }, 300);
        };
        $('ne-nom').addEventListener('input', function () {
          if (touche) return;
          slug.value = $('ne-nom').value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\b(sa|sarl|sas|suarl|gie)\b/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '');
          verifier();
        });
        slug.addEventListener('input', function () { touche = true; slug.value = slug.value.toLowerCase().replace(/[^a-z0-9-]/g, ''); verifier(); });
        c.querySelector('form').addEventListener('submit', function (ev) {
          ev.preventDefault();
          var go = c.querySelector('button[type=submit]'); go.disabled = true;
          api('POST', '/espaces', { nom: $('ne-nom').value.trim(), pays: $('ne-pays').value, profil: $('ne-profil').value, slug: slug.value.trim(),
            adminNom: $('ne-admin').value.trim(), email: $('ne-email').value.trim(), motDePasse: $('ne-mdp').value })
            .then(function (j) { fermer(); toast('Espace ' + j.espace.slug + ' créé.'); ONGLET = 'espaces'; location.hash = 'espaces'; charger(); })
            .catch(function (x) { erreurFenetre(x.message); go.disabled = false; });
        });
      });
    },
    generer: function () {
      var maj = 'ABCDEFGHJKLMNPQRSTUVWXYZ', min = 'abcdefghijkmnopqrstuvwxyz', chi = '23456789', tout = maj + min + chi;
      var a = new Uint32Array(14); crypto.getRandomValues(a);
      var m = maj[a[0] % maj.length] + min[a[1] % min.length] + chi[a[2] % chi.length];
      for (var i = 3; i < 14; i++) m += tout[a[i] % tout.length];
      $('ne-mdp').value = m;
    },
    'nouvel-operateur': function () {
      ouvrir('Ajouter un opérateur', '<form class="cs-form" novalidate>' + MSG +
        '<label for="no-nom">Nom et prénom</label><input id="no-nom" type="text" maxlength="120">' +
        '<label for="no-email">Courriel</label><input id="no-email" type="email">' +
        '<label for="no-mdp">Mot de passe initial</label><input id="no-mdp" type="password" autocomplete="new-password">' +
        '<div class="pf-aide">10 caractères minimum, avec majuscule, minuscule et chiffre.</div>' +
        '<div class="cs-pied-fen"><button type="button" class="btn btn-ghost" data-action="fermer">Annuler</button><button class="btn btn-primary" type="submit">Ajouter</button></div></form>', function (c) {
        c.querySelector('form').addEventListener('submit', function (ev) {
          ev.preventDefault();
          api('POST', '/operateurs', { nom: $('no-nom').value.trim(), email: $('no-email').value.trim(), motDePasse: $('no-mdp').value })
            .then(function () { fermer(); toast('Opérateur ajouté.'); vueOperateurs(); }).catch(function (x) { erreurFenetre(x.message); });
        });
      });
    },
    'basculer-operateur': function (b) {
      api('PATCH', '/operateurs/' + b.dataset.id, { actif: b.dataset.actif === '1' }).then(function () { toast(b.dataset.actif === '1' ? 'Opérateur réactivé.' : 'Opérateur désactivé.'); vueOperateurs(); }).catch(function (x) { toast(x.message); });
    },
    'mot-de-passe': function () {
      menu(false);
      ouvrir('Changer mon mot de passe', '<form class="cs-form" novalidate>' + MSG +
        '<label for="mp-actuel">Mot de passe actuel</label><input id="mp-actuel" type="password" autocomplete="current-password">' +
        '<label for="mp-nouveau">Nouveau mot de passe</label><input id="mp-nouveau" type="password" autocomplete="new-password">' +
        '<div class="pf-aide">10 caractères minimum, avec majuscule, minuscule et chiffre.</div>' +
        '<div class="cs-pied-fen"><button type="button" class="btn btn-ghost" data-action="fermer">Annuler</button><button class="btn btn-primary" type="submit">Enregistrer</button></div></form>', function (c) {
        c.querySelector('form').addEventListener('submit', function (ev) {
          ev.preventDefault();
          api('POST', '/mot-de-passe', { actuel: $('mp-actuel').value, nouveau: $('mp-nouveau').value })
            .then(function () { fermer(); toast('Mot de passe modifié.'); }).catch(function (x) { erreurFenetre(x.message); });
        });
      });
    },
    deconnexion: function () { api('POST', '/deconnexion', {}).then(afficherConnexion, afficherConnexion); menu(false); },
    fermer: fermer,
  };

  document.addEventListener('click', function (ev) {
    var o = ev.target.closest('[data-onglet]');
    if (o) { ONGLET = o.dataset.onglet; history.replaceState(null, '', '#' + ONGLET); dessiner(); return; }
    var f = ev.target.closest('[data-filtre]');
    if (f) { FILTRE = f.dataset.filtre; vueEspaces(); return; }
    var b = ev.target.closest('[data-action]');
    if (b && ACTIONS[b.dataset.action]) { ACTIONS[b.dataset.action](b, ev); return; }
    if (!ev.target.closest('.cs-moi')) menu(false);
  });

  function menu(ouvert) { $('cs-menu').hidden = !ouvert; $('cs-moi').setAttribute('aria-expanded', ouvert ? 'true' : 'false'); }
  $('cs-moi').addEventListener('click', function (e) { e.stopPropagation(); menu($('cs-menu').hidden); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') menu(false); });

  /* Actualisation : les nouvelles demandes arrivent sans recharger la page. */
  setInterval(function () { if (MOI && !document.hidden && !fen.open && ['demandes', 'espaces'].indexOf(ONGLET) >= 0 && document.activeElement.id !== 'cs-recherche') charger().catch(function () {}); }, 15000);

  api('GET', '/moi').then(function () { demarrer(); }).catch(function () { afficherConnexion(); });
})();
