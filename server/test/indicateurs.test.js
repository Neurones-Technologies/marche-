/* Indicateurs : jalons datés par le serveur au passage des étapes (jamais écrits par le navigateur), délais,
   économies et volumes ; réservés aux lecteurs des offres, de l'audit ou des procès-verbaux. */
const { call, login, getState, patch } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.json));
let achats, soum;

test('jalons posés par le serveur ; le navigateur ne les écrit pas', async () => {
  achats = await login('y.koffi@bal.ci'); soum = await login('contact.sotrap@bal.ci');
  let s = await getState(achats);
  assert.deepEqual(s.jalons || {}, {});
  assert.equal((await patch(achats, { jalons: { publie: '2020-01-01T00:00:00Z' } })).status, 403);
  ok(await patch(achats, { cdc: { ...s.cdc, cdcPublie: true } }));
  s = await getState(achats);
  assert.ok(Date.parse(s.jalons.publie) > Date.now() - 60000);
  const confirmed = {};
  s.offers.forEach((o) => o.fields.forEach((f, i) => { if (f.flag) confirmed[o.id + '_' + i] = true; }));
  ok(await patch(achats, { confirmed, depClosed: true }));
  s = await getState(achats);
  assert.ok(s.jalons.depouille >= s.jalons.publie);
  const publie = s.jalons.publie;
  ok(await patch(achats, { cdc: { ...s.cdc, objet: s.cdc.objet + ' ' } })); // une écriture ultérieure ne redate pas
  assert.equal((await getState(achats)).jalons.publie, publie);
});

test('indicateurs : volumes, délais, économies, concurrence ; droits', async () => {
  assert.equal((await call('GET', '/api/indicateurs', null, soum)).status, 403);
  const r = await call('GET', '/api/indicateurs', null, achats);
  ok(r);
  const p1 = r.json.procedures.find((p) => p.id === 'p1');
  assert.equal(p1.offres, 8);
  assert.ok(p1.estime > 0); // somme des montants estimatifs des lots
  assert.equal(p1.delais.consultation != null, true);
  assert.equal(r.json.concurrence.offres >= 8, true);
  assert.equal(r.json.delais.consultation.nb >= 1, true);
  assert.ok(r.json.annees.includes(new Date().getUTCFullYear()));
  assert.equal((await call('GET', '/api/indicateurs?annee=1999', null, achats)).json.procedures.length, 0);
});
