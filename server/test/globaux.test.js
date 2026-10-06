/* Interface sans build : tous les scripts de public/js/app partagent les mêmes noms globaux. Un nom déclaré deux fois
   (fonction ou variable de premier niveau) écrase silencieusement l'autre et casse des écrans entiers : interdit. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('aucun nom global déclaré deux fois dans les scripts de l’interface', () => {
  const dir = path.join(__dirname, '..', '..', 'public', 'js', 'app');
  const fichiers = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, f))
    .concat(fs.readdirSync(path.join(dir, 'ecrans')).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, 'ecrans', f)));
  const vus = {}, doublons = [];
  for (const f of fichiers) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/^(?:function|var|const|let)\s+([A-Za-z_$][\w$]*)/gm)) {
      const nom = m[1], ici = path.relative(dir, f);
      if (vus[nom]) doublons.push(`${nom} : ${vus[nom]} et ${ici}`); else vus[nom] = ici;
    }
  }
  assert.deepEqual(doublons, []);
});
