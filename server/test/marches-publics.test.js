/* Marchés publics en attente (MARCHES_PUBLICS absent) : l'organisation et la démonstration sont en achats privés, et
   le profil public ne peut être choisi nulle part. */
process.env.MARCHES_PUBLICS = '0';
const { call, login, getState, patch } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

test('profil public indisponible : organisation, appel d’offres, cahier des charges', async () => {
  const admin = await login('administrateur@bal.ci'), achats = await login('y.koffi@bal.ci');
  const s = await getState(admin);
  assert.equal(s.marchesPublics, false);
  assert.equal(s.org.profilDefaut, 'prive');
  assert.equal(s.consultes.mode, 'restreint'); // la démonstration consulte SOTRAP
  const r1 = await patch(admin, { org: { ...s.org, profilDefaut: 'uemoa-ci' } });
  assert.equal(r1.status, 409); assert.equal(r1.json.code, 'PROFILE_ON_HOLD');
  const r2 = await call('POST', '/api/procedures', { ref: 'AO-2026-200', objet: 'Essai', profil: 'uemoa-ci' }, achats);
  assert.equal(r2.status, 409); assert.equal(r2.json.code, 'PROFILE_ON_HOLD');
  assert.equal((await call('POST', '/api/procedures', { ref: 'AO-2026-201', objet: 'Essai', profil: 'prive' }, achats)).status, 201);
  const r3 = await patch(achats, { cdc: { ...s.cdc, profil: 'uemoa-ci' } });
  assert.equal(r3.status, 409); assert.equal(r3.json.code, 'PROFILE_ON_HOLD');
});
