/* Plateforme multi-entreprises : un espace par entreprise, à son sous-domaine (bal.tenders.neuronestech.com).

   Activée par PLATEFORME_DOMAINE (ex. tenders.neuronestech.com ; « localhost » en développement, avec
   bal.localhost:3000). Sans elle, l'application sert un seul client sur la base principale, comme avant.

   - Le registre (plateforme.db) liste les espaces : sous-domaine, raison sociale, base, dossier des pièces.
   - Chaque espace a sa base et son dossier de pièces : ses données et ses partenaires lui restent propres.
   - L'adresse racine (le domaine lui-même) sert la page « Créer votre espace » et l'API de la plateforme.
   - La base principale (DB_FILE) devient l'espace « demo » (ESPACE_INITIAL) au premier démarrage. */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const cfg = require('./config');
const contexte = require('./contexte');
const { ouvrirBase } = require('./db');

const DOMAINE = String(process.env.PLATEFORME_DOMAINE || '').trim().toLowerCase();
const actif = () => !!DOMAINE;
const DOSSIER = process.env.DATA_DIR || (cfg.dbFile === ':memory:' ? path.join(require('os').tmpdir(), 'mp-plateforme-test-' + process.pid) : path.dirname(cfg.dbFile));
/* Sous-domaines qu'une entreprise ne peut pas prendre. */
const RESERVES = ['www', 'api', 'app', 'admin', 'plateforme', 'mail', 'smtp', 'ftp', 'static', 'cdn', 'aide', 'support', 'status', 'blog', 'docs', 'demo', 'test', 'dev'];
const valideSousDomaine = (s) => /^[a-z][a-z0-9-]{1,28}[a-z0-9]$/.test(s) && !s.includes('--');

let REG = null;
function registre() {
  if (REG) return REG;
  const fichier = process.env.PLATEFORME_DB || (cfg.dbFile === ':memory:' ? ':memory:' : path.join(DOSSIER, 'plateforme.db'));
  if (fichier !== ':memory:') fs.mkdirSync(path.dirname(fichier), { recursive: true });
  REG = new Database(fichier);
  REG.pragma('journal_mode = WAL');
  REG.exec(`
CREATE TABLE IF NOT EXISTS espaces (
  slug TEXT PRIMARY KEY, nom TEXT NOT NULL, pays TEXT, profil TEXT, admin_email TEXT,
  fichier TEXT NOT NULL, fichiers TEXT NOT NULL, actif INTEGER NOT NULL DEFAULT 1,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS demandes (
  jeton TEXT PRIMARY KEY, slug TEXT NOT NULL, data TEXT NOT NULL, expire INTEGER NOT NULL, cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);`);
  // l'installation existante (base principale) devient le premier espace
  const initial = String(process.env.ESPACE_INITIAL || 'demo').trim().toLowerCase();
  if (initial && !REG.prepare('SELECT 1 FROM espaces WHERE slug=?').get(initial)) {
    const org = contexte.avec({}, () => { const { kvGet } = require('./db'); return ((kvGet('org') || {}).value) || {}; });
    REG.prepare('INSERT INTO espaces(slug,nom,pays,profil,fichier,fichiers) VALUES(?,?,?,?,?,?)')
      .run(initial, org.nom || 'Démonstration', org.pays || '', org.profilDefaut || null, cfg.dbFile, cfg.filesDir);
  }
  return REG;
}

const espace = (slug) => registre().prepare('SELECT * FROM espaces WHERE slug=?').get(slug);
const libre = (slug) => valideSousDomaine(slug) && !RESERVES.includes(slug) && !espace(slug)
  && !registre().prepare('SELECT 1 FROM demandes WHERE slug=? AND expire>?').get(slug, Date.now());

/** Adresse publique d'un espace (protocole et port de APP_URL). */
function adresse(slug) {
  const u = new URL(cfg.appUrl);
  return `${u.protocol}//${slug}.${DOMAINE}${u.port ? ':' + u.port : ''}`;
}
/** Adresse de la plateforme elle-même (page « Créer votre espace »). */
function adressePlateforme() {
  const u = new URL(cfg.appUrl);
  return `${u.protocol}//${DOMAINE}${u.port ? ':' + u.port : ''}`;
}
/** Adresse publique de l'espace de la requête en cours (liens des courriels), ou APP_URL hors plateforme. */
function adresseCourante() { const s = contexte.espace(); return s && actif() ? adresse(s) : cfg.appUrl; }

/** Ouvre la base d'un espace inscrit et actif. */
function base(e) { return ouvrirBase(e.fichier); }

/**
 * Aiguillage : l'hôte de la requête désigne la plateforme (le domaine) ou un espace (sous-domaine). La base et le
 * dossier des pièces de l'espace entrent dans le contexte ; un sous-domaine inconnu reçoit une page « espace
 * introuvable ». Inactif sans PLATEFORME_DOMAINE.
 */
function aiguillage(req, res, next) {
  if (!actif()) return next();
  const hote = String(req.hostname || '').toLowerCase();
  if (hote === DOMAINE) { req.plateforme = true; return next(); }
  if (hote.endsWith('.' + DOMAINE)) {
    const slug = hote.slice(0, -(DOMAINE.length + 1));
    const e = !slug.includes('.') && espace(slug);
    if (e && e.actif) {
      contexte.poser({ base: base(e), espace: e.slug, fichiers: e.fichiers });
      return next();
    }
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Espace introuvable.', code: 'SPACE_UNKNOWN' });
    if (/\.[a-z0-9]+$/i.test(req.path)) return next(); // feuilles de style, scripts, polices de la page « introuvable »
    return res.status(404).sendFile(path.join(__dirname, '..', 'public', 'introuvable.html'));
  }
  // autre hôte (adresse IP, nom interne) : la plateforme
  req.plateforme = true;
  next();
}

/** Création d'un espace : base dédiée, organisation, administrateur ; retourne l'espace inscrit. */
function creer({ slug, nom, pays, profil, admin }) {
  const fichier = path.join(DOSSIER, 'espaces', slug, 'marcheplus.db');
  const fichiers = path.join(DOSSIER, 'espaces', slug, 'files');
  fs.mkdirSync(fichiers, { recursive: true });
  ouvrirBase(fichier, { demo: false, org: { nom, pays }, profil, admin });
  registre().prepare('INSERT INTO espaces(slug,nom,pays,profil,admin_email,fichier,fichiers) VALUES(?,?,?,?,?,?,?)')
    .run(slug, nom, pays || '', profil || null, admin.email, fichier, fichiers);
  return espace(slug);
}

/** Demande de création en attente de la confirmation du courriel : jeton (brut) à envoyer. */
function demander(slug, data, heures = 48) {
  const brut = crypto.randomBytes(32).toString('hex');
  registre().prepare('INSERT INTO demandes(jeton,slug,data,expire) VALUES(?,?,?,?)')
    .run(crypto.createHash('sha256').update(brut).digest('hex'), slug, JSON.stringify(data), Date.now() + heures * 3600000);
  return brut;
}
/** Consomme une demande valide ; retourne { slug, data } ou null. */
function confirmer(brut) {
  const h = crypto.createHash('sha256').update(String(brut || '')).digest('hex');
  const d = registre().prepare('SELECT * FROM demandes WHERE jeton=?').get(h);
  if (!d) return null;
  registre().prepare('DELETE FROM demandes WHERE jeton=?').run(h);
  if (d.expire < Date.now()) return null;
  return { slug: d.slug, data: JSON.parse(d.data) };
}

/** Réinitialisation de la démonstration permise ici ? Jamais dans l'espace d'une entreprise, seulement dans
    l'espace initial (la démonstration) ou dans une instance d'un seul client qui l'autorise (ALLOW_RESET). */
function reinitialisable() {
  if (!cfg.allowReset) return false;
  if (!actif()) return true;
  return contexte.espace() === String(process.env.ESPACE_INITIAL || 'demo').trim().toLowerCase();
}

/** Exécute fn dans le contexte d'un espace (sa base, son dossier). */
function dans(e, fn) { return contexte.avec({ base: base(e), espace: e.slug, fichiers: e.fichiers }, fn); }

module.exports = { reinitialisable, actif, DOMAINE, RESERVES, valideSousDomaine, libre, espace, adresse, adressePlateforme, adresseCourante, aiguillage, creer, demander, confirmer, dans, registre };
