/* Piste d'audit : l'adresse enregistrée est celle que le proxy inverse transmet (X-Forwarded-For), propre à chaque
   utilisateur ; une adresse prétendue par le client, placée avant celle du proxy, n'est pas retenue. */
const { call, login, base } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

const connecter = (email, xff) => fetch(base() + '/api/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json', ...(xff ? { 'x-forwarded-for': xff } : {}) },
  body: JSON.stringify({ email, password: 'Marche+2026!' }),
});

test('audit : une adresse par utilisateur, celle du proxy ; l’en-tête forgé par le client est ignoré', async () => {
  assert.equal((await connecter('y.koffi@bal.ci', '203.0.113.7')).status, 200);
  assert.equal((await connecter('f.assamoi@bal.ci', '198.51.100.9')).status, 200);
  // le client prétend venir de 1.1.1.1 ; le proxy (dernier maillon) ajoute l'adresse réelle
  assert.equal((await connecter('m.traore@bal.ci', '1.1.1.1, 192.0.2.44')).status, 200);
  const admin = await login('administrateur@bal.ci');
  const j = (await call('GET', '/api/audit', null, admin)).json;
  const ipDe = (qui) => j.entrees.find((e) => e.a === 'Connexion' && e.who.startsWith(qui)).ip;
  assert.equal(ipDe('Y. Koffi'), '203.0.113.7');
  assert.equal(ipDe('F. Assamoi'), '198.51.100.9');
  assert.equal(ipDe('M. Traoré'), '192.0.2.44');
  assert.equal(j.verification.ok, true); // la chaîne d'empreintes couvre ces adresses
});

test('audit : l’écran peut vérifier ce que le serveur voit de la connexion', async () => {
  const admin = await login('administrateur@bal.ci');
  const r = await fetch(base() + '/api/audit', { headers: { cookie: admin, 'x-forwarded-for': '203.0.113.50' } });
  const c = (await r.json()).connexion;
  assert.equal(c.ip, '203.0.113.50');
  assert.equal(c.chaine, '203.0.113.50');
  assert.equal(c.proxys, 1);
  const sans = (await call('GET', '/api/audit', null, admin)).json.connexion;
  assert.equal(sans.chaine, null); // aucun proxy : l'adresse du pair
  assert.ok(sans.ip && sans.pair);
});

test('audit : le poste (navigateur, système, identifiant) et les adresses relayées sont consignés et couverts par la chaîne', async () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
  const r = await fetch(base() + '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'a.diomande@bal.ci', password: 'Marche+2026!' }),
    headers: { 'content-type': 'application/json', 'user-agent': UA, 'x-poste': 'a1b2c3d4e5f6', 'x-forwarded-for': '10.20.30.40, 203.0.113.7' } });
  assert.equal(r.status, 200);
  const admin = await login('administrateur@bal.ci');
  const j = (await call('GET', '/api/audit', null, admin)).json;
  const e = j.entrees.find((x) => x.a === 'Connexion' && x.who.startsWith('A. Diomandé'));
  assert.equal(e.ip, '203.0.113.7');
  assert.equal(e.poste, 'Chrome 129 · Windows 10/11 · poste a1b2c3');
  assert.equal(e.relais, '10.20.30.40, 203.0.113.7'); // l'adresse interne relayée par le proxy d'entreprise
  // sans en-tête de poste, rien d'inventé ; un identifiant mal formé est ignoré
  const sans = j.entrees.find((x) => x.a === 'Connexion' && x.who.startsWith('Y. Koffi'));
  assert.equal(sans.relais, null);
  const mal = await fetch(base() + '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 's.bamba@bal.ci', password: 'Marche+2026!' }),
    headers: { 'content-type': 'application/json', 'user-agent': UA, 'x-poste': '<script>' } });
  assert.equal(mal.status, 200);
  const j2 = (await call('GET', '/api/audit', null, admin)).json;
  assert.equal(j2.entrees.find((x) => x.a === 'Connexion' && x.who.startsWith('S. Bamba')).poste, 'Chrome 129 · Windows 10/11');
  assert.equal(j2.verification.ok, true); // les entrées avec et sans poste se vérifient ensemble
});
