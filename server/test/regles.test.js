/* Tests unitaires des calculs partagés navigateur / serveur (public/js/regles.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../public/js/regles.js');

const offre = (id, iso, devise, montant, delai, extra = {}) => ({ id, name: id, iso, devise, montant, delai, docs: {}, fields: [], aiMetho: 80, aiRefs: 80, ...extra });
const base = () => ({
  offers: [offre('local', 'CI', 'XOF', 100000000, 90), offre('etranger', 'DE', 'EUR', 150000, 90)],
  org: { uemoa: ['CI', 'SN'], rates: { XOF: 1, EUR: 650 } },
  cdc: { prefActive: true, prefTaux: 15 },
  criteria: [{ id: 'prix', weight: 60, kind: 'auto' }, { id: 'delai', weight: 10, kind: 'auto' }, { id: 'metho', label: 'Méthodologie', weight: 30, kind: 'qual' }],
  quality: { local: { metho: 80 }, etranger: { metho: 80 } }, justif: {}, excluded: {}, confirmed: {}, docDefs: [],
});

test('la marge de préférence majore la comparaison, jamais le montant de l’offre', () => {
  const ctx = base();
  const e = ctx.offers[1];
  assert.equal(R.montantXOF(ctx, e), 97500000);
  assert.equal(R.montantCorrige(ctx, e), 97500000 * 1.15);
  assert.equal(e.montant, 150000);
  // Moins cher en XOF, l'étranger est pourtant devancé une fois la marge appliquée.
  assert.equal(R.ranking(ctx)[0].o.id, 'local');
  ctx.cdc.prefActive = false;
  assert.equal(R.ranking(ctx)[0].o.id, 'etranger');
});

test('les taux figés priment sur les paramètres : le classement ne bouge plus', () => {
  const ctx = base();
  ctx.fxFrozen = { rates: { XOF: 1, EUR: 650 } };
  const avant = R.ranking(ctx).map((r) => [r.o.id, r.total]);
  ctx.org.rates.EUR = 400; // l'euro « s'effondre » dans les paramètres après l'ouverture
  assert.deepEqual(R.ranking(ctx).map((r) => [r.o.id, r.total]), avant);
  delete ctx.fxFrozen;
  assert.notDeepEqual(R.ranking(ctx).map((r) => [r.o.id, r.total]), avant);
});

test('tout écart avec le score IA exige une justification non vide', () => {
  const ctx = base();
  assert.deepEqual(R.missingJustifs(ctx), []);
  ctx.quality.local.metho = 60;
  assert.deepEqual(R.missingJustifs(ctx), ['local / Méthodologie']);
  ctx.justif.local_metho = '   ';
  assert.equal(R.missingJustifs(ctx).length, 1);
  ctx.justif.local_metho = 'Planning de déploiement incomplet.';
  assert.deepEqual(R.missingJustifs(ctx), []);
});

test('une offre écartée ne compte ni au classement ni aux justifications', () => {
  const ctx = base();
  ctx.quality.etranger.metho = 10;
  ctx.excluded.etranger = true;
  assert.deepEqual(R.ranking(ctx).map((r) => r.o.id), ['local']);
  assert.deepEqual(R.missingJustifs(ctx), []);
});

test('pièce exigée manquante : offre non conforme par défaut', () => {
  const ctx = base();
  ctx.docDefs = [{ id: 'legalisation', scope: 'etranger' }, { id: 'cnps', scope: 'local' }];
  assert.equal(R.isExcluded(ctx, ctx.offers[1]), true);
  assert.equal(R.isExcluded(ctx, ctx.offers[0]), true);
  ctx.offers[0].docs.cnps = true;
  assert.equal(R.isExcluded(ctx, ctx.offers[0]), false);
});

test('champs à faible confiance restants et délai de recours', () => {
  const ctx = base();
  ctx.offers[0].fields = [{ flag: true }, { flag: false }, { flag: true }];
  assert.equal(R.flagsRemaining(ctx), 2);
  ctx.confirmed.local_0 = true;
  assert.equal(R.flagsRemaining(ctx), 1);
  const t0 = Date.UTC(2026, 0, 1);
  assert.equal(R.standstillRemaining({ days: 15, startedAt: null }), 15);
  assert.equal(R.standstillRemaining({ days: 15, startedAt: t0 }, t0 + 10 * 86400000), 5);
  assert.equal(R.standstillRemaining({ days: 15, startedAt: t0 }, t0 + 16 * 86400000), 0);
  assert.equal(R.allApproved([]), false);
});

test('pièce d’offre couverte par le référencement : lien réglé, sinon même identifiant', () => {
  const ref = [{ id: 'registre' }, { id: 'fiscal' }];
  assert.equal(R.pieceReferencement({ id: 'registre' }, ref), 'registre'); // par défaut : même identifiant
  assert.equal(R.pieceReferencement({ id: 'caution' }, ref), null); // propre à chaque offre
  assert.equal(R.pieceReferencement({ id: 'registre', referencement: '' }, ref), null); // à joindre à chaque offre
  assert.equal(R.pieceReferencement({ id: 'd123', referencement: 'fiscal' }, ref), 'fiscal'); // pièce ajoutée, reliée
  assert.equal(R.pieceReferencement({ id: 'd124', referencement: 'inconnue' }, ref), null); // pièce de référencement retirée
});

test('résultat d’une offre : rien avant l’attribution, puis retenue, non retenue avec rang, ou écartée avec motif', () => {
  const ctx = base();
  ctx.cdc.prefActive = false;
  ctx.offers.push(offre('ecartee', 'CI', 'XOF', 50000000, 90));
  ctx.excluded = { ecartee: true };
  assert.equal(R.resultatOffre(ctx, 'local'), null); // évaluation non validée : rien n'est communiqué
  ctx.evalDone = true;
  ctx.approvals = [{ role: 'Directeur', done: false }];
  assert.equal(R.resultatOffre(ctx, 'local'), null); // circuit non approuvé
  ctx.approvals = [{ role: 'Directeur', done: true }];
  const gagnant = R.resultatOffre(ctx, 'etranger'), perdant = R.resultatOffre(ctx, 'local'), ecartee = R.resultatOffre(ctx, 'ecartee');
  assert.deepEqual([gagnant.statut, gagnant.rang], ['retenue', 1]);
  assert.deepEqual([perdant.statut, perdant.rang, perdant.nb], ['non_retenue', 2, 2]);
  assert.match(perdant.motif, /classée 2e sur 2/);
  assert.equal(perdant.attributaire.nom, 'etranger');
  assert.equal(ecartee.statut, 'ecartee');
  assert.match(ecartee.motif, /Offre écartée/);
});
