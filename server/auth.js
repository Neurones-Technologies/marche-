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
  return jwt.sign({ sub: user.id, role: user.role, esp: contexte.espace(), v: user.session_v || 0 }, cfg.jwtSecret, { expiresIn: cfg.jwtTtl, algorithm: 'HS256' });
}

function setCookie(res, token) {
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: cfg.prod, maxAge: 8 * 3600 * 1000, path: '/' });
}

function roleDef(roleId) {
  const roles = (kvGet('roles') || { value: {} }).value;
  return roles[roleId] || { lab: roleId, perms: {} };
}

/** État du mot de passe d'un compte : à changer (provisoire, posé par un administrateur) ou expiré (délai réglé dans les
    paramètres de l'organisation, 0 = jamais). */
function etatMotDePasse(u) {
  const jours = Number((((kvGet('org') || {}).value) || {}).mdpExpirationJours) || 0;
  const depuis = Date.parse(String(u.mdp_change_le || u.created_at || '').replace(' ', 'T') + 'Z');
  const expire = jours > 0 && !Number.isNaN(depuis) && Date.now() - depuis > jours * 86400000;
  const provisoire = !!u.mdp_a_changer;
  return { aChanger: provisoire || expire, motif: provisoire ? 'provisoire' : (expire ? 'expire' : null) };
}
/* Tant que le mot de passe est à changer, seules la lecture du compte et le changement du mot de passe sont permis. */
const CHEMINS_MDP = /^\/api\/auth\/(me|password)$/;

/** Middleware : charge req.user (depuis la base : rôle et statut toujours à jour). */
function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return res.status(401).json({ error: 'Authentification requise.' });
  try {
    const p = jwt.verify(token, cfg.jwtSecret, { algorithms: ['HS256'] });
    if ((p.esp || null) !== contexte.espace()) return res.status(401).json({ error: 'Session d’un autre espace : reconnectez-vous.' });
    const u = db.prepare('SELECT id,nom,email,role,active,session_v,mdp_a_changer,mdp_change_le,created_at FROM users WHERE id=?').get(p.sub);
    if (!u || !u.active) return res.status(401).json({ error: 'Compte introuvable ou désactivé.' });
    if ((p.v || 0) !== (u.session_v || 0)) return res.status(401).json({ error: 'Mot de passe changé : reconnectez-vous.' });
    delete u.session_v;
    const mp = etatMotDePasse(u);
    delete u.mdp_a_changer; delete u.mdp_change_le; delete u.created_at;
    const rd = roleDef(u.role);
    req.user = { ...u, roleLab: rd.lab, perms: rd.perms || {}, mdpAChanger: mp.aChanger, mdpMotif: mp.motif };
    if (mp.aChanger && !CHEMINS_MDP.test(req.originalUrl.split('?')[0]))
      return res.status(403).json({ error: mp.motif === 'expire' ? 'Votre mot de passe a expiré : choisissez-en un nouveau pour continuer.' : 'Votre mot de passe est provisoire : choisissez le vôtre pour continuer.',
        code: 'PASSWORD_CHANGE_REQUIRED', motif: mp.motif });
    req.can = (perm) => !!req.user.perms[perm];
    next();
  } catch (e) {
    res.status(401).json({ error: 'Session expirée.' });
  }
}

const needPerm = (...perms) => (req, res, next) =>
  perms.some((p) => req.can(p)) ? next() : res.status(403).json({ error: 'Habilitation insuffisante.', needs: perms });

const whoLabel = (u) => `${u.nom} — ${u.roleLab}`;

module.exports = { etatMotDePasse, sign, setCookie, clearCookie: (res) => res.clearCookie(COOKIE, { path: '/' }), requireAuth, needPerm, whoLabel, bcrypt, roleDef };
