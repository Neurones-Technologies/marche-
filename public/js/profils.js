/* Profils réglementaires de Marché+, partagés par le navigateur et le serveur (voir docs/CADRAGE.md §2).
   Chargé tel quel par <script> (global MPProfils) et par Node (require) : aucune étape de build.

   Une règle du profil est soit IMPOSÉE (le client ne peut pas la changer), soit PARAMÉTRABLE : le client la
   règle dans org.reglages, dans les bornes du profil. Les règles du socle (audit, offre non modifiable après
   dépôt, justification des écarts avec l'IA…) ne figurent pas ici : elles s'appliquent toujours.

   VALEURS À FAIRE VALIDER PAR UN JURISTE MARCHÉS PUBLICS avant tout usage réel. Celles du profil public
   reprennent la démonstration (délai de recours de 15 jours, marge de préférence plafonnée à 15 %). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MPProfils = factory();
})(this, function () {
  'use strict';

  var UEMOA = ['CI', 'BF', 'SN', 'ML', 'NE', 'TG', 'BJ', 'GW'];

  /* Les règles que porte un profil. type : 'bool', 'nombre', 'pays' (code ISO), 'liste-pays', 'pieces'. */
  var REGLES = [
    { id: 'recoursActif', lab: 'Procédure de recours des soumissionnaires', type: 'bool' },
    { id: 'delaiRecoursJours', lab: 'Délai de recours avant signature (jours)', type: 'nombre' },
    { id: 'preferenceAutorisee', lab: 'Marge de préférence autorisée', type: 'bool' },
    { id: 'preferenceTauxMax', lab: 'Taux maximal de la marge de préférence (%)', type: 'nombre' },
    { id: 'zonePreference', lab: 'Pays bénéficiant de la préférence', type: 'liste-pays' },
    { id: 'paysLocal', lab: 'Pays de l’acheteur (pièces « locales »)', type: 'pays' },
    { id: 'niveauxApprobationMin', lab: 'Niveaux d’approbation minimum', type: 'nombre' },
    { id: 'separationFonctions', lab: 'Séparation des fonctions (noter ≠ approuver)', type: 'bool' },
    { id: 'piecesImposees', lab: 'Pièces qui ne peuvent pas être retirées', type: 'pieces' },
    { id: 'depotReserveReferences', lab: 'Dépôt d’offre réservé aux partenaires référencés', type: 'bool' },
    { id: 'seuilConsultation', lab: 'Montant à partir duquel un appel d’offres est requis (XOF)', type: 'nombre' },
    { id: 'seuilAppelOffresOuvert', lab: 'Montant à partir duquel l’appel d’offres est ouvert (XOF)', type: 'nombre' },
  ];

  /* Type de procédure selon le montant estimé du besoin. Seuils PROVISOIRES, à valider par un juriste : ils sont
     paramétrables dans les deux profils tant qu'aucune valeur réglementaire n'a été confirmée. */
  var TYPES = {
    consultation: 'Consultation simple (demande de cotations)',
    restreint: 'Appel d’offres restreint',
    ouvert: 'Appel d’offres ouvert',
  };
  function typeProcedure(regles, montant) {
    var m = Number(montant) || 0, id;
    if (m < regles.seuilConsultation) id = 'consultation';
    else if (m < regles.seuilAppelOffresOuvert) id = 'restreint';
    else id = 'ouvert';
    return { id: id, lab: TYPES[id] };
  }

  /* Pour chaque règle : { v: valeur par défaut, impose: true|false, min, max }. */
  var PROFILS = {
    'uemoa-ci': {
      lab: 'Marchés publics — Côte d’Ivoire (UEMOA)', public: true,
      note: 'Directives de l’UEMOA, déclinées pour la Côte d’Ivoire. Valeurs à valider par un juriste.',
      regles: {
        recoursActif: { v: true, impose: true },
        delaiRecoursJours: { v: 15, impose: true },
        preferenceAutorisee: { v: true, impose: true },
        preferenceTauxMax: { v: 15, impose: true },
        zonePreference: { v: UEMOA, impose: true },
        paysLocal: { v: 'CI', impose: true },
        niveauxApprobationMin: { v: 2, impose: false, min: 2, max: 10 },
        separationFonctions: { v: true, impose: true },
        piecesImposees: { v: ['registre', 'fiscal', 'cnps', 'caution'], impose: true },
        depotReserveReferences: { v: false, impose: true },
        seuilConsultation: { v: 10000000, impose: false, min: 0, max: 1000000000000 },
        seuilAppelOffresOuvert: { v: 100000000, impose: false, min: 0, max: 1000000000000 },
      },
    },
    prive: {
      lab: 'Achats privés', public: false,
      note: 'Règles libres : le client règle chaque point dans ses paramètres.',
      regles: {
        recoursActif: { v: false, impose: false },
        delaiRecoursJours: { v: 0, impose: false, min: 0, max: 60 },
        preferenceAutorisee: { v: true, impose: false },
        preferenceTauxMax: { v: 25, impose: false, min: 0, max: 25 },
        zonePreference: { v: UEMOA, impose: false },
        paysLocal: { v: 'CI', impose: false },
        niveauxApprobationMin: { v: 1, impose: false, min: 1, max: 10 },
        separationFonctions: { v: true, impose: false },
        piecesImposees: { v: [], impose: true },
        depotReserveReferences: { v: true, impose: false },
        seuilConsultation: { v: 10000000, impose: false, min: 0, max: 1000000000000 },
        seuilAppelOffresOuvert: { v: 100000000, impose: false, min: 0, max: 1000000000000 },
      },
    },
  };
  var DEFAUT = 'uemoa-ci';

  function profil(id) { return PROFILS[id] || PROFILS[DEFAUT]; }
  function existe(id) { return Object.prototype.hasOwnProperty.call(PROFILS, id); }

  /* Une valeur proposée par le client pour une règle paramétrable : null si acceptable, sinon le motif. */
  function verifier(def, r, val) {
    if (def.type === 'bool') return typeof val === 'boolean' ? null : 'oui ou non attendu';
    if (def.type === 'nombre') {
      if (typeof val !== 'number' || !isFinite(val) || Math.round(val) !== val) return 'nombre entier attendu';
      if (r.min != null && val < r.min) return 'au moins ' + r.min;
      if (r.max != null && val > r.max) return 'au plus ' + r.max;
      return null;
    }
    if (def.type === 'pays') return typeof val === 'string' && /^[A-Z]{2}$/.test(val) ? null : 'code pays à deux lettres attendu';
    if (Array.isArray(val) && val.every(function (x) { return typeof x === 'string' && x.length <= 40; })) return null;
    return 'liste attendue';
  }

  /* Règles effectives d'un profil, compte tenu des réglages du client : { id: valeur }.
     Une règle imposée garde la valeur du profil ; un réglage hors bornes est ignoré. */
  function effectif(id, reglages) {
    var p = profil(id), out = {}, rg = reglages || {};
    REGLES.forEach(function (def) {
      var r = p.regles[def.id], val = r.v;
      if (!r.impose && rg[def.id] != null && verifier(def, r, rg[def.id]) === null) val = rg[def.id];
      out[def.id] = Array.isArray(val) ? val.slice() : val;
    });
    return out;
  }

  /* Réglages proposés par le client : liste des refus { regle, motif } (vide si tout est acceptable). */
  function erreursReglages(id, reglages) {
    var p = profil(id), out = [];
    Object.keys(reglages || {}).forEach(function (k) {
      var def = REGLES.filter(function (d) { return d.id === k; })[0];
      if (!def) { out.push({ regle: k, motif: 'règle inconnue' }); return; }
      var r = p.regles[k];
      if (r.impose) return; // ignorée : le profil l'emporte
      var m = verifier(def, r, reglages[k]);
      if (m) out.push({ regle: def.lab, motif: m });
    });
    return out;
  }

  return { UEMOA: UEMOA, REGLES: REGLES, PROFILS: PROFILS, DEFAUT: DEFAUT, TYPES: TYPES, typeProcedure: typeProcedure, profil: profil, existe: existe, effectif: effectif, erreursReglages: erreursReglages };
});
