# Cadrage de Marché+

Version du 02/10/2026. Ce document fixe **ce que Marché+ doit devenir**. Il remplace la vision implicite de la
démonstration (une seule procédure d'appel d'offres) et précède la feuille de route technique
([EVOLUTION.md](EVOLUTION.md)), qui devra être réordonnée en conséquence.

## Vocabulaire

- **Client** : l'organisation qui utilise Marché+ pour ses achats (une banque, une entreprise, un organisme
  public). Le document l'appelle aussi « l'organisation ».
- **Partenaire** : le tiers qui vend au client (prestataire, fournisseur). Il est d'abord **candidat** au
  référencement, puis **soumissionnaire** quand il répond à un appel d'offres, et **titulaire** une fois retenu.

## 1. La vision

Marché+ gère **tout le cycle de la relation entre un client et ses partenaires**, et non une procédure
d'appel d'offres isolée. Il comprend cinq modules, avec de l'IA dans chacun :

1. **Référencement des partenaires.** Chaque client définit son propre parcours pour qu'un tiers devienne
   partenaire : pièces demandées, étapes, validateurs. Le partenaire référencé peut ensuite soumissionner.
2. **De l'intention à la publication.** Un service interne exprime un besoin, qui suit le circuit de
   validation défini par le client avant d'être publié en appel d'offres.
3. **De la réception des offres au choix du partenaire.** Dépouillement, conformité, évaluation, décision,
   recours, puis édition du bon de commande ou du contrat.
4. **Suivi d'exécution.** Jalons et échéances, réceptions, rapprochement entre ce qui a été commandé et ce qui
   a été livré, réserves et pénalités.
5. **Évaluation des partenaires.** Une note calculée automatiquement à partir des critères paramétrés par
   le client et de ce qui s'est réellement passé pendant l'exécution.

Les cinq modules forment une boucle : l'évaluation (5) alimente le référencement (1), qui conditionne qui peut
répondre aux prochains appels d'offres.

```
  ┌───────────────────────────────────────────────────────────────────────┐
  │                                                                       │
  ▼                                                                       │
Référencement ─► Besoin ─► Circuit de ─► Publication ─► Offres ─► Choix ─► Bon de ─► Exécution ─► Évaluation
du partenaire    interne   validation                            du      commande   et          du partenaire
     (1)          (2)        (2)           (2)          (3)      partenaire (3)     réceptions       (5)
                                                                  (3)                 (4)
```

## 2. Deux publics : achats publics et achats privés

Marché+ s'adresse aux deux. La différence ne porte pas sur les écrans mais sur **ce que le client a le
droit de régler elle-même** :

- une **entreprise privée** définit librement ses règles ;
- un **organisme soumis aux marchés publics** (administration, établissement public, banque publique, projet
  sur financement d'un bailleur) applique un cadre réglementaire qu'il ne peut pas assouplir.

Une même organisation peut relever des deux : une banque publique applique le code des marchés au-dessus d'un
seuil et ses propres règles en dessous.

### Le principe : un socle commun, plus un profil réglementaire

Chaque règle de l'application relève de l'une de trois catégories :

| Catégorie | Qui la règle | Exemple |
|---|---|---|
| **Socle** | Personne : elle s'applique toujours | Une offre déposée ne se modifie pas |
| **Imposée par le profil** | Le profil réglementaire, sans modification possible par le client | Délai de recours de N jours en marché public |
| **Paramétrable** | Le client, dans les limites de son profil | Nombre de niveaux d'approbation |

Un **profil réglementaire** est un ensemble de valeurs et de verrous. On en livre au moins deux :
« Achats privés » (presque tout est paramétrable) et « Marchés publics », à décliner par pays ou par bailleur
(UEMOA, Banque mondiale, BAD…), avec des valeurs à faire valider par un juriste. Le profil s'applique **par
procédure** : c'est le type de procédure, déterminé par les seuils, qui fixe le profil.

### Classement des règles existantes

Les règles écrites au lot A ([server/rules.js](../server/rules.js)) se répartissent ainsi :

| Règle actuelle | Catégorie | Commentaire |
|---|---|---|
| Habilitations vérifiées par le serveur | Socle | |
| Piste d'audit chaînée, identité et date posées par le serveur | Socle | |
| Cloisonnement des soumissionnaires | Socle | |
| Déclaration d'absence de conflit d'intérêts avant de noter | Socle | |
| Offre non modifiable après dépôt, aucun dépôt après clôture | Socle | Égalité de traitement, valable aussi en privé |
| Champs extraits par l'IA à faible confiance confirmés avant clôture | Socle | Traçabilité de l'IA |
| Justification écrite de tout écart avec le score proposé par l'IA | Socle | Idem |
| Grille de critères à 100 %, figée à la clôture du dépouillement | Socle | |
| Taux de change figés à la clôture du dépouillement | Socle | |
| Enchaînement dépouillement → évaluation → approbation → signature | Socle | Les étapes existent partout ; leur contenu varie |
| Séparation des fonctions (noter ou valider ≠ approuver) | Socle, activée par défaut | Désactivable en privé pour une très petite équipe, avec trace à l'audit |
| Délai de recours avant signature | Imposée (public) / Paramétrable (privé, désactivé par défaut) | |
| Procédure de recours, retour en arrière sur recours fondé | Imposée (public) / Paramétrable (privé) | |
| Marge de préférence communautaire | Imposée (public, selon le pays) / Désactivée (privé) | |
| Circuit d'approbation de l'attribution | Paramétrable | Niveaux et seuils fixés par le client ; minimum imposé en public |
| Pièces administratives exigées (RCCM, attestation fiscale, CNPS…) | Paramétrable | Liste minimale imposée en public |

À ajouter au profil « Marchés publics », absent aujourd'hui : choix du type de procédure selon les seuils
(appel d'offres ouvert, restreint, consultation, entente directe), publicité obligatoire, ouverture des plis en
séance par une commission, délais minimaux de remise des offres.

### Point d'attention : référencement et appel d'offres ouvert

En privé, il est normal de réserver un appel d'offres aux partenaires déjà référencés. En marché public, un
appel d'offres **ouvert** doit rester accessible à tout candidat : on ne peut pas exiger un référencement
préalable. Le référencement se fait alors pendant le dépôt (inscription simplifiée) ou à l'attribution. C'est
une règle du profil.

## 3. Les notions de base

L'application actuelle tourne autour d'une seule notion, la procédure. Le cycle complet en demande huit :

| Notion | Ce que c'est | Existe aujourd'hui ? |
|---|---|---|
| **Organisation** | L'entreprise cliente, son profil réglementaire par défaut, ses paramètres | Oui, en un exemplaire (`org`) |
| **Partenaire** | Un prestataire ou fournisseur, avec ses pièces, son statut de référencement et son historique | Non : seulement un compte « soumissionnaire » |
| **Besoin** | Une demande interne : objet, budget estimé, service demandeur | Non |
| **Circuit** | Une suite d'étapes de validation définie par l'organisation (rôle, condition de seuil, délai) | Partiellement : le circuit d'approbation de l'attribution, en dur |
| **Procédure** | La mise en concurrence : dossier, critères, offres, évaluation, décision | Oui, en un seul exemplaire (AO-2026-014) |
| **Commande / contrat** | L'engagement avec le partenaire retenu : lignes, montants, jalons | Non (« marché signé » est un simple booléen) |
| **Réception** | Le constat d'une livraison ou d'un jalon : quantité, conformité, réserves | Non |
| **Évaluation du partenaire** | La note du partenaire sur une commande, puis cumulée dans le temps | Non |

**Le moteur de circuits est la pièce centrale.** Il sert à cinq endroits : référencement d'un partenaire,
validation d'un besoin, approbation de l'attribution, validation d'une commande, acceptation d'une réception.
On le construit une fois, en généralisant le circuit d'approbation actuel (étapes ordonnées, franchies dans
l'ordre, séparation des fonctions, identité et date posées par le serveur). Chaque organisation définit ses
circuits ; le profil réglementaire impose un minimum.

## 4. Les modules

### Module 1 — Référencement des partenaires

- **Le partenaire** crée son compte, renseigne son identité (raison sociale, pays, numéro
  d'immatriculation, contacts, domaines d'activité) et dépose les pièces demandées.
- **L'organisation** définit son parcours : pièces exigées selon le pays ou la catégorie, étapes de
  vérification, circuit de validation, durée de validité de chaque pièce.
- **Statuts** : candidat, en cours de vérification, référencé, suspendu, exclu. Alertes à l'expiration d'une
  pièce (attestation fiscale, assurance…).
- **Réutilisation** : les pièces déjà validées ne sont plus redemandées à chaque appel d'offres. C'est un gain
  direct par rapport à aujourd'hui, où chaque dépôt les redemande.
- **IA** : lecture des pièces (dates de validité, numéros, raison sociale), contrôle de cohérence entre pièces,
  repérage d'une pièce expirée ou d'un nom différent.

### Module 2 — De l'intention à la publication

- **Expression de besoin** par un service : objet, quantités, budget estimé, date souhaitée, justification.
- **Circuit de validation** du besoin (hiérarchie, contrôle budgétaire, direction), choisi selon le montant.
- **Choix du type de procédure** selon les seuils et le profil : consultation simple, appel d'offres restreint
  (partenaires référencés invités), appel d'offres ouvert.
- **Rédaction du dossier** à partir du besoin (cahier des charges et DAO existent déjà), circuit de validation
  du dossier, puis publication.
- **IA** : rédaction assistée du cahier des charges à partir du besoin, proposition de critères et de
  pondérations, détection de clauses discriminantes (marque imposée, spécification taillée pour un fournisseur).

### Module 3 — Des offres au choix du partenaire (existant, à compléter)

Déjà en place : dépôt dématérialisé, réception, dépouillement, conformité et anomalies, clarifications,
évaluation, décision et approbation, notification et recours, procès-verbal, piste d'audit.

À ajouter :

- **Édition du bon de commande ou du contrat** à partir de l'offre retenue : lignes et montants repris de
  l'offre, conditions du dossier, jalons de paiement, garanties.
- **Allotissement** : plusieurs lots par procédure, un attributaire par lot.
- **IA** (aujourd'hui simulée) : extraction réelle des offres (montants, délais, pièces), proposition de notes
  justifiées, détection d'anomalies (prix anormalement bas, offres aux structures de prix similaires).

### Module 4 — Suivi d'exécution

- **Jalons** issus de la commande : livraisons, prestations, échéances de paiement, garanties à libérer.
- **Réceptions** par le service demandeur : quantité reçue, conformité, réserves, photos ou procès-verbal.
  Réception provisoire, puis définitive.
- **Rapprochement** commande / réception / facture : on ne paie que ce qui a été commandé **et** reçu.
- **Retards et pénalités** calculés selon les clauses de la commande, avenants tracés.
- **IA** : comparaison entre le bon de livraison et la commande, repérage d'écarts (référence, quantité, prix),
  alertes sur les jalons à risque.

### Module 5 — Évaluation des partenaires

- **Critères paramétrés** par l'organisation : respect des délais, conformité des livraisons, qualité, réactivité,
  avec leurs pondérations.
- **Note calculée automatiquement** à partir des données du module 4 (retards constatés, réserves, pénalités),
  complétée par une appréciation du demandeur pour les critères qualitatifs.
- **Historique** par partenaire et par catégorie. Le seuil en dessous duquel un partenaire est suspendu ou
  écarté est un paramètre.
- **Retour vers le module 1** (statut du partenaire) et vers le module 3 (la performance passée peut être un
  critère d'évaluation, quand le profil l'autorise).
- **IA** : synthèse des points forts et faibles d'un partenaire, signaux faibles (dégradation progressive).

### L'IA : principes communs

- **L'IA propose, une personne décide.** Toute valeur extraite est confirmée si sa confiance est faible ; tout
  écart avec une proposition de l'IA est justifié par écrit. C'est déjà la règle du module 3, elle s'étend à tous.
- **Chaque proposition est tracée** à l'audit : modèle, version, date, valeur proposée, valeur retenue.
- **Résidence des données** : à décider par client (les clients bancaires l'exigeront), elle conditionne le
  choix du fournisseur de modèle.

## 5. Ce que ça change à la feuille de route

[EVOLUTION.md](EVOLUTION.md) prévoit les lots A (règles côté serveur, fait), B (écritures ciblées),
C (plusieurs procédures) et D (plusieurs clients). Ces lots restent nécessaires, mais ils ne couvrent que le
module 3. Ordre proposé :

| Étape | Contenu | Charge indicative |
|---|---|---|
| 1 | Commiter le lot A ; sortir les valeurs réglementaires de `rules.js` vers un **profil** (public / privé) | 1 sem. |
| 2 | **Socle** : plusieurs procédures (lot C), écritures ciblées (lot B), découpage de `app.js` par écran | 4 à 5 sem. |
| 3 | **Moteur de circuits** paramétrables, en remplacement du circuit d'approbation en dur | 2 sem. |
| 4 | **Module 2** (besoin → publication) : premier usage du moteur, petit, il le valide | 2 sem. |
| 5 | **Module 1** (référencement) | 3 à 4 sem. |
| 6 | **Bon de commande** (fin du module 3) et **module 4** (suivi d'exécution) | 4 à 5 sem. |
| 7 | **Module 5** (évaluation des partenaires) | 2 sem. |
| En parallèle | **IA réelle**, en commençant par l'extraction des offres, puis des pièces de référencement | à chiffrer avec le coût par document |

Total hors IA : de **18 à 21 semaines** pour un développeur. Ce sont des ordres de grandeur, comme dans
EVOLUTION.md, à revoir après les étapes 1 et 2. Le front reste en JavaScript natif, sans framework ni build.

Pourquoi cet ordre : les modules 1, 4 et 5 reposent sur des notions (partenaire, commande, circuit) que le
socle actuel n'a pas. Les construire sur l'état clé/valeur d'une procédure unique obligerait à tout refaire
ensuite.

## 6. Décisions prises

**Chaque client a ses propres partenaires** (décidé le 02/10/2026). Il n'y a pas d'annuaire partagé entre
clients. Conséquences :

- **Une instance par client** : un conteneur, un volume et une base SQLite par client, comme
  `deploiement/deployer.sh` le fait déjà. L'isolation des données est totale par construction, ce qui répond à
  l'exigence de résidence des clients bancaires. Le lot D d'EVOLUTION.md (plusieurs clients sur une instance)
  est abandonné.
- **Un prestataire qui travaille avec deux clients de Marché+ s'inscrit deux fois**, avec deux comptes, et
  chaque client vérifie ses pièces selon son propre parcours. C'est voulu : être référencé chez un client ne
  vaut pas chez un autre.
- **Les notions du §3 n'ont pas besoin de colonne « client »** : l'organisation est unique dans chaque instance.
  Seule la procédure (et ce qui en dépend) se multiplie, ce qui simplifie l'étape 2.
- **À prévoir plus tard** : une console pour l'éditeur (créer une instance, la mettre à jour, la sauvegarder),
  puisque chaque nouveau client ajoute une instance à exploiter.

## 7. Décisions à prendre

| Question | Pourquoi elle compte |
|---|---|
| Quels cadres publics viser en premier (pays, bailleurs) ? | Chaque cadre est un profil à écrire et à faire valider par un juriste. |
| Le bon de commande est-il émis par Marché+, ou transmis à l'ERP du client (SAP, Sage…) ? | Ça détermine si le module 4 gère aussi la facture et le paiement, ou seulement la réception. |
| Qui constate une réception : le demandeur, le magasin, un tiers ? | Ça définit les rôles et le circuit d'acceptation. |
| Quel fournisseur d'IA, hébergé où ? | Contrainte de résidence des données, coût par document. |
