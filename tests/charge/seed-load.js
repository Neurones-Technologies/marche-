/* Prépare une base de volume réaliste pour la campagne de charge : la démo, plus N comptes internes et N
   soumissionnaires, et la procédure p1 publiée en marché public ouvert (tout soumissionnaire peut déposer). */
const bcrypt = require('bcryptjs');
const db = require('../../server/db');
const N_SOUM = Number(process.env.N_SOUM || 600);
const N_INTERNE = Number(process.env.N_INTERNE || 60);
const PW = 'Marche+2026!';
const hash = bcrypt.hashSync(PW, 10); // même empreinte pour tous : le coût bcrypt reste payé à la connexion (vérif)

const ins = db.db.prepare('INSERT OR IGNORE INTO users(id,nom,email,role,pass_hash,active) VALUES(?,?,?,?,?,1)');
const tx = db.db.transaction(() => {
  for (let i = 0; i < N_SOUM; i++) ins.run('load-s-' + i, 'Soumissionnaire ' + i, 'soum' + i + '@charge.test', 'soum', hash);
  // comptes internes : on réutilise des rôles existants pour la lecture d'état
  for (let i = 0; i < N_INTERNE; i++) ins.run('load-i-' + i, 'Agent ' + i, 'agent' + i + '@charge.test', 'achats', hash);
});
tx();

// publier p1 en marché public ouvert, échéance dans 30 jours
const cdc = db.pkvGet('p1', 'cdc').value;
db.pkvSet('p1', 'cdc', { ...cdc, cdcPublie: true, ouverture: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) }, 'charge');
db.pkvSet('p1', 'consultes', { mode: 'ouvert', partenaires: [] }, 'charge');

const nU = db.db.prepare('SELECT COUNT(*) c FROM users').get().c;
console.log('Base prête : ' + nU + ' comptes, p1 publiée (ouvert). Soum=' + N_SOUM + ' Interne=' + N_INTERNE);
process.exit(0);
