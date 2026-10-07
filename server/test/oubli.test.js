/* Mot de passe oublié : lien à usage unique (1 h) envoyé au courriel du compte, même réponse que le compte existe ou
   non, nouveau mot de passe qui ferme les sessions ouvertes. */
const { call, login } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.json));
const jeton = (r) => r.json.lien.split('reinit=')[1];

test('mot de passe oublié : pas d’énumération, lien à usage unique, sessions fermées', async () => {
  const inconnu = await call('POST', '/api/auth/oubli', { email: 'personne@nulle-part.ci' });
  const connu = await call('POST', '/api/auth/oubli', { email: 'F.Assamoi@bal.ci' });
  ok(inconnu); ok(connu);
  assert.equal(inconnu.json.message, connu.json.message); // même réponse
  assert.equal(inconnu.json.lien, undefined);
  assert.match(connu.json.lien, /\/\?reinit=[0-9a-f]{64}$/); // hors production, sans courriels réels : lien rendu

  const ouverte = await login('f.assamoi@bal.ci');
  const faible = await call('POST', '/api/auth/reinit', { jeton: jeton(connu), motDePasse: 'court' });
  assert.equal(faible.status, 422); // le lien n'est pas consommé par un mot de passe refusé
  ok(await call('POST', '/api/auth/reinit', { jeton: jeton(connu), motDePasse: 'Nouveau2026!ok' }));
  assert.equal((await call('GET', '/api/auth/me', null, ouverte)).status, 401); // session ouverte fermée
  assert.equal((await call('POST', '/api/auth/login', { email: 'f.assamoi@bal.ci', password: 'Marche+2026!' })).status, 401);
  ok(await call('POST', '/api/auth/login', { email: 'f.assamoi@bal.ci', password: 'Nouveau2026!ok' }));
  assert.equal((await call('POST', '/api/auth/reinit', { jeton: jeton(connu), motDePasse: 'Encore2026!ok' })).status, 410); // usage unique

  // une nouvelle demande annule le lien précédent
  const a = await call('POST', '/api/auth/oubli', { email: 'f.assamoi@bal.ci' });
  const b = await call('POST', '/api/auth/oubli', { email: 'f.assamoi@bal.ci' });
  assert.equal((await call('POST', '/api/auth/reinit', { jeton: jeton(a), motDePasse: 'Autre2026!okk' })).status, 410);
  ok(await call('POST', '/api/auth/reinit', { jeton: jeton(b), motDePasse: 'Autre2026!okk' }));
});
