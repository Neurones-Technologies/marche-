const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { db, auditAppend, bumpRev } = require('../db');
const { requireAuth, needPerm, whoLabel } = require('../auth');
const cfg = require('../config');

fs.mkdirSync(cfg.filesDir, { recursive: true });
/* Deux routeurs : `proc`, monté sous /api/procedures/:pid/files (dépôt et brouillon de la procédure req.pid),
   et `global`, monté sous /api/files (téléchargement d'une pièce par son identifiant). */
const r = express.Router({ mergeParams: true });
const g = express.Router();
g.use(requireAuth);

const MAX = cfg.maxFileMb * 1024 * 1024;
// Types admis, vérifiés sur les premiers octets (pas seulement sur l'extension)
const TYPES = {
  pdf: { mime: 'application/pdf', magic: (b) => b.slice(0, 4).toString() === '%PDF' },
  png: { mime: 'image/png', magic: (b) => b.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
  jpg: { mime: 'image/jpeg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  jpeg: { mime: 'image/jpeg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: (b) => b[0] === 0x50 && b[1] === 0x4b },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', magic: (b) => b[0] === 0x50 && b[1] === 0x4b },
};
const pub = (f) => ({ id: f.id, doc: f.doc_id, name: f.name, size: f.size, sha256: f.sha256, t: f.created_at });
const diskPath = (id) => path.join(cfg.filesDir, id);

/**
 * Lit un fichier téléversé (corps brut, nom dans x-filename, pièce visée dans ?doc=) et vérifie son format sur son
 * contenu. Retourne { erreur, status } ou { doc, name, mime, body, sha }. Partagé avec les pièces de référencement.
 */
function lireFichier(req) {
  const doc = String(req.query.doc || '');
  let name = '';
  try { name = decodeURIComponent(String(req.headers['x-filename'] || '')); } catch (e) { /* nom invalide */ }
  name = path.basename(name).replace(/[^\w.\- ()àâçéèêëîïôûùüÿ]/gi, '_').slice(0, 120);
  const body = req.body;
  if (!/^[\w-]{1,40}$/.test(doc)) return { status: 422, erreur: 'Pièce visée invalide.' };
  if (!Buffer.isBuffer(body) || !body.length) return { status: 422, erreur: 'Fichier vide.' };
  const t = TYPES[(name.split('.').pop() || '').toLowerCase()];
  if (!t || !t.magic(body)) return { status: 415, erreur: 'Format non admis (PDF, PNG, JPG, DOCX, XLSX) ou fichier altéré.' };
  return { doc, name, mime: t.mime, body, sha: crypto.createHash('sha256').update(body).digest('hex') };
}
const corpsBrut = express.raw({ type: () => true, limit: MAX });

/** Dépôt d'une pièce (soumissionnaire) pour une offre de la procédure req.pid. */
r.post('/', needPerm('portail.use'), corpsBrut, (req, res) => {
  const fx = lireFichier(req);
  if (fx.erreur) return res.status(fx.status).json({ error: fx.erreur });
  const { doc, name, body, sha } = fx, t = { mime: fx.mime };
  const pendingCount = db.prepare('SELECT COUNT(*) c FROM files WHERE owner=? AND offer_id IS NULL').get(req.user.id).c;
  const old = db.prepare('SELECT id FROM files WHERE owner=? AND procedure_id=? AND doc_id=? AND offer_id IS NULL').all(req.user.id, req.pid, doc);
  if (!old.length && pendingCount >= 40) return res.status(422).json({ error: 'Trop de pièces en attente.' });
  const id = crypto.randomUUID();
  fs.writeFileSync(diskPath(id), body, { mode: 0o600 });
  db.transaction(() => {
    old.forEach((o) => { try { fs.unlinkSync(diskPath(o.id)); } catch (e) { /* déjà absent */ } db.prepare('DELETE FROM files WHERE id=?').run(o.id); });
    db.prepare('INSERT INTO files(id,owner,doc_id,name,mime,size,sha256,procedure_id) VALUES(?,?,?,?,?,?,?,?)').run(id, req.user.id, doc, name, t.mime, body.length, sha, req.pid);
  })();
  res.status(201).json(pub({ id, doc_id: doc, name, size: body.length, sha256: sha, created_at: new Date().toISOString() }));
});

/** Mes pièces en attente (brouillon de dépôt) */
r.get('/mine', needPerm('portail.use'), (req, res) =>
  res.json(db.prepare('SELECT * FROM files WHERE owner=? AND procedure_id=? AND offer_id IS NULL ORDER BY created_at').all(req.user.id, req.pid).map(pub)));

r.delete('/:id', needPerm('portail.use'), (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id=? AND owner=? AND procedure_id=? AND offer_id IS NULL').get(req.params.id, req.user.id, req.pid);
  if (!f) return res.status(404).json({ error: 'Pièce introuvable ou déjà déposée.' });
  try { fs.unlinkSync(diskPath(f.id)); } catch (e) { /* déjà absent */ }
  db.prepare('DELETE FROM files WHERE id=?').run(f.id);
  res.json({ ok: true });
});

/** Téléchargement : propriétaire (brouillon) ou lecteur des offres (pièces déposées) */
g.get('/:id', (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id=?').get(req.params.id);
  // pièce de référencement : son déposant, les acheteurs qui référencent, et les lecteurs des offres (elle tient lieu
  // de pièce du dossier de candidature lors d'un dépôt)
  const ok = f && (f.partenaire_id != null
    ? (f.owner === req.user.id || req.can('partenaires.manage') || req.can('offres.read'))
    : ((f.offer_id == null && f.owner === req.user.id) || (f.offer_id != null && (req.can('offres.read') || f.owner === req.user.id))));
  if (!ok) return res.status(404).json({ error: 'Pièce introuvable.' });
  if (f.partenaire_id != null && f.owner !== req.user.id) auditAppend(req.user.id, whoLabel(req.user), `Pièce de référencement consultée — ${f.name} (partenaire ${f.partenaire_id})`);
  else if (f.offer_id != null) auditAppend(req.user.id, whoLabel(req.user), `Pièce consultée — ${f.name} (offre ${f.offer_id})`, f.procedure_id);
  res.set({ 'Content-Type': f.mime, 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`, 'Cache-Control': 'private, no-store' });
  res.sendFile(path.resolve(diskPath(f.id)));
});

module.exports = { proc: r, global: g, lireFichier, corpsBrut, diskPath };
