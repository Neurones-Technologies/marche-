/* Notifications et courriels destinés aux fournisseurs : seuls ceux de la procédure les reçoivent (partenaires consultés,
   auteurs d'une offre), jamais tous les comptes fournisseurs de l'espace. */
const { call, login, getState, patch, inscrire, remplir, upload } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.json));
const MDP = 'Absent2026!xyz';

test('publication aux seuls consultés, résultat aux seuls auteurs d’une offre', async () => {
  const achats = await login('y.koffi@bal.ci'), sotrap = await login('contact.sotrap@bal.ci');
  // un autre fournisseur, inscrit et vérifié, mais non consulté sur cette consultation
  const r = await inscrire({ raisonSociale: 'Absent SARL', pays: 'CI', nom: 'B. Absent', email: 'contact@absent.ci', motDePasse: MDP });
  ok(await call('POST', '/api/inscription/verifier', { jeton: r.json.lienVerification.split('=')[1] }));
  const absent = (await call('POST', '/api/auth/login', { email: 'contact@absent.ci', password: MDP })).cookie;

  const c = await call('POST', '/api/procedures', { ref: 'AO-2026-070', objet: 'Mobilier de bureau', profil: 'prive' }, achats);
  ok(c, 201);
  const pid = c.json.id;
  await remplir(achats, pid);
  ok(await patch(achats, { consultes: { mode: 'restreint', partenaires: ['PRT-0001'] } }, pid)); // SOTRAP seule
  const s = await getState(achats, pid);
  ok(await patch(achats, { cdc: { ...s.cdc, cdcPublie: true } }, pid));

  // le navigateur de l'acheteur annonce la publication et l'attribution à la règle (rôles achats, soum…)
  const n = (await getState(achats, pid)).notifs;
  ok(await patch(achats, { notifs: [
    { id: 'n-pub', ev: 'cdc.publie', lab: 'Publication', titre: 'Cahier des charges publié', corps: 'AO-2026-070 publié.', roles: ['achats', 'soum'], lu: [] },
    { id: 'n-attr', ev: 'attribution', lab: 'Attribution', titre: 'Attribution prononcée', corps: 'Attribué à SOTRAP pour 40 000 000 XOF.', roles: ['achats', 'soum'], lu: [] },
  ].concat(n) }, pid));
  const ids = (st) => st.notifs.map((x) => x.id);
  let vueSotrap = await getState(sotrap, pid);
  assert.ok(ids(vueSotrap).includes('n-pub'), 'le fournisseur consulté est prévenu de la publication');
  assert.ok(!ids(vueSotrap).includes('n-attr'), 'sans offre déposée, il ne reçoit pas le résultat');
  const vueAbsent = (await call('GET', '/api/organisation/state', null, absent)).json.state;
  assert.ok(!ids(vueAbsent).includes('n-pub') && !ids(vueAbsent).includes('n-attr'), 'le fournisseur non consulté ne reçoit rien');
  assert.ok(ids(await getState(achats, pid)).includes('n-attr'), 'les achats restent destinataires');

  // courriel : même ciblage (les comptes désignés hors de la procédure sont écartés)
  const tous = (await call('GET', '/api/auth/users', null, await login('administrateur@bal.ci'))).json;
  const soumissionnaires = tous.filter((u) => u.role === 'soum').map((u) => u.id);
  assert.ok(soumissionnaires.length >= 2);
  // SOTRAP dépose une offre : le résultat la concerne désormais
  for (const doc of ['registre', 'fiscal', 'cnps']) await upload(doc, doc + '.pdf', Buffer.from('%PDF-1.4 x'), sotrap, pid);
  const lot = (await getState(achats, pid)).cdc.lots[0].id;
  ok(await call('POST', `/api/procedures/${pid}/offers`, { name: 'SOTRAP SARL', iso: 'CI', devise: 'XOF', delai: 30, lots: [lot], prixLots: { [lot]: 1000000 } }, sotrap), 201);
  ok(await patch(achats, { notifs: [{ id: 'n-attr2', ev: 'attribution', lab: 'Attribution', titre: 'Attribution prononcée', corps: 'x', roles: ['achats', 'soum'], lu: [] }].concat((await getState(achats, pid)).notifs) }, pid));
  vueSotrap = await getState(sotrap, pid);
  assert.ok(ids(vueSotrap).includes('n-attr2'), 'auteur d’une offre : il reçoit le résultat');
  const em = (await getState(achats, pid)).emails;
  ok(await patch(achats, { emails: [{ id: 'm-attr', ev: 'attribution', ids: soumissionnaires, objet: 'Attribution', corps: 'x' }].concat(em) }, pid));
  const m = (await getState(achats, pid)).emails.find((x) => x.id === 'm-attr');
  const idSotrap = tous.find((u) => u.email === 'contact.sotrap@bal.ci').id;
  assert.deepEqual(m.ids, [idSotrap]);
});
