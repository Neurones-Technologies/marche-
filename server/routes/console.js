/* Console de la plateforme (/console, à l'adresse de la plateforme seulement) : les opérateurs examinent les
   inscriptions, créent des espaces à la main, suspendent, réactivent ou suppriment un espace, et gèrent leurs
   propres comptes. Session à part (cookie mp_console), sans rapport avec les comptes des espaces.

   Premier opérateur : CONSOLE_EMAIL et CONSOLE_MOT_DE_PASSE (et CONSOLE_NOM) dans l'environnement, repris au
   démarrage s'il n'existe aucun opérateur. Hors production, sans eux : console@neuronestech.com, avec le mot de
   passe des comptes de démonstration. Chaque action entre au journal de la plateforme. */
const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const P = require('../../public/js/profils.js');
const E = require('../espaces');
const mail = require('../mail');
const cfg = require('../config');
const { bcrypt } = require('../auth');
const { auditAppend, kvGet, kvSet } = require('../db');

const r = express.Router();
const COOKIE = 'mp_console';
const err = (res, status, code, error) => res.status(status).json({ error, code });
const reg = () => E.registre();
const mdpValide = (m) => m.length >= 10 && /[a-z]/.test(m) && /[A-Z]/.test(m) && /\d/.test(m);
const MDP_REGLE = 'Mot de passe : 10 caractères minimum, avec majuscule, minuscule et chiffre.';
const courrielValide = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

/* Seule l'adresse de la plateforme répond ici. */
r.use((req, res, next) => (req.plateforme ? next() : err(res, 404, 'NOT_PLATFORM', 'Route inconnue.')));

/** Premier opérateur, d'après l'environnement (ou le compte de développement), s'il n'en existe aucun. */
let pret = false;
function premierOperateur() {
  if (pret) return; pret = true;
  if (reg().prepare('SELECT 1 FROM operateurs LIMIT 1').get()) return;
  let email = String(process.env.CONSOLE_EMAIL || '').trim().toLowerCase(), mdp = String(process.env.CONSOLE_MOT_DE_PASSE || '');
  if (!email && !cfg.prod) { email = 'console@neuronestech.com'; mdp = cfg.seedPassword; }
  if (!email || !mdp) { console.error('Console de la plateforme : définir CONSOLE_EMAIL et CONSOLE_MOT_DE_PASSE pour créer le premier opérateur.'); return; }
  reg().prepare('INSERT INTO operateurs(nom,email,pass_hash) VALUES(?,?,?)')
    .run(String(process.env.CONSOLE_NOM || 'Opérateur').trim(), email, bcrypt.hashSync(mdp, 10));
}
r.use((req, res, next) => { premierOperateur(); next(); });

function lireCookie(req) {
  const m = String(req.headers.cookie || '').match(/(?:^|;\s*)mp_console=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
/** Session d'opérateur : jeton signé, compte toujours actif. */
function operateur(req, res, next) {
  try {
    const p = jwt.verify(lireCookie(req) || '', cfg.jwtSecret);
    if (p.typ !== 'console') throw new Error('type');
    const o = reg().prepare('SELECT id,nom,email,actif FROM operateurs WHERE id=?').get(p.op);
    if (!o || !o.actif) return err(res, 401, 'CONSOLE_AUTH', 'Compte désactivé.');
    req.op = o;
    next();
  } catch (e) { err(res, 401, 'CONSOLE_AUTH', 'Connexion requise.'); }
}
const qui = (req) => req.op.nom + ' — console';

const limiteConnexion = rateLimit({ windowMs: 15 * 60000, limit: Number(process.env.LOGIN_RATE_LIMIT) || 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Trop de tentatives : réessayez dans quelques minutes.' } });

r.post('/connexion', limiteConnexion, (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const o = reg().prepare('SELECT * FROM operateurs WHERE lower(email)=?').get(email);
  if (!o || !o.actif || !bcrypt.compareSync(String((req.body || {}).motDePasse || ''), o.pass_hash)) {
    return err(res, 401, 'CONSOLE_LOGIN', 'Courriel ou mot de passe incorrect.');
  }
  res.cookie(COOKIE, jwt.sign({ op: o.id, typ: 'console' }, cfg.jwtSecret, { expiresIn: '8h' }),
    { httpOnly: true, sameSite: 'strict', secure: cfg.prod, maxAge: 8 * 3600 * 1000, path: '/' });
  reg().prepare("UPDATE operateurs SET derniere_connexion=datetime('now') WHERE id=?").run(o.id);
  E.journaliser(o.nom + ' — console', 'Connexion');
  res.json({ ok: true, operateur: { id: o.id, nom: o.nom, email: o.email } });
});
r.post('/deconnexion', (req, res) => { res.clearCookie(COOKIE, { path: '/' }); res.json({ ok: true }); });

r.use(operateur);

r.get('/moi', (req, res) => res.json({ operateur: req.op, validation: E.validationManuelle() ? 'manuelle' : 'auto', courriels: mail.actif() }));

/* ── Tableau : inscriptions et espaces ── */
const vueInscription = (i) => ({ id: i.id, slug: i.slug, adresse: E.adresse(i.slug), statut: i.statut, recueLe: i.recue_le, decideeLe: i.decidee_le,
  decideePar: i.decidee_par, motif: i.motif, nom: i.data.nom, pays: i.data.pays, profil: i.data.profil,
  admin: { nom: i.data.admin.nom, email: i.data.admin.email } });
function vueEspace(e) {
  return { slug: e.slug, nom: e.nom, pays: e.pays, profil: e.profil, adminEmail: e.admin_email, adresse: E.adresse(e.slug),
    actif: !!e.actif, suspenduLe: e.suspendu_le, motif: e.motif, creeLe: e.cree_le, origine: e.origine || (e.slug === E.INITIAL() ? 'installation initiale' : 'en ligne'),
    initial: e.slug === E.INITIAL(), activite: E.activite(e) };
}
r.get('/tableau', (req, res) => {
  res.json({
    inscriptions: E.inscriptions().map(vueInscription),
    espaces: reg().prepare('SELECT * FROM espaces ORDER BY cree_le DESC').all().map(vueEspace),
  });
});

/** Crée l'espace et y journalise sa création ; retourne l'espace. */
function ouvrir(data, origine, auteur) {
  const e = E.creer(data, origine);
  E.dans(e, () => auditAppend('u0', auteur, `Espace créé — ${data.nom} (${e.slug})`));
  return e;
}

r.post('/inscriptions/:id/accepter', (req, res) => {
  const i = E.inscription(Number(req.params.id));
  if (!i || i.statut !== 'attente') return err(res, 404, 'REQUEST_UNKNOWN', 'Demande introuvable ou déjà traitée.');
  if (E.espace(i.slug)) return err(res, 409, 'SPACE_TAKEN', 'Cette adresse est déjà prise.');
  const e = ouvrir(i.data, 'en ligne', qui(req));
  E.decider(i.id, 'acceptee', req.op.nom);
  E.journaliser(qui(req), `Demande n° ${i.id} acceptée — espace ${e.slug} ouvert (${i.data.nom})`);
  mail.envoyer({ a: [i.data.admin.email], objet: 'Votre espace Marché+ est ouvert',
    corps: `Bonjour ${i.data.admin.nom},\n\nL’espace Marché+ de ${i.data.nom} est ouvert : ${E.adresse(e.slug)}\n\nConnectez-vous avec votre courriel (${i.data.admin.email}) et le mot de passe choisi à l’inscription, puis invitez votre équipe et vos prestataires.` })
    .catch((x) => console.error('Courriel d’ouverture', x));
  res.json({ ok: true, espace: vueEspace(E.espace(e.slug)) });
});

r.post('/inscriptions/:id/refuser', (req, res) => {
  const i = E.inscription(Number(req.params.id));
  if (!i || i.statut !== 'attente') return err(res, 404, 'REQUEST_UNKNOWN', 'Demande introuvable ou déjà traitée.');
  const motif = String((req.body || {}).motif || '').trim();
  if (!motif || motif.length > 500) return err(res, 422, 'REASON', 'Le motif du refus est obligatoire (500 caractères au plus).');
  E.decider(i.id, 'refusee', req.op.nom, motif);
  E.journaliser(qui(req), `Demande n° ${i.id} refusée — ${i.data.nom} (${i.slug}) : ${motif}`);
  mail.envoyer({ a: [i.data.admin.email], objet: 'Votre demande d’espace Marché+',
    corps: `Bonjour ${i.data.admin.nom},\n\nNous ne pouvons pas donner suite à la demande d’espace Marché+ de ${i.data.nom}.\nMotif : ${motif}\n\nPour en parler, répondez à ce message.` })
    .catch((x) => console.error('Courriel de refus', x));
  res.json({ ok: true });
});

/** Création à la main : mêmes contrôles que l'inscription en ligne ; le mot de passe initial est fixé par l'opérateur
    et transmis par lui à l'administrateur. */
r.post('/espaces', (req, res) => {
  const b = req.body || {};
  const slug = String(b.slug || '').trim().toLowerCase();
  const nom = String(b.nom || '').trim(), pays = String(b.pays || '').trim(), profil = String(b.profil || P.DEFAUT);
  const adminNom = String(b.adminNom || '').trim(), email = String(b.email || '').trim().toLowerCase(), mdp = String(b.motDePasse || '');
  if (!nom || nom.length > 120) return err(res, 422, 'SPACE_NAME', 'La raison sociale est obligatoire (120 caractères au plus).');
  if (!adminNom || adminNom.length > 120) return err(res, 422, 'SPACE_ADMIN', 'Le nom de l’administrateur est obligatoire.');
  if (!courrielValide(email)) return err(res, 422, 'SPACE_EMAIL', 'Courriel invalide.');
  if (!mdpValide(mdp)) return err(res, 422, 'SPACE_PASSWORD', MDP_REGLE);
  if (!P.existe(profil)) return err(res, 422, 'SPACE_PROFILE', 'Type d’acheteur inconnu.');
  if (!E.valideSousDomaine(slug) || E.RESERVES.includes(slug)) return err(res, 422, 'SPACE_SLUG', 'Adresse invalide ou réservée.');
  if (!E.libre(slug)) return err(res, 409, 'SPACE_TAKEN', 'Cette adresse est déjà prise.');
  const e = ouvrir({ slug, nom, pays, profil, admin: { nom: adminNom, email, hash: bcrypt.hashSync(mdp, 10) } }, 'console', qui(req));
  E.journaliser(qui(req), `Espace ${slug} créé à la main — ${nom}`);
  mail.envoyer({ a: [email], objet: 'Votre espace Marché+ est ouvert',
    corps: `Bonjour ${adminNom},\n\nL’espace Marché+ de ${nom} est ouvert : ${E.adresse(slug)}\n\nVotre identifiant : ${email}. Votre mot de passe initial vous est communiqué par votre interlocuteur Neurones Technologies ; changez-le à la première connexion (menu de votre compte).` })
    .catch((x) => console.error('Courriel d’ouverture', x));
  res.status(201).json({ ok: true, espace: vueEspace(E.espace(e.slug)) });
});

const espaceDe = (req, res) => { const e = E.espace(String(req.params.slug || '')); if (!e) err(res, 404, 'SPACE_UNKNOWN', 'Espace introuvable.'); return e; };

/** Modification d'un espace : raison sociale, pays, type d'acheteur (repris dans l'organisation de l'espace) et
    courriel de contact (registre). L'adresse ne change pas : liens et sessions des utilisateurs en dépendent. */
r.patch('/espaces/:slug', (req, res) => {
  const e = espaceDe(req, res); if (!e) return;
  const b = req.body || {};
  const nom = String(b.nom != null ? b.nom : e.nom).trim(), pays = String(b.pays != null ? b.pays : e.pays || '').trim();
  const profil = String(b.profil != null ? b.profil : e.profil || P.DEFAUT), email = String(b.adminEmail != null ? b.adminEmail : e.admin_email || '').trim().toLowerCase();
  if (!nom || nom.length > 120) return err(res, 422, 'SPACE_NAME', 'La raison sociale est obligatoire (120 caractères au plus).');
  if (pays.length > 60) return err(res, 422, 'SPACE_COUNTRY', 'Pays trop long.');
  if (!P.existe(profil)) return err(res, 422, 'SPACE_PROFILE', 'Type d’acheteur inconnu.');
  if (email && !courrielValide(email)) return err(res, 422, 'SPACE_EMAIL', 'Courriel invalide.');
  const changes = [];
  if (nom !== e.nom) changes.push(`raison sociale : ${e.nom} → ${nom}`);
  if (pays !== (e.pays || '')) changes.push(`pays : ${e.pays || '—'} → ${pays || '—'}`);
  if (profil !== (e.profil || P.DEFAUT)) changes.push(`type d’acheteur : ${P.profil(e.profil || P.DEFAUT).lab} → ${P.profil(profil).lab}`);
  if (email !== (e.admin_email || '')) changes.push(`contact : ${e.admin_email || '—'} → ${email || '—'}`);
  if (!changes.length) return res.json({ ok: true, espace: vueEspace(e) });
  reg().prepare('UPDATE espaces SET nom=?, pays=?, profil=?, admin_email=? WHERE slug=?').run(nom, pays, profil, email || null, e.slug);
  // l'organisation de l'espace suit : nom affiché, pays, profil des nouvelles procédures
  E.dans(e, () => {
    const org = (kvGet('org') || { value: {} }).value;
    kvSet('org', { ...org, nom, pays, profilDefaut: profil }, 'console');
    auditAppend(null, qui(req), 'Organisation modifiée depuis la console de la plateforme — ' + changes.join(' ; '));
  });
  E.journaliser(qui(req), `Espace ${e.slug} modifié — ${changes.join(' ; ')}`);
  res.json({ ok: true, espace: vueEspace(E.espace(e.slug)) });
});

r.post('/espaces/:slug/suspendre', (req, res) => {
  const e = espaceDe(req, res); if (!e) return;
  const motif = String((req.body || {}).motif || '').trim();
  if (!motif || motif.length > 500) return err(res, 422, 'REASON', 'Le motif de la suspension est obligatoire (500 caractères au plus).');
  if (e.slug === E.INITIAL()) return err(res, 403, 'SPACE_INITIAL', 'L’espace de démonstration ne peut pas être suspendu.');
  if (!e.actif) return err(res, 409, 'ALREADY', 'Cet espace est déjà suspendu.');
  E.suspendre(e.slug, motif);
  E.journaliser(qui(req), `Espace ${e.slug} suspendu — ${motif}`);
  res.json({ ok: true, espace: vueEspace(E.espace(e.slug)) });
});

r.post('/espaces/:slug/reactiver', (req, res) => {
  const e = espaceDe(req, res); if (!e) return;
  if (e.actif) return err(res, 409, 'ALREADY', 'Cet espace est déjà actif.');
  E.reactiver(e.slug);
  E.journaliser(qui(req), `Espace ${e.slug} réactivé`);
  res.json({ ok: true, espace: vueEspace(E.espace(e.slug)) });
});

/** Suppression définitive : l'espace doit être suspendu, et son adresse ressaisie. Jamais l'espace initial. */
r.delete('/espaces/:slug', (req, res) => {
  const e = espaceDe(req, res); if (!e) return;
  if (e.slug === E.INITIAL()) return err(res, 403, 'SPACE_INITIAL', 'L’espace de démonstration ne peut pas être supprimé.');
  if (e.actif) return err(res, 409, 'SPACE_ACTIVE', 'Suspendez l’espace avant de le supprimer.');
  if (String((req.body || {}).confirmation || '').trim().toLowerCase() !== e.slug) return err(res, 422, 'CONFIRMATION', 'Saisissez l’adresse de l’espace pour confirmer.');
  E.supprimer(e.slug);
  E.journaliser(qui(req), `Espace ${e.slug} supprimé définitivement — ${e.nom}`);
  res.json({ ok: true });
});

/* ── Opérateurs ── */
r.get('/operateurs', (req, res) => {
  res.json({ operateurs: reg().prepare('SELECT id,nom,email,actif,cree_le,derniere_connexion FROM operateurs ORDER BY id').all() });
});
r.post('/operateurs', (req, res) => {
  const b = req.body || {};
  const nom = String(b.nom || '').trim(), email = String(b.email || '').trim().toLowerCase(), mdp = String(b.motDePasse || '');
  if (!nom || nom.length > 120) return err(res, 422, 'OP_NAME', 'Le nom est obligatoire.');
  if (!courrielValide(email)) return err(res, 422, 'OP_EMAIL', 'Courriel invalide.');
  if (!mdpValide(mdp)) return err(res, 422, 'OP_PASSWORD', MDP_REGLE);
  if (reg().prepare('SELECT 1 FROM operateurs WHERE lower(email)=?').get(email)) return err(res, 409, 'OP_TAKEN', 'Ce courriel a déjà un compte.');
  const id = reg().prepare('INSERT INTO operateurs(nom,email,pass_hash) VALUES(?,?,?)').run(nom, email, bcrypt.hashSync(mdp, 10)).lastInsertRowid;
  E.journaliser(qui(req), `Opérateur ajouté — ${nom} (${email})`);
  res.status(201).json({ ok: true, id });
});
/** Modification d'un opérateur : nom, courriel, actif ; nouveau mot de passe pour un autre opérateur (le sien se
    change par /mot-de-passe, avec l'actuel). Champs absents : inchangés. */
r.patch('/operateurs/:id', (req, res) => {
  const o = reg().prepare('SELECT * FROM operateurs WHERE id=?').get(Number(req.params.id));
  if (!o) return err(res, 404, 'OP_UNKNOWN', 'Opérateur introuvable.');
  const b = req.body || {}, soi = o.id === req.op.id;
  const nom = b.nom != null ? String(b.nom).trim() : o.nom;
  const email = b.email != null ? String(b.email).trim().toLowerCase() : o.email;
  const actif = b.actif != null ? !!b.actif : !!o.actif;
  const mdp = b.motDePasse != null && b.motDePasse !== '' ? String(b.motDePasse) : null;
  if (!nom || nom.length > 120) return err(res, 422, 'OP_NAME', 'Le nom est obligatoire.');
  if (!courrielValide(email)) return err(res, 422, 'OP_EMAIL', 'Courriel invalide.');
  if (email !== o.email && reg().prepare('SELECT 1 FROM operateurs WHERE lower(email)=? AND id<>?').get(email, o.id)) return err(res, 409, 'OP_TAKEN', 'Ce courriel a déjà un compte.');
  if (soi && !actif) return err(res, 409, 'OP_SELF', 'Vous ne pouvez pas désactiver votre propre compte.');
  if (!actif && o.actif && reg().prepare('SELECT count(*) n FROM operateurs WHERE actif=1 AND id<>?').get(o.id).n === 0) return err(res, 409, 'OP_LAST', 'Il faut au moins un opérateur actif.');
  if (mdp && soi) return err(res, 409, 'OP_SELF_PASSWORD', 'Votre propre mot de passe se change par « Changer mon mot de passe ».');
  if (mdp && !mdpValide(mdp)) return err(res, 422, 'OP_PASSWORD', MDP_REGLE);
  const changes = [];
  if (nom !== o.nom) changes.push(`nom : ${o.nom} → ${nom}`);
  if (email !== o.email) changes.push(`courriel : ${o.email} → ${email}`);
  if (actif !== !!o.actif) changes.push(actif ? 'réactivé' : 'désactivé');
  if (mdp) changes.push('nouveau mot de passe');
  if (!changes.length) return res.json({ ok: true });
  reg().prepare('UPDATE operateurs SET nom=?, email=?, actif=?' + (mdp ? ', pass_hash=?' : '') + ' WHERE id=?')
    .run(...[nom, email, actif ? 1 : 0].concat(mdp ? [bcrypt.hashSync(mdp, 10)] : [], [o.id]));
  E.journaliser(qui(req), `Opérateur ${o.nom} modifié — ${changes.join(' ; ')}`);
  res.json({ ok: true });
});
r.post('/mot-de-passe', (req, res) => {
  const o = reg().prepare('SELECT pass_hash FROM operateurs WHERE id=?').get(req.op.id);
  if (!bcrypt.compareSync(String((req.body || {}).actuel || ''), o.pass_hash)) return err(res, 403, 'OP_PASSWORD_WRONG', 'Mot de passe actuel incorrect.');
  const n = String((req.body || {}).nouveau || '');
  if (!mdpValide(n)) return err(res, 422, 'OP_PASSWORD', MDP_REGLE);
  reg().prepare('UPDATE operateurs SET pass_hash=? WHERE id=?').run(bcrypt.hashSync(n, 10), req.op.id);
  E.journaliser(qui(req), 'Mot de passe modifié');
  res.json({ ok: true });
});

/* ── Journal ── */
r.get('/journal', (req, res) => {
  res.json({ journal: reg().prepare('SELECT t,auteur,action,ip FROM journal ORDER BY id DESC LIMIT 500').all() });
});

module.exports = r;
