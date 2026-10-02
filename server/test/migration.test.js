/* Migration d'une instance antérieure aux procédures multiples : une base à l'ancien schéma (état dans kv,
   offres sans procédure, audit à l'ancienne empreinte) devient la procédure p1, sans casser la chaîne d'audit. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-mig-')), 'ancienne.db');
process.env.DB_FILE = file;
process.env.NODE_ENV = 'test';

test.before(() => {
  const old = new Database(file);
  old.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, nom TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL, pass_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), last_login TEXT);
    CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, rev INTEGER NOT NULL, updated_by TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE offers (id TEXT PRIMARY KEY, ord INTEGER NOT NULL, data TEXT NOT NULL, submitted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE receipts (num TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT NOT NULL, uid TEXT, who TEXT NOT NULL, action TEXT NOT NULL, prev TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE files (id TEXT PRIMARY KEY, owner TEXT NOT NULL, doc_id TEXT NOT NULL, offer_id TEXT, name TEXT NOT NULL, mime TEXT NOT NULL,
      size INTEGER NOT NULL, sha256 TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
  `);
  const kv = old.prepare('INSERT INTO kv(key,value,rev) VALUES(?,?,?)');
  kv.run('org', JSON.stringify({ nom: 'Banque X', rates: { XOF: 1 }, uemoa: ['CI', 'SN'] }), 3);
  kv.run('cdc', JSON.stringify({ ref: 'AO-2025-001', objet: 'Ancienne procédure', cdcPublie: true }), 7);
  kv.run('approvals', JSON.stringify([{ role: 'Direction', who: 'D. Kone', done: true, by: 'u4' }]), 8);
  kv.run('roles', JSON.stringify({}), 2);
  old.prepare('INSERT INTO offers(id,ord,data) VALUES(?,?,?)').run('o1', 1, JSON.stringify({ id: 'o1', name: 'Ancienne SA' }));
  old.prepare('INSERT INTO receipts(num,data) VALUES(?,?)').run('DEP-0001', JSON.stringify({ num: 'DEP-0001' }));
  let prev = '0'.repeat(64);
  for (const a of ['Instance initialisée', 'Dossier publié']) {
    const t = '01/01/2026 10:00:00', hash = crypto.createHash('sha256').update([prev, t, '', 'Système', a].join('|')).digest('hex');
    old.prepare('INSERT INTO audit(t,uid,who,action,prev,hash) VALUES(?,?,?,?,?,?)').run(t, null, 'Système', a, prev, hash);
    prev = hash;
  }
  old.close();
});

test('la procédure unique devient p1, avec ses données, offres et accusés', () => {
  const D = require('../db');
  assert.deepEqual(D.proceduresAll().map((p) => [p.id, p.ref, p.publie]), [['p1', 'AO-2025-001', true]]);
  assert.equal(D.kvGet('cdc'), null, 'la clé cdc a quitté l’état de l’organisation');
  assert.equal(D.pkvGet('p1', 'cdc').rev, 7, 'révision conservée');
  assert.equal(D.store('p1').get('approvals')[0].by, 'u4');
  assert.deepEqual(D.store('p1').offers().map((o) => o.id), ['o1']);
  assert.equal(D.db.prepare('SELECT procedure_id FROM receipts').get().procedure_id, 'p1');
  assert.deepEqual(D.kvGet('circuitModele').value, [{ role: 'Direction', who: 'D. Kone' }]);
  assert.deepEqual(D.kvGet('org').value.reglages, { zonePreference: ['CI', 'SN'] });
  assert.equal(D.store('p1').get('cadre').profil, 'uemoa-ci', 'cadre figé pour une procédure déjà publiée');
  assert.ok(D.kvGet('roles').value.demandeur, 'rôle « Demandeur » ajouté');
  assert.ok(D.kvGet('circuitBesoin').value.length, 'circuit de validation des besoins par défaut');
});

test('la chaîne d’audit d’origine reste vérifiable, et se poursuit', () => {
  const D = require('../db');
  D.auditAppend('u1', 'Test', 'Entrée de procédure', 'p1');
  D.auditAppend('u1', 'Test', 'Entrée d’organisation');
  const v = D.auditVerify();
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.equal(v.entries, 4);
});
