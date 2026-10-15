/* Pièces des offres fictives : l'offre technique (mémoire) et l'offre financière (bordereau des prix) de chaque
   soumissionnaire de démonstration, en PDF, jointes comme le ferait un dépôt en ligne (doc « memoire » et « bordereau »).
   Le PDF est écrit à la main (police standard Helvetica, sans dépendance) : la génération reste synchrone, comme
   l'amorçage de la base qui l'appelle. Les chiffres viennent de l'offre : le total du bordereau est son montant. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');

const sep = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/* ---- Écriture d'un PDF simple : blocs { t: 'titre' | 'h' | 'p' | 'li' | 'ligne' | 'espace', ... } ---- */
const latin = (s) => Buffer.from(String(s).replace(/[’‘]/g, "'").replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[  ]/g, ' ').replace(/[^\x00-\xFF]/g, '?'), 'latin1');
const echapper = (b) => Buffer.from(b.toString('latin1').replace(/([\\()])/g, '\\$1'), 'latin1');
function decouper(texte, max) {
  const mots = String(texte).split(/\s+/), lignes = []; let cur = '';
  for (const m of mots) { if ((cur + ' ' + m).trim().length > max) { lignes.push(cur); cur = m; } else cur = (cur + ' ' + m).trim(); }
  if (cur) lignes.push(cur);
  return lignes;
}
/* Largeur approchée d'un texte Helvetica 10 pt : chiffres 5,56, espaces 2,78, autres 5,2 (gras : un peu plus). */
const largeur = (s, gras) => [...String(s)].reduce((t, c) => t + (/d/.test(c) ? 5.56 : c === ' ' ? 2.78 : /[ilj.,:;'|]/.test(c) ? 2.6 : /[mwMW]/.test(c) ? 8 : 5.3) * (gras ? 1.06 : 1), 0);
function pdf(blocs) {
  const L = 595, H = 842, MG = 56, pages = []; let ops = [], y = H - MG;
  const nouvellePage = () => { pages.push(ops); ops = []; y = H - MG; };
  const texte = (x, taille, gras, s) => ops.push(Buffer.concat([Buffer.from(`BT /F${gras ? 2 : 1} ${taille} Tf ${x} ${y.toFixed(1)} Td (`), echapper(latin(s)), Buffer.from(') Tj ET\n')]));
  const place = (haut) => { if (y - haut < MG) nouvellePage(); };
  for (const b of blocs) {
    if (b.t === 'titre') { place(40); texte(MG, 18, true, b.s); y -= 26; }
    else if (b.t === 'sous') { place(18); texte(MG, 10, false, b.s); y -= 15; }
    else if (b.t === 'h') { y -= 8; place(30); texte(MG, 12, true, b.s); y -= 18; }
    else if (b.t === 'p') for (const l of decouper(b.s, 95)) { place(15); texte(MG, 10, false, l); y -= 14; }
    else if (b.t === 'li') decouper(b.s, 88).forEach((l, i) => { place(15); if (!i) texte(MG + 6, 10, false, '-'); texte(MG + 18, 10, false, l); y -= 14; });
    else if (b.t === 'ligne') {
      place(16); texte(MG, 10, !!b.gras, b.g);
      texte(L - MG - largeur(b.d, !!b.gras), 10, !!b.gras, b.d);
      y -= 4; ops.push(Buffer.from(`${MG} ${y.toFixed(1)} m ${L - MG} ${y.toFixed(1)} l 0.8 G 0.5 w S\n`)); y -= 12;
    } else if (b.t === 'espace') y -= b.h || 10;
  }
  pages.push(ops);
  // objets : 1 catalogue, 2 pages, 3-4 polices, puis (contenu, page) par page
  const objets = [null, null, null, null];
  objets[0] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>');
  objets[2] = Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objets[3] = Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = [];
  pages.forEach((p) => {
    const flux = Buffer.concat(p), n = objets.length;
    objets.push(Buffer.concat([Buffer.from(`<< /Length ${flux.length} >>\nstream\n`), flux, Buffer.from('endstream')]));
    objets.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${L} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${n + 1} 0 R >>`));
    kids.push(`${n + 2} 0 R`);
  });
  objets[1] = Buffer.from(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`);
  const morceaux = [Buffer.from('%PDF-1.4\n')], pos = [];
  let off = morceaux[0].length;
  objets.forEach((o, i) => { const m = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), o, Buffer.from('\nendobj\n')]); pos.push(off); off += m.length; morceaux.push(m); });
  const xref = ['xref\n0 ' + (objets.length + 1) + '\n0000000000 65535 f \n'].concat(pos.map((p) => String(p).padStart(10, '0') + ' 00000 n \n')).join('');
  morceaux.push(Buffer.from(xref + `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${off}\n%%EOF\n`));
  return Buffer.concat(morceaux);
}

/* ---- Contenu ---- */
const lotsDe = (cdc) => (cdc.lots || []).filter((l) => l && l.nom);
const jours = (n, part) => Math.max(1, Math.round(n * part));

function offreTechnique(o, cdc, orgNom) {
  const b = [{ t: 'titre', s: 'Offre technique' }, { t: 'sous', s: `${cdc.ref} - ${cdc.objet}` },
    { t: 'sous', s: `Soumissionnaire : ${o.name} (${o.pays})` }, { t: 'sous', s: `Déposée le ${o.depot || 'date de dépôt'} - contact : ${o.contact || 'non précisé'}` }, { t: 'espace', h: 6 }];
  b.push({ t: 'h', s: '1. Compréhension du besoin' });
  b.push({ t: 'p', s: `${orgNom || 'L’acheteur'} souhaite : ${cdc.objet}. Nous avons analysé le cahier des charges et le CCTP, et notre proposition répond point par point aux spécifications suivantes.` });
  (cdc.specs || []).slice(0, 8).forEach((s) => b.push({ t: 'li', s }));
  b.push({ t: 'h', s: '2. Méthodologie d’exécution' });
  const detail = Number(o.aiMetho) >= 80;
  lotsDe(cdc).forEach((l) => b.push({ t: 'p', s: `${l.nom} : prise en charge par une équipe dédiée, ${detail ? 'avec un plan d’assurance qualité, des points de contrôle à chaque jalon et une recette formelle contresignée par l’acheteur' : 'avec une recette en fin de lot'}.` }));
  if (detail) b.push({ t: 'p', s: 'Gestion des risques : revue hebdomadaire du registre des risques (approvisionnement, accès aux sites, disponibilité des équipes), avec solution de repli identifiée pour chaque risque majeur.' });
  b.push({ t: 'h', s: '3. Planning' });
  b.push({ t: 'p', s: `Délai d’exécution proposé : ${o.delai} jours à compter de l’ordre de service.` });
  [['Démarrage et ordre de service', 'J'], ['Livraison des équipements', 'J + ' + jours(o.delai, 0.5)], ['Installation et configuration', 'J + ' + jours(o.delai, 0.8)], ['Recette et formation', 'J + ' + o.delai]]
    .forEach(([g, d]) => b.push({ t: 'ligne', g, d }));
  b.push({ t: 'h', s: '4. Équipe et références' });
  b.push({ t: 'p', s: 'Chef de projet certifié, ingénieur réseau senior, techniciens d’installation et responsable qualité ; les CV sont joints au dossier administratif.' });
  const n = Math.max(0, Number(o.refsCount) || 0);
  for (let i = 1; i <= n; i++) b.push({ t: 'li', s: `Référence ${i} : marché comparable exécuté en ${2026 - i}, attestation de bonne exécution disponible.` });
  if (!n) b.push({ t: 'p', s: 'Aucune référence comparable n’est présentée.' });
  b.push({ t: 'h', s: '5. Garantie et support' });
  b.push({ t: 'p', s: `Garantie de ${o.garantie} mois, pièces et main d’oeuvre. Support par téléphone et sur site pendant la durée de la garantie.` });
  return pdf(b);
}

function offreFinanciere(o, cdc) {
  const dev = o.devise || 'XOF', lots = lotsDe(cdc);
  const poids = lots.map((l) => Number(String(l.montant || '').replace(/\D/g, '')) || 1), somme = poids.reduce((t, x) => t + x, 0) || 1;
  let reste = Math.round(o.montant);
  const montants = lots.map((l, i) => { const v = i === lots.length - 1 ? reste : Math.round(o.montant * poids[i] / somme); reste -= v; return v; });
  const b = [{ t: 'titre', s: 'Offre financière - bordereau des prix' }, { t: 'sous', s: `${cdc.ref} - ${cdc.objet}` },
    { t: 'sous', s: `Soumissionnaire : ${o.name} (${o.pays})` }, { t: 'espace', h: 10 },
    { t: 'h', s: 'Prix par lot (hors taxes)' }];
  lots.forEach((l, i) => b.push({ t: 'ligne', g: l.nom, d: `${sep(montants[i])} ${dev}` }));
  b.push({ t: 'ligne', g: 'MONTANT TOTAL HT', d: `${sep(o.montant)} ${dev}`, gras: true });
  b.push({ t: 'h', s: 'Conditions' });
  b.push({ t: 'ligne', g: 'Délai d’exécution', d: `${o.delai} jours` });
  b.push({ t: 'ligne', g: 'Garantie', d: `${o.garantie} mois` });
  b.push({ t: 'ligne', g: 'Validité de l’offre', d: `${o.validite || 90} jours` });
  b.push({ t: 'ligne', g: 'Conditions de paiement', d: o.paiement || 'Virement - 30 jours' });
  b.push({ t: 'p', s: 'Les prix sont fermes et non révisables pendant la durée de validité de l’offre. Ils incluent la livraison, l’installation et la formation décrites dans l’offre technique.' });
  return pdf(b);
}

/**
 * Joint à une offre fictive ses deux pièces (écrites sur le disque, inscrites au registre des fichiers) : à appeler avant
 * l'insertion de l'offre. `db` : la base ; `cdc` : cahier des charges de la procédure ; `pid` : identifiant de la procédure.
 */
function joindre(db, o, cdc, pid, orgNom) {
  const dossier = require('./contexte').fichiers() || cfg.filesDir;
  fs.mkdirSync(dossier, { recursive: true });
  o.pieces = [['memoire', 'offre_technique', offreTechnique(o, cdc, orgNom)], ['bordereau', 'offre_financiere', offreFinanciere(o, cdc)]].map(([doc, nom, corps]) => {
    const id = crypto.randomUUID(), sha = crypto.createHash('sha256').update(corps).digest('hex'), name = `${slug(o.name)}_${nom}.pdf`;
    fs.writeFileSync(path.join(dossier, id), corps, { mode: 0o600 });
    db.prepare('INSERT INTO files(id,owner,doc_id,offer_id,name,mime,size,sha256,procedure_id) VALUES(?,?,?,?,?,?,?,?,?)').run(id, 'seed', doc, o.id, name, 'application/pdf', corps.length, sha, pid);
    return { id, doc, name, size: corps.length, sha256: sha, offre: true };
  });
  return o;
}

module.exports = { joindre, offreTechnique, offreFinanciere, pdf };
