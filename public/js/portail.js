/* Portail des partenaires (/portail-partenaires) : inscription d'une entreprise prestataire, à part de la page de
   connexion. Le compte reste inactif jusqu'à la vérification du courriel (lien reçu : /?verifier=…). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  /* Nom de l'organisation, et inscription ouverte ou fermée. */
  fetch('/api/espace').then(function (r) { return r.json(); }).then(function (e) {
    if (e.nom) {
      document.querySelectorAll('[data-org]').forEach(function (x) { x.textContent = e.nom; });
      document.title = 'Portail des partenaires — ' + e.nom;
    }
    if (e.inscriptionOuverte === false) { $('signup-form').hidden = true; $('su-ferme').hidden = false; }
  }).catch(function () {});

  $('signup-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var b = $('su-go'), er = $('su-err'); er.hidden = true;
    b.disabled = true; b.textContent = 'Création…';
    fetch('/api/inscription', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raisonSociale: $('su-rs').value, pays: $('su-pays').value, immatriculation: $('su-immat').value,
        nom: $('su-nom').value, email: $('su-email').value, motDePasse: $('su-pw').value, site: $('su-site').value }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Inscription impossible.'); return j; }); })
      .then(function (r) {
        $('signup-form').hidden = true; $('su-fait').hidden = false;
        var ok = $('su-ok'); ok.textContent = r.message;
        if (r.lienVerification) { // hors production uniquement : les courriels ne sont pas envoyés
          ok.appendChild(document.createElement('br'));
          ok.appendChild(document.createTextNode('Démonstration — lien de vérification : '));
          var a = document.createElement('a'); a.href = r.lienVerification; a.textContent = 'activer le compte'; ok.appendChild(a);
        }
      })
      .catch(function (err) { er.textContent = err.message; er.hidden = false; b.disabled = false; b.textContent = 'Créer le compte'; });
  });
})();
