const express = require('express');
const { db, getRev, kvGet, kvSet, kvAll, auditAppend, auditList, auditVerify, offersAll, offerInsert, offersReplace, resetDemo, frDate, seed } = require('../db');
const { requireAuth, needPerm, whoLabel } = require('../auth');
const { validateChange } = require('../rules');
const cfg = require('../config');

const r = express.Router();
r.use(requireAuth);

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** État complet visible par l'utilisateur courant. */
function buildState(req) {
  const { values, revs } = kvAll();
  const users = db.prepare('SELECT id,nom,role FROM users WHERE active=1 ORDER BY rowid').all();
  const canSeeOffers = req.can('offres.read');
  const receipts = db.prepare('SELECT data FROM receipts ORDER BY created_at, num').all().map((x) => JSON.parse(x.data));
  const st = {
    ...values, users, me: req.user.id,
    offers: canSeeOffers ? offersAll() : [],
    receipts: req.can('portail.use') || canSeeOffers ? receipts : [],
    audit: req.can('audit.read') || req.can('pv.read') ? auditList(200) : [],
  };
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
  // conflit de révision : quelqu'un d'autre a modifié la clé depuis le dernier chargement
  const MERGED = ['notifs', 'emails'];
  const conflicts = keys.filter((k) => { if (MERGED.includes(k)) return false; const cur = kvGet(k); return cur && base && base[k] != null && cur.rev !== base[k]; });
  if (conflicts.length) return res.status(409).json({ error: 'Données modifiées entre-temps par un autre utilisateur.', conflicts });
  for (const k of keys) {
    const err = validateChange(k, changes[k], req);
    if (err) return res.status(403).json({ error: err, key: k });
  }
  const newRevs = {};
  const tx = db.transaction(() => {
    for (const k of keys) {
      if (k === 'users') {
        const upd = db.prepare('UPDATE users SET role=? WHERE id=?');
        for (const u of changes[k]) {
          const cur = db.prepare('SELECT role FROM users WHERE id=?').get(u.id);
          if (cur && cur.role !== u.role) {
            if (u.id === req.user.id) throw Object.assign(new Error('Vous ne pouvez pas modifier votre propre rôle.'), { status: 403 });
            upd.run(u.role, u.id);
            auditAppend(req.user.id, whoLabel(req.user), `Rôle modifié — utilisateur ${u.id} : ${cur.role} → ${u.role}`);
          }
        }
        newRevs[k] = kvSet('_users', Date.now(), req.user.id);
      } else if (k === 'offers') {
        offersReplace(changes[k]);
        newRevs[k] = kvSet('_offers', Date.now(), req.user.id);
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
        newRevs[k] = kvSet(k, out.concat([...byId.values()]).slice(0, cap), req.user.id);
      } else {
        newRevs[k] = kvSet(k, changes[k], req.user.id);
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
  res.json(auditAppend(req.user.id, whoLabel(req.user), a));
});
r.get('/audit/verify', needPerm('audit.read'), (req, res) => res.json(auditVerify()));

/** Dépôt d'une offre (soumissionnaire). Le serveur construit l'offre et l'accusé de réception. */
r.post('/offers', needPerm('portail.use'), (req, res) => {
  const d = req.body || {};
  const org = kvGet('org').value, cdc = kvGet('cdc').value;
  const paysList = { CI: 'Côte d’Ivoire', BF: 'Burkina Faso', SN: 'Sénégal', ML: 'Mali', NE: 'Niger', TG: 'Togo', BJ: 'Bénin', GW: 'Guinée-Bissau' };
  const name = String(d.name || '').trim();
  const montant = Number(d.montant), delai = Number(d.delai) || 0, garantie = Number(d.garantie) || 0, refs = Math.max(0, Math.floor(Number(d.refsCount) || 0));
  const lotIds = new Set((cdc.lots || []).map((l) => l.id));
  const lots = Array.isArray(d.lots) ? [...new Set(d.lots.filter((x) => lotIds.has(x)))] : [];
  const errs = [];
  if (!cdc.cdcPublie) errs.push('Le dossier n’est pas publié.');
  if (name.length < 2 || name.length > 200) errs.push('Raison sociale invalide.');
  if (!/^[A-Z]{2}$/.test(String(d.iso || ''))) errs.push('Pays invalide.');
  if (!org.rates[d.devise]) errs.push('Devise non admise.');
  if (!Number.isFinite(montant) || montant <= 0) errs.push('Montant invalide.');
  if (!lots.length) errs.push('Au moins un lot est requis.');
  if (errs.length) return res.status(422).json({ error: errs.join(' ') });

  const docDefs = kvGet('docDefs').value;
  const docs = {};
  docDefs.forEach((x) => { docs[x.id] = !!(d.docs && d.docs[x.id]); });
  // pièces non exigées pour ce profil : considérées fournies (même règle que requiredDocs côté interface)
  const isLocal = d.iso === 'CI', isUemoa = org.uemoa.includes(d.iso);
  docDefs.forEach((x) => {
    const need = x.scope === 'tous' ? true : x.scope === 'local' ? isLocal : !isUemoa;
    if (!need) docs[x.id] = true;
  });
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
    offerInsert(offer, true);
    const q = kvGet('quality').value; q[id] = { metho: offer.aiMetho, refs: offer.aiRefs }; kvSet('quality', q, req.user.id);
    const n = db.prepare('SELECT COUNT(*) c FROM receipts').get().c + 1;
    receipt = { num: 'DEP-' + String(n).padStart(4, '0'), name, pays: offer.pays, t: frDate(), montant: sep(montant) + ' ' + d.devise, lots: lots.length };
    db.prepare('INSERT INTO receipts(num,data) VALUES(?,?)').run(receipt.num, JSON.stringify(receipt));
    auditAppend(req.user.id, whoLabel(req.user), `Dépôt enregistré — ${name} (${offer.pays}) — accusé ${receipt.num}`);
  })();
  res.status(201).json({ offer, receipt, rev: getRev() });
});

/** Réinitialisation de la démonstration (administrateur). */
r.post('/admin/reset', needPerm('params.edit', 'roles.edit'), (req, res) => {
  if (!cfg.allowReset) return res.status(403).json({ error: 'Réinitialisation désactivée sur cette instance.' });
  resetDemo(req.user.id, whoLabel(req.user));
  res.json({ ok: true });
});

module.exports = r;
