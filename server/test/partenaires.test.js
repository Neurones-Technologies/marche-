/* Module 1 : inscription publique, dossier et parcours de référencement, pièces reprises au dépôt d'une offre,
   suspension et exclusion. Les tests s'enchaînent : chacun part de l'état laissé par le précédent. */
const { call, login, getState, patch, upload } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.json));
const refusé = (r, status, code) => { assert.equal(r.status, status, JSON.stringify(r.json)); if (code) assert.equal(r.json.code, code); };
const PDF = Buffer.from('%PDF-1.4 test');
const MDP = 'Mobilia2026!x';
const INSCRIPTION = { raisonSociale: 'Mobilia SARL', pays: 'CI', immatriculation: 'CI-ABJ-2020-B-1', nom: 'A. Kouassi', email: 'contact@mobilia.ci', motDePasse: MDP };
let admin, achats, mobilia, autre, pid, lien;

/** Téléversement d'une pièce de référencement (corps brut). */
async function piece(cookie, id, doc, expire) {
  const url = `/api/partenaires/${id}/fichiers?doc=${doc}` + (expire ? `&expire=${expire}` : '');
  return uploadBrut(url, doc + '.pdf', PDF, cookie);
}
let BASE;
/** Connexion avec le mot de passe choisi à l'inscription (login() utilise celui des comptes de démonstration). */
async function connecter(email) {
  const r = await call('POST', '/api/auth/login', { email, password: MDP });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.cookie;
}
async function uploadBrut(url, name, buf, cookie) {
  const res = await fetch(BASE + url, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-filename': encodeURIComponent(name), cookie }, body: buf });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

test('inscription publique : fermée, champ piège, contrôles, pas d’énumération des comptes', async () => {
  admin = await login('administrateur@bal.ci'); achats = await login('y.koffi@bal.ci');
  BASE = require('./_client').base();
  const org = (await getState(admin)).org;
  ok(await patch(admin, { org: { ...org, inscriptionOuverte: false } }));
  refusé(await call('POST', '/api/inscription', INSCRIPTION), 403, 'REGISTRATION_CLOSED');
  ok(await patch(admin, { org: { ...org, inscriptionOuverte: true } }));
  const piege = await call('POST', '/api/inscription', { ...INSCRIPTION, email: 'robot@x.ci', site: 'http://spam' });
  ok(piege, 202);
  assert.equal(piege.json.lienVerification, undefined, 'champ piège : rien n’est créé');
  refusé(await call('POST', '/api/inscription', { ...INSCRIPTION, motDePasse: 'court' }), 422);
  refusé(await call('POST', '/api/inscription', { ...INSCRIPTION, pays: 'Côte d’Ivoire' }), 422);
  const r = await call('POST', '/api/inscription', INSCRIPTION);
  ok(r, 202);
  lien = r.json.lienVerification;
  assert.match(lien, /^\/\?verifier=[0-9a-f]{64}$/);
  // même réponse pour une adresse déjà inscrite, sans nouveau lien
  const bis = await call('POST', '/api/inscription', { ...INSCRIPTION, raisonSociale: 'Usurpateur' });
  ok(bis, 202);
  assert.equal(bis.json.message, r.json.message);
  assert.equal(bis.json.lienVerification, undefined);
  assert.ok((await getState(admin)).emails.some((m) => m.a[0] === 'contact@mobilia.ci' && m.corps.includes(lien)));
});

test('vérification du courriel : jeton à usage unique, compte inactif avant', async () => {
  refusé(await call('POST', '/api/auth/login', { email: INSCRIPTION.email, password: MDP }), 403, 'EMAIL_NOT_VERIFIED');
  refusé(await call('POST', '/api/auth/login', { email: INSCRIPTION.email, password: 'Mauvais2026!x' }), 401);
  refusé(await call('POST', '/api/inscription/verifier', { jeton: 'faux' }), 410, 'TOKEN_INVALID');
  const jeton = lien.split('=')[1];
  ok(await call('POST', '/api/inscription/verifier', { jeton }));
  refusé(await call('POST', '/api/inscription/verifier', { jeton }), 410, 'TOKEN_INVALID');
  mobilia = await connecter(INSCRIPTION.email);
});

test('dossier : fiche, pièces exigées selon le pays, contrôles du dépôt de pièces', async () => {
  const moi = (await call('GET', '/api/partenaires/moi', null, mobilia)).json.partenaire;
  assert.equal(moi.statut, 'candidat');
  assert.deepEqual(moi.exigees.map((e) => e.id), ['registre', 'fiscal', 'cnps'], 'pas la caution : elle est propre à une offre');
  refusé(await call('GET', '/api/partenaires', null, mobilia), 403);
  refusé(await call('GET', '/api/partenaires/PRT-0001', null, mobilia), 404); // la fiche d'un autre
  ok(await call('PUT', `/api/partenaires/${moi.id}`, { adresse: 'Abidjan, Cocody', domaines: ['Mobilier'] }, mobilia));
  refusé(await call('POST', `/api/partenaires/${moi.id}/soumettre`, {}, mobilia), 422, 'PIECES_MISSING');
  refusé(await piece(mobilia, moi.id, 'caution'), 422, 'PIECE_NOT_REQUIRED');
  refusé(await piece(mobilia, moi.id, 'fiscal', '2020-01-01'), 422, 'PIECE_EXPIRED');
  ok(await piece(mobilia, moi.id, 'registre'), 201);
  ok(await piece(mobilia, moi.id, 'fiscal', '2099-12-31'), 201);
  ok(await piece(mobilia, moi.id, 'cnps', '2099-12-31'), 201);
  ok(await call('POST', `/api/partenaires/${moi.id}/soumettre`, {}, mobilia));
  refusé(await call('PUT', `/api/partenaires/${moi.id}`, { adresse: 'x' }, mobilia), 409, 'PARTNER_LOCKED');
  refusé(await piece(mobilia, moi.id, 'registre'), 409, 'PARTNER_LOCKED');
});

test('instruction : rejet motivé, nouvelle soumission, référencement et validation des pièces', async () => {
  const moi = (await call('GET', '/api/partenaires/moi', null, mobilia)).json.partenaire;
  refusé(await call('POST', `/api/partenaires/${moi.id}/approbations/0`, {}, mobilia), 403);
  ok(await call('POST', `/api/partenaires/${moi.id}/approbations/0`, {}, achats));
  refusé(await call('POST', `/api/partenaires/${moi.id}/rejet`, { motif: '' }, achats), 422, 'REJECTION_REASON_REQUIRED');
  const rj = await call('POST', `/api/partenaires/${moi.id}/rejet`, { motif: 'Registre du commerce illisible.' }, achats);
  ok(rj);
  assert.equal(rj.json.partenaire.statut, 'rejete');
  ok(await piece(mobilia, moi.id, 'registre'), 201);
  ok(await call('POST', `/api/partenaires/${moi.id}/soumettre`, {}, mobilia));
  ok(await call('POST', `/api/partenaires/${moi.id}/approbations/0`, {}, achats));
  const fin = await call('POST', `/api/partenaires/${moi.id}/approbations/1`, {}, achats);
  ok(fin);
  assert.equal(fin.json.partenaire.statut, 'reference');
  assert.ok(fin.json.partenaire.exigees.every((e) => e.etat === 'valide'));
  // pièce de référencement : téléchargeable par les acheteurs (consultation journalisée), pas par un autre partenaire
  const fichier = fin.json.partenaire.pieces.fiscal.fichier;
  assert.equal((await fetch(BASE + '/api/files/' + fichier, { headers: { cookie: achats } })).status, 200);
  const sotrap = await login('contact.sotrap@bal.ci');
  assert.equal((await fetch(BASE + '/api/files/' + fichier, { headers: { cookie: sotrap } })).status, 404);
});

test('dépôt d’offre : réservé aux partenaires référencés en achats privés, pièces reprises du référencement', async () => {
  const c = await call('POST', '/api/procedures', { ref: 'AO-2026-050', objet: 'Mobilier de bureau', profil: 'prive' }, achats);
  ok(c, 201);
  pid = c.json.id;
  const s = await getState(achats, pid);
  ok(await patch(achats, { cdc: { ...s.cdc, cdcPublie: true } }, pid));
  const lot = s.cdc.lots[0].id;
  // un second prestataire, inscrit et vérifié, mais pas référencé
  const r = await call('POST', '/api/inscription', { ...INSCRIPTION, raisonSociale: 'Autre SA', email: 'contact@autre.ci' });
  ok(await call('POST', '/api/inscription/verifier', { jeton: r.json.lienVerification.split('=')[1] }));
  autre = await connecter('contact@autre.ci');
  const offre = { name: 'Mobilia SARL', iso: 'CI', devise: 'XOF', montant: 12000000, delai: 30, lots: [lot] };
  refusé(await call('POST', `/api/procedures/${pid}/offers`, { ...offre, name: 'Autre SA' }, autre), 403, 'PARTNER_NOT_REFERENCED');
  // marché public (p1) : pas de réservation, seul le contrôle des pièces s'applique
  const p1 = await getState(achats);
  ok(await patch(achats, { cdc: { ...p1.cdc, cdcPublie: true } }));
  refusé(await call('POST', '/api/procedures/p1/offers', { ...offre, name: 'Autre SA' }, autre), 422);
  // Mobilia, référencée : seule la caution (propre à l'offre) reste à joindre
  const sans = await call('POST', `/api/procedures/${pid}/offers`, offre, mobilia);
  refusé(sans, 422);
  assert.match(sans.json.error, /Caution/);
  assert.doesNotMatch(sans.json.error, /fiscale|Registre/);
  ok(await upload('caution', 'caution.pdf', PDF, mobilia, pid), 201);
  const dep = await call('POST', `/api/procedures/${pid}/offers`, offre, mobilia);
  ok(dep, 201);
  const pieces = dep.json.offer.pieces.map((x) => [x.doc, !!x.referencement]).sort();
  assert.deepEqual(pieces, [['caution', false], ['cnps', true], ['fiscal', true], ['registre', true]]);
  assert.equal((await getState(mobilia, pid)).monPartenaire.statut, 'reference');
});

test('suspension, réactivation, exclusion : motivées, transitions contrôlées', async () => {
  const id = (await call('GET', '/api/partenaires/moi', null, mobilia)).json.partenaire.id;
  refusé(await call('POST', `/api/partenaires/${id}/statut`, { statut: 'suspendu' }, achats), 422, 'REASON_REQUIRED');
  ok(await call('POST', `/api/partenaires/${id}/statut`, { statut: 'suspendu', motif: 'Attestation fiscale contestée.' }, achats));
  const s = await getState(achats, pid);
  const offre = { name: 'Mobilia SARL', iso: 'CI', devise: 'XOF', montant: 11000000, delai: 30, lots: [s.cdc.lots[0].id] };
  refusé(await call('POST', `/api/procedures/${pid}/offers`, offre, mobilia), 403, 'PARTNER_NOT_REFERENCED');
  ok(await call('POST', `/api/partenaires/${id}/statut`, { statut: 'reference', motif: 'Attestation confirmée par l’administration fiscale.' }, achats));
  ok(await call('POST', `/api/partenaires/${id}/statut`, { statut: 'exclu', motif: 'Fausse déclaration.' }, achats));
  refusé(await call('POST', `/api/partenaires/${id}/statut`, { statut: 'reference', motif: 'Erreur.' }, achats), 409, 'PARTNER_TRANSITION');
  const v = await call('GET', '/api/audit/verify', null, admin);
  assert.equal(v.json.ok, true);
});
