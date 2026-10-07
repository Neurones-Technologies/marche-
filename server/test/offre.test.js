/* L'offre du fournisseur (plan, lot 3) : prix par lot, offre technique jointe, retrait et remplacement avant
   l'échéance, collaborateurs d'une même entreprise. Les tests s'enchaînent. */
const { call, login, getState, patch, upload } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.json));
const PDF = Buffer.from('%PDF-1.4 test');
let achats, sotrap;

test('préparation : dossier publié, pièces de SOTRAP jointes', async () => {
  achats = await login('y.koffi@bal.ci'); sotrap = await login('contact.sotrap@bal.ci');
  const s = await getState(achats);
  ok(await patch(achats, { cdc: { ...s.cdc, cdcPublie: true } }));
  for (const d of ['registre', 'fiscal', 'cnps', 'caution']) ok(await upload(d, d + '.pdf', PDF, sotrap), 201);
});

test('prix par lot : un montant par lot soumissionné, le total en est la somme', async () => {
  const base = { name: 'SOTRAP SARL', iso: 'CI', devise: 'XOF', delai: 90, lots: ['l1', 'l2'] };
  const manque = await call('POST', '/api/procedures/p1/offers', { ...base, prixLots: { l1: 30000000 } }, sotrap);
  assert.equal(manque.status, 422);
  assert.match(manque.json.error, /Montant manquant pour un lot/);
  const r = await call('POST', '/api/procedures/p1/offers', { ...base, montant: 1, prixLots: { l1: 30000000, l2: 20000000, l9: 5 } }, sotrap);
  ok(r, 201);
  assert.equal(r.json.offer.montant, 50000000); // somme des lots, pas le montant envoyé
  assert.deepEqual(r.json.offer.prixLots, { l1: 30000000, l2: 20000000 }); // lot hors offre ignoré
  assert.deepEqual(r.json.offer.lots, ['l1', 'l2']);
  assert.ok(r.json.offer.fields.some((f) => /^Prix — Lot 1/.test(f.k)));
});
