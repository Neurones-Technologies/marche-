/* Sauvegardes : copie cohérente et vérifiée des bases (espace et plateforme), empreintes au manifeste, pièces copiées
   une seule fois, rotation. Sur une base en fichier, dans un dossier temporaire (pas le client de test en mémoire). */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-sauv-'));
process.env.DB_FILE = path.join(T, 'donnees', 'marcheplus.db');
process.env.SAUVEGARDE_DOSSIER = path.join(T, 'sauvegardes');
process.env.SAUVEGARDE_CONSERVER = '2';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const cfg = require('../config');
require('../db');
const S = require('../sauvegardes');

test('sauvegarde vérifiée, pièces incrémentales, rotation', async () => {
  fs.mkdirSync(cfg.filesDir, { recursive: true });
  fs.writeFileSync(path.join(cfg.filesDir, 'piece-1'), 'pdf');
  const m1 = await S.sauvegarder('test');
  assert.equal(m1.statut, 'ok');
  const base = m1.bases.find((b) => b.espace === 'demo');
  assert.equal(base.integrite, 'ok');
  const copie = path.join(S.dossier(), m1.nom, 'demo.db');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(copie)).digest('hex'), base.sha256);
  assert.ok(m1.bases.some((b) => b.fichier === 'plateforme.db'));
  assert.deepEqual(fs.readdirSync(path.join(S.dossier(), m1.nom)).sort(), ['demo.db', 'manifeste.json', 'plateforme.db']); // fichiers autonomes, sans -wal ni -shm
  assert.deepEqual(m1.fichiers.demo, { total: 1, copies: 1 });
  // la copie se relit : c'est une base complète
  const v = new Database(copie, { readonly: true });
  assert.ok(JSON.parse(v.prepare("SELECT value FROM kv WHERE key='org'").get().value).nom);
  v.close();
  fs.writeFileSync(path.join(cfg.filesDir, 'piece-2'), 'pdf');
  const m2 = await S.sauvegarder('test');
  assert.deepEqual(m2.fichiers.demo, { total: 2, copies: 1 }); // la pièce déjà copiée ne l'est pas deux fois
  await S.sauvegarder('test');
  const e = S.etat();
  assert.equal(e.sauvegardes.length, 2); // rotation : deux conservées
  assert.equal(e.derniere.statut, 'ok');
  assert.ok(!fs.existsSync(path.join(S.dossier(), m1.nom)));
});
