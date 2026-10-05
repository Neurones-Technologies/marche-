/* Rôles : renommer, créer, supprimer — avec les garde-fous du serveur. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { call, login, getState, patch, clone } = require('./_client');

let admin;
const connecter = async () => { if (!admin) admin = await login('administrateur@bal.ci'); };
const ecrire = (roles) => patch(admin, { roles });

test('un rôle se renomme et un nouveau rôle se crée', async () => {
  await connecter();
  const roles = clone((await getState(admin)).roles);
  roles.achats.lab = 'Direction des achats';
  roles['controle-gestion'] = { lab: 'Contrôle de gestion', perms: { 'offres.read': true, 'pv.read': true } };
  const r = await ecrire(roles);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const apres = (await getState(admin)).roles;
  assert.equal(apres.achats.lab, 'Direction des achats');
  assert.equal(apres['controle-gestion'].lab, 'Contrôle de gestion');
  // le nouveau rôle peut être attribué à un compte
  const c = await call('POST', '/api/auth/users', { nom: 'C. Gestion', email: 'c.gestion@bal.ci', role: 'controle-gestion', password: 'Marche+2026!' }, admin);
  assert.equal(c.status, 201, JSON.stringify(c.json));
});

test('libellé vide, libellé en double ou identifiant invalide : refusés', async () => {
  await connecter();
  const base = clone((await getState(admin)).roles);
  const vide = clone(base); vide.achats.lab = '  ';
  assert.equal((await ecrire(vide)).status, 403);
  const double = clone(base); double.audit.lab = base.achats.lab;
  assert.equal((await ecrire(double)).status, 403);
  const id = clone(base); id['Mauvais Id'] = { lab: 'Nouveau', perms: {} };
  assert.equal((await ecrire(id)).status, 403);
});

test('un rôle attribué ou utilisé par la plateforme ne se supprime pas ; un rôle libre, si', async () => {
  await connecter();
  const base = clone((await getState(admin)).roles);
  const sansAchats = clone(base); delete sansAchats.achats; // attribué à Y. Koffi
  const r1 = await ecrire(sansAchats);
  assert.equal(r1.status, 403); assert.match(r1.json.error, /attribué/);
  const sansSoum = clone(base); delete sansSoum.soum;
  const r2 = await ecrire(sansSoum);
  assert.equal(r2.status, 403); assert.match(r2.json.error, /plateforme/);
  const libre = clone(base); libre.temporaire = { lab: 'Rôle temporaire', perms: {} };
  assert.equal((await ecrire(libre)).status, 200);
  const sansLibre = clone((await getState(admin)).roles); delete sansLibre.temporaire;
  assert.equal((await ecrire(sansLibre)).status, 200);
  assert.equal((await getState(admin)).roles.temporaire, undefined);
});
