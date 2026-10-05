/* Moteur de circuits : étapes requises selon le montant, rôle réservé, rejet motivé, minimum du profil.
   Les tests d'API s'enchaînent : chacun part de l'état laissé par le précédent. */
const { call, login, getState, patch, clone } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../public/js/circuits.js');

const U = (p) => '/api/procedures/p1' + p;
const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.json));
const refusé = (r, status, code) => { assert.equal(r.status, status, JSON.stringify(r.json)); if (code) assert.equal(r.json.code, code); };
let admin, achats, evalfin, approb;

test('moteur : étapes requises, ordre, rôle réservé, séparation des fonctions', () => {
  const c = C.appliquerMontant([{ role: 'A', done: false }, { role: 'B', seuil: 100, done: false }, { role: 'C', seuil: 10, roleId: 'approb', done: false }], 50);
  assert.deepEqual(c.map((e) => e.requis), [true, false, true]);
  assert.equal(C.prochaine(c), 0);
  assert.equal(C.complet(c), false);
  assert.equal(C.controle(c, 2, { id: 'u4', role: 'approb' }).code, 'APPROVAL_ORDER');
  assert.equal(C.controle(c, 1, { id: 'u4', role: 'approb' }).code, 'STEP_NOT_REQUIRED');
  assert.equal(C.controle(c, 0, { id: 'u2', role: 'evaltech' }, ['u2']).code, 'SEPARATION_OF_DUTIES');
  c[0].done = true;
  assert.equal(C.prochaine(c), 2, 'l’étape non requise est sautée');
  assert.equal(C.controle(c, 2, { id: 'u1', role: 'achats' }).code, 'STEP_ROLE');
  assert.equal(C.controle(c, 2, { id: 'u4', role: 'approb' }), null);
  c[2].done = true;
  assert.equal(C.complet(c), true);
  assert.deepEqual(C.reinitialiser(c).map((e) => [e.done, 'requis' in e, e.seuil]), [[false, false, undefined], [false, false, 100], [false, false, 10]]);
});

test('configuration du circuit : seuils et rôle réservé, contrôlés par le serveur', async () => {
  admin = await login('administrateur@bal.ci'); achats = await login('y.koffi@bal.ci');
  evalfin = await login('m.traore@bal.ci'); approb = await login('a.diomande@bal.ci');
  const s = await getState(admin);
  refusé(await patch(admin, { approvals: [{ ...s.approvals[0], roleId: 'inconnu' }, s.approvals[1]] }), 422, 'CIRCUIT_INVALID');
  // tous les niveaux au-delà d'un seuil élevé : un seul requis pour le montant de cette procédure
  const circuit = [
    { role: 'Chef de service Achats', who: 'A. Diomandé', roleId: 'approb', done: false },
    { role: 'Direction Financière', who: 'M. Traoré', seuil: 500000000, done: false },
    { role: 'Comité d’engagement', who: 'Comité', seuil: 1000000000, done: false },
  ];
  ok(await patch(admin, { approvals: circuit }));
  // la déclaration « requis » vient du serveur, jamais du navigateur
  const lu = (await getState(admin)).approvals;
  assert.ok(lu.every((e) => !('requis' in e)));
});

test('validation de l’évaluation : refusée si le montant laisse moins de niveaux que le profil n’en exige', async () => {
  let s = await getState(achats);
  ok(await patch(achats, { cdc: { ...s.cdc, cdcPublie: true } }));
  s = await getState(achats);
  const confirmed = {};
  s.offers.forEach((o) => o.fields.forEach((f, i) => { if (f.flag) confirmed[o.id + '_' + i] = true; }));
  ok(await patch(achats, { confirmed, depClosed: true }));
  refusé(await patch(evalfin, { evalDone: true }), 422, 'APPROVAL_CIRCUIT_TOO_SHORT');
  const ap = clone((await getState(admin)).approvals); ap[1].seuil = 50000000;
  ok(await patch(admin, { approvals: ap }));
  ok(await patch(evalfin, { evalDone: true }));
  s = await getState(admin);
  assert.deepEqual(s.approvals.map((e) => e.requis), [true, true, false]);
  assert.ok(s.audit.some((e) => e.a.startsWith('Circuit d’approbation : pour ') && e.a.includes('Comité')));
});

test('approbation : rôle réservé, étape non requise refusée', async () => {
  refusé(await call('POST', U('/approbations/0'), {}, admin), 403, 'STEP_ROLE');
  ok(await call('POST', U('/approbations/0'), {}, approb));
  refusé(await call('POST', U('/approbations/2'), {}, approb), 409, 'STEP_NOT_REQUIRED'); // comité : non requis pour ce montant
});

test('rejet de l’attribution : motivé, par le niveau attendu, retour à l’évaluation', async () => {
  refusé(await call('POST', U('/approbations/0/rejet'), { motif: 'x' }, approb), 409, 'APPROVAL_ORDER');
  refusé(await call('POST', U('/approbations/1/rejet'), { motif: '  ' }, approb), 422, 'REJECTION_REASON_REQUIRED');
  refusé(await call('POST', U('/approbations/1/rejet'), { motif: 'Montant hors budget.' }, evalfin), 403); // pas l'habilitation
  const r = await call('POST', U('/approbations/1/rejet'), { motif: 'Montant hors budget : renégocier le périmètre.' }, approb);
  ok(r);
  const s = await getState(admin);
  assert.equal(s.evalDone, false);
  assert.ok(s.approvals.every((e) => !e.done && !e.by));
  assert.deepEqual([s.rejets[0].niveau, s.rejets[0].role, s.rejets[0].by], [1, 'Direction Financière', 'u4']);
  assert.ok(s.rejets[0].at);
  assert.ok(s.audit.some((e) => e.a.startsWith('Attribution rejetée au niveau « Direction Financière »')));
  // un rejet enregistré ne se modifie pas
  refusé(await patch(admin, { rejets: [] }), 409, 'REJECTION_LOCKED');
});

test('après le rejet : nouvelle validation, circuit complet sans le niveau non requis', async () => {
  ok(await patch(evalfin, { evalDone: true }));
  ok(await call('POST', U('/approbations/0'), {}, approb));
  ok(await call('POST', U('/approbations/1'), {}, approb));
  refusé(await call('POST', U('/approbations/2'), {}, approb), 409, 'STEP_NOT_REQUIRED');
  const s = await getState(approb);
  ok(await patch(approb, { standstill: { ...s.standstill, startedAt: 1 } })); // attribution prononcée : notification possible
});

test('suppléance : ouvre un niveau réservé, sans jamais lever la séparation des fonctions', () => {
  const MPC = require('../../public/js/circuits.js');
  const circuit = [{ role: 'Comité', who: 'Comité', roleId: 'approb' }];
  const suppleant = { id: 'u9', role: 'controle' };
  assert.equal(MPC.controle(circuit, 0, suppleant, []).code, 'STEP_ROLE');
  const parDelegation = { roles: { approb: { id: 'u4', nom: 'A. Diomandé', du: '2026-10-01', au: '2026-10-10' } } };
  assert.equal(MPC.controle(circuit, 0, suppleant, [], parDelegation), null);
  assert.deepEqual(MPC.pour(circuit, 0, suppleant, parDelegation), { via: 'delegation', id: 'u4', nom: 'A. Diomandé', du: '2026-10-01', au: '2026-10-10' });
  assert.equal(MPC.controle(circuit, 0, suppleant, ['u9'], parDelegation).code, 'SEPARATION_OF_DUTIES');
  const parAffectation = { affectes: { 0: { motif: 'Absence', par: 'Administrateur' } } };
  assert.equal(MPC.controle(circuit, 0, suppleant, [], parAffectation), null);
  assert.equal(MPC.pour(circuit, 0, suppleant, parAffectation).via, 'affectation');
  // le titulaire agit de son propre droit : pas de mention
  assert.equal(MPC.pour(circuit, 0, { id: 'u4', role: 'approb' }, parDelegation), null);
  // la remise à zéro efface la mention
  assert.equal(MPC.reinitialiser([{ ...circuit[0], done: true, pour: { via: 'affectation' } }])[0].pour, undefined);
});
