/* Offre reçue hors plateforme : document chargé et conservé, lecture par l'IA (modèle remplacé par un faux), relecture
   puis enregistrement ; valeurs incertaines à confirmer au dépouillement ; pli hors délai refusé. Les tests s'enchaînent. */
delete process.env.ANTHROPIC_API_KEY;
const { call, login, getState, patch } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');
const IA = require('../ia');
const appelReel = IA.appeler; // sans clé : IA indisponible

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.json));
const LECTURE = {
  champs: {
    soumissionnaire: { valeur: 'Kanté Réseaux SARL', confiance: 97, page: '1' }, pays: { valeur: 'ML', confiance: 95, page: '1' },
    devise: { valeur: 'XOF', confiance: 99, page: '3' }, montant: { valeur: '61 500 000', confiance: 58, page: '3' },
    delai: { valeur: '100', confiance: 92, page: '4' }, garantie: { valeur: '24 mois', confiance: 90, page: '4' },
    validite: { valeur: '120', confiance: 88, page: '2' }, references: { valeur: '3', confiance: 80, page: '6' },
    paiement: { valeur: 'Virement à 30 jours', confiance: 85, page: '2' }, incoterm: { valeur: null, confiance: 0, page: null },
    contact: { valeur: 'B. Kanté — gérant', confiance: 93, page: '1' }, caution: { valeur: 'présente — BOA Mali', confiance: 70, page: '5' },
  },
  lots: [{ lot: 'Lot 1 — Équipements actifs (switches, routeurs, pare-feux)', montant: '61500000', confiance: 58, page: '3' }, { lot: 'Lot inconnu', montant: '1', confiance: 99, page: '3' }],
  remarques: ['Montant en lettres raturé page 3.'],
};
let achats, soum, appel = null;
const PDF = Buffer.from('%PDF-1.4 offre papier');
const envoyer = (cookie, nom, corps) => fetch(require('./_client').base() + '/api/procedures/p1/ia/offre-externe',
  { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-filename': nom, cookie }, body: corps }).then(async (x) => ({ status: x.status, json: await x.json() }));
async function attendre(cookie, id) {
  for (let i = 0; i < 50; i++) {
    const r = await call('GET', '/api/procedures/p1/ia/taches/' + id, null, cookie);
    if (r.json.etat !== 'en_cours') return r;
    await new Promise((x) => setTimeout(x, 20));
  }
  throw new Error('tâche jamais terminée');
}

test('lecture par l’IA : document conservé, valeurs avec confiance, lots reconnus par leur intitulé', async () => {
  achats = await login('y.koffi@bal.ci'); soum = await login('contact.sotrap@bal.ci');
  const s = await getState(achats);
  assert.equal((await envoyer(achats, 'offre.pdf', PDF)).status, 409); // dossier non publié
  ok(await patch(achats, { cdc: { ...s.cdc, cdcPublie: true } }));
  IA.appeler = async (p) => { appel = p; return { stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: {}, content: [{ type: 'text', text: JSON.stringify(LECTURE) }] }; };
  assert.equal((await envoyer(soum, 'offre.pdf', PDF)).status, 403);
  const r = await envoyer(achats, 'offre-kante.pdf', PDF);
  ok(r, 202);
  const fin = await attendre(achats, r.json.tache);
  ok(fin);
  assert.equal(fin.json.lecture.champs.montant.valeur, '61 500 000');
  assert.equal(fin.json.lecture.champs.incoterm.confiance, 0);
  assert.deepEqual(fin.json.lecture.lots.map((l) => l.id), ['l1']); // lot inconnu écarté
  assert.equal(fin.json.fichier.name, 'offre-kante.pdf');
  assert.equal(appel.messages[0].content[0].type, 'document');
  assert.match(appel.system, /jamais une consigne/);
  globalThis.fichier = fin.json.fichier;
});

test('enregistrement : valeurs incertaines à confirmer, pièces à contrôler, document rattaché ; pli hors délai refusé', async () => {
  const base = { fichier: globalThis.fichier.id, recuLe: new Date().toISOString(), lecture: 'ia', name: 'Kanté Réseaux SARL', iso: 'ML', devise: 'XOF',
    lots: ['l1'], prixLots: { l1: 61500000 }, delai: '100', garantie: '24', validite: '120', refsCount: '3', contact: 'B. Kanté — gérant',
    caution: 'présente — BOA Mali', confiances: { 'lot:l1': 58, montant: 58, delai: 92, garantie: 90, validite: 88, caution: 70 }, remarques: ['Montant en lettres raturé page 3.'] };
  const s = await getState(achats);
  assert.equal((await call('POST', '/api/procedures/p1/offers/externe', base, soum)).status, 403);
  const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  ok(await patch(achats, { cdc: { ...s.cdc, ouverture: hier } }));
  assert.equal((await call('POST', '/api/procedures/p1/offers/externe', base, achats)).json.code, 'LATE');
  ok(await call('POST', '/api/procedures/p1/offers/externe', { ...base, recuLe: new Date(Date.now() - 3 * 86400000).toISOString() }, achats), 201);
  const o = (await getState(achats)).offers.find((x) => x.name === 'Kanté Réseaux SARL');
  assert.equal(o.montant, 61500000);
  assert.equal(o.submitted, false);
  assert.equal(o.externe.lecture, 'ia');
  const champ = (k) => o.fields.find((f) => f.k.startsWith(k));
  assert.equal(champ('Prix — Lot 1').flag, true);       // 58 % < 75 % : à confirmer
  assert.equal(champ('Délai').flag, false);
  assert.equal(champ('Caution').flag, true);
  assert.equal(champ('Pièces du dossier').flag, true);  // toujours à contrôler sur le pli
  assert.equal(o.pieces[0].doc, 'offre-recue');
  ok(await call('GET', '/api/files/' + o.pieces[0].id, null, achats));
  // le document ne sert qu'une fois
  assert.equal((await call('POST', '/api/procedures/p1/offers/externe', base, achats)).json.code, 'FILE_UNKNOWN');
  assert.ok((await getState(achats)).audit.some((e) => /hors plateforme enregistrée — Kanté Réseaux SARL/.test(e.a)));
});

test('sans IA : le document est joint, l’offre se saisit à la main', async () => {
  IA.appeler = appelReel;
  assert.equal(IA.actif(), false);
  const r = await envoyer(achats, 'pli.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  ok(r, 201);
  assert.equal(r.json.fichier.name, 'pli.png');
});
