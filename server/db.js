const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const cfg = require('./config');
const seed = require('./seed/seed.json');

if (cfg.dbFile !== ':memory:') fs.mkdirSync(path.dirname(cfg.dbFile), { recursive: true });
const db = new Database(cfg.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, nom TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL, pass_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), last_login TEXT
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, rev INTEGER NOT NULL,
  updated_by TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY, ord INTEGER NOT NULL, data TEXT NOT NULL,
  submitted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS receipts (
  num TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT NOT NULL, uid TEXT, who TEXT NOT NULL,
  action TEXT NOT NULL, prev TEXT NOT NULL, hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, doc_id TEXT NOT NULL, offer_id TEXT,
  name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`);

const clone = (x) => JSON.parse(JSON.stringify(x));
const frDate = () => new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan' });

/* ---- révision globale (détection de changements côté client) ---- */
function getRev() {
  const r = db.prepare("SELECT v FROM meta WHERE k='rev'").get();
  return r ? Number(r.v) : 0;
}
function bumpRev() {
  const n = getRev() + 1;
  db.prepare("INSERT INTO meta(k,v) VALUES('rev',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(String(n));
  return n;
}

/* ---- kv ---- */
function kvGet(key) {
  const r = db.prepare('SELECT value, rev FROM kv WHERE key=?').get(key);
  return r ? { value: JSON.parse(r.value), rev: r.rev } : null;
}
function kvSet(key, value, uid) {
  const rev = bumpRev();
  db.prepare(`INSERT INTO kv(key,value,rev,updated_by,updated_at) VALUES(?,?,?,?,datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, rev=excluded.rev, updated_by=excluded.updated_by, updated_at=excluded.updated_at`)
    .run(key, JSON.stringify(value), rev, uid || null);
  return rev;
}
function kvAll() {
  const out = {}, revs = {};
  for (const r of db.prepare('SELECT key,value,rev FROM kv').all()) { out[r.key] = JSON.parse(r.value); revs[r.key] = r.rev; }
  return { values: out, revs };
}

/* ---- journal d'audit chaîné (SHA-256) ---- */
const GENESIS = '0'.repeat(64);
function auditAppend(uid, who, action) {
  const last = db.prepare('SELECT hash FROM audit ORDER BY seq DESC LIMIT 1').get();
  const prev = last ? last.hash : GENESIS;
  const t = frDate();
  const hash = crypto.createHash('sha256').update([prev, t, uid || '', who, action].join('|')).digest('hex');
  db.prepare('INSERT INTO audit(t,uid,who,action,prev,hash) VALUES(?,?,?,?,?,?)').run(t, uid || null, who, action, prev, hash);
  bumpRev();
  return { t, who, a: action };
}
function auditList(limit = 200) {
  return db.prepare('SELECT t,who,action AS a FROM audit ORDER BY seq DESC LIMIT ?').all(limit);
}
function auditVerify() {
  let prev = GENESIS, n = 0;
  for (const r of db.prepare('SELECT * FROM audit ORDER BY seq').iterate()) {
    const h = crypto.createHash('sha256').update([prev, r.t, r.uid || '', r.who, r.action].join('|')).digest('hex');
    if (r.prev !== prev || r.hash !== h) return { ok: false, brokenAt: r.seq, entries: n };
    prev = r.hash; n++;
  }
  return { ok: true, entries: n, head: prev };
}

/* ---- offres ---- */
const offersAll = () => db.prepare('SELECT data FROM offers ORDER BY ord').all().map((r) => JSON.parse(r.data));
function offerInsert(o, submitted) {
  const ord = (db.prepare('SELECT COALESCE(MAX(ord),0)+1 AS n FROM offers').get().n);
  db.prepare('INSERT INTO offers(id,ord,data,submitted) VALUES(?,?,?,?)').run(o.id, ord, JSON.stringify(o), submitted ? 1 : 0);
  bumpRev();
}
function offersReplace(list) {
  const tx = db.transaction(() => {
    const upd = db.prepare('UPDATE offers SET data=? WHERE id=?');
    for (const o of list) upd.run(JSON.stringify(o), o.id);
    bumpRev();
  });
  tx();
}

/* ---- utilisateurs ---- */
const slug = (nom) => nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');

/* ---- jeu de données initial ---- */
function defaultKv() {
  const q = {};
  seed.OFFERS.forEach((o) => { q[o.id] = { metho: o.aiMetho, refs: o.aiRefs }; });
  return {
    cdc: clone(seed.CDC), criteria: clone(seed.CRITERIA), quality: q, justif: {}, confirmed: {}, excluded: {},
    depClosed: false, evalDone: false,
    org: { nom: 'Banque Atlantique du Littoral', pays: 'Côte d’Ivoire', ville: 'Abidjan', devisePivot: 'XOF', accent: '#1F6F6B', initiales: 'BAL',
      uemoa: clone(seed.UEMOA_DEF), rates: clone(seed.RATES_DEF) },
    seuils: { confianceMin: 75, prixBas: 25, structureEcart: 0.8, refsMin: 3, validiteMin: 90, ecartIaMax: 0 },
    docDefs: clone(seed.DOC_DEFS), roles: clone(seed.ROLES), notifRules: clone(seed.NOTIF_RULES),
    notifs: [], emails: [], qa: [], additifs: [], clarifs: [], coi: {}, delegations: [], recours: [],
    standstill: { days: 15, startedAt: null }, contractSigned: false, infructueux: null,
    mailFrom: 'marches@bal.ci', mailSuffix: '@bal.ci', approvals: clone(seed.APPROVALS),
  };
}

function seedAll(withUsers = true) {
  const tx = db.transaction(() => {
    db.exec('DELETE FROM kv; DELETE FROM offers; DELETE FROM receipts; DELETE FROM audit;');
    for (const [k, v] of Object.entries(defaultKv())) kvSet(k, v, 'seed');
    seed.OFFERS.forEach((o) => offerInsert(o, false));
    if (withUsers) {
      db.exec('DELETE FROM users');
      if (cfg.seedDemo) {
        const h = bcrypt.hashSync(cfg.seedPassword, 10);
        const ins = db.prepare('INSERT INTO users(id,nom,email,role,pass_hash) VALUES(?,?,?,?,?)');
        for (const u of seed.USERS) ins.run(u.id, u.nom, slug(u.nom) + '@bal.ci', u.role, h);
      }
    }
    auditAppend(null, 'Système', 'Instance initialisée');
  });
  tx();
}

if (db.prepare('SELECT COUNT(*) c FROM kv').get().c === 0) seedAll(true);

/* Migrations de données des instances existantes (idempotentes). */
(function migrate() {
  // 02/10/2026 : la référence de la procédure devient un champ du cahier des charges.
  const cdc = kvGet('cdc');
  if (cdc && !cdc.value.ref) {
    cdc.value.ref = seed.CDC.ref;
    kvSet('cdc', cdc.value, 'migration');
  }
})();

function resetDemo(uid, who) {
  const tx = db.transaction(() => {
    seedAll(false);
    auditAppend(uid, who, 'Démonstration réinitialisée');
  });
  tx();
}

module.exports = { db, getRev, bumpRev, kvGet, kvSet, kvAll, auditAppend, auditList, auditVerify, offersAll, offerInsert, offersReplace, resetDemo, slug, frDate, seed };
