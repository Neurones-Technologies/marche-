const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const cfg = require('./config');
const seed = require('./seed/seed.json');
const R = require('../public/js/regles.js');
const P = require('../public/js/profils.js');
const C = require('../public/js/circuits.js');

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
CREATE TABLE IF NOT EXISTS partenaires (
  id TEXT PRIMARY KEY, ord INTEGER NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS jetons (
  hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS commandes (
  id TEXT PRIMARY KEY, ord INTEGER NOT NULL, procedure_id TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS besoins (
  id TEXT PRIMARY KEY, ord INTEGER NOT NULL, data TEXT NOT NULL, created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
// 02/10/2026 : plusieurs procédures. Les offres, accusés, pièces et entrées d'audit portent leur procédure
// (NULL pour une entrée d'audit qui concerne l'organisation : connexion, comptes, paramètres).
function addColumn(table, col, def) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
['offers', 'receipts', 'files', 'audit'].forEach((t) => addColumn(t, 'procedure_id', 'TEXT'));
// 02/10/2026 : module 1. Un compte de soumissionnaire est rattaché à sa fiche partenaire ; une pièce de référencement
// appartient à la fiche ; un compte créé par inscription publique reste inactif tant que son courriel n'est pas vérifié.
addColumn('users', 'partenaire_id', 'TEXT');
addColumn('users', 'a_verifier', 'INTEGER NOT NULL DEFAULT 0');
addColumn('files', 'partenaire_id', 'TEXT');

const clone = (x) => JSON.parse(JSON.stringify(x));
const frDate = () => new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan' });

/* Clés propres à une procédure ; toutes les autres appartiennent à l'organisation (une par instance). */
const PROC_KEYS = ['cdc', 'criteria', 'quality', 'justif', 'confirmed', 'excluded', 'depClosed', 'evalDone', 'approvals',
  'qa', 'additifs', 'clarifs', 'coi', 'recours', 'standstill', 'contractSigned', 'infructueux', 'fxFrozen', 'cadre', '_sod', 'rejets'];
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
      besoin: cdc.besoin || null, demandeur: cdc.demandeur || null,
      depouillement: !!g('depClosed'), evaluation: !!g('evalDone'), signe: !!g('contractSigned'), infructueux: !!g('infructueux') };
  });
}
const procedureGet = (pid) => db.prepare('SELECT * FROM procedures WHERE id=?').get(pid);

/** État initial d'une procédure : le cahier des charges modèle, la grille par défaut, le circuit modèle de l'organisation. */
function procDefaults(cdc) {
  const circuit = (kvGet('circuitModele') || { value: seed.APPROVALS }).value;
  return {
    cdc, criteria: clone(seed.CRITERIA), quality: {}, justif: {}, confirmed: {}, excluded: {},
    depClosed: false, evalDone: false, approvals: C.reinitialiser(circuit),
    qa: [], additifs: [], clarifs: [], coi: {}, recours: [], rejets: [], standstill: { days: 15, startedAt: null },
    contractSigned: false, infructueux: null, cadre: null,
  };
}
function procedureInsert(pid, values, uid) {
  const ord = db.prepare('SELECT COALESCE(MAX(ord),0)+1 AS n FROM procedures').get().n;
  db.prepare('INSERT INTO procedures(id,ord,created_by) VALUES(?,?,?)').run(pid, ord, uid || null);
  for (const [k, v] of Object.entries(values)) pkvSet(pid, k, v, uid);
}
/** Nouvelle procédure (non publiée) : identifiant attribué par le serveur. */
function procedureCreate({ ref, objet, profil, extra }, uid) {
  const n = db.prepare('SELECT COUNT(*) c FROM procedures').get().c + 1;
  let pid = 'p' + n;
  while (procedureGet(pid)) pid = 'p' + (Number(pid.slice(1)) + 1);
  const org = (kvGet('org') || { value: {} }).value;
  const cdc = { ...clone(seed.CDC), ref, objet, autorite: org.nom || seed.CDC.autorite, cdcPublie: false, profil: profil || org.profilDefaut || P.DEFAUT, ...(extra || {}) };
  procedureInsert(pid, procDefaults(cdc), uid);
  return pid;
}

/* ---- besoins (module 2) : propres à l'organisation, hors procédure ---- */
/** Circuit de validation d'un besoin par défaut ; le contrôle budgétaire n'intervient qu'au-delà de 50 millions. */
const CIRCUIT_BESOIN = [
  { role: 'Responsable hiérarchique du demandeur', who: 'À désigner' },
  { role: 'Contrôle budgétaire', who: 'Direction Financière', seuil: 50000000 },
];
const besoinsAll = () => db.prepare('SELECT data FROM besoins ORDER BY ord').all().map((r) => JSON.parse(r.data));
const besoinGet = (id) => { const r = db.prepare('SELECT data FROM besoins WHERE id=?').get(id); return r ? JSON.parse(r.data) : null; };
function besoinInsert(b, uid) {
  const ord = db.prepare('SELECT COALESCE(MAX(ord),0)+1 AS n FROM besoins').get().n;
  db.prepare('INSERT INTO besoins(id,ord,data,created_by) VALUES(?,?,?,?)').run(b.id, ord, JSON.stringify(b), uid);
  bumpRev();
}
function besoinSave(b) { db.prepare('UPDATE besoins SET data=? WHERE id=?').run(JSON.stringify(b), b.id); bumpRev(); }
/** Numéro continu sur l'instance : B-<année>-0001, attribué par le serveur. */
function besoinNumero() {
  const n = db.prepare('SELECT COUNT(*) c FROM besoins').get().c + 1;
  return 'B-' + new Date().getFullYear() + '-' + String(n).padStart(4, '0');
}

/* ---- partenaires (module 1) : propres à l'organisation ---- */
/** Parcours de référencement par défaut : vérification des pièces, puis décision. */
const CIRCUIT_REFERENCEMENT = [
  { role: 'Vérification des pièces', who: 'Service achats' },
  { role: 'Décision de référencement', who: 'Responsable des achats' },
];
const partenairesAll = () => db.prepare('SELECT data FROM partenaires ORDER BY ord').all().map((r) => JSON.parse(r.data));
const partenaireGet = (id) => { const r = db.prepare('SELECT data FROM partenaires WHERE id=?').get(id); return r ? JSON.parse(r.data) : null; };
function partenaireInsert(p) {
  const ord = db.prepare('SELECT COALESCE(MAX(ord),0)+1 AS n FROM partenaires').get().n;
  db.prepare('INSERT INTO partenaires(id,ord,data) VALUES(?,?,?)').run(p.id, ord, JSON.stringify(p));
  bumpRev();
}
function partenaireSave(p) { db.prepare('UPDATE partenaires SET data=? WHERE id=?').run(JSON.stringify(p), p.id); bumpRev(); }
function partenaireNumero() { return 'PRT-' + String(db.prepare('SELECT COUNT(*) c FROM partenaires').get().c + 1).padStart(4, '0'); }
/** Fiche partenaire rattachée à un compte (null si aucune). */
function partenaireDe(uid) {
  const u = db.prepare('SELECT partenaire_id FROM users WHERE id=?').get(uid);
  return u && u.partenaire_id ? partenaireGet(u.partenaire_id) : null;
}
/** Nouvelle fiche, rattachée au compte uid ; statut « candidat » tant qu'elle n'est pas soumise. */
function partenaireCreer(champs, uid, statut) {
  const p = { id: partenaireNumero(), ...champs, statut: statut || 'candidat', comptes: uid ? [uid] : [], pieces: {}, circuit: [], historique: [], cree: frDate() };
  partenaireInsert(p);
  if (uid) db.prepare('UPDATE users SET partenaire_id=? WHERE id=?').run(p.id, uid);
  return p;
}
/** Jeton à usage unique (vérification du courriel) : seule son empreinte est conservée. */
function jetonCreer(uid, type, heures) {
  const brut = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO jetons(hash,user_id,type,expires_at) VALUES(?,?,?,?)')
    .run(crypto.createHash('sha256').update(brut).digest('hex'), uid, type, Date.now() + heures * 3600000);
  return brut;
}
/** Consomme un jeton valide ; retourne l'identifiant du compte, ou null. */
function jetonUtiliser(brut, type) {
  const hash = crypto.createHash('sha256').update(String(brut || '')).digest('hex');
  const j = db.prepare('SELECT * FROM jetons WHERE hash=? AND type=?').get(hash, type);
  if (!j || j.used || j.expires_at < Date.now()) return null;
  db.prepare('UPDATE jetons SET used=1 WHERE hash=?').run(hash);
  return j.user_id;
}
/** Fiche de démonstration : SOTRAP, déjà référencée, rattachée au compte contact.sotrap@bal.ci s'il existe. */
function partenaireDemo() {
  const u = db.prepare("SELECT id FROM users WHERE lower(email)='contact.sotrap@bal.ci'").get();
  const p = partenaireCreer({ raisonSociale: 'SOTRAP Ingénierie SA', pays: 'CI', immatriculation: 'CI-ABJ-2009-B-14522',
    adresse: 'Abidjan, Plateau', contact: { nom: 'K. Amani', email: 'contact.sotrap@bal.ci', tel: '' }, domaines: ['Réseaux et télécoms'] },
  u ? u.id : null, 'reference');
  p.referenceLe = frDate();
  p.historique.push({ t: frDate(), who: 'Système', action: 'référencé (jeu de démonstration)' });
  partenaireSave(p);
}

/* ---- bons de commande (module 4) : rattachés à une procédure, numérotés à l'émission ---- */
/** Évaluation des partenaires (module 5) : poids des critères (total 100), seuil d'alerte, retard qui annule la note
    « délais ». Réglages de l'organisation, Paramètres → 13. */
const EVALUATION_PARTENAIRES = { criteres: { delais: 30, conformite: 30, completude: 20, qualite: 20 }, seuilAlerte: 60, plafondRetardJours: 30 };
/** Circuit de validation d'une commande par défaut : l'engagement, puis le comité au-delà de 100 millions. */
const CIRCUIT_COMMANDE = [
  { role: 'Contrôle de l’engagement', who: 'Direction Financière' },
  { role: 'Visa du comité d’engagement', who: 'Comité', seuil: 100000000 },
];
const commandesAll = () => db.prepare('SELECT data FROM commandes ORDER BY ord').all().map((r) => JSON.parse(r.data));
const commandeGet = (id) => { const r = db.prepare('SELECT data FROM commandes WHERE id=?').get(id); return r ? JSON.parse(r.data) : null; };
function commandeInsert(c) {
  const ord = db.prepare('SELECT COALESCE(MAX(ord),0)+1 AS n FROM commandes').get().n;
  db.prepare('INSERT INTO commandes(id,ord,procedure_id,data) VALUES(?,?,?,?)').run(c.id, ord, c.procedure.id, JSON.stringify(c));
  bumpRev();
}
function commandeSave(c) { db.prepare('UPDATE commandes SET data=? WHERE id=?').run(JSON.stringify(c), c.id); bumpRev(); }
/** Numéro continu et sans trou, attribué à l'émission seulement : <préfixe>-<année>-0001. */
function commandeNumero(prefixe) {
  const n = commandesAll().filter((c) => c.numero).length + 1;
  return (prefixe || 'BC') + '-' + new Date().getFullYear() + '-' + String(n).padStart(4, '0');
}

/* ---- jeu de données initial ---- */
function defaultOrgKv() {
  return {
    org: { nom: 'Banque Atlantique du Littoral', pays: 'Côte d’Ivoire', ville: 'Abidjan', devisePivot: 'XOF', accent: '#1F6F6B', initiales: 'BAL',
      rates: clone(seed.RATES_DEF), profilDefaut: 'uemoa-ci', reglages: {}, inscriptionOuverte: true, prefixeCommande: 'BC' },
    seuils: { confianceMin: 75, prixBas: 25, structureEcart: 0.8, refsMin: 3, validiteMin: 90, ecartIaMax: 0 },
    docDefs: clone(seed.DOC_DEFS), roles: clone(seed.ROLES), notifRules: clone(seed.NOTIF_RULES),
    notifs: [], emails: [], delegations: [], circuitModele: clone(seed.APPROVALS), circuitBesoin: clone(CIRCUIT_BESOIN), circuitReferencement: clone(CIRCUIT_REFERENCEMENT), circuitCommande: clone(CIRCUIT_COMMANDE), evaluationPartenaires: clone(EVALUATION_PARTENAIRES),
    mailFrom: 'marches@bal.ci', mailSuffix: '@bal.ci',
  };
}

function seedAll(withUsers = true) {
  const tx = db.transaction(() => {
    db.exec('DELETE FROM kv; DELETE FROM pkv; DELETE FROM procedures; DELETE FROM offers; DELETE FROM receipts; DELETE FROM audit; DELETE FROM besoins; DELETE FROM commandes; DELETE FROM partenaires; DELETE FROM jetons; UPDATE users SET partenaire_id=NULL;');
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
    partenaireDemo();
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
  // 02/10/2026 : module 2 (besoins). Nouvelles habilitations dans les rôles existants (accordées comme dans le jeu de
  // référence aux rôles qui y figurent, refusées aux autres), rôle « Demandeur », circuit de validation par défaut.
  const roles = kvGet('roles');
  if (roles) {
    const r = clone(roles.value); let change = false;
    const nouvelles = seed.PERMS.map((x) => x.id);
    for (const [id, def] of Object.entries(r)) {
      def.perms = def.perms || {};
      for (const pId of nouvelles) if (!(pId in def.perms)) { def.perms[pId] = !!(seed.ROLES[id] && seed.ROLES[id].perms[pId]); change = true; }
    }
    if (!r.demandeur) { r.demandeur = clone(seed.ROLES.demandeur); change = true; }
    if (change) kvSet('roles', r, 'migration');
  }
  if (kvGet('org') && !kvGet('circuitBesoin')) kvSet('circuitBesoin', clone(CIRCUIT_BESOIN), 'migration');
  // 02/10/2026 : module 1 (référencement). Parcours par défaut ; chaque compte soumissionnaire existant reçoit une fiche
  // « candidat » à compléter (son référencement n'a jamais été instruit).
  if (kvGet('org') && !kvGet('circuitReferencement')) kvSet('circuitReferencement', clone(CIRCUIT_REFERENCEMENT), 'migration');
  // 02/10/2026 : module 4 (commandes). Circuit de validation par défaut.
  if (kvGet('org') && !kvGet('circuitCommande')) kvSet('circuitCommande', clone(CIRCUIT_COMMANDE), 'migration');
  // 02/10/2026 : module 5 (évaluation des partenaires). Réglages par défaut.
  if (kvGet('org') && !kvGet('evaluationPartenaires')) kvSet('evaluationPartenaires', clone(EVALUATION_PARTENAIRES), 'migration');
  if (kvGet('org') && db.prepare("SELECT COUNT(*) c FROM partenaires").get().c === 0) {
    const soums = db.prepare("SELECT id, nom, email FROM users WHERE role='soum' AND partenaire_id IS NULL").all();
    for (const u of soums) {
      const p = partenaireCreer({ raisonSociale: u.nom, pays: '', immatriculation: '', adresse: '', contact: { nom: u.nom, email: u.email, tel: '' }, domaines: [] }, u.id);
      p.historique.push({ t: frDate(), who: 'Système', action: 'fiche créée à la mise en place du référencement' });
      partenaireSave(p);
    }
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
  commandesAll, commandeGet, commandeInsert, commandeSave, commandeNumero,
  partenairesAll, partenaireGet, partenaireSave, partenaireDe, partenaireCreer, jetonCreer, jetonUtiliser,
  proceduresAll, procedureGet, procedureCreate, besoinsAll, besoinGet, besoinInsert, besoinSave, besoinNumero,
  resetDemo, slug, frDate, seed,
};
