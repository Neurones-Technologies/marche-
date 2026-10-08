/* Contexte de la requête en cours, lisible sans le passer de fonction en fonction :
   - l'adresse IP (le journal d'audit l'enregistre avec chaque entrée) ;
   - l'espace de l'entreprise (plateforme multi-entreprises : server/espaces.js) — sa base, son dossier de pièces.
   Hors requête (amorçage, tests directs), le contexte est vide : la base principale s'applique. */
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();
const store = () => als.getStore() || {};

/* Adresse du client, telle qu'Express la déduit (« trust proxy » : derrière le proxy inverse, l'adresse transmise
   par lui). Les adresses IPv4 vues en IPv6 (::ffff:1.2.3.4) sont ramenées à leur forme IPv4. */
const ipDe = (req) => String(req.ip || '').replace(/^::ffff:/, '') || null;

/* Poste de travail de l'auteur : navigateur et système (en-tête User-Agent), et identifiant propre à ce navigateur, tiré
   au hasard à sa première visite et renvoyé à chaque appel (X-Poste). Indicatif : le client peut l'altérer. L'adresse
   interne d'un poste n'est jamais communiquée par un navigateur à un site ; elle n'apparaît que si un proxy d'entreprise
   la transmet dans X-Forwarded-For (voir `relais`). */
const posteDe = (req) => {
  const ua = String(req.headers['user-agent'] || '');
  let nav = null;
  for (const [nom, re] of [['Edge', /Edg\/(\d+)/], ['Opera', /OPR\/(\d+)/], ['Firefox', /Firefox\/(\d+)/], ['Chrome', /Chrome\/(\d+)/], ['Safari', /Version\/(\d+).*Safari/]]) {
    const x = re.exec(ua); if (x) { nav = [nom, x[1]]; break; }
  }
  const os = /Windows NT 1[01]/.test(ua) ? 'Windows 10/11' : /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  const id = /^[0-9a-f]{12}$/.test(String(req.headers['x-poste'] || '')) ? String(req.headers['x-poste']).slice(0, 6) : null;
  const lib = [nav ? nav[0] + ' ' + nav[1] : null, os].filter(Boolean).join(' · ');
  return (lib || id) ? (lib || 'Navigateur inconnu') + (id ? ' · poste ' + id : '') : null;
};
/* Chaîne X-Forwarded-For quand elle compte plusieurs adresses : celle du client telle que relayée par chaque proxy. */
const relaisDe = (req) => { const x = String(req.headers['x-forwarded-for'] || '').replace(/[^0-9a-fA-F:.,\s]/g, '').trim().slice(0, 200); return x.includes(',') ? x : null; };

module.exports = {
  middleware: (req, res, next) => als.run({ ip: ipDe(req), poste: posteDe(req), relais: relaisDe(req) }, next),
  ip: () => store().ip || null,
  /** Poste de travail de l'auteur (navigateur, système, identifiant du navigateur), ou null. */
  poste: () => store().poste || null,
  /** Adresses relayées (X-Forwarded-For à plusieurs maillons), ou null. */
  relais: () => store().relais || null,
  /** Base de données de l'espace courant (null : la base principale). */
  base: () => store().base || null,
  /** Identifiant (sous-domaine) de l'espace courant, ou null hors plateforme. */
  espace: () => store().espace || null,
  /** Dossier des pièces déposées de l'espace courant, ou null. */
  fichiers: () => store().fichiers || null,
  /** Complète le contexte de la requête en cours (espace résolu d'après l'adresse). */
  poser: (champs) => { const s = als.getStore(); if (s) Object.assign(s, champs); },
  /** Exécute fn dans un contexte complété (ouverture d'une base, création d'un espace). */
  avec: (champs, fn) => als.run({ ...store(), ...champs }, fn),
};
