/* Routes d'une procédure, montées sous /api/procedures/:pid (voir routes/procedures.js, qui pose req.pid et
   req.store). L'état renvoyé réunit les clés de l'organisation et celles de la procédure. */
const express = require('express');
const { db, getRev, kvGet, kvAll, pkvAll, auditAppend, auditList, offerInsert, offersReplace, frDate, isProcKey } = require('../db');
const { whoLabel } = require('../auth');
const { validateChange, effectsOf } = require('../rules');
const R = require('../../public/js/regles.js');

const r = express.Router({ mergeParams: true });

/** État complet visible par l'utilisateur courant, pour la procédure req.pid. */
function buildState(req) {
  const org = kvAll(), proc = pkvAll(req.pid);
  const values = { ...org.values, ...proc.values }, revs = { ...org.revs, ...proc.revs };
  const users = db.prepare('SELECT id,nom,role FROM users WHERE active=1 ORDER BY rowid').all();
  const canSeeOffers = req.can('offres.read');
  const receipts = db.prepare('SELECT data FROM receipts WHERE procedure_id=? ORDER BY created_at, num').all(req.pid).map((x) => JSON.parse(x.data));
  const st = {
    ...values, users, me: req.user.id, procedure: req.pid,
    offers: canSeeOffers ? req.store.offers() : [],
    receipts: req.can('portail.use') || canSeeOffers ? receipts : [],
    audit: req.can('audit.read') || req.can('pv.read') ? auditList(200, req.pid) : [],
  };
  delete st._sod; // historique de séparation des fonctions : interne au serveur
  // Un soumissionnaire ne doit voir ni les notes, ni les décisions internes.
  if (!canSeeOffers) { st.quality = {}; st.justif = {}; st.confirmed = {}; st.excluded = {}; }
  return { state: st, revs, rev: getRev() };
}

r.get('/state', (req, res) => {
  const since = Number(req.query.since);
  if (since && since === getRev()) return res.json({ unchanged: true, rev: since });
  res.json(buildState(req));
});

/** Modification d'une ou plusieurs clés ; tout ou rien. */
r.patch('/state', (req, res) => {
  const { changes, base } = req.body || {};
  if (!changes || typeof changes !== 'object') return res.status(400).json({ error: 'Corps invalide.' });
  const keys = Object.keys(changes);
  if (!keys.length) return res.json({ ok: true, rev: getRev(), revs: {} });
  // procédure archivée : seules les clés de l'organisation (notifications lues, paramètres) restent modifiables
  if (req.archived && keys.some(isProcKey))
    return res.status(409).json({ error: 'Procédure archivée : elle ne peut plus être modifiée.', code: 'PROCEDURE_ARCHIVED' });
  // conflit de révision : quelqu'un d'autre a modifié la clé depuis le dernier chargement
  const MERGED = ['notifs', 'emails'];
  const conflicts = keys.filter((k) => { if (MERGED.includes(k)) return false; const cur = req.store.raw(k); return cur && base && base[k] != null && cur.rev !== base[k]; });
  if (conflicts.length) return res.status(409).json({ error: 'Données modifiées entre-temps par un autre utilisateur.', conflicts });
  for (const k of keys) {
    const err = validateChange(k, changes[k], req, changes);
    if (typeof err === 'string') return res.status(403).json({ error: err, key: k });
    if (err) return res.status(err.status).json({ error: err.error, code: err.code, key: k });
  }
  const newRevs = {}, who = whoLabel(req.user), uid = req.user.id;
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
        const out = [];
        for (const x of changes[k]) {
          if (!x || !x.id) continue;
          const old = byId.get(x.id); byId.delete(x.id);
          if (old && Array.isArray(x.lu)) x.lu = [...new Set([...(old.lu || []), ...x.lu])];
          out.push(x);
        }
        const cap = k === 'notifs' ? 120 : 80;
        newRevs[k] = req.store.set(k, out.concat([...byId.values()]).slice(0, cap), uid);
      } else {
        newRevs[k] = req.store.set(k, changes[k], uid);
      }
    }
  });
  try { tx(); } catch (e) { return res.status(e.status || 500).json({ error: e.message }); }
  res.json({ ok: true, rev: getRev(), revs: newRevs });
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
  const montant = Number(d.montant), delai = Number(d.delai) || 0, garantie = Number(d.garantie) || 0, refs = Math.max(0, Math.floor(Number(d.refsCount) || 0));
  const lotIds = new Set((cdc.lots || []).map((l) => l.id));
  const lots = Array.isArray(d.lots) ? [...new Set(d.lots.filter((x) => lotIds.has(x)))] : [];
  const errs = [];
  if (!cdc.cdcPublie) errs.push('Le dossier n’est pas publié.');
  if (req.store.get('depClosed')) errs.push('Le dépouillement est clôturé : aucune offre ne peut plus être déposée.');
  if (name.length < 2 || name.length > 200) errs.push('Raison sociale invalide.');
  if (!/^[A-Z]{2}$/.test(String(d.iso || ''))) errs.push('Pays invalide.');
  if (!org.rates[d.devise]) errs.push('Devise non admise.');
  if (!Number.isFinite(montant) || montant <= 0) errs.push('Montant invalide.');
  if (!lots.length) errs.push('Au moins un lot est requis.');
  if (errs.length) return res.status(422).json({ error: errs.join(' ') });

  const docDefs = req.store.get('docDefs');
  const pending = db.prepare('SELECT * FROM files WHERE owner=? AND procedure_id=? AND offer_id IS NULL').all(req.user.id, req.pid);
  const byDoc = new Map(pending.map((f) => [f.doc_id, f]));
  // pièces exigées selon le pays du soumissionnaire et le profil réglementaire (zone de préférence, pays local)
  const exigees = new Set(R.requiredDocs({ org, cdc, cadre: req.store.get('cadre'), docDefs }, { iso: d.iso }).map((x) => x.id));
  const docs = {}, missing = [];
  docDefs.forEach((x) => {
    const need = exigees.has(x.id);
    docs[x.id] = need ? byDoc.has(x.id) : true; // pièce non exigée pour ce profil : considérée fournie
    if (need && !byDoc.has(x.id)) missing.push(x.label);
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
    ],
  };
  let receipt;
  db.transaction(() => {
    offer.pieces = pending.filter((f) => docs[f.doc_id] === true).map((f) => ({ id: f.id, doc: f.doc_id, name: f.name, size: f.size, sha256: f.sha256 }));
    offerInsert(offer, true, req.pid);
    db.prepare('UPDATE files SET offer_id=? WHERE owner=? AND procedure_id=? AND offer_id IS NULL').run(id, req.user.id, req.pid);
    const q = req.store.get('quality'); q[id] = { metho: offer.aiMetho, refs: offer.aiRefs }; req.store.set('quality', q, req.user.id);
    // numérotation des accusés continue sur toute l'instance : un numéro ne désigne qu'un seul dépôt
    const n = db.prepare('SELECT COUNT(*) c FROM receipts').get().c + 1;
    receipt = { num: 'DEP-' + String(n).padStart(4, '0'), ref: cdc.ref, name, pays: offer.pays, t: frDate(), montant: sep(montant) + ' ' + d.devise, lots: lots.length };
    db.prepare('INSERT INTO receipts(num,data,procedure_id) VALUES(?,?,?)').run(receipt.num, JSON.stringify(receipt), req.pid);
    auditAppend(req.user.id, whoLabel(req.user), `Dépôt enregistré — ${name} (${offer.pays}) — accusé ${receipt.num}`, req.pid);
  })();
  res.status(201).json({ offer, receipt, rev: getRev() });
});

module.exports = r;
