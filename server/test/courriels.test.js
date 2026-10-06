/* Envoi des courriels par Microsoft 365 (Graph), contre un faux service Microsoft local : authentification par
   identifiants client, jeton réutilisé, envoi aux seules adresses réelles des comptes désignés, échec consigné,
   filtrage de la boîte d'envoi et des notifications par destinataire, courriel de vérification d'inscription. */
const http = require('http');
process.env.APP_URL = 'https://marches.example.org/'; // lu au chargement de la configuration
const C = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

// faux service Microsoft : jeton OAuth et sendMail ; un objet contenant « ECHEC » est refusé
const recus = { jetons: 0, envois: [] };
const faux = http.createServer((req, res) => {
  let corps = '';
  req.on('data', (c) => { corps += c; });
  req.on('end', () => {
    if (req.url === '/tenant-test/oauth2/v2.0/token') {
      const p = new URLSearchParams(corps);
      if (p.get('client_secret') !== 'secret-test' || p.get('grant_type') !== 'client_credentials') { res.writeHead(401); return res.end('{"error":"invalid_client"}'); }
      recus.jetons++;
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ access_token: 'jeton-test', expires_in: 3600 }));
    }
    if (req.url === '/v1.0/users/marches%40example.org/sendMail' && req.headers.authorization === 'Bearer jeton-test') {
      const m = JSON.parse(corps).message;
      if (m.subject.includes('ECHEC')) { res.writeHead(503, { 'content-type': 'application/json' }); return res.end('{"error":{"code":"ServiceUnavailable"}}'); }
      recus.envois.push({ a: m.toRecipients.map((x) => x.emailAddress.address), objet: m.subject, corps: m.body.content, type: m.body.contentType });
      res.writeHead(202); return res.end();
    }
    res.writeHead(404); res.end();
  });
});
let port;
test.before(() => new Promise((r) => faux.listen(0, () => {
  port = faux.address().port;
  Object.assign(process.env, {
    MAIL_MODE: 'graph', M365_TENANT_ID: 'tenant-test', M365_CLIENT_ID: 'client-test', M365_CLIENT_SECRET: 'secret-test',
    M365_SENDER: 'marches@example.org', M365_LOGIN_BASE: `http://127.0.0.1:${port}`, M365_GRAPH_BASE: `http://127.0.0.1:${port}`,
  });
  r();
})));
test.after(() => faux.close());

let achats, admin, evaltech, soum;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
async function boite(cookie) { return (await C.getState(cookie)).emails; }

test('notification : envoyée aux seules adresses réelles des comptes désignés, jeton réutilisé', async () => {
  achats = await C.login('y.koffi@bal.ci'); admin = await C.login('administrateur@bal.ci');
  evaltech = await C.login('f.assamoi@bal.ci'); soum = await C.login('contact.sotrap@bal.ci');
  const st = await C.getState(achats);
  assert.deepEqual(st.courriels, { mode: 'microsoft365', expediteur: 'marches@example.org' });
  const emails = [
    { id: 'm-test-1', ev: 'dep.cloture', ids: ['u2', 'inconnu'], a: ['pirate@ailleurs.example'], objet: 'Dossier publié', corps: 'Bonjour.' },
    { id: 'm-test-2', ev: 'dep.cloture', ids: ['u3'], a: [], objet: 'Deuxième message', corps: 'Bonjour.' },
  ];
  assert.equal((await C.patch(achats, { emails: emails.concat(st.emails) })).status, 200);
  await attendre(300);
  // les deux envois partent en parallèle : l'ordre d'arrivée n'est pas garanti
  assert.deepEqual(recus.envois.map((e) => [e.a, e.objet, e.type]).sort((x, y) => x[1].localeCompare(y[1])), [[['m.traore@bal.ci'], 'Deuxième message', 'Text'], [['f.assamoi@bal.ci'], 'Dossier publié', 'Text']]);
  assert.equal(recus.jetons, 1, 'un seul jeton pour deux envois');
  const b = await boite(admin);
  const m1 = b.find((m) => m.id === 'm-test-1');
  assert.deepEqual([m1.statut, m1.a, m1.de], ['envoyé', ['f.assamoi@bal.ci'], 'marches@example.org']);
});

test('un courriel enregistré ne se réécrit pas depuis le navigateur', async () => {
  const b = await boite(admin);
  const falsifie = b.map((m) => (m.id === 'm-test-1' ? { ...m, objet: 'Objet modifié', statut: 'envoyé' } : m));
  assert.equal((await C.patch(admin, { emails: falsifie })).status, 200);
  assert.equal((await boite(admin)).find((m) => m.id === 'm-test-1').objet, 'Dossier publié');
});

test('échec de Microsoft 365 : consigné sur le courriel, l’action n’échoue pas', async () => {
  const st = await C.getState(achats);
  const r = await C.patch(achats, { emails: [{ id: 'm-test-3', ev: 'dep.cloture', ids: ['u2'], objet: 'ECHEC volontaire', corps: 'x' }].concat(st.emails) });
  assert.equal(r.status, 200);
  await attendre(300);
  const m = (await boite(admin)).find((x) => x.id === 'm-test-3');
  assert.equal(m.statut, 'échec');
  assert.match(m.erreur, /503.*ServiceUnavailable/);
});

test('confidentialité : chacun ne voit que ses courriels et les notifications de son rôle', async () => {
  const pourEval = (await boite(evaltech)).map((m) => m.id).sort();
  assert.deepEqual(pourEval, ['m-test-1', 'm-test-3']);
  // le soumissionnaire ne voit pas p1 (non publiée) : il reçoit l'état de l'organisation
  const vueSoum = (await C.call('GET', '/api/organisation/state', null, soum)).json.state;
  assert.deepEqual(vueSoum.emails, []);
  const st = await C.getState(achats);
  const notifs = [{ id: 'n-test-1', ev: 'depot.recu', lab: 'Test', titre: 'Interne', corps: 'Attribution', t: 'x', roles: ['achats'], lu: [] }];
  assert.equal((await C.patch(achats, { notifs: notifs.concat(st.notifs) })).status, 200);
  assert.ok((await C.getState(achats)).notifs.some((n) => n.id === 'n-test-1'));
  assert.ok(!(await C.call('GET', '/api/organisation/state', null, soum)).json.state.notifs.some((n) => n.id === 'n-test-1'), 'notification interne invisible du soumissionnaire');
});

test('inscription : courriel de vérification envoyé au déclarant, avec un lien absolu', async () => {
  const r = await C.inscrire({ raisonSociale: 'Mobilia SARL', pays: 'CI', nom: 'A. Kouassi', email: 'contact@mobilia.example', motDePasse: 'Mobilia2026!x' });
  assert.equal(r.status, 202);
  await attendre(300);
  const m = recus.envois.find((e) => e.a[0] === 'contact@mobilia.example');
  assert.ok(m, 'courriel de vérification envoyé');
  assert.match(m.corps, /https:\/\/marches\.example\.org\/\?verifier=[0-9a-f]{64}/);
});
