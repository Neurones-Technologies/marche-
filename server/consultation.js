/* Partenaires consultés sur un appel d'offres (clé de procédure « consultes ») : { mode, partenaires }.
     restreint : seuls les partenaires sélectionnés, et référencés, voient le dossier publié et déposent une offre ;
     ouvert    : toute entreprise inscrite (référencée ou non) — seulement pour un acheteur public, dont l'appel
                 d'offres ouvert doit légalement rester accessible à tous.
   Par défaut : ouvert pour un profil public, restreint sinon. La sélection se fait parmi les seuls partenaires
   référencés. */
const P = require('../public/js/profils.js');
const R = require('../public/js/regles.js');
const { partenaireGet } = require('./db');

/** get(clé) : lecture de l'état de la procédure (store.get, ou valeur après un lot de changements). */
function consultation(get) {
  const ctx = { cdc: get('cdc') || {}, org: get('org') || {}, cadre: get('cadre') };
  const pub = !!P.profil(R.profilId(ctx)).public;
  const c = get('consultes') || {};
  const mode = pub && c.mode !== 'restreint' ? 'ouvert' : 'restreint';
  return { public: pub, mode, partenaires: Array.isArray(c.partenaires) ? c.partenaires : [] };
}

/** Le partenaire (fiche, ou null) peut-il voir le dossier et soumissionner ? Retourne null, ou le refus. */
function refusDepot(c, partenaire) {
  if (c.mode === 'ouvert') return null;
  if (!partenaire || partenaire.statut !== 'reference')
    return { code: 'PARTNER_NOT_REFERENCED', error: 'Seuls les partenaires référencés et consultés peuvent soumissionner : complétez votre dossier de référencement.' };
  if (!c.partenaires.includes(partenaire.id))
    return { code: 'PARTNER_NOT_CONSULTED', error: 'Votre entreprise n’est pas consultée sur cet appel d’offres.' };
  return null;
}

/** Contrôle d'une nouvelle valeur de « consultes » ; retourne le message d'erreur, ou null. */
function verifier(value, avant, get, aDeposeOffre) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Consultation invalide.';
  if (!['ouvert', 'restreint'].includes(value.mode)) return 'Mode de consultation inconnu.';
  const pub = consultation(get).public;
  if (value.mode === 'ouvert' && !pub) return 'Un appel d’offres ouvert à toute entreprise n’existe que pour un acheteur public : sélectionnez les partenaires consultés.';
  const ids = value.partenaires;
  if (!Array.isArray(ids) || ids.length > 300 || ids.some((x) => typeof x !== 'string') || new Set(ids).size !== ids.length) return 'Liste de partenaires invalide.';
  const anciens = (avant && Array.isArray(avant.partenaires)) ? avant.partenaires : [];
  for (const id of ids.filter((x) => !anciens.includes(x))) {
    const p = partenaireGet(id);
    if (!p) return 'Partenaire inconnu : ' + id + '.';
    if (p.statut !== 'reference') return `${p.raisonSociale} n’est pas référencé : seuls les partenaires référencés peuvent être consultés.`;
  }
  const retire = anciens.filter((x) => !ids.includes(x)).find((x) => aDeposeOffre(x));
  if (retire) return `${(partenaireGet(retire) || { raisonSociale: retire }).raisonSociale} a déjà déposé une offre : il reste consulté.`;
  return null;
}

/** Prévient (cloche) les comptes des partenaires consultés sur un dossier publié. */
function prevenir(ids, cdc) {
  const { kvGet, kvSet, frDate } = require('./db');
  const comptes = [].concat(...ids.map((id) => (partenaireGet(id) || { comptes: [] }).comptes || []));
  if (!comptes.length) return;
  const cur = (kvGet('notifs') || { value: [] }).value;
  cur.unshift({ id: 'n' + Date.now() + Math.random().toString(36).slice(2, 6), ev: 'consultation', lab: 'Consultation',
    titre: 'Vous êtes consulté : ' + (cdc.ref || 'appel d’offres'),
    corps: 'Votre entreprise est consultée sur l’appel d’offres ' + (cdc.ref || '') + (cdc.objet ? ' — ' + cdc.objet : '') + (cdc.ouverture ? '. Date limite de dépôt : ' + cdc.ouverture : '') + '.',
    t: frDate(), roles: [], ids: comptes, lu: [] });
  kvSet('notifs', cur.slice(0, 120), 'consultation');
}

module.exports = { consultation, refusDepot, verifier, prevenir };
