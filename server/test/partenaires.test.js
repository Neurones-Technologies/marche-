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

/** Brouillon de dossier du portail, et dépôt d'un document dans ce brouillon (sans compte). */
async function brouillon() { const r = await call('POST', '/api/inscription/brouillon', {}); ok(r, 201); return r.json.brouillon; }
async function pieceBrouillon(jeton, doc, expire) {
  const res = await fetch(BASE + '/api/inscription/brouillon/pieces?doc=' + doc + (expire ? '&expire=' + expire : ''),
    { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-filename': encodeURIComponent(doc + '.pdf'), 'x-brouillon': jeton }, body: PDF });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
const REPONSES = { activite: 'Mobilier de bureau', effectif: '42', inconnue: 'x' };

test('portail : formulaire de l’organisation, documents en brouillon, dossier complet exigé, pas d’énumération des comptes', async () => {
  admin = await login('administrateur@bal.ci'); achats = await login('y.koffi@bal.ci');
  BASE = require('./_client').base();
  const org = (await getState(admin)).org;
  ok(await patch(admin, { org: { ...org, inscriptionOuverte: false } }));
  refusé(await call('POST', '/api/inscription', INSCRIPTION), 403, 'REGISTRATION_CLOSED');
  refusé(await call('POST', '/api/inscription/brouillon', {}), 403, 'REGISTRATION_CLOSED');
  assert.equal((await call('GET', '/api/inscription/formulaire')).json.ouverte, false);
  ok(await patch(admin, { org: { ...org, inscriptionOuverte: true } }));
  // le formulaire public : questions, et documents selon le pays (la caution relève d'une offre, pas du référencement)
  const fm = (await call('GET', '/api/inscription/formulaire?pays=CI')).json;
  assert.ok(fm.champs.some((c) => c.id === 'activite'));
  assert.deepEqual(fm.pieces.map((p) => p.id), ['registre', 'fiscal', 'cnps']);
  assert.ok((await call('GET', '/api/inscription/formulaire?pays=FR')).json.pieces.some((p) => p.id === 'traduction'));
  // documents déposés dans un brouillon anonyme
  const jeton = await brouillon();
  refusé(await pieceBrouillon('faux', 'registre'), 410, 'DRAFT_INVALID');
  refusé(await pieceBrouillon(jeton, 'caution'), 422, 'PIECE_NOT_REQUIRED');
  refusé(await pieceBrouillon(jeton, 'fiscal'), 422, 'PIECE_EXPIRY_REQUIRED'); // attestation : date de validité exigée
  refusé(await pieceBrouillon(jeton, 'fiscal', '2020-01-01'), 422, 'PIECE_EXPIRED');
  ok(await pieceBrouillon(jeton, 'registre'), 201);
  ok(await pieceBrouillon(jeton, 'fiscal', '2099-12-31'), 201);
  const corps = { ...INSCRIPTION, reponses: REPONSES, brouillon: jeton };
  const piege = await call('POST', '/api/inscription', { ...corps, email: 'robot@x.ci', site: 'http://spam' });
  ok(piege, 202);
  assert.equal(piege.json.lienVerification, undefined, 'champ piège : rien n’est créé');
  refusé(await call('POST', '/api/inscription', { ...corps, motDePasse: 'court' }), 422);
  refusé(await call('POST', '/api/inscription', { ...corps, pays: 'Côte d’Ivoire' }), 422);
  refusé(await call('POST', '/api/inscription', { ...corps, reponses: {} }), 422, 'PARTNER_INCOMPLETE');
  refusé(await call('POST', '/api/inscription', { ...corps, reponses: { activite: 'x', effectif: 'beaucoup' } }), 422, 'PARTNER_INCOMPLETE');
  refusé(await call('POST', '/api/inscription', corps), 422, 'PIECES_MISSING'); // la CNPS manque (prestataire local)
  ok(await pieceBrouillon(jeton, 'cnps', '2099-12-31'), 201);
  ok(await pieceBrouillon(jeton, 'cnps', '2099-06-30'), 201); // remplacée dans le brouillon
  const r = await call('POST', '/api/inscription', corps);
  ok(r, 202);
  lien = r.json.lienVerification;
  assert.match(lien, /^\/\?verifier=[0-9a-f]{64}$/);
  refusé(await pieceBrouillon(jeton, 'registre'), 410, 'DRAFT_INVALID'); // brouillon consommé
  // même réponse pour une adresse déjà inscrite, sans nouveau lien
  const j2 = await brouillon();
  for (const [doc, exp] of [['registre'], ['fiscal', '2099-12-31'], ['cnps', '2099-12-31']]) ok(await pieceBrouillon(j2, doc, exp), 201);
  const bis = await call('POST', '/api/inscription', { ...corps, raisonSociale: 'Usurpateur', brouillon: j2 });
  ok(bis, 202);
  assert.equal(bis.json.message, r.json.message);
  assert.equal(bis.json.lienVerification, undefined);
  assert.ok((await getState(admin)).emails.some((m) => m.a[0] === 'contact@mobilia.ci' && m.corps.includes(lien)));
});

test('vérification du courriel : compte activé, dossier transmis au référencement', async () => {
  refusé(await call('POST', '/api/auth/login', { email: INSCRIPTION.email, password: MDP }), 403, 'EMAIL_NOT_VERIFIED');
  refusé(await call('POST', '/api/auth/login', { email: INSCRIPTION.email, password: 'Mauvais2026!x' }), 401);
  refusé(await call('POST', '/api/inscription/verifier', { jeton: 'faux' }), 410, 'TOKEN_INVALID');
  const jeton = lien.split('=')[1];
  const v = await call('POST', '/api/inscription/verifier', { jeton });
  ok(v); assert.equal(v.json.transmis, true);
  refusé(await call('POST', '/api/inscription/verifier', { jeton }), 410, 'TOKEN_INVALID');
  mobilia = await connecter(INSCRIPTION.email);
  const moi = (await call('GET', '/api/partenaires/moi', null, mobilia)).json.partenaire;
  assert.equal(moi.statut, 'verification');
  assert.deepEqual(moi.reponses, { activite: 'Mobilier de bureau', effectif: 42 });
  assert.deepEqual(moi.exigees.map((e) => [e.id, e.etat]), [['registre', 'a_verifier'], ['fiscal', 'a_verifier'], ['cnps', 'a_verifier']]);
  assert.equal(moi.pieces.cnps.expire, '2099-06-30');
  // le dossier attend les achats : il apparaît dans leur liste, et il est figé pour le prestataire
  assert.ok((await call('GET', '/api/partenaires', null, achats)).json.partenaires.some((p) => p.id === moi.id && p.statut === 'verification'));
  refusé(await call('GET', '/api/partenaires', null, mobilia), 403);
  refusé(await call('GET', '/api/partenaires/PRT-0001', null, mobilia), 404); // la fiche d'un autre
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
  // le prestataire corrige : contrôles du dépôt de pièces et des réponses depuis sa fiche
  refusé(await piece(mobilia, moi.id, 'caution'), 422, 'PIECE_NOT_REQUIRED');
  refusé(await piece(mobilia, moi.id, 'fiscal'), 422, 'PIECE_EXPIRY_REQUIRED');
  refusé(await call('PUT', `/api/partenaires/${moi.id}`, { reponses: { effectif: 'beaucoup' } }, mobilia), 422, 'PARTNER_INVALID');
  ok(await call('PUT', `/api/partenaires/${moi.id}`, { adresse: 'Abidjan, Cocody', domaines: ['Mobilier'] }, mobilia));
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

test('consultation : seuls les partenaires référencés et sélectionnés voient le dossier et soumissionnent ; pièces reprises du référencement', async () => {
  const c = await call('POST', '/api/procedures', { ref: 'AO-2026-050', objet: 'Mobilier de bureau', profil: 'prive' }, achats);
  ok(c, 201);
  pid = c.json.id;
  await require('./_client').remplir(achats, pid);
  const s = await getState(achats, pid);
  // appel d'offres neuf : pièces du référencement seulement ; la caution, propre à l'offre, s'ajoute à la main
  assert.ok(!s.docDefs.some((d) => d.id === 'caution'));
  ok(await patch(achats, { docDefs: s.docDefs.concat([{ id: 'caution', label: 'Caution de soumission', scope: 'tous' }]) }, pid));
  // un dossier restreint ne se publie qu'avec au moins un partenaire consulté (ici SOTRAP)
  refusé(await patch(achats, { cdc: { ...s.cdc, cdcPublie: true } }, pid), 409, 'CDC_INCOMPLETE');
  ok(await patch(achats, { consultes: { mode: 'restreint', partenaires: ['PRT-0001'] } }, pid));
  ok(await patch(achats, { cdc: { ...s.cdc, cdcPublie: true } }, pid));
  const lot = s.cdc.lots[0].id;
  // un second prestataire, inscrit et vérifié, mais pas référencé
  const r = await require('./_client').inscrire({ ...INSCRIPTION, raisonSociale: 'Autre SA', email: 'contact@autre.ci' });
  ok(await call('POST', '/api/inscription/verifier', { jeton: r.json.lienVerification.split('=')[1] }));
  autre = await connecter('contact@autre.ci');
  const offre = { name: 'Mobilia SARL', iso: 'CI', devise: 'XOF', montant: 12000000, delai: 30, lots: [lot] };
  // achats privés : consultation restreinte ; ni Autre SA (non référencée) ni Mobilia (pas encore consultée) ne voient le dossier
  const visibles = async (cookie) => (await call('GET', '/api/procedures', null, cookie)).json.procedures.map((p) => p.id);
  assert.ok(!(await visibles(autre)).includes(pid));
  assert.ok(!(await visibles(mobilia)).includes(pid));
  refusé(await call('POST', `/api/procedures/${pid}/offers`, { ...offre, name: 'Autre SA' }, autre), 404);
  refusé(await call('POST', `/api/procedures/${pid}/offers`, offre, mobilia), 404);
  const idMobilia = (await call('GET', '/api/partenaires/moi', null, mobilia)).json.partenaire.id;
  const idAutre = (await call('GET', '/api/partenaires/moi', null, autre)).json.partenaire.id;
  // la sélection : parmi les seuls référencés ; pas d'appel d'offres « ouvert » en achats privés
  const refs = (await call('GET', '/api/partenaires/references', null, achats)).json.partenaires.map((p) => p.id);
  assert.ok(refs.includes(idMobilia) && !refs.includes(idAutre));
  refusé(await call('GET', '/api/partenaires/references', null, mobilia), 403);
  refusé(await patch(achats, { consultes: { mode: 'restreint', partenaires: [idAutre] } }, pid), 422, 'CONSULTATION_INVALID');
  refusé(await patch(achats, { consultes: { mode: 'ouvert', partenaires: [] } }, pid), 422, 'CONSULTATION_INVALID');
  ok(await patch(achats, { consultes: { mode: 'restreint', partenaires: [idMobilia] } }, pid));
  assert.ok((await visibles(mobilia)).includes(pid));
  assert.ok((await getState(mobilia, pid)).notifs.some((n) => n.ev === 'consultation' && n.titre.includes('AO-2026-050')), 'prévenu dans son espace');
  assert.ok(!(await visibles(autre)).includes(pid));
  // marché public (p1) : appel d'offres ouvert par défaut, accessible à toute entreprise ; seul le contrôle des pièces s'applique
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
  // un partenaire qui a déposé une offre reste consulté
  refusé(await patch(achats, { consultes: { mode: 'restreint', partenaires: [] } }, pid), 422, 'CONSULTATION_INVALID');
  // marché public : la consultation peut aussi être restreinte ; Autre SA ne voit plus p1
  const p1c = await getState(achats);
  ok(await patch(achats, { consultes: { mode: 'restreint', partenaires: [idMobilia] } }));
  assert.ok(!(await visibles(autre)).includes('p1'));
  ok(await patch(achats, { consultes: { mode: 'ouvert', partenaires: [idMobilia] } }));
  assert.ok((await visibles(autre)).includes('p1'));
  assert.ok(p1c);
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

test('achats : fiche modifiable, suspension quel que soit le statut, réactivation au statut d’avant', async () => {
  const liste = (await call('GET', '/api/partenaires', null, achats)).json.partenaires;
  const sotrap = liste.find((p) => p.id === 'PRT-0001');
  // les achats corrigent la fiche, identité comprise, même d'un partenaire référencé
  const r = await call('PUT', '/api/partenaires/PRT-0001', { raisonSociale: 'SOTRAP Ingénierie SA (siège)', adresse: 'Abidjan, Cocody' }, achats);
  ok(r);
  assert.equal(r.json.partenaire.raisonSociale, 'SOTRAP Ingénierie SA (siège)');
  assert.ok(r.json.partenaire.historique.some((h) => /modifiée par les achats/.test(h.action)));
  // un partenaire exclu ne se modifie plus
  const exclu = liste.find((p) => p.statut === 'exclu');
  refusé(await call('PUT', `/api/partenaires/${exclu.id}`, { adresse: 'x' }, achats), 409, 'PARTNER_EXCLUDED');
  // un dossier non référencé se suspend aussi ; réactivé, il retrouve son statut
  const cand = liste.find((p) => ['candidat', 'rejete', 'verification'].includes(p.statut) && p.id !== exclu.id);
  if (cand) {
    ok(await call('POST', `/api/partenaires/${cand.id}/statut`, { statut: 'suspendu', motif: 'Doute sur l’identité.' }, achats));
    const re = await call('POST', `/api/partenaires/${cand.id}/statut`, { statut: 'actif', motif: 'Identité vérifiée.' }, achats);
    ok(re);
    assert.equal(re.json.partenaire.statut, cand.statut);
  }
  // un partenaire référencé suspendu ne redevient référencé qu'avec des pièces valides (aucune dans la démonstration)
  assert.equal(sotrap.statut, 'reference');
  ok(await call('POST', '/api/partenaires/PRT-0001/statut', { statut: 'suspendu', motif: 'Contrôle.' }, achats));
  refusé(await call('POST', '/api/partenaires/PRT-0001/statut', { statut: 'actif', motif: 'Contrôle levé.' }, achats), 422, 'PIECES_MISSING');
});

test('formulaire de référencement : défini par l’organisation, contrôlé à l’écriture', async () => {
  const st = await getState(admin);
  const f = st.formulaireReferencement;
  assert.ok(f.champs.length && f.pieces.length);
  assert.ok(!f.pieces.some((p) => p.id === 'caution'), 'distinct des pièces d’une offre');
  refusé(await patch(admin, { formulaireReferencement: { ...f, champs: [...f.champs, { id: 'x', label: 'Type ?', type: 'couleur', obligatoire: false }] } }), 422, 'FORM_INVALID');
  refusé(await patch(admin, { formulaireReferencement: { ...f, champs: [...f.champs, { id: 'secteur', label: 'Secteur', type: 'choix', options: ['BTP'], obligatoire: true }] } }), 422, 'FORM_INVALID');
  refusé(await call('PATCH', '/api/organisation/state', { changes: { formulaireReferencement: f } }, mobilia), 403);
  const nouveau = { champs: [...f.champs, { id: 'secteur', label: 'Secteur', type: 'choix', options: ['BTP', 'Informatique'], obligatoire: true }],
    pieces: [...f.pieces, { id: 'assurance', label: 'Attestation d’assurance', scope: 'tous', obligatoire: false, expiration: true }] };
  ok(await patch(admin, { formulaireReferencement: nouveau }));
  const moi = (await call('GET', '/api/partenaires/moi', null, mobilia)).json.partenaire;
  assert.ok(moi.questions.some((q) => q.id === 'secteur'));
  const as = moi.exigees.find((e) => e.id === 'assurance');
  assert.equal(as.obligatoire, false); assert.equal(as.expiration, true);
});
