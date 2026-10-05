/* Plateforme multi-entreprises : création d'un espace en libre-service, arrivée connectée, isolement des espaces.
   L'hôte de chaque requête est donné par X-Forwarded-Host (« trust proxy »), comme derrière nginx. */
process.env.PLATEFORME_DOMAINE = 'plateforme.test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { base } = require('./_client');

const PW = 'Marche+2026!';
async function req(hote, method, url, body, cookie) {
  const res = await fetch(base() + url, { method, redirect: 'manual',
    headers: { 'x-forwarded-host': hote, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => ({})), location: res.headers.get('location'), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}
const PLAT = 'plateforme.test', DEMO = 'demo.plateforme.test', ACME = 'acme.plateforme.test';
const ESPACE = { slug: 'acme', nom: 'Acme Industries SA', pays: 'Côte d’Ivoire', profil: 'prive', adminNom: 'Awa Koné', email: 'awa.kone@acme.ci', motDePasse: 'Acme+Achats2026' };
let lien, cookieAcme, cookieDemo;

test('à l’adresse de la plateforme : sa page et son API, aucune donnée d’espace', async () => {
  assert.equal((await req(PLAT, 'GET', '/api/version')).status, 200);
  assert.equal((await req(PLAT, 'GET', '/api/auth/me')).status, 404);
  assert.equal((await req(PLAT, 'POST', '/api/auth/login', { email: 'administrateur@bal.ci', password: PW })).status, 404);
  const page = await fetch(base() + '/', { headers: { 'x-forwarded-host': PLAT } });
  assert.match(await page.text(), /Créer votre espace/);
});

test('l’installation existante est l’espace « demo » ; un sous-domaine inconnu n’existe pas', async () => {
  const r = await req(DEMO, 'POST', '/api/auth/login', { email: 'administrateur@bal.ci', password: PW });
  assert.equal(r.status, 200); cookieDemo = r.cookie;
  assert.equal((await req('inconnu.plateforme.test', 'GET', '/api/auth/me')).json.code, 'SPACE_UNKNOWN');
});

test('disponibilité et contrôles de la demande', async () => {
  assert.equal((await req(PLAT, 'GET', '/api/plateforme/disponible?slug=demo')).json.libre, false);
  assert.equal((await req(PLAT, 'GET', '/api/plateforme/disponible?slug=A!')).json.libre, false);
  assert.equal((await req(PLAT, 'GET', '/api/plateforme/disponible?slug=acme')).json.libre, true);
  assert.equal((await req(PLAT, 'POST', '/api/plateforme/espaces', { ...ESPACE, motDePasse: 'faible' })).status, 422);
  assert.equal((await req(PLAT, 'POST', '/api/plateforme/espaces', { ...ESPACE, email: 'x' })).status, 422);
  assert.equal((await req(PLAT, 'POST', '/api/plateforme/espaces', { ...ESPACE, slug: 'www' })).status, 422);
  // depuis un espace, la route de création n'existe pas
  assert.equal((await req(DEMO, 'POST', '/api/plateforme/espaces', ESPACE)).status, 404);
});

test('création : demande, confirmation du courriel, arrivée connectée dans l’espace neuf', async () => {
  const r = await req(PLAT, 'POST', '/api/plateforme/espaces', ESPACE);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  lien = new URL(r.json.lien); // courriels simulés : le lien est rendu
  assert.equal((await req(PLAT, 'GET', '/api/plateforme/disponible?slug=acme')).json.libre, false, 'réservé pendant la confirmation');
  const c = await req(PLAT, 'GET', lien.pathname + lien.search);
  assert.equal(c.status, 302);
  const vers = new URL(c.location);
  assert.equal(vers.hostname, ACME);
  const j = await req(ACME, 'GET', vers.pathname + vers.search);
  assert.equal(j.status, 302); assert.match(j.location, /\/tableau-de-bord\?bienvenue=1$/);
  cookieAcme = j.cookie;
  const me = await req(ACME, 'GET', '/api/auth/me', null, cookieAcme);
  assert.equal(me.json.user.email, 'awa.kone@acme.ci');
  assert.equal(me.json.user.role, 'admin');
  // le lien ne sert qu'une fois
  assert.match((await req(PLAT, 'GET', lien.pathname + lien.search)).location, /confirmation=invalide/);
});

test('l’espace neuf est vide et à son nom ; les espaces sont isolés', async () => {
  const st = (await req(ACME, 'GET', '/api/organisation/state', null, cookieAcme)).json.state;
  assert.equal(st.org.nom, 'Acme Industries SA');
  assert.equal(st.org.profilDefaut, 'prive');
  assert.deepEqual(st.users.map((u) => u.nom), ['Awa Koné']);
  assert.deepEqual((await req(ACME, 'GET', '/api/procedures', null, cookieAcme)).json.procedures, []);
  assert.deepEqual((await req(ACME, 'GET', '/api/partenaires', null, cookieAcme)).json.partenaires || [], []);
  // la session d'un espace ne vaut pas dans un autre
  assert.equal((await req(DEMO, 'GET', '/api/auth/me', null, cookieAcme)).status, 401);
  assert.equal((await req(ACME, 'GET', '/api/auth/me', null, cookieDemo)).status, 401);
  // les comptes d'un espace n'existent pas dans l'autre
  assert.equal((await req(ACME, 'POST', '/api/auth/login', { email: 'administrateur@bal.ci', password: PW })).status, 401);
  assert.equal((await req(DEMO, 'POST', '/api/auth/login', { email: ESPACE.email, password: ESPACE.motDePasse })).status, 401);
  // l'espace demo garde ses données
  assert.ok((await req(DEMO, 'GET', '/api/procedures', null, cookieDemo)).json.procedures.length >= 1);
});

test('une adresse déjà prise est refusée', async () => {
  const r = await req(PLAT, 'POST', '/api/plateforme/espaces', { ...ESPACE, email: 'autre@acme.ci' });
  assert.equal(r.status, 409);
});

test('la réinitialisation n’existe que dans l’espace de démonstration', async () => {
  assert.equal((await req(DEMO, 'GET', '/api/espace')).json.reinitialisable, true);
  assert.equal((await req(ACME, 'GET', '/api/espace')).json.reinitialisable, false);
  assert.equal((await req(ACME, 'POST', '/api/admin/reset', {}, cookieAcme)).status, 403);
  // l'administrateur d'une entreprise ne dépose pas d'offres
  const st = (await req(ACME, 'GET', '/api/organisation/state', null, cookieAcme)).json.state;
  assert.equal(st.roles.admin.perms['portail.use'], false);
});
