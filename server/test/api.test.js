process.env.DB_FILE = ':memory:';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../index');

let server, base;
test.before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => server.close());

const PW = 'Marche+2026!';
async function call(method, url, body, cookie) {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => ({})), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}
async function login(email) { const r = await call('POST', '/api/auth/login', { email, password: PW }); assert.equal(r.status, 200); return r.cookie; }

test('connexion refusée avec un mauvais mot de passe', async () => {
  const r = await call('POST', '/api/auth/login', { email: 'y.koffi@bal.ci', password: 'faux' });
  assert.equal(r.status, 401);
});
test('état inaccessible sans session', async () => { assert.equal((await call('GET', '/api/state')).status, 401); });

test('le soumissionnaire ne voit ni offres ni notes et ne peut pas modifier le CDC', async () => {
  const c = await login('contact.sotrap@bal.ci');
  const s = (await call('GET', '/api/state', null, c)).json.state;
  assert.equal(s.offers.length, 0);
  assert.deepEqual(s.quality, {});
  const r = await call('PATCH', '/api/state', { changes: { cdc: { ...s.cdc, objet: 'piraté' } } }, c);
  assert.equal(r.status, 403);
});

test('publication du CDC puis dépôt d’offre avec accusé et audit', async () => {
  const achats = await login('y.koffi@bal.ci');
  const st = (await call('GET', '/api/state', null, achats)).json;
  const pub = await call('PATCH', '/api/state', { changes: { cdc: { ...st.state.cdc, cdcPublie: true } }, base: { cdc: st.revs.cdc } }, achats);
  assert.equal(pub.status, 200);
  const soum = await login('contact.sotrap@bal.ci');
  const bad = await call('POST', '/api/offers', { name: 'X', iso: 'CI', devise: 'XOF', montant: -5, lots: ['l1'] }, soum);
  assert.equal(bad.status, 422);
  const ok = await call('POST', '/api/offers', { name: 'SOTRAP SARL', iso: 'CI', devise: 'XOF', montant: 91000000, delai: 90, garantie: 24, refsCount: 4, lots: ['l1', 'l2'], docs: {} }, soum);
  assert.equal(ok.status, 201);
  assert.match(ok.json.receipt.num, /^DEP-\d{4}$/);
  const after = (await call('GET', '/api/state', null, achats)).json.state;
  assert.ok(after.offers.some((o) => o.name === 'SOTRAP SARL'));
  assert.ok(after.audit.some((e) => e.a.includes('Dépôt enregistré')));
});

test('notation : déclaration de conflit d’intérêts obligatoire, une seule fois par personne', async () => {
  const ev = await login('f.assamoi@bal.ci');
  const st = (await call('GET', '/api/state', null, ev)).json;
  const q = JSON.parse(JSON.stringify(st.state.quality)); const id = Object.keys(q)[0]; q[id].metho = 55;
  let r = await call('PATCH', '/api/state', { changes: { quality: q } }, ev);
  assert.equal(r.status, 403);
  // impossible de déclarer pour autrui
  r = await call('PATCH', '/api/state', { changes: { coi: { u3: { declare: true, conflit: false } } } }, ev);
  assert.equal(r.status, 403);
  r = await call('PATCH', '/api/state', { changes: { coi: { u2: { declare: true, conflit: false, t: 'now' } } } }, ev);
  assert.equal(r.status, 200);
  const st2 = (await call('GET', '/api/state', null, ev)).json;
  r = await call('PATCH', '/api/state', { changes: { quality: q }, base: { quality: st2.revs.quality } }, ev);
  assert.equal(r.status, 200);
});

test('séparation des rôles : l’évaluateur ne peut pas approuver ni signer', async () => {
  const ev = await login('f.assamoi@bal.ci');
  const st = (await call('GET', '/api/state', null, ev)).json.state;
  const ap = JSON.parse(JSON.stringify(st.approvals)); ap[0].done = true;
  assert.equal((await call('PATCH', '/api/state', { changes: { approvals: ap } }, ev)).status, 403);
  assert.equal((await call('PATCH', '/api/state', { changes: { contractSigned: true } }, ev)).status, 403);
});

test('signature du marché impossible tant que tous les niveaux n’ont pas approuvé', async () => {
  const c = await login('a.diomande@bal.ci');
  const r = await call('PATCH', '/api/state', { changes: { contractSigned: true } }, c);
  assert.equal(r.status, 403);
  assert.match(r.json.error, /approbation/);
});

test('conflit de révision détecté (409)', async () => {
  const c = await login('y.koffi@bal.ci');
  const st = (await call('GET', '/api/state', null, c)).json;
  const crit = st.state.criteria;
  assert.equal((await call('PATCH', '/api/state', { changes: { criteria: crit }, base: { criteria: st.revs.criteria } }, c)).status, 200);
  assert.equal((await call('PATCH', '/api/state', { changes: { criteria: crit }, base: { criteria: st.revs.criteria } }, c)).status, 409);
});

test('le journal d’audit est chaîné et vérifiable', async () => {
  const c = await login('s.bamba@bal.ci');
  const v = await call('GET', '/api/audit/verify', null, c);
  assert.equal(v.json.ok, true);
  assert.ok(v.json.entries > 3);
});

test('un administrateur ne peut pas se retirer la gestion des rôles', async () => {
  const c = await login('administrateur@bal.ci');
  const st = (await call('GET', '/api/state', null, c)).json.state;
  const roles = JSON.parse(JSON.stringify(st.roles)); roles.admin.perms['roles.edit'] = false;
  assert.equal((await call('PATCH', '/api/state', { changes: { roles } }, c)).status, 403);
});

test('requêtes d’écriture non JSON refusées', async () => {
  const res = await fetch(base + '/api/audit', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'a=1' });
  assert.equal(res.status, 415);
});
