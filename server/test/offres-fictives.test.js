/* Offres fictives : chaque soumissionnaire de démonstration a son offre technique et son offre financière (PDF),
   jointes comme un dépôt en ligne, lisibles par les lecteurs des offres. */
const { call, login, getState, base } = require('./_client');
const test = require('node:test');
const assert = require('node:assert/strict');

test('offres de démonstration : une offre technique et une offre financière chacune, en PDF valides', async () => {
  const admin = await login('administrateur@bal.ci');
  const s = await getState(admin);
  assert.ok(s.offers.length >= 8);
  for (const o of s.offers) {
    const docs = (o.pieces || []).map((p) => [p.doc, p.offre]);
    assert.deepEqual(docs, [['memoire', true], ['bordereau', true]], o.name);
    for (const p of o.pieces) {
      const res = await fetch(base() + '/api/files/' + p.id, { headers: { cookie: admin } });
      assert.equal(res.status, 200);
      const buf = Buffer.from(await res.arrayBuffer());
      assert.equal(buf.slice(0, 5).toString(), '%PDF-');
      assert.match(buf.slice(-6).toString(), /%%EOF/);
      assert.equal(buf.length, p.size);
      if (p.doc === 'bordereau') {
        // le total du bordereau est le montant de l'offre, et la somme des lots lui est égale
        const txt = buf.toString('latin1'), total = /MONTANT TOTAL HT\) Tj ET\nBT[^(]*\(([^)]*)\)/.exec(txt);
        assert.ok(total, o.name);
        assert.equal(total[1].replace(/\D/g, ''), String(Math.round(o.montant)));
      }
    }
  }
});

test('l’offre technique reprend les données de l’offre', async () => {
  const admin = await login('administrateur@bal.ci');
  const o = (await getState(admin)).offers.find((x) => x.id === 'sotrap');
  const res = await fetch(base() + '/api/files/' + o.pieces[0].id, { headers: { cookie: admin } });
  const txt = Buffer.from(await res.arrayBuffer()).toString('latin1');
  assert.match(txt, /SOTRAP/);
  assert.match(txt, new RegExp(`${o.delai} jours`));
  assert.match(txt, new RegExp(`garantie de ${o.garantie} mois`, 'i'));
});
