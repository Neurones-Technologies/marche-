/* IA de préparation, montée sous /api/procedures/:pid/ia (voir server/ia.js) :
   - GET  /             : la fonction est-elle disponible (clé configurée) ?
   - POST /document     : proposition de cahier des charges tirée d'un document chargé (corps brut : PDF ou Word)
   - POST /idee         : proposition rédigée à partir d'une idée ({ idee })
   - GET  /taches/:id   : état d'une demande, et la proposition quand elle est prête
   Une proposition prend jusqu'à une ou deux minutes : la demande est lancée en tâche de fond (réponse 202 immédiate,
   sous le délai du proxy) et le navigateur interroge son état. Réservé au rédacteur du dossier (cdc.edit). Chaque
   proposition entre au journal d'audit de la procédure. */
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const IA = require('../ia');
const P = require('../../public/js/profils.js');
const R = require('../../public/js/regles.js');
const cfg = require('../config');
const { auditAppend, kvGet } = require('../db');
const { needPerm, whoLabel } = require('../auth');
const contexte = require('../contexte');

const r = express.Router({ mergeParams: true });
const err = (res, status, code, error) => res.status(status).json({ error, code });

r.get('/', (req, res) => res.json({ actif: IA.actif() }));

r.use(needPerm('cdc.edit'));
r.use((req, res, next) => (IA.actif() ? next() : err(res, 503, 'AI_DISABLED', 'L’IA n’est pas configurée sur ce serveur (clé ANTHROPIC_API_KEY absente).')));
// chaque demande a un coût : débit limité par compte (les interrogations d'état ne comptent pas)
const limite = rateLimit({ windowMs: 3600000, limit: Number(process.env.IA_PAR_HEURE) || 30, keyGenerator: (req) => 'u:' + req.user.id,
  standardHeaders: true, legacyHeaders: false, message: { error: 'Trop de demandes à l’IA : réessayez dans une heure.', code: 'AI_TOO_MANY' } });

/* Tâches en cours ou terminées, gardées 15 minutes en mémoire : leur auteur seul les lit. */
const TACHES = new Map();
const DUREE = 15 * 60000;
const purger = () => { const t = Date.now(); for (const [id, x] of TACHES) if (t - x.t > DUREE) TACHES.delete(id); };

/** Contexte de la proposition : organisation et profil réglementaire de la procédure. */
function ctx(req) {
  const org = (kvGet('org') || { value: {} }).value || {};
  const c = { cdc: req.store.get('cdc') || {}, org, cadre: req.store.get('cadre') };
  return { org, profil: P.profil(R.profilId(c)), cadre: R.cadre(c) };
}

/** Lance la proposition en tâche de fond ; répond 202 avec l'identifiant de la tâche. */
function lancer(req, res, source, libelle) {
  purger();
  const id = crypto.randomUUID(), uid = req.user.id, qui = whoLabel(req.user), pid = req.pid;
  const tache = { uid, pid, espace: contexte.espace(), etat: 'en_cours', t: Date.now() };
  TACHES.set(id, tache);
  // la suite s'exécute dans le contexte de la requête (base de l'espace) : le journal va à la bonne procédure
  IA.proposerCdc(source, ctx(req)).then((out) => {
    auditAppend(uid, qui, `Cahier des charges proposé par l’IA (${out.modele}) — ${libelle}`, pid);
    Object.assign(tache, { etat: 'prete', proposition: out.proposition, modele: out.modele });
  }).catch((e) => {
    if (!(e instanceof IA.ErreurIA)) console.error('IA', e);
    Object.assign(tache, { etat: 'erreur', status: e.status || 500, code: e.code || 'AI_ERROR', erreur: e instanceof IA.ErreurIA ? e.message : 'Erreur du service d’IA.' });
  });
  res.status(202).json({ tache: id });
}

r.get('/taches/:id', (req, res) => {
  const x = TACHES.get(String(req.params.id));
  if (!x || x.uid !== req.user.id || x.pid !== req.pid || x.espace !== contexte.espace()) return err(res, 404, 'TASK_UNKNOWN', 'Demande introuvable ou expirée.');
  if (x.etat === 'en_cours') return res.json({ etat: 'en_cours', depuis: Math.round((Date.now() - x.t) / 1000) });
  if (x.etat === 'erreur') return res.status(x.status).json({ etat: 'erreur', error: x.erreur, code: x.code });
  res.json({ etat: 'prete', proposition: x.proposition, modele: x.modele });
});

const corpsBrut = express.raw({ type: () => true, limit: cfg.maxFileMb * 1024 * 1024 });
r.post('/document', limite, corpsBrut, (req, res) => {
  let nom = '';
  try { nom = decodeURIComponent(String(req.headers['x-filename'] || '')); } catch (e) { /* nom illisible */ }
  nom = nom.replace(/[^\w.\- ()àâçéèêëîïôûùüÿ]/gi, '_').slice(0, 120);
  const b = req.body;
  if (!Buffer.isBuffer(b) || !b.length) return err(res, 422, 'FILE_EMPTY', 'Fichier vide.');
  const ext = (nom.split('.').pop() || '').toLowerCase();
  // type vérifié sur les premiers octets, pas seulement sur l'extension
  if (ext === 'pdf' && b.slice(0, 4).toString() === '%PDF') return lancer(req, res, { pdf: b }, `document « ${nom} »`);
  if (ext === 'docx' && b[0] === 0x50 && b[1] === 0x4b) return lancer(req, res, { word: b }, `document « ${nom} »`);
  return err(res, 415, 'FILE_TYPE', 'Format non admis : chargez un PDF ou un document Word (.docx).');
});

r.post('/idee', limite, (req, res) => {
  const idee = String((req.body || {}).idee || '').trim();
  if (idee.length < 15) return err(res, 422, 'IDEA_TOO_SHORT', 'Décrivez votre besoin en quelques phrases (15 caractères au moins).');
  if (idee.length > 4000) return err(res, 422, 'IDEA_TOO_LONG', 'Idée trop longue (4 000 caractères au plus) : chargez plutôt un document.');
  return lancer(req, res, { idee }, 'à partir d’une idée');
});

module.exports = r;
