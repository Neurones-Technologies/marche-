const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cfg = require('./config');
const { store } = require('./db');
const { requireAuth } = require('./auth');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));
// Téléversement d'une pièce : corps binaire, ni analysé en JSON ni soumis à l'exigence JSON ci-dessous.
const FILES = /^\/api\/((procedures\/[^/]+\/)?files|partenaires\/[^/]+\/fichiers)(\/|$)/;
app.use((req, res, next) => (FILES.test(req.path) ? next() : express.json({ limit: '1mb' })(req, res, next)));

// Les requêtes d'écriture doivent être du JSON (protection CSRF complémentaire au cookie SameSite=Strict)
app.use('/api', (req, res, next) => {
  if (FILES.test(req.originalUrl.split('?')[0])) return next();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.is('application/json')) return res.status(415).json({ error: 'JSON requis.' });
  next();
});
app.use('/api/auth', require('./routes/auth'));
app.use('/api/files', require('./routes/files').global);
app.use('/api/procedures', require('./routes/procedures'));
app.use('/api/besoins', require('./routes/besoins'));
app.use('/api/partenaires', require('./routes/partenaires'));
app.use('/api/commandes', require('./routes/commandes'));
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
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
app.use((err, req, res, next) => { // eslint-disable-line
  console.error(err);
  res.status(err.status || 500).json({ error: cfg.prod ? 'Erreur interne.' : String(err.message) });
});

if (require.main === module) {
  app.listen(cfg.port, () => console.log(`Marché+ — http://localhost:${cfg.port}`));
}
module.exports = app;
