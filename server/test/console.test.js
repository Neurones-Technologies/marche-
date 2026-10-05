/* Console de la plateforme : validation des inscriptions par un opérateur, création à la main, suspension,
   suppression, opérateurs et journal. Hôte de chaque requête par X-Forwarded-Host, comme derrière nginx. */
process.env.PLATEFORME_DOMAINE = 'plateforme.test';
delete process.env.PLATEFORME_VALIDATION; // par défaut : accord d'un opérateur
const test = require('node:test');
const assert = require('node:assert/strict');
const { base } = require('./_client');

const PW = 'Marche+2026!';
async function req(hote, method, url, body, cookie) {
  const res = await fetch(base() + url, { method, redirect: 'manual',
    headers: { 'x-forwarded-host': hote, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  const texte = await res.text();
  let json = {}; try { json = JSON.parse(texte); } catch (e) { /* page HTML */ }
  return { status: res.status, json, texte, location: res.headers.get('location'), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}
const PLAT = 'plateforme.test', DEMO = 'demo.plateforme.test';
const hote = (slug) => slug + '.plateforme.test';
const OP = { email: 'console@neuronestech.com', motDePasse: PW }; // opérateur de développement (hors production)
let op;

/** Inscription en ligne jusqu'à la confirmation du courriel. */
async function inscrire(slug, nom) {
  const r = await req(PLAT, 'POST', '/api/plateforme/espaces', { slug, nom, pays: 'Sénégal', profil: 'prive', adminNom: 'Fatou Diop', email: 'fatou@' + slug + '.sn', motDePasse: 'Achats+2026x' });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.validation, 'manuelle');
  const lien = new URL(r.json.lien);
  return req(PLAT, 'GET', lien.pathname + lien.search);
}
const tableau = async () => (await req(PLAT, 'GET', '/api/console/tableau', null, op)).json;
const demande = async (slug) => (await tableau()).inscriptions.find((i) => i.slug === slug && i.statut === 'attente');

test('la console n’existe qu’à l’adresse de la plateforme, et seulement connecté', async () => {
  assert.equal((await req(PLAT, 'GET', '/api/console/tableau')).status, 401);
  assert.equal((await req(DEMO, 'POST', '/api/console/connexion', OP)).status, 404);
  assert.equal((await req(PLAT, 'POST', '/api/console/connexion', { ...OP, motDePasse: 'faux' })).status, 401);
  const r = await req(PLAT, 'POST', '/api/console/connexion', OP);
  assert.equal(r.status, 200); op = r.cookie;
  assert.match(op, /^mp_console=/);
  // la session de la console n'ouvre aucun espace
  assert.equal((await req(DEMO, 'GET', '/api/auth/me', null, op.replace('mp_console', 'mp_token'))).status, 401);
  const page = await fetch(base() + '/console', { headers: { 'x-forwarded-host': PLAT } });
  assert.match(await page.text(), /Console de la plateforme/);
});

test('inscription : le courriel confirmé, la demande attend l’accord ; acceptée, l’espace s’ouvre', async () => {
  const c = await inscrire('teranga', 'Téranga Distribution');
  assert.equal(c.status, 302); assert.match(c.location, /\?confirmation=attente$/);
  assert.equal((await req(hote('teranga'), 'GET', '/api/espace')).json.code, 'SPACE_UNKNOWN', 'pas encore d’espace');
  assert.equal((await req(PLAT, 'GET', '/api/plateforme/disponible?slug=teranga')).json.libre, false, 'adresse réservée pendant l’examen');
  const d = await demande('teranga');
  assert.ok(d); assert.equal(d.admin.email, 'fatou@teranga.sn'); assert.equal(d.data, undefined, 'ni mot de passe ni empreinte exposés');
  const a = await req(PLAT, 'POST', `/api/console/inscriptions/${d.id}/accepter`, {}, op);
  assert.equal(a.status, 200, JSON.stringify(a.json));
  assert.equal((await req(PLAT, 'POST', `/api/console/inscriptions/${d.id}/accepter`, {}, op)).status, 404, 'une seule fois');
  // l'administrateur se connecte avec le mot de passe choisi à l'inscription
  const l = await req(hote('teranga'), 'POST', '/api/auth/login', { email: 'fatou@teranga.sn', password: 'Achats+2026x' });
  assert.equal(l.status, 200);
  const t = await tableau();
  const e = t.espaces.find((x) => x.slug === 'teranga');
  assert.equal(e.actif, true); assert.equal(e.activite.comptes, 1); assert.equal(e.origine, 'en ligne');
  assert.equal(t.inscriptions.find((i) => i.id === d.id).statut, 'acceptee');
});

test('refus : motif obligatoire, l’adresse redevient libre', async () => {
  await inscrire('douteux', 'Société Douteuse');
  const d = await demande('douteux');
  assert.equal((await req(PLAT, 'POST', `/api/console/inscriptions/${d.id}/refuser`, { motif: ' ' }, op)).status, 422);
  assert.equal((await req(PLAT, 'POST', `/api/console/inscriptions/${d.id}/refuser`, { motif: 'Entreprise inconnue au registre du commerce.' }, op)).status, 200);
  assert.equal((await req(PLAT, 'GET', '/api/plateforme/disponible?slug=douteux')).json.libre, true);
  const t = await tableau();
  assert.equal(t.inscriptions.find((i) => i.id === d.id).motif, 'Entreprise inconnue au registre du commerce.');
  assert.ok(!t.espaces.some((e) => e.slug === 'douteux'));
});

test('création à la main par un opérateur', async () => {
  const corps = { slug: 'sitarail', nom: 'Sitarail', pays: 'Côte d’Ivoire', profil: 'uemoa-ci', adminNom: 'Yao Kouassi', email: 'yao@sitarail.ci', motDePasse: 'Rail+Achats2026' };
  assert.equal((await req(PLAT, 'POST', '/api/console/espaces', { ...corps, motDePasse: 'court' }, op)).status, 422);
  assert.equal((await req(PLAT, 'POST', '/api/console/espaces', { ...corps, slug: 'teranga' }, op)).status, 409);
  assert.equal((await req(PLAT, 'POST', '/api/console/espaces', corps)).status, 401, 'sans session');
  const r = await req(PLAT, 'POST', '/api/console/espaces', corps, op);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.espace.origine, 'console');
  assert.equal((await req(hote('sitarail'), 'POST', '/api/auth/login', { email: 'yao@sitarail.ci', password: 'Rail+Achats2026' })).status, 200);
});

test('suspension, réactivation, suppression définitive', async () => {
  const S = '/api/console/espaces/sitarail';
  assert.equal((await req(PLAT, 'POST', S + '/suspendre', { motif: '' }, op)).status, 422);
  assert.equal((await req(PLAT, 'DELETE', S, { confirmation: 'sitarail' }, op)).status, 409, 'actif : pas de suppression');
  assert.equal((await req(PLAT, 'POST', S + '/suspendre', { motif: 'Contrat non signé' }, op)).status, 200);
  const api = await req(hote('sitarail'), 'POST', '/api/auth/login', { email: 'yao@sitarail.ci', password: 'Rail+Achats2026' });
  assert.equal(api.status, 403); assert.equal(api.json.code, 'SPACE_SUSPENDED');
  const page = await req(hote('sitarail'), 'GET', '/tableau-de-bord');
  assert.equal(page.status, 403); assert.match(page.texte, /Espace suspendu/);
  assert.equal((await req(PLAT, 'POST', S + '/reactiver', {}, op)).status, 200);
  assert.equal((await req(hote('sitarail'), 'POST', '/api/auth/login', { email: 'yao@sitarail.ci', password: 'Rail+Achats2026' })).status, 200, 'données gardées');
  await req(PLAT, 'POST', S + '/suspendre', { motif: 'Fin de contrat' }, op);
  assert.equal((await req(PLAT, 'DELETE', S, { confirmation: 'autre' }, op)).status, 422);
  assert.equal((await req(PLAT, 'DELETE', S, { confirmation: 'sitarail' }, op)).status, 200);
  assert.equal((await req(hote('sitarail'), 'GET', '/api/espace')).json.code, 'SPACE_UNKNOWN');
  assert.equal((await req(PLAT, 'GET', '/api/plateforme/disponible?slug=sitarail')).json.libre, true);
});

test('l’espace de démonstration ne peut être ni suspendu ni supprimé', async () => {
  assert.equal((await req(PLAT, 'POST', '/api/console/espaces/demo/suspendre', { motif: 'test' }, op)).status, 403);
  assert.equal((await req(PLAT, 'DELETE', '/api/console/espaces/demo', { confirmation: 'demo' }, op)).status, 403);
});

test('opérateurs : ajout, désactivation, mot de passe ; tout entre au journal', async () => {
  const n = { nom: 'Marie Kouamé', email: 'marie@neuronestech.com', motDePasse: 'Console+2026m' };
  const a = await req(PLAT, 'POST', '/api/console/operateurs', n, op);
  assert.equal(a.status, 201);
  assert.equal((await req(PLAT, 'POST', '/api/console/operateurs', n, op)).status, 409);
  const marie = (await req(PLAT, 'POST', '/api/console/connexion', { email: n.email, motDePasse: n.motDePasse })).cookie;
  const moi = (await req(PLAT, 'GET', '/api/console/moi', null, op)).json.operateur;
  assert.equal((await req(PLAT, 'PATCH', '/api/console/operateurs/' + moi.id, { actif: false }, op)).status, 409, 'pas soi-même');
  assert.equal((await req(PLAT, 'PATCH', '/api/console/operateurs/' + a.json.id, { actif: false }, op)).status, 200);
  assert.equal((await req(PLAT, 'GET', '/api/console/tableau', null, marie)).status, 401, 'session coupée');
  assert.equal((await req(PLAT, 'POST', '/api/console/connexion', { email: n.email, motDePasse: n.motDePasse })).status, 401);
  assert.equal((await req(PLAT, 'POST', '/api/console/mot-de-passe', { actuel: 'faux', nouveau: 'Nouveau+2026x' }, op)).status, 403);
  assert.equal((await req(PLAT, 'POST', '/api/console/mot-de-passe', { actuel: PW, nouveau: 'Nouveau+2026x' }, op)).status, 200);
  const j = (await req(PLAT, 'GET', '/api/console/journal', null, op)).json.journal.map((l) => l.action);
  for (const m of [/Demande n° \d+ reçue/, /acceptée — espace teranga/, /refusée/, /sitarail créé à la main/, /sitarail suspendu/, /sitarail réactivé/, /sitarail supprimé/, /Opérateur ajouté/, /Opérateur désactivé/, /Mot de passe modifié/]) {
    assert.ok(j.some((a) => m.test(a)), 'journal : ' + m);
  }
});
