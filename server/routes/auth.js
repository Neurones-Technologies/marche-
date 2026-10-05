const express = require('express');
const rateLimit = require('express-rate-limit');
const { db, auditAppend, jetonUtiliser } = require('../db');
const { sign, setCookie, clearCookie, requireAuth, bcrypt, whoLabel, needPerm, roleDef } = require('../auth');
const { slug } = require('../db');
const cfg = require('../config');

const r = express.Router();
const limiter = rateLimit({ windowMs: 60_000, limit: Number(process.env.LOGIN_RATE_LIMIT) || 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Trop de tentatives. Réessayez dans une minute.' } });

const pub = (u) => ({ id: u.id, nom: u.nom, email: u.email, role: u.role, roleLab: u.roleLab });

r.post('/login', limiter, (req, res) => {
  const { email, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').get(String(email || '').trim());
  // même coût et même message, que le compte existe ou non
  const ok = bcrypt.compareSync(String(password || ''), u ? u.pass_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali');
  // compte créé par inscription en ligne, courriel pas encore vérifié : on le dit, mais seulement à qui a le bon mot de passe
  if (u && ok && !u.active && u.a_verifier) return res.status(403).json({ error: 'Adresse courriel non vérifiée : ouvrez le lien reçu par courriel pour activer votre compte.', code: 'EMAIL_NOT_VERIFIED' });
  if (!u || !u.active || !ok) return res.status(401).json({ error: 'Identifiants incorrects.' });
  db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run(u.id);
  const user = { ...u, roleLab: roleDef(u.role).lab };
  setCookie(res, sign(u));
  auditAppend(u.id, whoLabel(user), 'Connexion');
  res.json({ user: pub(user) });
});

/** Comptes de démonstration, sur la page de connexion : jamais dans l'espace d'une entreprise (ses comptes sont réels). */
r.get('/demo', (req, res) => {
  const show = !cfg.prod || process.env.SHOW_DEMO_ACCOUNTS === '1';
  const E = require('../espaces');
  const espaceDemo = !E.actif() || require('../contexte').espace() === E.INITIAL();
  if (!show || !cfg.seedDemo || !espaceDemo) return res.json({ accounts: [] });
  const rows = db.prepare('SELECT nom,email,role FROM users WHERE active=1 ORDER BY rowid').all()
    .map((u) => ({ ...u, roleLab: roleDef(u.role).lab }));
  res.json({ accounts: rows, hint: cfg.seedPassword });
});

r.post('/logout', (req, res) => { clearCookie(res); res.json({ ok: true }); });

/** Connexion par jeton à usage unique (arrivée dans un espace qui vient d'être créé), puis l'accueil. */
r.get('/jeton', (req, res) => {
  const uid = jetonUtiliser(req.query.j, 'connexion');
  const u = uid && db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(uid);
  if (!u) return res.redirect('/');
  setCookie(res, sign(u));
  db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run(u.id);
  auditAppend(u.id, whoLabel({ ...u, roleLab: roleDef(u.role).lab }), 'Connexion');
  res.redirect('/tableau-de-bord?bienvenue=1');
});

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

/* Modification d'un compte : nom, courriel, rôle, accès, mot de passe. Tout est vérifié avant d'écrire quoi que ce
   soit, puis enregistré d'un bloc. */
r.patch('/users/:id', requireAuth, needPerm('roles.edit'), (req, res) => {
  const { active, password, role, nom, email } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  if (u.id === req.user.id && active === false) return res.status(422).json({ error: 'Vous ne pouvez pas désactiver votre propre compte.' });
  const roles = require('../db').kvGet('roles').value;
  if (role !== undefined) {
    if (!roles[role]) return res.status(422).json({ error: 'Rôle inconnu.' });
    if (u.id === req.user.id && role !== u.role) return res.status(422).json({ error: 'Vous ne pouvez pas modifier votre propre rôle.' });
  }
  const nouveauNom = nom !== undefined ? String(nom).trim() : u.nom;
  if (!nouveauNom || nouveauNom.length > 120) return res.status(422).json({ error: 'Nom requis (120 caractères au plus).' });
  const nouveauMail = email !== undefined ? String(email).trim().toLowerCase() : u.email;
  if (!/^[^@s]+@[^@s]+.[^@s]+$/.test(nouveauMail)) return res.status(422).json({ error: 'Courriel invalide.' });
  if (nouveauMail !== u.email && db.prepare('SELECT 1 FROM users WHERE email=? AND id<>?').get(nouveauMail, u.id))
    return res.status(409).json({ error: 'Ce courriel est déjà utilisé par un autre compte.' });
  if (password && String(password).length < 10) return res.status(422).json({ error: '10 caractères minimum.' });

  const changes = [];
  db.transaction(() => {
    if (nouveauNom !== u.nom) { db.prepare('UPDATE users SET nom=? WHERE id=?').run(nouveauNom, u.id); changes.push(`nom : ${u.nom} → ${nouveauNom}`); }
    if (nouveauMail !== u.email) { db.prepare('UPDATE users SET email=? WHERE id=?').run(nouveauMail, u.id); changes.push(`courriel : ${u.email} → ${nouveauMail}`); }
    if (role !== undefined && role !== u.role) { db.prepare('UPDATE users SET role=? WHERE id=?').run(role, u.id); changes.push(`rôle : ${(roles[u.role] || {}).lab || u.role} → ${roles[role].lab}`); }
    if (typeof active === 'boolean' && (active ? 1 : 0) !== u.active) { db.prepare('UPDATE users SET active=? WHERE id=?').run(active ? 1 : 0, u.id); changes.push(active ? 'activé' : 'désactivé'); }
    if (password) { db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(bcrypt.hashSync(String(password), 10), u.id); changes.push('mot de passe réinitialisé'); }
  })();
  if (changes.length) {
    require('../db').bumpRev();
    auditAppend(req.user.id, whoLabel(req.user), `Compte modifié — ${u.nom} (${changes.join(' ; ')})`);
  }
  res.json({ ok: true, id: u.id, nom: nouveauNom, email: nouveauMail, role: role !== undefined ? role : u.role });
});

module.exports = r;
