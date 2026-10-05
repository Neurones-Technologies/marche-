/* Plateforme multi-entreprises : un espace par entreprise, à son sous-domaine (bal.tenders.neuronestech.com).

   Activée par PLATEFORME_DOMAINE (ex. tenders.neuronestech.com ; « localhost » en développement, avec
   bal.localhost:3000). Sans elle, l'application sert un seul client sur la base principale, comme avant.

   - Le registre (plateforme.db) liste les espaces : sous-domaine, raison sociale, base, dossier des pièces.
   - Chaque espace a sa base et son dossier de pièces : ses données et ses partenaires lui restent propres.
   - L'adresse racine (le domaine lui-même) sert la page « Créer votre espace » et l'API de la plateforme.
   - La base principale (DB_FILE) devient l'espace « demo » (ESPACE_INITIAL) au premier démarrage.
   - Une inscription en ligne, son courriel confirmé, attend l'accord d'un opérateur de la plateforme (console) ;
     PLATEFORME_VALIDATION=auto crée l'espace dès la confirmation. Un espace peut être suspendu (données gardées)
     puis supprimé (base et pièces effacées). */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const cfg = require('./config');
const contexte = require('./contexte');
const { ouvrirBase, fermerBase } = require('./db');

const DOMAINE = String(process.env.PLATEFORME_DOMAINE || '').trim().toLowerCase();
const actif = () => !!DOMAINE;
const DOSSIER = process.env.DATA_DIR || (cfg.dbFile === ':memory:' ? path.join(require('os').tmpdir(), 'mp-plateforme-test-' + process.pid) : path.dirname(cfg.dbFile));
/* Sous-domaines qu'une entreprise ne peut pas prendre. */
const RESERVES = ['www', 'api', 'app', 'admin', 'plateforme', 'mail', 'smtp', 'ftp', 'static', 'cdn', 'aide', 'support', 'status', 'blog', 'docs', 'demo', 'test', 'dev'];
const validationManuelle = () => String(process.env.PLATEFORME_VALIDATION || '').trim().toLowerCase() !== 'auto';
const INITIAL = () => String(process.env.ESPACE_INITIAL || 'demo').trim().toLowerCase();
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
);
CREATE TABLE IF NOT EXISTS inscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, data TEXT NOT NULL, statut TEXT NOT NULL DEFAULT 'attente',
  recue_le TEXT NOT NULL DEFAULT (datetime('now')), decidee_le TEXT, decidee_par TEXT, motif TEXT
);
CREATE TABLE IF NOT EXISTS operateurs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL, email TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL,
  actif INTEGER NOT NULL DEFAULT 1, cree_le TEXT NOT NULL DEFAULT (datetime('now')), derniere_connexion TEXT
);
CREATE TABLE IF NOT EXISTS journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT NOT NULL DEFAULT (datetime('now')), auteur TEXT NOT NULL, action TEXT NOT NULL, ip TEXT
);`);
  const cols = REG.prepare('PRAGMA table_info(espaces)').all().map((c) => c.name);
  if (!cols.includes('suspendu_le')) REG.exec('ALTER TABLE espaces ADD COLUMN suspendu_le TEXT');
  if (!cols.includes('motif')) REG.exec('ALTER TABLE espaces ADD COLUMN motif TEXT');
  if (!cols.includes('origine')) REG.exec("ALTER TABLE espaces ADD COLUMN origine TEXT");
  // l'installation existante (base principale) devient le premier espace
  const initial = INITIAL();
  if (initial && !REG.prepare('SELECT 1 FROM espaces WHERE slug=?').get(initial)) {
    const org = contexte.avec({}, () => { const { kvGet } = require('./db'); return ((kvGet('org') || {}).value) || {}; });
    REG.prepare('INSERT INTO espaces(slug,nom,pays,profil,fichier,fichiers) VALUES(?,?,?,?,?,?)')
      .run(initial, org.nom || 'Démonstration', org.pays || '', org.profilDefaut || null, cfg.dbFile, cfg.filesDir);
  }
  return REG;
}

const espace = (slug) => registre().prepare('SELECT * FROM espaces WHERE slug=?').get(slug);
const libre = (slug) => valideSousDomaine(slug) && !RESERVES.includes(slug) && !espace(slug)
  && !registre().prepare('SELECT 1 FROM demandes WHERE slug=? AND expire>?').get(slug, Date.now())
  && !registre().prepare("SELECT 1 FROM inscriptions WHERE slug=? AND statut='attente'").get(slug);

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
    if (e) { // suspendu : ni données ni connexion, une page qui le dit
      if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Cet espace est suspendu.', code: 'SPACE_SUSPENDED' });
      if (/\.[a-z0-9]+$/i.test(req.path)) return next();
      return res.status(403).sendFile(path.join(__dirname, '..', 'public', 'suspendu.html'));
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
function creer({ slug, nom, pays, profil, admin }, origine = 'en ligne') {
  const fichier = path.join(DOSSIER, 'espaces', slug, 'marcheplus.db');
  const fichiers = path.join(DOSSIER, 'espaces', slug, 'files');
  fs.mkdirSync(fichiers, { recursive: true });
  ouvrirBase(fichier, { demo: false, org: { nom, pays }, profil, admin });
  registre().prepare('INSERT INTO espaces(slug,nom,pays,profil,admin_email,fichier,fichiers,origine) VALUES(?,?,?,?,?,?,?,?)')
    .run(slug, nom, pays || '', profil || null, admin.email, fichier, fichiers, origine);
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
  return contexte.espace() === INITIAL();
}

/* ── Inscriptions en attente de l'accord d'un opérateur ── */
/** Inscription au courriel confirmé, mise en attente ; retourne son numéro. */
function inscrire(slug, data) {
  return registre().prepare('INSERT INTO inscriptions(slug,data) VALUES(?,?)').run(slug, JSON.stringify(data)).lastInsertRowid;
}
const inscription = (id) => { const i = registre().prepare('SELECT * FROM inscriptions WHERE id=?').get(id); return i && { ...i, data: JSON.parse(i.data) }; };
/** Inscriptions en attente, puis les décisions des 90 derniers jours. */
function inscriptions() {
  return registre().prepare("SELECT * FROM inscriptions WHERE statut='attente' OR decidee_le > datetime('now','-90 days') ORDER BY statut='attente' DESC, id DESC").all()
    .map((i) => ({ ...i, data: JSON.parse(i.data) }));
}
function decider(id, statut, par, motif) {
  registre().prepare("UPDATE inscriptions SET statut=?, decidee_le=datetime('now'), decidee_par=?, motif=? WHERE id=?").run(statut, par, motif || null, id);
}

/** Journal de la plateforme (console) : qui, quoi, depuis quelle adresse IP. */
function journaliser(auteur, action) { registre().prepare('INSERT INTO journal(auteur,action,ip) VALUES(?,?,?)').run(auteur, action, contexte.ip() || null); }

/* ── Suspension et suppression ── */
function suspendre(slug, motif) { registre().prepare("UPDATE espaces SET actif=0, suspendu_le=datetime('now'), motif=? WHERE slug=?").run(motif || null, slug); }
function reactiver(slug) { registre().prepare('UPDATE espaces SET actif=1, suspendu_le=NULL, motif=NULL WHERE slug=?').run(slug); }
/** Supprime un espace : sa base (fermée d'abord), ses pièces, son inscription au registre. Jamais l'espace initial,
    jamais un dossier hors de DOSSIER/espaces. */
function supprimer(slug) {
  const e = espace(slug);
  if (!e || slug === INITIAL()) return false;
  fermerBase(e.fichier);
  const dossier = path.join(DOSSIER, 'espaces', slug);
  if (path.dirname(e.fichier) === dossier && path.resolve(dossier).startsWith(path.resolve(DOSSIER, 'espaces') + path.sep)) {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
  registre().prepare('DELETE FROM espaces WHERE slug=?').run(slug);
  return true;
}

/** Activité d'un espace, lue dans sa base : comptes, prestataires, procédures, commandes, dernière connexion. */
function activite(e) {
  try {
    return dans(e, () => {
      const { db } = require('./db');
      const un = (sql) => db.prepare(sql).get() || {};
      return {
        comptes: un("SELECT count(*) n FROM users WHERE active=1 AND role<>'soum'").n || 0,
        prestataires: un('SELECT count(*) n FROM partenaires').n || 0,
        procedures: un('SELECT count(*) n FROM procedures').n || 0,
        commandes: un('SELECT count(*) n FROM commandes').n || 0,
        derniereConnexion: un('SELECT max(last_login) d FROM users').d || null,
        octets: (un('SELECT sum(size) s FROM files').s || 0) + (fs.existsSync(e.fichier) ? fs.statSync(e.fichier).size : 0),
      };
    });
  } catch (err) { return { erreur: String(err.message || err) }; }
}

/** Exécute fn dans le contexte d'un espace (sa base, son dossier). */
function dans(e, fn) { return contexte.avec({ base: base(e), espace: e.slug, fichiers: e.fichiers }, fn); }

module.exports = { journaliser, INITIAL, validationManuelle, inscrire, inscription, inscriptions, decider, suspendre, reactiver, supprimer, activite, reinitialisable, actif, DOMAINE, RESERVES, valideSousDomaine, libre, espace, adresse, adressePlateforme, adresseCourante, aiguillage, creer, demander, confirmer, dans, registre };
