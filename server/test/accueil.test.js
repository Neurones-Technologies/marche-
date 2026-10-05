/* Accueil (« À faire pour moi », chiffres clés) et registre des appels d'offres : chacun voit ce qui le concerne. */
const { call, login, getState, patch } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

const titres = async (cookie) => (await call('GET', '/api/accueil', null, cookie)).json.taches.map((t) => t.titre);
let achats, approb, demandeur, soum;

test('acheteur : chiffres par phase, tâche de publication, registre complet', async () => {
  achats = await login('y.koffi@bal.ci'); approb = await login('a.diomande@bal.ci');
  demandeur = await login('k.yao@bal.ci'); soum = await login('contact.sotrap@bal.ci');
  const a = (await call('GET', '/api/accueil', null, achats)).json;
  assert.deepEqual(a.chiffres.procedures, { total: 1, parPhase: { preparation: 1 } });
  assert.ok(a.taches.some((t) => t.titre === 'Publier le dossier AO-2026-014' && t.lien.vue === 'cdc' && t.lien.procedure === 'p1'));
  const reg = (await call('GET', '/api/registre', null, achats)).json.procedures;
  assert.deepEqual(reg.map((p) => [p.ref, p.phase.id, p.offres, p.titulaire]), [['AO-2026-014', 'preparation', require('../seed/seed.json').OFFERS.length, null]]);
});

test('soumissionnaire : rien avant publication, puis l’appel d’offres à répondre, sans données internes', async () => {
  assert.deepEqual((await call('GET', '/api/registre', null, soum)).json.procedures, []);
  const s = await getState(achats);
  assert.equal((await patch(achats, { cdc: { ...s.cdc, cdcPublie: true } })).status, 200);
  const reg = (await call('GET', '/api/registre', null, soum)).json.procedures;
  assert.equal(reg.length, 1);
  assert.equal(reg[0].phase.id, 'publiee');
  assert.equal('offres' in reg[0], false, 'pas de données internes pour un soumissionnaire');
  assert.ok((await titres(soum)).includes('Répondre à AO-2026-014'));
  assert.ok((await titres(achats)).includes('Dépouiller les offres de AO-2026-014'));
});

test('besoin : chaque étape apparaît chez la personne qui doit agir', async () => {
  const b = (await call('POST', '/api/besoins', { objet: 'Imprimantes', budget: 5000000 }, demandeur)).json.besoin;
  assert.ok((await titres(demandeur)).includes(`Soumettre la demande ${b.id}`));
  await call('POST', `/api/besoins/${b.id}/soumettre`, {}, demandeur);
  assert.ok((await titres(approb)).some((t) => t === `Valider la demande ${b.id}`));
  assert.ok(!(await titres(demandeur)).some((t) => t.startsWith('Valider')), 'le demandeur ne valide pas son propre besoin');
  await call('POST', `/api/besoins/${b.id}/approbations/0`, {}, approb);
  assert.ok((await titres(achats)).includes(`Transformer la demande ${b.id} en procédure`));
  const ch = (await call('GET', '/api/accueil', null, demandeur)).json.chiffres;
  assert.equal(ch.besoins.valide, 1);
  assert.equal(ch.procedures, undefined, 'le demandeur ne voit pas le portefeuille des procédures');
});
