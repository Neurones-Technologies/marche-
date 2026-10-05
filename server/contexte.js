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

module.exports = {
  middleware: (req, res, next) => als.run({ ip: ipDe(req) }, next),
  ip: () => store().ip || null,
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
