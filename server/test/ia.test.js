/* IA de préparation : proposition de cahier des charges à partir d'une idée ou d'un document. Le modèle est remplacé
   par un faux (aucun appel réseau, aucun coût) ; on vérifie la route, les droits, la tâche de fond et le contrat. */
delete process.env.ANTHROPIC_API_KEY;
const { call, login } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');
const IA = require('../ia');

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.json));
const PROPOSITION = {
  objet: 'Renouvellement du parc informatique du siège', autorite: 'Banque Atlantique du Littoral', procedure: 'Appel d’offres ouvert national',
  langue: 'Français', deviseSoumission: 'XOF', ouverture: null,
  lots: [{ nom: 'Lot 1 — Postes de travail', montant: '40 000 000 XOF' }, { nom: 'Lot 2 — Imprimantes', montant: null }],
  specs: ['Processeur 64 bits, 6 cœurs au moins', 'Mémoire vive de 16 Go au moins'],
  caution: 2, garantieMin: 12, delaiMax: 90, penalite: 1, avance: null, tva: 18, retenueNonResident: null, douaneACharge: null,
  prefActive: true, prefTaux: 15, resume: 'Proposition rédigée à partir de l’idée.',
  aVerifier: [{ champ: 'caution', raison: 'Taux usuel supposé.' }], manquants: ['Date limite de dépôt'],
};
let appels = [], reponse = null;
const faux = async (params) => { appels.push(params); return reponse || { stop_reason: 'end_turn', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(PROPOSITION) }], usage: { input_tokens: 10, output_tokens: 20 } }; };
let achats, soum;

async function attendre(cookie, id) {
  for (let i = 0; i < 50; i++) {
    const r = await call('GET', '/api/procedures/p1/ia/taches/' + id, null, cookie);
    if (r.json.etat !== 'en_cours') return r;
    await new Promise((x) => setTimeout(x, 20));
  }
  throw new Error('tâche jamais terminée');
}

test('sans clé : l’IA est signalée indisponible, aucune demande acceptée', async () => {
  achats = await login('y.koffi@bal.ci'); soum = await login('contact.sotrap@bal.ci');
  assert.deepEqual((await call('GET', '/api/procedures/p1/ia', null, achats)).json, { actif: false });
  const r = await call('POST', '/api/procedures/p1/ia/idee', { idee: 'Renouveler le parc informatique du siège.' }, achats);
  assert.equal(r.status, 503); assert.equal(r.json.code, 'AI_DISABLED');
});

test('idée : tâche de fond, proposition nettoyée, journal d’audit', async () => {
  IA.appeler = faux;
  assert.equal((await call('GET', '/api/procedures/p1/ia', null, achats)).json.actif, true);
  assert.equal((await call('POST', '/api/procedures/p1/ia/idee', { idee: 'trop court' }, achats)).status, 422);
  const r = await call('POST', '/api/procedures/p1/ia/idee', { idee: 'Renouveler le parc informatique du siège : 40 postes.' }, achats);
  ok(r, 202);
  const fin = await attendre(achats, r.json.tache);
  ok(fin);
  assert.equal(fin.json.etat, 'prete');
  assert.deepEqual(fin.json.proposition.lots, PROPOSITION.lots);
  assert.equal(fin.json.proposition.ouverture, null);
  // contrat de l'appel : schéma JSON, idée encadrée comme une donnée, contexte du profil
  const p = appels.at(-1);
  assert.equal(p.output_config.format.type, 'json_schema');
  assert.match(p.messages[0].content[0].text, /<idee>[\s\S]*40 postes[\s\S]*<\/idee>/);
  assert.match(p.messages[0].content[0].text, /Profil réglementaire/);
  const audit = (await call('GET', '/api/procedures/p1/state', null, achats)).json.state.audit;
  assert.ok(audit.some((e) => /proposé par l’IA .* à partir d’une idée/.test(e.a)));
});

test('document : un PDF part tel quel au modèle ; un autre format est refusé', async () => {
  const base = require('./_client').base();
  const envoyer = (nom, corps) => fetch(base + '/api/procedures/p1/ia/document', { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-filename': nom, cookie: achats }, body: corps })
    .then(async (x) => ({ status: x.status, json: await x.json() }));
  assert.equal((await envoyer('note.txt', Buffer.from('bonjour'))).status, 415);
  assert.equal((await envoyer('faux.pdf', Buffer.from('pas un pdf'))).status, 415);
  const r = await envoyer('dossier.pdf', Buffer.from('%PDF-1.4 dossier'));
  assert.equal(r.status, 202, JSON.stringify(r.json));
  ok(await attendre(achats, r.json.tache));
  const bloc = appels.at(-1).messages[0].content[0];
  assert.equal(bloc.type, 'document');
  assert.equal(bloc.source.media_type, 'application/pdf');
});

test('droits : réservé au rédacteur ; une tâche ne se lit que par son auteur', async () => {
  assert.equal((await call('POST', '/api/procedures/p1/ia/idee', { idee: 'Renouveler le parc informatique du siège.' }, soum)).status, 404); // procédure non publiée : invisible
  const r = await call('POST', '/api/procedures/p1/ia/idee', { idee: 'Renouveler le parc informatique du siège.' }, achats);
  const admin = await login('administrateur@bal.ci');
  assert.equal((await call('GET', '/api/procedures/p1/ia/taches/' + r.json.tache, null, admin)).status, 404);
  ok(await attendre(achats, r.json.tache));
});

test('refus du modèle : l’erreur est rendue proprement', async () => {
  reponse = { stop_reason: 'refusal', model: 'claude-opus-5-5', content: [], usage: {} };
  const r = await call('POST', '/api/procedures/p1/ia/idee', { idee: 'Renouveler le parc informatique du siège.' }, achats);
  const fin = await attendre(achats, r.json.tache);
  assert.equal(fin.status, 422); assert.equal(fin.json.code, 'AI_REFUSAL');
  reponse = null;
});
