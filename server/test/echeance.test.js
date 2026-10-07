/* Date limite de dépôt : l'échéance (date limite à 10 h 00, heure d'Abidjan) est appliquée par le serveur. */
const { call, login, getState, patch, upload, remplir } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../public/js/regles.js');

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.json));
const PDF = Buffer.from('%PDF-1.4 test');
const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

test('échéance : 10 h 00 à Abidjan (UTC) le jour de la date limite', () => {
  assert.equal(R.echeanceDepot({ ouverture: '2026-11-20' }), Date.parse('2026-11-20T10:00:00Z'));
  assert.equal(R.echeanceDepot({ ouverture: '' }), null);
});

test('publication refusée avec une date passée ; dépôt et pièces refusés après l’échéance', async () => {
  const achats = await login('y.koffi@bal.ci'), sotrap = await login('contact.sotrap@bal.ci');
  const c = await call('POST', '/api/procedures', { ref: 'AO-2026-080', objet: 'Fournitures de bureau', profil: 'prive' }, achats);
  ok(c, 201);
  const pid = c.json.id;
  const s = await remplir(achats, pid);
  ok(await patch(achats, { consultes: { mode: 'restreint', partenaires: ['PRT-0001'] } }, pid));
  const passee = await patch(achats, { cdc: { ...s.cdc, ouverture: jour(-2), cdcPublie: true } }, pid);
  assert.equal(passee.status, 409);
  assert.match(passee.json.error, /date limite de dépôt à venir/);
  ok(await patch(achats, { cdc: { ...s.cdc, ouverture: jour(10), cdcPublie: true } }, pid));
  ok(await upload('registre', 'registre.pdf', PDF, sotrap, pid), 201); // avant l'échéance : accepté

  // l'échéance passe (date limite ramenée à hier par l'acheteur, pour le test)
  const pub = await getState(achats, pid);
  ok(await patch(achats, { cdc: { ...pub.cdc, ouverture: jour(-1) } }, pid));
  const piece = await upload('fiscal', 'fiscal.pdf', PDF, sotrap, pid);
  assert.equal(piece.status, 409); assert.equal(piece.json.code, 'DEADLINE_PASSED');
  const offre = await call('POST', `/api/procedures/${pid}/offers`, { name: 'SOTRAP SARL', iso: 'CI', devise: 'XOF', montant: 5000000, delai: 30, lots: [pub.cdc.lots[0].id] }, sotrap);
  assert.equal(offre.status, 409); assert.equal(offre.json.code, 'DEADLINE_PASSED');
});
