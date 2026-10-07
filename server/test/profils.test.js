/* Profils réglementaires : règles imposées en marché public, paramétrables en achats privés, cadre figé à la
   publication. Les tests s'enchaînent : chacun part de l'état laissé par le précédent. */
const { login, getState, patch, clone } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../public/js/profils.js');

const refusé = (r, status, code) => { assert.equal(r.status, status, JSON.stringify(r.json)); if (code) assert.equal(r.json.code, code); };
const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.json));
let admin, soum;

test('calcul : une règle imposée ignore le réglage du client, une règle paramétrable le respecte dans ses bornes', () => {
  const pub = P.effectif('uemoa-ci', { delaiRecoursJours: 0, niveauxApprobationMin: 4 });
  assert.equal(pub.delaiRecoursJours, 15);
  assert.equal(pub.niveauxApprobationMin, 4);
  assert.equal(P.effectif('uemoa-ci', { niveauxApprobationMin: 1 }).niveauxApprobationMin, 2, 'hors bornes : valeur du profil');
  const prive = P.effectif('prive', { delaiRecoursJours: 5, recoursActif: true });
  assert.equal(prive.delaiRecoursJours, 5);
  assert.equal(prive.recoursActif, true);
  assert.equal(P.effectif('prive').recoursActif, false);
  assert.deepEqual(P.erreursReglages('prive', { delaiRecoursJours: 90 }).map((e) => e.motif), ['au plus 60']);
  assert.deepEqual(P.erreursReglages('uemoa-ci', { delaiRecoursJours: 90 }), [], 'règle imposée : réglage ignoré, pas refusé');
});

test('marché public : le cadre est figé à la publication et le profil ne change plus', async () => {
  admin = await login('administrateur@bal.ci');
  soum = await login('contact.sotrap@bal.ci');
  const s = await getState(admin);
  assert.equal(s.org.profilDefaut, 'uemoa-ci');
  assert.equal(s.cadre, null);
  refusé(await patch(admin, { cdc: { ...s.cdc, profil: 'inexistant' } }), 422, 'PROFILE_UNKNOWN');
  ok(await patch(admin, { cdc: { ...s.cdc, cdcPublie: true } }));
  const after = await getState(admin);
  assert.equal(after.cadre.profil, 'uemoa-ci');
  assert.equal(after.cadre.regles.delaiRecoursJours, 15);
  assert.ok(after.audit.some((e) => e.a.startsWith('Cadre réglementaire figé à la publication du dossier')));
  refusé(await patch(admin, { cdc: { ...after.cdc, profil: 'prive' } }), 409, 'PROFILE_LOCKED');
  refusé(await patch(admin, { cadre: { ...after.cadre, regles: { ...after.cadre.regles, recoursActif: false } } }), 403);
});

test('marché public : marge de préférence plafonnée, pièces et circuit minimum imposés', async () => {
  const s = await getState(admin);
  refusé(await patch(admin, { cdc: { ...s.cdc, prefActive: true, prefTaux: 20 } }), 422, 'PREFERENCE_OUT_OF_BOUNDS');
  ok(await patch(admin, { cdc: { ...s.cdc, prefActive: true, prefTaux: 15 } }));
  refusé(await patch(admin, { docDefs: s.docDefs.filter((d) => d.id !== 'cnps') }), 409, 'PIECE_IMPOSED');
  refusé(await patch(admin, { docDefs: s.docDefs.filter((d) => d.id !== 'traduction') }), 409, 'PIECES_LOCKED'); // dossier publié
  refusé(await patch(admin, { approvals: s.approvals.slice(0, 1) }), 422, 'APPROVAL_CIRCUIT_TOO_SHORT');
  const org = clone(s.org); org.reglages = { niveauxApprobationMin: 1 };
  refusé(await patch(admin, { org }), 422, 'SETTING_OUT_OF_BOUNDS');
});

test('achats privés : après dépublication, le client choisit ses règles', async () => {
  let s = await getState(admin);
  ok(await patch(admin, { cdc: { ...s.cdc, cdcPublie: false } }));
  s = await getState(admin);
  assert.equal(s.cadre, null);
  const org = clone(s.org);
  org.reglages = { recoursActif: false, delaiRecoursJours: 0, separationFonctions: false, niveauxApprobationMin: 1 };
  ok(await patch(admin, { org, cdc: { ...s.cdc, profil: 'prive', prefActive: false } })); // achats privés : pas de préférence géographique par défaut
  s = await getState(admin);
  ok(await patch(admin, { consultes: { mode: 'restreint', partenaires: ['PRT-0001'] } })); // SOTRAP consultée (achats privés)
  ok(await patch(admin, { docDefs: s.docDefs.filter((d) => d.id !== 'cnps') })); // achats privés : pièce non imposée
  ok(await patch(admin, { cdc: { ...s.cdc, cdcPublie: true } }));
  s = await getState(admin);
  assert.equal(s.cadre.profil, 'prive');
  assert.equal(s.cadre.regles.separationFonctions, false);
  ok(await patch(admin, { approvals: s.approvals.slice(0, 1) }));
  const recours = [{ de: 'Delta Bâtiment SA', statut: 'ouvert', t: 'test', objet: 'Contestation.' }];
  refusé(await patch(admin, { recours }), 409, 'APPEAL_NOT_PROVIDED'); // recours enregistré par les achats
});

test('achats privés : le cadre figé ne bouge plus si le client change ses réglages', async () => {
  const s = await getState(admin);
  const org = clone(s.org); org.reglages = { ...org.reglages, separationFonctions: true };
  ok(await patch(admin, { org }));
  assert.equal((await getState(admin)).cadre.regles.separationFonctions, false);
});

test('achats privés, sans séparation des fonctions ni délai : une même personne note, approuve et signe aussitôt', async () => {
  let s = await getState(admin);
  const confirmed = {};
  s.offers.forEach((o) => o.fields.forEach((f, i) => { if (f.flag) confirmed[o.id + '_' + i] = true; }));
  ok(await patch(admin, { confirmed, depClosed: true }));
  ok(await patch(admin, { coi: { ...s.coi, u0: { declare: true, conflit: false, t: 'test' } } }));
  s = await getState(admin);
  const q = clone(s.quality); q.sotrap.metho = 60;
  ok(await patch(admin, { quality: q, justif: { sotrap_metho: 'Planning de bascule absent.' } }));
  ok(await patch(admin, { evalDone: true }));
  s = await getState(admin);
  const ap = clone(s.approvals); ap[0].done = true;
  ok(await patch(admin, { approvals: ap }));
  s = await getState(admin);
  ok(await patch(admin, { standstill: { ...s.standstill, days: 30, startedAt: 1 } }));
  s = await getState(admin);
  assert.equal(s.standstill.days, 0, 'durée du délai fixée par le profil, pas par le navigateur');
  ok(await patch(admin, { contractSigned: true }));
});
