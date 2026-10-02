/* Client HTTP de test partagé : chaque fichier *.test.js démarre son propre serveur sur une base en mémoire. */
process.env.DB_FILE = ':memory:';
process.env.NODE_ENV = 'test';
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
const patch = (cookie, changes, pid = 'p1') => call('PATCH', `/api/procedures/${pid}/state`, { changes }, cookie);
const clone = (x) => JSON.parse(JSON.stringify(x));

module.exports = { call, login, getState, patch, clone, upload: (...a) => uploadImpl(...a), base: () => base };
async function uploadImpl(doc, name, buf, cookie, pid = 'p1') {
  const res = await fetch(base + `/api/procedures/${pid}/files?doc=` + doc, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-filename': encodeURIComponent(name), cookie }, body: buf });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
