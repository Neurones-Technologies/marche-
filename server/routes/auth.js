const express = require('express');
const rateLimit = require('express-rate-limit');
const { db, auditAppend } = require('../db');
const { sign, setCookie, clearCookie, requireAuth, bcrypt, whoLabel, needPerm, roleDef } = require('../auth');
const { slug } = require('../db');
const cfg = require('../config');

const r = express.Router();
const limiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Trop de tentatives. Réessayez dans une minute.' } });

const pub = (u) => ({ id: u.id, nom: u.nom, email: u.email, role: u.role, roleLab: u.roleLab });

r.post('/login', limiter, (req, res) => {
  const { email, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').get(String(email || '').trim());
  // même coût et même message, que le compte existe ou non
  const ok = bcrypt.compareSync(String(password || ''), u ? u.pass_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali');
  if (!u || !u.active || !ok) return res.status(401).json({ error: 'Identifiants incorrects.' });
  db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run(u.id);
  const user = { ...u, roleLab: roleDef(u.role).lab };
  setCookie(res, sign(u));
  auditAppend(u.id, whoLabel(user), 'Connexion');
  res.json({ user: pub(user) });
});

r.get('/demo', (req, res) => {
  const show = !cfg.prod || process.env.SHOW_DEMO_ACCOUNTS === '1';
  if (!show || !cfg.seedDemo) return res.json({ accounts: [] });
  const rows = db.prepare('SELECT nom,email,role FROM users WHERE active=1 ORDER BY rowid').all()
    .map((u) => ({ ...u, roleLab: roleDef(u.role).lab }));
  res.json({ accounts: rows, hint: cfg.seedPassword });
});

r.post('/logout', (req, res) => { clearCookie(res); res.json({ ok: true }); });

r.get('/me', requireAuth, (req, res) => res.json({ user: pub(req.user), perms: req.user.perms }));

r.post('/password', requireAuth, limiter, (req, res) => {
  const { current, next } = req.body || {};
  const u = db.prepare('SELECT pass_hash FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(String(current || ''), u.pass_hash)) return res.status(403).json({ error: 'Mot de passe actuel incorrect.' });
  const n = String(next || '');
  if (n.length < 10 || !/[a-z]/.test(n) || !/[A-Z]/.test(n) || !/\d/.test(n)) return res.status(422).json({ error: '10 caractères minimum, avec majuscule, minuscule et chiffre.' });
  db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(bcrypt.hashSync(n, 10), req.user.id);
  auditAppend(req.user.id, whoLabel(req.user), 'Mot de passe modifié');
  res.json({ ok: true });
});

/* Gestion des comptes (administrateur : roles.edit) */
r.get('/users', requireAuth, needPerm('roles.edit'), (req, res) =>
  res.json(db.prepare('SELECT id,nom,email,role,active,last_login FROM users ORDER BY rowid').all()));

r.post('/users', requireAuth, needPerm('roles.edit'), (req, res) => {
  const { nom, email, role, password } = req.body || {};
  const roles = require('../db').kvGet('roles').value;
  if (!nom || !roles[role]) return res.status(422).json({ error: 'Nom et rôle valides requis.' });
  const em = String(email || (slug(nom) + '@' + 'bal.ci')).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(em)) return res.status(422).json({ error: 'Courriel invalide.' });
  const pw = String(password || '');
  if (pw.length < 10) return res.status(422).json({ error: 'Mot de passe initial : 10 caractères minimum.' });
  const id = 'u' + Date.now().toString(36);
  try { db.prepare('INSERT INTO users(id,nom,email,role,pass_hash) VALUES(?,?,?,?,?)').run(id, nom.trim(), em, role, bcrypt.hashSync(pw, 10)); }
  catch (e) { return res.status(409).json({ error: 'Ce courriel existe déjà.' }); }
  require('../db').bumpRev();
  auditAppend(req.user.id, whoLabel(req.user), `Compte créé — ${nom.trim()} (${roles[role].lab})`);
  res.status(201).json({ id, nom: nom.trim(), email: em, role });
});

r.patch('/users/:id', requireAuth, needPerm('roles.edit'), (req, res) => {
  const { active, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  if (u.id === req.user.id && active === false) return res.status(422).json({ error: 'Vous ne pouvez pas désactiver votre propre compte.' });
  if (typeof active === 'boolean') db.prepare('UPDATE users SET active=? WHERE id=?').run(active ? 1 : 0, u.id);
  if (password) {
    if (String(password).length < 10) return res.status(422).json({ error: '10 caractères minimum.' });
    db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(bcrypt.hashSync(String(password), 10), u.id);
  }
  require('../db').bumpRev();
  auditAppend(req.user.id, whoLabel(req.user), `Compte modifié — ${u.nom}${typeof active === 'boolean' ? (active ? ' (activé)' : ' (désactivé)') : ''}${password ? ' (mot de passe réinitialisé)' : ''}`);
  res.json({ ok: true });
});

module.exports = r;
