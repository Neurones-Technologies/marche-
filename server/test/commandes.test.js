/* Module 4 : bon de commande (établissement, validation, émission numérotée et scellée), réceptions, rapprochement
   commande / réception, réserves, réception définitive, annulation sans trou de numérotation, export comptable.
   Les tests s'enchaînent sur une procédure en achats privés menée jusqu'à l'attribution. */
const { call, login, getState, patch, upload } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.json));
const refusé = (r, status, code) => { assert.equal(r.status, status, JSON.stringify(r.json)); if (code) assert.equal(r.json.code, code); };
const PDF = Buffer.from('%PDF-1.4 test');
let admin, achats, approb, sotrap, evaltech, demandeur, pid, montant, cmd;

test('préparation : procédure privée attribuée à SOTRAP (partenaire référencé)', async () => {
  admin = await login('administrateur@bal.ci'); achats = await login('y.koffi@bal.ci'); approb = await login('a.diomande@bal.ci');
  sotrap = await login('contact.sotrap@bal.ci'); evaltech = await login('f.assamoi@bal.ci'); demandeur = await login('k.yao@bal.ci');
  refusé(await call('POST', '/api/commandes', { procedure: 'p1' }, sotrap), 403);
  refusé(await call('POST', '/api/commandes', { procedure: 'p1' }, achats), 409, 'PROCEDURE_NOT_ELIGIBLE');
  const c = await call('POST', '/api/procedures', { ref: 'AO-2026-060', objet: 'Postes de travail', profil: 'prive' }, achats);
  ok(c, 201); pid = c.json.id;
  const s0 = await getState(admin, pid);
  ok(await patch(admin, { org: { ...s0.org, reglages: { niveauxApprobationMin: 1 } }, approvals: s0.approvals.slice(0, 1) }, pid));
  ok(await patch(achats, { cdc: { ...s0.cdc, cdcPublie: true } }, pid));
  for (const doc of ['registre', 'fiscal', 'cnps', 'caution']) ok(await upload(doc, doc + '.pdf', PDF, sotrap, pid), 201);
  montant = 24000000;
  ok(await call('POST', `/api/procedures/${pid}/offers`, { name: 'SOTRAP Ingénierie SA', iso: 'CI', devise: 'XOF', montant, delai: 45, lots: [s0.cdc.lots[0].id] }, sotrap), 201);
  ok(await patch(achats, { depClosed: true }, pid));
  ok(await patch(await login('m.traore@bal.ci'), { evalDone: true }, pid));
  ok(await call('POST', `/api/procedures/${pid}/approbations/0`, {}, approb));
});

test('établissement : pré-rempli depuis l’offre retenue, contrôles du brouillon', async () => {
  const el = (await call('GET', '/api/commandes/eligibles', null, achats)).json.procedures;
  assert.deepEqual(el.map((x) => [x.procedure, x.titulaire, x.restant]), [[pid, 'SOTRAP Ingénierie SA', montant]]);
  const r = await call('POST', '/api/commandes', { procedure: pid }, achats);
  ok(r, 201); cmd = r.json.commande;
  assert.equal(cmd.statut, 'brouillon');
  assert.equal(cmd.numero, null, 'le numéro n’est attribué qu’à l’émission');
  assert.equal(cmd.total, montant);
  assert.equal(cmd.titulaire.partenaire, 'PRT-0001');
  assert.equal(cmd.jalons.reduce((t, j) => t + j.pourcentage, 0), 100);
  const U = `/api/commandes/${cmd.id}`;
  refusé(await call('PUT', U, { jalons: [{ libelle: 'Tout', pourcentage: 90 }] }, achats), 422, 'MILESTONES_INVALID');
  refusé(await call('PUT', U, { lignes: [{ designation: 'Postes', quantite: 10, unite: 'poste', prixUnitaire: 3000000 }] }, achats), 422, 'AMOUNT_EXCEEDED');
  const lignes = [{ designation: 'Poste de travail', quantite: 10, unite: 'poste', prixUnitaire: 1500000 }, { designation: 'Installation', quantite: 1, unite: 'forfait', prixUnitaire: 2000000 }];
  const m = await call('PUT', U, { lignes, receptionnaire: 'u7', dateLivraison: '2020-01-01' }, achats);
  ok(m);
  assert.equal(m.json.commande.total, 17000000);
  assert.equal(m.json.commande.receptionnaire.nom, 'K. Yao');
});

test('validation : circuit selon le montant, séparation des fonctions, rejet motivé', async () => {
  const U = `/api/commandes/${cmd.id}`;
  let r = await call('POST', U + '/soumettre', {}, achats);
  ok(r);
  assert.equal(r.json.commande.statut, 'validation');
  assert.deepEqual(r.json.commande.circuit.map((e) => e.requis), [true, false], 'visa du comité au-delà de 100 millions seulement');
  refusé(await call('POST', U + '/approbations/0', {}, achats), 403);
  refusé(await call('POST', U + '/rejet', { motif: '' }, approb), 422, 'REJECTION_REASON_REQUIRED');
  ok(await call('POST', U + '/rejet', { motif: 'Préciser la configuration des postes.' }, approb));
  ok(await call('PUT', U, { lignes: [{ designation: 'Poste de travail i5, 16 Go', quantite: 10, unite: 'poste', prixUnitaire: 1500000 }, { designation: 'Installation', quantite: 1, unite: 'forfait', prixUnitaire: 2000000 }] }, achats));
  ok(await call('POST', U + '/soumettre', {}, achats));
  refusé(await call('POST', U + '/emettre', {}, achats), 409, 'ORDER_NOT_VALIDATED');
  r = await call('POST', U + '/approbations/0', {}, approb);
  ok(r);
  assert.equal(r.json.commande.statut, 'validee');
});

test('émission : numéro continu et empreinte posés par le serveur, document figé', async () => {
  const U = `/api/commandes/${cmd.id}`;
  const r = await call('POST', U + '/emettre', {}, achats);
  ok(r);
  cmd = r.json.commande;
  assert.match(cmd.numero, /^BC-\d{4}-0001$/);
  assert.match(cmd.empreinte, /^[0-9a-f]{64}$/);
  refusé(await call('PUT', U, { lignes: cmd.lignes }, achats), 409, 'ORDER_LOCKED');
  // transmise au titulaire par le portail ; visible du réceptionnaire ; invisible des autres
  assert.deepEqual((await call('GET', '/api/commandes', null, sotrap)).json.commandes.map((c) => c.numero), [cmd.numero]);
  assert.equal((await call('GET', '/api/commandes', null, demandeur)).json.commandes.length, 1);
  assert.deepEqual((await call('GET', '/api/commandes', null, evaltech)).json.commandes, []);
  const st = await getState(achats, pid);
  assert.ok(st.audit.some((e) => e.a.startsWith(`Commande ${cmd.numero} — émise`)));
});

test('réceptions : par le réceptionnaire, rapprochement, réserves, retard et pénalités, réception définitive', async () => {
  const U = `/api/commandes/${cmd.id}`;
  refusé(await call('POST', U + '/receptions', { quantites: [5, 0] }, achats), 403, 'NOT_RECEIVER');
  refusé(await call('POST', U + '/receptions', { quantites: [11, 0] }, demandeur), 422, 'RECEPTION_EXCEEDS_ORDER');
  let r = await call('POST', U + '/receptions', { quantites: [6, 0], reserves: 'Deux écrans rayés.' }, demandeur);
  ok(r, 201);
  assert.equal(r.json.commande.statut, 'en_reception');
  assert.deepEqual(r.json.commande.rapprochement.map((x) => x.ecart), [4, 1]);
  refusé(await call('POST', U + '/definitive', {}, demandeur), 409, 'NOT_PROVISIONALLY_RECEIVED');
  r = await call('POST', U + '/receptions', { quantites: [4, 1] }, demandeur);
  ok(r, 201);
  const c = r.json.commande;
  assert.equal(c.statut, 'receptionnee');
  assert.ok(c.retard > 2000, 'livraison prévue le 1er janvier 2020 : retard constaté');
  assert.equal(c.penalite, Math.round(c.total * 0.10), 'pénalité plafonnée à 10 % du montant');
  refusé(await call('POST', U + '/definitive', {}, demandeur), 409, 'RESERVES_OPEN');
  refusé(await call('POST', U + '/receptions/1/levee', { motif: '' }, demandeur), 422);
  ok(await call('POST', U + '/receptions/1/levee', { motif: 'Écrans remplacés.' }, demandeur));
  refusé(await call('POST', U + '/definitive', {}, demandeur), 422, 'QUALITY_REQUIRED');
  r = await call('POST', U + '/definitive', { qualite: 4, commentaire: 'Bon matériel, livraison tardive.' }, demandeur);
  ok(r);
  assert.equal(r.json.commande.statut, 'cloturee');
  // évaluation du titulaire : délais 0 (retard), conformité 50 (une réception sur deux avec réserves),
  // complétude 0 (rien livré à la date prévue), qualité 75 (4 sur 5) ; poids 30/30/20/20 → 30/100, sous le seuil de 60
  const ev = r.json.commande.evaluation;
  assert.deepEqual(ev.scores, { delais: 0, conformite: 50, completude: 0, qualite: 75 });
  assert.equal(ev.note, 30);
  assert.equal(ev.partenaire, 'PRT-0001');
  assert.deepEqual([r.json.evaluationPartenaire.moyenne, r.json.evaluationPartenaire.alerte], [30, true]);
  refusé(await call('POST', U + '/annuler', { motif: 'x' }, achats), 409, 'ORDER_NOT_CANCELLABLE');
});

test('annulation motivée : le numéro reste attribué, pas de trou dans la numérotation', async () => {
  const el = (await call('GET', '/api/commandes/eligibles', null, achats)).json.procedures[0];
  assert.equal(el.restant, montant - 17000000);
  const emettre = async () => {
    const c = (await call('POST', '/api/commandes', { procedure: pid }, achats)).json.commande;
    ok(await call('PUT', `/api/commandes/${c.id}`, { lignes: [{ designation: 'Complément', quantite: 1, unite: 'forfait', prixUnitaire: 1000000 }] }, achats));
    ok(await call('POST', `/api/commandes/${c.id}/soumettre`, {}, achats));
    ok(await call('POST', `/api/commandes/${c.id}/approbations/0`, {}, approb));
    return (await call('POST', `/api/commandes/${c.id}/emettre`, {}, achats)).json.commande;
  };
  const c2 = await emettre();
  assert.match(c2.numero, /-0002$/);
  refusé(await call('POST', `/api/commandes/${c2.id}/annuler`, { motif: '' }, achats), 422, 'REASON_REQUIRED');
  const a = await call('POST', `/api/commandes/${c2.id}/annuler`, { motif: 'Doublon.' }, achats);
  ok(a);
  assert.equal(a.json.commande.numero, c2.numero);
  const c3 = await emettre();
  assert.match(c3.numero, /-0003$/);
  c3id = c3.id;
});

let c3id;
test('avenant : motivé, validé, émis sous un numéro dérivé, jamais sous les quantités reçues', async () => {
  const U = `/api/commandes/${c3id}`;
  // une livraison partielle d'abord (le réceptionnaire est l'acheteur qui a établi la commande)
  ok(await call('POST', U + '/receptions', { quantites: [1] }, achats), 201);
  const base = { lignes: [{ designation: 'Complément', quantite: 2, unite: 'forfait', prixUnitaire: 1000000 }, { designation: 'Formation', quantite: 1, unite: 'jour', prixUnitaire: 500000 }], dateLivraison: '2027-03-31' };
  refusé(await call('POST', U + '/avenants', { ...base, motif: '' }, achats), 422, 'REASON_REQUIRED');
  refusé(await call('POST', U + '/avenants', { ...base, lignes: [], motif: 'x' }, achats), 422, 'AMENDMENT_INVALID');
  refusé(await call('POST', U + '/avenants', { ...base, lignes: [{ ...base.lignes[0], quantite: 0 }], motif: 'x' }, achats), 422, 'AMENDMENT_BELOW_RECEIVED');
  refusé(await call('POST', U + '/avenants', { ...base, lignes: [{ ...base.lignes[0], prixUnitaire: 90000000 }], motif: 'x' }, achats), 422, 'AMOUNT_EXCEEDED');
  let r = await call('POST', U + '/avenants', { ...base, motif: 'Extension du périmètre : un second forfait et une journée de formation.' }, achats);
  ok(r, 201);
  assert.equal(r.json.commande.avenants[0].statut, 'validation');
  refusé(await call('POST', U + '/avenants', { ...base, motif: 'Doublon' }, achats), 409, 'AMENDMENT_PENDING');
  refusé(await call('POST', U + '/annuler', { motif: 'x' }, achats), 409);
  refusé(await call('POST', U + '/avenants/1/emettre', {}, achats), 409, 'AMENDMENT_NOT_VALIDATED');
  ok(await call('POST', U + '/avenants/1/approbations/0', {}, approb));
  r = await call('POST', U + '/avenants/1/emettre', {}, achats);
  ok(r);
  const c = r.json.commande;
  assert.match(c.avenants[0].numero, /^BC-\d{4}-0003-A1$/);
  assert.match(c.avenants[0].empreinte, /^[0-9a-f]{64}$/);
  assert.equal(c.total, 2500000);
  assert.equal(c.version, 1);
  assert.equal(c.versions[0].lignes[0].quantite, 1, 'version précédente conservée');
  assert.equal(c.statut, 'en_reception', 'reste à livrer après l’avenant');
  assert.deepEqual(c.rapprochement.map((x) => x.ecart), [1, 1]);
});

test('évaluation : visible des acheteurs et des évaluateurs, hors classement ; réglages contrôlés', async () => {
  const p = (await call('GET', '/api/partenaires', null, achats)).json.partenaires.find((x) => x.id === 'PRT-0001');
  assert.equal(p.evaluation.moyenne, 30);
  assert.equal(p.evaluations.length, 1);
  const st = await getState(achats, pid);
  assert.ok(st.audit.some((e) => e.a.includes('alerte d’évaluation : 30/100')), 'alerte consignée à la piste d’audit');
  const parOffre = Object.values(st.evaluationsOffres);
  assert.deepEqual(parOffre.map((x) => [x.partenaire, x.moyenne, x.alerte]), [['PRT-0001', 30, true]]);
  assert.equal((await getState(sotrap, pid)).evaluationsOffres, undefined, 'le soumissionnaire ne voit pas les notes');
  const reg = st.evaluationPartenaires;
  refusé(await patch(admin, { evaluationPartenaires: { ...reg, criteres: { ...reg.criteres, qualite: 50 } } }, pid), 422, 'EVALUATION_INVALID');
  ok(await patch(admin, { evaluationPartenaires: { ...reg, seuilAlerte: 25 } }, pid));
});

test('export comptable des commandes émises', async () => {
  refusé(await call('GET', '/api/commandes/export.csv', null, evaltech), 403);
  const res = await fetch(require('./_client').base() + '/api/commandes/export.csv', { headers: { cookie: achats } });
  assert.equal(res.status, 200);
  const csv = await res.text();
  assert.equal(csv.split('\r\n').filter(Boolean).length, 4, 'en-tête et trois commandes émises');
  assert.match(csv, /"BC-\d{4}-0002";.*"annulee"/);
  assert.equal((await call('GET', '/api/audit/verify', null, admin)).json.ok, true);
});
