/* Image de la page de garde du dossier, propre à chaque achat, montée sous /api/procedures/:pid/illustration :
   - GET  /recherche?q= : photos libres de droits (Wikimedia Commons : domaine public, CC0, CC BY) ; sans q, des mots-clés
                          en anglais sont tirés de l'objet par l'IA (à défaut, l'objet lui-même)
   - POST /commons      : retient une de ces photos ({ titre }) : le serveur la télécharge lui-même, depuis Commons seulement
   - POST /televerser   : image de l'acheteur (JPEG ou PNG, corps brut)
   - DELETE /           : retire l'image (le dessin du thème reprend la place)
   L'image est un fichier de la procédure (pièce « illustration ») lu par ceux qui voient le dossier ; cdc.illustrationImage
   en garde l'identifiant et le crédit. Réservé au rédacteur du dossier, avant publication. */
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { db, auditAppend } = require('../db');
const { needPerm, whoLabel } = require('../auth');
const { diskPath, lireFichier, corpsBrut } = require('./files');
const IA = require('../ia');

const r = express.Router({ mergeParams: true });
r.use(needPerm('cdc.edit'));
const err = (res, status, code, error) => res.status(status).json({ error, code });
const limite = rateLimit({ windowMs: 3600000, limit: 60, keyGenerator: (req) => 'u:' + req.user.id, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Trop de recherches d’images : réessayez dans une heure.', code: 'TOO_MANY' } });
const UA = { 'User-Agent': 'MarchePlus/1.0 (illustrations de dossiers d’appel d’offres)' };
const API = 'https://commons.wikimedia.org/w/api.php';
const MAX = 5 * 1024 * 1024;

const licence = (m) => String(((m || {}).LicenseShortName || {}).value || '');
const libre = (l) => /^(CC0|Public domain|PD)/i.test(l) || (/^CC[ -]BY[ -]\d/i.test(l) && !/SA|ND|NC/i.test(l));
const texte = (m, k) => String(((m || {})[k] || {}).value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const fiche = (p) => {
  const i = (p.imageinfo || [])[0] || {}, m = i.extmetadata || {};
  return { titre: p.title, vignette: i.thumburl, w: i.width, h: i.height, mime: i.mime, licence: licence(m), auteur: texte(m, 'Artist').slice(0, 80), page: i.descriptionurl };
};
const utilisable = (c) => c.vignette && /^image\/jpeg$/.test(c.mime) && c.w >= 1000 && c.w / c.h >= 1.2 && c.w / c.h <= 2.2 && libre(c.licence);

async function chercher(q) {
  const u = API + '?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=24&gsrsearch=' + encodeURIComponent(q + ' filetype:bitmap')
    + '&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1200';
  const j = await (await fetch(u, { headers: UA, signal: AbortSignal.timeout(15000) })).json();
  return Object.values((j.query || {}).pages || {}).map(fiche).filter(utilisable);
}
const credit = (c) => `${c.auteur || 'auteur inconnu'} — ${c.licence} — Wikimedia Commons`.slice(0, 200);

r.get('/recherche', limite, async (req, res) => {
  let requetes = [String(req.query.q || '').trim().slice(0, 100)].filter(Boolean), traduit = false;
  if (!requetes.length) {
    const objet = String((req.store.get('cdc') || {}).objet || '').trim();
    if (!objet) return err(res, 422, 'CDC_EMPTY', 'Renseignez d’abord l’objet du marché.');
    try { if (IA.actif()) { requetes = (await IA.requetesImage(objet)).requetes; traduit = requetes.length > 0; } } catch (e) { /* sans IA : l'objet lui-même */ }
    if (!requetes.length) requetes = [objet.slice(0, 100)];
  }
  try {
    const vus = new Set(), liste = [];
    for (const q of requetes) for (const c of await chercher(q)) if (!vus.has(c.titre)) { vus.add(c.titre); liste.push(c); }
    res.json({ requetes, traduit, resultats: liste.slice(0, 18).map((c) => ({ titre: c.titre, vignette: c.vignette, auteur: c.auteur, licence: c.licence })) });
  } catch (e) { err(res, 502, 'IMAGES_UNAVAILABLE', 'La banque de photos ne répond pas : réessayez, ou importez votre propre image.'); }
});

/** Enregistre l'image de la procédure (remplace la précédente) et la déclare dans le cahier des charges. */
function retirerAnciennes(pid) {
  for (const f of db.prepare("SELECT id FROM files WHERE procedure_id=? AND doc_id='illustration'").all(pid)) {
    try { fs.unlinkSync(diskPath(f.id)); } catch (e) { /* déjà absent */ }
    db.prepare('DELETE FROM files WHERE id=?').run(f.id);
  }
}
function poser(req, octets, mime, nom, creditTexte) {
  const cdc = req.store.get('cdc') || {};
  const id = crypto.randomUUID(), sha = crypto.createHash('sha256').update(octets).digest('hex');
  fs.writeFileSync(diskPath(id), octets, { mode: 0o600 });
  db.transaction(() => {
    retirerAnciennes(req.pid);
    db.prepare('INSERT INTO files(id,owner,doc_id,name,mime,size,sha256,procedure_id) VALUES(?,?,?,?,?,?,?,?)').run(id, req.user.id, 'illustration', nom, mime, octets.length, sha, req.pid);
    req.store.set('cdc', { ...cdc, illustrationImage: { fichier: id, credit: creditTexte } }, req.user.id);
    auditAppend(req.user.id, whoLabel(req.user), 'Image de la page de garde : ' + nom, req.pid);
  })();
  require('../db').bumpRev();
  return id;
}
const avantPublication = (req, res, next) => ((req.store.get('cdc') || {}).cdcPublie ? err(res, 409, 'CDC_PUBLISHED', 'Le dossier est publié : son illustration ne change plus.') : next());

r.post('/commons', limite, avantPublication, async (req, res) => {
  const titre = String((req.body || {}).titre || '');
  if (!/^File:[^|<>]{3,200}$/.test(titre)) return err(res, 422, 'TITLE_INVALID', 'Photo invalide.');
  try {
    const u = API + '?action=query&format=json&titles=' + encodeURIComponent(titre) + '&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1200';
    const j = await (await fetch(u, { headers: UA, signal: AbortSignal.timeout(15000) })).json();
    const c = fiche(Object.values((j.query || {}).pages || {})[0] || {});
    if (!utilisable(c)) return err(res, 422, 'IMAGE_REFUSED', 'Cette photo n’est pas utilisable (licence ou format).');
    const url = new URL(c.vignette); // téléchargement limité aux serveurs de fichiers de Wikimedia
    if (url.protocol !== 'https:' || !/^(upload|thumb)\.wikimedia\.org$/.test(url.hostname)) return err(res, 422, 'IMAGE_REFUSED', 'Source de photo non admise.');
    const rep = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
    const octets = Buffer.from(await rep.arrayBuffer());
    if (!rep.ok || octets.length > MAX || octets[0] !== 0xff || octets[1] !== 0xd8) return err(res, 422, 'IMAGE_REFUSED', 'Photo illisible ou trop lourde.');
    const id = poser(req, octets, 'image/jpeg', titre.replace(/^File:/, '').slice(0, 120), credit(c));
    res.status(201).json({ illustrationImage: { fichier: id, credit: credit(c) } });
  } catch (e) { err(res, 502, 'IMAGES_UNAVAILABLE', 'La banque de photos ne répond pas : réessayez.'); }
});

r.post('/televerser', limite, avantPublication, corpsBrut, (req, res) => {
  const fx = lireFichier(req, 'illustration');
  if (fx.erreur) return err(res, fx.status, 'FILE_INVALID', fx.erreur);
  if (!/^image\/(jpeg|png)$/.test(fx.mime)) return err(res, 415, 'FILE_TYPE', 'Image JPEG ou PNG attendue.');
  if (fx.body.length > MAX) return err(res, 413, 'FILE_TOO_LARGE', 'Image trop lourde (5 Mo au plus).');
  const c = 'Image fournie par l’acheteur';
  const id = poser(req, fx.body, fx.mime, fx.name, c);
  res.status(201).json({ illustrationImage: { fichier: id, credit: c } });
});

r.delete('/', avantPublication, (req, res) => {
  const cdc = { ...(req.store.get('cdc') || {}) };
  db.transaction(() => {
    retirerAnciennes(req.pid);
    delete cdc.illustrationImage;
    req.store.set('cdc', cdc, req.user.id);
    auditAppend(req.user.id, whoLabel(req.user), 'Image de la page de garde retirée', req.pid);
  })();
  require('../db').bumpRev();
  res.json({ ok: true });
});

module.exports = r;
