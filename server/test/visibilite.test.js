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

test('image de la page de garde : importée par le rédacteur, lue par ceux qui voient le dossier, figée à la publication', async () => {
  const achats = await login('y.koffi@bal.ci'), sotrap = await login('contact.sotrap@bal.ci');
  const c = await call('POST', '/api/procedures', { ref: 'AO-2026-088', objet: 'Acquisition de véhicules tout-terrain', profil: 'prive' }, achats);
  ok(c, 201);
  const pid = c.json.id, base = require('./_client').base();
  await require('./_client').remplir(achats, pid);
  const envoyer = (corps, nom, cookie) => fetch(base + `/api/procedures/${pid}/illustration/televerser`, { method: 'POST', body: corps,
    headers: { 'content-type': 'application/octet-stream', 'x-filename': nom, cookie } }).then(async (x) => ({ status: x.status, json: await x.json() }));
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from('image de test')]);
  assert.equal((await envoyer(png, 'photo.png', sotrap)).status, 404); // dossier non publié : invisible d'un prestataire
  assert.equal((await envoyer(Buffer.from('%PDF-1.4 x'), 'x.pdf', achats)).status, 415); // image JPEG ou PNG seulement
  const r = await envoyer(png, 'photo.png', achats);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const s = await getState(achats, pid);
  assert.equal(s.cdc.illustrationImage.fichier, r.json.illustrationImage.fichier);
  assert.equal((await fetch(base + '/api/files/' + s.cdc.illustrationImage.fichier, { headers: { cookie: achats } })).status, 200);
  assert.equal((await fetch(base + '/api/files/' + s.cdc.illustrationImage.fichier, { headers: { cookie: sotrap } })).status, 404); // dossier non publié : invisible
  // une nouvelle image remplace la précédente
  const r2 = await envoyer(Buffer.concat([png, Buffer.from(' 2')]), 'autre.png', achats);
  assert.equal(r2.status, 201);
  assert.equal((await fetch(base + '/api/files/' + r.json.illustrationImage.fichier, { headers: { cookie: achats } })).status, 404);
  // choix automatique : sans effet quand le dossier a déjà une image
  const auto = await call('POST', `/api/procedures/${pid}/illustration/auto`, {}, achats);
  assert.equal(auto.status, 200); assert.equal(auto.json.deja, true);
  // un identifiant forgé est refusé
  const forge = await patch(achats, { cdc: { ...s.cdc, illustrationImage: { fichier: '../x', credit: 'x' } } }, pid);
  assert.equal(forge.json.code, 'ILLUSTRATION_INVALID');
  // la recherche de photos exige l'objet et le droit de rédiger
  assert.equal((await call('GET', `/api/procedures/${pid}/illustration/recherche?q=truck`, null, sotrap)).status, 404);
  // publié, le dossier est figé ; un partenaire consulté lit l'image
  const p = await getState(achats, pid);
  ok(await patch(achats, { consultes: { mode: 'restreint', partenaires: ['PRT-0001'] } }, pid));
  ok(await patch(achats, { cdc: { ...p.cdc, cdcPublie: true } }, pid));
  assert.equal((await envoyer(png, 'trop-tard.png', achats)).json.code, 'CDC_PUBLISHED');
  assert.equal((await fetch(base + '/api/files/' + p.cdc.illustrationImage.fichier, { headers: { cookie: sotrap } })).status, 200);
});
