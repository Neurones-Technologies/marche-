/* Portail des partenaires (/portail-partenaires) : demande de référencement d'une entreprise prestataire, sur le
   formulaire défini par l'organisation (fiche, questionnaire, documents), en quatre étapes. Les documents partent un
   par un dans un brouillon anonyme ; l'envoi crée le compte (inactif) et le dossier, qui part en instruction à la
   vérification du courriel (lien reçu : /?verifier=…). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  var FORM = { champs: [], pieces: [] }, PAYS_DOCS = null, BROUILLON = null, DEPOSES = {}, DATES = {}, PAS = 0;
  var MAX = 10 * 1024 * 1024;

  function erreur(t) { var e = $('su-err'); e.textContent = t || ''; e.hidden = !t; }
  function json(r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var x = new Error(j.error || 'Erreur ' + r.status); x.code = j.code; throw x; } return j; }); }

  /* Organisation, inscription ouverte ou fermée, formulaire. */
  fetch('/api/espace').then(function (r) { return r.json(); }).then(function (e) {
    if (e.nom) {
      document.querySelectorAll('[data-org]').forEach(function (x) { x.textContent = e.nom; });
      document.title = 'Portail des partenaires — ' + e.nom;
    }
    if (e.inscriptionOuverte === false) { $('signup-form').hidden = true; $('su-ferme').hidden = false; }
  }).catch(function () {});
  chargerFormulaire();

  function chargerFormulaire() {
    var pays = $('su-pays').value;
    return fetch('/api/inscription/formulaire?pays=' + encodeURIComponent(pays)).then(json).then(function (f) {
      FORM = f; PAYS_DOCS = pays;
      dessinerQuestions(); dessinerDocuments();
    }).catch(function (x) { erreur(x.message); });
  }

  /* ── Questionnaire ── */
  function dessinerQuestions() {
    var z = $('pt-questions'), avant = {};
    z.querySelectorAll('[data-q]').forEach(function (i) { avant[i.getAttribute('data-q')] = i.value; });
    z.textContent = '';
    FORM.champs.forEach(function (q) {
      var id = 'pq-' + q.id;
      var l = el('label', null, q.label + (q.obligatoire ? ' *' : '')); l.setAttribute('for', id); z.appendChild(l);
      var i;
      if (q.type === 'choix' || q.type === 'ouinon') {
        i = el('select'); i.appendChild(el('option', null, '—')).value = '';
        (q.type === 'ouinon' ? [['oui', 'Oui'], ['non', 'Non']] : (q.options || []).map(function (o) { return [o, o]; }))
          .forEach(function (x) { var o = el('option', null, x[1]); o.value = x[0]; i.appendChild(o); });
      } else if (q.type === 'texte') { i = el('textarea'); i.rows = 2; i.maxLength = 2000; }
      else { i = el('input'); i.type = q.type === 'nombre' ? 'number' : 'date'; }
      i.id = id; i.setAttribute('data-q', q.id); if (q.obligatoire) i.required = true;
      if (avant[q.id] != null) i.value = avant[q.id];
      z.appendChild(i);
    });
    $('pt-pas').querySelector('[data-pas="1"]').hidden = !FORM.champs.length;
  }
  function reponses() {
    var r = {};
    document.querySelectorAll('#pt-questions [data-q]').forEach(function (i) { if (i.value !== '') r[i.getAttribute('data-q')] = i.value; });
    return r;
  }

  /* ── Documents : déposés tout de suite dans le brouillon ── */
  function brouillon() {
    if (BROUILLON) return Promise.resolve(BROUILLON);
    return fetch('/api/inscription/brouillon', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(json).then(function (j) { BROUILLON = j.brouillon; return BROUILLON; });
  }
  function dessinerDocuments() {
    var z = $('pt-docs'); z.textContent = '';
    if (!FORM.pieces.length) { z.appendChild(el('p', 'pf-aide', 'Aucun document n’est demandé.')); return; }
    FORM.pieces.forEach(function (d) {
      var row = el('div', 'pt-doc' + (DEPOSES[d.id] ? ' ok' : '')); row.setAttribute('data-doc', d.id);
      var tete = el('div', 'pt-doc-tete');
      tete.appendChild(el('strong', null, d.label));
      tete.appendChild(el('span', 'pt-badge' + (d.obligatoire ? '' : ' fac'), d.obligatoire ? 'Obligatoire' : 'Facultatif'));
      row.appendChild(tete);
      var etat = el('div', 'pt-doc-etat', DEPOSES[d.id] ? '✓ ' + DEPOSES[d.id].nom + (DEPOSES[d.id].expire ? ' · valable jusqu’au ' + DEPOSES[d.id].expire.split('-').reverse().join('/') : '') : (d.expiration ? 'Date de fin de validité exigée.' : ''));
      var act = el('div', 'pt-doc-act');
      var dt = null;
      if (d.expiration) {
        dt = el('input'); dt.type = 'date'; dt.id = 'pd-exp-' + d.id; dt.setAttribute('aria-label', 'Date de fin de validité — ' + d.label);
        dt.min = new Date().toISOString().slice(0, 10);
        // date saisie gardée d'un rendu à l'autre (joindre un document redessine la liste)
        dt.value = DATES[d.id] || (DEPOSES[d.id] && DEPOSES[d.id].expire) || '';
        dt.addEventListener('input', function () { DATES[d.id] = dt.value; });
        dt.addEventListener('change', function () { DATES[d.id] = dt.value; });
        act.appendChild(dt);
      }
      var inp = el('input'); inp.type = 'file'; inp.hidden = true; inp.id = 'pd-fic-' + d.id; inp.accept = '.pdf,.png,.jpg,.jpeg,.docx,.xlsx';
      inp.setAttribute('aria-label', 'Choisir le fichier : ' + d.label);
      var b = el('button', 'btn btn-ghost btn-sm', DEPOSES[d.id] ? 'Remplacer' : 'Joindre'); b.type = 'button';
      b.addEventListener('click', function () {
        erreur('');
        if (dt && !dt.value) { erreur('« ' + d.label + ' » : indiquez d’abord sa date de fin de validité.'); dt.focus(); return; }
        inp.click();
      });
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        if (f.size > MAX) { erreur('« ' + f.name + ' » dépasse 10 Mo.'); inp.value = ''; return; }
        b.disabled = true; b.textContent = 'Envoi…';
        brouillon().then(function (jeton) {
          return fetch('/api/inscription/brouillon/pieces?doc=' + encodeURIComponent(d.id) + (dt && dt.value ? '&expire=' + dt.value : ''),
            { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream', 'x-filename': encodeURIComponent(f.name), 'x-brouillon': jeton }, body: f });
        }).then(json).then(function (j) {
          DEPOSES[d.id] = j.piece; dessinerDocuments();
        }).catch(function (x) {
          if (x.code === 'DRAFT_INVALID') { BROUILLON = null; DEPOSES = {}; dessinerDocuments(); }
          erreur(x.message); b.disabled = false; b.textContent = DEPOSES[d.id] ? 'Remplacer' : 'Joindre';
        });
      });
      act.appendChild(inp); act.appendChild(b);
      row.appendChild(etat); row.appendChild(act);
      z.appendChild(row);
    });
  }
  // le pays change la liste des documents (pièces locales, hors UEMOA)
  $('su-pays').addEventListener('change', chargerFormulaire);

  /* ── Étapes ── */
  var ETAPES = [0, 1, 2, 3];
  function visibles() { return ETAPES.filter(function (i) { return i !== 1 || FORM.champs.length; }); }
  function aller(i) {
    PAS = i; erreur('');
    document.querySelectorAll('.pt-etape').forEach(function (f) { f.hidden = Number(f.getAttribute('data-etape')) !== i; });
    var v = visibles(), pos = v.indexOf(i);
    document.querySelectorAll('#pt-pas li').forEach(function (li) {
      var n = Number(li.getAttribute('data-pas'));
      li.className = n === i ? 'on' : (v.indexOf(n) < pos ? 'fait' : '');
      li.querySelector('span').textContent = String(v.indexOf(n) + 1);
    });
    $('pt-prec').hidden = pos === 0;
    $('pt-suiv').hidden = pos === v.length - 1;
    $('su-go').hidden = pos !== v.length - 1;
    if (i === 3) recap();
    var premier = document.querySelector('.pt-etape[data-etape="' + i + '"] input:not([type=file]):not([type=date]),.pt-etape[data-etape="' + i + '"] select,.pt-etape[data-etape="' + i + '"] textarea');
    if (premier && document.activeElement && document.activeElement.id !== 'pt-suiv') premier.focus();
  }
  function controle(i) {
    if (i === 0) {
      if ($('su-rs').value.trim().length < 2) return 'Indiquez la raison sociale.';
      if (!$('su-immat').value.trim()) return 'Indiquez le numéro d’immatriculation.';
      if ($('su-nom').value.trim().length < 2) return 'Indiquez le nom du contact.';
    }
    if (i === 1) {
      var r = reponses(), q = FORM.champs.filter(function (c) { return c.obligatoire && (r[c.id] == null || r[c.id] === ''); })[0];
      if (q) return 'Réponse obligatoire : « ' + q.label + ' ».';
    }
    if (i === 2) {
      var m = FORM.pieces.filter(function (d) { return d.obligatoire && !DEPOSES[d.id]; });
      if (m.length) return 'Documents obligatoires à joindre : ' + m.map(function (d) { return d.label; }).join(' ; ') + '.';
    }
    return null;
  }
  function recap() {
    var z = $('pt-recap'); z.textContent = '';
    var docs = FORM.pieces.filter(function (d) { return DEPOSES[d.id]; }).length;
    z.appendChild(el('strong', null, $('su-rs').value.trim()));
    z.appendChild(el('span', null, Object.keys(reponses()).length + ' réponse(s) · ' + docs + ' document(s) joint(s)'));
  }
  $('pt-suiv').addEventListener('click', function () {
    var e = controle(PAS); if (e) { erreur(e); return; }
    var v = visibles(); aller(v[v.indexOf(PAS) + 1]);
  });
  $('pt-prec').addEventListener('click', function () { var v = visibles(); aller(v[v.indexOf(PAS) - 1]); });
  document.querySelectorAll('#pt-pas li').forEach(function (li) {
    li.addEventListener('click', function () {
      var n = Number(li.getAttribute('data-pas')), v = visibles();
      if (v.indexOf(n) > v.indexOf(PAS)) return; // revenir en arrière seulement ; avancer passe par « Continuer »
      aller(n);
    });
  });

  // une saisie efface le message d'erreur précédent
  $('signup-form').addEventListener('input', function (e) { if (e.target.type !== 'file') erreur(''); });

  /* ── Envoi ── */
  $('signup-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (PAS !== 3) { $('pt-suiv').click(); return; }
    for (var k = 0; k < 3; k++) { var e = controle(k); if (e) { aller(k === 1 && !FORM.champs.length ? 2 : k); erreur(e); return; } }
    var b = $('su-go'); erreur('');
    b.disabled = true; b.textContent = 'Envoi…';
    fetch('/api/inscription', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raisonSociale: $('su-rs').value, pays: $('su-pays').value, immatriculation: $('su-immat').value, nom: $('su-nom').value,
        tel: $('su-tel').value, email: $('su-email').value, motDePasse: $('su-pw').value, site: $('su-site').value, reponses: reponses(), brouillon: BROUILLON }) })
      .then(json)
      .then(function (r) {
        $('signup-form').hidden = true; $('su-fait').hidden = false;
        var ok = $('su-ok'); ok.textContent = r.message;
        if (r.lienVerification) { // hors production uniquement : les courriels ne sont pas envoyés
          ok.appendChild(document.createElement('br'));
          ok.appendChild(document.createTextNode('Démonstration — lien de vérification : '));
          var a = document.createElement('a'); a.href = r.lienVerification; a.textContent = 'confirmer mon courriel'; ok.appendChild(a);
        }
      })
      .catch(function (x) { erreur(x.message); b.disabled = false; b.textContent = 'Envoyer mon dossier'; });
  });

  aller(0);
})();
