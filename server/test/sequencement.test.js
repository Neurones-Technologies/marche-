/* Parcours complet d'une procédure, en essayant à chaque étape de contourner l'ordre ou les rôles.
   Les tests s'enchaînent : chacun part de l'état laissé par le précédent. */
const { call, login, getState, patch, clone } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../public/js/regles.js');

const refusé = (r, status, code) => { assert.equal(r.status, status, JSON.stringify(r.json)); if (code) assert.equal(r.json.code, code); };
const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.json));
let achats, evaltech, evalfin, approb, admin, soum;

async function declarerCoi(cookie, uid) {
  const coi = clone((await getState(cookie)).coi);
  coi[uid] = { declare: true, conflit: false, t: 'test' };
  ok(await patch(cookie, { coi }));
}
async function noter(cookie, offerId, critId, valeur) {
  const q = clone((await getState(cookie)).quality);
  q[offerId][critId] = valeur;
  return patch(cookie, { quality: q });
}
async function approuver(cookie, niveau) {
  const ap = clone((await getState(cookie)).approvals);
  ap[niveau].done = true;
  return patch(cookie, { approvals: ap });
}

test('connexions', async () => {
  achats = await login('y.koffi@bal.ci');        // u1
  evaltech = await login('f.assamoi@bal.ci');    // u2
  evalfin = await login('m.traore@bal.ci');      // u3
  approb = await login('a.diomande@bal.ci');     // u4
  admin = await login('administrateur@bal.ci');  // u0, toutes les habilitations
  soum = await login('contact.sotrap@bal.ci');
  const s = await getState(achats);
  assert.equal(s.cdc.ref, 'AO-2026-014');
  refusé(await patch(achats, { cdc: { ...s.cdc, ref: '  ' } }), 422, 'REFERENCE_INVALID');
  ok(await patch(achats, { cdc: { ...s.cdc, cdcPublie: true } }));
  refusé(await patch(achats, { cdc: { ...s.cdc, cdcPublie: true, ref: 'AO-2026-099' } }), 409, 'REFERENCE_LOCKED');
});

test('avant la clôture du dépouillement : ni notation, ni validation, ni approbation', async () => {
  await declarerCoi(evaltech, 'u2');
  refusé(await noter(evaltech, 'sotrap', 'metho', 60), 409, 'GATE_DEPOUILLEMENT_NOT_CLOSED');
  refusé(await patch(evalfin, { evalDone: true }), 409, 'GATE_DEPOUILLEMENT_NOT_CLOSED');
  refusé(await approuver(approb, 0), 409, 'GATE_EVALUATION_NOT_VALIDATED');
});

test('clôture refusée tant qu’un champ à faible confiance n’est pas confirmé', async () => {
  const r = await patch(achats, { depClosed: true });
  refusé(r, 409, 'UNCONFIRMED_FIELDS');
  assert.match(r.json.error, /champ/);
});

test('clôture du dépouillement : les taux de change sont figés et journalisés', async () => {
  const s = await getState(achats);
  const confirmed = {};
  s.offers.forEach((o) => o.fields.forEach((f, i) => { if (f.flag) confirmed[o.id + '_' + i] = true; }));
  ok(await patch(achats, { confirmed, depClosed: true }));
  const after = await getState(achats);
  assert.deepEqual(after.fxFrozen.rates, s.org.rates);
  assert.ok(after.audit.some((e) => e.a.startsWith('Taux de change figés')));
  refusé(await patch(achats, { depClosed: false }), 409, 'SCREENING_CLOSED');
});

test('après clôture : offres, grille, préférence et confirmations sont verrouillées', async () => {
  const r = await call('POST', '/api/procedures/p1/offers', { name: 'Retardataire SA', iso: 'CI', devise: 'XOF', montant: 50000000, delai: 60, lots: ['l1'] }, soum);
  assert.equal(r.status, 422);
  assert.match(r.json.error, /clôturé/);
  const s = await getState(admin);
  const crit = clone(s.criteria); crit[0].weight -= 5; crit[2].weight += 5;
  refusé(await patch(admin, { criteria: crit }), 409, 'CRITERIA_LOCKED');
  refusé(await patch(admin, { cdc: { ...s.cdc, prefActive: !s.cdc.prefActive } }), 409, 'PREFERENCE_LOCKED');
  refusé(await patch(admin, { confirmed: {} }), 409, 'SCREENING_CLOSED');
  const offers = clone(s.offers); offers[0].montant = 1;
  refusé(await patch(admin, { offers }), 409, 'OFFER_LOCKED');
});

test('changer les taux dans les paramètres ne fait plus bouger le classement', async () => {
  const s = await getState(admin);
  const ctx = (st) => ({ ...st, offers: st.offers });
  const avant = R.ranking(ctx(s)).map((r) => [r.o.id, r.total]);
  const org = clone(s.org); org.rates.EUR = 300; org.rates.USD = 300;
  ok(await patch(admin, { org }));
  const apres = await getState(admin);
  assert.equal(apres.org.rates.EUR, 300);
  assert.notEqual(apres.fxFrozen.rates.EUR, 300);
  assert.deepEqual(R.ranking(ctx(apres)).map((r) => [r.o.id, r.total]), avant);
});

test('notation : tout écart avec le score IA exige une justification écrite', async () => {
  ok(await noter(evaltech, 'sotrap', 'metho', 60));
  // l'administrateur note aussi : il ne pourra plus approuver (séparation des fonctions)
  await declarerCoi(admin, 'u0');
  ok(await noter(admin, 'delta', 'refs', 95));

  let r = await patch(evalfin, { evalDone: true });
  refusé(r, 422, 'JUSTIFICATION_REQUIRED');
  assert.match(r.json.error, /SOTRAP/);
  const motif = { delta_refs: 'Une référence hors périmètre.' };
  ok(await patch(evaltech, { justif: { ...motif, sotrap_metho: '   ' } }));
  refusé(await patch(evalfin, { evalDone: true }), 422, 'JUSTIFICATION_REQUIRED');
  ok(await patch(evaltech, { justif: { ...motif, sotrap_metho: 'Méthodologie sans planning de bascule.' } }));

  r = await patch(evalfin, { evalDone: true });
  ok(r);
  const s = await getState(achats);
  assert.ok(s.audit.some((e) => e.a.startsWith('Évaluation validée — classement arrêté par le serveur : 1. ')));
});

test('après validation : notes, justifications et conformité sont figées', async () => {
  refusé(await noter(evaltech, 'sotrap', 'metho', 65), 409, 'EVALUATION_VALIDATED');
  refusé(await patch(evaltech, { justif: {} }), 409, 'EVALUATION_VALIDATED');
  refusé(await patch(achats, { excluded: { kora: false } }), 409, 'EVALUATION_VALIDATED');
  const ap = clone((await getState(admin)).approvals);
  ap.reverse();
  refusé(await patch(admin, { approvals: ap }), 409, 'APPROVAL_CIRCUIT_LOCKED');
});

test('approbation : dans l’ordre, par une personne qui n’a pas noté, identité posée par le serveur', async () => {
  refusé(await approuver(approb, 1), 409, 'APPROVAL_ORDER');
  refusé(await approuver(admin, 0), 403, 'SEPARATION_OF_DUTIES');
  const ap = clone((await getState(approb)).approvals);
  ap[0].done = true; ap[0].by = 'u5'; // tentative d'attribuer l'approbation à quelqu'un d'autre
  ok(await patch(approb, { approvals: ap }));
  const s = await getState(approb);
  assert.equal(s.approvals[0].by, 'u4');
  assert.ok(s.approvals[0].at);
  const retrait = clone(s.approvals); retrait[0].done = false;
  refusé(await patch(approb, { approvals: retrait }), 409, 'APPROVAL_FINAL');
  ok(await approuver(approb, 1));
  ok(await approuver(approb, 2));
});

test('signature : pas avant la notification, ni pendant le délai de recours', async () => {
  refusé(await patch(approb, { contractSigned: true }), 409, 'GATE_NOT_NOTIFIED');
  const t0 = Date.now();
  const s = await getState(approb);
  const antidaté = t0 - 30 * 86400000;
  ok(await patch(approb, { standstill: { ...s.standstill, startedAt: antidaté } }));
  const ss = (await getState(approb)).standstill;
  assert.ok(ss.startedAt >= t0, 'la date d’ouverture doit être celle du serveur');
  refusé(await patch(approb, { contractSigned: true }), 409, 'STANDSTILL_RUNNING');
  refusé(await patch(approb, { standstill: { ...ss, startedAt: antidaté } }), 409, 'STANDSTILL_LOCKED');
  refusé(await patch(approb, { standstill: { ...ss, days: 0 } }), 409, 'STANDSTILL_LOCKED');
});

test('recours : ni suppression, ni retour en arrière hors recours fondé', async () => {
  const recours = [{ de: 'Delta Bâtiment SA', statut: 'ouvert', t: 'test', objet: 'Contestation de la notation.' }];
  ok(await patch(achats, { recours }));
  refusé(await patch(achats, { recours: [] }), 409, 'APPEAL_LOCKED');
  refusé(await patch(soum, { recours: [{ ...recours[0], statut: 'rejete' }] }), 403);
  refusé(await patch(approb, { evalDone: false }), 409, 'EVALUATION_VALIDATED');
});

test('recours déclaré fondé : la procédure revient à l’évaluation', async () => {
  const s = await getState(approb);
  const recours = clone(s.recours); recours[0].statut = 'fonde'; recours[0].decision = 'Reprise de l’évaluation.';
  const approvals = clone(s.approvals).map((a) => ({ ...a, done: false }));
  ok(await patch(approb, { recours, evalDone: false, approvals, standstill: { ...s.standstill, startedAt: null } }));
  const after = await getState(evaltech);
  assert.equal(after.evalDone, false);
  assert.ok(after.approvals.every((a) => !a.done && !a.by));
  assert.equal(after.standstill.startedAt, null);
  // L'évaluation est rouverte : l'évaluateur peut de nouveau noter ; l'approbateur, lui, ne le pourra jamais.
  ok(await noter(evaltech, 'sotrap', 'metho', 90));
  assert.equal('_sod' in after, false);
});
