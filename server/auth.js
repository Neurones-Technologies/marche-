const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cfg = require('./config');
const contexte = require('./contexte');
const { db, kvGet } = require('./db');

const COOKIE = 'mp_token';

function parseCookies(h) {
  const out = {};
  (h || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}

function sign(user) {
  // l'espace de l'entreprise entre dans le jeton : il ne vaut que dans cet espace (plateforme multi-entreprises)
  return jwt.sign({ sub: user.id, role: user.role, esp: contexte.espace(), v: user.session_v || 0 }, cfg.jwtSecret, { expiresIn: cfg.jwtTtl });
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
    if ((p.esp || null) !== contexte.espace()) return res.status(401).json({ error: 'Session d’un autre espace : reconnectez-vous.' });
    const u = db.prepare('SELECT id,nom,email,role,active,session_v FROM users WHERE id=?').get(p.sub);
    if (!u || !u.active) return res.status(401).json({ error: 'Compte introuvable ou désactivé.' });
    if ((p.v || 0) !== (u.session_v || 0)) return res.status(401).json({ error: 'Mot de passe changé : reconnectez-vous.' });
    delete u.session_v;
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
