/* Sauvegardes automatiques. Toutes les SAUVEGARDE_HEURES heures (24 par défaut ; 0 désactive), une sauvegarde
   complète est écrite dans SAUVEGARDE_DOSSIER (par défaut <dossier des données>/sauvegardes ; en conteneur, un volume
   distinct : voir docker-compose.yml) :
   - <date>/<espace>.db : copie cohérente de la base de chaque espace, faite à chaud par l'API de sauvegarde de SQLite,
     puis rouverte en lecture et vérifiée (PRAGMA integrity_check) ; <date>/plateforme.db : le registre des espaces ;
   - fichiers/<espace>/ : les pièces déposées, copiées une fois (elles ne changent jamais : identifiant unique) ;
   - <date>/manifeste.json : date, durée, empreinte SHA-256 et résultat de la vérification de chaque base.
   Les SAUVEGARDE_CONSERVER dernières sauvegardes (14 par défaut) sont gardées. Restauration : docs/SAUVEGARDES.md. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const cfg = require('./config');

const heures = () => { const h = Number(process.env.SAUVEGARDE_HEURES); return Number.isFinite(h) && h >= 0 ? h : 24; };
const conserver = () => Math.max(1, Number(process.env.SAUVEGARDE_CONSERVER) || 14);
const dossier = () => process.env.SAUVEGARDE_DOSSIER || path.join(process.env.DATA_DIR || path.dirname(cfg.dbFile), 'sauvegardes');
const NOM = /^\d{4}-\d{2}-\d{2}_\d{9}$/;
let enCours = null, derniereErreur = null;

const empreinte = (f) => new Promise((ok, ko) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(f).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', ko);
});
/** Copie à chaud d'une base, puis vérification de la copie. */
async function copierBase(conn, cible) {
  await conn.backup(cible);
  // la copie hérite du mode WAL : ramenée à un fichier unique, autonome, avant d'être vérifiée
  const v = new Database(cible);
  let integrite;
  try { v.pragma('journal_mode = DELETE'); integrite = v.pragma('integrity_check', { simple: true }); } finally { v.close(); }
  return { fichier: path.basename(cible), taille: fs.statSync(cible).size, sha256: await empreinte(cible), integrite };
}
/** Copie des pièces d'un espace absentes de la réserve (copie incrémentale). */
function copierFichiers(source, cible) {
  if (!source || !fs.existsSync(source)) return { total: 0, copies: 0 };
  fs.mkdirSync(cible, { recursive: true });
  let total = 0, copies = 0;
  for (const n of fs.readdirSync(source)) {
    const s = path.join(source, n);
    if (!fs.statSync(s).isFile()) continue;
    total++;
    const c = path.join(cible, n);
    if (!fs.existsSync(c)) { fs.copyFileSync(s, c); copies++; }
  }
  return { total, copies };
}
/** Sauvegardes présentes, les plus récentes d'abord, avec leur manifeste. */
function liste() {
  const d = dossier();
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((n) => NOM.test(n)).sort().reverse().map((n) => {
    try { return JSON.parse(fs.readFileSync(path.join(d, n, 'manifeste.json'), 'utf8')); } catch (e) { return { nom: n, statut: 'incomplete' }; }
  });
}
/** Une sauvegarde complète ; une seule à la fois. */
function sauvegarder(declencheur = 'automatique') {
  if (enCours) return enCours;
  enCours = (async () => {
    const debut = Date.now(), d = new Date(), p = (x) => String(x).padStart(2, '0');
    const nom = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}${String(d.getUTCMilliseconds()).padStart(3, '0')}`;
    const racine = dossier(), ici = path.join(racine, nom);
    fs.mkdirSync(ici, { recursive: true });
    const E = require('./espaces'), { ouvrirBase } = require('./db');
    const bases = [], fichiers = {};
    for (const e of E.registre().prepare('SELECT slug, fichier, fichiers FROM espaces').all()) {
      if (e.fichier === ':memory:') continue;
      // source et pieces : où remettre la base et les pièces à la restauration
      bases.push({ espace: e.slug, source: e.fichier, pieces: e.fichiers, ...(await copierBase(ouvrirBase(e.fichier), path.join(ici, e.slug + '.db'))) });
      fichiers[e.slug] = copierFichiers(e.fichiers, path.join(racine, 'fichiers', e.slug));
    }
    if (E.registre().name !== ':memory:') bases.push({ espace: null, source: E.registre().name, ...(await copierBase(E.registre(), path.join(ici, 'plateforme.db'))) });
    const m = { nom, date: d.toISOString(), declencheur, duree: Date.now() - debut, bases, fichiers,
      statut: bases.every((b) => b.integrite === 'ok') ? 'ok' : 'anomalie' };
    fs.writeFileSync(path.join(ici, 'manifeste.json'), JSON.stringify(m, null, 1));
    // rotation : les plus anciennes au-delà du nombre conservé
    const toutes = fs.readdirSync(racine).filter((n) => NOM.test(n)).sort();
    for (const vieille of toutes.slice(0, Math.max(0, toutes.length - conserver()))) fs.rmSync(path.join(racine, vieille), { recursive: true, force: true });
    derniereErreur = null;
    console.log(`Sauvegarde ${nom} : ${bases.length} base(s), ${m.statut}, ${m.duree} ms`);
    return m;
  })().catch((e) => { derniereErreur = { date: new Date().toISOString(), message: e.message }; console.error('Sauvegarde', e); throw e; })
    .finally(() => { enCours = null; });
  return enCours;
}
/** État pour la console et les paramètres. */
function etat() {
  const l = liste();
  return { actif: heures() > 0, intervalleHeures: heures(), conserver: conserver(), dossier: dossier(), enCours: !!enCours, derniereErreur,
    derniere: l[0] || null, sauvegardes: l.map((x) => ({ nom: x.nom, date: x.date, statut: x.statut, declencheur: x.declencheur, bases: (x.bases || []).length,
      taille: (x.bases || []).reduce((t, b) => t + (b.taille || 0), 0) })) };
}
/** Planification : vérifie toutes les heures si la dernière sauvegarde a plus de SAUVEGARDE_HEURES heures. */
function demarrer() {
  if (!heures() || cfg.dbFile === ':memory:') return;
  const verifier = () => {
    const d = liste()[0], age = d && d.date ? Date.now() - Date.parse(d.date) : Infinity;
    if (age >= heures() * 3600000) sauvegarder().catch(() => {});
  };
  setTimeout(verifier, 2 * 60000).unref();
  setInterval(verifier, 3600000).unref();
}

module.exports = { sauvegarder, etat, liste, demarrer, dossier };
