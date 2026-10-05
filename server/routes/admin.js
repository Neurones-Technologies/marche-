/* Routes de l'instance, hors procédure : vérification de la chaîne d'audit, réinitialisation de la démonstration. */
const express = require('express');
const { auditVerify, auditJournal, proceduresAll, resetDemo } = require('../db');
const { requireAuth, needPerm, whoLabel } = require('../auth');
const cfg = require('../config');

const r = express.Router();
r.use(requireAuth);

r.get('/audit/verify', needPerm('audit.read'), (req, res) => res.json(auditVerify()));

/* Journal de l'instance (menu « Audit ») : chaque entrée avec sa date, son auteur, son action, la référence de la
   procédure concernée et l'adresse IP de l'auteur. */
r.get('/audit', needPerm('audit.read'), (req, res) => {
  const refs = {}; proceduresAll().forEach((p) => { refs[p.id] = p.ref; });
  res.json({ entrees: auditJournal().map((e) => ({ ...e, procedure: e.pid ? (refs[e.pid] || e.pid) : null })), verification: auditVerify() });
});

r.post('/admin/reset', needPerm('params.edit', 'roles.edit'), (req, res) => {
  if (!require('../espaces').reinitialisable()) return res.status(403).json({ error: 'Réinitialisation désactivée dans cet espace.' });
  resetDemo(req.user.id, whoLabel(req.user));
  res.json({ ok: true });
});

module.exports = r;
