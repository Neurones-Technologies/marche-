/* Bon de commande et suivi d'exécution jusqu'à la réception (module 4, docs/CADRAGE.md §4 et §6).
   Marché+ émet le bon de commande ; le titulaire en accuse réception, déclare ses livraisons (bon de livraison joint)
   et dépose ses factures, que les achats rapprochent (montant du jalon, service fait) puis acceptent pour paiement ou
   rejettent avec un motif. Le paiement reste dans l'ERP (export des factures acceptées).

   Statuts : brouillon → validation (circuit circuitCommande sur le montant) → validee → emise (numéro et empreinte
   posés par le serveur) → en_reception → receptionnee (réception provisoire) → cloturee (réception définitive).
   Rejet motivé → rejete (de nouveau modifiable) ; annulee (motivée, avant toute réception ; le numéro est conservé). */
const crypto = require('crypto');
const express = require('express');
const { db, kvGet, store, proceduresAll, partenaireDe, partenairesAll, partenaireGet, partenaireSave, commandesAll, commandeGet, commandeInsert, commandeSave, commandeNumero, auditAppend, frDate } = require('../db');
const { requireAuth, whoLabel } = require('../auth');
const SU = require('../suppleance');
const C = require('../../public/js/circuits.js');
const R = require('../../public/js/regles.js');
const P = require('../../public/js/profils.js');

const B = require('../budget');
const r = express.Router();
r.use(requireAuth);

const gere = (req) => req.can('commande.manage');
const valide = (req) => req.can('commande.approve');
const err = (res, status, code, error) => res.status(status).json({ error, code });
const jour = (d) => (d || new Date()).toISOString().slice(0, 10);
const plusJours = (n) => { const d = new Date(); d.setDate(d.getDate() + Number(n || 0)); return jour(d); };
const ecartJours = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const MODIFIABLE = ['brouillon', 'rejete'];
const EN_EXECUTION = ['emise', 'en_reception', 'receptionnee', 'cloturee'];

function journal(req, c, action) {
  c.historique.push({ t: frDate(), who: whoLabel(req.user), action });
  auditAppend(req.user.id, whoLabel(req.user), `Commande ${c.numero || c.id} — ${action}`, c.procedure.id);
}
/** Contexte de calcul d'une procédure (classement, taux figés, profil). */
function ctxDe(pid) {
  const s = store(pid);
  return { offers: s.offers(), org: s.get('org'), fxFrozen: s.get('fxFrozen'), cadre: s.get('cadre'), cdc: s.get('cdc'), criteria: s.get('criteria'),
    quality: s.get('quality'), justif: s.get('justif'), excluded: s.get('excluded'), confirmed: s.get('confirmed'), docDefs: s.get('docDefs'),
    approvals: s.get('approvals'), contractSigned: s.get('contractSigned') };
}
const total = (c) => c.lignes.reduce((t, l) => t + Number(l.quantite) * Number(l.prixUnitaire), 0);
/** Montant déjà engagé sur une procédure (commandes non annulées), hors la commande exclue. */
const engage = (pid, sauf) => commandesAll().filter((c) => c.procedure.id === pid && c.statut !== 'annulee' && c.id !== sauf).reduce((t, c) => t + total(c), 0);

/** Procédures où une commande peut être établie : attribution prononcée et, en marché public, marché signé. */
function eligibles() {
  return proceduresAll().filter((p) => !p.archive).map((p) => {
    const ctx = ctxDe(p.id);
    if (!R.allApproved(ctx.approvals)) return null;
    const publique = P.profil(R.profilId(ctx)).public;
    if (publique && !ctx.contractSigned) return null;
    const win = R.ranking(ctx)[0];
    if (!win) return null;
    return { procedure: p.id, ref: ctx.cdc.ref, objet: ctx.cdc.objet, titulaire: win.o.name, offre: win.o.id, devise: win.o.devise,
      montant: win.o.montant, restant: win.o.montant - engage(p.id), publique };
  }).filter(Boolean);
}

/** Vue d'une commande : totaux, rapprochement commandé / reçu, retard et pénalités. */
function vue(c) {
  const recu = c.lignes.map((_, i) => c.receptions.reduce((t, x) => t + Number(x.quantites[i] || 0), 0));
  const rapprochement = c.lignes.map((l, i) => ({ designation: l.designation, commande: Number(l.quantite), recu: recu[i], ecart: Number(l.quantite) - recu[i] }));
  const fin = c.receptionProvisoire ? c.receptionProvisoire.date : null;
  const retard = c.dateLivraison && (fin || c.statut === 'emise' || c.statut === 'en_reception')
    ? Math.max(0, ecartJours(c.dateLivraison, fin || jour())) : 0;
  const montant = total(c), cond = c.conditions || {};
  const penalite = Math.min(montant * (Number(cond.penaliteParJour) || 0) / 1000 * retard, montant * (Number(cond.plafondPenalite) || 0) / 100);
  return { ...c, total: montant, rapprochement, retard, penalite: Math.round(penalite), reservesOuvertes: c.receptions.filter((x) => x.reserves && !x.levee).length };
}
function visible(req, c) {
  if (gere(req) || valide(req)) return true;
  if (c.receptionnaire && c.receptionnaire.id === req.user.id) return true;
  const p = req.can('portail.use') ? partenaireDe(req.user.id) : null;
  return !!(p && c.titulaire.partenaire === p.id && ['emise', 'en_reception', 'receptionnee', 'cloturee', 'annulee'].includes(c.statut) && c.numero);
}

/** Le titulaire de la commande (un compte de son entreprise). */
const titulaire = (req, c) => { const p = req.can('portail.use') ? partenaireDe(req.user.id) : null; return !!(p && c.titulaire.partenaire === p.id); };
/** Ce que voit le titulaire : la commande émise et son exécution, sans le circuit interne ni l'historique des achats. */
function vueTitulaire(c) {
  const v = vue(c);
  delete v.circuit; delete v.historique; delete v.rejet; delete v.creePar; delete v.emisePar; delete v.evaluation; delete v.ligneBudget;
  v.avenants = (v.avenants || []).filter((a) => a.numero).map((a) => ({ n: a.n, numero: a.numero, motif: a.motif, nouveauTotal: a.nouveauTotal, emisLe: a.emisLe }));
  return v;
}
r.get('/', (req, res) => res.json({ commandes: commandesAll().filter((c) => visible(req, c)).map((c) => (gere(req) || valide(req) || !titulaire(req, c) ? vue(c) : vueTitulaire(c))) }));

r.get('/eligibles', (req, res) => {
  if (!gere(req)) return err(res, 403, 'FORBIDDEN', 'Habilitation « Établir les bons de commande » requise.');
  res.json({ procedures: eligibles() });
});

/** Factures acceptées pour paiement, pour la comptabilité (CSV ; le paiement reste dans l'ERP). */
r.get('/factures.csv', (req, res) => {
  if (!gere(req)) return err(res, 403, 'FORBIDDEN', 'Habilitation « Établir les bons de commande » requise.');
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lignes = [['Facture', 'Date', 'Commande', 'Titulaire', 'Jalon', 'Montant HT', 'TVA %', 'Montant TTC', 'Devise', 'Acceptée le', 'Empreinte du fichier']];
  commandesAll().forEach((c) => (c.factures || []).filter((f) => f.statut === 'acceptee').forEach((f) =>
    lignes.push([f.numero, f.date, c.numero, c.titulaire.nom, f.jalonLib, f.montantHT, f.tva, f.montantTTC, c.devise, f.decision.t, f.fichier.sha256])));
  auditAppend(req.user.id, whoLabel(req.user), 'Export des factures acceptées pour la comptabilité');
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="factures.csv"', 'Cache-Control': 'no-store' });
  res.send('\ufeff' + lignes.map((l) => l.map(q).join(';')).join('\r\n') + '\r\n');
});

/** Export pour la comptabilité : commandes émises (CSV, séparateur « ; », UTF-8 avec BOM pour les tableurs). */
r.get('/export.csv', (req, res) => {
  if (!gere(req)) return err(res, 403, 'FORBIDDEN', 'Habilitation « Établir les bons de commande » requise.');
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lignes = [['Numéro', 'Émis le', 'Procédure', 'Titulaire', 'Montant', 'Devise', 'Montant XOF', 'Statut', 'Réception provisoire', 'Réception définitive', 'Empreinte']];
  commandesAll().filter((c) => c.numero).map(vue).forEach((c) => lignes.push([c.numero, c.emiseLe, c.procedure.ref, c.titulaire.nom, c.total, c.devise,
    Math.round(c.total * (c.taux || 1)), c.statut, c.receptionProvisoire ? c.receptionProvisoire.date : '', c.receptionDefinitive ? c.receptionDefinitive.date : '', c.empreinte]));
  auditAppend(req.user.id, whoLabel(req.user), 'Export des commandes émises pour la comptabilité');
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="commandes.csv"', 'Cache-Control': 'no-store' });
  res.send('﻿' + lignes.map((l) => l.map(q).join(';')).join('\r\n') + '\r\n');
});

/** Nouvelle commande, pré-remplie depuis l'offre retenue et le cahier des charges. */
r.post('/', (req, res) => {
  if (!gere(req)) return err(res, 403, 'FORBIDDEN', 'Habilitation « Établir les bons de commande » requise.');
  const e = eligibles().find((x) => x.procedure === (req.body || {}).procedure);
  if (!e) return err(res, 409, 'PROCEDURE_NOT_ELIGIBLE', 'Commande impossible : attribution non prononcée, marché non signé (marché public) ou procédure archivée.');
  if (!(e.restant > 0)) return err(res, 409, 'AMOUNT_EXHAUSTED', 'Le montant de l’offre retenue est déjà entièrement engagé.');
  const ctx = ctxDe(e.procedure), cdc = ctx.cdc, win = ctx.offers.find((o) => o.id === e.offre);
  const demandeur = cdc.demandeur ? db.prepare('SELECT id, nom FROM users WHERE id=? AND active=1').get(cdc.demandeur) : null;
  const c = {
    id: 'cmd' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'), numero: null, statut: 'brouillon',
    procedure: { id: e.procedure, ref: cdc.ref, objet: cdc.objet },
    titulaire: { nom: win.name, pays: win.pays, offre: win.id, partenaire: win.partenaire || null },
    devise: win.devise, taux: R.rate(ctx, win.devise), montantOffre: win.montant,
    // prix par lot connus et rien encore d'engagé : une ligne par lot ; sinon le reste à engager, au forfait
    lignes: win.prixLots && e.restant === win.montant
      ? Object.keys(win.prixLots).map((l) => ({ designation: ((cdc.lots || []).find((x) => x.id === l) || {}).nom || l, quantite: 1, unite: 'forfait', prixUnitaire: win.prixLots[l] }))
      : [{ designation: cdc.objet, quantite: 1, unite: 'forfait', prixUnitaire: e.restant }],
    jalons: [
      { libelle: 'Livraison sur site', pourcentage: 30 }, { libelle: 'Installation et essais', pourcentage: 40 },
      { libelle: 'Réception provisoire', pourcentage: 20 }, { libelle: 'Réception définitive', pourcentage: 10 },
    ],
    dateLivraison: plusJours(win.delai || cdc.delaiMax || 30),
    receptionnaire: demandeur ? { id: demandeur.id, nom: demandeur.nom } : { id: req.user.id, nom: req.user.nom },
    conditions: { penaliteParJour: Number(cdc.penalite) || 0, plafondPenalite: 10, garantieMois: Number(cdc.garantieMin) || 0, avance: Number(cdc.avance) || 0, tva: Number(cdc.tva) || 0 },
    circuit: [], receptions: [], historique: [], creePar: req.user.id, cree: frDate(),
    ligneBudget: cdc.ligneBudget || null, // ligne de la demande d'achat d'origine, modifiable sur le brouillon
  };
  db.transaction(() => { journal(req, c, 'brouillon établi pour ' + win.name); commandeInsert(c); })();
  res.status(201).json({ commande: vue(c) });
});

r.use('/:id', (req, res, next) => {
  const c = commandeGet(req.params.id);
  if (!c || !visible(req, c)) return err(res, 404, 'ORDER_UNKNOWN', 'Commande introuvable.');
  req.commande = c;
  next();
});

/** Modification d'un brouillon : lignes, jalons, date de livraison, réceptionnaire, conditions. */
r.put('/:id', (req, res) => {
  const c = req.commande, d = req.body || {};
  if (!gere(req)) return err(res, 403, 'FORBIDDEN', 'Habilitation « Établir les bons de commande » requise.');
  if (!MODIFIABLE.includes(c.statut)) return err(res, 409, 'ORDER_LOCKED', 'Une commande soumise ou émise ne se modifie plus.');
  const lignes = Array.isArray(d.lignes) ? d.lignes : c.lignes, jalons = Array.isArray(d.jalons) ? d.jalons : c.jalons;
  if (!lignes.length || lignes.length > 100) return err(res, 422, 'ORDER_INVALID', 'Une commande compte de 1 à 100 lignes.');
  for (const l of lignes) {
    if (!String(l.designation || '').trim() || String(l.designation).length > 300) return err(res, 422, 'ORDER_INVALID', 'Désignation obligatoire (300 caractères au plus).');
    if (!(Number(l.quantite) > 0) || !(Number(l.prixUnitaire) >= 0)) return err(res, 422, 'ORDER_INVALID', 'Quantité positive et prix unitaire positif ou nul attendus.');
  }
  const somme = jalons.reduce((t, j) => t + Number(j.pourcentage || 0), 0);
  if (jalons.some((j) => !String(j.libelle || '').trim()) || Math.round(somme) !== 100) return err(res, 422, 'MILESTONES_INVALID', `Les jalons de paiement doivent totaliser 100 % (ici ${somme} %).`);
  const dateLivraison = String(d.dateLivraison || c.dateLivraison);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateLivraison)) return err(res, 422, 'ORDER_INVALID', 'Date de livraison invalide (AAAA-MM-JJ).');
  let ligneBudget = c.ligneBudget || null;
  if (d.ligneBudget !== undefined) {
    ligneBudget = d.ligneBudget ? String(d.ligneBudget) : null;
    if (ligneBudget && !B.lignes().some((l) => l.id === ligneBudget)) return err(res, 422, 'BUDGET_LINE_UNKNOWN', 'Ligne budgétaire inconnue.');
  }
  let receptionnaire = c.receptionnaire;
  if (d.receptionnaire) {
    const u = db.prepare('SELECT id, nom FROM users WHERE id=? AND active=1').get(String(d.receptionnaire));
    if (!u) return err(res, 422, 'ORDER_INVALID', 'Réceptionnaire inconnu ou inactif.');
    receptionnaire = { id: u.id, nom: u.nom };
  }
  const nouv = { ...c, lignes: lignes.map((l) => ({ designation: String(l.designation).trim(), quantite: Number(l.quantite), unite: String(l.unite || 'unité').trim().slice(0, 30), prixUnitaire: Number(l.prixUnitaire) })),
    jalons: jalons.map((j) => ({ libelle: String(j.libelle).trim().slice(0, 120), pourcentage: Number(j.pourcentage) })), dateLivraison, receptionnaire, ligneBudget };
  const plafond = c.montantOffre - engage(c.procedure.id, c.id);
  if (total(nouv) > plafond + 0.005) return err(res, 422, 'AMOUNT_EXCEEDED', `Le total dépasse le montant restant de l’offre retenue (${Math.round(plafond).toLocaleString('fr-FR')} ${c.devise}).`);
  db.transaction(() => { Object.assign(c, nouv); journal(req, c, 'brouillon modifié'); commandeSave(c); })();
  res.json({ commande: vue(c) });
});

/** Soumission au circuit : étapes requises selon le montant en XOF ; sans étape requise, la commande est validée. */
r.post('/:id/soumettre', (req, res) => {
  const c = req.commande;
  if (!gere(req)) return err(res, 403, 'FORBIDDEN', 'Habilitation « Établir les bons de commande » requise.');
  if (!MODIFIABLE.includes(c.statut)) return err(res, 409, 'ORDER_LOCKED', 'Cette commande est déjà soumise.');
  if (!(total(c) > 0)) return err(res, 422, 'ORDER_INVALID', 'Le montant de la commande doit être positif.');
  const credits = B.controler(c, total(c) * (c.taux || 1));
  if (credits) return err(res, credits.status, credits.code, credits.error);
  const circuit = C.appliquerMontant(C.reinitialiser((kvGet('circuitCommande') || { value: [] }).value), total(c) * (c.taux || 1));
  db.transaction(() => {
    c.circuit = circuit; delete c.rejet;
    if (C.nbRequises(circuit)) { c.statut = 'validation'; journal(req, c, 'soumise à validation'); }
    else { c.statut = 'validee'; journal(req, c, 'validée : aucune validation requise pour ce montant'); }
    commandeSave(c);
  })();
  res.json({ commande: vue(c) });
});

r.post('/:id/approbations/:niveau', (req, res) => {
  const c = req.commande, i = Number(req.params.niveau);
  if (!valide(req)) return err(res, 403, 'FORBIDDEN', 'Habilitation « Valider un bon de commande » requise.');
  if (c.statut !== 'validation') return err(res, 409, 'ORDER_NOT_SUBMITTED', 'Cette commande n’est pas en attente de validation.');
  const sup = SU.sup(req.user, 'commande', c.id);
  const e = C.controle(c.circuit, i, req.user, [c.creePar], sup);
  if (e) return err(res, e.status, e.code === 'SEPARATION_OF_DUTIES' ? 'ORDER_OWN' : e.code, e.code === 'SEPARATION_OF_DUTIES' ? 'Vous ne pouvez pas valider une commande que vous avez établie.' : e.error);
  const pour = C.pour(c.circuit, i, req.user, sup);
  db.transaction(() => {
    Object.assign(c.circuit[i], { done: true, by: req.user.id, at: frDate() }, pour ? { pour } : {});
    journal(req, c, `validée au niveau « ${c.circuit[i].role} »${SU.mention(pour)}`);
    if (C.complet(c.circuit)) { c.statut = 'validee'; journal(req, c, 'validée : prête à être émise'); }
    commandeSave(c);
  })();
  res.json({ commande: vue(c) });
});

r.post('/:id/rejet', (req, res) => {
  const c = req.commande, motif = String((req.body || {}).motif || '').trim();
  if (!valide(req)) return err(res, 403, 'FORBIDDEN', 'Habilitation « Valider un bon de commande » requise.');
  if (c.statut !== 'validation') return err(res, 409, 'ORDER_NOT_SUBMITTED', 'Cette commande n’est pas en attente de validation.');
  if (!motif || motif.length > 1000) return err(res, 422, 'REJECTION_REASON_REQUIRED', 'Le rejet doit être motivé (1 000 caractères au plus).');
  const i = C.prochaine(c.circuit), sup = SU.sup(req.user, 'commande', c.id), e = C.controle(c.circuit, i, req.user, [c.creePar], sup);
  if (e) return err(res, e.status, e.code, e.error);
  const pour = C.pour(c.circuit, i, req.user, sup);
  db.transaction(() => {
    c.statut = 'rejete'; c.rejet = Object.assign({ niveau: i, role: c.circuit[i].role, motif, by: req.user.id, at: frDate() }, pour ? { pour } : {});
    journal(req, c, `rejetée (${c.circuit[i].role})${SU.mention(pour)} — motif : ${motif}`);
    commandeSave(c);
  })();
  res.json({ commande: vue(c) });
});

/** Émission : numéro continu et empreinte SHA-256 du document, posés par le serveur. Le document ne change plus. */
r.post('/:id/emettre', (req, res) => {
  const c = req.commande;
  if (!gere(req)) return err(res, 403, 'FORBIDDEN', 'Habilitation « Établir les bons de commande » requise.');
  if (c.statut !== 'validee') return err(res, 409, 'ORDER_NOT_VALIDATED', 'Seule une commande validée peut être émise.');
  // les crédits ont pu être consommés depuis la validation : contrôlés de nouveau à l'émission
  const credits = B.controler(c, total(c) * (c.taux || 1));
  if (credits) return err(res, credits.status, credits.code, credits.error);
  const org = (kvGet('org') || { value: {} }).value;
  db.transaction(() => {
    c.numero = commandeNumero(org.prefixeCommande);
    c.emiseLe = frDate(); c.emisePar = { id: req.user.id, nom: req.user.nom };
    c.emetteur = { nom: org.nom, ville: org.ville, pays: org.pays };
    const documentEmis = { numero: c.numero, emiseLe: c.emiseLe, emetteur: c.emetteur, procedure: c.procedure, titulaire: c.titulaire, devise: c.devise,
      lignes: c.lignes, total: total(c), jalons: c.jalons, dateLivraison: c.dateLivraison, conditions: c.conditions, receptionnaire: c.receptionnaire };
    c.empreinte = crypto.createHash('sha256').update(JSON.stringify(documentEmis)).digest('hex');
    c.statut = 'emise';
    journal(req, c, `émise sous le numéro ${c.numero} — empreinte ${c.empreinte.slice(0, 16)}…`);
    commandeSave(c);
  })();
  res.json({ commande: vue(c) });
});

/** Annulation motivée, avant toute réception. Le numéro reste attribué (pas de trou dans la numérotation). */
r.post('/:id/annuler', (req, res) => {
  const c = req.commande, motif = String((req.body || {}).motif || '').trim();
  if (!gere(req)) return err(res, 403, 'FORBIDDEN', 'Habilitation « Établir les bons de commande » requise.');
  if (c.statut === 'annulee' || c.receptions.length) return err(res, 409, 'ORDER_NOT_CANCELLABLE', 'Une commande déjà réceptionnée, même en partie, ne s’annule pas.');
  if (avenantOuvert(c)) return err(res, 409, 'AMENDMENT_PENDING', 'Un avenant est en cours : rejetez-le ou émettez-le avant d’annuler.');
  if (!motif || motif.length > 1000) return err(res, 422, 'REASON_REQUIRED', 'L’annulation doit être motivée (1 000 caractères au plus).');
  db.transaction(() => { c.statut = 'annulee'; c.annulation = { motif, by: req.user.id, at: frDate() }; journal(req, c, 'annulée — motif : ' + motif); commandeSave(c); })();
  res.json({ commande: vue(c) });
});

/* ---- Avenants ----
   Une commande émise ne se modifie jamais : un avenant, motivé, la fait évoluer (quantités, prix, nouvelles lignes,
   date de livraison). Il suit le même circuit de validation, sur le nouveau montant, puis il est émis sous le numéro
   de la commande suivi de -A1, -A2… avec sa propre empreinte. Les versions antérieures restent dans l'historique.
   Une ligne existante ne se supprime pas, et une quantité ne descend jamais sous ce qui a déjà été reçu. */
const AVENANT_OUVERT = ['validation', 'validee'];
const avenantOuvert = (c) => (c.avenants || []).find((a) => AVENANT_OUVERT.includes(a.statut));
function avenantDe(req, res) {
  const a = (req.commande.avenants || [])[Number(req.params.n) - 1];
  if (!a) { err(res, 404, 'AMENDMENT_UNKNOWN', 'Avenant introuvable.'); return null; }
  return a;
}

r.post('/:id/avenants', (req, res) => {
  const c = req.commande, d = req.body || {};
  if (!gere(req)) return err(res, 403, 'FORBIDDEN', 'Habilitation « Établir les bons de commande » requise.');
  if (!['emise', 'en_reception', 'receptionnee'].includes(c.statut)) return err(res, 409, 'ORDER_NOT_AMENDABLE', 'Seule une commande émise, dont la réception définitive n’est pas prononcée, peut faire l’objet d’un avenant.');
  if (avenantOuvert(c)) return err(res, 409, 'AMENDMENT_PENDING', 'Un avenant est déjà en cours sur cette commande.');
  const motif = String(d.motif || '').trim();
  if (!motif || motif.length > 1000) return err(res, 422, 'REASON_REQUIRED', 'L’avenant doit être motivé (1 000 caractères au plus).');
  const lignes = Array.isArray(d.lignes) ? d.lignes : [];
  if (lignes.length < c.lignes.length) return err(res, 422, 'AMENDMENT_INVALID', 'Une ligne de la commande ne se supprime pas : ramenez sa quantité au nécessaire.');
  if (lignes.length > 100) return err(res, 422, 'AMENDMENT_INVALID', 'Une commande compte 100 lignes au plus.');
  for (const l of lignes) {
    if (!String(l.designation || '').trim() || String(l.designation).length > 300) return err(res, 422, 'AMENDMENT_INVALID', 'Désignation obligatoire (300 caractères au plus).');
    if (!(Number(l.quantite) >= 0) || !(Number(l.prixUnitaire) >= 0)) return err(res, 422, 'AMENDMENT_INVALID', 'Quantités et prix unitaires positifs ou nuls attendus.');
  }
  const recu = vue(c).rapprochement;
  const sous = c.lignes.map((l, i) => (Number(lignes[i].quantite) + 1e-9 < recu[i].recu ? l.designation : null)).filter(Boolean);
  if (sous.length) return err(res, 422, 'AMENDMENT_BELOW_RECEIVED', 'Quantité inférieure à ce qui a déjà été reçu : ' + sous.join(' ; ') + '.');
  const dateLivraison = String(d.dateLivraison || c.dateLivraison);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateLivraison)) return err(res, 422, 'AMENDMENT_INVALID', 'Date de livraison invalide (AAAA-MM-JJ).');
  const nouvelles = lignes.map((l) => ({ designation: String(l.designation).trim(), quantite: Number(l.quantite), unite: String(l.unite || 'unité').trim().slice(0, 30), prixUnitaire: Number(l.prixUnitaire) }));
  const nouveauTotal = total({ lignes: nouvelles });
  const plafond = c.montantOffre - engage(c.procedure.id, c.id);
  if (nouveauTotal > plafond + 0.005) return err(res, 422, 'AMOUNT_EXCEEDED', `Le nouveau total dépasse le montant restant de l’offre retenue (${Math.round(plafond).toLocaleString('fr-FR')} ${c.devise}).`);
  if (!(nouveauTotal > 0)) return err(res, 422, 'AMENDMENT_INVALID', 'Le montant de la commande modifiée doit rester positif.');
  if (nouveauTotal > total(c)) { const credits = B.controler(c, nouveauTotal * (c.taux || 1)); if (credits) return err(res, credits.status, credits.code, credits.error); }
  const circuit = C.appliquerMontant(C.reinitialiser((kvGet('circuitCommande') || { value: [] }).value), nouveauTotal * (c.taux || 1));
  const a = { n: (c.avenants || []).length + 1, motif, lignes: nouvelles, dateLivraison, ancienTotal: total(c), nouveauTotal, circuit,
    statut: C.nbRequises(circuit) ? 'validation' : 'validee', creePar: req.user.id, cree: frDate() };
  db.transaction(() => {
    c.avenants = (c.avenants || []).concat([a]);
    journal(req, c, `avenant n° ${a.n} proposé (${Math.round(a.ancienTotal).toLocaleString('fr-FR')} → ${Math.round(nouveauTotal).toLocaleString('fr-FR')} ${c.devise}) — motif : ${motif}`);
    commandeSave(c);
  })();
  res.status(201).json({ commande: vue(c) });
});

r.post('/:id/avenants/:n/approbations/:niveau', (req, res) => {
  const c = req.commande, a = avenantDe(req, res), i = Number(req.params.niveau);
  if (!a) return;
  if (!valide(req)) return err(res, 403, 'FORBIDDEN', 'Habilitation « Valider un bon de commande » requise.');
  if (a.statut !== 'validation') return err(res, 409, 'AMENDMENT_NOT_SUBMITTED', 'Cet avenant n’est pas en attente de validation.');
  const sup = SU.sup(req.user, 'avenant', c.id + '#' + req.params.n);
  const e = C.controle(a.circuit, i, req.user, [a.creePar], sup);
  if (e) return err(res, e.status, e.code === 'SEPARATION_OF_DUTIES' ? 'ORDER_OWN' : e.code, e.code === 'SEPARATION_OF_DUTIES' ? 'Vous ne pouvez pas valider un avenant que vous avez établi.' : e.error);
  const pour = C.pour(a.circuit, i, req.user, sup);
  db.transaction(() => {
    Object.assign(a.circuit[i], { done: true, by: req.user.id, at: frDate() }, pour ? { pour } : {});
    if (C.complet(a.circuit)) a.statut = 'validee';
    journal(req, c, `avenant n° ${a.n} validé au niveau « ${a.circuit[i].role} »${SU.mention(pour)}`);
    commandeSave(c);
  })();
  res.json({ commande: vue(c) });
});

r.post('/:id/avenants/:n/rejet', (req, res) => {
  const c = req.commande, a = avenantDe(req, res), motif = String((req.body || {}).motif || '').trim();
  if (!a) return;
  if (!valide(req)) return err(res, 403, 'FORBIDDEN', 'Habilitation « Valider un bon de commande » requise.');
  if (a.statut !== 'validation') return err(res, 409, 'AMENDMENT_NOT_SUBMITTED', 'Cet avenant n’est pas en attente de validation.');
  if (!motif || motif.length > 1000) return err(res, 422, 'REJECTION_REASON_REQUIRED', 'Le rejet doit être motivé (1 000 caractères au plus).');
  const i = C.prochaine(a.circuit), sup = SU.sup(req.user, 'avenant', c.id + '#' + req.params.n), e = C.controle(a.circuit, i, req.user, [a.creePar], sup);
  if (e) return err(res, e.status, e.code, e.error);
  const pour = C.pour(a.circuit, i, req.user, sup);
  db.transaction(() => {
    a.statut = 'rejete'; a.rejet = Object.assign({ niveau: i, role: a.circuit[i].role, motif, by: req.user.id, at: frDate() }, pour ? { pour } : {});
    journal(req, c, `avenant n° ${a.n} rejeté (${a.circuit[i].role})${SU.mention(pour)} — motif : ${motif}`);
    commandeSave(c);
  })();
  res.json({ commande: vue(c) });
});

/** Émission de l'avenant : numéro dérivé de la commande, empreinte, nouvelle version de la commande en vigueur. */
r.post('/:id/avenants/:n/emettre', (req, res) => {
  const c = req.commande, a = avenantDe(req, res);
  if (!a) return;
  if (!gere(req)) return err(res, 403, 'FORBIDDEN', 'Habilitation « Établir les bons de commande » requise.');
  if (a.statut !== 'validee') return err(res, 409, 'AMENDMENT_NOT_VALIDATED', 'Seul un avenant validé peut être émis.');
  if (!['emise', 'en_reception', 'receptionnee'].includes(c.statut)) return err(res, 409, 'ORDER_NOT_AMENDABLE', 'La commande n’accepte plus d’avenant.');
  db.transaction(() => {
    const precedente = { version: c.version || 0, lignes: c.lignes, dateLivraison: c.dateLivraison, empreinte: a.n > 1 ? (c.avenants[a.n - 2] || {}).empreinte || c.empreinte : c.empreinte };
    a.numero = c.numero + '-A' + a.n;
    a.emisLe = frDate(); a.emisPar = { id: req.user.id, nom: req.user.nom };
    a.empreinte = crypto.createHash('sha256').update(JSON.stringify({ numero: a.numero, commande: c.numero, emisLe: a.emisLe, motif: a.motif,
      lignes: a.lignes, total: a.nouveauTotal, dateLivraison: a.dateLivraison, precedente: precedente.empreinte })).digest('hex');
    a.statut = 'emis';
    c.versions = (c.versions || []).concat([precedente]);
    c.lignes = a.lignes; c.dateLivraison = a.dateLivraison; c.version = a.n;
    // la réception reprend selon les nouvelles quantités
    const v = vue(c);
    if (c.receptions.length) {
      const complete = v.rapprochement.every((x) => x.ecart <= 1e-9);
      c.statut = complete ? 'receptionnee' : 'en_reception';
      if (!complete) delete c.receptionProvisoire;
    } else c.statut = 'emise';
    journal(req, c, `avenant ${a.numero} émis — empreinte ${a.empreinte.slice(0, 16)}…`);
    commandeSave(c);
  })();
  res.json({ commande: vue(c) });
});

/* ---- Réceptions : par le réceptionnaire désigné ---- */
const estReceptionnaire = (req, c) => c.receptionnaire && c.receptionnaire.id === req.user.id;

/** Constat d'une livraison : quantités reçues par ligne, conformité, réserves. */
/* ---- Exécution par le titulaire : pièces, accusé de réception, livraisons, factures ---- */
const comptesTitulaire = (c) => ((c.titulaire.partenaire && partenaireGet(c.titulaire.partenaire)) || {}).comptes || [];
const prevenirAchats = (c, titre, corps) => SU.notifier([c.creePar, c.receptionnaire && c.receptionnaire.id].filter(Boolean), titre, corps, { ev: 'execution', lab: 'Exécution' });
const prevenirTitulaire = (c, titre, corps) => SU.notifier(comptesTitulaire(c), titre, corps, { ev: 'execution', lab: 'Exécution' });
const sansTitulaire = (res) => err(res, 403, 'NOT_HOLDER', 'Réservé au titulaire de la commande.');

/** Pièce d'exécution déposée par le titulaire : bon de livraison ou facture (PDF ou image), rattachée à la commande. */
r.post('/:id/fichiers', require('./files').corpsBrut, (req, res) => {
  const c = req.commande;
  if (!titulaire(req, c)) return sansTitulaire(res);
  if (!EN_EXECUTION.includes(c.statut)) return err(res, 409, 'ORDER_NOT_RUNNING', 'Cette commande n’est pas en exécution.');
  const fx = require('./files').lireFichier(req);
  if (fx.erreur) return err(res, fx.status, 'FILE_INVALID', fx.erreur);
  if (!['bon-livraison', 'facture'].includes(fx.doc)) return err(res, 422, 'FILE_INVALID', 'Pièce attendue : bon de livraison ou facture.');
  if (!/^(application\/pdf|image\/(png|jpeg))$/.test(fx.mime)) return err(res, 415, 'FILE_TYPE', 'Format attendu : PDF ou image (PNG, JPEG).');
  const id = crypto.randomUUID();
  require('fs').writeFileSync(require('./files').diskPath(id), fx.body, { mode: 0o600 });
  db.prepare('INSERT INTO files(id,owner,doc_id,name,mime,size,sha256,procedure_id,commande_id) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(id, req.user.id, fx.doc, fx.name, fx.mime, fx.body.length, fx.sha, c.procedure.id, c.id);
  res.status(201).json({ id, doc: fx.doc, name: fx.name, size: fx.body.length, sha256: fx.sha });
});
/** Pièce d'exécution de cette commande, d'un type donné, déposée par l'entreprise titulaire. */
function pieceExecution(c, id, doc) {
  const f = id ? db.prepare('SELECT id, name, size, sha256 FROM files WHERE id=? AND commande_id=? AND doc_id=?').get(String(id), c.id, doc) : null;
  return f ? { id: f.id, name: f.name, size: f.size, sha256: f.sha256 } : null;
}

/** Accusé de réception du bon de commande par le titulaire. */
r.post('/:id/accuse', (req, res) => {
  const c = req.commande;
  if (!titulaire(req, c)) return sansTitulaire(res);
  if (!EN_EXECUTION.includes(c.statut)) return err(res, 409, 'ORDER_NOT_RUNNING', 'Cette commande n’est pas en exécution.');
  if (c.accuse) return err(res, 409, 'ALREADY_ACKNOWLEDGED', 'Le bon de commande a déjà été accusé.');
  db.transaction(() => {
    c.accuse = { t: frDate(), par: { id: req.user.id, nom: req.user.nom } };
    journal(req, c, 'bon de commande reçu et accepté par le titulaire');
    commandeSave(c);
  })();
  prevenirAchats(c, `Commande ${c.numero} acceptée par ${c.titulaire.nom}`, `${req.user.nom} a accusé réception du bon de commande ${c.numero}.`);
  res.json({ commande: vueTitulaire(c) });
});

/** Livraison déclarée par le titulaire : quantités par ligne, date, bon de livraison ; le réceptionnaire la constate. */
r.post('/:id/livraisons', (req, res) => {
  const c = req.commande, d = req.body || {};
  if (!titulaire(req, c)) return sansTitulaire(res);
  if (!['emise', 'en_reception'].includes(c.statut)) return err(res, 409, 'ORDER_NOT_RECEIVABLE', 'Cette commande n’attend plus de livraison.');
  const q = Array.isArray(d.quantites) ? d.quantites.map(Number) : [];
  if (q.length !== c.lignes.length || q.some((x) => !(x >= 0)) || !q.some((x) => x > 0)) return err(res, 422, 'DELIVERY_INVALID', 'Quantités livrées attendues pour chaque ligne (au moins une positive).');
  const rp = vue(c).rapprochement, trop = c.lignes.map((l, i) => (q[i] > rp[i].ecart + 1e-9 ? l.designation : null)).filter(Boolean);
  if (trop.length) return err(res, 422, 'DELIVERY_EXCEEDS_ORDER', 'Quantité supérieure au reste à livrer : ' + trop.join(' ; ') + '.');
  const date = String(d.date || jour());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > jour()) return err(res, 422, 'DELIVERY_INVALID', 'Date de livraison invalide (pas dans le futur).');
  const bon = pieceExecution(c, d.bon, 'bon-livraison');
  if (d.bon && !bon) return err(res, 422, 'FILE_UNKNOWN', 'Bon de livraison introuvable : joignez-le de nouveau.');
  const commentaire = String(d.commentaire || '').trim().slice(0, 1000);
  c.livraisons = c.livraisons || [];
  const l = { n: c.livraisons.length + 1, date, t: frDate(), par: { id: req.user.id, nom: req.user.nom }, quantites: q, bon, commentaire: commentaire || null, statut: 'declaree' };
  db.transaction(() => { c.livraisons.push(l); journal(req, c, `livraison n° ${l.n} déclarée par le titulaire (${date})`); commandeSave(c); })();
  SU.notifier([c.receptionnaire && c.receptionnaire.id].filter(Boolean), `Livraison annoncée — commande ${c.numero}`,
    `${c.titulaire.nom} déclare une livraison le ${date.split('-').reverse().join('/')}. Constatez-la dans « Exécution ».`, { ev: 'execution', lab: 'Exécution' });
  res.status(201).json({ commande: vueTitulaire(c) });
});

/** Facture déposée par le titulaire, rapportée à un jalon de paiement. */
r.post('/:id/factures', (req, res) => {
  const c = req.commande, d = req.body || {};
  if (!titulaire(req, c)) return sansTitulaire(res);
  if (!EN_EXECUTION.includes(c.statut)) return err(res, 409, 'ORDER_NOT_RUNNING', 'Cette commande n’est pas en exécution.');
  const numero = String(d.numero || '').trim(), date = String(d.date || ''), ht = Math.round(Number(d.montantHT) * 100) / 100, j = Number(d.jalon);
  if (!numero || numero.length > 40) return err(res, 422, 'INVOICE_INVALID', 'Numéro de facture obligatoire (40 caractères au plus).');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > jour()) return err(res, 422, 'INVOICE_INVALID', 'Date de facture invalide.');
  if (!(ht > 0)) return err(res, 422, 'INVOICE_INVALID', 'Montant hors taxes invalide.');
  if (!Number.isInteger(j) || !c.jalons[j]) return err(res, 422, 'INVOICE_INVALID', 'Jalon de paiement inconnu.');
  const fichier = pieceExecution(c, d.fichier, 'facture');
  if (!fichier) return err(res, 422, 'INVOICE_FILE_REQUIRED', 'Joignez la facture (PDF ou image).');
  const actives = (c.factures || []).filter((f) => f.statut !== 'rejetee');
  if (actives.some((f) => f.numero.toLowerCase() === numero.toLowerCase())) return err(res, 409, 'INVOICE_DUPLICATE', 'Une facture porte déjà ce numéro sur cette commande.');
  if (actives.some((f) => f.jalon === j)) return err(res, 409, 'MILESTONE_INVOICED', 'Ce jalon est déjà facturé.');
  const deja = actives.reduce((t, f) => t + f.montantHT, 0), tot = total(c);
  if (deja + ht > tot + 0.5) return err(res, 422, 'INVOICE_EXCEEDS_ORDER', `Le cumul facturé dépasserait le montant de la commande (reste ${Math.round(tot - deja).toLocaleString('fr-FR')} ${c.devise}).`);
  const tva = Number((c.conditions || {}).tva) || 0, attendu = Math.round(tot * c.jalons[j].pourcentage) / 100;
  c.factures = c.factures || [];
  const f = { n: c.factures.length + 1, numero, date, montantHT: ht, tva, montantTTC: Math.round(ht * (1 + tva / 100) * 100) / 100,
    jalon: j, jalonLib: c.jalons[j].libelle, attendu, fichier, deposee: frDate(), par: { id: req.user.id, nom: req.user.nom }, statut: 'deposee' };
  db.transaction(() => { c.factures.push(f); journal(req, c, `facture ${numero} déposée (${ht.toLocaleString('fr-FR')} ${c.devise} HT, jalon « ${f.jalonLib} »)`); commandeSave(c); })();
  prevenirAchats(c, `Facture reçue — commande ${c.numero}`, `${c.titulaire.nom} a déposé la facture ${numero} (${ht.toLocaleString('fr-FR')} ${c.devise} HT, jalon « ${f.jalonLib} »).`);
  res.status(201).json({ commande: vueTitulaire(c) });
});

/** Décision des achats sur une facture : acceptée pour paiement (service fait constaté) ou rejetée avec un motif. */
r.post('/:id/factures/:n/decision', (req, res) => {
  const c = req.commande, f = (c.factures || [])[Number(req.params.n) - 1], d = req.body || {};
  if (!gere(req)) return err(res, 403, 'FORBIDDEN', 'Habilitation « Établir les bons de commande » requise.');
  if (!f) return err(res, 404, 'INVOICE_UNKNOWN', 'Facture introuvable.');
  if (f.statut !== 'deposee') return err(res, 409, 'INVOICE_DECIDED', 'Cette facture a déjà fait l’objet d’une décision.');
  const motif = String(d.motif || '').trim().slice(0, 1000);
  if (d.decision === 'rejetee' && !motif) return err(res, 422, 'REASON_REQUIRED', 'Le rejet d’une facture doit être motivé.');
  if (d.decision === 'acceptee' && !c.receptions.length) return err(res, 409, 'SERVICE_NOT_DONE', 'Aucune réception n’est constatée : pas de paiement sans service fait.');
  if (!['acceptee', 'rejetee'].includes(d.decision)) return err(res, 422, 'DECISION_INVALID', 'Décision attendue : acceptée ou rejetée.');
  db.transaction(() => {
    Object.assign(f, { statut: d.decision, decision: { t: frDate(), par: { id: req.user.id, nom: req.user.nom }, motif: motif || null } });
    journal(req, c, `facture ${f.numero} ${d.decision === 'acceptee' ? 'acceptée pour paiement' : 'rejetée — motif : ' + motif}`);
    commandeSave(c);
  })();
  prevenirTitulaire(c, `Facture ${f.numero} ${d.decision === 'acceptee' ? 'acceptée pour paiement' : 'rejetée'}`,
    d.decision === 'acceptee' ? `Votre facture ${f.numero} (commande ${c.numero}) est transmise pour paiement.` : `Votre facture ${f.numero} (commande ${c.numero}) est rejetée : ${motif}`);
  res.json({ commande: vue(c) });
});

r.post('/:id/receptions', (req, res) => {
  const c = req.commande, d = req.body || {};
  if (!estReceptionnaire(req, c)) return err(res, 403, 'NOT_RECEIVER', 'Seul le réceptionnaire désigné constate une réception.');
  if (!['emise', 'en_reception'].includes(c.statut)) return err(res, 409, 'ORDER_NOT_RECEIVABLE', 'Cette commande n’attend pas de livraison.');
  const q = Array.isArray(d.quantites) ? d.quantites.map(Number) : [];
  if (q.length !== c.lignes.length || q.some((x) => !(x >= 0)) || !q.some((x) => x > 0)) return err(res, 422, 'RECEPTION_INVALID', 'Quantités reçues attendues pour chaque ligne (au moins une positive).');
  const deja = vue(c).rapprochement;
  const trop = c.lignes.map((l, i) => (deja[i].recu + q[i] > Number(l.quantite) + 1e-9 ? l.designation : null)).filter(Boolean);
  if (trop.length) return err(res, 422, 'RECEPTION_EXCEEDS_ORDER', 'Quantité reçue supérieure à la quantité commandée : ' + trop.join(' ; ') + '.');
  const reserves = String(d.reserves || '').trim();
  if (reserves.length > 2000) return err(res, 422, 'RECEPTION_INVALID', 'Réserves trop longues (2 000 caractères au plus).');
  db.transaction(() => {
    c.receptions.push({ n: c.receptions.length + 1, date: jour(), t: frDate(), par: { id: req.user.id, nom: req.user.nom }, quantites: q, reserves: reserves || null, levee: null });
    // livraison déclarée par le titulaire que cette réception constate
    const liv = (c.livraisons || []).find((x) => x.n === Number(d.livraison) && x.statut === 'declaree');
    if (liv) { liv.statut = 'constatee'; liv.reception = c.receptions.length; }
    const complete = vue(c).rapprochement.every((x) => x.ecart <= 1e-9);
    c.statut = complete ? 'receptionnee' : 'en_reception';
    journal(req, c, `réception n° ${c.receptions.length}${reserves ? ' avec réserves' : ''}${complete ? ' — tout est livré : réception provisoire' : ' — livraison partielle'}`);
    if (complete) { c.receptionProvisoire = { date: jour(), t: frDate() }; c.retardConstate = vue(c).retard; }
    commandeSave(c);
  })();
  res.status(201).json({ commande: vue(c) });
});

/** Levée des réserves d'une réception, motivée par le réceptionnaire. */
r.post('/:id/receptions/:n/levee', (req, res) => {
  const c = req.commande, x = c.receptions[Number(req.params.n) - 1], motif = String((req.body || {}).motif || '').trim();
  if (!estReceptionnaire(req, c)) return err(res, 403, 'NOT_RECEIVER', 'Seul le réceptionnaire désigné lève les réserves.');
  if (!x || !x.reserves || x.levee) return err(res, 409, 'NO_OPEN_RESERVE', 'Aucune réserve ouverte sur cette réception.');
  if (!motif) return err(res, 422, 'REASON_REQUIRED', 'La levée des réserves doit être motivée.');
  db.transaction(() => { x.levee = { motif: motif.slice(0, 1000), t: frDate() }; journal(req, c, `réserves de la réception n° ${x.n} levées — ${x.levee.motif}`); commandeSave(c); })();
  res.json({ commande: vue(c) });
});

/* ---- Évaluation des partenaires (module 5) ----
   À la réception définitive, la commande reçoit une note sur 100 : quatre critères pondérés par l'organisation.
     délais      : 100 sans retard, 0 au-delà du retard plafond, linéaire entre les deux ;
     conformité  : part des réceptions sans réserve ;
     complétude  : part des quantités livrées à la date prévue ;
     qualité     : appréciation du réceptionnaire, de 1 à 5.
   La note du partenaire est la moyenne de ses commandes évaluées ; sous le seuil, une alerte est levée (jamais de
   suspension automatique). La note est montrée aux évaluateurs des offres, sans entrer dans le classement. */
function evaluer(c, qualite) {
  const reglages = (kvGet('evaluationPartenaires') || { value: {} }).value, poids = reglages.criteres || {};
  const v = vue(c), commande = c.lignes.reduce((t, l) => t + Number(l.quantite), 0);
  const aTemps = c.receptions.filter((x) => x.date <= c.dateLivraison).reduce((t, x) => t + x.quantites.reduce((s, q) => s + Number(q), 0), 0);
  const scores = {
    delais: Math.max(0, 100 * (1 - v.retard / (Number(reglages.plafondRetardJours) || 30))),
    conformite: 100 * c.receptions.filter((x) => !x.reserves).length / c.receptions.length,
    completude: commande ? 100 * Math.min(1, aTemps / commande) : 0,
    qualite: (qualite.note - 1) * 25,
  };
  const note = Object.keys(scores).reduce((t, k) => t + scores[k] * (Number(poids[k]) || 0) / 100, 0);
  Object.keys(scores).forEach((k) => { scores[k] = Math.round(scores[k]); });
  return { scores, poids: { ...poids }, note: Math.round(note), qualite: qualite.note, commentaire: qualite.commentaire || null, retard: v.retard };
}
/** Fiche partenaire du titulaire : celle de l'offre, sinon celle de même raison sociale. */
function partenaireDuTitulaire(c) {
  if (c.titulaire.partenaire) return partenaireGet(c.titulaire.partenaire);
  const nom = String(c.titulaire.nom || '').trim().toLowerCase();
  return partenairesAll().find((p) => String(p.raisonSociale || '').trim().toLowerCase() === nom) || null;
}
/** Recalcule la note d'un partenaire à partir de toutes ses commandes évaluées ; alerte sous le seuil. */
function recalculer(req, p) {
  const seuil = Number(((kvGet('evaluationPartenaires') || { value: {} }).value).seuilAlerte) || 0;
  const notes = commandesAll().filter((x) => x.evaluation && x.evaluation.partenaire === p.id).map((x) => x.evaluation.note);
  const avant = p.evaluation || {};
  const moyenne = notes.length ? Math.round(notes.reduce((t, n) => t + n, 0) / notes.length) : null;
  p.evaluation = { moyenne, nb: notes.length, seuil, alerte: moyenne != null && moyenne < seuil, maj: frDate() };
  if (p.evaluation.alerte && !avant.alerte) {
    p.historique.push({ t: frDate(), who: 'Système', action: `alerte : note ${moyenne}/100, sous le seuil de ${seuil}` });
    auditAppend(req.user.id, whoLabel(req.user), `Partenaire ${p.id} (${p.raisonSociale}) — alerte d’évaluation : ${moyenne}/100 sous le seuil de ${seuil}`);
  }
  partenaireSave(p);
  return p.evaluation;
}

/** Réception définitive : après la réception provisoire, sans réserve ouverte, avec l'appréciation de la qualité.
    Clôt l'exécution dans Marché+ et évalue le titulaire. */
r.post('/:id/definitive', (req, res) => {
  const c = req.commande, d = req.body || {};
  if (!estReceptionnaire(req, c)) return err(res, 403, 'NOT_RECEIVER', 'Seul le réceptionnaire désigné prononce la réception définitive.');
  if (c.statut !== 'receptionnee') return err(res, 409, 'NOT_PROVISIONALLY_RECEIVED', 'La réception définitive suit la réception provisoire.');
  if (vue(c).reservesOuvertes) return err(res, 409, 'RESERVES_OPEN', 'Des réserves sont encore ouvertes : levez-les avant la réception définitive.');
  const note = Number(d.qualite);
  if (!Number.isInteger(note) || note < 1 || note > 5) return err(res, 422, 'QUALITY_REQUIRED', 'Appréciation de la qualité attendue, de 1 (insuffisante) à 5 (excellente).');
  const commentaire = String(d.commentaire || '').trim().slice(0, 1000);
  let alerte = null;
  db.transaction(() => {
    c.statut = 'cloturee'; c.receptionDefinitive = { date: jour(), t: frDate() };
    const p = partenaireDuTitulaire(c);
    c.evaluation = { ...evaluer(c, { note, commentaire }), partenaire: p ? p.id : null, par: { id: req.user.id, nom: req.user.nom }, t: frDate() };
    journal(req, c, `réception définitive prononcée — évaluation du titulaire : ${c.evaluation.note}/100`);
    commandeSave(c);
    if (p) alerte = recalculer(req, p);
  })();
  res.json({ commande: vue(c), evaluationPartenaire: alerte });
});

/** La commande est-elle visible de ce compte (téléchargement d'une pièce d'exécution) ? */
r.voitCommande = (req, id) => { const c = commandeGet(id); return !!(c && visible(req, c)); };
module.exports = r;
