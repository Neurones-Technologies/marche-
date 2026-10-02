/* Plusieurs procédures : création, cloisonnement des données, visibilité, archivage.
   Les tests s'enchaînent : chacun part de l'état laissé par le précédent. */
const { call, login, getState, patch, clone, upload } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.json));
const refusé = (r, status, code) => { assert.equal(r.status, status, JSON.stringify(r.json)); if (code) assert.equal(r.json.code, code); };
const PDF = Buffer.from('%PDF-1.4 test');
let achats, admin, soum, evaltech;

test('la procédure de démonstration est la procédure p1', async () => {
  achats = await login('y.koffi@bal.ci');
  admin = await login('administrateur@bal.ci');
  soum = await login('contact.sotrap@bal.ci');
  evaltech = await login('f.assamoi@bal.ci');
  const l = (await call('GET', '/api/procedures', null, achats)).json.procedures;
  assert.deepEqual(l.map((p) => [p.id, p.ref]), [['p1', 'AO-2026-014']]);
  assert.equal((await getState(achats)).procedure, 'p1');
  refusé(await call('GET', '/api/procedures/p9/state', null, achats), 404);
});

test('création : réservée au cahier des charges, référence unique', async () => {
  refusé(await call('POST', '/api/procedures', { ref: 'AO-2026-020', objet: 'Mobilier' }, soum), 403);
  refusé(await call('POST', '/api/procedures', { ref: '', objet: 'Mobilier' }, achats), 422, 'REFERENCE_INVALID');
  refusé(await call('POST', '/api/procedures', { ref: 'ao-2026-014', objet: 'Mobilier' }, achats), 409, 'REFERENCE_TAKEN');
  refusé(await call('POST', '/api/procedures', { ref: 'AO-2026-020', objet: 'Mobilier', profil: 'x' }, achats), 422, 'PROFILE_UNKNOWN');
  const r = await call('POST', '/api/procedures', { ref: 'AO-2026-020', objet: 'Fourniture de mobilier de bureau', profil: 'prive' }, achats);
  ok(r, 201);
  assert.equal(r.json.id, 'p2');
  const s = await getState(achats, 'p2');
  assert.equal(s.cdc.ref, 'AO-2026-020');
  assert.equal(s.cdc.profil, 'prive');
  assert.equal(s.cdc.cdcPublie, false);
  assert.equal(s.offers.length, 0);
  assert.ok(s.approvals.length && s.approvals.every((a) => !a.done));
  assert.ok(s.audit.some((e) => e.a.startsWith('Procédure créée — AO-2026-020')));
});

test('cloisonnement : écrire dans une procédure ne touche pas l’autre', async () => {
  const p1 = await getState(achats), p2 = await getState(achats, 'p2');
  const crit = clone(p2.criteria); crit[0].weight -= 5; crit[1].weight += 5;
  ok(await patch(achats, { criteria: crit }, 'p2'));
  assert.deepEqual((await getState(achats)).criteria, p1.criteria);
  assert.deepEqual((await getState(achats, 'p2')).criteria, crit);
  // les clés d'organisation, elles, sont communes
  const org = clone(p2.org); org.ville = 'Yamoussoukro';
  ok(await patch(admin, { org }, 'p2'));
  assert.equal((await getState(achats)).org.ville, 'Yamoussoukro');
  // le journal de p2 ne montre pas les entrées propres à p1, et inversement
  ok(await patch(achats, { cdc: { ...p1.cdc, cdcPublie: true } }));
  assert.ok((await getState(achats)).audit.some((e) => e.a.startsWith('Cadre réglementaire figé')));
  assert.ok(!(await getState(achats, 'p2')).audit.some((e) => e.a.startsWith('Cadre réglementaire figé')));
  assert.equal((await getState(achats, 'p2')).cadre, null);
});

test('soumissionnaire : il ne voit que les procédures publiées, et dépose dans la bonne', async () => {
  assert.deepEqual((await call('GET', '/api/procedures', null, soum)).json.procedures.map((p) => p.id), ['p1']);
  refusé(await call('GET', '/api/procedures/p2/state', null, soum), 404);
  refusé(await upload('registre', 'rccm.pdf', PDF, soum, 'p2'), 404);
  const p2 = await getState(achats, 'p2');
  ok(await patch(achats, { cdc: { ...p2.cdc, cdcPublie: true } }, 'p2'));
  assert.deepEqual((await call('GET', '/api/procedures', null, soum)).json.procedures.map((p) => p.id), ['p1', 'p2']);
  for (const doc of ['registre', 'fiscal', 'caution']) ok(await upload(doc, doc + '.pdf', PDF, soum, 'p2'), 201);
  // le brouillon de pièces est propre à la procédure
  assert.equal((await call('GET', '/api/procedures/p1/files/mine', null, soum)).json.length, 0);
  assert.equal((await call('GET', '/api/procedures/p2/files/mine', null, soum)).json.length, 3);
  const lot = (await getState(soum, 'p2')).cdc.lots[0].id;
  const r = await call('POST', '/api/procedures/p2/offers', { name: 'Mobilia SARL', iso: 'SN', devise: 'XOF', montant: 12000000, delai: 30, lots: [lot] }, soum);
  ok(r, 201);
  assert.equal(r.json.receipt.ref, 'AO-2026-020');
  assert.deepEqual((await getState(achats, 'p2')).offers.map((o) => o.name), ['Mobilia SARL']);
  assert.ok(!(await getState(achats)).offers.some((o) => o.name === 'Mobilia SARL'));
  assert.equal((await getState(soum, 'p2')).receipts.length, 1);
  assert.equal((await getState(soum)).receipts.length, 0);
});

test('séparation des fonctions : elle se juge procédure par procédure', async () => {
  // l'évaluateur déclare et note dans p1 ; cela ne crée aucun historique dans p2
  const coi = { ...(await getState(evaltech)).coi, u2: { declare: true, conflit: false, t: 'test' } };
  ok(await patch(evaltech, { coi }));
  assert.equal((await getState(evaltech, 'p2')).coi.u2, undefined);
});

test('archivage : la procédure se consulte mais ne se modifie plus', async () => {
  refusé(await call('PATCH', '/api/procedures/p2', { archive: true }, achats), 403);
  ok(await call('PATCH', '/api/procedures/p2', { archive: true }, admin));
  const s = await getState(achats, 'p2');
  assert.equal(s.cdc.ref, 'AO-2026-020');
  refusé(await patch(achats, { criteria: s.criteria.slice().reverse() }, 'p2'), 409, 'PROCEDURE_ARCHIVED');
  refusé(await upload('fiscal', 'f.pdf', PDF, soum, 'p2'), 404); // plus visible du soumissionnaire
  // une clé d'organisation reste modifiable depuis l'écran d'une procédure archivée
  ok(await patch(admin, { seuils: { ...s.seuils, refsMin: 2 } }, 'p2'));
  ok(await call('PATCH', '/api/procedures/p2', { archive: false }, admin));
  assert.equal((await call('GET', '/api/procedures', null, achats)).json.procedures.find((p) => p.id === 'p2').archive, false);
});

test('la chaîne d’audit reste intègre avec des entrées de plusieurs procédures', async () => {
  const v = await call('GET', '/api/audit/verify', null, admin);
  ok(v);
  assert.equal(v.json.ok, true);
});
