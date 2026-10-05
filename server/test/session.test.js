/* Version de l'application (rechargement après mise à jour) et délai de verrouillage de l'organisation. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { call, login, getState, patch, clone } = require('./_client');

test('la version est servie sans compte et ne change pas tant que le serveur tourne', async () => {
  const a = await call('GET', '/api/version'), b = await call('GET', '/api/version');
  assert.equal(a.status, 200);
  assert.ok(a.json.version);
  assert.equal(a.json.version, b.json.version);
});

test('le délai de verrouillage n’accepte que 5, 10, 15, 30 ou 60 minutes', async () => {
  const admin = await login('administrateur@bal.ci');
  const org = clone((await getState(admin)).org);
  assert.equal((await patch(admin, { org: { ...org, verrouillageMinutes: 7 } })).status, 422);
  assert.equal((await patch(admin, { org: { ...org, verrouillageMinutes: 30 } })).status, 200);
  assert.equal((await getState(admin)).org.verrouillageMinutes, 30);
});
