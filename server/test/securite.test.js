/* Audit de sécurité du 06/10/2026 (docs/audit-securite-2026-10-06.md) : ce qu'un compte prestataire ne doit ni voir
   ni écrire. Deux prestataires déposent sur la même procédure ; chacun ne doit rien apprendre de l'autre. Les tests
   s'enchaînent : chacun part de l'état laissé par le précédent. */
// plafonds de stockage réduits pour SEC-04 (lus au chargement des routes)
Object.assign(process.env, { BROUILLON_MAX_MO: '1', BROUILLONS_MAX_MO: '2', PARTENAIRE_MAX_MO: '1' });
const { call, login, getState, patch, upload, clone, inscrire } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.json));
const PDF = Buffer.from('%PDF-1.4 test');
const MDP = 'Concurrent2026!x';
let achats, sotrap, rival;

async function deposer(cookie, name, montant) {
  for (const d of ['registre', 'fiscal', 'cnps', 'caution']) ok(await upload(d, d + '.pdf', PDF, cookie), 201);
  ok(await call('POST', '/api/procedures/p1/offers', { name, iso: 'CI', devise: 'XOF', montant, delai: 90, garantie: 12, refsCount: 2, lots: ['l1'] }, cookie), 201);
}

test('préparation : dossier publié, deux prestataires déposent', async () => {
  achats = await login('y.koffi@bal.ci');
  sotrap = await login('contact.sotrap@bal.ci');
  const s = await getState(achats);
  ok(await patch(achats, { cdc: { ...s.cdc, cdcPublie: true } }));
  const r = await inscrire({ raisonSociale: 'Rival BTP', pays: 'CI', nom: 'R. Concurrent', email: 'contact@rival.ci', motDePasse: MDP });
  ok(r, 202);
  ok(await call('POST', '/api/inscription/verifier', { jeton: r.json.lienVerification.split('=')[1] }));
  const c = await call('POST', '/api/auth/login', { email: 'contact@rival.ci', password: MDP });
  ok(c);
  rival = c.cookie;
  await deposer(sotrap, 'SOTRAP SARL', 91000000);
  await deposer(rival, 'Rival BTP', 88000000);
});

test('SEC-01 : un prestataire ne reçoit que ses propres accusés de dépôt', async () => {
  assert.deepEqual((await getState(sotrap)).receipts.map((x) => x.name), ['SOTRAP SARL']);
  assert.deepEqual((await getState(rival)).receipts.map((x) => x.name), ['Rival BTP']);
  assert.deepEqual((await getState(achats)).receipts.map((x) => x.name).sort(), ['Rival BTP', 'SOTRAP SARL']);
});

test('SEC-02 : un prestataire ne réécrit ni les questions-réponses ni les clarifications', async () => {
  ok(await patch(achats, { qa: [{ question: 'Délai de livraison ?', reponse: 'Quatre-vingt-dix jours.', t: 'test' }] }));
  const qa = (await getState(rival)).qa;
  assert.equal(qa[0].reponse, 'Quatre-vingt-dix jours.');
  assert.equal((await patch(rival, { qa: [{ ...qa[0], reponse: 'Trente jours.' }] })).status, 403);
  assert.equal((await patch(rival, { qa: [] })).status, 403);
  assert.equal((await patch(rival, { clarifs: [] })).status, 403);
  assert.equal((await getState(achats)).qa[0].reponse, 'Quatre-vingt-dix jours.');
});

test('SEC-05 : un prestataire ne dépose pas de recours au nom d’un autre ; l’enregistrement est tracé par le serveur', async () => {
  assert.equal((await patch(rival, { recours: [{ de: 'SOTRAP SARL', statut: 'ouvert', t: '01/01/2020', objet: 'Faux recours.' }] })).status, 403);
  // achats habilité : le recours reçu est enregistré, horodaté par le serveur
  const admin = await login('administrateur@bal.ci');
  const r = await patch(admin, { recours: [{ de: 'Rival BTP', statut: 'ouvert', t: '01/01/2020', objet: 'Contestation.' }] });
  ok(r);
  const rec = (await getState(admin)).recours[0];
  assert.ok(rec.par && rec.enregistre);
  // la décision, envoyée sans ces champs, ne les efface pas
  const { par, enregistre, ...sans } = rec;
  ok(await patch(admin, { recours: [{ ...sans, statut: 'rejete', decision: 'Non fondé.' }] }));
  assert.deepEqual([(await getState(admin)).recours[0].par, (await getState(admin)).recours[0].enregistre], [par, enregistre]);
});

test('SEC-03 : un prestataire n’émet ni courriel ni notification ; le serveur annonce son dépôt', async () => {
  const s = await getState(rival);
  const courriel = { id: 'm-pirate', ev: 'dep.cloture', ids: ['u1', 'u2'], objet: 'Nouveau RIB', corps: 'Merci de payer sur ce compte.' };
  assert.equal((await patch(rival, { emails: [courriel].concat(s.emails) })).status, 403);
  const notif = { id: 'n-pirate', ev: 'depot.recu', titre: 'Urgent', corps: 'Cliquez ici', roles: ['achats'], lu: [] };
  assert.equal((await patch(rival, { notifs: [notif].concat(s.notifs) })).status, 403);
  const vu = await getState(achats);
  assert.ok(!vu.emails.some((m) => m.id === 'm-pirate') && !vu.notifs.some((n) => n.id === 'n-pirate'));
  // le dépôt de Rival BTP a été annoncé par le serveur aux achats (règle depot.recu)
  assert.ok(vu.notifs.some((n) => n.ev === 'depot.recu' && n.titre === 'Nouveau dépôt — Rival BTP'));
  assert.ok(vu.emails.some((m) => m.ev === 'depot.recu' && m.objet.includes('Rival BTP') && m.ids.includes('u1')));
});

test('SEC-03 : un événement inconnu est refusé ; destinataires et contenu figés par le serveur', async () => {
  const s = await getState(achats);
  const r = await patch(achats, { emails: [{ id: 'm-x', ev: 'inexistant', ids: ['u2'], objet: 'x', corps: 'x' }].concat(s.emails) });
  assert.equal(r.status, 422); assert.equal(r.json.code, 'EVENT_UNKNOWN');
  // appro.attendue vise les approbateurs : un évaluateur désigné en plus est ignoré
  ok(await patch(achats, { emails: [{ id: 'm-y', ev: 'appro.attendue', ids: ['u2', 'u4'], objet: 'Approbation', corps: 'x' }].concat(s.emails) }));
  assert.deepEqual((await getState(achats)).emails.find((m) => m.id === 'm-y').ids, ['u4']);
  // une notification enregistrée ne se réécrit pas ; chacun ne marque lu que pour lui-même
  const n = (await getState(achats)).notifs.find((x) => x.ev === 'depot.recu');
  const notifs = (await getState(achats)).notifs.map((x) => (x.id === n.id ? { ...x, titre: 'Modifié', lu: ['u1', 'u4'] } : x));
  ok(await patch(achats, { notifs }));
  const apres = (await getState(achats)).notifs.find((x) => x.id === n.id);
  assert.equal(apres.titre, n.titre);
  assert.deepEqual(apres.lu, ['u1']);
});

test('SEC-04 : pièces déposées sans compte plafonnées, par brouillon et pour l’ensemble des brouillons', async () => {
  const base = require('./_client').base();
  const gros = Buffer.concat([Buffer.from('%PDF-1.4 '), Buffer.alloc(700 * 1024)]);
  const brouillon = async () => (await call('POST', '/api/inscription/brouillon', {})).json.brouillon;
  const deposer = (jeton, doc, expire) => fetch(base + '/api/inscription/brouillon/pieces?doc=' + doc + (expire ? '&expire=' + expire : ''),
    { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-filename': doc + '.pdf', 'x-brouillon': jeton }, body: gros }).then((r) => r.status);
  const a = await brouillon();
  assert.equal(await deposer(a, 'registre'), 201);
  assert.equal(await deposer(a, 'registre'), 201); // remplacement : l'ancienne version ne compte plus
  assert.equal(await deposer(a, 'fiscal', '2099-12-31'), 413); // 1,4 Mo > 1 Mo pour ce brouillon
  assert.equal(await deposer(await brouillon(), 'registre'), 201); // 1,4 Mo au total
  assert.equal(await deposer(await brouillon(), 'registre'), 503); // 2,1 Mo > 2 Mo pour l'espace
});

test('SEC-04 : volume des pièces d’une fiche partenaire plafonné', async () => {
  const id = (await call('GET', '/api/partenaires/moi', null, sotrap)).json.partenaire.id;
  const gros = Buffer.concat([Buffer.from('%PDF-1.4 '), Buffer.alloc(600 * 1024)]);
  const deposer = () => fetch(require('./_client').base() + `/api/partenaires/${id}/fichiers?doc=registre`,
    { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-filename': 'registre.pdf', cookie: sotrap }, body: gros }).then((r) => r.status);
  assert.equal(await deposer(), 201);
  assert.equal(await deposer(), 413); // la version remplacée reste archivée : 1,2 Mo > 1 Mo
});

test('SEC-06 : un prestataire ne reçoit ni le personnel ni ce qui concerne ses concurrents', async () => {
  const offres = (await getState(achats)).offers;
  const deSotrap = offres.find((o) => o.name === 'SOTRAP SARL').id;
  const s = await getState(achats);
  ok(await patch(achats, { clarifs: s.clarifs.concat([{ offerId: deSotrap, objet: 'Prix', question: 'Détaillez le lot 1.', statut: 'envoyee', t: 'test' }]) }));
  const vueRival = await getState(rival), vueSotrap = await getState(sotrap);
  assert.deepEqual(vueRival.users.map((u) => u.nom), ['R. Concurrent']);
  assert.deepEqual([vueRival.coi, vueRival.rejets, vueRival.notifRules, vueRival.circuitModele], [{}, [], {}, []]);
  assert.ok(vueRival.approvals.every((a) => !('by' in a) && !('who' in a)));
  // la clarification adressée à SOTRAP : à SOTRAP seule ; le recours de Rival BTP : à Rival BTP seul
  assert.equal(vueRival.clarifs.length, 0);
  assert.equal(vueSotrap.clarifs.length, 1);
  assert.deepEqual(vueRival.recours.map((x) => x.de), ['Rival BTP']);
  assert.equal(vueSotrap.recours.length, 0);
  // le personnel garde la vue complète
  const vueAchats = await getState(achats);
  assert.ok(vueAchats.users.length > 2 && vueAchats.clarifs.length === 1 && vueAchats.recours.length === 1);
});

test('INF-02 : un nouveau mot de passe ferme les autres sessions du compte', async () => {
  const ailleurs = (await call('POST', '/api/auth/login', { email: 'contact@rival.ci', password: MDP })).cookie;
  const r = await call('POST', '/api/auth/password', { current: MDP, next: 'Nouveau2026!x' }, rival);
  ok(r);
  assert.equal((await call('GET', '/api/auth/me', null, ailleurs)).status, 401);
  assert.equal((await call('GET', '/api/auth/me', null, rival)).status, 401); // l'ancien jeton de cette session aussi
  ok(await call('GET', '/api/auth/me', null, r.cookie)); // le jeton reçu en réponse reste valable
});

test('INF-01 : courriel d’un compte contrôlé à la modification', async () => {
  const admin = await login('administrateur@bal.ci');
  assert.equal((await call('PATCH', '/api/auth/users/u2', { email: '<x>@y.z ' + 'a' }, admin)).status, 422);
  ok(await call('PATCH', '/api/auth/users/u2', { email: 'f.assamoi@bal.ci' }, admin));
});
