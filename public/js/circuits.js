/* Moteur de circuits de validation de Marché+, partagé par le navigateur et le serveur (docs/CADRAGE.md §3).
   Chargé tel quel par <script> (global MPCircuits) et par Node (require) : aucune étape de build.

   Un circuit est une liste ordonnée d'étapes. Chaque étape :
     { role: libellé du niveau, who: titulaire (texte), seuil?: montant à partir duquel l'étape s'applique,
       roleId?: rôle réservé (identifiant de rôle), done, by?, at?, requis? }
   `requis` est posé par le serveur quand le montant est connu (false = étape non requise pour ce montant).
   Le circuit d'approbation de l'attribution est le premier à l'utiliser ; le besoin, la commande, la réception
   et le référencement suivront le même modèle. Fonctions pures. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MPCircuits = factory();
})(this, function () {
  'use strict';

  function requise(e) { return !!e && e.requis !== false; }

  /** Étapes requises pour un montant donné : une étape sans seuil s'applique toujours. */
  function appliquerMontant(circuit, montant) {
    return (circuit || []).map(function (e) {
      var s = Number(e.seuil || 0), out = {};
      for (var k in e) if (Object.prototype.hasOwnProperty.call(e, k)) out[k] = e[k];
      out.requis = !(s > 0) || Number(montant) >= s;
      return out;
    });
  }
  function nbRequises(circuit) { return (circuit || []).filter(requise).length; }

  /** Circuit franchi : au moins une étape requise, et toutes les étapes requises approuvées. */
  function complet(circuit) {
    return nbRequises(circuit) > 0 && circuit.every(function (e) { return e.done || !requise(e); });
  }

  /** Index de la prochaine étape à franchir (-1 si aucune). */
  function prochaine(circuit) {
    for (var i = 0; i < (circuit || []).length; i++) if (requise(circuit[i]) && !circuit[i].done) return i;
    return -1;
  }

  /**
   * Peut-on franchir l'étape i ? Retourne null si oui, sinon { status, code, error }.
   * user : { id, role } ; intervenants : identifiants des personnes à écarter (séparation des fonctions).
   */
  function controle(circuit, i, user, intervenants) {
    var e = (circuit || [])[i];
    if (!e) return { status: 404, code: 'STEP_UNKNOWN', error: 'Étape introuvable dans le circuit.' };
    if (!requise(e)) return { status: 409, code: 'STEP_NOT_REQUIRED', error: 'Cette étape n’est pas requise pour ce montant.' };
    if (e.done) return { status: 409, code: 'APPROVAL_ALREADY_GIVEN', error: 'Ce niveau est déjà approuvé.' };
    if (prochaine(circuit) !== i) return { status: 409, code: 'APPROVAL_ORDER', error: 'Les niveaux d’approbation se franchissent dans l’ordre.' };
    if (e.roleId && user.role !== e.roleId) return { status: 403, code: 'STEP_ROLE', error: 'Ce niveau est réservé à un autre rôle.' };
    if ((intervenants || []).indexOf(user.id) >= 0)
      return { status: 403, code: 'SEPARATION_OF_DUTIES', error: 'Vous avez noté ou validé l’évaluation de cette procédure : vous ne pouvez pas en approuver l’attribution.' };
    return null;
  }

  /** Remet le circuit à zéro (rejet, recours fondé) : la configuration reste, les décisions s'effacent. */
  function reinitialiser(circuit) {
    return (circuit || []).map(function (e) {
      var out = {};
      for (var k in e) if (Object.prototype.hasOwnProperty.call(e, k) && ['done', 'by', 'at', 'requis'].indexOf(k) < 0) out[k] = e[k];
      out.done = false;
      return out;
    });
  }

  /** Ce qui définit le circuit (hors décisions) : sert à savoir si un envoi modifie la configuration. */
  function forme(circuit) {
    return (circuit || []).map(function (e) { return { role: e.role, who: e.who, seuil: Number(e.seuil || 0) || null, roleId: e.roleId || null }; });
  }

  return { requise: requise, appliquerMontant: appliquerMontant, nbRequises: nbRequises, complet: complet,
    prochaine: prochaine, controle: controle, reinitialiser: reinitialiser, forme: forme };
});
