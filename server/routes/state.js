/* Routes d'une procédure, montées sous /api/procedures/:pid (voir routes/procedures.js, qui pose req.pid et
   req.store). L'état renvoyé réunit les clés de l'organisation et celles de la procédure. */
const express = require('express');
const { db, getRev, kvGet, kvAll, pkvAll, auditAppend, auditList, offerInsert, offersReplace, frDate, isProcKey, partenaireDe, partenairesAll } = require('../db');
const { whoLabel } = require('../auth');
const { validateChange, effectsOf } = require('../rules');
const R = require('../../public/js/regles.js');
const mail = require('../mail');
const { pieceValable } = require('./partenaires');
const C = require('../../public/js/circuits.js');

const r = express.Router({ mergeParams: true });

/** État complet visible par l'utilisateur courant, pour la procédure req.pid. */
function buildState(req) {
  const org = kvAll(), proc = pkvAll(req.pid);
  const values = { ...org.values, ...proc.values }, revs = { ...org.revs, ...proc.revs };
  const users = db.prepare('SELECT id,nom,role FROM users WHERE active=1 ORDER BY rowid').all();
  const canSeeOffers = req.can('offres.read');
  // accusés de dépôt : tous pour les lecteurs des offres, ses seuls dépôts pour un soumissionnaire
  const receipts = canSeeOffers
    ? db.prepare('SELECT data FROM receipts WHERE procedure_id=? ORDER BY created_at, num').all(req.pid)
    : req.can('portail.use') ? db.prepare('SELECT data FROM receipts WHERE procedure_id=? AND owner=? ORDER BY created_at, num').all(req.pid, req.user.id) : [];
  const st = {
    ...values, users, me: req.user.id, procedure: req.pid,
    offers: canSeeOffers ? req.store.offers() : [],
    receipts: receipts.map((x) => JSON.parse(x.data)),
    audit: req.pid && (req.can('audit.read') || req.can('pv.read')) ? auditList(200, req.pid) : [],
  };
  delete st._sod; // historique de séparation des fonctions : interne au serveur
  // notifications et courriels : chacun ne reçoit que ce qui le concerne (l'administration et l'audit voient tout)
  const toutVoir = req.can('notif.manage') || req.can('audit.read');
  if (!toutVoir) {
    st.notifs = (st.notifs || []).filter((n) => (n.roles || []).includes(req.user.role) || (n.ids || []).includes(req.user.id));
    st.emails = (st.emails || []).filter((e) => (e.ids || []).includes(req.user.id));
  }
  if (!req.can('roles.edit')) {
    st.delegations = (st.delegations || []).filter((d) => d.de === req.user.id || d.a === req.user.id);
    st.affectations = (st.affectations || []).filter((a) => a.a === req.user.id);
  }
  st.courriels = { mode: mail.actif() ? 'microsoft365' : 'simulation', expediteur: mail.actif() ? mail.expediteur() : null };
  // évaluation des partenaires (module 5) : montrée aux lecteurs des offres, jamais intégrée au classement
  if (canSeeOffers && req.pid) {
    const fiches = partenairesAll(), par = {};
    for (const o of st.offers) {
      const p = o.partenaire ? fiches.find((x) => x.id === o.partenaire)
        : fiches.find((x) => String(x.raisonSociale || '').trim().toLowerCase() === String(o.name || '').trim().toLowerCase());
      if (p && p.evaluation && p.evaluation.nb) par[o.id] = { partenaire: p.id, moyenne: p.evaluation.moyenne, nb: p.evaluation.nb, alerte: p.evaluation.alerte };
    }
    st.evaluationsOffres = par;
  }
  // le soumissionnaire voit l'état de son référencement et les pièces qui en tiennent lieu au dépôt
  if (req.can('portail.use')) {
    const p = partenaireDe(req.user.id);
    st.monPartenaire = p ? { id: p.id, raisonSociale: p.raisonSociale, pays: p.pays, statut: p.statut,
      piecesValables: Object.keys(p.pieces).filter((k) => pieceValable(p.pieces[k])).reduce((o, k) => { o[k] = { nom: p.pieces[k].nom, expire: p.pieces[k].expire }; return o; }, {}) } : null;
  }
  // Un soumissionnaire ne doit voir ni les notes, ni les décisions internes.
  if (!canSeeOffers) { st.quality = {}; st.justif = {}; st.confirmed = {}; st.excluded = {}; }
  // … ni le personnel (qui évalue, qui approuve), ni les délibérations, ni ce qui concerne ses concurrents (qui est
  // consulté, leurs clarifications et leurs recours) : son portail n'en a pas besoin
  if (!canSeeOffers && req.can('portail.use')) {
    const moi = partenaireDe(req.user.id), nom = (s) => String(s || '').trim().toLowerCase();
    const mesOffres = new Set(req.pid ? req.store.offers().filter((o) => o.depotPar === req.user.id).map((o) => o.id) : []);
    st.users = users.filter((u) => u.id === req.user.id);
    st.approvals = (st.approvals || []).map((a) => ({ role: a.role, roleId: a.roleId, seuil: a.seuil, requis: a.requis, done: a.done, at: a.at }));
    st.rejets = []; st.coi = {}; st.notifRules = {};
    st.circuitModele = []; st.circuitBesoin = []; st.circuitReferencement = []; st.circuitCommande = [];
    if (st.consultes) st.consultes = { mode: st.consultes.mode, partenaires: moi && (st.consultes.partenaires || []).includes(moi.id) ? [moi.id] : [] };
    st.clarifs = (st.clarifs || []).map((c, i) => ({ ...c, i })).filter((c) => mesOffres.has(c.offerId)); // i : rang, pour répondre
    // questions : publiées sans leur auteur ; réclamations : les siennes seulement
    st.qa = (st.qa || []).map((q) => ({ id: q.id, question: q.question, t: q.t, reponse: q.reponse, tRep: q.tRep, mienne: q.par === req.user.id }));
    st.reclamations = (st.reclamations || []).filter((x) => x.par === req.user.id);
    // résultat de ses offres, une fois l'attribution prononcée
    const ctxR = { offers: req.pid ? req.store.offers() : [], org: values.org, fxFrozen: values.fxFrozen, cadre: values.cadre, cdc: values.cdc, criteria: values.criteria,
      quality: values.quality, justif: values.justif, excluded: values.excluded, confirmed: values.confirmed, docDefs: values.docDefs, evalDone: values.evalDone, approvals: values.approvals };
    st.monResultat = values.infructueux ? { statut: 'infructueux', motif: 'La consultation a été déclarée infructueuse' + (values.infructueux.motif ? ' : ' + values.infructueux.motif : '') + '.' }
      : [...mesOffres].map((id) => { const r = R.resultatOffre(ctxR, id); return r && { offre: id, ...r }; }).filter(Boolean)[0] || null;
    st.recours = (st.recours || []).filter((x) => moi && nom(x.de) === nom(moi.raisonSociale));
  }
  return { state: st, revs, rev: getRev() };
}

r.get('/state', (req, res) => {
  const since = Number(req.query.since);
  if (since && since === getRev()) return res.json({ unchanged: true, rev: since });
  res.json(buildState(req));
});

const MERGED = ['notifs', 'emails'];

/**
 * Écrit un lot de clés, tout ou rien : mêmes contrôles (habilitations, règles, effets serveur) quelle que soit la
 * route d'origine. Retourne { status, body }. Les routes ciblées ci-dessous ne font que construire le lot.
 */
function ecrire(req, changes) {
  const keys = Object.keys(changes);
  if (!keys.length) return { status: 200, body: { ok: true, rev: getRev(), revs: {} } };
  // sans procédure ouverte : seules les clés de l'organisation s'écrivent
  if (!req.pid && keys.some((k) => isProcKey(k) || k === 'offers'))
    return { status: 409, body: { error: 'Aucune procédure ouverte : seules les données de l’organisation sont modifiables.', code: 'NO_PROCEDURE' } };
  // procédure archivée : seules les clés de l'organisation (notifications lues, paramètres) restent modifiables
  if (req.archived && keys.some(isProcKey))
    return { status: 409, body: { error: 'Procédure archivée : elle ne peut plus être modifiée.', code: 'PROCEDURE_ARCHIVED' } };
  for (const k of keys) {
    const err = validateChange(k, changes[k], req, changes);
    if (typeof err === 'string') return { status: 403, body: { error: err, key: k } };
    if (err) return { status: err.status, body: { error: err.error, code: err.code, key: k } };
  }
  const newRevs = {}, who = whoLabel(req.user), uid = req.user.id, aExpedier = [];
  // journal : une clé de procédure se rattache à la procédure, une clé d'organisation à l'organisation
  const tx = db.transaction(() => {
    const fx = effectsOf(changes, req);
    for (const [k, v] of Object.entries(fx.kv)) newRevs[k] = req.store.set(k, v, uid);
    for (const a of fx.audit) auditAppend(uid, who, a, req.pid);
    for (const k of keys) {
      if (k === 'users') {
        const upd = db.prepare('UPDATE users SET role=? WHERE id=?');
        for (const u of changes[k]) {
          const cur = db.prepare('SELECT role FROM users WHERE id=?').get(u.id);
          if (cur && cur.role !== u.role) {
            if (u.id === uid) throw Object.assign(new Error('Vous ne pouvez pas modifier votre propre rôle.'), { status: 403 });
            upd.run(u.role, u.id);
            auditAppend(uid, who, `Rôle modifié — utilisateur ${u.id} : ${cur.role} → ${u.role}`);
          }
        }
        newRevs[k] = req.store.set('_users', Date.now(), uid);
      } else if (k === 'offers') {
        offersReplace(changes[k]);
        newRevs[k] = req.store.set('_offers', Date.now(), uid);
      } else if (MERGED.includes(k)) {
        // fusion par identifiant : jamais de notification perdue, « lu » cumulé entre utilisateurs
        const cur = (kvGet(k) || { value: [] }).value;
        const byId = new Map(cur.map((x) => [x.id, x]));
        const regle = (x) => ((kvGet('notifRules') || { value: {} }).value || {})[x.ev] || { roles: [] };
        // une règle qui vise les fournisseurs (rôle soum) ne vise que ceux de la procédure : partenaires consultés et
        // auteurs d'une offre, jamais tous les comptes fournisseurs de l'espace (attribution, publication, additifs…)
        let concernes = null;
        const fournisseursConcernes = () => {
          if (concernes) return concernes;
          concernes = new Set();
          if (req.pid) {
            const { partenaireGet } = require('../db');
            require('../consultation').consultation((kk) => req.store.get(kk)).partenaires
              .forEach((pid) => ((partenaireGet(pid) || {}).comptes || []).forEach((u) => concernes.add(u)));
            req.store.offers().forEach((o) => { if (o.depotPar) concernes.add(o.depotPar); });
          }
          return concernes;
        };
        const out = [];
        for (const x of changes[k]) {
          if (!x || !x.id) continue;
          const old = byId.get(x.id); byId.delete(x.id);
          if (k === 'notifs') {
            // notification enregistrée : seule la lecture change, et chacun ne marque lu que pour lui-même
            if (old) { out.push({ ...old, lu: [...new Set([...(old.lu || []), ...(Array.isArray(x.lu) && x.lu.includes(uid) ? [uid] : [])])] }); continue; }
            const r = regle(x).roles;
            out.push({ id: String(x.id).slice(0, 40), ev: String(x.ev), lab: String(x.lab || '').slice(0, 120), titre: String(x.titre || '').slice(0, 250),
              corps: String(x.corps || '').slice(0, 5000), t: frDate(), roles: r.filter((z) => z !== 'soum'),
              ids: r.includes('soum') ? [...fournisseursConcernes()] : [], lu: [] });
            continue;
          }
          if (k === 'emails') {
            if (old) { out.push(old); continue; } // un courriel enregistré ne se réécrit pas depuis le navigateur
            // nouveau courriel : destinataires = comptes actifs désignés par identifiant et visés par la règle de
            // l'événement, avec leur adresse réelle (jamais une adresse fournie par le navigateur)
            const ids = [...new Set((Array.isArray(x.ids) ? x.ids : []).map(String))].slice(0, 50), roles = regle(x).roles;
            const comptes = ids.length ? db.prepare(`SELECT id, nom, email, role FROM users WHERE active=1 AND id IN (${ids.map(() => '?').join(',')})`).all(...ids)
              .filter((u) => roles.includes(u.role) && (u.role !== 'soum' || fournisseursConcernes().has(u.id))) : [];
            const e = { id: String(x.id).slice(0, 40), ev: String(x.ev || '').slice(0, 40), de: mail.actif() ? mail.expediteur() : String(x.de || '').slice(0, 120),
              ids: comptes.map((u) => u.id), a: comptes.map((u) => u.email), noms: comptes.map((u) => u.nom),
              objet: String(x.objet || '').slice(0, 250), corps: String(x.corps || '').slice(0, 20000), t: frDate(),
              statut: !comptes.length ? 'sans destinataire' : (mail.actif() ? 'en cours' : 'simulé') };
            if (comptes.length && mail.actif()) aExpedier.push(e);
            out.push(e);
            continue;
          }
          out.push(x);
        }
        const cap = k === 'notifs' ? 120 : 80;
        newRevs[k] = req.store.set(k, out.concat([...byId.values()]).slice(0, cap), uid);
      } else {
        newRevs[k] = req.store.set(k, changes[k], uid);
      }
    }
  });
  try { tx(); } catch (e) { return { status: e.status || 500, body: { error: e.message } }; }
  aExpedier.forEach(expedier); // après l'écriture : l'envoi ne retient ni ne fait échouer l'action
  return { status: 200, body: { ok: true, rev: getRev(), revs: newRevs } };
}

/** Expédie un courriel de la boîte d'envoi et y consigne le résultat (envoyé, ou échec avec sa cause). */
function expedier(e) {
  mail.envoyer({ a: e.a, objet: e.objet, corps: e.corps }).then((r) => {
    const cur = (kvGet('emails') || { value: [] }).value, x = cur.find((m) => m.id === e.id);
    if (!x) return;
    x.statut = r.statut; if (r.erreur) x.erreur = r.erreur; x.expedie = frDate();
    require('../db').kvSet('emails', cur, 'courriel');
  }).catch((err) => console.error('Courriel', e.id, err));
}

/** Annonce d'un événement par le serveur, selon sa règle (notifRules) : notification, et courriel aux comptes actifs des
    rôles visés. Pour les actions d'un prestataire, qui n'émet lui-même ni notification ni courriel. */
function annoncer(ev, lab, titre, corps, ref) {
  const r = ((kvGet('notifRules') || { value: {} }).value || {})[ev];
  if (!r) return;
  const id = Date.now() + Math.random().toString(36).slice(2, 6), kvSet = require('../db').kvSet;
  if (r.inapp) {
    const cur = (kvGet('notifs') || { value: [] }).value;
    cur.unshift({ id: 'n' + id, ev, lab, titre, corps, t: frDate(), roles: r.roles.slice(), lu: [] });
    kvSet('notifs', cur.slice(0, 120), 'serveur');
  }
  if (r.email) {
    const comptes = db.prepare('SELECT id, nom, email, role FROM users WHERE active=1').all().filter((u) => r.roles.includes(u.role)).slice(0, 50);
    const org = (kvGet('org') || { value: {} }).value || {};
    const e = { id: 'm' + id, ev, de: mail.actif() ? mail.expediteur() : ((kvGet('mailFrom') || {}).value || ''), ids: comptes.map((u) => u.id), a: comptes.map((u) => u.email),
      noms: comptes.map((u) => u.nom), objet: '[' + ref + '] ' + titre, corps: corps + '\n\n—\n' + (org.nom || '') + ' — plateforme Marché+\nCe message est généré automatiquement ; ne pas y répondre.',
      t: frDate(), statut: !comptes.length ? 'sans destinataire' : (mail.actif() ? 'en cours' : 'simulé') };
    const cur = (kvGet('emails') || { value: [] }).value;
    cur.unshift(e);
    kvSet('emails', cur.slice(0, 80), 'serveur');
    if (comptes.length && mail.actif()) expedier(e);
  }
}

/** Notification émise par le serveur, hors règles d'événement : aux rôles et comptes désignés. */
function notifierServeur({ ev, lab, titre, corps, roles = [], ids = [] }) {
  const cur = (kvGet('notifs') || { value: [] }).value;
  cur.unshift({ id: 'n' + Date.now() + Math.random().toString(36).slice(2, 6), ev, lab, titre, corps, t: frDate(), roles, ids, lu: [] });
  require('../db').kvSet('notifs', cur.slice(0, 120), 'serveur');
}

/* ---- Dialogue avec le fournisseur : écritures ciblées, contrôlées par le serveur ----
   Un fournisseur n'écrit jamais les clés entières (qa, clarifs, reclamations) : il pose une question, répond à une
   demande de clarification qui vise son offre, dépose une réclamation ; l'auteur, la date et le statut sont posés ici. */
const QUESTIONS_JOURS_AVANT = 3; // questions reçues jusqu'à 3 jours avant la date limite de dépôt
// documents de l'offre elle-même, joints depuis le portail à côté des pièces administratives
const DOCS_OFFRE = { memoire: 'Mémoire technique', bordereau: 'Bordereau des prix' };
const estFournisseur = (req) => req.can('portail.use') && !req.can('offres.read');
const texte = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const ecrireCle = (req, k, v) => { req.store.set(k, v, req.user.id); require('../db').bumpRev(); };

/** Question d'un fournisseur sur le dossier publié ; diffusée sans son auteur avec la réponse de l'acheteur. */
r.post('/questions', (req, res) => {
  if (!estFournisseur(req)) return res.status(403).json({ error: 'Réservé aux fournisseurs.', code: 'FORBIDDEN' });
  const cdc = req.store.get('cdc') || {}, ech = R.echeanceDepot(cdc);
  if (!cdc.cdcPublie) return res.status(409).json({ error: 'Le dossier n’est pas publié.', code: 'NOT_PUBLISHED' });
  if (ech && Date.now() > ech - QUESTIONS_JOURS_AVANT * 86400000)
    return res.status(409).json({ error: `Les questions sont closes ${QUESTIONS_JOURS_AVANT} jours avant la date limite de dépôt.`, code: 'QUESTIONS_CLOSED' });
  const question = texte((req.body || {}).question, 2000);
  if (question.length < 10) return res.status(422).json({ error: 'Votre question est trop courte.', code: 'QUESTION_SHORT' });
  const qa = req.store.get('qa') || [];
  if (qa.filter((q) => q.par === req.user.id).length >= 20) return res.status(429).json({ error: 'Vingt questions au plus par consultation.', code: 'TOO_MANY' });
  const p = partenaireDe(req.user.id);
  const q = { id: 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), question, t: frDate(), anonyme: true, par: req.user.id, partenaire: p ? p.id : null };
  ecrireCle(req, 'qa', qa.concat([q]));
  auditAppend(req.user.id, whoLabel(req.user), 'Question posée sur le dossier', req.pid);
  annoncer('question.recue', 'Question reçue d’un candidat', 'Question reçue — ' + (cdc.ref || ''), question, cdc.ref || '');
  res.status(201).json({ ok: true, question: { id: q.id, question, t: q.t, mienne: true } });
});

/** Réponse du fournisseur à une demande de clarification qui vise son offre. */
r.put('/clarifications/:i/reponse', (req, res) => {
  if (!estFournisseur(req)) return res.status(403).json({ error: 'Réservé aux fournisseurs.', code: 'FORBIDDEN' });
  const clarifs = req.store.get('clarifs') || [], i = Number(req.params.i), cl = clarifs[i];
  const o = cl && req.store.offers().find((x) => x.id === cl.offerId);
  if (!cl || !o || o.depotPar !== req.user.id) return res.status(404).json({ error: 'Demande introuvable.', code: 'CLARIF_UNKNOWN' });
  if (cl.statut !== 'envoyee') return res.status(409).json({ error: 'Vous avez déjà répondu à cette demande.', code: 'CLARIF_ANSWERED' });
  const reponse = texte((req.body || {}).reponse, 5000);
  if (reponse.length < 2) return res.status(422).json({ error: 'La réponse est vide.', code: 'ANSWER_EMPTY' });
  const maj = clarifs.slice(); maj[i] = { ...cl, reponse, tRep: frDate(), statut: 'repondue', reponduPar: req.user.id };
  ecrireCle(req, 'clarifs', maj);
  auditAppend(req.user.id, whoLabel(req.user), `Réponse de clarification reçue — ${o.name} : ${cl.objet}`, req.pid);
  notifierServeur({ ev: 'clarif.repondue', lab: 'Clarification', titre: 'Réponse de clarification — ' + o.name, corps: cl.objet + '\n\n' + reponse, roles: ['achats'] });
  res.json({ ok: true });
});

/** Réclamation d'un fournisseur qui a déposé une offre ; traitée et répondue par l'acheteur. */
r.post('/reclamations', (req, res) => {
  if (!estFournisseur(req)) return res.status(403).json({ error: 'Réservé aux fournisseurs.', code: 'FORBIDDEN' });
  const offre = req.store.offers().find((x) => x.depotPar === req.user.id);
  if (!offre) return res.status(403).json({ error: 'Seul un fournisseur ayant déposé une offre peut adresser une réclamation.', code: 'NO_OFFER' });
  const objet = texte((req.body || {}).objet, 200), detail = texte((req.body || {}).texte, 3000);
  if (objet.length < 3 || detail.length < 10) return res.status(422).json({ error: 'Indiquez l’objet et le détail de votre réclamation.', code: 'CLAIM_INCOMPLETE' });
  const liste = req.store.get('reclamations') || [];
  if (liste.filter((x) => x.par === req.user.id && x.statut === 'ouverte').length >= 3) return res.status(429).json({ error: 'Trois réclamations en cours au plus.', code: 'TOO_MANY' });
  const x = { id: 'R' + Date.now().toString(36), par: req.user.id, de: offre.name, objet, texte: detail, t: frDate(), statut: 'ouverte' };
  ecrireCle(req, 'reclamations', liste.concat([x]));
  auditAppend(req.user.id, whoLabel(req.user), `Réclamation déposée — ${offre.name} : ${objet}`, req.pid);
  notifierServeur({ ev: 'reclamation', lab: 'Réclamation', titre: 'Réclamation de ' + offre.name, corps: objet, roles: ['achats', 'approb'] });
  res.status(201).json({ ok: true, reclamation: x });
});

/** Réponse de l'acheteur à une réclamation : elle est close, et son auteur prévenu. */
r.put('/reclamations/:id/reponse', (req, res) => {
  if (!req.can('recours.handle') && !req.can('qa.answer')) return res.status(403).json({ error: 'Habilitation insuffisante.', code: 'FORBIDDEN' });
  const liste = req.store.get('reclamations') || [], i = liste.findIndex((x) => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Réclamation introuvable.', code: 'CLAIM_UNKNOWN' });
  if (liste[i].statut !== 'ouverte') return res.status(409).json({ error: 'Cette réclamation a déjà reçu une réponse.', code: 'CLAIM_ANSWERED' });
  const reponse = texte((req.body || {}).reponse, 5000);
  if (reponse.length < 2) return res.status(422).json({ error: 'La réponse est vide.', code: 'ANSWER_EMPTY' });
  const maj = liste.slice(); maj[i] = { ...liste[i], statut: 'traitee', reponse, tRep: frDate(), reponduPar: whoLabel(req.user) };
  ecrireCle(req, 'reclamations', maj);
  auditAppend(req.user.id, whoLabel(req.user), `Réponse à la réclamation de ${liste[i].de} : ${liste[i].objet}`, req.pid);
  notifierServeur({ ev: 'reclamation', lab: 'Réclamation', titre: 'Réponse à votre réclamation', corps: liste[i].objet + '\n\n' + reponse, ids: [liste[i].par] });
  res.json({ ok: true, reclamation: maj[i] });
});

/** Modification d'une ou plusieurs clés entières, avec détection de conflit sur les révisions envoyées. */
r.patch('/state', (req, res) => {
  const { changes, base } = req.body || {};
  if (!changes || typeof changes !== 'object') return res.status(400).json({ error: 'Corps invalide.' });
  // conflit de révision : quelqu'un d'autre a modifié la clé depuis le dernier chargement
  const conflicts = Object.keys(changes).filter((k) => { if (MERGED.includes(k)) return false; const cur = req.store.raw(k); return cur && base && base[k] != null && cur.rev !== base[k]; });
  if (conflicts.length) return res.status(409).json({ error: 'Données modifiées entre-temps par un autre utilisateur.', conflicts });
  const out = ecrire(req, changes);
  res.status(out.status).json(out.body);
});

/* ---- Écritures ciblées (lot B) ----
   Une action ne modifie qu'un élément : le serveur part de la valeur en base, y applique l'action et écrit la clé
   par le même chemin que PATCH. Deux évaluateurs qui notent en même temps ne se gênent plus (pas de 409).
   La réponse renvoie les valeurs écrites, telles que le serveur les a enregistrées (identité, date…). */
const copie = (x) => JSON.parse(JSON.stringify(x == null ? {} : x));
function cible(req, res, changes) {
  if (changes.error) return res.status(changes.status || 422).json({ error: changes.error, code: changes.code });
  const out = ecrire(req, changes);
  if (out.status !== 200) return res.status(out.status).json(out.body);
  const values = {};
  for (const k of Object.keys(changes)) values[k] = req.store.get(k);
  res.json({ ...out.body, values });
}
const offreDe = (req) => req.store.offers().find((o) => o.id === req.params.offre);
const introuvable = (quoi) => ({ status: 404, error: quoi + ' introuvable dans cette procédure.' });

/** Note d'un critère qualitatif et/ou justification de l'écart avec le score proposé par l'IA. */
r.put('/scores/:offre/:critere', (req, res) => {
  const { note, justification } = req.body || {};
  const o = offreDe(req), c = (req.store.get('criteria') || []).find((x) => x.id === req.params.critere);
  let changes = {};
  if (!o) changes = introuvable('Offre');
  else if (!c || c.kind !== 'qual') changes = introuvable('Critère qualitatif');
  else if (note == null && justification == null) changes = { error: 'Note ou justification attendue.' };
  else if (justification != null && (typeof justification !== 'string' || justification.length > 2000)) changes = { error: 'Justification invalide (2 000 caractères au plus).' };
  else {
    if (note != null) { const q = copie(req.store.get('quality')); q[o.id] = { ...(q[o.id] || {}), [c.id]: Number(note) }; changes.quality = q; }
    if (justification != null) { const j = copie(req.store.get('justif')); j[o.id + '_' + c.id] = justification.trim(); changes.justif = j; }
  }
  cible(req, res, changes);
});

/** Confirmation (ou retrait de la confirmation) d'un champ extrait d'une offre. */
r.put('/confirmations/:offre/:champ', (req, res) => {
  const o = offreDe(req), i = Number(req.params.champ), { confirme } = req.body || {};
  let changes;
  if (!o) changes = introuvable('Offre');
  else if (!Number.isInteger(i) || !(o.fields || [])[i]) changes = introuvable('Champ');
  else if (typeof confirme !== 'boolean') changes = { error: 'Champ « confirme » (oui ou non) attendu.' };
  else {
    const c = copie(req.store.get('confirmed'));
    if (confirme) c[o.id + '_' + i] = true; else delete c[o.id + '_' + i];
    changes = { confirmed: c };
  }
  cible(req, res, changes);
});

/** Décision de conformité d'une offre : exclue, réintégrée, ou rendue au contrôle automatique des pièces (null). */
r.put('/conformite/:offre', (req, res) => {
  const o = offreDe(req), { exclue } = req.body || {};
  let changes;
  if (!o) changes = introuvable('Offre');
  else if (exclue !== null && typeof exclue !== 'boolean') changes = { error: 'Champ « exclue » (oui, non ou null) attendu.' };
  else {
    const e = copie(req.store.get('excluded'));
    if (exclue === null) delete e[o.id]; else e[o.id] = exclue;
    changes = { excluded: e };
  }
  cible(req, res, changes);
});

/** Approbation d'un niveau du circuit. Identité et date sont posées par le serveur (règles d'approbation). */
r.post('/approbations/:niveau', (req, res) => {
  const ap = copie(req.store.get('approvals') || []), i = Number(req.params.niveau);
  let changes;
  if (!Array.isArray(ap) || !Number.isInteger(i) || !ap[i]) changes = introuvable('Niveau d’approbation');
  else if (ap[i].done) changes = { status: 409, code: 'APPROVAL_ALREADY_GIVEN', error: 'Ce niveau est déjà approuvé.' };
  else { ap[i].done = true; changes = { approvals: ap }; }
  cible(req, res, changes);
});

/** Rejet motivé de l'attribution par le niveau attendu : l'évaluation est rouverte et le circuit remis à zéro. */
r.post('/approbations/:niveau/rejet', (req, res) => {
  const ap = req.store.get('approvals') || [], i = Number(req.params.niveau);
  let changes;
  if (!Number.isInteger(i) || !ap[i]) changes = introuvable('Niveau d’approbation');
  else if (C.prochaine(ap) !== i) changes = { status: 409, code: 'APPROVAL_ORDER', error: 'Seul le niveau attendu peut rejeter l’attribution.' };
  else {
    changes = {
      rejets: (req.store.get('rejets') || []).concat([{ motif: String((req.body || {}).motif || '') }]),
      evalDone: false,
      approvals: C.reinitialiser(ap),
    };
  }
  cible(req, res, changes);
});

/** Journal d'audit : l'horodatage et l'identité viennent du serveur, jamais du client. */
r.post('/audit', (req, res) => {
  const a = String((req.body || {}).a || '').trim().slice(0, 500);
  if (!a) return res.status(400).json({ error: 'Libellé requis.' });
  res.json(auditAppend(req.user.id, whoLabel(req.user), a, req.pid));
});

/** Dépôt d'une offre (soumissionnaire). Le serveur construit l'offre et l'accusé de réception. */
r.post('/offers', (req, res) => {
  if (!req.can('portail.use')) return res.status(403).json({ error: 'Habilitation insuffisante.', needs: ['portail.use'] });
  const d = req.body || {};
  const org = req.store.get('org'), cdc = req.store.get('cdc');
  const paysList = { CI: 'Côte d’Ivoire', BF: 'Burkina Faso', SN: 'Sénégal', ML: 'Mali', NE: 'Niger', TG: 'Togo', BJ: 'Bénin', GW: 'Guinée-Bissau' };
  const name = String(d.name || '').trim();
  let montant = Number(d.montant);
  const delai = Number(d.delai) || 0, garantie = Number(d.garantie) || 0, refs = Math.max(0, Math.floor(Number(d.refsCount) || 0));
  const lotIds = new Set((cdc.lots || []).map((l) => l.id));
  const lots = Array.isArray(d.lots) ? [...new Set(d.lots.filter((x) => lotIds.has(x)))] : [];
  const errs = [];
  if (!cdc.cdcPublie) errs.push('Le dossier n’est pas publié.');
  const echeance = R.echeanceDepot(cdc);
  if (echeance && Date.now() > echeance)
    return res.status(409).json({ error: 'La date limite de dépôt est dépassée : aucune offre ne peut plus être déposée.', code: 'DEADLINE_PASSED' });
  if (req.store.get('depClosed')) errs.push('Le dépouillement est clôturé : aucune offre ne peut plus être déposée.');
  if (name.length < 2 || name.length > 200) errs.push('Raison sociale invalide.');
  if (!/^[A-Z]{2}$/.test(String(d.iso || ''))) errs.push('Pays invalide.');
  if (!org.rates[d.devise]) errs.push('Devise non admise.');
  if (!lots.length) errs.push('Au moins un lot est requis.');
  // prix par lot : un montant positif pour chaque lot soumissionné ; le montant de l'offre en est la somme
  let prixLots = null;
  if (d.prixLots && typeof d.prixLots === 'object') {
    prixLots = {};
    for (const l of lots) {
      const v = Number(d.prixLots[l]);
      if (!Number.isFinite(v) || v <= 0) { errs.push('Montant manquant pour un lot soumissionné.'); break; }
      prixLots[l] = Math.round(v * 100) / 100;
    }
    montant = Object.values(prixLots).reduce((t, v) => t + v, 0);
  }
  if (!Number.isFinite(montant) || montant <= 0) errs.push('Montant invalide.');
  if (errs.length) return res.status(422).json({ error: errs.join(' ') });
  // consultation restreinte : seuls les partenaires référencés et sélectionnés déposent ; appel d'offres ouvert d'un
  // acheteur public : toute entreprise inscrite
  const partenaire = partenaireDe(req.user.id);
  const refus = require('../consultation').refusDepot(require('../consultation').consultation((k) => req.store.get(k)), partenaire);
  if (refus) return res.status(403).json(refus);

  const docDefs = req.store.get('docDefs');
  const pending = db.prepare('SELECT * FROM files WHERE owner=? AND procedure_id=? AND offer_id IS NULL').all(req.user.id, req.pid);
  const byDoc = new Map(pending.map((f) => [f.doc_id, f]));
  // pièces exigées selon le pays du soumissionnaire et le profil réglementaire (zone de préférence, pays local)
  const exigees = new Set(R.requiredDocs({ org, cdc, cadre: req.store.get('cadre'), docDefs }, { iso: d.iso }).map((x) => x.id));
  // une pièce validée au référencement (et non expirée) tient lieu de pièce du dossier, sauf si une autre est jointe
  const piecesRef = require('../formulaire').formulaire().pieces, refDe = (x) => R.pieceReferencement(x, piecesRef);
  const parRef = (x) => !byDoc.has(x.id) && partenaire && partenaire.statut === 'reference' && !!refDe(x) && pieceValable(partenaire.pieces[refDe(x)]);
  const docs = {}, missing = [];
  docDefs.forEach((x) => {
    const need = exigees.has(x.id);
    docs[x.id] = need ? (byDoc.has(x.id) || parRef(x)) : true; // pièce non exigée pour ce profil : considérée fournie
    if (need && !docs[x.id]) missing.push(x.label);
  });
  if (missing.length) return res.status(422).json({ error: 'Pièces manquantes : ' + missing.join(' ; ') + '.' });
  const sep = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const id = 'sub' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const offer = {
    id, name, pays: paysList[d.iso] || d.iso, iso: d.iso, doc: 'dépôt dématérialisé — saisie structurée', devise: d.devise, montant,
    delai, garantie, refsCount: refs, aiMetho: 70, aiRefs: Math.min(100, refs * 20),
    aiWhy: 'Offre déposée par saisie structurée : le mémoire technique n’a pas encore été analysé, le score méthodologie est provisoire et doit être arrêté par l’évaluateur.',
    docs, submitted: true, depotPar: req.user.id,
    fields: [
      { k: 'Montant total HT', v: sep(montant) + ' ' + d.devise, flag: false, conf: 100 },
      { k: 'Délai d\'exécution', v: delai + ' jours', flag: false, conf: 100 },
      { k: 'Garantie', v: garantie + ' mois', flag: false, conf: 100 },
      { k: 'Références déclarées', v: refs + ' référence(s)', flag: false, conf: 100 },
      { k: 'Lots soumissionnés', v: lots.length + ' lot(s) sur ' + (cdc.lots || []).length, flag: false, conf: 100 },
    ].concat(prixLots ? lots.map((l) => ({ k: 'Prix — ' + (((cdc.lots || []).find((x) => x.id === l) || {}).nom || l), v: sep(prixLots[l]) + ' ' + d.devise, flag: false, conf: 100 })) : []),
    lots, ...(prixLots ? { prixLots } : {}),
  };
  let receipt;
  db.transaction(() => {
    // pièces administratives exigées, puis documents de l'offre (mémoire technique, bordereau des prix)
    offer.pieces = pending.filter((f) => docs[f.doc_id] === true || DOCS_OFFRE[f.doc_id])
      .map((f) => ({ id: f.id, doc: f.doc_id, name: f.name, size: f.size, sha256: f.sha256, ...(DOCS_OFFRE[f.doc_id] ? { offre: true } : {}) }))
      .concat(docDefs.filter((x) => exigees.has(x.id) && parRef(x)).map((x) => {
        const pc = partenaire.pieces[refDe(x)];
        return { id: pc.fichier, doc: x.id, name: pc.nom, size: pc.taille, sha256: pc.sha256, referencement: partenaire.id, expire: pc.expire };
      }));
    if (partenaire) offer.partenaire = partenaire.id;
    offerInsert(offer, true, req.pid);
    db.prepare('UPDATE files SET offer_id=? WHERE owner=? AND procedure_id=? AND offer_id IS NULL').run(id, req.user.id, req.pid);
    const q = req.store.get('quality'); q[id] = { metho: offer.aiMetho, refs: offer.aiRefs }; req.store.set('quality', q, req.user.id);
    // numérotation des accusés continue sur toute l'instance : un numéro ne désigne qu'un seul dépôt
    const n = db.prepare('SELECT COUNT(*) c FROM receipts').get().c + 1;
    receipt = { num: 'DEP-' + String(n).padStart(4, '0'), ref: cdc.ref, name, pays: offer.pays, t: frDate(), montant: sep(montant) + ' ' + d.devise, lots: lots.length };
    db.prepare('INSERT INTO receipts(num,data,procedure_id,owner) VALUES(?,?,?,?)').run(receipt.num, JSON.stringify(receipt), req.pid, req.user.id);
    auditAppend(req.user.id, whoLabel(req.user), `Dépôt enregistré — ${name} (${offer.pays}) — accusé ${receipt.num}`, req.pid);
    annoncer('depot.recu', 'Nouveau dépôt reçu', 'Nouveau dépôt — ' + name,
      `Accusé ${receipt.num}. Soumissionnaire : ${name} (${offer.pays}). Montant : ${receipt.montant}. Lots : ${lots.length}.`, cdc.ref);
  })();
  res.status(201).json({ offer, receipt, rev: getRev() });
});

module.exports = r;
