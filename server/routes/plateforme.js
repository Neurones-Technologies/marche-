/* API de la plateforme (adresse racine, ex. tenders.neuronestech.com) : création d'un espace d'entreprise en
   libre-service, comme sur odoo.com. Activation immédiate après confirmation du courriel ; l'administrateur
   arrive connecté dans son nouvel espace (jeton de connexion à usage unique, valable 15 minutes).
   Tant que les courriels ne partent pas (Microsoft 365 non configuré), le lien de confirmation est rendu dans la
   réponse, pour pouvoir avancer : à réserver aux démonstrations. */
const express = require('express');
const rateLimit = require('express-rate-limit');
const P = require('../../public/js/profils.js');
const E = require('../espaces');
const mail = require('../mail');
const cfg = require('../config');
const { bcrypt } = require('../auth');
const { jetonCreer, auditAppend } = require('../db');

const r = express.Router();
const err = (res, status, code, error) => res.status(status).json({ error, code });
const limite = rateLimit({ windowMs: 3600000, limit: Number(process.env.PLATEFORME_CREATIONS_PAR_HEURE) || 5, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Trop de demandes depuis cette adresse : réessayez dans une heure.' } });

/* Seule l'adresse de la plateforme répond ici. */
r.use((req, res, next) => (req.plateforme ? next() : err(res, 404, 'NOT_PLATFORM', 'Route inconnue.')));

/** Disponibilité d'un sous-domaine. */
r.get('/disponible', (req, res) => {
  const s = String(req.query.slug || '').trim().toLowerCase();
  if (!E.valideSousDomaine(s)) return res.json({ libre: false, raison: '3 à 30 caractères : lettres minuscules, chiffres et tirets, en commençant par une lettre.' });
  if (E.RESERVES.includes(s)) return res.json({ libre: false, raison: 'Cette adresse est réservée.' });
  res.json(E.libre(s) ? { libre: true, adresse: E.adresse(s) } : { libre: false, raison: 'Cette adresse est déjà prise.' });
});

/** Demande de création : contrôles, puis courriel de confirmation. */
r.post('/espaces', limite, (req, res) => {
  const b = req.body || {};
  const slug = String(b.slug || '').trim().toLowerCase();
  const nom = String(b.nom || '').trim(), pays = String(b.pays || '').trim();
  const adminNom = String(b.adminNom || '').trim(), email = String(b.email || '').trim().toLowerCase(), mdp = String(b.motDePasse || '');
  const profil = String(b.profil || P.DEFAUT);
  if (b.site) return res.status(201).json({ ok: true }); // champ piège : un robot l'a rempli, on ne fait rien
  if (!nom || nom.length > 120) return err(res, 422, 'SPACE_NAME', 'La raison sociale est obligatoire (120 caractères au plus).');
  if (!adminNom || adminNom.length > 120) return err(res, 422, 'SPACE_ADMIN', 'Le nom de l’administrateur est obligatoire.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err(res, 422, 'SPACE_EMAIL', 'Courriel invalide.');
  if (mdp.length < 10 || !/[a-z]/.test(mdp) || !/[A-Z]/.test(mdp) || !/\d/.test(mdp)) return err(res, 422, 'SPACE_PASSWORD', 'Mot de passe : 10 caractères minimum, avec majuscule, minuscule et chiffre.');
  if (!P.existe(profil)) return err(res, 422, 'SPACE_PROFILE', 'Type d’acheteur inconnu.');
  if (!E.valideSousDomaine(slug) || E.RESERVES.includes(slug)) return err(res, 422, 'SPACE_SLUG', 'Adresse invalide ou réservée.');
  if (!E.libre(slug)) return err(res, 409, 'SPACE_TAKEN', 'Cette adresse est déjà prise.');
  const jeton = E.demander(slug, { slug, nom, pays, profil, admin: { nom: adminNom, email, hash: bcrypt.hashSync(mdp, 10) } });
  const lien = E.adressePlateforme() + '/api/plateforme/confirmer?jeton=' + jeton;
  mail.envoyer({ a: [email], objet: 'Confirmez la création de votre espace Marché+',
    corps: `Bonjour ${adminNom},\n\nPour créer l’espace Marché+ de ${nom} à l’adresse ${E.adresse(slug)}, confirmez votre courriel en ouvrant ce lien dans les 48 heures :\n${lien}\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message.` })
    .catch((e) => console.error('Courriel de confirmation', e));
  // sans envoi réel des courriels, le lien est rendu pour pouvoir avancer (démonstration)
  res.status(201).json({ ok: true, adresse: E.adresse(slug), courriel: email, ...(mail.actif() ? {} : { lien }) });
});

/** Confirmation : l'espace est créé et l'administrateur y entre, connecté. */
r.get('/confirmer', (req, res) => {
  const d = E.confirmer(req.query.jeton);
  if (!d) return res.redirect(E.adressePlateforme() + '/?confirmation=invalide');
  if (E.espace(d.slug)) return res.redirect(E.adressePlateforme() + '/?confirmation=prise');
  const e = E.creer(d.data);
  const brut = E.dans(e, () => {
    auditAppend('u0', d.data.admin.nom + ' — inscription en ligne', `Espace créé — ${d.data.nom} (${e.slug})`);
    return jetonCreer('u0', 'connexion', 0.25);
  });
  res.redirect(E.adresse(e.slug) + '/api/auth/jeton?j=' + brut);
});

module.exports = r;
