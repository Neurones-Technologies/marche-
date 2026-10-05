/* Portail des partenaires : l'inscription d'un prestataire a sa page (/portail-partenaires), hors de la page de connexion. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { base } = require('./_client');

test('le portail des partenaires a sa propre page ; la page de connexion n’a plus d’inscription', async () => {
  const portail = await fetch(base() + '/portail-partenaires');
  assert.equal(portail.status, 200);
  const html = await portail.text();
  assert.match(html, /Devenez partenaire/);
  assert.match(html, /id="signup-form"/);
  const connexion = await (await fetch(base() + '/')).text();
  assert.doesNotMatch(connexion, /signup-form|inscrire mon entreprise/i);
});
