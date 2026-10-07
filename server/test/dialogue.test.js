/* Dialogue avec le fournisseur : questions, réponses aux clarifications, réclamations — écritures ciblées, contrôlées
   par le serveur (le fournisseur n'écrit jamais les clés entières). */
const { call, login, getState, patch, upload, inscrire } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.json));
const PDF = Buffer.from('%PDF-1.4 test');
const MDP = 'Dialogue2026!xy';
let achats, sotrap, rival, absent;

async function compte(raison, email) {
  const r = await inscrire({ raisonSociale: raison, pays: 'CI', nom: 'Contact ' + raison, email, motDePasse: MDP });
  ok(await call('POST', '/api/inscription/verifier', { jeton: r.json.lienVerification.split('=')[1] }));
  return (await call('POST', '/api/auth/login', { email, password: MDP })).cookie;
}
async function deposer(cookie, name) {
  for (const d of ['registre', 'fiscal', 'cnps', 'caution']) ok(await upload(d, d + '.pdf', PDF, cookie), 201);
  ok(await call('POST', '/api/procedures/p1/offers', { name, iso: 'CI', devise: 'XOF', montant: 90000000, delai: 90, lots: ['l1'] }, cookie), 201);
}

test('préparation : dossier publié, deux fournisseurs déposent, un troisième non', async () => {
  achats = await login('y.koffi@bal.ci'); sotrap = await login('contact.sotrap@bal.ci');
  const s = await getState(achats);
  ok(await patch(achats, { cdc: { ...s.cdc, cdcPublie: true } }));
  rival = await compte('Rival BTP', 'contact@rival-btp.ci'); absent = await compte('Absent SA', 'contact@absent-sa.ci');
  await deposer(sotrap, 'SOTRAP SARL'); await deposer(rival, 'Rival BTP');
});

test('questions : posées par le fournisseur, publiées sans auteur, closes 3 jours avant l’échéance', async () => {
  assert.equal((await call('POST', '/api/procedures/p1/questions', { question: 'Court' }, sotrap)).status, 422);
  ok(await call('POST', '/api/procedures/p1/questions', { question: 'Le lot 4 peut-il être soumissionné seul ?' }, sotrap), 201);
  assert.equal((await call('POST', '/api/procedures/p1/questions', { question: 'Une question de l’acheteur ?' }, achats)).status, 403);
  const vueRival = (await getState(rival)).qa, vueSotrap = (await getState(sotrap)).qa, vueAchats = (await getState(achats)).qa;
  assert.equal(vueRival[0].question, 'Le lot 4 peut-il être soumissionné seul ?');
  assert.ok(!('par' in vueRival[0]) && !('partenaire' in vueRival[0]) && vueRival[0].mienne === false, 'auteur masqué aux autres');
  assert.equal(vueSotrap[0].mienne, true);
  assert.ok(vueAchats[0].par, 'l’acheteur connaît l’auteur');
  assert.ok((await getState(achats)).notifs.some((n) => n.ev === 'question.recue'), 'les achats sont prévenus');
  // réponse de l'acheteur : visible de tous
  const qa = vueAchats.map((q, i) => (i ? q : { ...q, reponse: 'Oui, chaque lot est attribué séparément.', tRep: 'test' }));
  ok(await patch(achats, { qa }));
  assert.equal((await getState(rival)).qa[0].reponse, 'Oui, chaque lot est attribué séparément.');
  // échéance dans deux jours : questions closes
  const s = await getState(achats);
  ok(await patch(achats, { cdc: { ...s.cdc, ouverture: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10) } }));
  const close = await call('POST', '/api/procedures/p1/questions', { question: 'Encore une question sur le lot 2 ?' }, rival);
  assert.equal(close.status, 409); assert.equal(close.json.code, 'QUESTIONS_CLOSED');
});

test('clarifications : seul le fournisseur visé répond, une fois', async () => {
  const s = await getState(achats);
  const deSotrap = s.offers.find((o) => o.name === 'SOTRAP SARL').id;
  ok(await patch(achats, { clarifs: s.clarifs.concat([{ offerId: deSotrap, objet: 'Bordereau', question: 'Précisez le poste 3.', statut: 'envoyee', t: 'test', echeance: 'test' }]) }));
  const i = (await getState(achats)).clarifs.length - 1;
  assert.equal((await getState(rival)).clarifs.length, 0);
  assert.equal((await getState(sotrap)).clarifs[0].i, i);
  assert.equal((await call('PUT', `/api/procedures/p1/clarifications/${i}/reponse`, { reponse: 'Réponse usurpée.' }, rival)).status, 404);
  ok(await call('PUT', `/api/procedures/p1/clarifications/${i}/reponse`, { reponse: 'Le poste 3 couvre la pose.' }, sotrap));
  assert.equal((await call('PUT', `/api/procedures/p1/clarifications/${i}/reponse`, { reponse: 'Encore.' }, sotrap)).status, 409);
  const cl = (await getState(achats)).clarifs[i];
  assert.deepEqual([cl.statut, cl.reponse], ['repondue', 'Le poste 3 couvre la pose.']);
});

test('réclamations : déposées par un fournisseur ayant remis une offre, répondues par l’acheteur', async () => {
  assert.equal((await call('POST', '/api/procedures/p1/reclamations', { objet: 'Délai', texte: 'Le délai est trop court.' }, absent)).status, 403);
  const r = await call('POST', '/api/procedures/p1/reclamations', { objet: 'Notation', texte: 'Nous contestons la notation de la méthodologie.' }, sotrap);
  ok(r, 201);
  assert.equal((await getState(rival)).reclamations.length, 0);
  assert.equal((await getState(achats)).reclamations.length, 1);
  assert.equal((await call('PUT', `/api/procedures/p1/reclamations/${r.json.reclamation.id}/reponse`, { reponse: 'x' }, sotrap)).status, 403);
  ok(await call('PUT', `/api/procedures/p1/reclamations/${r.json.reclamation.id}/reponse`, { reponse: 'La notation est confirmée après réexamen.' }, achats));
  const vue = await getState(sotrap);
  assert.deepEqual([vue.reclamations[0].statut, vue.reclamations[0].reponse], ['traitee', 'La notation est confirmée après réexamen.']);
  assert.ok(vue.notifs.some((n) => n.titre === 'Réponse à votre réclamation'));
  assert.equal((await patch(sotrap, { reclamations: [] })).status, 403); // jamais la clé entière
});
