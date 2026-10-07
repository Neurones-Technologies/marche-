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
  // offre technique jointe : elle suit le pli, marquée comme document de l'offre
  ok(await upload('memoire', 'memoire.pdf', PDF, sotrap), 201);
  ok(await upload('bordereau', 'bordereau.xlsx', Buffer.from('PK\x03\x04 xlsx'), sotrap), 201);
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
  const docsOffre = r.json.offer.pieces.filter((p) => p.offre).map((p) => p.doc).sort();
  assert.deepEqual(docsOffre, ['bordereau', 'memoire']);
  assert.ok(r.json.offer.pieces.some((p) => p.doc === 'registre' && !p.offre));
  // l'acheteur télécharge le mémoire technique joint au pli
  const mem = r.json.offer.pieces.find((p) => p.doc === 'memoire');
  const dl = await call('GET', '/api/files/' + mem.id, null, achats);
  assert.equal(dl.status, 200);
});

test('une seule offre en cours ; retrait avant l’échéance, fichiers rendus, accusé marqué retiré', async () => {
  const s = await getState(sotrap);
  assert.equal(s.monOffre.montant, 50000000);
  assert.deepEqual(s.monOffre.prixLots, { l1: 30000000, l2: 20000000 });
  assert.equal(s.offers.length, 0); // le fournisseur ne voit pas les offres, seulement la sienne
  const base = { name: 'SOTRAP SARL', iso: 'CI', devise: 'XOF', delai: 90, lots: ['l1'], prixLots: { l1: 1000 } };
  const double = await call('POST', '/api/procedures/p1/offers', base, sotrap);
  assert.equal(double.status, 409);
  assert.equal(double.json.code, 'OFFER_EXISTS');

  ok(await call('DELETE', '/api/procedures/p1/offers/mienne', {}, sotrap));
  const apres = await getState(sotrap);
  assert.equal(apres.monOffre, null);
  assert.ok(apres.receipts.length && apres.receipts.every((x) => x.retire));
  assert.ok(!(await getState(achats)).offers.some((o) => o.depotPar && o.name === 'SOTRAP SARL'));
  // fichiers rendus : la nouvelle offre se dépose sans rien rejoindre, mémoire technique compris
  const mine = await call('GET', '/api/procedures/p1/files/mine', null, sotrap);
  assert.ok(['memoire', 'registre'].every((d) => mine.json.some((f) => f.doc === d)));
  const r = await call('POST', '/api/procedures/p1/offers', base, sotrap);
  ok(r, 201);
  assert.equal(r.json.offer.montant, 1000);
  assert.ok(r.json.offer.pieces.some((p) => p.doc === 'memoire' && p.offre));
  assert.equal(r.json.receipt.offre, r.json.offer.id);
  const fin = await getState(sotrap);
  assert.equal(fin.receipts.filter((x) => !x.retire).length, 1);
  assert.equal((await call('DELETE', '/api/procedures/p1/offers/mienne', {}, achats)).status, 403); // l'acheteur n'est pas soumissionnaire
});

test('retrait refusé après la date limite', async () => {
  const s = await getState(achats);
  const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  ok(await patch(achats, { cdc: { ...s.cdc, ouverture: hier } }));
  const r = await call('DELETE', '/api/procedures/p1/offers/mienne', {}, sotrap);
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'DEADLINE_PASSED');
  assert.ok((await getState(sotrap)).monOffre);
});
