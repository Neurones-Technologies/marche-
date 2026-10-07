/* Messagerie SMTP de l'organisation : réglage réservé à l'administrateur, mot de passe chiffré et jamais renvoyé,
   courriel de test, et courriels de la plateforme envoyés par ce serveur (serveur SMTP local de test). */
process.env.SMTP_RESEAU_LOCAL = '1';
const net = require('net');
const { call, login, getState } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.json));
const recus = []; let auth = null, port;
const srv = net.createServer((sock) => {
  let data = false, buf = '', msg = '';
  sock.write('220 test ESMTP\r\n');
  sock.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      const l = buf.slice(0, i); buf = buf.slice(i + 2);
      if (data) { if (l === '.') { data = false; recus.push(msg); msg = ''; sock.write('250 OK\r\n'); } else msg += l + '\n'; continue; }
      const u = l.toUpperCase();
      if (u.startsWith('EHLO')) sock.write('250-test\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n');
      else if (u.startsWith('AUTH PLAIN')) { auth = Buffer.from(l.split(' ')[2] || '', 'base64').toString(); sock.write('235 OK\r\n'); }
      else if (u === 'DATA') { data = true; sock.write('354 go\r\n'); }
      else if (u === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
      else sock.write('250 OK\r\n');
    }
  });
});
test.before(() => new Promise((r) => srv.listen(0, '127.0.0.1', () => { port = srv.address().port; r(); })));
test.after(() => srv.close());
const attendre = async (n) => { for (let i = 0; i < 100 && recus.length < n; i++) await new Promise((x) => setTimeout(x, 30)); };

test('réglage SMTP : administrateur seul, mot de passe chiffré et jamais renvoyé', async () => {
  const admin = await login('administrateur@bal.ci'), achats = await login('y.koffi@bal.ci');
  assert.equal((await call('GET', '/api/messagerie/smtp', null, achats)).status, 403);
  const base = { hote: '127.0.0.1', port, securite: 'aucune', utilisateur: 'achats@bal.ci', motDePasse: 'Secret-SMTP-42', expediteur: 'achats@bal.ci', nomExpediteur: 'BAL Achats', actif: true };
  assert.equal((await call('PUT', '/api/messagerie/smtp', { ...base, hote: 'pas un hôte' }, admin)).json.code, 'SMTP_HOST');
  assert.equal((await call('PUT', '/api/messagerie/smtp', { ...base, expediteur: '' }, admin)).json.code, 'SMTP_INCOMPLETE');
  const r = await call('PUT', '/api/messagerie/smtp', base, admin);
  ok(r);
  assert.equal(r.json.mode, 'smtp');
  assert.equal(r.json.configuration.motDePasseEnregistre, true);
  assert.ok(!JSON.stringify(r.json).includes('Secret-SMTP-42'));
  assert.ok(!JSON.stringify(await getState(admin)).includes('smtp'), 'le réglage ne part pas avec l’état');
  const brut = require('../db').kvGet('smtp').value.motDePasse;
  assert.ok(brut && !brut.includes('Secret-SMTP-42'), 'chiffré dans la base');
  // ré-enregistrer sans mot de passe le garde
  ok(await call('PUT', '/api/messagerie/smtp', { ...base, motDePasse: '' }, admin));
  assert.equal((await call('GET', '/api/messagerie/smtp', null, admin)).json.configuration.motDePasseEnregistre, true);
});

test('courriel de test, puis un courriel de la plateforme part par ce serveur', async () => {
  const admin = await login('administrateur@bal.ci');
  const t = await call('POST', '/api/messagerie/smtp/test', {}, admin);
  ok(t);
  await attendre(1);
  assert.match(recus[0], /Subject: =?.*test|courriel de test/i);
  assert.match(recus[0], /From: .*achats@bal\.ci/);
  assert.equal(auth.split('\u0000').pop(), 'Secret-SMTP-42'); // authentifié avec le mot de passe déchiffré
  const o = await call('POST', '/api/auth/oubli', { email: 'y.koffi@bal.ci' });
  ok(o);
  assert.equal(o.json.lien, undefined, 'envoi réel : le lien ne s’affiche plus');
  await attendre(2);
  assert.ok(recus.some((m) => /y\.koffi@bal\.ci/.test(m) && /reinit=/.test(m.replace(/=\n/g, ''))));
});
