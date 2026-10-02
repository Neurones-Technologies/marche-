/* Module 2 : du besoin à la procédure. Expression, circuit de validation (seuil sur le budget), rejet motivé,
   séparation des fonctions, transformation en procédure suivie par le demandeur. Tests enchaînés. */
const { call, login, getState } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.json));
const refusé = (r, status, code) => { assert.equal(r.status, status, JSON.stringify(r.json)); if (code) assert.equal(r.json.code, code); };
const BESOIN = { objet: 'Renouvellement des postes de travail de l’agence Plateau', service: 'Agence Plateau', budget: 30000000,
  description: '40 postes, écrans compris.', justification: 'Postes de plus de 6 ans, pannes récurrentes.', dateSouhaitee: '2027-01-15' };
let demandeur, achats, approb, admin, soum, evaltech, b1, b2;

test('le demandeur n’a encore aucune procédure : l’état de l’organisation seule lui est servi', async () => {
  demandeur = await login('k.yao@bal.ci'); achats = await login('y.koffi@bal.ci'); approb = await login('a.diomande@bal.ci');
  admin = await login('administrateur@bal.ci'); soum = await login('contact.sotrap@bal.ci'); evaltech = await login('f.assamoi@bal.ci');
  assert.deepEqual((await call('GET', '/api/procedures', null, demandeur)).json.procedures, []);
  const r = await call('GET', '/api/organisation/state', null, demandeur);
  ok(r);
  assert.equal(r.json.state.procedure, null);
  assert.equal(r.json.state.cdc, undefined);
  assert.ok(r.json.state.org.nom);
  refusé(await call('PATCH', '/api/organisation/state', { changes: { quality: {} } }, admin), 409, 'NO_PROCEDURE');
  refusé(await call('POST', '/api/organisation/offers', {}, admin), 404);
});

test('expression d’un besoin : habilitation, contrôles, numéro attribué par le serveur', async () => {
  refusé(await call('POST', '/api/besoins', BESOIN, evaltech), 403);
  refusé(await call('POST', '/api/besoins', { ...BESOIN, budget: -1 }, demandeur), 422, 'NEED_INVALID');
  const r = await call('POST', '/api/besoins', BESOIN, demandeur);
  ok(r, 201);
  b1 = r.json.besoin;
  assert.match(b1.id, /^B-\d{4}-0001$/);
  assert.equal(b1.statut, 'brouillon');
  refusé(await call('PUT', `/api/besoins/${b1.id}`, { objet: 'x' }, achats), 403, 'NEED_NOT_OWNER');
  ok(await call('PUT', `/api/besoins/${b1.id}`, { description: '40 postes et 40 écrans.' }, demandeur));
});

test('visibilité : le demandeur voit ses besoins, les achats et les valideurs tous, les autres aucun', async () => {
  refusé(await call('GET', '/api/besoins', null, soum), 403);
  refusé(await call('GET', '/api/besoins', null, evaltech), 403);
  assert.deepEqual((await call('GET', '/api/besoins', null, demandeur)).json.besoins.map((b) => b.id), [b1.id]);
  assert.equal((await call('GET', '/api/besoins', null, approb)).json.besoins.length, 1);
  b2 = (await call('POST', '/api/besoins', { ...BESOIN, objet: 'Climatisation du siège', budget: 80000000 }, admin)).json.besoin;
  assert.deepEqual((await call('GET', '/api/besoins', null, demandeur)).json.besoins.map((b) => b.id), [b1.id]);
  refusé(await call('GET', `/api/besoins/${b2.id}/inconnue`, null, demandeur), 404);
});

test('soumission : type de procédure et étapes requises d’après le budget', async () => {
  refusé(await call('POST', `/api/besoins/${b1.id}/soumettre`, {}, achats), 403, 'NEED_NOT_OWNER');
  const r = await call('POST', `/api/besoins/${b1.id}/soumettre`, {}, demandeur);
  ok(r);
  assert.equal(r.json.besoin.statut, 'soumis');
  assert.equal(r.json.besoin.type, 'restreint'); // 30 M : entre les seuils provisoires de 10 M et 100 M
  assert.deepEqual(r.json.besoin.circuit.map((e) => e.requis), [true, false]); // contrôle budgétaire au-delà de 50 M
  refusé(await call('PUT', `/api/besoins/${b1.id}`, { objet: 'x' }, demandeur), 409, 'NEED_LOCKED');
  ok(await call('POST', `/api/besoins/${b2.id}/soumettre`, {}, admin));
});

test('validation : habilitation, ordre, pas de validation de son propre besoin', async () => {
  refusé(await call('POST', `/api/besoins/${b1.id}/approbations/0`, {}, demandeur), 403);
  refusé(await call('POST', `/api/besoins/${b2.id}/approbations/0`, {}, admin), 403, 'NEED_OWN');
  refusé(await call('POST', `/api/besoins/${b2.id}/approbations/1`, {}, approb), 409, 'APPROVAL_ORDER');
  const r = await call('POST', `/api/besoins/${b1.id}/approbations/0`, {}, approb);
  ok(r);
  assert.equal(r.json.besoin.statut, 'valide', 'seule étape requise pour 30 M');
  assert.equal(r.json.besoin.circuit[0].by, 'u4');
});

test('rejet motivé : retour au demandeur, nouvelle soumission sur un circuit remis à zéro', async () => {
  ok(await call('POST', `/api/besoins/${b2.id}/approbations/0`, {}, approb));
  refusé(await call('POST', `/api/besoins/${b2.id}/rejet`, { motif: ' ' }, approb), 422, 'REJECTION_REASON_REQUIRED');
  const r = await call('POST', `/api/besoins/${b2.id}/rejet`, { motif: 'Budget non inscrit cette année.' }, approb);
  ok(r);
  assert.equal(r.json.besoin.statut, 'rejete');
  assert.equal(r.json.besoin.rejet.role, 'Contrôle budgétaire');
  ok(await call('PUT', `/api/besoins/${b2.id}`, { budget: 45000000 }, admin));
  const s = await call('POST', `/api/besoins/${b2.id}/soumettre`, {}, admin);
  ok(s);
  assert.ok(s.json.besoin.circuit.every((e) => !e.done));
  assert.equal(s.json.besoin.rejet, undefined);
});

test('transformation en procédure : pré-remplie, suivie en lecture par le demandeur', async () => {
  refusé(await call('POST', `/api/besoins/${b2.id}/procedure`, { ref: 'AO-2026-041' }, achats), 409, 'NEED_NOT_VALIDATED');
  refusé(await call('POST', `/api/besoins/${b1.id}/procedure`, { ref: 'AO-2026-040' }, approb), 403);
  refusé(await call('POST', `/api/besoins/${b1.id}/procedure`, { ref: 'AO-2026-014' }, achats), 409, 'REFERENCE_TAKEN');
  const r = await call('POST', `/api/besoins/${b1.id}/procedure`, { ref: 'AO-2026-040' }, achats);
  ok(r, 201);
  const pid = r.json.procedure;
  const s = await getState(achats, pid);
  assert.equal(s.cdc.objet, BESOIN.objet);
  assert.equal(s.cdc.procedure, 'Appel d’offres restreint');
  assert.equal(s.cdc.budgetEstime, 30000000);
  assert.equal(s.cdc.besoin, b1.id);
  assert.ok(s.audit.some((e) => e.a.startsWith(`Procédure créée à partir du besoin ${b1.id}`)));
  // le demandeur voit désormais cette procédure, sans les offres ni les notes
  assert.deepEqual((await call('GET', '/api/procedures', null, demandeur)).json.procedures.map((p) => p.id), [pid]);
  const vue = await getState(demandeur, pid);
  assert.deepEqual(vue.offers, []);
  refusé(await call('POST', `/api/besoins/${b1.id}/procedure`, { ref: 'AO-2026-042' }, achats), 409, 'NEED_NOT_VALIDATED');
  assert.equal((await call('GET', '/api/besoins', null, demandeur)).json.besoins[0].statut, 'transforme');
});
