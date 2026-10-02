# Faire évoluer Marché+ au-delà de la démonstration

> Ce document ne couvre que la mise en concurrence (module 3). La vision complète et l'ordre révisé des
> travaux sont dans [CADRAGE.md](CADRAGE.md).

État au 02/10/2026, branche `main` (commit `52f3a00`). Ce document chiffre le passage de la version de
démonstration (une procédure, données fictives) à une version utilisable par un client réel, **en gardant
le front actuel** (HTML/CSS/JS natif, sans framework ni build).

Les estimations sont en semaines pour **un développeur**. Ce sont des ordres de grandeur tirés de la lecture
du code, pas un engagement : elles seront à revoir après le lot A, qui est le plus petit et sert d'étalon.

## Résumé

| Lot | Objet | Écrans touchés | Charge | Priorité |
|---|---|---|---|---|
| **A** | Règles métier et verrous côté serveur | presque aucun | 1 à 1,5 sem. | **Avant tout client réel** |
| **B** | Écritures ciblées au lieu de l'état complet | 4 | 1 sem. | Avant un vrai comité d'évaluation |
| **C** | Plusieurs procédures | 15 sur 20, plus 1 nouveau | 3 à 4 sem. | Avant un premier client |
| **D** | Plusieurs clients sur une instance | tous, en surface | 2 à 3 sem. | **Abandonné** : une instance par client (voir CADRAGE.md §6) |

Total sans le lot D : **5 à 6,5 semaines**.

L'ordre compte. A et B ne changent presque pas l'interface et corrigent ce qui serait contesté en cas de
recours. C est le gros chantier ; il est plus sûr de le faire sur des règles déjà déplacées côté serveur
et testées.

## Comment fonctionne la version actuelle

Tout l'état de la procédure vit dans une table clé/valeur (`kv`) : `cdc`, `criteria`, `quality`,
`confirmed`, `approvals`, `depClosed`, `evalDone`… Chaque valeur est un bloc JSON.

- Le navigateur charge **tout** l'état (`GET /api/state`), le modifie, puis renvoie les clés modifiées
  **en entier** (`PATCH /api/state`).
- Le serveur ([server/rules.js](../server/rules.js)) vérifie **qui** a le droit d'écrire chaque clé, et
  quelques règles de forme.
- Les calculs métier (conversion, préférence communautaire, conformité, classement, anomalies,
  justifications manquantes) sont faits **dans le navigateur**, dans
  [public/js/app.js](../public/js/app.js) (lignes 222 à 320).

C'est simple et efficace pour une démonstration. Les limites ci-dessous en découlent toutes.

## Lot A — Règles métier et verrous côté serveur (1 à 1,5 semaine)

### Ce que le serveur ne vérifie pas aujourd'hui

Constaté dans `server/rules.js` et `server/routes/state.js` :

| Règle attendue | Aujourd'hui |
|---|---|
| Évaluation fermée tant que le dépouillement n'est pas clôturé | Non vérifié : `quality` s'écrit à tout moment. |
| Clôture du dépouillement impossible s'il reste un montant à faible confiance non confirmé | Non vérifié : `depClosed` n'est contrôlé que comme booléen. |
| Validation de l'évaluation impossible si un écart IA/humain n'est pas justifié | Vérifié **dans le navigateur seulement** (`missingJustifs`). |
| Approbation fermée tant que l'évaluation n'est pas validée | Non vérifié : `approvals` ne contrôle que la permission. |
| Un même utilisateur ne peut pas noter et approuver la même procédure | Non vérifié. |
| Taux de change figé à l'ouverture des plis | **Non** : `org.rates` reste modifiable, et le classement est recalculé avec le taux du moment. |
| Montant, devise et délai d'une offre non modifiables après dépôt | **Non** : la clé `offers` (permission « Paramètres ») remplace la liste entière des offres. |
| Classement calculé par le serveur | Non : calculé par le navigateur, le serveur ne le connaît pas. |

Les vérifications existantes sont correctes : déclaration de conflit d'intérêts avant de noter, notes entre
0 et 100, signature après toutes les approbations, chacun ne déclare que pour soi, pas de modification de
son propre rôle.

### Ce qu'on fait

1. **Un module de règles partagé, sans build** : `public/js/regles.js`, en JavaScript simple, chargé par le
   navigateur **et** par Node (`require`). Le serveur et l'interface utilisent alors exactement le même calcul.
   On y déplace `montantXOF`, `montantCorrige`, `requiredDocs`, `missingDocs`, `ranking`, `anomalies`,
   `missingJustifs`, `flagsRemaining`, `phase`.
2. **Les contrôles d'enchaînement dans `validateChange`**, pour `quality`, `justif`, `depClosed`, `evalDone`,
   `approvals`, `contractSigned`, avec des messages en français.
3. **La séparation des fonctions** : refus d'approuver pour quiconque a écrit une note sur la procédure (à
   partir de l'audit ou d'un champ `scoredBy`).
4. **Le gel du taux** : à la clôture du dépouillement, copie des taux dans l'état de la procédure ; les calculs
   utilisent cette copie, jamais `org.rates`.
5. **Le verrou des offres** : refus de toute écriture de `offers` qui change montant, devise ou délai d'une
   offre déposée.
6. **Les tests** : un test par règle, sur le modèle de [server/test/api.test.js](../server/test/api.test.js)
   (12 tests aujourd'hui).

### Ce qu'on réutilise de la branche `conception`

Elle contient ces règles **déjà écrites et testées** (34 tests), en TypeScript :
`packages/core/src/scoring.ts` (`toPivot`, `comparisonAmount`, `rank`, `assertScoreIsAcceptable`),
`workflow.ts` (`assertCanCloseScreening`, `assertCanScore`, `assertCanApprove`, `assertSeparationOfDuties`,
`assertClarificationDoesNotAlterOffer`, `assertCanSignContract`) et `rbac.ts` (paires de permissions
incompatibles). On les **traduit en JavaScript** plutôt que d'introduire TypeScript et une étape de build ;
les tests servent de cahier des charges.

### État : réalisé le 02/10/2026

Fait en une session, non commité à cette date. Ce qui a été livré :

- `public/js/regles.js` : conversion, préférence, conformité, classement, justifications manquantes, champs à
  confirmer, délai de recours. `app.js` et `server/rules.js` l'utilisent tous les deux.
- `server/rules.js` : tous les contrôles du tableau ci-dessus, avec un code d'erreur explicite
  (`GATE_DEPOUILLEMENT_NOT_CLOSED`, `JUSTIFICATION_REQUIRED`, `SEPARATION_OF_DUTIES`, `STANDSTILL_RUNNING`…).
  La séparation des fonctions s'appuie sur un historique tenu par le serveur seul (clé `_sod`, non transmise
  aux navigateurs). Les taux figés sont dans la clé `fxFrozen`, écrite par le serveur à la clôture.
- Journal d'audit : le serveur écrit lui-même le gel des taux et le classement arrêté à la validation.
- Corrigés en chemin : le recours déclaré fondé était refusé au comité d'engagement ; le circuit d'approbation
  pouvait être réordonné pendant les approbations ; la date d'ouverture du délai de recours venait du navigateur ;
  l'ajout d'un critère échouait pour le responsable des achats ; le rang affiché dans « Notification & recours »
  était vide.
- Tests : 30 au total (12 d'API, 6 sur les calculs, 12 sur le parcours complet d'une procédure). Six règles ont été
  désactivées une à une : chacune fait échouer au moins un test.

Choix faits sans décision formelle, à confirmer :

- **Moment du gel des taux** : la clôture du dépouillement, faute d'événement « ouverture des plis » dans
  l'application. Si l'ouverture doit être un acte distinct, il faudra l'ajouter.
- **Une même personne peut approuver plusieurs niveaux** : non interdit, car le jeu de démonstration n'a qu'un
  approbateur. À interdire pour un client réel si son circuit l'exige.
- **Valeurs réglementaires inchangées** (délai de recours de 15 jours, taux de préférence) : la durée du délai
  ne se modifie plus une fois ouvert, mais sa valeur par défaut reste à valider par un juriste.

Non couvert par un test automatique : le refus de signature pendant un recours ouvert une fois le délai expiré
(le test devrait attendre 15 jours). La règle existe, elle est vérifiée après celle du délai.

## Lot B — Écritures ciblées (1 semaine)

> **Réalisé le 02/10/2026** (deuxième incrément de l'étape 2 de [CADRAGE.md](CADRAGE.md)). Les routes sont
> celles du tableau ci-dessous, sous `/api/procedures/:id/`, avec une variante : la conformité se décide par
> `PUT /conformite/:offre` et la confirmation d'un champ par `PUT` (elle peut être retirée avant la clôture).

Aujourd'hui, une note modifiée renvoie **toutes les notes** (`quality`). Deux évaluateurs qui notent en même
temps provoquent une erreur 409 pour l'un des deux, qui doit recharger.

On remplace, pour les données saisies à plusieurs, l'envoi du bloc par une route par action :

| Donnée | Route | Écran |
|---|---|---|
| Une note | `PUT /api/scores/:offre/:critere` (note + justification ensemble) | Évaluation |
| Un champ confirmé | `POST /api/confirmations/:offre/:champ` | Dépouillement |
| Une décision de conformité | `PUT /api/conformite/:offre` | Conformité & anomalies |
| Un niveau d'approbation | `POST /api/approbations/:niveau` | Décision & approbation |

Chaque route vérifie elle-même ses règles (lot A) et écrit sa ligne d'audit. Le reste (cahier des charges,
paramètres, rôles), édité par une seule personne à la fois, peut garder l'envoi en bloc.

## Lot C — Plusieurs procédures (3 à 4 semaines)

> **Socle réalisé le 02/10/2026** (premier incrément de l'étape 2 de [CADRAGE.md](CADRAGE.md)) : tables
> `procedures` et `pkv`, routes `/api/procedures/:id/…`, sélecteur et écran « Procédures », migration vers p1.
> Le détail est dans CADRAGE.md. Le texte ci-dessous est le chiffrage d'origine.

C'est le premier besoin d'un vrai client, et le plus gros chantier : la procédure `AO-2026-014` est la seule
qui existe, et elle est écrite en dur (21 fois dans `app.js`, 2 fois dans `index.html`).

### Séparer ce qui appartient au client de ce qui appartient à la procédure

| Niveau organisation (reste unique) | Niveau procédure (un exemplaire par procédure) |
|---|---|
| `org` (hors taux figés), `seuils`, `docDefs`, `roles`, `users`, `notifRules`, `mailFrom`, `mailSuffix`, `delegations` | `cdc`, `criteria`, `offers`, `receipts`, `files`, `confirmed`, `excluded`, `quality`, `justif`, `coi`, `depClosed`, `evalDone`, `approvals`, `qa`, `additifs`, `clarifs`, `recours`, `standstill`, `contractSigned`, `infructueux`, taux figés |

Côté base : une table `procedures`, et une colonne `procedure_id` sur `kv`, `offers`, `receipts`, `files`,
`audit`. Le schéma `db/migrations/0001_init.sql` de la branche `conception` sert de modèle (tables
`procedures`, `lots`, `criteria`, `procedure_fx_rates`, `scores`, `approval_steps`). Script de migration qui
range les données actuelles dans une procédure n°1.

Côté API : toutes les routes de procédure prennent l'identifiant (`/api/procedures/:id/state`…).
Le serveur refuse une requête sans procédure.

### Écrans

| Changement | Écrans |
|---|---|
| **Nouveau** : liste des procédures, création, archivage | Procédures |
| Sélecteur de procédure dans la barre latérale (aujourd'hui « Procédure AO-2026-014 » en dur) | navigation |
| Lisent ou écrivent des données de procédure : à brancher sur la procédure courante | Tableau de bord, Cahier des charges, DAO, Grille de critères, Questions & additifs, Portail de dépôt, Réception, Dépouillement, Conformité, Clarifications, Évaluation, Décision, Recours, Procès-verbal, Piste d'audit |
| Inchangés ou presque (niveau organisation) | Comptes, Rôles, Paramètres, Règles de notification ; Notifications (ajout du lien vers la procédure) |

Le **portail soumissionnaire** change de nature : le soumissionnaire choisit l'appel d'offres auquel il répond,
et ne voit que ceux qui sont publiés.

## Lot D — Plusieurs clients sur une instance (abandonné le 02/10/2026 : chaque client a ses propres partenaires, une instance par client)

Il ne sert que pour un SaaS mutualisé. L'alternative est **une instance par client** : un conteneur et un
volume par client, ce que `deploiement/deployer.sh` sait déjà faire (changer `CIBLE`, `HTTP_PORT` et le
sous-domaine). Avec SQLite, chaque client a alors **son propre fichier de base** : l'isolation est totale par
construction, sans rien à coder. Elle répond aussi à l'exigence de résidence des données des clients bancaires.

**Recommandation** : instance par client tant que le nombre de clients reste faible (moins d'une dizaine).
Cette décision est commerciale autant que technique : à trancher avant le lot C, car elle conditionne la
forme des tables.

## Ce qui reste hors de ce chiffrage

- **L'IA réelle** (extraction des montants, notes proposées) : spécifiée dans la branche `conception`
  (`docs/EXTRACTION.md`), à chiffrer séparément, avec le coût par offre.
- **L'envoi réel des courriels** (aujourd'hui journalisés seulement).
- **Les sauvegardes** du volume `marcheplus-data`, et une restauration éprouvée.
- **Les valeurs réglementaires** (taux de préférence, retenue à la source, délai de recours, pièces exigibles).
  Elles sont déjà paramétrables, mais les valeurs par défaut doivent être validées par un juriste
  marchés publics, par pays et par bailleur.
- **Le découpage de `app.js`** : **réalisé le 02/10/2026**, en scripts classiques plutôt qu'en modules natifs
  (voir CADRAGE.md, étape 2). Estimation d'origine, en un fichier par écran (modules natifs, sans build) :
  utile pendant le lot C, environ 2 à 3 jours.
