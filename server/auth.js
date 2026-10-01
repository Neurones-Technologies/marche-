const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cfg = require('./config');
const { db, kvGet } = require('./db');

const COOKIE = 'mp_token';

function parseCookies(h) {
  const out = {};
  (h || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}

function sign(user) {
  return jwt.sign({ sub: user.id, role: user.role }, cfg.jwtSecret, { expiresIn: cfg.jwtTtl });
}

function setCookie(res, token) {
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: cfg.prod, maxAge: 8 * 3600 * 1000, path: '/' });
}

function roleDef(roleId) {
  const roles = (kvGet('roles') || { value: {} }).value;
  return roles[roleId] || { lab: roleId, perms: {} };
}

/** Middleware : charge req.user (depuis la base : rôle et statut toujours à jour). */
function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return res.status(401).json({ error: 'Authentification requise.' });
  try {
    const p = jwt.verify(token, cfg.jwtSecret);
    const u = db.prepare('SELECT id,nom,email,role,active FROM users WHERE id=?').get(p.sub);
    if (!u || !u.active) return res.status(401).json({ error: 'Compte introuvable ou désactivé.' });
    const rd = roleDef(u.role);
    req.user = { ...u, roleLab: rd.lab, perms: rd.perms || {} };
    req.can = (perm) => !!req.user.perms[perm];
    next();
  } catch (e) {
    res.status(401).json({ error: 'Session expirée.' });
  }
}

const needPerm = (...perms) => (req, res, next) =>
  perms.some((p) => req.can(p)) ? next() : res.status(403).json({ error: 'Habilitation insuffisante.', needs: perms });

const whoLabel = (u) => `${u.nom} — ${u.roleLab}`;

module.exports = { sign, setCookie, clearCookie: (res) => res.clearCookie(COOKIE, { path: '/' }), requireAuth, needPerm, whoLabel, bcrypt, roleDef };
