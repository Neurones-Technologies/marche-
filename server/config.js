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
  seedPassword: process.env.SEED_PASSWORD || 'Marche+2026!',
  seedDemo: process.env.SEED_DEMO !== '0',
  allowReset: process.env.ALLOW_RESET !== '0',
};
