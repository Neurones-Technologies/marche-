/* Budget et engagement : lignes budgétaires contrôlées, imputation de la demande d'achat puis de la commande,
   crédits réservés à la soumission, engagés à l'émission ; refus quand les crédits manquent ; ligne utilisée protégée. */
const { call, login, getState, patch, upload } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.json));
const refusé = (r, status, code) => { assert.equal(r.status, status, JSON.stringify(r.json)); if (code) assert.equal(r.json.code, code); };
const PDF = Buffer.from('%PDF-1.4 test');
let admin, achats, approb, demandeur, pid, cmd;
const ligne = async (id) => (await call('GET', '/api/budget', null, achats)).json.lignes.find((l) => l.id === id);

test('lignes budgétaires : saisies par l’administrateur, contrôlées par le serveur', async () => {
  admin = await login('administrateur@bal.ci'); achats = await login('y.koffi@bal.ci'); approb = await login('a.diomande@bal.ci');
  demandeur = await login('k.yao@bal.ci');
  const s = await getState(admin);
  assert.equal(s.budget.lignes.length, 3);
  const a = new Date().getFullYear();
  refusé(await patch(achats, { budget: s.budget }), 403);
  refusé(await patch(admin, { budget: { lignes: s.budget.lignes.concat([{ ...s.budget.lignes[0], id: 'b-double' }]) } }), 422, 'BUDGET_INVALID'); // même code, même exercice
  ok(await patch(admin, { budget: { lignes: s.budget.lignes.concat([{ id: 'b-petit', code: 'TST-01', libelle: 'Petite ligne', service: '', exercice: a, montant: 1000000 }]) } }));
  const l = await ligne('b-petit');
  assert.deepEqual([l.engage, l.reserve, l.disponible], [0, 0, 1000000]);
});

test('demande d’achat imputée : la ligne suit jusqu’à l’appel d’offres', async () => {
  const B = { objet: 'Postes', service: 'DSI', description: 'Dix postes.', justification: 'Renouvellement.', budget: 20000000 };
  refusé(await call('POST', '/api/besoins', { ...B, ligneBudget: 'inconnue' }, demandeur), 422);
  ok(await call('POST', '/api/besoins', { ...B, ligneBudget: 'b-petit' }, demandeur), 201);
});

test('commande : crédits insuffisants refusés, réservés à la soumission ; ligne utilisée protégée', async () => {
  const c = await call('POST', '/api/procedures', { ref: 'AO-2026-070', objet: 'Postes de travail', profil: 'prive' }, achats);
  ok(c, 201); pid = c.json.id;
  await require('./_client').remplir(achats, pid);
  const s0 = await getState(admin, pid);
  ok(await patch(admin, { org: { ...s0.org, reglages: { niveauxApprobationMin: 1 } }, approvals: s0.approvals.slice(0, 1) }, pid));
  ok(await patch(achats, { consultes: { mode: 'restreint', partenaires: ['PRT-0001'] } }, pid));
  ok(await patch(achats, { cdc: { ...s0.cdc, cdcPublie: true, ligneBudget: 'b-petit' } }, pid));
  const sotrap = await login('contact.sotrap@bal.ci');
  for (const doc of ['registre', 'fiscal', 'cnps', 'caution']) ok(await upload(doc, doc + '.pdf', PDF, sotrap, pid), 201);
  ok(await call('POST', `/api/procedures/${pid}/offers`, { name: 'SOTRAP Ingénierie SA', iso: 'CI', devise: 'XOF', montant: 24000000, delai: 45, lots: [s0.cdc.lots[0].id] }, sotrap), 201);
  ok(await patch(achats, { depClosed: true }, pid));
  ok(await patch(await login('m.traore@bal.ci'), { evalDone: true }, pid));
  ok(await call('POST', `/api/procedures/${pid}/approbations/0`, {}, approb));
  cmd = (await call('POST', '/api/commandes', { procedure: pid }, achats)).json.commande;
  assert.equal(cmd.ligneBudget, 'b-petit'); // héritée du dossier
  refusé(await call('POST', `/api/commandes/${cmd.id}/soumettre`, {}, achats), 409, 'BUDGET_INSUFFICIENT');
  // ligne portée à 30 millions : la commande se soumet, ses crédits sont réservés
  const b = (await getState(admin)).budget;
  ok(await patch(admin, { budget: { lignes: b.lignes.map((l) => (l.id === 'b-petit' ? { ...l, montant: 30000000 } : l)) } }));
  ok(await call('POST', `/api/commandes/${cmd.id}/soumettre`, {}, achats));
  let l = await ligne('b-petit');
  assert.deepEqual([l.reserve, l.disponible], [24000000, 6000000]);
  // la ligne ne descend pas sous ce qu'elle réserve, et ne se supprime pas
  const b2 = (await getState(admin)).budget;
  refusé(await patch(admin, { budget: { lignes: b2.lignes.map((x) => (x.id === 'b-petit' ? { ...x, montant: 10000000 } : x)) } }), 409, 'BUDGET_LINE_IN_USE');
  refusé(await patch(admin, { budget: { lignes: b2.lignes.filter((x) => x.id !== 'b-petit') } }), 409, 'BUDGET_LINE_IN_USE');
  // validée puis émise : les crédits passent de réservés à engagés
  const v = await call('POST', `/api/commandes/${cmd.id}/approbations/0`, {}, approb);
  if (v.json.commande.statut === 'validation') ok(await call('POST', `/api/commandes/${cmd.id}/approbations/1`, {}, admin));
  ok(await call('POST', `/api/commandes/${cmd.id}/emettre`, {}, achats));
  l = await ligne('b-petit');
  assert.deepEqual([l.engage, l.reserve, l.disponible], [24000000, 0, 6000000]);
});
