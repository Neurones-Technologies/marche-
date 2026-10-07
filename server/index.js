const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cfg = require('./config');
const { store } = require('./db');
const { requireAuth } = require('./auth');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(require('./contexte').middleware); // adresse IP de la requête, pour le journal d'audit
const espaces = require('./espaces');
app.use(espaces.aiguillage); // plateforme multi-entreprises : l'espace d'après le sous-domaine (inactif sans PLATEFORME_DOMAINE)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameSrc: ["'self'", 'blob:'], // dossier d'appel d'offres en PDF, généré dans le navigateur
      frameAncestors: ["'none'"],
    },
  },
}));
// Téléversement d'une pièce : corps binaire, ni analysé en JSON ni soumis à l'exigence JSON ci-dessous.
const FILES = /^\/api\/((procedures\/[^/]+\/)?files|procedures\/[^/]+\/ia\/(document|offre-externe)|partenaires\/[^/]+\/fichiers|commandes\/[^/]+\/fichiers|inscription\/brouillon\/pieces)(\/|$)/;
app.use((req, res, next) => (FILES.test(req.path) ? next() : express.json({ limit: '1mb' })(req, res, next)));

// Les requêtes d'écriture doivent être du JSON (protection CSRF complémentaire au cookie SameSite=Strict)
app.use('/api', (req, res, next) => {
  if (FILES.test(req.originalUrl.split('?')[0])) return next();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.is('application/json')) return res.status(415).json({ error: 'JSON requis.' });
  next();
});
// Version de l'application : change à chaque démarrage du serveur (ou vaut APP_VERSION). Le navigateur la compare
// à celle qu'il a chargée et se recharge de lui-même après une mise à jour.
const VERSION = process.env.APP_VERSION || String(Date.now());
app.get('/api/version', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ version: VERSION }); });
app.use('/api/plateforme', require('./routes/plateforme'));
app.use('/api/console', require('./routes/console')); // administration de la plateforme (opérateurs)
// À l'adresse de la plateforme, aucune route d'un espace : ni données, ni comptes.
app.use('/api', (req, res, next) => (req.plateforme ? res.status(404).json({ error: 'Route inconnue sur la plateforme : ouvrez l’adresse de votre espace.', code: 'NOT_A_SPACE' }) : next()));
/* Nom de l'organisation de l'espace, pour la page de connexion (sans compte). */
app.get('/api/espace', (req, res) => {
  const org = (require('./db').kvGet('org') || {}).value || {};
  res.json({ nom: org.nom || '', espace: require('./contexte').espace(), inscriptionOuverte: org.inscriptionOuverte !== false, reinitialisable: espaces.reinitialisable() });
});
app.use('/api/auth', require('./routes/auth'));
app.use('/api/files', require('./routes/files').global);
app.use('/api/procedures', require('./routes/procedures'));
app.use('/api/besoins', require('./routes/besoins'));
app.use('/api/partenaires', require('./routes/partenaires'));
app.use('/api/commandes', require('./routes/commandes'));
app.use('/api/suppleances', require('./routes/suppleances'));
app.use('/api', require('./routes/accueil')); // /api/accueil, /api/registre
app.use('/api/inscription', require('./routes/inscription')); // seule route publique (sans compte)
// État de l'organisation seule, quand aucune procédure n'est ouverte (demandeur, instance encore vide) :
// lecture de l'état et écriture des seules clés d'organisation, par les mêmes routes que pour une procédure.
app.use('/api/organisation', requireAuth, (req, res, next) => {
  if (!['/state', '/audit'].includes(req.path)) return res.status(404).json({ error: 'Route inconnue.' });
  req.pid = null; req.store = store(null);
  next();
}, require('./routes/state'));
app.use('/api', require('./routes/admin'));
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue.' }));

// no-cache : le navigateur revalide chaque fichier (304 s'il n'a pas changé). Avec un max-age, une mise à jour
// pouvait mêler un index.html neuf et un script ancien resté en cache, et l'interface ne s'affichait plus.
// À l'adresse de la plateforme, ses pages : « Créer votre espace », et la console des opérateurs (/console).
app.use((req, res, next) => {
  if (!req.plateforme || /\.[a-z0-9]+$/i.test(req.path)) return next();
  res.setHeader('Cache-Control', 'no-cache');
  const page = /^\/console(\/|$)/.test(req.path) ? 'console.html' : 'plateforme.html';
  res.sendFile(path.join(__dirname, '..', 'public', page));
});
// génération du dossier d'appel d'offres en PDF dans le navigateur (pdfmake), servie par l'application elle-même
app.use('/vendor/pdfmake', express.static(path.join(__dirname, '..', 'node_modules', 'pdfmake', 'build'), { index: false, maxAge: '7d' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
// Portail des partenaires : inscription d'une entreprise prestataire, à part de la page de connexion.
app.get('/portail-partenaires', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, '..', 'public', 'portail.html'));
});
// Adresses de l'interface (/demandes-achat, /appels-offres/p1/cahier-des-charges…) : la même page, qui lit
// l'adresse pour ouvrir le bon écran. Un chemin avec une extension reste un fichier (404 s'il manque).
app.get(/^\/(?!api\/)[^.]*$/, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
app.use((err, req, res, next) => { // eslint-disable-line
  console.error(err);
  res.status(err.status || 500).json({ error: cfg.prod ? 'Erreur interne.' : String(err.message) });
});

if (require.main === module) {
  app.listen(cfg.port, () => console.log(`Marché+ — http://localhost:${cfg.port}`));
  require('./sauvegardes').demarrer(); // sauvegardes automatiques (SAUVEGARDE_HEURES)
}
module.exports = app;
