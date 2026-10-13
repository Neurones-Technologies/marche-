/* Image de la page de garde du dossier, propre à chaque achat, montée sous /api/procedures/:pid/illustration :
   - GET  /recherche?q= : photos libres de droits (Wikimedia Commons : domaine public, CC0, CC BY) ; sans q, des mots-clés
                          en anglais sont tirés de l'objet par l'IA (à défaut, l'objet lui-même)
   - POST /auto         : choisit la première photo libre qui répond à l'objet, si le dossier n'a pas d'image
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
const UA = { 'User-Agent': 'MarchePlus/1.0 (illustrations de dossiers)' }; // en-tete ASCII : un caractere typographique fait refuser la requete
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
/* Sans IA : mots-clés anglais d'après quelques termes d'achat courants, puis les premiers mots de l'objet. */
const LEXIQUE = [['véhicule', 'vehicle car'], ['voiture', 'car'], ['tout-terrain', '4x4 vehicle'], ['camion', 'truck'], ['moto', 'motorcycle'], ['climatis', 'air conditioner'], ['ordinateur', 'computer'],
  ['informatique', 'computer equipment'], ['réseau', 'network cables'], ['serveur', 'server rack'], ['imprimant', 'printer'], ['mobilier', 'office furniture'], ['bureau', 'office desk'],
  ['caméra', 'security camera'], ['surveillance', 'security camera'], ['nettoyage', 'cleaning'], ['entretien', 'maintenance'], ['groupe électrogène', 'generator'], ['solaire', 'solar panels'],
  ['éclairage', 'led lighting'], ['travaux', 'construction site'], ['toiture', 'roof'], ['bâtiment', 'building'], ['peinture', 'painting wall'], ['formation', 'training room'],
  ['restauration', 'catering buffet'], ['médical', 'medical equipment'], ['fourniture', 'office supplies'], ['papier', 'paper'], ['téléphon', 'telephone'], ['ascenseur', 'elevator'],
  ['sécurité', 'security'], ['incendie', 'fire extinguisher'], ['uniforme', 'uniform'], ['vêtement', 'clothing'], ['impression', 'printing'], ['signalétique', 'signage']];
function requetesLocales(objet) {
  const o = String(objet).toLowerCase(), trouves = [...new Set(LEXIQUE.filter(([k]) => o.includes(k)).map(([, v]) => v))].slice(0, 3);
  const mots = o.replace(/[^\p{L}\p{N} -]/gu, ' ').split(/\s+/).filter((m) => m.length > 4).slice(0, 3).join(' ');
  return trouves.concat(mots ? [mots] : []).slice(0, 3);
}
const credit = (c) => `${c.auteur || 'auteur inconnu'} — ${c.licence} — Wikimedia Commons`.slice(0, 200);

r.get('/recherche', limite, async (req, res) => {
  let requetes = [String(req.query.q || '').trim().slice(0, 100)].filter(Boolean), traduit = false;
  if (!requetes.length) {
    const objet = String((req.store.get('cdc') || {}).objet || '').trim();
    if (!objet) return err(res, 422, 'CDC_EMPTY', 'Renseignez d’abord l’objet du marché.');
    try { if (IA.actif()) { requetes = (await IA.requetesImage(objet)).requetes; traduit = requetes.length > 0; } } catch (e) { /* sans IA : l'objet lui-même */ }
    if (!requetes.length) requetes = requetesLocales(objet);
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

/** Télécharge la photo c (fiche Commons déjà contrôlée) depuis les serveurs de Wikimedia et la retient pour la procédure. */
async function retenir(req, c) {
  const url = new URL(c.vignette); // téléchargement limité aux serveurs de fichiers de Wikimedia
  if (url.protocol !== 'https:' || !/^(upload|thumb)\.wikimedia\.org$/.test(url.hostname)) return null;
  const rep = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
  const octets = Buffer.from(await rep.arrayBuffer());
  if (!rep.ok || octets.length > MAX || octets[0] !== 0xff || octets[1] !== 0xd8) return null;
  return { fichier: poser(req, octets, 'image/jpeg', c.titre.replace(/^File:/, '').slice(0, 120), credit(c)), credit: credit(c) };
}

r.post('/commons', limite, avantPublication, async (req, res) => {
  const titre = String((req.body || {}).titre || '');
  if (!/^File:[^|<>]{3,200}$/.test(titre)) return err(res, 422, 'TITLE_INVALID', 'Photo invalide.');
  try {
    const u = API + '?action=query&format=json&titles=' + encodeURIComponent(titre) + '&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1200';
    const j = await (await fetch(u, { headers: UA, signal: AbortSignal.timeout(15000) })).json();
    const c = fiche(Object.values((j.query || {}).pages || {})[0] || {});
    if (!utilisable(c)) return err(res, 422, 'IMAGE_REFUSED', 'Cette photo n’est pas utilisable (licence ou format).');
    const x = await retenir(req, c);
    if (!x) return err(res, 422, 'IMAGE_REFUSED', 'Photo illisible, trop lourde ou source non admise.');
    res.status(201).json({ illustrationImage: x });
  } catch (e) { err(res, 502, 'IMAGES_UNAVAILABLE', 'La banque de photos ne répond pas : réessayez.'); }
});

/** Choix automatique : la première photo libre qui répond à l'objet (ou aux mots-clés tirés de l'objet par l'IA), sauf si le
    dossier a déjà une image. Le rédacteur la change ensuite à sa guise. */
r.post('/auto', limite, avantPublication, async (req, res) => {
  const cdc = req.store.get('cdc') || {}, objet = String(cdc.objet || '').trim();
  if (cdc.illustrationImage) return res.json({ illustrationImage: cdc.illustrationImage, deja: true });
  if (!objet) return err(res, 422, 'CDC_EMPTY', 'Renseignez d’abord l’objet du marché.');
  try {
    let requetes = [];
    try { if (IA.actif()) requetes = (await IA.requetesImage(objet)).requetes; } catch (e) { /* sans IA : l'objet lui-même */ }
    if (!requetes.length) requetes = requetesLocales(objet);
    for (const q of requetes) for (const c of await chercher(q)) {
      const x = await retenir(req, c);
      if (x) return res.status(201).json({ illustrationImage: x });
    }
    err(res, 404, 'NO_IMAGE', 'Aucune photo libre ne correspond à cet objet : choisissez-en une ou importez la vôtre.');
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
