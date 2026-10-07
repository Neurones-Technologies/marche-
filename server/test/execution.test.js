/* Exécution par le titulaire : accusé de réception du bon de commande, livraisons déclarées (bon de livraison joint)
   puis constatées par le réceptionnaire, factures déposées, rapprochées, acceptées pour paiement ou rejetées. */
const { call, login, getState, patch, upload } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.json));
const refusé = (r, status, code) => { assert.equal(r.status, status, JSON.stringify(r.json)); if (code) assert.equal(r.json.code, code); };
const PDF = Buffer.from('%PDF-1.4 test');
let admin, achats, approb, sotrap, cmd, pid;
const U = (p = '') => `/api/commandes/${cmd.id}${p}`;
const joindre = (doc, nom) => fetch(require('./_client').base() + U('/fichiers?doc=' + doc),
  { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-filename': nom, cookie: sotrap }, body: PDF }).then(async (x) => ({ status: x.status, json: await x.json() }));

test('préparation : commande émise au titulaire SOTRAP', async () => {
  admin = await login('administrateur@bal.ci'); achats = await login('y.koffi@bal.ci'); approb = await login('a.diomande@bal.ci');
  sotrap = await login('contact.sotrap@bal.ci');
  const c = await call('POST', '/api/procedures', { ref: 'AO-2026-080', objet: 'Postes de travail', profil: 'prive' }, achats);
  ok(c, 201); pid = c.json.id;
  await require('./_client').remplir(achats, pid);
  const s0 = await getState(admin, pid);
  ok(await patch(admin, { org: { ...s0.org, reglages: { niveauxApprobationMin: 1 } }, approvals: s0.approvals.slice(0, 1) }, pid));
  ok(await patch(achats, { consultes: { mode: 'restreint', partenaires: ['PRT-0001'] } }, pid));
  ok(await patch(achats, { cdc: { ...s0.cdc, cdcPublie: true, ligneBudget: 'b-dsi-inv' } }, pid));
  for (const doc of ['registre', 'fiscal', 'cnps', 'caution']) ok(await upload(doc, doc + '.pdf', PDF, sotrap, pid), 201);
  ok(await call('POST', `/api/procedures/${pid}/offers`, { name: 'SOTRAP Ingénierie SA', iso: 'CI', devise: 'XOF', montant: 10000000, delai: 45, lots: [s0.cdc.lots[0].id] }, sotrap), 201);
  ok(await patch(achats, { depClosed: true }, pid));
  ok(await patch(await login('m.traore@bal.ci'), { evalDone: true }, pid));
  ok(await call('POST', `/api/procedures/${pid}/approbations/0`, {}, approb));
  cmd = (await call('POST', '/api/commandes', { procedure: pid }, achats)).json.commande;
  ok(await call('PUT', U(), { lignes: [{ designation: 'Poste de travail', quantite: 10, unite: 'poste', prixUnitaire: 1000000 }] }, achats));
  const s = await call('POST', U('/soumettre'), {}, achats); ok(s);
  if (s.json.commande.statut === 'validation') ok(await call('POST', U('/approbations/0'), {}, approb));
  ok(await call('POST', U('/emettre'), {}, achats));
});

test('titulaire : voit sa commande sans le circuit interne, en accuse réception', async () => {
  const vue = (await call('GET', '/api/commandes', null, sotrap)).json.commandes.find((x) => x.id === cmd.id);
  assert.ok(vue && vue.numero);
  assert.equal(vue.circuit, undefined); assert.equal(vue.historique, undefined);
  refusé(await call('POST', U('/accuse'), {}, achats), 403, 'NOT_HOLDER');
  ok(await call('POST', U('/accuse'), {}, sotrap));
  refusé(await call('POST', U('/accuse'), {}, sotrap), 409, 'ALREADY_ACKNOWLEDGED');
});

test('livraison déclarée avec son bon, puis constatée par le réceptionnaire', async () => {
  refusé(await joindre('autre', 'x.pdf'), 422);
  const bl = await joindre('bon-livraison', 'bl-001.pdf'); ok(bl, 201);
  refusé(await call('POST', U('/livraisons'), { quantites: [11], date: '2026-01-01' }, sotrap), 422, 'DELIVERY_EXCEEDS_ORDER');
  const r = await call('POST', U('/livraisons'), { quantites: [6], bon: bl.json.id, commentaire: 'Première partie' }, sotrap);
  ok(r, 201);
  assert.equal(r.json.commande.livraisons[0].bon.name, 'bl-001.pdf');
  ok(await call('GET', '/api/files/' + bl.json.id, null, achats)); // les achats ouvrent le bon de livraison
  const rc = await call('POST', U('/receptions'), { quantites: [6], livraison: 1 }, achats); ok(rc, 201);
  assert.equal(rc.json.commande.livraisons[0].statut, 'constatee');
});

test('factures : contrôles, rejet motivé, acceptation pour paiement, export', async () => {
  const fa = await joindre('facture', 'fa-2026-01.pdf'); ok(fa, 201);
  const F = { numero: 'FA-2026-01', date: '2026-01-15', montantHT: 3000000, jalon: 0, fichier: fa.json.id };
  refusé(await call('POST', U('/factures'), { ...F, fichier: null }, sotrap), 422, 'INVOICE_FILE_REQUIRED');
  refusé(await call('POST', U('/factures'), { ...F, montantHT: 99000000 }, sotrap), 422, 'INVOICE_EXCEEDS_ORDER');
  const r = await call('POST', U('/factures'), F, sotrap); ok(r, 201);
  const f = r.json.commande.factures[0];
  assert.equal(f.attendu, 3000000); // 30 % de 10 millions : premier jalon
  assert.equal(f.montantTTC, Math.round(3000000 * (1 + f.tva / 100) * 100) / 100);
  refusé(await call('POST', U('/factures'), { ...F, numero: 'FA-2026-02' }, sotrap), 409, 'MILESTONE_INVOICED');
  refusé(await call('POST', U('/factures/1/decision'), { decision: 'acceptee' }, sotrap), 403);
  refusé(await call('POST', U('/factures/1/decision'), { decision: 'rejetee' }, achats), 422, 'REASON_REQUIRED');
  ok(await call('POST', U('/factures/1/decision'), { decision: 'rejetee', motif: 'Numéro de commande absent de la facture.' }, achats));
  // nouvelle facture sur le même jalon après rejet, acceptée : service fait constaté
  const fa2 = await joindre('facture', 'fa-2026-01b.pdf');
  ok(await call('POST', U('/factures'), { ...F, numero: 'FA-2026-01B', fichier: fa2.json.id }, sotrap), 201);
  const a = await call('POST', U('/factures/2/decision'), { decision: 'acceptee' }, achats); ok(a);
  assert.equal(a.json.commande.factures[1].statut, 'acceptee');
  const csv = await fetch(require('./_client').base() + '/api/commandes/factures.csv', { headers: { cookie: achats } }).then((x) => x.text());
  assert.match(csv, /FA-2026-01B/); assert.doesNotMatch(csv, /"FA-2026-01";/);
  const notifs = (await getState(sotrap, pid)).notifs;
  assert.ok(notifs.some((n) => /FA-2026-01B acceptée/.test(n.titre)));
});
