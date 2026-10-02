const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cfg = require('./config');
require('./db');

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
app.use((req, res, next) => (req.path.startsWith('/api/files') ? next() : express.json({ limit: '1mb' })(req, res, next)));

// Les requêtes d'écriture doivent être du JSON (protection CSRF complémentaire au cookie SameSite=Strict)
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/files')) return next();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.is('application/json')) return res.status(415).json({ error: 'JSON requis.' });
  next();
});
app.use('/api/auth', require('./routes/auth'));
app.use('/api/files', require('./routes/files'));
app.use('/api', require('./routes/state'));
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue.' }));

// no-cache : le navigateur revalide chaque fichier (304 s'il n'a pas changé). Avec un max-age, une mise à jour
// pouvait mêler un index.html neuf et un app.js ancien resté en cache, et l'interface ne s'affichait plus.
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
app.use((err, req, res, next) => { // eslint-disable-line
  console.error(err);
  res.status(err.status || 500).json({ error: cfg.prod ? 'Erreur interne.' : String(err.message) });
});

if (require.main === module) {
  app.listen(cfg.port, () => console.log(`Marché+ — http://localhost:${cfg.port}`));
}
module.exports = app;
