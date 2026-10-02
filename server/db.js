const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const cfg = require('./config');
const seed = require('./seed/seed.json');
const R = require('../public/js/regles.js');
const P = require('../public/js/profils.js');

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
CREATE TABLE IF NOT EXISTS procedures (
  id TEXT PRIMARY KEY, ord INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
  created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS pkv (
  procedure_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, rev INTEGER NOT NULL,
  updated_by TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (procedure_id, key)
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
// 02/10/2026 : plusieurs procédures. Les offres, accusés, pièces et entrées d'audit portent leur procédure
// (NULL pour une entrée d'audit qui concerne l'organisation : connexion, comptes, paramètres).
function addColumn(table, col, def) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
['offers', 'receipts', 'files', 'audit'].forEach((t) => addColumn(t, 'procedure_id', 'TEXT'));

const clone = (x) => JSON.parse(JSON.stringify(x));
const frDate = () => new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan' });

/* Clés propres à une procédure ; toutes les autres appartiennent à l'organisation (une par instance). */
const PROC_KEYS = ['cdc', 'criteria', 'quality', 'justif', 'confirmed', 'excluded', 'depClosed', 'evalDone', 'approvals',
  'qa', 'additifs', 'clarifs', 'coi', 'recours', 'standstill', 'contractSigned', 'infructueux', 'fxFrozen', 'cadre', '_sod'];
const isProcKey = (k) => PROC_KEYS.includes(k);

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

/* ---- kv : état de l'organisation ---- */
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

/* ---- pkv : état d'une procédure ---- */
function pkvGet(pid, key) {
  const r = db.prepare('SELECT value, rev FROM pkv WHERE procedure_id=? AND key=?').get(pid, key);
  return r ? { value: JSON.parse(r.value), rev: r.rev } : null;
}
function pkvSet(pid, key, value, uid) {
  const rev = bumpRev();
  db.prepare(`INSERT INTO pkv(procedure_id,key,value,rev,updated_by,updated_at) VALUES(?,?,?,?,?,datetime('now'))
    ON CONFLICT(procedure_id,key) DO UPDATE SET value=excluded.value, rev=excluded.rev, updated_by=excluded.updated_by, updated_at=excluded.updated_at`)
    .run(pid, key, JSON.stringify(value), rev, uid || null);
  return rev;
}
function pkvAll(pid) {
  const out = {}, revs = {};
  for (const r of db.prepare('SELECT key,value,rev FROM pkv WHERE procedure_id=?').all(pid)) { out[r.key] = JSON.parse(r.value); revs[r.key] = r.rev; }
  return { values: out, revs };
}

/** Accès à l'état vu depuis une procédure : clés de procédure dans pkv, clés d'organisation dans kv. */
function store(pid) {
  const raw = (k) => (isProcKey(k) ? pkvGet(pid, k) : kvGet(k));
  return {
    pid, raw,
    get: (k) => (raw(k) || {}).value,
    set: (k, v, uid) => (isProcKey(k) ? pkvSet(pid, k, v, uid) : kvSet(k, v, uid)),
    offers: () => offersAll(pid),
  };
}

/* ---- journal d'audit chaîné (SHA-256) ----
   Une entrée rattachée à une procédure inclut son identifiant dans l'empreinte : on ne peut pas la déplacer
   d'une procédure à l'autre sans casser la chaîne. Les entrées d'organisation gardent la formule d'origine. */
const GENESIS = '0'.repeat(64);
const auditHash = (prev, t, uid, who, action, pid) =>
  crypto.createHash('sha256').update([prev, t, uid || '', who, action].concat(pid ? [pid] : []).join('|')).digest('hex');
function auditAppend(uid, who, action, pid = null) {
  const last = db.prepare('SELECT hash FROM audit ORDER BY seq DESC LIMIT 1').get();
  const prev = last ? last.hash : GENESIS;
  const t = frDate();
  const hash = auditHash(prev, t, uid, who, action, pid);
  db.prepare('INSERT INTO audit(t,uid,who,action,prev,hash,procedure_id) VALUES(?,?,?,?,?,?,?)').run(t, uid || null, who, action, prev, hash, pid);
  bumpRev();
  return { t, who, a: action };
}
/** Entrées d'une procédure et de l'organisation (sans pid : toutes). */
function auditList(limit = 200, pid = null) {
  if (!pid) return db.prepare('SELECT t,who,action AS a FROM audit ORDER BY seq DESC LIMIT ?').all(limit);
  return db.prepare('SELECT t,who,action AS a FROM audit WHERE procedure_id=? OR procedure_id IS NULL ORDER BY seq DESC LIMIT ?').all(pid, limit);
}
function auditVerify() {
  let prev = GENESIS, n = 0;
  for (const r of db.prepare('SELECT * FROM audit ORDER BY seq').iterate()) {
    if (r.prev !== prev || r.hash !== auditHash(prev, r.t, r.uid, r.who, r.action, r.procedure_id)) return { ok: false, brokenAt: r.seq, entries: n };
    prev = r.hash; n++;
  }
  return { ok: true, entries: n, head: prev };
}

/* ---- offres ---- */
const offersAll = (pid) => db.prepare('SELECT data FROM offers WHERE procedure_id=? ORDER BY ord').all(pid).map((r) => JSON.parse(r.data));
function offerInsert(o, submitted, pid) {
  const ord = (db.prepare('SELECT COALESCE(MAX(ord),0)+1 AS n FROM offers').get().n);
  db.prepare('INSERT INTO offers(id,ord,data,submitted,procedure_id) VALUES(?,?,?,?,?)').run(o.id, ord, JSON.stringify(o), submitted ? 1 : 0, pid);
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

/* ---- procédures ---- */
function proceduresAll() {
  return db.prepare('SELECT id, archived, created_at FROM procedures ORDER BY ord').all().map((p) => {
    const g = (k) => (pkvGet(p.id, k) || {}).value;
    const cdc = g('cdc') || {};
    return { id: p.id, ref: cdc.ref, objet: cdc.objet, publie: !!cdc.cdcPublie, archive: !!p.archived, creee: p.created_at,
      depouillement: !!g('depClosed'), evaluation: !!g('evalDone'), signe: !!g('contractSigned'), infructueux: !!g('infructueux') };
  });
}
const procedureGet = (pid) => db.prepare('SELECT * FROM procedures WHERE id=?').get(pid);

/** État initial d'une procédure : le cahier des charges modèle, la grille par défaut, le circuit modèle de l'organisation. */
function procDefaults(cdc) {
  const circuit = (kvGet('circuitModele') || { value: seed.APPROVALS }).value;
  return {
    cdc, criteria: clone(seed.CRITERIA), quality: {}, justif: {}, confirmed: {}, excluded: {},
    depClosed: false, evalDone: false, approvals: circuit.map((a) => ({ role: a.role, who: a.who, done: false })),
    qa: [], additifs: [], clarifs: [], coi: {}, recours: [], standstill: { days: 15, startedAt: null },
    contractSigned: false, infructueux: null, cadre: null,
  };
}
function procedureInsert(pid, values, uid) {
  const ord = db.prepare('SELECT COALESCE(MAX(ord),0)+1 AS n FROM procedures').get().n;
  db.prepare('INSERT INTO procedures(id,ord,created_by) VALUES(?,?,?)').run(pid, ord, uid || null);
  for (const [k, v] of Object.entries(values)) pkvSet(pid, k, v, uid);
}
/** Nouvelle procédure (non publiée) : identifiant attribué par le serveur. */
function procedureCreate({ ref, objet, profil }, uid) {
  const n = db.prepare('SELECT COUNT(*) c FROM procedures').get().c + 1;
  let pid = 'p' + n;
  while (procedureGet(pid)) pid = 'p' + (Number(pid.slice(1)) + 1);
  const org = (kvGet('org') || { value: {} }).value;
  const cdc = { ...clone(seed.CDC), ref, objet, autorite: org.nom || seed.CDC.autorite, cdcPublie: false, profil: profil || org.profilDefaut || P.DEFAUT };
  procedureInsert(pid, procDefaults(cdc), uid);
  return pid;
}

/* ---- jeu de données initial ---- */
function defaultOrgKv() {
  return {
    org: { nom: 'Banque Atlantique du Littoral', pays: 'Côte d’Ivoire', ville: 'Abidjan', devisePivot: 'XOF', accent: '#1F6F6B', initiales: 'BAL',
      rates: clone(seed.RATES_DEF), profilDefaut: 'uemoa-ci', reglages: {} },
    seuils: { confianceMin: 75, prixBas: 25, structureEcart: 0.8, refsMin: 3, validiteMin: 90, ecartIaMax: 0 },
    docDefs: clone(seed.DOC_DEFS), roles: clone(seed.ROLES), notifRules: clone(seed.NOTIF_RULES),
    notifs: [], emails: [], delegations: [], circuitModele: clone(seed.APPROVALS),
    mailFrom: 'marches@bal.ci', mailSuffix: '@bal.ci',
  };
}

function seedAll(withUsers = true) {
  const tx = db.transaction(() => {
    db.exec('DELETE FROM kv; DELETE FROM pkv; DELETE FROM procedures; DELETE FROM offers; DELETE FROM receipts; DELETE FROM audit;');
    for (const [k, v] of Object.entries(defaultOrgKv())) kvSet(k, v, 'seed');
    // procédure de démonstration : AO-2026-014, publiée telle que dans le prototype, avec ses offres
    const demo = procDefaults(clone(seed.CDC));
    seed.OFFERS.forEach((o) => { demo.quality[o.id] = { metho: o.aiMetho, refs: o.aiRefs }; });
    procedureInsert('p1', demo, 'seed');
    seed.OFFERS.forEach((o) => offerInsert(o, false, 'p1'));
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

/* Migrations de données des instances existantes (idempotentes), dans l'ordre où elles ont été écrites. */
db.transaction(function migrate() {
  // 02/10/2026 : la référence de la procédure devient un champ du cahier des charges.
  const cdc = kvGet('cdc');
  if (cdc && !cdc.value.ref) {
    cdc.value.ref = seed.CDC.ref;
    kvSet('cdc', cdc.value, 'migration');
  }
  // 02/10/2026 : profils réglementaires. La liste UEMOA de l'organisation devient un réglage du profil,
  // et le cadre d'une procédure déjà publiée est figé avec les règles qui s'appliquaient jusque-là.
  const org = kvGet('org');
  if (org && !org.value.profilDefaut) {
    const { uemoa, ...reste } = org.value;
    const reglages = {};
    if (Array.isArray(uemoa) && JSON.stringify(uemoa) !== JSON.stringify(P.UEMOA)) reglages.zonePreference = uemoa;
    kvSet('org', { ...reste, profilDefaut: P.DEFAUT, reglages }, 'migration');
  }
  const pub = kvGet('cdc');
  if (pub && pub.value.cdcPublie && !kvGet('cadre')) {
    const ctx = { cdc: pub.value, org: kvGet('org').value };
    kvSet('cadre', { profil: R.profilId(ctx), regles: R.cadre(ctx), at: frDate(), by: 'migration' }, 'migration');
  }
  // 02/10/2026 : plusieurs procédures. L'unique procédure d'une instance existante devient la procédure p1 :
  // ses clés passent de kv à pkv (révisions conservées), ses offres, accusés et pièces lui sont rattachés.
  if (kvGet('cdc') && !db.prepare('SELECT COUNT(*) c FROM procedures').get().c) {
    db.prepare("INSERT INTO procedures(id,ord,created_by) VALUES('p1',1,'migration')").run();
    const ap = kvGet('approvals');
    if (!kvGet('circuitModele')) kvSet('circuitModele', ((ap && ap.value) || seed.APPROVALS).map((a) => ({ role: a.role, who: a.who })), 'migration');
    const ph = PROC_KEYS.map(() => '?').join(',');
    db.prepare(`INSERT INTO pkv(procedure_id,key,value,rev,updated_by,updated_at)
      SELECT 'p1',key,value,rev,updated_by,updated_at FROM kv WHERE key IN (${ph})`).run(...PROC_KEYS);
    db.prepare(`DELETE FROM kv WHERE key IN (${ph})`).run(...PROC_KEYS);
    ['offers', 'receipts', 'files'].forEach((t) => db.prepare(`UPDATE ${t} SET procedure_id='p1' WHERE procedure_id IS NULL`).run());
    bumpRev();
  }
})();

function resetDemo(uid, who) {
  const tx = db.transaction(() => {
    seedAll(false);
    auditAppend(uid, who, 'Démonstration réinitialisée');
  });
  tx();
}

module.exports = {
  db, getRev, bumpRev, kvGet, kvSet, kvAll, pkvGet, pkvSet, pkvAll, store, PROC_KEYS, isProcKey,
  auditAppend, auditList, auditVerify, offersAll, offerInsert, offersReplace,
  proceduresAll, procedureGet, procedureCreate, resetDemo, slug, frDate, seed,
};
