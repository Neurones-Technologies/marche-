/* Suppléance des valideurs absents : délégation pour une période, affectation d'un niveau de dossier.
   Le premier niveau du circuit des besoins est réservé au rôle « approb » (A. Diomandé) ; un second valideur,
   d'un autre rôle mais habilité à valider les besoins, le remplace. Tests enchaînés. */
const { call, login, getState, patch, clone } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.json));
const refusé = (r, status, code) => { assert.equal(r.status, status, JSON.stringify(r.json)); if (code) assert.equal(r.json.code, code); };
const BESOIN = { objet: 'Fournitures de bureau', service: 'Siège', budget: 10000000, description: 'Papier, classeurs.', justification: 'Stock épuisé.', dateSouhaitee: '2027-01-15' };
const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
let admin, approb, demandeur, evaltech, ctrl, ctrlId, approbId, b1, b2, b3, delegation;

test('mise en place : niveau réservé au rôle « approb », second valideur d’un autre rôle', async () => {
  admin = await login('administrateur@bal.ci'); approb = await login('a.diomande@bal.ci');
  demandeur = await login('k.yao@bal.ci'); evaltech = await login('f.assamoi@bal.ci');
  const st = await getState(admin);
  const roles = clone(st.roles);
  roles.controle = { lab: 'Contrôle interne', perms: { 'besoin.approve': true, 'offres.read': true } };
  ok(await patch(admin, { roles }));
  const circuitBesoin = clone(st.circuitBesoin); circuitBesoin[0].roleId = 'approb';
  ok(await patch(admin, { circuitBesoin }));
  const c = await call('POST', '/api/auth/users', { nom: 'C. Contrôle', email: 'c.controle@bal.ci', role: 'controle', password: 'Marche+2026!' }, admin);
  ok(c, 201); ctrlId = c.json.id;
  // compte créé par un administrateur : mot de passe provisoire, à changer avant toute autre action
  ctrl = await login('c.controle@bal.ci');
  ok(await call('POST', '/api/auth/password', { current: 'Marche+2026!', next: 'Controle2026ok' }, ctrl));
  ctrl = await call('POST', '/api/auth/login', { email: 'c.controle@bal.ci', password: 'Controle2026ok' }).then((r) => r.cookie);
  approbId = st.users.find((u) => u.role === 'approb').id;
  for (const k of [1, 2, 3]) {
    const b = (await call('POST', '/api/besoins', { ...BESOIN, objet: BESOIN.objet + ' ' + k }, demandeur)).json.besoin;
    ok(await call('POST', `/api/besoins/${b.id}/soumettre`, {}, demandeur));
    if (k === 1) b1 = b; else if (k === 2) b2 = b; else b3 = b;
  }
  refusé(await call('POST', `/api/besoins/${b1.id}/approbations/0`, {}, ctrl), 403, 'STEP_ROLE');
});

test('délégation : contrôles à la création', async () => {
  const base = { de: approbId, a: ctrlId, du: jour(0), au: jour(10), types: ['besoin'], motif: 'Congés' };
  refusé(await call('POST', '/api/suppleances/delegations', base, ctrl), 403, 'FORBIDDEN'); // pas pour un autre
  refusé(await call('POST', '/api/suppleances/delegations', { ...base, a: approbId }, approb), 422, 'DELEGATION_SELF');
  refusé(await call('POST', '/api/suppleances/delegations', { ...base, du: jour(5), au: jour(1) }, approb), 422, 'DELEGATION_DATES');
  refusé(await call('POST', '/api/suppleances/delegations', { ...base, au: jour(400) }, approb), 422, 'DELEGATION_TOO_LONG');
  refusé(await call('POST', '/api/suppleances/delegations', { ...base, types: ['attribution'] }, approb), 422, 'DELEGATION_PERMISSION');
  const sansHab = (await getState(admin)).users.find((u) => u.role === 'evaltech').id;
  refusé(await call('POST', '/api/suppleances/delegations', { ...base, a: sansHab }, approb), 422, 'DELEGATION_PERMISSION');
  // la route générique d'état n'écrit plus les délégations
  refusé(await patch(admin, { delegations: [] }), 403);
  const r = await call('POST', '/api/suppleances/delegations', base, approb);
  ok(r, 201); delegation = r.json.delegation;
  assert.equal(delegation.etat, 'en_cours');
});

test('le suppléant valide pendant la période, et la décision porte « pour A. Diomandé »', async () => {
  const r = await call('POST', `/api/besoins/${b1.id}/approbations/0`, {}, ctrl);
  ok(r);
  const e = r.json.besoin.circuit[0];
  assert.equal(e.by, ctrlId);
  assert.equal(e.pour.via, 'delegation');
  assert.equal(e.pour.nom, 'A. Diomandé');
  const journal = (await call('GET', '/api/audit', null, admin)).json.entrees;
  assert.ok(journal.some((x) => /validée au niveau .*pour A\. Diomandé, délégation du/.test(x.a)), 'mention dans le journal');
  // le suppléant a été prévenu, et lui seul (notification ciblée sur son compte)
  assert.ok((await getState(ctrl)).notifs.some((n) => n.titre === 'Vous suppléez A. Diomandé'));
  assert.ok(!(await getState(evaltech)).notifs.some((n) => n.titre === 'Vous suppléez A. Diomandé'));
  // chacun ne voit que ses délégations ; qui ne valide aucun circuit n'y a pas accès
  assert.equal((await call('GET', '/api/suppleances', null, ctrl)).json.delegations.length, 1);
  refusé(await call('GET', '/api/suppleances', null, evaltech), 403); // ne valide aucun circuit
});

test('une délégation annulée ne permet plus rien', async () => {
  refusé(await call('POST', `/api/suppleances/delegations/${delegation.id}/annuler`, {}, evaltech), 403);
  ok(await call('POST', `/api/suppleances/delegations/${delegation.id}/annuler`, {}, approb));
  refusé(await call('POST', `/api/besoins/${b2.id}/approbations/0`, {}, ctrl), 403, 'STEP_ROLE');
  // une délégation à venir ne vaut pas encore
  ok(await call('POST', '/api/suppleances/delegations', { de: approbId, a: ctrlId, du: jour(3), au: jour(8), types: ['besoin'] }, admin), 201);
  refusé(await call('POST', `/api/besoins/${b2.id}/approbations/0`, {}, ctrl), 403, 'STEP_ROLE');
});

test('affectation d’un dossier : réservée à l’administration, motivée, sur le niveau en attente', async () => {
  const base = { type: 'besoin', cible: b2.id, niveau: 0, a: ctrlId, motif: 'Valideur en mission' };
  refusé(await call('POST', '/api/suppleances/affectations', base, approb), 403);
  refusé(await call('POST', '/api/suppleances/affectations', { ...base, motif: '' }, admin), 422, 'ASSIGNMENT_REASON_REQUIRED');
  refusé(await call('POST', '/api/suppleances/affectations', { ...base, niveau: 1 }, admin), 409, 'STEP_NOT_PENDING');
  const kyao = (await getState(admin)).users.find((u) => u.role === 'demandeur').id;
  refusé(await call('POST', '/api/suppleances/affectations', { ...base, a: kyao }, admin), 422, 'ASSIGNMENT_PERMISSION');
  ok(await call('POST', '/api/suppleances/affectations', base, admin), 201);
  const r = await call('POST', `/api/besoins/${b2.id}/approbations/0`, {}, ctrl);
  ok(r);
  assert.equal(r.json.besoin.circuit[0].pour.via, 'affectation');
  assert.equal(r.json.besoin.circuit[0].pour.motif, 'Valideur en mission');
  // l'affectation vaut pour ce dossier seulement
  refusé(await call('POST', `/api/besoins/${b3.id}/approbations/0`, {}, ctrl), 403, 'STEP_ROLE');
  // le titulaire garde son droit
  ok(await call('POST', `/api/besoins/${b3.id}/approbations/0`, {}, approb));
});
