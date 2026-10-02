/* Instance réelle (SEED_DEMO=0) : aucune donnée fictive, un seul compte administrateur, organisation nommée par
   l'environnement ; l'administrateur peut créer la première procédure depuis l'état de l'organisation seule. */
Object.assign(process.env, { SEED_DEMO: '0', ADMIN_EMAIL: 'Achats@Exemple.org', ADMIN_NOM: 'Responsable plateforme', ADMIN_PASSWORD: 'Plateforme2026!x', ORG_NOM: 'Banque Exemple' });
const { call } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

test('instance vide : ni procédure, ni partenaire, ni compte de démonstration', async () => {
  assert.equal((await call('POST', '/api/auth/login', { email: 'administrateur@bal.ci', password: 'Marche+2026!' })).status, 401);
  assert.deepEqual((await call('GET', '/api/auth/demo')).json.accounts, []);
  const l = await call('POST', '/api/auth/login', { email: 'achats@exemple.org', password: 'Plateforme2026!x' });
  assert.equal(l.status, 200, JSON.stringify(l.json));
  const admin = l.cookie;
  assert.deepEqual((await call('GET', '/api/procedures', null, admin)).json.procedures, []);
  assert.deepEqual((await call('GET', '/api/partenaires', null, admin)).json.partenaires, []);
  const st = (await call('GET', '/api/organisation/state', null, admin)).json.state;
  assert.equal(st.org.nom, 'Banque Exemple');
  assert.equal(st.org.initiales, 'BE');
  assert.deepEqual(st.users.map((u) => [u.nom, u.role]), [['Responsable plateforme', 'admin']]);
  const c = await call('POST', '/api/procedures', { ref: 'AO-2027-001', objet: 'Première procédure' }, admin);
  assert.equal(c.status, 201);
  assert.equal(c.json.id, 'p1');
});
