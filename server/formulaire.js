/* Formulaire de référencement des partenaires, défini par l'organisation (kv formulaireReferencement) :
     champs  : questions posées au prestataire — { id, label, type, options?, obligatoire }
     pieces  : documents demandés — { id, label, scope: tous|local|etranger, obligatoire, expiration }
   Le même formulaire sert au portail des partenaires (inscription) et à la fiche du partenaire connecté. Les pièces
   d'une offre restent un autre référentiel (docDefs) ; une pièce de même identifiant, validée au référencement, tient
   lieu de pièce d'offre. */
const { kvGet } = require('./db');
const R = require('../public/js/regles.js');

const TYPES = ['texte', 'nombre', 'date', 'choix', 'ouinon'];
const SCOPES = ['tous', 'local', 'etranger'];
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,40}$/;

const formulaire = () => (kvGet('formulaireReferencement') || { value: { champs: [], pieces: [] } }).value;

/** Contrôle d'une définition ; retourne le message d'erreur, ou null. */
function verifierDefinition(f) {
  if (!f || typeof f !== 'object' || !Array.isArray(f.champs) || !Array.isArray(f.pieces)) return 'Formulaire invalide : questions et pièces attendues.';
  if (f.champs.length > 40 || f.pieces.length > 40) return '40 questions et 40 pièces au plus.';
  const ids = new Set();
  for (const c of f.champs) {
    if (!c || !ID.test(String(c.id || '')) || ids.has(c.id)) return 'Identifiant de question invalide ou en double.';
    ids.add(c.id);
    if (!String(c.label || '').trim() || String(c.label).length > 200) return 'Chaque question a un libellé (200 caractères au plus).';
    if (!TYPES.includes(c.type)) return `Type de réponse inconnu pour « ${c.label} ».`;
    if (c.type === 'choix' && (!Array.isArray(c.options) || c.options.filter((o) => String(o).trim()).length < 2 || c.options.length > 30)) return `« ${c.label} » : une liste de choix demande au moins deux options.`;
    if (typeof c.obligatoire !== 'boolean') return `« ${c.label} » : obligatoire ou non ?`;
  }
  const pids = new Set();
  for (const p of f.pieces) {
    if (!p || !ID.test(String(p.id || '')) || pids.has(p.id)) return 'Identifiant de pièce invalide ou en double.';
    pids.add(p.id);
    if (!String(p.label || '').trim() || String(p.label).length > 200) return 'Chaque pièce a un libellé (200 caractères au plus).';
    if (!SCOPES.includes(p.scope)) return `« ${p.label} » : prestataires concernés invalides.`;
    if (typeof p.obligatoire !== 'boolean' || typeof p.expiration !== 'boolean') return `« ${p.label} » : obligatoire et date de validité à préciser.`;
  }
  return null;
}

/** Pièces demandées à un prestataire, selon son pays (locales, hors UEMOA). */
function piecesPour(pays) {
  const org = (kvGet('org') || { value: {} }).value;
  return R.requiredDocs({ org, docDefs: formulaire().pieces }, { iso: pays || '' });
}

/** Contrôle et mise en forme des réponses. complet : les questions obligatoires doivent avoir une réponse.
    Retourne { erreur } ou { reponses } (seules les questions du formulaire sont gardées). */
function verifierReponses(reponses, complet) {
  const src = reponses && typeof reponses === 'object' ? reponses : {}, out = {};
  for (const c of formulaire().champs) {
    let v = src[c.id];
    const vide = v == null || String(v).trim() === '';
    if (vide) {
      if (complet && c.obligatoire) return { erreur: `Réponse obligatoire : « ${c.label} ».` };
      continue;
    }
    if (c.type === 'texte') { v = String(v).trim(); if (v.length > 2000) return { erreur: `« ${c.label} » : 2 000 caractères au plus.` }; }
    else if (c.type === 'nombre') { v = Number(String(v).replace(/\s/g, '').replace(',', '.')); if (!Number.isFinite(v)) return { erreur: `« ${c.label} » : nombre attendu.` }; }
    else if (c.type === 'date') { v = String(v); if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { erreur: `« ${c.label} » : date attendue (AAAA-MM-JJ).` }; }
    else if (c.type === 'choix') { v = String(v); if (!(c.options || []).includes(v)) return { erreur: `« ${c.label} » : choix inconnu.` }; }
    else if (c.type === 'ouinon') { if (v === true || v === 'oui') v = 'oui'; else if (v === false || v === 'non') v = 'non'; else return { erreur: `« ${c.label} » : oui ou non.` }; }
    out[c.id] = v;
  }
  return { reponses: out };
}

module.exports = { formulaire, verifierDefinition, piecesPour, verifierReponses, TYPES };
