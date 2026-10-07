/* Page de la plateforme : création d'un espace d'entreprise, et accès à un espace existant. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var domaine = location.hostname, port = location.port ? ':' + location.port : '';
  document.querySelectorAll('[data-domaine]').forEach(function (e) { e.textContent = '.' + domaine; });
  var adresse = function (slug) { return location.protocol + '//' + slug + '.' + domaine + port; };
  document.querySelectorAll('[data-exemple]').forEach(function (e) { e.textContent = 'votre-entreprise.' + domaine; });
  $('pf-demo-lien').href = adresse('demo') + '/';

  function message(texte, ok) { var m = $('pf-message'); m.hidden = !texte; m.textContent = texte || ''; m.className = 'pf-message' + (ok ? ' ok' : ''); }
  var q = new URLSearchParams(location.search).get('confirmation');
  if (q === 'invalide') message('Ce lien de confirmation n’est plus valable (déjà utilisé, ou plus de 48 heures). Refaites la demande.');
  if (q === 'prise') message('Cette adresse a été prise entre-temps. Choisissez-en une autre.');
  /* Courriel confirmé, demande en attente de l'accord de l'équipe Neurones Technologies. */
  function etatFait(titre, texte) {
    $('pf-form').hidden = true; $('pf-fait').hidden = false;
    $('pf-fait-titre').textContent = titre; $('pf-fait-texte').textContent = texte;
  }
  if (q === 'attente') {
    etatFait('Demande reçue', 'Votre courriel est confirmé. Notre équipe examine votre demande : vous recevrez un courriel dès l’ouverture de votre espace.');
    setTimeout(function () { $('creer').scrollIntoView(); }, 50);
  }
  /* Ouverture immédiate (sans validation) : le texte de l'étape 3 le dit. */
  var manuelle = true;
  fetch('/api/plateforme/infos').then(function (r) { return r.json(); }).then(function (j) {
    manuelle = j.validation !== 'auto';
    if (!manuelle) $('pf-etape3').textContent = 'Vous entrez dans votre espace, prêt à l’emploi, et vous invitez votre équipe et vos prestataires.';
  }).catch(function () {});

  /* Adresse proposée d'après la raison sociale, tant qu'elle n'a pas été modifiée à la main. */
  var touchee = false;
  var FORMES = ['sa', 'sarl', 'sas', 'suarl', 'gie', 'ltd', 'inc', 'de', 'du', 'des', 'la', 'le', 'les', 'et', 'd', 'l'];
  function versAdresse(t) {
    var mots = String(t).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().split(/[^a-z0-9]+/)
      .filter(function (m) { return m && FORMES.indexOf(m) < 0; });
    var tout = mots.join('-');
    // une raison sociale longue : ses initiales (Société Ivoirienne de Transport → sit)
    if (tout.length > 20 && mots.length >= 3) return mots.map(function (m) { return m[0]; }).join('');
    return tout.slice(0, 30).replace(/-+$/, '');
  }
  $('pf-nom').addEventListener('input', function () { if (!touchee) { $('pf-slug').value = versAdresse($('pf-nom').value); verifier(); } });
  $('pf-slug').addEventListener('input', function () { touchee = true; $('pf-slug').value = $('pf-slug').value.toLowerCase().replace(/[^a-z0-9-]/g, ''); verifier(); });

  /* Disponibilité de l'adresse, vérifiée pendant la saisie. */
  var minuterie = null, dispo = false;
  function verifier() {
    clearTimeout(minuterie);
    var s = $('pf-slug').value, d = $('pf-dispo');
    if (!s) { d.textContent = ''; d.className = 'pf-aide'; dispo = false; return; }
    minuterie = setTimeout(function () {
      fetch('/api/plateforme/disponible?slug=' + encodeURIComponent(s)).then(function (r) { return r.json(); }).then(function (j) {
        if (s !== $('pf-slug').value) return;
        dispo = !!j.libre;
        d.textContent = j.libre ? 'Disponible : ' + j.adresse.replace(/^https?:\/\//, '') : j.raison;
        d.className = 'pf-aide ' + (j.libre ? 'ok' : 'ko');
      }).catch(function () {});
    }, 300);
  }

  $('pf-form').addEventListener('submit', function (e) {
    e.preventDefault();
    message('');
    var profil = document.querySelector('input[name="profil"]:checked');
    var corps = { nom: $('pf-nom').value.trim(), pays: $('pf-pays').value, profil: profil ? profil.value : 'prive', slug: $('pf-slug').value.trim(),
      adminNom: $('pf-admin').value.trim(), email: $('pf-email').value.trim(), motDePasse: $('pf-mdp').value, site: $('pf-site').value };
    if (!corps.nom || !corps.slug || !corps.adminNom || !corps.email || !corps.motDePasse) { message('Tous les champs sont obligatoires.'); return; }
    if (!dispo) { message('Choisissez une adresse disponible pour votre espace.'); $('pf-slug').focus(); return; }
    var b = $('pf-go'); b.disabled = true; b.textContent = 'Création…';
    fetch('/api/plateforme/espaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Création impossible.'); return j; }); })
      .then(function (j) {
        var adr = j.adresse.replace(/^https?:\/\//, ''), valide = j.validation === 'manuelle';
        etatFait('Vérifiez votre courriel', j.lien
          ? 'Confirmez votre courriel pour ' + (valide ? 'transmettre votre demande d’espace ' + adr + ' à notre équipe.' : 'créer votre espace ' + adr + '.')
          : 'Un lien de confirmation a été envoyé à ' + j.courriel + '. Ouvrez-le pour ' + (valide ? 'transmettre votre demande d’espace ' + adr + ' à notre équipe, qui vous répondra par courriel.' : 'créer votre espace ' + adr + ' et y entrer.'));
        if (j.lien) { var a = $('pf-confirmer'); a.href = j.lien; a.hidden = false; $('pf-demo').hidden = false; }
      })
      .catch(function (err) { message(err.message); b.disabled = false; b.textContent = 'Créer mon espace'; });
  });

  /* Accès à un espace existant. */
  $('pf-aller').addEventListener('submit', function (e) {
    e.preventDefault();
    var s = $('pf-aller-slug').value.trim().toLowerCase();
    if (s) location.href = adresse(s) + '/';
  });
})();
