/* Menu « Audit » : le journal de l'instance porte l'adresse IP de l'auteur, que l'empreinte chaînée protège. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { call, login } = require('./_client');

test('le journal liste date, auteur, action, procédure et adresse IP ; la chaîne reste vérifiable', async () => {
  const admin = await login('administrateur@bal.ci');
  const r = await call('GET', '/api/audit', null, admin);
  assert.equal(r.status, 200);
  const connexion = r.json.entrees.find((e) => e.a === 'Connexion');
  assert.ok(connexion, 'la connexion est journalisée');
  assert.ok(connexion.t && connexion.who, 'date et auteur');
  assert.equal(connexion.ip, '127.0.0.1');
  assert.equal(r.json.verification.ok, true);
});

test('une entrée de procédure porte sa référence', async () => {
  const achats = await login('y.koffi@bal.ci');
  const cree = await call('POST', '/api/procedures', { ref: 'AO-2026-077', objet: 'Fournitures de bureau', profil: 'prive' }, achats);
  assert.equal(cree.status, 201, JSON.stringify(cree.json));
  const admin = await login('administrateur@bal.ci');
  const r = await call('GET', '/api/audit', null, admin);
  const e = r.json.entrees.find((x) => /Procédure créée — AO-2026-077/.test(x.a));
  assert.ok(e);
  assert.equal(e.procedure, 'AO-2026-077');
  assert.equal(r.json.verification.ok, true);
});

test('une adresse modifiée après coup casse la chaîne', async () => {
  const D = require('../db');
  const last = D.db.prepare('SELECT seq FROM audit WHERE ip IS NOT NULL ORDER BY seq DESC LIMIT 1').get();
  D.db.prepare('UPDATE audit SET ip=? WHERE seq=?').run('10.0.0.1', last.seq);
  const v = D.auditVerify();
  assert.equal(v.ok, false);
  assert.equal(v.brokenAt, last.seq);
});

test('le journal est réservé aux habilitations « audit.read »', async () => {
  const soum = await login('contact.sotrap@bal.ci');
  const r = await call('GET', '/api/audit', null, soum);
  assert.equal(r.status, 403);
});
