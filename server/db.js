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
// 08/10/2026 : poste de travail de l'auteur (navigateur, système, identifiant du navigateur) et adresses relayées par les
// proxys (X-Forwarded-For à plusieurs maillons : l'adresse interne du poste, si un proxy d'entreprise la transmet).
addColumn('audit', 'poste', 'TEXT');
addColumn('audit', 'relais', 'TEXT');
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
// 08/10/2026 : mot de passe provisoire (compte créé ou réinitialisé par un administrateur : à changer à la première
// connexion) et date du dernier changement (expiration réglée dans les paramètres de l'organisation).
addColumn('users', 'mdp_a_changer', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'mdp_change_le', 'TEXT');
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
const auditHash = (prev, t, uid, who, action, pid, ip, poste, relais) =>
  crypto.createHash('sha256').update([prev, t, uid || '', who, action].concat(pid ? [pid] : []).concat(ip ? ['ip:' + ip] : [])
    .concat(poste ? ['poste:' + poste] : []).concat(relais ? ['relais:' + relais] : []).join('|')).digest('hex');
function auditAppend(uid, who, action, pid = null) {
  const last = db.prepare('SELECT hash FROM audit ORDER BY seq DESC LIMIT 1').get();
  const prev = last ? last.hash : GENESIS;
  const t = frDate();
  const ip = contexte.ip(), poste = contexte.poste(), relais = contexte.relais();
  const hash = auditHash(prev, t, uid, who, action, pid, ip, poste, relais);
  db.prepare('INSERT INTO audit(t,uid,who,action,prev,hash,procedure_id,ip,poste,relais) VALUES(?,?,?,?,?,?,?,?,?,?)').run(t, uid || null, who, action, prev, hash, pid, ip, poste, relais);
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
  return db.prepare('SELECT seq, t, who, action AS a, procedure_id AS pid, ip, poste, relais, hash FROM audit ORDER BY seq DESC LIMIT ?').all(limit);
}
function auditVerify() {
  let prev = GENESIS, n = 0;
  for (const r of db.prepare('SELECT * FROM audit ORDER BY seq').iterate()) {
    if (r.prev !== prev || r.hash !== auditHash(prev, r.t, r.uid, r.who, r.action, r.procedure_id, r.ip, r.poste, r.relais)) return { ok: false, brokenAt: r.seq, entries: n };
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
/** Pièces de l'appel d'offres de démonstration : celles par défaut, plus la caution de soumission (propre à l'offre). */
function piecesOffreDemo(cdc) {
  const d = piecesOffreDefaut(cdc);
  if (!d.some((x) => x.id === 'caution')) d.push(clone(seed.DOC_DEFS.find((x) => x.id === 'caution')));
  return d;
}
function procDefaults(cdc, { demo = false } = {}) {
  const circuit = (kvGet('circuitModele') || { value: seed.APPROVALS }).value;
  return {
    docDefs: demo ? piecesOffreDemo(cdc) : piecesOffreDefaut(cdc),
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
  return p;
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
      rates: clone(seed.RATES_DEF), profilDefaut: cfg.marchesPublics ? 'uemoa-ci' : 'prive', reglages: {}, inscriptionOuverte: true, prefixeCommande: 'BC' },
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
  // mot de passe tiré au hasard et affiché dans le journal : il est à changer dès la première connexion
  if (tire) db.prepare("UPDATE users SET mdp_a_changer=1 WHERE id='u0'").run();
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
      const demo = procDefaults({ ...clone(seed.CDC), ...(cfg.marchesPublics ? {} : { prefActive: false, prefTaux: 0 }), cctp: clone(CCTP_EXEMPLE), ligneBudget: 'b-dsi-inv', ouverture: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) }, { demo: true });
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
    if (demo) {
      const p = partenaireDemo();
      // achats privés (marchés publics en attente) : l'appel d'offres de démonstration consulte SOTRAP
      if (!cfg.marchesPublics && p && db.prepare("SELECT 1 FROM procedures WHERE id='p1'").get()) pkvSet('p1', 'consultes', { mode: 'restreint', partenaires: [p.id] }, 'seed');
    }
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
  // 08/10/2026 : marchés publics en attente (MARCHES_PUBLICS) : l'organisation et ses appels d'offres non publiés passent
  // en achats privés ; un appel d'offres déjà publié garde le cadre figé à sa publication.
  if (!cfg.marchesPublics) {
    const org = kvGet('org');
    if (org && P.profil(org.value.profilDefaut || P.DEFAUT).public) kvSet('org', { ...org.value, profilDefaut: 'prive' }, 'migration');
    for (const p of db.prepare('SELECT id FROM procedures').all()) {
      const c = pkvGet(p.id, 'cdc');
      if (!c || c.value.cdcPublie) continue;
      let v = c.value;
      if (v.profil && P.profil(v.profil).public) v = { ...v, profil: 'prive' };
      // préférence géographique (règle des marchés publics) : retirée si les règles de l'organisation ne l'autorisent plus
      if (v.prefActive && !R.cadre({ cdc: v, org: (kvGet('org') || {}).value || {} }).preferenceAutorisee) v = { ...v, prefActive: false };
      if (v !== c.value) pkvSet(p.id, 'cdc', v, 'migration');
    }
  }
  // 08/10/2026 : date du dernier changement de mot de passe ; pour les comptes existants, celle de la mise à jour (le
  // délai d'expiration, s'il est réglé, court à partir d'elle).
  db.prepare("UPDATE users SET mdp_change_le=datetime('now') WHERE mdp_change_le IS NULL").run();
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

/** Zones de données que l'on peut vider, avec leur libellé (journal d'audit). Les paramètres de l'organisation (profil,
    rôles, circuits, formulaires, seuils, règles de notification) ne sont jamais touchés ; le compte de celui qui vide
    est toujours gardé. */
const ZONES_VIDER = { appels: 'appels d’offres et offres', commandes: 'commandes', besoins: 'demandes d’achat', partenaires: 'partenaires',
  budget: 'budget', notifications: 'notifications et courriels', suppleances: 'suppléances', comptes: 'comptes (sauf celui de l’auteur)', journal: 'piste d’audit' };
/** Vide les zones choisies (toutes par défaut). Les commandes, rattachées à un appel d'offres, partent avec les appels
    d'offres. Retourne les identifiants des fichiers à effacer du disque. */
function viderDonnees(uid, who, zones) {
  // sans choix : tout, sauf les comptes (à cocher explicitement)
  const z = new Set(zones && zones.length ? zones : Object.keys(ZONES_VIDER).filter((k) => k !== 'comptes'));
  if (z.has('appels')) z.add('commandes');
  if (z.has('comptes')) z.add('suppleances'); // les délégations citent des comptes
  const fichiers = [];
  const del = (where) => {
    fichiers.push(...db.prepare('SELECT id FROM files WHERE ' + where).all().map((f) => f.id));
    db.prepare('DELETE FROM files WHERE ' + where).run();
  };
  const tx = db.transaction(() => {
    if (z.has('commandes')) { del('commande_id IS NOT NULL'); db.exec('DELETE FROM commandes;'); }
    if (z.has('appels')) {
      del('procedure_id IS NOT NULL');
      db.exec('DELETE FROM pkv; DELETE FROM procedures; DELETE FROM offers; DELETE FROM receipts;');
      // une demande d'achat transformée redevient validée : on pourra en refaire un appel d'offres
      if (!z.has('besoins')) for (const b of besoinsAll().filter((x) => x.statut === 'transforme')) {
        b.statut = 'valide'; delete b.procedure; delete b.procedureRef;
        b.historique.push({ t: frDate(), who, action: 'appel d’offres effacé : demande de nouveau à transformer' });
        besoinSave(b);
      }
    }
    if (z.has('besoins')) db.exec('DELETE FROM besoins;');
    if (z.has('partenaires')) {
      del("partenaire_id IS NOT NULL OR owner='inscription'");
      db.exec('DELETE FROM partenaires; DELETE FROM brouillons; UPDATE users SET partenaire_id=NULL;');
    }
    const vides = { budget: { budget: { lignes: [] } }, notifications: { notifs: [], emails: [] }, suppleances: { delegations: [], affectations: [] } };
    for (const [zone, cles] of Object.entries(vides)) if (z.has(zone)) for (const [k, v] of Object.entries(cles)) if (kvGet(k)) kvSet(k, v, 'vidage');
    if (z.has('comptes')) {
      db.prepare('DELETE FROM users WHERE id<>?').run(uid);
      db.prepare('DELETE FROM jetons WHERE user_id<>?').run(uid);
      for (const p of partenairesAll()) if ((p.comptes || []).some((c) => c !== uid)) { p.comptes = p.comptes.filter((c) => c === uid); partenaireSave(p); }
    }
    if (z.has('journal')) db.exec('DELETE FROM audit;');
    bumpRev();
    auditAppend(uid, who, 'Données effacées : ' + Object.keys(ZONES_VIDER).filter((k) => z.has(k)).map((k) => ZONES_VIDER[k]).join(', ') + ' ; paramètres conservés');
  });
  tx();
  return fichiers;
}

/* ---- données fictives, ajoutées à la demande, par zone, sans rien effacer ---- */
const ZONES_FICTIVES = { comptes: 'comptes', budget: 'lignes budgétaires', partenaires: 'partenaires', appels: 'appel d’offres avec ses offres', commandes: 'exécution (appel d’offres attribué et bons de commande)', besoins: 'demandes d’achat' };
const PARTENAIRES_FICTIFS = [
  { raisonSociale: 'SOTRAP Ingénierie SA', pays: 'CI', immatriculation: 'CI-ABJ-2009-B-14522', adresse: 'Abidjan, Plateau',
    contact: { nom: 'K. Amani', email: 'contact.sotrap@bal.ci', tel: '' }, domaines: ['Réseaux et télécoms'], statut: 'reference', compte: 'contact.sotrap@bal.ci' },
  { raisonSociale: 'Delta Bâtiment SA', pays: 'CI', immatriculation: 'CI-ABJ-2014-B-30871', adresse: 'Abidjan, Marcory',
    contact: { nom: 'A. Kouassi', email: 'contact@delta-batiment.example', tel: '' }, domaines: ['Bâtiment et travaux'], statut: 'reference' },
  { raisonSociale: 'Téranga Réseaux SA', pays: 'SN', immatriculation: 'SN-DKR-2016-B-11204', adresse: 'Dakar, Plateau',
    contact: { nom: 'M. Ndiaye', email: 'contact@teranga-reseaux.example', tel: '' }, domaines: ['Réseaux et télécoms'], statut: 'candidat' },
  { raisonSociale: 'Ivoire Netcom SARL', pays: 'CI', immatriculation: 'CI-ABJ-2018-B-05219', adresse: 'Abidjan, Treichville',
    contact: { nom: 'S. Koné', email: 'contact@ivoire-netcom.example', tel: '' }, domaines: ['Réseaux et télécoms', 'Maintenance informatique'], statut: 'candidat' },
];
const BESOINS_FICTIFS = [
  { objet: 'Renouvellement de 60 postes de travail', service: 'Direction des systèmes d’information', budget: 35000000, ligneBudget: 'b-dsi-mco',
    description: 'Remplacement des postes de plus de cinq ans des agences d’Abidjan.', justification: 'Postes hors garantie, pannes fréquentes.', soumettre: false },
  { objet: 'Aménagement de l’agence de Yamoussoukro', service: 'Direction de la logistique', budget: 60000000, ligneBudget: 'b-log-amg',
    description: 'Cloisonnement, câblage et mobilier de la nouvelle agence.', justification: 'Ouverture de l’agence prévue au prochain trimestre.', soumettre: true },
];
/** Identifiant libre pour une nouvelle procédure (jamais celui d'une procédure supprimée encore citée au journal). */
function nouveauPid() {
  const ids = db.prepare("SELECT id FROM procedures UNION SELECT DISTINCT procedure_id FROM audit WHERE procedure_id IS NOT NULL").all()
    .map((x) => Number(String(x.id).replace(/^p/, ''))).filter((x) => Number.isInteger(x));
  let pid = 'p' + (ids.length ? Math.max(...ids) + 1 : 1);
  while (procedureGet(pid)) pid = 'p' + (Number(pid.slice(1)) + 1);
  return pid;
}
/** Exécution fictive : un appel d'offres attribué (offres, évaluation, circuit d'attribution complet, marché signé) et
    cinq bons de commande à divers stades — brouillon, en validation, émis avec livraison annoncée, en réception,
    réceptionné. Retourne { ref, n }. Les dates de jalons sont étalées dans le passé : les indicateurs de délais s'en servent. */
function executionFictive(uid, who) {
  const org = (kvGet('org') || { value: {} }).value;
  const refs = new Set(proceduresAll().map((p) => String(p.ref).toLowerCase()));
  let ref = 'AO-2026-031';
  while (refs.has(ref.toLowerCase())) ref = ref.replace(/(\d+)$/, (n) => String(Number(n) + 1).padStart(n.length, '0'));
  const pid = nouveauPid();
  const ligneBudget = ((((kvGet('budget') || { value: {} }).value.lignes) || []).some((l) => l.id === 'b-dsi-inv')) ? 'b-dsi-inv' : null;
  const il = (n) => new Date(Date.now() - n * 86400000), jour = (d) => d.toISOString().slice(0, 10);
  const objet = 'Fourniture et installation d’équipements informatiques pour les agences';
  const cdc = { ...clone(seed.CDC), ref, objet, cdcPublie: true, ligneBudget, ouverture: jour(il(40)), cctp: clone(CCTP_EXEMPLE),
    ...(cfg.marchesPublics ? {} : { prefActive: false, prefTaux: 0 }) };
  const v = procDefaults(cdc, { demo: true });
  const approb = db.prepare("SELECT id FROM users WHERE role='approb' AND active=1 ORDER BY id").get();
  // trois des offres de démonstration, avec des identifiants propres à cette procédure
  const offres = ['sotrap', 'delta', 'kora'].map((id) => seed.OFFERS.find((o) => o.id === id)).filter(Boolean)
    .map((o) => ({ ...clone(o), id: o.id + '-' + pid }));
  offres.forEach((o) => { v.quality[o.id] = { metho: o.aiMetho, refs: o.aiRefs }; });
  Object.assign(v, {
    depClosed: true, evalDone: true, contractSigned: true,
    approvals: v.approvals.map((e) => ({ ...e, done: true, by: approb ? approb.id : uid, at: frDate() })),
    fxFrozen: { rates: { ...(org.rates || {}) }, at: frDate(), by: uid },
    cadre: { profil: R.profilId({ cdc, org }), regles: R.cadre({ cdc, org }), at: frDate(), by: 'seed' },
    jalons: { publie: il(40).toISOString(), depouille: il(26).toISOString(), evalue: il(20).toISOString(), attribue: il(14).toISOString(), signe: il(10).toISOString() },
  });
  procedureInsert(pid, v, uid);
  db.prepare('UPDATE procedures SET created_at=? WHERE id=?').run(il(55).toISOString().replace('T', ' ').slice(0, 19), pid);
  offres.forEach((o) => offerInsert(o, false, pid));
  const ctx = { offers: offres, org, fxFrozen: v.fxFrozen, cadre: v.cadre, cdc, criteria: v.criteria, quality: v.quality, justif: {}, excluded: {}, confirmed: {}, docDefs: v.docDefs };
  const rang = R.ranking(ctx);
  if (!rang.length) throw new Error('Appel d’offres fictif : aucune offre classée.');
  const win = rang[0].o;
  const part = partenairesAll().find((p) => String(p.raisonSociale).toLowerCase() === String(win.name).toLowerCase()) || null;
  if (part) pkvSet(pid, 'consultes', { mode: 'restreint', partenaires: [part.id] }, uid);
  const titulaireCompte = part && (part.comptes || [])[0] ? db.prepare('SELECT id, nom FROM users WHERE id=?').get(part.comptes[0]) : null;
  const demandeur = db.prepare("SELECT id, nom FROM users WHERE role='demandeur' AND active=1 ORDER BY id").get() || db.prepare('SELECT id, nom FROM users WHERE id=?').get(uid);
  const lignesBudget = ((kvGet('budget') || { value: {} }).value.lignes) || [];
  const circuitModele = (kvGet('circuitCommande') || { value: [] }).value;

  const MODELES = [
    { statut: 'receptionnee', part: 0.30, lignes: [['Postes de travail', 40], ['Écrans 24 pouces', 40]] },
    { statut: 'en_reception', part: 0.25, lignes: [['Commutateurs réseau 48 ports', 10], ['Câblage et connectique', 10]] },
    { statut: 'emise', part: 0.20, lignes: [['Serveurs de virtualisation', 4], ['Licences et support 3 ans', 4]] },
    { statut: 'validation', part: 0.10, lignes: [['Onduleurs 3 kVA', 20], ['Baies de brassage', 20]] },
    { statut: 'brouillon', part: 0.05, lignes: [['Imprimantes multifonctions', 15], ['Consommables initiaux', 15]] },
  ];
  const h = (action) => ({ t: frDate(), who, action });
  let n = 0;
  for (const m of MODELES) {
    const montant = Math.round(win.montant * m.part), [l1, l2] = m.lignes;
    const p1 = Math.floor(montant * 0.7 / l1[1]), p2 = Math.floor((montant - l1[1] * p1) / l2[1]);
    const lignes = [{ designation: l1[0], quantite: l1[1], unite: 'unité', prixUnitaire: p1 }, { designation: l2[0], quantite: l2[1], unite: 'unité', prixUnitaire: p2 }];
    const total = lignes.reduce((t, l) => t + l.quantite * l.prixUnitaire, 0);
    const circuit = C.appliquerMontant(C.reinitialiser(circuitModele), total * (R.rate(ctx, win.devise) || 1));
    const emise = ['emise', 'en_reception', 'receptionnee'].includes(m.statut);
    const c = {
      id: 'cmd' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'), numero: null, statut: m.statut,
      procedure: { id: pid, ref, objet }, titulaire: { nom: win.name, pays: win.pays, offre: win.id, partenaire: part ? part.id : null },
      devise: win.devise, taux: R.rate(ctx, win.devise), montantOffre: win.montant, lignes,
      jalons: [{ libelle: 'Livraison sur site', pourcentage: 30 }, { libelle: 'Installation et essais', pourcentage: 40 }, { libelle: 'Réception provisoire', pourcentage: 20 }, { libelle: 'Réception définitive', pourcentage: 10 }],
      dateLivraison: jour(m.statut === 'receptionnee' ? il(6) : new Date(Date.now() + (m.statut === 'en_reception' ? 7 : 15) * 86400000)),
      receptionnaire: { id: demandeur.id, nom: demandeur.nom },
      conditions: { penaliteParJour: Number(cdc.penalite) || 0, plafondPenalite: 10, garantieMois: Number(cdc.garantieMin) || 0, avance: Number(cdc.avance) || 0, tva: Number(cdc.tva) || 0 },
      circuit: m.statut === 'brouillon' ? [] : (['validation'].includes(m.statut) ? circuit : circuit.map((e) => ({ ...e, done: true, by: approb ? approb.id : uid, at: frDate() }))),
      receptions: [], historique: [h('brouillon établi pour ' + win.name)], creePar: uid, cree: frDate(),
      ligneBudget: lignesBudget.some((l) => l.id === ligneBudget) ? ligneBudget : null,
    };
    if (m.statut === 'validation') c.historique.push(h('soumise à validation'));
    if (emise) {
      c.historique.push(h('validée : prête à être émise'));
      c.numero = commandeNumero(org.prefixeCommande);
      c.emiseLe = frDate(); c.emisePar = { id: uid, nom: who }; c.emetteur = { nom: org.nom, ville: org.ville, pays: org.pays };
      const doc = { numero: c.numero, emiseLe: c.emiseLe, emetteur: c.emetteur, procedure: c.procedure, titulaire: c.titulaire, devise: c.devise,
        lignes: c.lignes, total, jalons: c.jalons, dateLivraison: c.dateLivraison, conditions: c.conditions, receptionnaire: c.receptionnaire };
      c.empreinte = crypto.createHash('sha256').update(JSON.stringify(doc)).digest('hex');
      c.historique.push(h(`émise sous le numéro ${c.numero} — empreinte ${c.empreinte.slice(0, 16)}…`));
    }
    const par = { id: demandeur.id, nom: demandeur.nom };
    if (m.statut === 'emise') {
      c.livraisons = [{ n: 1, date: jour(il(1)), t: frDate(), par: titulaireCompte || { id: null, nom: win.name }, quantites: lignes.map((l) => Math.ceil(l.quantite / 2)), bon: null, commentaire: 'Première livraison sur site.', statut: 'declaree' }];
      c.historique.push(h('livraison n° 1 déclarée par le titulaire'));
    }
    if (m.statut === 'en_reception') {
      c.receptions = [{ n: 1, date: jour(il(3)), t: frDate(), par, quantites: lignes.map((l) => Math.floor(l.quantite / 2)), reserves: null, levee: null }];
      c.historique.push(h('réception n° 1 — livraison partielle'));
    }
    if (m.statut === 'receptionnee') {
      c.receptions = [{ n: 1, date: jour(il(8)), t: frDate(), par, quantites: lignes.map((l) => l.quantite), reserves: null, levee: null }];
      c.receptionProvisoire = { date: jour(il(8)), t: frDate() }; c.retardConstate = 0;
      c.historique.push(h('réception n° 1 — tout est livré : réception provisoire'));
    }
    commandeInsert(c);
    n++;
  }
  auditAppend(uid, who, `Exécution fictive ajoutée — appel d’offres ${ref} attribué à ${win.name}, ${n} bons de commande`, pid);
  return { ref, n };
}
/** Ajoute les données fictives des zones choisies, à côté des données existantes. Retourne ce qui a été ajouté. */
function ajouterFictives(uid, who, zones) {
  const z = new Set(zones || []), ajout = {};
  const tx = db.transaction(() => {
    if (z.has('comptes')) {
      // les comptes de la démonstration (un par rôle), au mot de passe de démonstration ; jamais un courriel en double
      const roles = (kvGet('roles') || { value: {} }).value, h = bcrypt.hashSync(cfg.seedPassword, 10);
      ajout.comptes = 0;
      seed.USERS.forEach((u, i) => {
        const email = slug(u.nom) + '@bal.ci';
        if (!roles[u.role] || db.prepare('SELECT 1 FROM users WHERE lower(email)=?').get(email)) return;
        const id = db.prepare('SELECT 1 FROM users WHERE id=?').get(u.id) ? 'u' + Date.now().toString(36) + i : u.id;
        db.prepare('INSERT INTO users(id,nom,email,role,pass_hash) VALUES(?,?,?,?,?)').run(id, u.nom, email, u.role, h);
        // compte fournisseur : rattaché à la fiche dont il est le contact, si elle n'a pas encore de compte
        const p = u.role === 'soum' && partenairesAll().find((x) => String((x.contact || {}).email).toLowerCase() === email && !(x.comptes || []).length);
        if (p) { p.comptes = [id]; partenaireSave(p); db.prepare('UPDATE users SET partenaire_id=? WHERE id=?').run(p.id, id); }
        ajout.comptes++;
      });
      ajout.motDePasse = ajout.comptes ? cfg.seedPassword : null;
    }
    if (z.has('budget')) {
      const b = (kvGet('budget') || { value: { lignes: [] } }).value, lignes = b.lignes || [];
      const neuves = budgetDemo().filter((l) => !lignes.some((x) => x.id === l.id || x.code === l.code));
      kvSet('budget', { ...b, lignes: lignes.concat(neuves) }, uid);
      ajout.budget = neuves.length;
    }
    if (z.has('partenaires')) {
      const noms = new Set(partenairesAll().map((p) => String(p.raisonSociale).toLowerCase()));
      ajout.partenaires = 0;
      for (const f of PARTENAIRES_FICTIFS) {
        if (noms.has(f.raisonSociale.toLowerCase())) continue;
        const { statut, compte, ...champs } = f;
        const u = compte ? db.prepare('SELECT id FROM users WHERE lower(email)=? AND partenaire_id IS NULL').get(compte) : null;
        const p = partenaireCreer(clone(champs), u ? u.id : null, statut);
        if (statut === 'reference') p.referenceLe = frDate();
        p.historique.push({ t: frDate(), who, action: 'fiche fictive ajoutée' + (statut === 'reference' ? ' (référencée)' : '') });
        partenaireSave(p);
        ajout.partenaires++;
      }
    }
    if (z.has('appels')) {
      // AO-2026-014, puis la première référence libre (AO-2026-015…) s'il existe déjà
      const refs = new Set(proceduresAll().map((p) => String(p.ref).toLowerCase()));
      let ref = seed.CDC.ref;
      while (refs.has(ref.toLowerCase())) ref = ref.replace(/(\d+)$/, (n) => String(Number(n) + 1).padStart(n.length, '0'));
      const lignes = ((kvGet('budget') || { value: {} }).value.lignes) || [];
      const pid = nouveauPid();
      const v = procDefaults({ ...clone(seed.CDC), ref, ...(cfg.marchesPublics ? {} : { prefActive: false, prefTaux: 0 }), cctp: clone(CCTP_EXEMPLE),
        ligneBudget: lignes.some((l) => l.id === 'b-dsi-inv') ? 'b-dsi-inv' : null, ouverture: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) }, { demo: true });
      // les identifiants d'offre sont uniques sur l'espace : suffixés si l'appel d'offres fictif existe déjà
      const pris = new Set(db.prepare('SELECT id FROM offers').all().map((o) => o.id));
      const offres = seed.OFFERS.map((o) => ({ ...clone(o), id: pris.has(o.id) ? o.id + '-' + pid : o.id }));
      offres.forEach((o) => { v.quality[o.id] = { metho: o.aiMetho, refs: o.aiRefs }; });
      procedureInsert(pid, v, uid);
      offres.forEach((o) => offerInsert(o, false, pid));
      // achats privés : les partenaires fictifs qui ont une offre sont consultés
      const noms = new Set(offres.map((o) => o.name.toLowerCase()));
      const consultes = partenairesAll().filter((p) => p.statut === 'reference' && noms.has(String(p.raisonSociale).toLowerCase())).map((p) => p.id);
      if (!cfg.marchesPublics && consultes.length) pkvSet(pid, 'consultes', { mode: 'restreint', partenaires: consultes }, uid);
      auditAppend(uid, who, `Appel d’offres fictif ajouté — ${ref} : ${seed.CDC.objet}`, pid);
      ajout.appels = ref;
    }
    if (z.has('commandes')) ajout.commandes = executionFictive(uid, who);
    if (z.has('besoins')) {
      const dem = db.prepare("SELECT id, nom FROM users WHERE role='demandeur' AND active=1 ORDER BY id").get() || db.prepare('SELECT id, nom FROM users WHERE id=?').get(uid);
      const lignes = ((kvGet('budget') || { value: {} }).value.lignes) || [];
      const org = (kvGet('org') || { value: {} }).value;
      ajout.besoins = 0;
      for (const f of BESOINS_FICTIFS) {
        let id = besoinNumero();
        while (besoinGet(id)) id = id.replace(/(\d+)$/, (n) => String(Number(n) + 1).padStart(n.length, '0'));
        const { soumettre, ...champs } = f;
        const b = { id, ...champs, ligneBudget: lignes.some((l) => l.id === f.ligneBudget) ? f.ligneBudget : null, dateSouhaitee: '',
          statut: 'brouillon', par: dem.id, parNom: dem.nom, cree: frDate(), circuit: [], historique: [{ t: frDate(), who, action: 'demande fictive ajoutée' }] };
        const circuit = C.appliquerMontant(C.reinitialiser((kvGet('circuitBesoin') || { value: [] }).value), b.budget);
        if (soumettre && C.nbRequises(circuit)) {
          const type = P.typeProcedure(P.effectif(org.profilDefaut, org.reglages), b.budget);
          Object.assign(b, { statut: 'soumis', circuit, type: type.id, typeLab: type.lab, soumis: frDate() });
          b.historique.push({ t: frDate(), who, action: `soumise à validation (${type.lab})` });
        }
        besoinInsert(b, dem.id);
        ajout.besoins++;
      }
    }
    bumpRev();
    auditAppend(uid, who, 'Données fictives ajoutées : ' + Object.keys(ZONES_FICTIVES).filter((k) => z.has(k)).map((k) => ZONES_FICTIVES[k]).join(', '));
  });
  tx();
  return ajout;
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
  resetDemo, viderDonnees, ZONES_VIDER, ajouterFictives, ZONES_FICTIVES, slug, frDate, seed,
};
