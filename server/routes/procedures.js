/* Procédures : liste, création, archivage. Les routes d'une procédure (état, offres, audit, pièces) sont
   montées sous /api/procedures/:pid, après vérification que la procédure existe et que l'utilisateur la voit. */
const express = require('express');
const { db, store, proceduresAll, procedureGet, procedureCreate, auditAppend } = require('../db');
const { requireAuth, needPerm, whoLabel } = require('../auth');
const P = require('../../public/js/profils.js');

const r = express.Router();
r.use(requireAuth);

/** Un compte sans accès aux offres (soumissionnaire) ne voit que les procédures publiées et non archivées. */
const voitTout = (req) => req.can('offres.read') || req.can('cdc.edit');
const visible = (req, p) => voitTout(req) || (p.publie && !p.archive);

r.get('/', (req, res) => res.json({ procedures: proceduresAll().filter((p) => visible(req, p)) }));

r.post('/', needPerm('cdc.edit'), (req, res) => {
  const d = req.body || {};
  const ref = String(d.ref || '').trim(), objet = String(d.objet || '').trim();
  if (!ref || ref.length > 40) return res.status(422).json({ error: 'La référence est obligatoire (40 caractères au plus).', code: 'REFERENCE_INVALID' });
  if (!objet || objet.length > 500) return res.status(422).json({ error: 'L’objet est obligatoire (500 caractères au plus).', code: 'OBJECT_INVALID' });
  if (d.profil != null && !P.existe(d.profil)) return res.status(422).json({ error: 'Profil réglementaire inconnu.', code: 'PROFILE_UNKNOWN' });
  if (proceduresAll().some((p) => String(p.ref).toLowerCase() === ref.toLowerCase()))
    return res.status(409).json({ error: `La référence ${ref} est déjà utilisée par une autre procédure.`, code: 'REFERENCE_TAKEN' });
  let pid;
  db.transaction(() => {
    pid = procedureCreate({ ref, objet, profil: d.profil }, req.user.id);
    auditAppend(req.user.id, whoLabel(req.user), `Procédure créée — ${ref} : ${objet}`, pid);
  })();
  res.status(201).json({ id: pid });
});

r.patch('/:pid', needPerm('params.edit'), (req, res) => {
  const p = procedureGet(req.params.pid);
  if (!p) return res.status(404).json({ error: 'Procédure introuvable.' });
  const archive = (req.body || {}).archive;
  if (typeof archive !== 'boolean') return res.status(422).json({ error: 'Champ « archive » (oui ou non) attendu.' });
  if (archive !== !!p.archived) {
    db.transaction(() => {
      db.prepare('UPDATE procedures SET archived=? WHERE id=?').run(archive ? 1 : 0, p.id);
      const ref = (store(p.id).get('cdc') || {}).ref;
      auditAppend(req.user.id, whoLabel(req.user), `Procédure ${archive ? 'archivée' : 'désarchivée'} — ${ref}`, p.id);
    })();
  }
  res.json({ ok: true });
});

/* Routes d'une procédure. Une procédure archivée se consulte mais ne se modifie plus. */
r.use('/:pid', (req, res, next) => {
  const p = proceduresAll().find((x) => x.id === req.params.pid);
  if (!p || !visible(req, p)) return res.status(404).json({ error: 'Procédure introuvable.' });
  req.pid = p.id;
  req.archived = p.archive;
  req.store = store(p.id);
  const lecture = req.method === 'GET' || req.path === '/audit' || (req.method === 'PATCH' && req.path === '/state');
  if (p.archive && !lecture) return res.status(409).json({ error: 'Procédure archivée : elle ne peut plus être modifiée.', code: 'PROCEDURE_ARCHIVED' });
  next();
});
r.use('/:pid/files', require('./files').proc);
r.use('/:pid', require('./state'));

module.exports = r;
