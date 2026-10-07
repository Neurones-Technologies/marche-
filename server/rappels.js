/* Rappels avant la date limite de dépôt. Chaque heure (RAPPELS=0 désactive), dans chaque espace actif, pour chaque
   appel d'offres publié dont le dépouillement n'est pas clos : à 3 jours puis à 1 jour de l'échéance, les entreprises
   concernées (consultées, ou toutes pour un appel d'offres ouvert) qui n'ont pas déposé d'offre sont prévenues, dans
   leur espace et par courriel (simulé tant que Microsoft 365 n'est pas configuré). Chaque rappel n'est envoyé qu'une
   fois (clé de procédure « rappels ») ; à moins d'un jour, seul le rappel de la veille part. */
const { db, kvGet, kvSet, store, proceduresAll, equipeDe, frDate } = require('./db');
const R = require('../public/js/regles.js');
const mail = require('./mail');

const PALIERS = [{ cle: 'j1', heures: 24, lab: 'demain' }, { cle: 'j3', heures: 72, lab: 'dans 3 jours' }];

/** Rappels dus dans l'espace courant ; retourne le nombre de rappels envoyés. */
function verifier(maintenant = Date.now()) {
  const S = require('./routes/state'); // ciblage et expédition partagés avec les annonces
  let envoyes = 0;
  for (const p of proceduresAll()) {
    if (p.archive || !p.publie || p.depouillement) continue;
    const st = store(p.id), cdc = st.get('cdc') || {}, ech = R.echeanceDepot(cdc);
    if (!ech || maintenant >= ech) continue;
    const reste = ech - maintenant, faits = { ...(st.get('rappels') || {}) };
    const palier = PALIERS.find((x) => reste <= x.heures * 3600000);
    if (!palier || faits[palier.cle]) continue;
    // destinataires : entreprises concernées par la publication, moins celles dont l'équipe a déposé une offre
    const req = { pid: p.id, store: st };
    const ont = new Set();
    st.offers().forEach((o) => { if (o.depotPar) equipeDe(o.depotPar).forEach((u) => ont.add(u)); });
    const ids = [...S.comptesConcernes(req, 'cdc.publie')].filter((u) => !ont.has(u));
    // les paliers dépassés sont marqués aussi : pas de rappel « à 3 jours » après celui de la veille
    PALIERS.filter((x) => x.heures >= palier.heures).forEach((x) => { faits[x.cle] = faits[x.cle] || new Date(maintenant).toISOString(); });
    st.set('rappels', faits, 'rappels');
    if (!ids.length) continue;
    const date = new Date(ech).toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan', dateStyle: 'long', timeStyle: 'short' });
    const titre = `Rappel : dépôt des offres ${palier.lab} — ${cdc.ref || ''}`;
    const corps = `La date limite de dépôt de l'appel d'offres ${cdc.ref || ''} (${cdc.objet || ''}) est le ${date}. `
      + 'Votre entreprise n’a pas encore déposé d’offre : après cette heure, aucun dépôt n’est plus accepté.';
    const id = Date.now() + Math.random().toString(36).slice(2, 6);
    const notifs = (kvGet('notifs') || { value: [] }).value;
    notifs.unshift({ id: 'n' + id, ev: 'rappel.depot', lab: 'Rappel avant échéance', titre, corps, t: frDate(), roles: [], ids, lu: [] });
    kvSet('notifs', notifs.slice(0, 120), 'rappels');
    const comptes = db.prepare(`SELECT id, nom, email FROM users WHERE active=1 AND id IN (${ids.map(() => '?').join(',')})`).all(...ids).slice(0, 50);
    if (comptes.length) {
      const org = (kvGet('org') || { value: {} }).value || {};
      const e = { id: 'm' + id, ev: 'rappel.depot', de: mail.actif() ? mail.expediteur() : ((kvGet('mailFrom') || {}).value || ''), ids: comptes.map((u) => u.id),
        a: comptes.map((u) => u.email), noms: comptes.map((u) => u.nom), objet: '[' + (cdc.ref || '') + '] ' + titre,
        corps: corps + '\n\n—\n' + (org.nom || '') + ' — plateforme Marché+\nCe message est généré automatiquement ; ne pas y répondre.',
        t: frDate(), statut: mail.actif() ? 'en cours' : 'simulé' };
      const emails = (kvGet('emails') || { value: [] }).value;
      emails.unshift(e);
      kvSet('emails', emails.slice(0, 80), 'rappels');
      if (mail.actif()) S.expedier(e);
    }
    envoyes++;
  }
  return envoyes;
}

/** Tous les espaces actifs (ou l'installation seule). */
function verifierTout() {
  const E = require('./espaces');
  for (const e of E.registre().prepare('SELECT * FROM espaces WHERE actif=1').all()) {
    try { E.dans(e, () => verifier()); } catch (err) { console.error('Rappels', e.slug, err.message); }
  }
}

function demarrer() {
  if (process.env.RAPPELS === '0') return;
  setTimeout(verifierTout, 60000).unref();
  setInterval(verifierTout, 3600000).unref();
}

module.exports = { verifier, verifierTout, demarrer };
