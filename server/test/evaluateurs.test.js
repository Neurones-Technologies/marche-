/* Évaluateurs : modèles de critères de l'organisation, assignation des offres, notes par évaluateur et moyenne,
   cloisonnement de ce que chacun voit. Les tests s'enchaînent : chacun part de l'état laissé par le précédent. */
const { call, login, getState, patch, clone, evaluerOffres, assignerEvaluateurs } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../public/js/regles.js');

const U = (p) => '/api/procedures/p1' + p;
const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.json));
const refusé = (r, status, code) => { assert.equal(r.status, status, JSON.stringify(r.json)); if (code) assert.equal(r.json.code, code); };
const org = (cookie, changes) => call('PATCH', '/api/organisation/state', { changes }, cookie);
const noter = (c, offre, crit, note) => call('PUT', U(`/scores/${offre}/${crit}`), { note }, c);
const assigner = (c, offre, tech, fin) => call('PUT', U(`/assignations/${offre}`), { tech, fin }, c);
let admin, achats, evaltech, evalfin, approb;

test('connexions', async () => {
  admin = await login('administrateur@bal.ci'); achats = await login('y.koffi@bal.ci'); evaltech = await login('f.assamoi@bal.ci');
  evalfin = await login('m.traore@bal.ci'); approb = await login('a.diomande@bal.ci');
});

test('modèles de critères : techniques par l’administration, financiers aussi par l’acheteur, contrôlés', async () => {
  const s = await getState(admin);
  assert.deepEqual(s.criteresTechniques.criteres.map((c) => [c.id, c.weight, c.domaine]), [['metho', 30, 'technique'], ['refs', 15, 'technique']]);
  assert.equal(s.criteresTechniques.minEvaluateurs, 1);
  assert.deepEqual(s.criteresFinanciers.criteres.map((c) => [c.id, c.kind, c.domaine]), [['prix', 'auto', 'financier'], ['delai', 'auto', 'financier']]);
  const tech = clone(s.criteresTechniques), fin = clone(s.criteresFinanciers);
  // l'acheteur définit les critères financiers, pas les techniques ; l'évaluateur n'en définit aucun
  const finPlus = { ...fin, criteres: [...fin.criteres, { id: 'paiement', label: 'Conditions de paiement', weight: 0, kind: 'qual' }] };
  ok(await org(achats, { criteresFinanciers: finPlus }));
  assert.equal((await org(achats, { criteresTechniques: tech })).status, 403);
  assert.equal((await org(evaltech, { criteresFinanciers: fin })).status, 403);
  const e = (await getState(admin)).criteresFinanciers.criteres.find((c) => c.id === 'paiement');
  assert.deepEqual([e.kind, e.domaine], ['qual', 'financier']);
  // contrôles
  refusé(await org(admin, { criteresTechniques: { ...tech, minEvaluateurs: 0 } }), 422, 'CRITERIA_TEMPLATE_INVALID');
  refusé(await org(admin, { criteresTechniques: { ...tech, criteres: [{ id: 'prix', label: 'Prix', weight: 10 }] } }), 422, 'CRITERIA_TEMPLATE_INVALID');
  refusé(await org(admin, { criteresTechniques: { ...tech, criteres: [{ id: 'paiement', label: 'Doublon avec le financier', weight: 10 }] } }), 422, 'CRITERIA_TEMPLATE_INVALID');
  refusé(await org(admin, { criteresTechniques: { ...tech, criteres: [{ id: 'metho', label: ' ', weight: 10 }] } }), 422, 'CRITERIA_TEMPLATE_INVALID');
  refusé(await org(admin, { criteresFinanciers: { criteres: [{ id: 'metho', label: 'Pris', weight: 101 }] } }), 422, 'CRITERIA_TEMPLATE_INVALID');
  // le modèle s'applique à la grille d'un nouvel appel d'offres, financier d'abord
  ok(await org(admin, { criteresTechniques: { minEvaluateurs: 1, criteres: [...tech.criteres, { id: 'equipe', label: 'Équipe projet', weight: 0 }] } }));
  const c = await call('POST', '/api/procedures', { ref: 'AO-2026-031', objet: 'Mobilier', profil: 'prive' }, achats);
  assert.equal(c.status, 201, JSON.stringify(c.json));
  const g = (await getState(achats, c.json.id)).criteria;
  assert.deepEqual(g.map((x) => [x.id, x.kind, x.domaine]), [['prix', 'auto', 'financier'], ['delai', 'auto', 'financier'], ['paiement', 'qual', 'financier'], ['metho', 'qual', 'technique'], ['refs', 'qual', 'technique'], ['equipe', 'qual', 'technique']]);
  // le domaine d'un critère calculé est toujours financier
  refusé(await patch(achats, { criteria: g.map((x) => (x.id === 'prix' ? { ...x, domaine: 'technique' } : x)) }, c.json.id), 422, 'CRITERIA_INVALID');
});

test('assignation : réservée à l’acheteur, à des comptes habilités pour le domaine, par offre', async () => {
  const s = await getState(achats);
  assert.deepEqual(s.assignations.sotrap, { tech: ['u2'], fin: ['u3'] }); // la démonstration est déjà assignée
  refusé(await assigner(evaltech, 'sotrap', ['u2'], ['u3']), 403);
  refusé(await assigner(approb, 'sotrap', ['u2'], ['u3']), 403);
  refusé(await assigner(achats, 'inconnue', ['u2'], ['u3']), 404);
  refusé(await assigner(achats, 'sotrap', 'u2', ['u3']), 422);
  refusé(await call('PUT', U('/assignations/sotrap'), {}, achats), 422);
  refusé(await assigner(achats, 'sotrap', ['u1'], ['u3']), 422, 'ASSIGNMENT_PERMISSION');   // un responsable des achats ne note pas
  refusé(await assigner(achats, 'sotrap', ['u3'], ['u3']), 422, 'ASSIGNMENT_PERMISSION');   // l'évaluateur financier ne note pas le technique
  refusé(await assigner(achats, 'sotrap', ['u2'], ['u2']), 422, 'ASSIGNMENT_PERMISSION');   // ni l'inverse
  refusé(await assigner(achats, 'sotrap', ['u2', 'u2'], ['u3']), 422, 'ASSIGNMENT_INVALID'); // pas de doublon
  const r = await assigner(achats, 'sotrap', ['u2', 'u0'], ['u3']);
  ok(r);
  assert.deepEqual(r.json.values.assignations.sotrap, { tech: ['u2', 'u0'], fin: ['u3'] });
  const e = await getState(admin);
  assert.ok(e.audit.some((x) => /assignée à .*Administrateur/.test(x.a) && /SOTRAP/.test(x.a)));
  // l'évaluateur assigné en est prévenu
  const n = (await getState(admin)).notifs.find((x) => x.ev === 'eval.assignee' && x.ids.includes('u0'));
  assert.ok(n && /SOTRAP/.test(n.corps));
  assert.deepEqual((await assigner(achats, 'sotrap', ['u2'], ['u3'])).status, 200);
});

test('l’évaluation reste fermée tant qu’une offre n’a pas ses évaluateurs, technique et financier', async () => {
  const s = await getState(achats);
  ok(await patch(achats, { cdc: { ...s.cdc, cdcPublie: true } }));
  const confirmed = {};
  s.offers.forEach((o) => o.fields.forEach((f, i) => { if (f.flag) confirmed[o.id + '_' + i] = true; }));
  ok(await patch(achats, { confirmed, depClosed: true }));
  for (const [c, uid] of [[evaltech, 'u2'], [evalfin, 'u3'], [admin, 'u0']]) {
    const coi = clone((await getState(c)).coi); coi[uid] = { declare: true, conflit: false, t: 'test' };
    ok(await patch(c, { coi }));
  }
  ok(await assigner(achats, 'delta', [], ['u3']));
  let r = await noter(evaltech, 'sotrap', 'metho', 60);
  refusé(r, 409, 'GATE_EVALUATORS_NOT_ASSIGNED');
  assert.match(r.json.error, /Delta Bâtiment SA : évaluateur technique/);
  // « À faire » : l'acheteur doit assigner ; l'évaluateur n'a rien à noter tant que l'évaluation est fermée
  const titres = async (c) => (await call('GET', '/api/accueil', null, c)).json.taches.map((t) => t.titre);
  assert.ok((await titres(achats)).includes('Assigner les évaluateurs de AO-2026-014'));
  assert.ok(!(await titres(evaltech)).some((t) => /^Noter les offres/.test(t)));
  ok(await assigner(achats, 'delta', ['u2'], []));
  refusé(await noter(evaltech, 'sotrap', 'metho', 60), 409, 'GATE_EVALUATORS_NOT_ASSIGNED');
  assert.deepEqual(R.assignationManquante({ ...(await getState(achats)), minEvaluateurs: 1 }).length, 1);
  ok(await assigner(achats, 'delta', ['u2'], ['u3']));
  assert.ok((await titres(evaltech)).includes('Noter les offres de AO-2026-014'));
  ok(await noter(evaltech, 'sotrap', 'metho', 60));
});

test('le nombre minimal d’évaluateurs techniques est un réglage de l’organisation', async () => {
  const s = await getState(admin);
  ok(await org(admin, { criteresTechniques: { ...clone(s.criteresTechniques), minEvaluateurs: 2 } }));
  const r = await noter(evaltech, 'sotrap', 'metho', 65);
  refusé(r, 409, 'GATE_EVALUATORS_NOT_ASSIGNED');
  assert.match(r.json.error, /2 exigés/);
  for (const o of s.offers) ok(await assigner(achats, o.id, ['u2', 'u0'], ['u3']));
  ok(await noter(evaltech, 'sotrap', 'metho', 60));
});

test('moyenne des évaluateurs : chacun saisit sa note, la note retenue est la moyenne', async () => {
  ok(await noter(admin, 'sotrap', 'metho', 80));
  let s = await getState(admin);
  assert.deepEqual(s.notesEval.sotrap.metho, { u2: 60, u0: 80 });
  assert.equal(s.quality.sotrap.metho, 70);
  // une décimale, et la moyenne suit chaque nouvelle note
  ok(await noter(admin, 'sotrap', 'metho', 85));
  assert.equal((await getState(admin)).quality.sotrap.metho, 72.5);
  ok(await noter(admin, 'sotrap', 'metho', 80));
  // l'évaluateur technique ne voit que sa propre note, jamais celle de son collègue ni la moyenne
  const mien = await getState(evaltech);
  assert.deepEqual(mien.notesEval.sotrap.metho, { u2: 60 });
  assert.deepEqual(mien.quality, {});
  // on ne saisit que pour soi, et jamais directement la moyenne
  const ne = clone(s.notesEval); ne.sotrap.metho.u0 = 10;
  refusé(await patch(evaltech, { notesEval: ne }), 403, 'NOTE_NOT_YOURS');
  const q = clone(s.quality); q.sotrap.metho = 99;
  refusé(await patch(admin, { quality: q }), 409, 'NOTES_PER_EVALUATOR');
  refusé(await patch(admin, { quality: q, notesEval: s.notesEval }), 409, 'NOTES_PER_EVALUATOR');
  const retrait = clone(s.notesEval); delete retrait.sotrap.metho.u2;
  refusé(await patch(admin, { notesEval: retrait }), 403, 'NOTE_NOT_YOURS');
  const sien = clone(s.notesEval); delete sien.sotrap.metho.u0;
  refusé(await patch(admin, { notesEval: sien }), 409, 'NOTE_LOCKED');
  // note hors bornes
  refusé(await noter(evaltech, 'sotrap', 'metho', 120), 403);
});

test('chacun note son domaine, sur les offres qui lui sont assignées', async () => {
  refusé(await noter(evalfin, 'sotrap', 'metho', 60), 403, 'DOMAIN_FORBIDDEN');
  refusé(await noter(evaltech, 'sotrap', 'paiement', 60), 404); // critère absent de la grille de cette procédure
  refusé(await noter(achats, 'sotrap', 'metho', 60), 403);
  refusé(await noter(approb, 'sotrap', 'metho', 60), 403);
  ok(await assigner(achats, 'kora', ['u0'], ['u3'])); // u2 n'évalue plus Kora
  refusé(await noter(evaltech, 'kora', 'metho', 60), 403, 'NOT_ASSIGNED');
  // l'évaluateur technique seul ne voit pas Kora, ni les notes des autres
  const vu = await getState(evaltech);
  assert.ok(!vu.offers.some((o) => o.id === 'kora'));
  assert.ok(vu.offers.some((o) => o.id === 'sotrap'));
  assert.deepEqual(Object.keys(vu.assignations).sort(), vu.offers.map((o) => o.id).sort());
  assert.deepEqual(vu.receipts, []);
  assert.ok(vu.offers.every((o) => o.montant === undefined && o.prixLots === undefined), 'l’évaluation technique se fait sans les montants');
  assert.ok((await getState(achats)).offers.every((o) => o.montant !== undefined));
  assert.ok(R.evaluateurRestreint((p) => !!({ 'eval.technique': true, 'eval.score': true })[p]));
  // l'acheteur et l'évaluateur financier (qui valide) voient toutes les offres
  assert.ok((await getState(achats)).offers.some((o) => o.id === 'kora'));
  assert.ok((await getState(evalfin)).offers.some((o) => o.id === 'kora'));
  ok(await assigner(achats, 'kora', ['u2', 'u0'], ['u3']));
});

test('un évaluateur qui a noté ne peut plus être retiré ; l’évaluation ne se valide qu’une fois toutes les notes saisies', async () => {
  refusé(await assigner(achats, 'sotrap', ['u0'], ['u3']), 409, 'EVALUATOR_HAS_NOTES');
  let r = await patch(evalfin, { evalDone: true });
  refusé(r, 409, 'EVALUATION_INCOMPLETE');
  assert.match(r.json.error, /note\(s\) restent à saisir/);
  await evaluerOffres(); // les évaluateurs assignés saisissent ce qui leur manque
  const s = await getState(admin);
  assert.deepEqual(R.notationManquante({ ...s, minEvaluateurs: 2 }), []);
  // l'écart de la moyenne avec la note proposée par l'IA reste à justifier
  refusé(await patch(evalfin, { evalDone: true }), 422, 'JUSTIFICATION_REQUIRED');
  ok(await patch(evaltech, { justif: { sotrap_metho: 'Planning de bascule absent.' } }));
  ok(await patch(evalfin, { evalDone: true }));
  refusé(await noter(evaltech, 'sotrap', 'metho', 50), 409, 'EVALUATION_VALIDATED');
  refusé(await assigner(achats, 'sotrap', ['u2'], ['u3']), 409, 'EVALUATION_VALIDATED');
});

test('nouvelle procédure : assignations et notes par évaluateur propres à chacune', async () => {
  const s = await getState(achats, 'p2');
  assert.deepEqual([s.assignations, s.notesEval], [{}, {}]);
  assert.deepEqual((await getState(achats)).assignations.sotrap, { tech: ['u2', 'u0'], fin: ['u3'] });
});

test('sans critère technique à noter, aucun évaluateur technique n’est exigé ; l’évaluateur financier l’est toujours', () => {
  const o = (id) => ({ id, name: id, iso: 'CI', docs: {} });
  const ctx = { offers: [o('a')], excluded: {}, docDefs: [], criteria: [{ id: 'prix', kind: 'auto', weight: 100 }], assignations: {}, notesEval: {} };
  assert.deepEqual(R.assignationManquante(ctx), ['a : évaluateur financier']);
  assert.deepEqual(R.assignationManquante({ ...ctx, assignations: { a: { tech: [], fin: ['u3'] } } }), []);
  const avecTech = { ...ctx, criteria: [...ctx.criteria, { id: 'm', kind: 'qual', weight: 0 }], assignations: { a: { tech: [], fin: ['u3'] } } };
  assert.deepEqual(R.assignationManquante(avecTech), ['a : évaluateur technique']);
  assert.equal(R.moyenneNotes({ assignations: { a: { tech: ['x', 'y'], fin: [] } }, notesEval: { a: { m: { x: 10, y: 15, z: 100 } } } }, o('a'), { id: 'm', kind: 'qual' }), 12.5); // z n'est pas assigné
  assert.equal(R.moyenneNotes({ assignations: {}, notesEval: {} }, o('a'), { id: 'm', kind: 'qual' }), null);
});
