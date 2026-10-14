/* Écritures ciblées : une note, une confirmation, une décision de conformité, une approbation.
   Elles passent par les mêmes règles que l'écriture en bloc, sans conflit entre utilisateurs simultanés.
   Les tests s'enchaînent : chacun part de l'état laissé par le précédent. */
const { call, login, getState, patch, ouvrir, evaluerOffres } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

const U = (p) => '/api/procedures/p1' + p;
const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.json));
const refusé = (r, status, code) => { assert.equal(r.status, status, JSON.stringify(r.json)); if (code) assert.equal(r.json.code, code); };
const noter = (c, offre, crit, body) => call('PUT', U(`/scores/${offre}/${crit}`), body, c);
let achats, evaltech, evalfin, approb, soum, admin;

test('préparation : publication, déclarations d’absence de conflit', async () => {
  achats = await login('y.koffi@bal.ci'); evaltech = await login('f.assamoi@bal.ci'); evalfin = await login('m.traore@bal.ci');
  approb = await login('a.diomande@bal.ci'); soum = await login('contact.sotrap@bal.ci'); admin = await login('administrateur@bal.ci');
  const s = await getState(achats);
  ok(await patch(achats, { cdc: { ...s.cdc, cdcPublie: true } }));
  refusé(await noter(evaltech, 'sotrap', 'metho', { note: 60 }), 403); // pas encore de déclaration
  for (const [c, uid] of [[evaltech, 'u2'], [evalfin, 'u3']]) {
    const coi = (await getState(c)).coi; coi[uid] = { declare: true, conflit: false, t: 'test' };
    ok(await patch(c, { coi }));
  }
});

test('notation fermée avant la clôture du dépouillement, même par la route ciblée', async () => {
  refusé(await noter(evaltech, 'sotrap', 'metho', { note: 60 }), 409, 'GATE_DEPOUILLEMENT_NOT_CLOSED');
});

test('confirmations champ par champ, puis clôture', async () => {
  const s = await getState(achats);
  refusé(await call('PUT', U('/confirmations/inconnue/0'), { confirme: true }, achats), 404);
  refusé(await call('PUT', U('/confirmations/sotrap/0'), { confirme: 'oui' }, achats), 422);
  refusé(await call('PUT', U('/confirmations/sotrap/0'), { confirme: true }, soum), 403);
  // le dépouillement ne s'ouvre qu'à la date limite, ou à la main par un profil habilité
  const i0 = s.offers[0].fields.findIndex((f) => f.flag);
  refusé(await call('PUT', U(`/confirmations/${s.offers[0].id}/${i0}`), { confirme: true }, achats), 409, 'GATE_DEPOUILLEMENT_NOT_OPEN');
  refusé(await ouvrir(evaltech), 403);
  ok(await ouvrir(achats));
  refusé(await ouvrir(achats), 409, 'ALREADY_OPEN');
  const ouvert = (await getState(achats)).jalons;
  assert.ok(ouvert.ouvert && ouvert.ouvertureManuelle && ouvert.ouvertPar === 'u1', 'ouverture datée et nominative');
  assert.ok((await getState(admin)).audit.some((e) => /Dépouillement ouvert à la main/.test(e.a)));
  // le dépôt des offres est clos dès l'ouverture
  refusé(await call('POST', '/api/procedures/p1/offers', { name: 'Retardataire SA', iso: 'CI', devise: 'XOF', montant: 1, delai: 1, lots: ['l1'] }, soum), 409, 'DEPOUILLEMENT_OPEN');
  for (const o of s.offers) for (const [i, f] of o.fields.entries()) if (f.flag) ok(await call('PUT', U(`/confirmations/${o.id}/${i}`), { confirme: true }, achats));
  ok(await patch(achats, { depClosed: true }));
  refusé(await call('PUT', U('/confirmations/sotrap/0'), { confirme: false }, achats), 409, 'SCREENING_CLOSED');
});

test('deux évaluateurs notent en même temps : aucune note perdue, aucun conflit', async () => {
  // l'évaluateur financier ne note pas un critère technique ; l'administrateur est évaluateur technique de l'offre Delta
  refusé(await noter(evalfin, 'delta', 'refs', { note: 95 }), 403, 'DOMAIN_FORBIDDEN');
  ok(await call('PUT', U('/assignations/delta'), { tech: ['u2', 'u0'], fin: ['u3'] }, achats));
  const coi = (await getState(admin)).coi; coi.u0 = { declare: true, conflit: false, t: 'test' };
  ok(await patch(admin, { coi }));
  const [a, b] = await Promise.all([
    noter(evaltech, 'sotrap', 'metho', { note: 60, justification: 'Planning de bascule absent.' }),
    noter(admin, 'delta', 'refs', { note: 95, justification: 'Références vérifiées auprès des clients.' }),
  ]);
  ok(a); ok(b);
  const s = await getState(achats);
  assert.equal(s.quality.sotrap.metho, 60);
  assert.equal(s.quality.delta.refs, 95);
  assert.equal(s.justif.sotrap_metho, 'Planning de bascule absent.');
  assert.equal(s.justif.delta_refs, 'Références vérifiées auprès des clients.');
  // la réponse porte les valeurs enregistrées et leurs révisions, pour mettre l'interface à jour sans recharger
  // l'évaluateur technique reçoit sa note, pas la moyenne retenue
  assert.deepEqual(a.json.values.notesEval.sotrap.metho, { u2: 60 });
  assert.deepEqual(a.json.values.quality, {});
  assert.ok(a.json.revs.quality > 0);
  assert.equal(b.json.values.quality.delta.refs, 95); // l'administrateur, lui, voit la note retenue
});

test('notation ciblée : mêmes contrôles que l’écriture en bloc', async () => {
  refusé(await noter(evaltech, 'inconnue', 'metho', { note: 60 }), 404);
  refusé(await noter(evaltech, 'sotrap', 'prix', { note: 60 }), 404); // critère calculé, pas noté
  refusé(await noter(evaltech, 'sotrap', 'metho', {}), 422);
  refusé(await noter(evaltech, 'sotrap', 'metho', { note: 140 }), 403);
  refusé(await noter(soum, 'sotrap', 'metho', { note: 60 }), 403);
});

test('conformité offre par offre', async () => {
  refusé(await call('PUT', U('/conformite/kora'), { exclue: 'non' }, achats), 422);
  const r = await call('PUT', U('/conformite/kora'), { exclue: false }, achats);
  ok(r);
  assert.equal(r.json.values.excluded.kora, false);
  ok(await call('PUT', U('/conformite/kora'), { exclue: null }, achats));
  assert.equal((await getState(achats)).excluded.kora, undefined, 'retour au contrôle automatique des pièces');
});

test('approbations ciblées : ordre, séparation des fonctions, identité posée par le serveur', async () => {
  refusé(await call('POST', U('/approbations/0'), null, approb), 409, 'GATE_EVALUATION_NOT_VALIDATED');
  await evaluerOffres();
  ok(await patch(evalfin, { evalDone: true }));
  refusé(await call('PUT', U('/conformite/kora'), { exclue: true }, achats), 409, 'EVALUATION_VALIDATED');
  refusé(await call('POST', U('/approbations/1'), null, approb), 409, 'APPROVAL_ORDER');
  refusé(await call('POST', U('/approbations/9'), null, approb), 404);
  const r = await call('POST', U('/approbations/0'), null, approb);
  ok(r);
  assert.equal(r.json.values.approvals[0].by, 'u4');
  assert.ok(r.json.values.approvals[0].at);
  refusé(await call('POST', U('/approbations/0'), null, approb), 409, 'APPROVAL_ALREADY_GIVEN');
  // le niveau suivant : le même approbateur, qui n'a ni noté ni validé
  ok(await call('POST', U('/approbations/1'), null, approb));
  // sans l'habilitation « Approuver », refus (la séparation des fonctions est testée dans sequencement.test.js,
  // par la même fonction de validation)
  refusé(await call('POST', U('/approbations/2'), null, evaltech), 403);
});

test('procédure archivée : les routes ciblées sont refusées', async () => {
  const c = await call('POST', '/api/procedures', { ref: 'AO-2026-030', objet: 'Test archivage' }, achats);
  assert.equal(c.status, 201);
  ok(await call('PATCH', '/api/procedures/' + c.json.id, { archive: true }, admin));
  refusé(await call('POST', `/api/procedures/${c.json.id}/approbations/0`, null, approb), 409, 'PROCEDURE_ARCHIVED');
});
