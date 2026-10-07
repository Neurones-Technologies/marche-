/* Vider les données : registres, échanges, pièces et budget effacés ; paramètres et comptes conservés. */
const { call, login, getState } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.json));

test('vider les données : confirmation exigée, registres vides, paramètres et comptes gardés', async () => {
  const admin = await login('administrateur@bal.ci'), sotrap = await login('contact.sotrap@bal.ci');
  const avant = await getState(admin);
  assert.equal((await call('POST', '/api/admin/vider', { confirmation: 'VIDER' }, sotrap)).status, 403);
  assert.equal((await call('POST', '/api/admin/vider', {}, admin)).json.code, 'CONFIRMATION_REQUIRED');
  ok(await call('POST', '/api/admin/vider', { confirmation: 'VIDER' }, admin));
  assert.deepEqual((await call('GET', '/api/procedures', null, admin)).json.procedures, []);
  assert.deepEqual((await call('GET', '/api/besoins', null, admin)).json.besoins || [], []);
  assert.deepEqual((await call('GET', '/api/budget', null, admin)).json.lignes, []);
  assert.equal((await call('GET', '/api/partenaires', null, await login('y.koffi@bal.ci'))).json.partenaires.length, 0);
  // les comptes se connectent toujours ; l'organisation et ses rôles sont intacts
  const apres = (await call('GET', '/api/organisation/state', null, await login('y.koffi@bal.ci'))).json.state;
  assert.equal(apres.org.nom, avant.org.nom);
  assert.deepEqual(Object.keys(apres.roles).sort(), Object.keys(avant.roles).sort());
  const journal = (await call('GET', '/api/audit', null, admin)).json;
  assert.ok(journal.entrees.some((e) => /Données effacées/.test(JSON.stringify(e))));
  assert.equal(journal.verification.ok, true); // nouvelle chaîne d'audit, intègre
});
