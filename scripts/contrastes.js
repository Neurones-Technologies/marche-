#!/usr/bin/env node
/* Vérifie les contrastes WCAG AA de chaque palette (public/css/tokens.css).
   Texte : 4,5:1 minimum. Élément non textuel (contour de champ, icône) : 3:1 minimum.
   Usage : node scripts/contrastes.js — code de sortie 1 si un couple échoue. */
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'tokens.css'), 'utf8');
const palettes = {};
for (const m of css.matchAll(/data-theme="([a-z]+)"\]\s*\{([^}]*)\}/g)) {
  const tok = {};
  for (const t of m[2].matchAll(/--(color-[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)) tok[t[1]] = t[2];
  for (const t of m[2].matchAll(/--(color-[a-z0-9-]+):\s*var\(--(color-[a-z0-9-]+)\)/g)) tok[t[1]] = tok[t[2]];
  palettes[m[1]] = tok;
}

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// [premier plan, arrière-plan, minimum, usage]
const COUPLES = [
  ['text', 'surface', 4.5, 'texte courant'],
  ['text', 'bg', 4.5, 'texte sur le fond'],
  ['text-2', 'surface', 4.5, 'texte secondaire'],
  ['text-2', 'bg', 4.5, 'texte secondaire sur le fond'],
  ['text-2', 'surface-2', 4.5, 'texte secondaire dans un aperçu de document'],
  ['text-2', 'pending-bg', 4.5, 'libellé d’un champ à vérifier'],
  ['text', 'pending-bg', 4.5, 'valeur d’un champ à vérifier'],
  ['accent', 'surface', 4.5, 'lien'],
  ['on-accent', 'accent', 4.5, 'bouton principal'],
  ['on-accent', 'accent-hover', 4.5, 'bouton principal survolé'],
  ['side-text', 'side-bg', 4.5, 'menu'],
  ['side-muted', 'side-bg', 4.5, 'titres de groupe du menu'],
  ['side-on-text', 'side-on-bg', 4.5, 'élément de menu actif'],
  ['badge-text', 'badge-bg', 4.5, 'compteur du menu'],
  ['on-brand', 'brand', 4.5, 'logo'],
  ['ok', 'ok-bg', 4.5, 'pastille validé'],
  ['blocked', 'blocked-bg', 4.5, 'pastille bloqué'],
  ['pending', 'pending-bg', 4.5, 'pastille à vérifier'],
  ['draft', 'draft-bg', 4.5, 'pastille brouillon'],
  ['info', 'info-bg', 4.5, 'pastille information'],
  ['blocked', 'surface', 4.5, 'bouton danger'],
  ['surface', 'text', 4.5, 'infobulle'],
  ['border-field', 'surface', 3, 'contour de champ'],
  ['border-field', 'bg', 3, 'contour de champ sur le fond'],
  ['text', 'pending-solid', 3, 'icône d’un champ à vérifier'],
  ['text-2', 'tile', 3, 'icône d’un champ'],
  ['accent', 'surface', 3, 'anneau de focus'],
];

let echecs = 0;
for (const [nom, tok] of Object.entries(palettes)) {
  console.log(`\n── ${nom}`);
  for (const [fg, bg, min, usage] of COUPLES) {
    const a = tok['color-' + fg], b = tok['color-' + bg];
    if (!a || !b) { console.log(`?     ${fg} / ${bg} : token absent`); echecs++; continue; }
    const r = ratio(a, b), ok = r >= min;
    if (!ok) echecs++;
    if (!ok || process.argv.includes('-v')) console.log(`${ok ? 'ok   ' : 'ÉCHEC'} ${r.toFixed(2).padStart(5)}:1 (min ${min})  ${fg} sur ${bg} — ${usage}`);
  }
  console.log(`${COUPLES.length} couples vérifiés`);
}
console.log(echecs ? `\n${echecs} couple(s) sous le seuil.` : `\nLes ${Object.keys(palettes).length} palettes passent WCAG AA.`);
process.exit(echecs ? 1 : 0);
