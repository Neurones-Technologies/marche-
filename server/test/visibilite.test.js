/* Ce que voit chacun : un prestataire ne voit que les appels d'offres où il est consulté (y compris dans le registre de
   l'accueil) ; une fois le dossier publié, un partenaire consulté ne se retire plus. */
const { call, login, getState, patch } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.json));

test('registre de l’accueil : un prestataire ne voit que les appels d’offres où il est consulté', async () => {
  const admin = await login('administrateur@bal.ci'), achats = await login('y.koffi@bal.ci'), sotrap = await login('contact.sotrap@bal.ci');
  ok(await call('POST', '/api/admin/fictives', { zones: ['partenaires'] }, admin), 201); // Delta Bâtiment : référencé, avec son compte
  const delta = await login('contact@delta-batiment.example');
  const idDelta = (await call('GET', '/api/partenaires/moi', null, delta)).json.partenaire.id;
  const c = await call('POST', '/api/procedures', { ref: 'AO-2026-077', objet: 'Travaux d’aménagement', profil: 'prive' }, achats);
  ok(c, 201);
  const pid = c.json.id;
  await require('./_client').remplir(achats, pid);
  const s = await getState(achats, pid);
  ok(await patch(achats, { consultes: { mode: 'restreint', partenaires: [idDelta] } }, pid));
  ok(await patch(achats, { cdc: { ...s.cdc, cdcPublie: true } }, pid));
  // la grille de critères fait partie du dossier publié : plus de critère retiré ni de poids modifié
  const grille = (await getState(achats, pid)).criteria;
  const g = await patch(achats, { criteria: grille.slice(1) }, pid);
  assert.equal(g.status, 409); assert.equal(g.json.code, 'CRITERIA_LOCKED');
  ok(await patch(achats, { criteria: grille }, pid)); // inchangée : acceptée
  const registre = async (cookie) => (await call('GET', '/api/registre', null, cookie)).json.procedures.map((l) => l.ref);
  assert.equal((await registre(delta)).includes('AO-2026-077'), true, 'le partenaire consulté le voit');
  assert.equal((await registre(sotrap)).includes('AO-2026-077'), false, 'un partenaire non consulté ne le voit pas');
  assert.equal((await registre(achats)).includes('AO-2026-077'), true);
  const liste = (await call('GET', '/api/procedures', null, sotrap)).json.procedures.map((p) => p.ref);
  assert.deepEqual((await registre(sotrap)).sort(), liste.sort(), 'le registre suit la liste des procédures ouvertes au prestataire');
  // dossier publié : un partenaire consulté ne se retire plus ; en ajouter reste possible
  const refus = await patch(achats, { consultes: { mode: 'restreint', partenaires: [] } }, pid);
  assert.equal(refus.status, 422); assert.equal(refus.json.code, 'CONSULTATION_INVALID');
  ok(await patch(achats, { consultes: { mode: 'restreint', partenaires: [idDelta, 'PRT-0001'] } }, pid));
  assert.equal((await registre(sotrap)).includes('AO-2026-077'), true, 'ajouté ensuite, il le voit');
});
