/* Vider les données : registres, échanges, pièces et budget effacés ; paramètres et comptes conservés. */
const { call, login, getState } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.json));

test('vider les données : confirmation exigée, registres vides, paramètres et comptes gardés', async () => {
  const admin = await login('administrateur@bal.ci'), sotrap = await login('contact.sotrap@bal.ci');
  const avant = await getState(admin);
  assert.equal((await call('POST', '/api/admin/vider', { confirmation: 'VIDER' }, sotrap)).status, 403);
  assert.equal((await call('POST', '/api/admin/vider', {}, admin)).json.code, 'CONFIRMATION_REQUIRED');
  ok(await call('POST', '/api/admin/vider', { confirmation: 'VIDER' }, admin));
  assert.deepEqual((await call('GET', '/api/procedures', null, admin)).json.procedures, []);
  assert.deepEqual((await call('GET', '/api/besoins', null, admin)).json.besoins || [], []);
  assert.deepEqual((await call('GET', '/api/budget', null, admin)).json.lignes, []);
  assert.equal((await call('GET', '/api/partenaires', null, await login('y.koffi@bal.ci'))).json.partenaires.length, 0);
  // les comptes se connectent toujours ; l'organisation et ses rôles sont intacts
  const apres = (await call('GET', '/api/organisation/state', null, await login('y.koffi@bal.ci'))).json.state;
  assert.equal(apres.org.nom, avant.org.nom);
  assert.deepEqual(Object.keys(apres.roles).sort(), Object.keys(avant.roles).sort());
  const journal = (await call('GET', '/api/audit', null, admin)).json;
  assert.ok(journal.entrees.some((e) => /Données effacées/.test(JSON.stringify(e))));
  assert.equal(journal.verification.ok, true); // nouvelle chaîne d'audit, intègre
});

test('vider par zones : seules les zones choisies sont effacées ; zones inconnues refusées', async () => {
  const admin = await login('administrateur@bal.ci');
  ok(await call('POST', '/api/admin/fictives', { zones: ['budget', 'appels'] }, admin), 201);
  assert.equal((await call('POST', '/api/admin/vider', { confirmation: 'VIDER', zones: [] }, admin)).json.code, 'ZONES_INVALID');
  assert.equal((await call('POST', '/api/admin/vider', { confirmation: 'VIDER', zones: ['tout'] }, admin)).json.code, 'ZONES_INVALID');
  ok(await call('POST', '/api/admin/vider', { confirmation: 'VIDER', zones: ['budget'] }, admin));
  assert.deepEqual((await call('GET', '/api/budget', null, admin)).json.lignes, []);
  assert.equal((await call('GET', '/api/procedures', null, admin)).json.procedures.length, 1); // l'appel d'offres reste
  ok(await call('POST', '/api/admin/vider', { confirmation: 'VIDER', zones: ['appels'] }, admin));
  assert.deepEqual((await call('GET', '/api/procedures', null, admin)).json.procedures, []);
  assert.equal((await call('GET', '/api/audit', null, admin)).json.verification.ok, true);
});

test('données fictives par zones : ajoutées sans rien effacer, références et offres jamais en double', async () => {
  const admin = await login('administrateur@bal.ci'), achats = await login('y.koffi@bal.ci');
  assert.equal((await call('POST', '/api/admin/fictives', { zones: [] }, admin)).json.code, 'ZONES_INVALID');
  assert.equal((await call('POST', '/api/admin/fictives', { zones: ['budget'] }, achats)).status, 403);
  const r = await call('POST', '/api/admin/fictives', { zones: ['budget', 'partenaires', 'appels', 'besoins'] }, admin);
  ok(r, 201);
  assert.deepEqual(r.json.ajout, { budget: 3, partenaires: 4, appels: 'AO-2026-014', besoins: 2 });
  const parts = (await call('GET', '/api/partenaires', null, achats)).json.partenaires;
  assert.equal(parts.length, 4);
  assert.equal(parts.filter((p) => p.statut === 'reference').length, 2);
  const besoins = (await call('GET', '/api/besoins', null, admin)).json.besoins;
  assert.deepEqual(besoins.map((b) => b.statut).sort(), ['brouillon', 'soumis']);
  // une seconde fois : nouvelle référence, rien en double pour le budget et les partenaires
  const r2 = await call('POST', '/api/admin/fictives', { zones: ['budget', 'partenaires', 'appels'] }, admin);
  assert.deepEqual(r2.json.ajout, { budget: 0, partenaires: 0, appels: 'AO-2026-015' });
  const procs = (await call('GET', '/api/procedures', null, admin)).json.procedures;
  assert.deepEqual(procs.map((p) => p.ref).sort(), ['AO-2026-014', 'AO-2026-015']);
  assert.equal((await call('GET', '/api/audit', null, admin)).json.verification.ok, true);
});

test('comptes : vidés sauf celui de l’auteur, puis recréés en données fictives', async () => {
  const admin = await login('administrateur@bal.ci');
  ok(await call('POST', '/api/admin/vider', { confirmation: 'VIDER', zones: ['comptes'] }, admin));
  const restants = (await call('GET', '/api/auth/users', null, admin)).json;
  assert.deepEqual(restants.map((u) => u.email), ['administrateur@bal.ci']);
  const r = await call('POST', '/api/admin/fictives', { zones: ['comptes'] }, admin);
  ok(r, 201);
  assert.equal(r.json.ajout.comptes, 7);
  const sotrap = await login('contact.sotrap@bal.ci'); // le compte fournisseur retrouve sa fiche partenaire
  const moi = (await call('GET', '/api/partenaires/moi', null, sotrap));
  assert.equal(moi.status, 200, JSON.stringify(moi.json));
  assert.equal((await call('POST', '/api/admin/fictives', { zones: ['comptes'] }, admin)).json.ajout.comptes, 0);
});

test('données fictives, zone Exécution : appel d’offres attribué et bons de commande à divers stades, visibles des acteurs concernés', async () => {
  const admin = await login('administrateur@bal.ci'), achats = await login('y.koffi@bal.ci');
  const r = await call('POST', '/api/admin/fictives', { zones: ['budget', 'partenaires', 'commandes'] }, admin);
  ok(r, 201);
  assert.equal(r.json.ajout.commandes.n, 5);
  const cmds = (await call('GET', '/api/commandes', null, achats)).json.commandes;
  assert.deepEqual(cmds.map((c) => c.statut).sort(), ['brouillon', 'emise', 'en_reception', 'receptionnee', 'validation']);
  assert.equal(new Set(cmds.map((c) => c.numero).filter(Boolean)).size, 3); // trois numéros distincts, attribués à l’émission
  assert.ok(cmds.every((c) => c.total > 0 && c.total <= c.montantOffre));
  const rec = cmds.find((c) => c.statut === 'en_reception');
  assert.ok(rec.rapprochement.some((x) => x.recu > 0 && x.ecart > 0), 'livraison partielle');
  // la procédure est attribuée : le budget engagé suit les commandes
  const lignes = (await call('GET', '/api/budget', null, achats)).json.lignes;
  assert.ok(lignes.some((l) => l.engage > 0));
  // les indicateurs de délais s’alimentent des jalons posés
  const ind = (await call('GET', '/api/indicateurs', null, achats)).json;
  assert.ok(ind.delais.cycle && ind.delais.cycle.nb >= 1);
  assert.equal(ind.commandes.emises, 3);
  // une seconde fois : une nouvelle référence, rien ne se mélange
  const r2 = await call('POST', '/api/admin/fictives', { zones: ['commandes'] }, admin);
  ok(r2, 201);
  assert.notEqual(r2.json.ajout.commandes.ref, r.json.ajout.commandes.ref);
  assert.equal((await call('GET', '/api/audit', null, admin)).json.verification.ok, true);
});
