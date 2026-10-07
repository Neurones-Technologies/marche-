/* Rappels avant la date limite : à 3 jours puis la veille, aux seules entreprises concernées qui n'ont pas déposé ;
   chaque rappel une seule fois. */
const { call, login, getState, patch, upload, remplir } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');
const Rp = require('../rappels');
const R = require('../../public/js/regles.js');

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.json));
const rappels = async (cookie, pid) => (await getState(cookie, pid)).notifs.filter((n) => n.ev === 'rappel.depot');

test('rappel à 3 jours aux consultés sans offre, une seule fois ; rien la veille une fois l’offre déposée', async () => {
  const achats = await login('y.koffi@bal.ci'), sotrap = await login('contact.sotrap@bal.ci');
  const c = await call('POST', '/api/procedures', { ref: 'AO-2026-095', objet: 'Fournitures de bureau', profil: 'prive' }, achats);
  ok(c, 201); const pid = c.json.id;
  await remplir(achats, pid);
  ok(await patch(achats, { consultes: { mode: 'restreint', partenaires: ['PRT-0001'] } }, pid));
  const dans2j = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  let s = await getState(achats, pid);
  ok(await patch(achats, { cdc: { ...s.cdc, ouverture: dans2j, cdcPublie: true } }, pid));
  const ech = R.echeanceDepot({ ouverture: dans2j });

  assert.equal(Rp.verifier(ech - 50 * 3600000) >= 1, true); // à 50 h : palier « 3 jours »
  let r = await rappels(sotrap, pid);
  assert.equal(r.length, 1);
  assert.match(r[0].titre, /dans 3 jours — AO-2026-095/);
  assert.ok(!(r[0].roles || []).includes('soum'));
  Rp.verifier(ech - 49 * 3600000);
  assert.equal((await rappels(sotrap, pid)).length, 1, 'pas de second rappel pour le même palier');
  assert.ok((await getState(achats, pid)).emails.some((e) => e.ev === 'rappel.depot' && /AO-2026-095/.test(e.objet)));

  // SOTRAP dépose : la veille, plus aucun destinataire
  for (const doc of ['registre', 'fiscal', 'cnps']) await upload(doc, doc + '.pdf', Buffer.from('%PDF-1.4 x'), sotrap, pid);
  s = await getState(achats, pid);
  const lot = s.cdc.lots[0].id;
  ok(await call('POST', `/api/procedures/${pid}/offers`, { name: 'SOTRAP SARL', iso: 'CI', devise: 'XOF', delai: 30, lots: [lot], prixLots: { [lot]: 1000000 } }, sotrap), 201);
  Rp.verifier(ech - 10 * 3600000);
  assert.equal((await rappels(sotrap, pid)).length, 1);
});
