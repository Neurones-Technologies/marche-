const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const contexte = require('./contexte');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const cfg = require('./config');
const seed = require('./seed/seed.json');
// clauses techniques (CCTP) de l'appel d'offres de démonstration (réseau d'agences bancaires)
const CCTP_EXEMPLE = require('./seed/cctp-exemple.json');
const R = require('../public/js/regles.js');
const P = require('../public/js/profils.js');
const C = require('../public/js/circuits.js');

/* ---- bases de données ----
   Une base par espace d'entreprise (plateforme multi-entreprises, server/espaces.js), ouverte à la demande et
   gardée ouverte. « db » désigne celle de l'espace de la requête en cours (contexte), ou la base principale
   (cfg.dbFile) hors plateforme : tests, instance d'un seul client, espace « demo ». Toutes les fonctions de ce
   module et des routes s'en servent sans savoir de quel espace il s'agit. */
const BASES = new Map();
let principale = null;
const courante = () => contexte.base() || principale;
const db = new Proxy({}, {
  get(_, k) { const c = courante(); const v = c[k]; return typeof v === 'function' ? v.bind(c) : v; },
});

/** Ouvre (ou retrouve) la base d'un fichier ; une base neuve reçoit le schéma, les migrations, et son contenu
    initial (options : voir seedAll ; sans options, celui de l'environnement). */
function ouvrirBase(fichier, options) {
  if (BASES.has(fichier)) return BASES.get(fichier);
  if (fichier !== ':memory:') fs.mkdirSync(path.dirname(fichier), { recursive: true });
  const conn = new Database(fichier);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  BASES.set(fichier, conn);
  contexte.avec({ base: conn }, () => preparerBase(options));
  return conn;
}

function schema() {
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
CREATE TABLE IF NOT EXISTS brouillons (
  hash TEXT PRIMARY KEY, pieces TEXT NOT NULL DEFAULT '{}', expire INTEGER NOT NULL
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
// 05/10/2026 : l'adresse IP de l'auteur est consignée avec chaque entrée du journal.
addColumn('audit', 'ip', 'TEXT');
addColumn('files', 'commande_id', 'TEXT'); // pièce d'exécution d'une commande (bon de livraison, facture)
// 06/10/2026 : l'accusé de dépôt porte son déposant ; un soumissionnaire ne reçoit que les siens (jamais ceux des
// concurrents : raison sociale et montant). Un accusé antérieur, sans déposant, ne va plus qu'aux lecteurs des offres.
addColumn('receipts', 'owner', 'TEXT');
// 02/10/2026 : module 1. Un compte de soumissionnaire est rattaché à sa fiche partenaire ; une pièce de référencement
// appartient à la fiche ; un compte créé par inscription publique reste inactif tant que son courriel n'est pas vérifié.
addColumn('users', 'partenaire_id', 'TEXT');
addColumn('users', 'a_verifier', 'INTEGER NOT NULL DEFAULT 0');
// 06/10/2026 : version des sessions d'un compte, portée par le jeton ; un nouveau mot de passe l'incrémente et ferme
// ainsi les sessions ouvertes ailleurs.
addColumn('users', 'session_v', 'INTEGER NOT NULL DEFAULT 0');
addColumn('files', 'partenaire_id', 'TEXT');
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const frDate = () => new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan' });

/* Clés propres à une procédure ; toutes les autres appartiennent à l'organisation (une par instance). */
const PROC_KEYS = ['rappels', 'jalons', 'reclamations', 'docDefs', 'cdc', 'criteria', 'quality', 'justif', 'confirmed', 'excluded', 'depClosed', 'evalDone', 'approvals',
  'qa', 'additifs', 'clarifs', 'coi', 'recours', 'standstill', 'contractSigned', 'infructueux', 'fxFrozen', 'cadre', '_sod', 'rejets', 'consultes'];
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
   d'une procédure à l'autre sans casser la chaîne. L'adresse IP de l'auteur, quand la requête la fournit, entre
   aussi dans l'empreinte. Les entrées antérieures (sans procédure ni adresse) gardent la formule d'origine. */
const GENESIS = '0'.repeat(64);
const auditHash = (prev, t, uid, who, action, pid, ip) =>
  crypto.createHash('sha256').update([prev, t, uid || '', who, action].concat(pid ? [pid] : []).concat(ip ? ['ip:' + ip] : []).join('|')).digest('hex');
function auditAppend(uid, who, action, pid = null) {
  const last = db.prepare('SELECT hash FROM audit ORDER BY seq DESC LIMIT 1').get();
  const prev = last ? last.hash : GENESIS;
  const t = frDate();
  const ip = contexte.ip();
  const hash = auditHash(prev, t, uid, who, action, pid, ip);
  db.prepare('INSERT INTO audit(t,uid,who,action,prev,hash,procedure_id,ip) VALUES(?,?,?,?,?,?,?,?)').run(t, uid || null, who, action, prev, hash, pid, ip);
  bumpRev();
  return { t, who, a: action };
}
/** Entrées d'une procédure et de l'organisation (sans pid : toutes). */
function auditList(limit = 200, pid = null) {
  if (!pid) return db.prepare('SELECT t,who,action AS a FROM audit ORDER BY seq DESC LIMIT ?').all(limit);
  return db.prepare('SELECT t,who,action AS a FROM audit WHERE procedure_id=? OR procedure_id IS NULL ORDER BY seq DESC LIMIT ?').all(pid, limit);
}
/** Journal complet de l'instance, le plus récent d'abord : date, auteur, action, procédure, adresse IP. */
function auditJournal(limit = 2000) {
  return db.prepare('SELECT seq, t, who, action AS a, procedure_id AS pid, ip, hash FROM audit ORDER BY seq DESC LIMIT ?').all(limit);
}
function auditVerify() {
  let prev = GENESIS, n = 0;
  for (const r of db.prepare('SELECT * FROM audit ORDER BY seq').iterate()) {
    if (r.prev !== prev || r.hash !== auditHash(prev, r.t, r.uid, r.who, r.action, r.procedure_id, r.ip)) return { ok: false, brokenAt: r.seq, entries: n };
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
function offerDelete(id) {
  db.prepare('DELETE FROM offers WHERE id=?').run(id);
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
/** Pièces d'offre d'une procédure neuve : celles du référencement (demandées aux entreprises non référencées, dont un
    partenaire référencé est dispensé) et celles qu'impose le profil réglementaire. Les autres, propres à l'appel
    d'offres, s'ajoutent à la main au cahier des charges. */
function piecesOffreDefaut(cdc) {
  const org = (kvGet('org') || { value: {} }).value || {};
  const modele = (kvGet('docDefs') || { value: seed.DOC_DEFS }).value;
  const ref = ((kvGet('formulaireReferencement') || { value: { pieces: [] } }).value.pieces) || [];
  const out = ref.map((p) => ({ id: p.id, label: p.label, scope: p.scope || 'tous' }));
  const imposees = P.effectif(cdc.profil || org.profilDefaut || P.DEFAUT, org.reglages).piecesImposees || [];
  for (const id of imposees) {
    if (out.some((d) => d.id === id)) continue;
    out.push(clone(modele.find((d) => d.id === id) || seed.DOC_DEFS.find((d) => d.id === id) || { id, label: id, scope: 'tous' }));
  }
  return out;
}
/* Cahier des charges d'un appel d'offres neuf : vide (seules la référence, l'objet et l'autorité contractante sont
   posés) ; « Générer des données fictives » le remplit à la demande. */
const CDC_VIDE = { procedure: '', langue: '', deviseSoumission: '', ouverture: '', lots: [], specs: [], caution: '', garantieMin: '',
  delaiMax: '', penalite: '', avance: '', tva: '', retenueNonResident: '', douaneACharge: '', prefActive: false, prefTaux: 0, partTechnique: 75 };
/* Grille d'un appel d'offres neuf : les deux critères calculés (qu'on ne peut pas ajouter à la main), sans pondération. */
const criteresVides = () => seed.CRITERIA.filter((c) => c.kind === 'auto').map((c) => ({ ...clone(c), weight: 0 }));
function procDefaults(cdc, { demo = false } = {}) {
  const circuit = (kvGet('circuitModele') || { value: seed.APPROVALS }).value;
  return {
    docDefs: piecesOffreDefaut(cdc),
    cdc, criteria: demo ? clone(seed.CRITERIA) : criteresVides(), quality: {}, justif: {}, confirmed: {}, excluded: {},
    depClosed: false, evalDone: false, approvals: C.reinitialiser(circuit),
    qa: [], additifs: [], clarifs: [], coi: {}, recours: [], rejets: [], reclamations: [], standstill: { days: 15, startedAt: null },
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
  // jamais un identifiant déjà porté, même par une procédure supprimée dont le journal d'audit garde la trace
  const ids = db.prepare("SELECT id FROM procedures UNION SELECT DISTINCT procedure_id FROM audit WHERE procedure_id IS NOT NULL").all()
    .map((x) => Number(String(x.id).replace(/^p/, ''))).filter((x) => Number.isInteger(x));
  let pid = 'p' + (ids.length ? Math.max(...ids) + 1 : 1);
  while (procedureGet(pid)) pid = 'p' + (Number(pid.slice(1)) + 1);
  const org = (kvGet('org') || { value: {} }).value;
  const cdc = { ...clone(CDC_VIDE), ref, objet, autorite: org.nom || '', cdcPublie: false, profil: profil || org.profilDefaut || P.DEFAUT, ...(extra || {}) };
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
/** Formulaire de référencement par défaut : quelques questions, et les pièces administratives du référentiel des
    offres (sans celles propres à une offre : caution, contre-garantie), attestations à date de validité. */
const CHAMPS_REFERENCEMENT = [
  { id: 'activite', label: 'Activité principale', type: 'texte', obligatoire: true },
  { id: 'effectif', label: 'Effectif', type: 'nombre', obligatoire: false },
  { id: 'chiffreAffaires', label: 'Chiffre d’affaires du dernier exercice (XOF)', type: 'nombre', obligatoire: false },
  { id: 'references', label: 'Principales références clients', type: 'texte', obligatoire: false },
];
function formulaireDefaut(docDefs) {
  return {
    champs: clone(CHAMPS_REFERENCEMENT),
    pieces: (docDefs || []).filter((d) => !['caution', 'contreGarantie'].includes(d.id))
      .map((d) => ({ id: d.id, label: d.label, scope: d.scope || 'tous', obligatoire: true, expiration: ['fiscal', 'cnps'].includes(d.id) })),
  };
}
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
/** Comptes d'une même entreprise (même fiche partenaire), désactivés compris : ils partagent l'offre en cours, les
    fichiers en préparation et les accusés. Un compte sans fiche est seul dans son équipe. */
function equipeDe(uid) {
  const u = db.prepare('SELECT partenaire_id FROM users WHERE id=?').get(uid);
  return u && u.partenaire_id ? db.prepare('SELECT id FROM users WHERE partenaire_id=?').all(u.partenaire_id).map((x) => x.id) : [uid];
}
/** Marques SQL d'une liste : « ?,?,? ». */
const marques = (liste) => liste.map(() => '?').join(',');
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
    notifs: [], emails: [], delegations: [], circuitModele: clone(seed.APPROVALS), circuitBesoin: clone(CIRCUIT_BESOIN), circuitReferencement: clone(CIRCUIT_REFERENCEMENT), formulaireReferencement: formulaireDefaut(seed.DOC_DEFS), circuitCommande: clone(CIRCUIT_COMMANDE), evaluationPartenaires: clone(EVALUATION_PARTENAIRES),
    mailFrom: 'marches@bal.ci', mailSuffix: '@bal.ci',
    budget: { lignes: [] },
  };
}
/* Lignes budgétaires de la démonstration (exercice en cours). */
const budgetDemo = () => { const a = new Date().getFullYear(); return [
  { id: 'b-dsi-inv', code: 'DSI-INV-01', libelle: 'Investissements réseau et télécoms', service: 'Direction des systèmes d’information', exercice: a, montant: 150000000 },
  { id: 'b-dsi-mco', code: 'DSI-MCO-02', libelle: 'Maintenance et support informatique', service: 'Direction des systèmes d’information', exercice: a, montant: 40000000 },
  { id: 'b-log-amg', code: 'LOG-AMG-01', libelle: 'Aménagement et équipement des agences', service: 'Direction de la logistique', exercice: a, montant: 90000000 },
]; };

/** Compte administrateur initial d'une instance sans démonstration : ADMIN_EMAIL, ADMIN_NOM, ADMIN_PASSWORD ;
    sans ADMIN_PASSWORD, un mot de passe aléatoire est tiré et affiché une seule fois dans le journal du serveur. */
function adminInitial() {
  const email = String(process.env.ADMIN_EMAIL || 'administrateur@localhost').trim().toLowerCase();
  let mdp = process.env.ADMIN_PASSWORD, tire = false;
  if (!mdp) { mdp = crypto.randomBytes(12).toString('base64').replace(/[+/=]/g, '') + 'Aa1'; tire = true; }
  db.prepare('INSERT INTO users(id,nom,email,role,pass_hash) VALUES(?,?,?,?,?)').run('u0', String(process.env.ADMIN_NOM || 'Administrateur').trim(), email, 'admin', bcrypt.hashSync(mdp, 10));
  if (tire) console.log(`Compte administrateur initial : ${email} — mot de passe : ${mdp} (à changer dès la première connexion).`);
}

/* options (création d'un espace) : { demo: false, org: { nom, pays, ville }, profil, admin: { nom, email, hash } }.
   Sans options : l'environnement décide (SEED_DEMO, ORG_NOM, ADMIN_EMAIL…). */
function seedAll(withUsers = true, options = null) {
  const demo = options ? !!options.demo : cfg.seedDemo;
  const tx = db.transaction(() => {
    db.exec('DELETE FROM kv; DELETE FROM pkv; DELETE FROM procedures; DELETE FROM offers; DELETE FROM receipts; DELETE FROM audit; DELETE FROM besoins; DELETE FROM commandes; DELETE FROM partenaires; DELETE FROM jetons; UPDATE users SET partenaire_id=NULL;');
    const org = defaultOrgKv();
    if (!demo) {
      // instance réelle : l'organisation est nommée par l'environnement (ou par la création de l'espace), sans aucune
      // donnée fictive
      const o = (options && options.org) || {};
      const nom = String(o.nom || process.env.ORG_NOM || 'Mon organisation').trim();
      Object.assign(org.org, { nom, ville: String(o.ville || process.env.ORG_VILLE || '').trim(), pays: String(o.pays || process.env.ORG_PAYS || '').trim(),
        initiales: nom.split(/\s+/).map((x) => x[0] || '').join('').slice(0, 3).toUpperCase() });
      if (options && options.profil && P.existe(options.profil)) org.org.profilDefaut = options.profil;
      // l'administrateur d'une organisation réelle ne dépose pas d'offres : ni « Mon référencement », ni ce cumul
      if (org.roles && org.roles.admin) org.roles.admin.perms['portail.use'] = false;
      org.mailFrom = ''; org.mailSuffix = '';
    }
    if (demo) org.budget = { lignes: budgetDemo() };
    for (const [k, v] of Object.entries(org)) kvSet(k, v, 'seed');
    if (demo) {
      // procédure de démonstration : AO-2026-014, telle que dans le prototype, avec ses offres
      const demo = procDefaults({ ...clone(seed.CDC), cctp: clone(CCTP_EXEMPLE), ligneBudget: 'b-dsi-inv', ouverture: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) }, { demo: true });
      seed.OFFERS.forEach((o) => { demo.quality[o.id] = { metho: o.aiMetho, refs: o.aiRefs }; });
      procedureInsert('p1', demo, 'seed');
      seed.OFFERS.forEach((o) => offerInsert(o, false, 'p1'));
    }
    if (withUsers) {
      db.exec('DELETE FROM users');
      if (demo) {
        const h = bcrypt.hashSync(cfg.seedPassword, 10);
        const ins = db.prepare('INSERT INTO users(id,nom,email,role,pass_hash) VALUES(?,?,?,?,?)');
        for (const u of seed.USERS) ins.run(u.id, u.nom, slug(u.nom) + '@bal.ci', u.role, h);
      } else if (options && options.admin) {
        const a = options.admin;
        db.prepare('INSERT INTO users(id,nom,email,role,pass_hash) VALUES(?,?,?,?,?)').run('u0', a.nom, a.email, 'admin', a.hash);
      } else adminInitial();
    }
    if (demo) partenaireDemo();
    auditAppend(null, 'Système', 'Instance initialisée');
  });
  tx();
}

/** Schéma, contenu initial d'une base vide, puis migrations de données. */
function preparerBase(options) {
  schema();
  if (db.prepare('SELECT COUNT(*) c FROM kv').get().c === 0) seedAll(true, options);
  migrer();
}

/* Migrations de données des instances existantes (idempotentes), dans l'ordre où elles ont été écrites. */
function migrer() {
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
    db.prepare(`DELETE FROM kv WHERE key IN (${ph}) AND key <> 'docDefs'`).run(...PROC_KEYS); // docDefs : modèle de l'organisation
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
  // 05/10/2026 : formulaire de référencement propre à l'organisation (questions et pièces), distinct des pièces d'une
  // offre ; repris des pièces du référentiel des offres en vigueur.
  if (kvGet('org') && !kvGet('formulaireReferencement')) kvSet('formulaireReferencement', formulaireDefaut((kvGet('docDefs') || { value: seed.DOC_DEFS }).value), 'migration');
  // 06/10/2026 : les pièces d'une offre deviennent propres à chaque appel d'offres (saisies au cahier des charges) ;
  // une procédure existante garde la liste de l'organisation qui s'appliquait jusque-là.
  const modelePieces = (kvGet('docDefs') || { value: seed.DOC_DEFS }).value;
  for (const p of db.prepare('SELECT id FROM procedures').all()) {
    if (!db.prepare("SELECT 1 FROM pkv WHERE procedure_id=? AND key='docDefs'").get(p.id)) pkvSet(p.id, 'docDefs', clone(modelePieces), 'migration');
  }
  // 07/10/2026 : jalons datés des procédures (indicateurs de délais). Pour une procédure existante, repris du journal
  // d'audit (première entrée de chaque étape).
  const DEPUIS_JOURNAL = { publie: /^(Cahier des charges publié|Cadre réglementaire figé à la publication)/, depouille: /^(Dépouillement clôturé|Taux de change figés à la clôture)/,
    evalue: /^Évaluation validée/, attribue: /^Attribution prononcée/, signe: /^Marché signé/, infructueux: /infructueu/i };
  const isoDe = (t) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})\D+(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(t || '')); return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] || '00'}Z` : null; };
  for (const p of db.prepare('SELECT id FROM procedures').all()) {
    if (pkvGet(p.id, 'jalons')) continue;
    const j = {};
    for (const e of db.prepare('SELECT t, action FROM audit WHERE procedure_id=? ORDER BY seq').all(p.id))
      for (const [k, re] of Object.entries(DEPUIS_JOURNAL)) if (!j[k] && re.test(e.action)) j[k] = isoDe(e.t);
    // étape franchie sans trace au journal : date inconnue (jamais datée après coup)
    const g = (k) => (pkvGet(p.id, k) || {}).value;
    const franchies = { publie: (g('cdc') || {}).cdcPublie, depouille: g('depClosed'), evalue: g('evalDone'),
      attribue: g('evalDone') && C.complet(g('approvals') || []), signe: g('contractSigned'), infructueux: g('infructueux') };
    for (const [k, f] of Object.entries(franchies)) if (f && !j[k]) j[k] = null;
    pkvSet(p.id, 'jalons', j, 'migration');
  }
  // 07/10/2026 : les clauses techniques (CCTP) deviennent propres à chaque achat (cdc.cctp). L'appel d'offres de
  // démonstration garde celles qu'il affichait jusque-là ; les autres prennent le CCTP générique, à faire rédiger.
  for (const p of db.prepare('SELECT id FROM procedures').all()) {
    const c = pkvGet(p.id, 'cdc');
    if (c && !c.value.cctp && c.value.ref === seed.CDC.ref && c.value.objet === seed.CDC.objet) pkvSet(p.id, 'cdc', { ...c.value, cctp: clone(CCTP_EXEMPLE) }, 'migration');
  }
  // 07/10/2026 : budget et engagement. Sans ligne budgétaire, le contrôle des crédits reste inactif.
  if (kvGet('org') && !kvGet('budget')) kvSet('budget', { lignes: [] }, 'migration');
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
}

/** Vide les données de l'espace (fictives ou non) : registres, échanges, pièces, budget et journal. Les paramètres de
    l'organisation (profil, rôles, circuits, formulaires, seuils, règles de notification) et les comptes sont
    conservés ; les comptes fournisseurs perdent leur fiche partenaire. Retourne les identifiants des fichiers à effacer
    du disque. */
function viderDonnees(uid, who) {
  let fichiers = [];
  const tx = db.transaction(() => {
    fichiers = db.prepare('SELECT id FROM files').all().map((f) => f.id);
    db.exec('DELETE FROM pkv; DELETE FROM procedures; DELETE FROM offers; DELETE FROM receipts; DELETE FROM audit; DELETE FROM besoins; '
      + 'DELETE FROM commandes; DELETE FROM partenaires; DELETE FROM files; DELETE FROM brouillons; DELETE FROM jetons; UPDATE users SET partenaire_id=NULL;');
    for (const [k, v] of Object.entries({ notifs: [], emails: [], delegations: [], affectations: [], budget: { lignes: [] } })) if (kvGet(k)) kvSet(k, v, 'vidage');
    bumpRev();
    auditAppend(uid, who, 'Données effacées : appels d’offres, offres, demandes d’achat, commandes, partenaires, pièces et budget ; paramètres et comptes conservés');
  });
  tx();
  return fichiers;
}
function resetDemo(uid, who) {
  const tx = db.transaction(() => {
    seedAll(false);
    auditAppend(uid, who, 'Démonstration réinitialisée');
  });
  tx();
}

principale = ouvrirBase(cfg.dbFile);
/** Ferme la base d'un espace (avant la suppression de ses fichiers). */
function fermerBase(fichier) { const c = BASES.get(fichier); if (c && c !== principale) { c.close(); BASES.delete(fichier); } }

module.exports = {
  ouvrirBase, fermerBase, db, getRev, bumpRev, kvGet, kvSet, kvAll, pkvGet, pkvSet, pkvAll, store, PROC_KEYS, isProcKey,
  auditAppend, auditList, auditJournal, auditVerify, offersAll, offerInsert, offerDelete, offersReplace,
  commandesAll, commandeGet, commandeInsert, commandeSave, commandeNumero,
  partenairesAll, partenaireGet, partenaireSave, partenaireDe, partenaireCreer, equipeDe, marques, jetonCreer, jetonUtiliser,
  proceduresAll, procedureGet, procedureCreate, besoinsAll, besoinGet, besoinInsert, besoinSave, besoinNumero,
  resetDemo, viderDonnees, slug, frDate, seed,
};
