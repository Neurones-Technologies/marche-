/* Contexte de la requête en cours (adresse IP), lisible sans le passer de fonction en fonction : le journal
   d'audit l'enregistre avec chaque entrée. Hors requête (amorçage, tests directs), le contexte est vide. */
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

/* Adresse du client, telle qu'Express la déduit (« trust proxy » : derrière le proxy inverse, l'adresse transmise
   par lui). Les adresses IPv4 vues en IPv6 (::ffff:1.2.3.4) sont ramenées à leur forme IPv4. */
const ipDe = (req) => String(req.ip || '').replace(/^::ffff:/, '') || null;

module.exports = {
  middleware: (req, res, next) => als.run({ ip: ipDe(req) }, next),
  ip: () => (als.getStore() || {}).ip || null,
};
