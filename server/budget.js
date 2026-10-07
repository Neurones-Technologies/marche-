/* Budget et engagement. Les lignes budgétaires de l'organisation (clé budget : code, libellé, service, exercice,
   montant alloué, en XOF) sont saisies dans les paramètres. Une demande d'achat choisit sa ligne ; l'appel d'offres
   puis la commande en héritent (modifiable sur le brouillon de commande).
   - engagé : commandes émises, en réception, réceptionnées ou clôturées ;
   - réservé : commandes soumises à validation ou validées, pas encore émises ;
   - disponible : alloué − engagé − réservé.
   Dès qu'une ligne existe, une commande ne se soumet, ne s'émet ni ne s'augmente par avenant sans ligne imputée et
   sans crédits disponibles. Sans ligne définie, le contrôle est inactif. */
const { kvGet, commandesAll } = require('./db');

const ENGAGEES = ['emise', 'en_reception', 'receptionnee', 'cloturee'];
const RESERVEES = ['validation', 'validee'];
const montantXOF = (c) => c.lignes.reduce((t, l) => t + l.quantite * l.prixUnitaire, 0) * (c.taux || 1);

const lignes = () => (((kvGet('budget') || { value: {} }).value || {}).lignes) || [];

/** Situation de chaque ligne ; sauf : une commande à ne pas compter (celle qu'on contrôle). */
function situation(sauf, liste = lignes()) {
  const cmd = commandesAll().filter((c) => c.ligneBudget && c.id !== sauf);
  return liste.map((l) => {
    const de = cmd.filter((c) => c.ligneBudget === l.id);
    const engage = de.filter((c) => ENGAGEES.includes(c.statut)).reduce((t, c) => t + montantXOF(c), 0);
    const reserve = de.filter((c) => RESERVEES.includes(c.statut)).reduce((t, c) => t + montantXOF(c), 0);
    return { ...l, engage: Math.round(engage), reserve: Math.round(reserve), disponible: Math.round(l.montant - engage - reserve), commandes: de.length };
  });
}

/** Contrôle des crédits pour une commande d'un montant donné (XOF) : null, ou { status, code, error }. */
function controler(c, montant) {
  const liste = lignes();
  if (!liste.length) return null;
  if (!c.ligneBudget) return { status: 422, code: 'BUDGET_LINE_REQUIRED', error: 'Imputez d’abord la commande sur une ligne budgétaire.' };
  const s = situation(c.id, liste).find((l) => l.id === c.ligneBudget);
  if (!s) return { status: 422, code: 'BUDGET_LINE_UNKNOWN', error: 'Ligne budgétaire inconnue : choisissez-en une autre.' };
  const f = (n) => Math.round(n).toLocaleString('fr-FR');
  if (montant > s.disponible + 0.5)
    return { status: 409, code: 'BUDGET_INSUFFICIENT', error: `Crédits insuffisants sur la ligne ${s.code} : disponible ${f(s.disponible)} XOF, commande ${f(montant)} XOF.` };
  return null;
}

/** Contrôle d'une nouvelle liste de lignes (paramètres) : refus si une ligne utilisée disparaît ou passe sous son engagement. */
function controlerListe(nouvelles) {
  const avant = situation(null);
  for (const a of avant) {
    if (!a.commandes) continue;
    const n = nouvelles.find((x) => x.id === a.id);
    if (!n) return `La ligne ${a.code} est imputée à ${a.commandes} commande(s) : elle ne peut pas être supprimée.`;
    if (n.montant < a.engage + a.reserve) return `La ligne ${a.code} ne peut pas descendre sous ce qu’elle engage et réserve déjà (${Math.round(a.engage + a.reserve).toLocaleString('fr-FR')} XOF).`;
  }
  return null;
}

module.exports = { lignes, situation, controler, controlerListe, montantXOF };
