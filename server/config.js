const path = require('path');
const crypto = require('crypto');
const prod = process.env.NODE_ENV === 'production';
if (prod && !process.env.JWT_SECRET) {
  console.error('JWT_SECRET est obligatoire en production.');
  process.exit(1);
}
module.exports = {
  prod,
  port: Number(process.env.PORT) || 3000,
  dbFile: process.env.DB_FILE || path.join(__dirname, '..', 'data', 'marcheplus.db'),
  jwtSecret: process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
  jwtTtl: process.env.JWT_TTL || '8h',
  // Mot de passe des comptes de démonstration (à changer dès la première connexion)
  filesDir: process.env.FILES_DIR || (process.env.DB_FILE === ':memory:' ? require('os').tmpdir() + '/mp-files-test' : path.join(path.dirname(process.env.DB_FILE || path.join(__dirname, '..', 'data', 'x')), 'files')),
  maxFileMb: Number(process.env.MAX_FILE_MB) || 10,
  seedPassword: process.env.SEED_PASSWORD || 'Marche+2026!',
  seedDemo: process.env.SEED_DEMO !== '0',
  // Marchés publics (profil réglementaire « public ») : en attente, donc indisponibles sauf MARCHES_PUBLICS=1.
  // Indisponibles : ni choisis pour une organisation, un espace ou un appel d'offres, ni proposés à l'écran.
  marchesPublics: process.env.MARCHES_PUBLICS === '1',
  /** Un profil peut-il être choisi ? Un profil public ne l'est que si les marchés publics sont ouverts ; avant : la
      valeur déjà en place, qui reste admise telle quelle. */
  profilChoisissable(id, avant) {
    const P = require('../public/js/profils.js');
    return P.existe(id) && (module.exports.marchesPublics || !P.profil(id).public || id === avant);
  },
  allowReset: process.env.ALLOW_RESET !== '0',
  // Inscription publique des prestataires : tentatives par adresse IP et par heure
  inscriptionParHeure: Number(process.env.INSCRIPTION_RATE_LIMIT) || 5,
  // Adresse publique de l'application, pour les liens envoyés par courriel (ex. https://tenders.neuronestech.com)
  appUrl: (process.env.APP_URL || 'http://localhost:' + (Number(process.env.PORT) || 3000)).replace(/\/+$/, ''),
};
