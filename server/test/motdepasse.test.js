/* Mot de passe : provisoire à la création et à la réinitialisation par un administrateur (à changer avant toute autre
   action), expiration réglée dans les paramètres de l'organisation. */
const { call, login, getState, patch, clone } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../db');

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.json));
const bloque = (r) => { assert.equal(r.status, 403, JSON.stringify(r.json)); assert.equal(r.json.code, 'PASSWORD_CHANGE_REQUIRED'); };
const connexion = (email, password) => call('POST', '/api/auth/login', { email, password });

test('compte créé par un administrateur : provisoire, bloqué jusqu’au changement du mot de passe', async () => {
  const admin = await login('administrateur@bal.ci');
  const c = await call('POST', '/api/auth/users', { nom: 'N. Nouvelle', email: 'n.nouvelle@bal.ci', role: 'audit', password: 'Provisoire2026ok' }, admin);
  ok(c, 201);
  const l = await connexion('n.nouvelle@bal.ci', 'Provisoire2026ok');
  ok(l);
  assert.equal(l.json.user.mdpAChanger, true);
  assert.equal(l.json.user.mdpMotif, 'provisoire');
  // seules la lecture du compte et le changement du mot de passe sont permis
  const me = await call('GET', '/api/auth/me', null, l.cookie);
  ok(me); assert.equal(me.json.user.mdpAChanger, true);
  for (const [m, u] of [['GET', '/api/procedures'], ['GET', '/api/procedures/p1/state'], ['GET', '/api/besoins'], ['GET', '/api/organisation/state'], ['GET', '/api/files/x']]) bloque(await call(m, u, null, l.cookie));
  // le nouveau mot de passe doit différer du provisoire, respecter la politique, et l’actuel doit être exact
  assert.equal((await call('POST', '/api/auth/password', { current: 'Provisoire2026ok', next: 'Provisoire2026ok' }, l.cookie)).status, 422);
  assert.equal((await call('POST', '/api/auth/password', { current: 'Provisoire2026ok', next: 'court' }, l.cookie)).status, 422);
  assert.equal((await call('POST', '/api/auth/password', { current: 'faux', next: 'Choisi2026ok!' }, l.cookie)).status, 403);
  bloque(await call('GET', '/api/procedures', null, l.cookie)); // toujours bloqué après les refus
  const ch = await call('POST', '/api/auth/password', { current: 'Provisoire2026ok', next: 'Choisi2026ok!' }, l.cookie);
  ok(ch);
  ok(await call('GET', '/api/procedures', null, ch.cookie)); // la session suit, plus rien ne bloque
  assert.equal((await connexion('n.nouvelle@bal.ci', 'Provisoire2026ok')).status, 401);
  const l2 = await connexion('n.nouvelle@bal.ci', 'Choisi2026ok!');
  ok(l2); assert.equal(l2.json.user.mdpAChanger, false);
  ok(await call('GET', '/api/procedures', null, l2.cookie));
});

test('mot de passe réinitialisé par un administrateur : provisoire de nouveau ; un compte de démonstration ne l’est pas', async () => {
  const admin = await login('administrateur@bal.ci');
  const users = (await call('GET', '/api/auth/users', null, admin)).json;
  const yao = users.find((u) => u.email === 'k.yao@bal.ci');
  // les comptes de démonstration ne sont pas provisoires
  const avant = await connexion('k.yao@bal.ci', 'Marche+2026!');
  ok(avant); assert.equal(avant.json.user.mdpAChanger, false);
  ok(await call('PATCH', '/api/auth/users/' + yao.id, { password: 'Reinit2026ok!' }, admin));
  assert.equal((await call('GET', '/api/procedures', null, avant.cookie)).status, 401); // ses sessions sont fermées
  const l = await connexion('k.yao@bal.ci', 'Reinit2026ok!');
  ok(l); assert.equal(l.json.user.mdpAChanger, true);
  bloque(await call('GET', '/api/besoins', null, l.cookie));
  const ch = await call('POST', '/api/auth/password', { current: 'Reinit2026ok!', next: 'Retabli2026ok!' }, l.cookie);
  ok(ch);
  ok(await call('GET', '/api/besoins', null, ch.cookie));
  // l’administrateur qui change son propre mot de passe par la fiche n’est pas bloqué lui-même
  const adminId = users.find((u) => u.email === 'administrateur@bal.ci').id;
  ok(await call('PATCH', '/api/auth/users/' + adminId, { password: 'Marche+2026!' }, admin));
  const la = await connexion('administrateur@bal.ci', 'Marche+2026!');
  ok(la); assert.equal(la.json.user.mdpAChanger, false);
  // le journal d’audit consigne la réinitialisation
  const journal = (await call('GET', '/api/audit', null, la.cookie)).json.entrees;
  assert.ok(journal.some((e) => /provisoire/.test(JSON.stringify(e)) && /mot de passe réinitialisé/.test(JSON.stringify(e))));
});

test('expiration du mot de passe : réglable dans les paramètres, appliquée à la connexion et en cours de session', async () => {
  let admin = await login('administrateur@bal.ci');
  const st = await getState(admin);
  // valeurs refusées
  for (const v of [-1, 1.5, 731, 'x']) {
    const r = await patch(admin, { org: { ...clone(st.org), mdpExpirationJours: v } });
    assert.ok(r.status === 422 || r.status === 403, `valeur ${v} : ${r.status}`);
  }
  ok(await patch(admin, { org: { ...clone(st.org), mdpExpirationJours: 90 } }));
  assert.equal((await getState(admin)).org.mdpExpirationJours, 90);
  // un compte dont le mot de passe date de 40 jours : valide ; de 100 jours : expiré
  const buyer = await login('y.koffi@bal.ci');
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  db.prepare('UPDATE users SET mdp_change_le=? WHERE email=?').run(daysAgo(40), 'y.koffi@bal.ci');
  ok(await call('GET', '/api/procedures', null, buyer));
  db.prepare('UPDATE users SET mdp_change_le=? WHERE email=?').run(daysAgo(100), 'y.koffi@bal.ci');
  bloque(await call('GET', '/api/procedures', null, buyer)); // expiré en cours de session
  const l = await connexion('y.koffi@bal.ci', 'Marche+2026!');
  ok(l); assert.equal(l.json.user.mdpMotif, 'expire');
  const ch = await call('POST', '/api/auth/password', { current: 'Marche+2026!', next: 'Renouvele2026ok!' }, l.cookie);
  ok(ch);
  ok(await call('GET', '/api/procedures', null, ch.cookie)); // le délai repart de la date du changement
  // sans expiration réglée (0), plus rien n’expire
  admin = await login('administrateur@bal.ci');
  ok(await patch(admin, { org: { ...clone((await getState(admin)).org), mdpExpirationJours: 0 } }));
  db.prepare('UPDATE users SET mdp_change_le=? WHERE email=?').run(daysAgo(900), 'y.koffi@bal.ci');
  const l3 = await connexion('y.koffi@bal.ci', 'Renouvele2026ok!');
  ok(l3); assert.equal(l3.json.user.mdpAChanger, false);
  ok(await call('GET', '/api/procedures', null, l3.cookie));
});
