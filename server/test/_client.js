/* Client HTTP de test partagé : chaque fichier *.test.js démarre son propre serveur sur une base en mémoire. */
process.env.DB_FILE = ':memory:';
process.env.NODE_ENV = 'test';
if (process.env.MARCHES_PUBLICS == null) process.env.MARCHES_PUBLICS = '1'; // le moteur des marchés publics reste testé, bien qu'en attente
process.env.LOGIN_RATE_LIMIT = '1000';
process.env.INSCRIPTION_RATE_LIMIT = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../index');

const PW = 'Marche+2026!';
let server, base;
test.before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => server.close());

async function call(method, url, body, cookie) {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => ({})), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}
async function login(email) {
  const r = await call('POST', '/api/auth/login', { email, password: PW });
  assert.equal(r.status, 200);
  return r.cookie;
}
const getState = async (cookie, pid = 'p1') => (await call('GET', `/api/procedures/${pid}/state`, null, cookie)).json.state;
/** Les tests clôturent le dépouillement sans attendre la date limite : le responsable l'ouvre d'abord à la main. */
const ouvrir = (cookie, pid = 'p1') => call('POST', `/api/procedures/${pid}/depouillement/ouvrir`, {}, cookie);
const patch = async (cookie, changes, pid = 'p1') => {
  if (changes.depClosed === true) await ouvrir(cookie, pid);
  return call('PATCH', `/api/procedures/${pid}/state`, { changes }, cookie);
};
const clone = (x) => JSON.parse(JSON.stringify(x));

module.exports = { call, login, getState, patch, ouvrir, clone, upload: (...a) => uploadImpl(...a), base: () => base };
async function uploadImpl(doc, name, buf, cookie, pid = 'p1') {
  const res = await fetch(base + `/api/procedures/${pid}/files?doc=` + doc, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-filename': encodeURIComponent(name), cookie }, body: Buffer.concat([buf, Buffer.from(' ' + doc)]) }); // un document distinct par pièce
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

/** Inscription complète sur le portail des partenaires (prestataire ivoirien) : brouillon, documents du formulaire par
    défaut, réponses obligatoires, puis envoi. Retourne la réponse de l'envoi. */
async function inscrire(corps) {
  const b = (await call('POST', '/api/inscription/brouillon', {})).json.brouillon;
  for (const [doc, expire] of [['registre'], ['fiscal', '2099-12-31'], ['cnps', '2099-12-31']]) {
    await fetch(base + '/api/inscription/brouillon/pieces?doc=' + doc + (expire ? '&expire=' + expire : ''),
      { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-filename': doc + '.pdf', 'x-brouillon': b }, body: Buffer.from('%PDF-1.4 test ' + doc) }); // un document distinct par pièce
  }
  return call('POST', '/api/inscription', { immatriculation: 'CI-ABJ-2026-B-9', reponses: { activite: 'Fournitures' }, ...corps, brouillon: b });
}
module.exports.inscrire = inscrire;

/** Remplit le cahier des charges et la grille d'une procédure neuve, qui naît vide ; retourne l'état. */
async function remplir(cookie, pid) {
  const seed = require('../seed/seed.json');
  const s = (await call('GET', `/api/procedures/${pid}/state`, null, cookie)).json.state;
  const { ref, objet, profil, autorite } = s.cdc;
  const r = await call('PATCH', `/api/procedures/${pid}/state`, { changes: { cdc: { ...seed.CDC, ref, objet, profil, autorite, cdcPublie: false, prefActive: profil === 'prive' ? false : seed.CDC.prefActive, ouverture: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) }, criteria: seed.CRITERIA } }, cookie);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return (await call('GET', `/api/procedures/${pid}/state`, null, cookie)).json.state;
}
module.exports.remplir = remplir;
