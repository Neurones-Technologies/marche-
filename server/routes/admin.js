/* Routes de l'instance, hors procédure : vérification de la chaîne d'audit, réinitialisation de la démonstration. */
const express = require('express');
const { auditVerify, resetDemo } = require('../db');
const { requireAuth, needPerm, whoLabel } = require('../auth');
const cfg = require('../config');

const r = express.Router();
r.use(requireAuth);

r.get('/audit/verify', needPerm('audit.read'), (req, res) => res.json(auditVerify()));

r.post('/admin/reset', needPerm('params.edit', 'roles.edit'), (req, res) => {
  if (!cfg.allowReset) return res.status(403).json({ error: 'Réinitialisation désactivée sur cette instance.' });
  resetDemo(req.user.id, whoLabel(req.user));
  res.json({ ok: true });
});

module.exports = r;
