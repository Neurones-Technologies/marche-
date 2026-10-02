/* Palette d'affichage choisie par l'utilisateur, et menu « Compte ».
   Chargé dans <head> : la palette est posée avant le premier affichage (pas de clignotement).
   Le choix est une préférence de ce navigateur ; « chaleureux » par défaut. */
(function () {
  'use strict';
  var KEY = 'marcheplus.palette';
  var PALETTES = ['chaleureux', 'institutionnel', 'vivant'];

  function lire() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function appliquer(p) {
    if (PALETTES.indexOf(p) < 0) p = PALETTES[0];
    document.documentElement.setAttribute('data-theme', p);
    return p;
  }
  var courante = appliquer(lire());

  document.addEventListener('DOMContentLoaded', function () {
    var sel = document.getElementById('palette');
    if (sel) {
      sel.value = courante;
      sel.addEventListener('change', function () {
        courante = appliquer(sel.value);
        try { localStorage.setItem(KEY, courante); } catch (e) { /* navigation privée : choix non mémorisé */ }
      });
    }

    var btn = document.getElementById('acct'), menu = document.getElementById('acct-menu');
    if (!btn || !menu) return;
    function ouvrir(oui) {
      menu.hidden = !oui;
      btn.setAttribute('aria-expanded', oui ? 'true' : 'false');
      if (oui) { var f = menu.querySelector('select,button'); if (f) f.focus(); }
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); ouvrir(menu.hidden); });
    menu.addEventListener('click', function (e) { if (e.target.tagName === 'BUTTON') ouvrir(false); });
    document.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target)) ouvrir(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { ouvrir(false); btn.focus(); } });
  });
})();
