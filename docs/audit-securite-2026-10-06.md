# Audit de sécurité — Marché+

**Date :** 2026-10-06
**Périmètre :** dépôt entier, commit `dbe4d95` : serveur (`server/`), front (`public/`), déploiement (`Dockerfile`, `docker-compose.yml`, `deploiement/`). Priorité à ce qui est exposé sur Internet : portail des partenaires, plateforme multi-espaces, console des opérateurs, droits des comptes prestataires.
**Stack :** Node.js 22, Express 5, better-sqlite3, jsonwebtoken, bcryptjs, helmet, express-rate-limit ; front en JavaScript natif sans build.
**Outils utilisés :** `npm audit --omit=dev` (0 vulnérabilité), recherche de secrets dans l'arbre et l'historique git (rien trouvé), revue manuelle des routes et des règles d'écriture.
**Correction :** même jour. Les dix constats sont corrigés, chacun avec un test de non-régression (`server/test/securite.test.js`). La suite passe de 122 à 133 tests, tous verts sous Node 22. Les numéros de ligne ci-dessous sont ceux du commit audité, `dbe4d95`.

## Synthèse

| Sévérité | Nombre |
|---|---|
| Critique | 0 |
| Élevée | 4 |
| Moyenne | 2 |
| Faible | 0 |
| Informatif | 4 |

Les fondations sont saines. Les mots de passe sont hachés avec bcrypt. Les cookies de session sont `HttpOnly`, `SameSite=Strict` et `Secure` en production. Les requêtes SQL sont paramétrées. Une politique CSP stricte est en place (`script-src 'self'`). Le jeton de session est lié à l'espace. Les jetons à usage unique sont stockés hachés. Le type des fichiers est vérifié sur leur contenu, et les pièces sont servies en téléchargement avec `nosniff`. Aucun secret n'a été trouvé dans le dépôt ni dans son historique.

Les failles se concentrent sur **un seul acteur : le compte prestataire**, c'est-à-dire précisément le concurrent qu'une procédure d'achat doit tenir à distance. Ce compte voit les prix des autres soumissionnaires, peut réécrire les questions-réponses et les clarifications officielles, et peut faire envoyer des courriels depuis la boîte de l'organisation. Ces points sont à corriger avant d'ouvrir la plateforme à de vraies entreprises.

---

## SEC-01 — Chaque prestataire voit les accusés de dépôt de tous ses concurrents (raison sociale, pays, montant)

**Sévérité :** Élevée
**Emplacement :** `server/routes/state.js:20-24`, affichage dans `public/js/app/ecrans/portail.js:207-216`
**Statut :** Corrigé. L'accusé enregistre son déposant (colonne `receipts.owner`). Un compte `portail.use` sans `offres.read` ne reçoit que ses propres accusés. Un accusé antérieur à la correction, sans déposant, ne va plus qu'aux lecteurs des offres.

**Description**
L'état d'une procédure envoie à tout compte qui a l'habilitation `portail.use` la totalité des accusés de dépôt de la procédure. Le portail les affiche tous sous « Accusés de dépôt ». Chaque accusé contient la raison sociale, le pays, le montant de l'offre et le nombre de lots.

**Chemin de la donnée**
`POST /offers` enregistre l'accusé dans la table `receipts`. `buildState` lit tous les accusés de la procédure (`state.js:20`) et les envoie à tout titulaire de `portail.use` (`state.js:24`), sans filtre sur le déposant. Le portail les affiche sans filtre lui non plus.

**Impact**
Un soumissionnaire connaît, avant l'ouverture des plis, l'identité et le prix de chaque offre concurrente, et peut déposer juste en dessous. Cela détruit la confidentialité des offres, qui est la base de la procédure. Il suffit d'un compte prestataire qui voit le dossier : un partenaire consulté, ou toute entreprise inscrite pour un appel d'offres ouvert.

**Correction proposée**
Enregistrer le déposant dans l'accusé (colonne `owner` ou champ `par`), puis n'envoyer à un compte `portail.use` sans `offres.read` que ses propres accusés. Côté portail, rien ne change : il n'affichera plus que les accusés reçus.

**Effort estimé :** faible

---

## SEC-02 — Un prestataire peut réécrire les questions-réponses et les clarifications de toute la procédure

**Sévérité :** Élevée
**Emplacement :** `server/rules.js:30-32` (`WRITE_PERMS` : `qa`, `clarifs`), pas de cas dédié dans `validateChange`, écriture par `PATCH /api/procedures/:pid/state` (`server/routes/state.js:155`)
**Statut :** Corrigé. `portail.use` est retiré de `WRITE_PERMS` pour `qa` et `clarifs`. Il n'a pas fallu de nouvelle route : le portail n'écrit jamais ces clés, que seuls les écrans des achats (`offres.read`) saisissent.

**Description**
Pour permettre à un prestataire de poser une question ou de répondre à une clarification, les clés `qa` et `clarifs` lui sont ouvertes en écriture **entières**. Aucune règle ne contrôle ce qui change dans la liste : ajout, modification ou suppression de n'importe quel élément.

**Chemin de la donnée**
Le corps du `PATCH /state` (`changes.qa`, `changes.clarifs`) est fourni par le navigateur. `validateChange` vérifie seulement l'habilitation (`portail.use`), puis le plafond de taille. `ecrire` remplace la clé telle quelle.

**Impact**
Un soumissionnaire peut modifier ou effacer les réponses officielles de l'acheteur, que tous les candidats lisent. Il peut aussi supprimer les questions des autres, et répondre à leur place, ou effacer, les demandes de clarification adressées à d'autres offres. Ces dernières lui sont par ailleurs toutes visibles (voir SEC-06). Les éléments qui fondent le procès-verbal ne sont donc plus intègres.

**Correction proposée**
Retirer `portail.use` de `WRITE_PERMS` pour `qa` et `clarifs`. Remplacer ces écritures par deux routes ciblées, sur le modèle des « écritures ciblées » déjà présentes dans `state.js` :
- `POST /qa` : ajoute une question ; l'auteur et la date sont posés par le serveur ;
- `PUT /clarifs/:i/reponse` : réservé au déposant de l'offre visée, ne modifie que la réponse.

Le front du portail est à adapter pour appeler ces routes.

**Effort estimé :** moyen

---

## SEC-03 — Tout compte, prestataire compris, peut faire envoyer un courriel libre depuis la boîte Microsoft 365 de l'organisation

**Sévérité :** Élevée dès que `MAIL_MODE=graph` est activé (aujourd'hui, en mode simulé, l'impact se limite à la messagerie interne)
**Emplacement :** `server/rules.js:38` (`notifs: ['*'], emails: ['*']`), `server/routes/state.js:107-140`
**Statut :** Corrigé.
- Un prestataire (`portail.use` sans `offres.read`) ne crée plus ni notification ni courriel. Le dépôt d'une offre est annoncé par le serveur (`annoncer`, règle `depot.recu`), et non plus par le navigateur du déposant.
- Pour le personnel, un nouvel élément doit correspondre à un événement configuré et actif (`notifRules`). Les destinataires d'un courriel sont limités aux rôles de la règle, et les rôles d'une notification sont ceux de la règle.
- Une notification enregistrée ne se réécrit plus : chacun ne peut la marquer lue que pour lui-même.

**Description**
Les clés `emails` et `notifs` sont modifiables par tout utilisateur connecté. Un nouvel élément de `emails`, avec un objet et un corps libres (20 000 caractères), est expédié par Microsoft Graph depuis l'expéditeur officiel de l'organisation, à tout compte actif désigné par son identifiant (50 au plus). Les identifiants des comptes sont fournis à tous dans `state.users`. Les notifications (`notifs`) acceptent de la même façon un texte libre, avec des rôles ou des comptes destinataires libres.

**Chemin de la donnée**
`PATCH /state`, puis `changes.emails[i].objet/corps/ids`. `ecrire` fixe seulement l'expéditeur et les adresses réelles, puis `expedier`, puis `mail.envoyer`.

**Impact**
Un prestataire peut envoyer au personnel des achats un hameçonnage parfait : expéditeur légitime, domaine de l'organisation, nom de la plateforme. Par exemple, un faux « changement de RIB » ou un faux lien de connexion, qui peut mener à la prise de comptes internes. Il peut aussi inonder les notifications internes.

**Correction proposée**
Le navigateur ne doit plus créer de courriel. Ce sont les événements serveur qui produisent les courriels (dépôt, publication, attribution…). À défaut, réserver l'écriture de `emails` à une habilitation interne (`notif.manage`) et refuser toute écriture d'un compte `portail.use` sur `emails` et `notifs`, hormis le marquage « lu » de ses propres notifications.

**Effort estimé :** moyen

---

## SEC-04 — Stockage de fichiers non borné : un anonyme peut remplir le disque du VPS

**Sévérité :** Élevée
**Emplacement :** `server/routes/inscription.js:28-29, 50, 72-95` (brouillon anonyme), `server/routes/partenaires.js:101-125` (pièces de référencement)
**Statut :** Corrigé.
- Brouillon anonyme : 50 Mo au plus par brouillon (`BROUILLON_MAX_MO`) et 500 Mo pour l'ensemble des brouillons d'un espace (`BROUILLONS_MAX_MO`, réponse 503 au-delà). Les brouillons expirés sont purgés à chaque dépôt.
- Fiche partenaire : 200 Mo, versions archivées comprises (`PARTENAIRE_MAX_MO`), et 60 dépôts par heure et par compte (`PIECES_PAR_HEURE`).
- Les quatre réglages sont documentés dans `.env.example`. La surveillance de l'espace disque reste à mettre en place côté exploitation.

**Description**
Le portail des partenaires accepte, **sans compte**, des pièces de 10 Mo dans un brouillon, jusqu'à 100 dépôts par heure et par adresse IP. Les brouillons expirés ne sont purgés que lorsqu'un nouveau brouillon est créé, et aucun quota ne s'applique, ni par espace ni au total. Côté compte prestataire, `POST /api/partenaires/:id/fichiers` n'a aucune limite de débit, et chaque remplacement conserve l'ancien fichier.

**Chemin de la donnée**
Requête anonyme → `express.raw` (10 Mo) → `fs.writeFileSync` dans le volume `marcheplus-data`.

**Impact**
Environ 1 Go par heure et par adresse IP, et davantage avec plusieurs adresses. Le volume Docker est sur le disque du VPS, qui sert aussi hr360, neurones-ia et ao. Un disque plein arrête Marché+ (SQLite ne peut plus écrire) et peut arrêter les autres applications de la machine.

**Correction proposée**
- Plafonner la taille totale d'un brouillon (par exemple 50 Mo).
- Purger les brouillons expirés à intervalle régulier (`setInterval`), pas seulement à la création.
- Ajouter une limite de débit sur les dépôts de pièces d'un prestataire, et borner le nombre de versions archivées par pièce.
- Côté exploitation, surveiller l'espace disque du volume.

**Effort estimé :** faible

---

## SEC-05 — Recours : l'auteur est déclaré par le navigateur

**Sévérité :** Moyenne
**Emplacement :** `server/rules.js:270-285` (cas `recours`), `WRITE_PERMS.recours` (`rules.js:33`)
**Statut :** Corrigé.
- `portail.use` est retiré de `WRITE_PERMS.recours` : un recours est enregistré par les achats (`recours.handle`), comme le faisait déjà l'écran « Recours et signature ».
- À l'enregistrement, le serveur pose qui l'enregistre (`par`) et quand (`enregistre`). Ces champs sont conservés lors de la décision.
- `t` reste la date de réception déclarée. La réécrire aurait fait refuser la décision suivante du navigateur, qui compare cette date.

**Description**
Un prestataire ajoute un recours en réécrivant la clé `recours`. Les champs `de` (auteur), `objet` et `t` (date) viennent du navigateur. Seul le statut est contrôlé, qui doit être « ouvert » à la création.

**Impact**
Un prestataire peut déposer un recours au nom d'un concurrent, ou antidater le sien. Tant qu'un recours est ouvert, la signature du marché est bloquée (`rules.js:297`). N'importe quel prestataire qui voit le dossier, même sans y avoir déposé d'offre, peut donc suspendre l'attribution, sous une fausse identité.

**Correction proposée**
Une route `POST /recours` où le serveur pose `de` (la raison sociale du partenaire du compte), `par` (l'identifiant du compte) et `t` (l'heure du serveur). Réserver le dépôt aux prestataires qui ont déposé une offre sur la procédure, avec un seul recours ouvert par partenaire.

**Effort estimé :** faible

---

## SEC-06 — Un prestataire reçoit l'état interne de la procédure

**Sévérité :** Moyenne
**Emplacement :** `server/routes/state.js:15-57` (`buildState`)
**Statut :** Corrigé.
- Pour un compte `portail.use` sans `offres.read`, `users` se réduit au compte lui-même, et `approvals` perd l'identité des approbateurs (seules les dates restent, pour la vue d'ensemble).
- `rejets`, `coi`, `notifRules` et les circuits modèles sont vidés.
- `consultes` ne révèle que si l'entreprise elle-même est consultée.
- `clarifs` et `recours` sont filtrés sur ses propres offres et sur sa raison sociale.
- Les clés qu'utilisent ses écrans (vue d'ensemble, dépôt, référencement, exécution) sont conservées, avec le même type, pour ne pas casser le front.

**Description**
`buildState` envoie toutes les clés de l'organisation et de la procédure, puis en masque quelques-unes pour qui n'a pas `offres.read` (`quality`, `justif`, `confirmed`, `excluded`, `offers`). Le principe est donc une liste noire. Un prestataire reçoit ainsi :
- `users` : le nom et le rôle de chaque membre du personnel ;
- `approvals` : qui a approuvé, et quand ;
- `rejets` : les motifs internes de rejet de l'attribution ;
- `coi` : les déclarations de conflit d'intérêts des évaluateurs ;
- `consultes` : la liste des partenaires consultés, donc des concurrents ;
- `clarifs` : les clarifications de toutes les offres ;
- `recours` : les recours de tous les candidats ;
- les paramètres internes (`roles`, circuits, `notifRules`…).

**Impact**
Fuite d'informations internes et concurrentielles : qui évalue et qui approuve (une cible pour la pression ou la corruption), qui est en compétition, ce que l'acheteur a demandé aux autres candidats. Les noms du personnel sont aussi ce qui rend SEC-03 exploitable.

**Correction proposée**
Inverser la logique : pour un compte `portail.use` sans `offres.read`, une **liste blanche** des clés utiles au portail (`cdc`, `criteria`, `qa`, `additifs`, `docDefs`, `org` réduit aux devises, `standstill`, `contractSigned`, `infructueux`, `cadre`), avec `clarifs` et `recours` filtrés sur ses propres offres. Vérifier sur le portail qu'aucun écran n'a besoin d'autre chose.

**Effort estimé :** moyen

---

## Constats informatifs

**INF-01 — Contrôle du courriel erroné dans la modification d'un compte** (`server/routes/auth.js:100`). *Corrigé : `/^[^@\s]+@[^@\s]+\.[^@\s]+$/`.* L'expression `/^[^@s]+@[^@s]+.[^@s]+$/` exclut la lettre « s » au lieu des espaces (`\s` sans antislash), et son `.` accepte n'importe quel caractère. Elle laisse passer `<x>@y.z` et refuse certaines adresses valides. La route est réservée à l'administrateur : pas de chemin d'exploitation, mais c'est un défaut fonctionnel à corriger en même temps.

**INF-02 — Les sessions survivent à un changement de mot de passe.** *Corrigé : version de session (`users.session_v`, `operateurs.session_v`) portée par le jeton et incrémentée à chaque nouveau mot de passe. La session qui change son mot de passe reçoit un nouveau jeton ; les autres sont fermées.* Le jeton JWT (8 h) reste valable après `POST /api/auth/password` et après un nouveau mot de passe fixé par l'administrateur ou depuis la console. La désactivation d'un compte, elle, prend effet immédiatement, puisqu'elle est vérifiée à chaque requête. Pour fermer une session volée sans désactiver le compte, on peut ajouter un compteur de version dans le jeton.

**INF-03 — Lien de confirmation affiché à l'écran sans Microsoft 365** (`server/routes/plateforme.js:55`). *Traité : un avertissement s'affiche au démarrage si `PLATEFORME_VALIDATION=auto` est actif sans `MAIL_MODE=graph`.* C'est un comportement documenté. En validation manuelle (par défaut), il ne permet que de remplir la file d'attente de la console, dans la limite de 5 demandes par heure et par adresse IP. **Ne pas activer `PLATEFORME_VALIDATION=auto` tant que `MAIL_MODE=graph` n'est pas en place.**

**INF-04 — Connexion à la console : comparaison bcrypt seulement si le compte existe** (`server/routes/console.js:65`). *Corrigé : la comparaison se fait toujours, comme pour la connexion des espaces.* La différence de temps de réponse révèle si un courriel d'opérateur existe. La connexion des espaces fait déjà la comparaison à coût constant (`auth.js:17`) : appliquer la même chose à la console.

---

## Hors périmètre de cet audit

- **Configuration du VPS** : pare-feu, mises à jour du système, accès SSH, droits sur `/opt/marcheplus/.env` (à garder en `chmod 600`).
- **Sauvegardes** : toujours non mises en place (`deploiement/DEPLOIEMENT.md`). C'est le risque opérationnel le plus important à ce jour, devant les constats ci-dessus.
- **Renouvellement du certificat générique** en mode DNS manuel : il expire au bout de 90 jours sans action.
- **Logique métier fine des circuits** (commandes, avenants, réceptions) : seuls les contrôles d'accès des routes ont été relus, pas chaque règle de gestion.
- **Interface :** les corrections ont été vérifiées par l'API et par la lecture du code des écrans. Un parcours manuel dans le navigateur, en compte prestataire (dépôt d'une offre, vue d'ensemble), reste à faire après le déploiement.
