/* « Espace introuvable » : le bouton mène à la plateforme (l'adresse sans le sous-domaine). */
(function () {
  var h = location.hostname.split('.').slice(1).join('.');
  if (h) document.getElementById('vers-plateforme').href = location.protocol + '//' + h + (location.port ? ':' + location.port : '') + '/';
})();
