# Marché+

Plateforme de gestion des appels d'offres d'une organisation (démonstration : AO-2026-014, Banque Atlantique du Littoral) :
cahier des charges, dossier d'appel d'offres, dépôt dématérialisé, dépouillement, conformité, évaluation,
décision, procès-verbal, recours, rôles et piste d'audit.

L'interface reprend à l'identique le prototype d'origine (`docs/prototype-original.html`) ; elle est maintenant
servie par un vrai backend avec comptes, droits et base de données.

## Architecture

```
public/            front (HTML/CSS/JS sans build) : index.html, css/, js/api.js (connexion, API),
                   js/app/ (noyau, composants, un fichier par écran, démarrage : voir js/app/LISEZMOI.md),
                   js/regles.js (calculs métier), js/profils.js (profils réglementaires),
                   js/circuits.js (moteur de circuits de validation), tous trois partagés avec le serveur
server/
  index.js         Express, helmet (CSP), service du front
  db.js            SQLite (better-sqlite3) : schéma, état de l'organisation (kv) et de chaque procédure (pkv),
                   jeu de données initial, migrations, audit chaîné
  auth.js          JWT en cookie HttpOnly/SameSite=Strict, middleware d'habilitations
  rules.js         règles métier côté serveur : qui peut écrire quoi, et dans quel ordre
  routes/          /api/auth/*, /api/accueil (tâches et chiffres clés), /api/registre (appels d'offres),
                   /api/inscription (publique), /api/partenaires (référencement),
                   /api/commandes (bons de commande, réceptions, export CSV),
                   /api/besoins (expression, validation, transformation en procédure),
                   /api/organisation/state (état sans procédure ouverte), /api/procedures (liste, création, archivage),
                   /api/procedures/:id/{state,offers,audit,files},
                   écritures ciblées /api/procedures/:id/{scores,confirmations,conformite,approbations},
                   /api/files/:id, /api/audit/verify, /api/admin/reset
  seed/seed.json   données de référence extraites du prototype
  test/            tests (node:test) : API, calculs partagés, parcours complet, profils, procédures, migration
```

Organisation de l'interface (menu) :

- **Accueil** : tableau de bord de l'organisation, avec « À faire pour moi » (les actions qui attendent
  l'utilisateur, calculées par le serveur selon ses habilitations) et les chiffres clés de chaque registre.
- **Registres** : besoins, appels d'offres (toutes les procédures, en cours et passées : phase, titulaire, montant
  attribué, besoin d'origine, commandes ; filtres par phase, année et recherche), commandes et réceptions,
  partenaires (ou « Mon référencement » pour un prestataire).
- **En cours** : une seule entrée, la procédure ouverte. Dans la page, une frise de six étapes (Préparer, Publication
  et offres, Dépouiller, Évaluer, Décider, Clore) montre ce qui est fait, en cours ou à venir ; une étape à plusieurs
  écrans les présente en sous-onglets ; « Étape suivante » en bas, avec les outils (vue d'ensemble, journal d'audit)
  et le changement de procédure en en-tête.
- **Administration** : comptes, rôles, paramètres, alertes.

Ce que le serveur garantit (et que l'interface seule ne garantissait pas) :

- **Évaluation des partenaires** : à la réception définitive, chaque commande reçoit une note sur 100 (délais,
  conformité, complétude à la date prévue, qualité appréciée par le réceptionnaire, pondérés par l'organisation) ; la
  note du partenaire est la moyenne de ses commandes. Sous le seuil, une alerte est consignée, sans suspension
  automatique. Les évaluateurs des offres voient la note, qui n'entre pas dans le classement.
- **Bons de commande et réceptions** : commande établie à partir de l'offre retenue (attribution prononcée et, en
  marché public, marché signé), plafonnée au montant restant de l'offre, validée par un circuit selon le montant, puis
  émise sous un numéro continu et sans trou, avec l'empreinte SHA-256 du document ; imprimable et enregistrable en PDF
  depuis le navigateur ; transmise au titulaire par le portail. Le réceptionnaire désigné constate les livraisons
  (rapprochement commandé / reçu, réserves et levée, retard et pénalités plafonnées), puis la réception définitive.
  Une commande émise ne se modifie que par avenant motivé, validé et émis sous un numéro dérivé (BC-2026-0001-A1),
  sans supprimer de ligne ni descendre sous les quantités reçues ; les versions antérieures sont conservées.
  Export CSV des commandes émises pour la comptabilité. La facture et le paiement restent dans l'ERP.
- **Référencement des partenaires** : un prestataire crée le compte de son entreprise depuis l'écran de connexion
  (limitation par adresse IP, champ piège, pas d'énumération des comptes, compte inactif jusqu'à la vérification du
  courriel), dépose ses pièces administratives et soumet son dossier au parcours de référencement de l'organisation.
  Une pièce validée et en cours de validité tient lieu de pièce du dossier à chaque dépôt d'offre ; en achats privés,
  le dépôt est réservé aux partenaires référencés. Suspension et exclusion motivées.
- **Besoins** : un service exprime un besoin, qui suit le circuit de validation de l'organisation (niveaux selon le
  budget, le demandeur ne valide jamais son propre besoin, rejet motivé) ; validé, il devient une procédure pré-remplie
  (objet, budget, type de procédure pressenti selon des seuils provisoires du profil), que le demandeur suit en lecture.
- **Plusieurs procédures** : chacune a son dossier, ses offres, son évaluation, ses accusés et son journal ; les
  paramètres, rôles et comptes sont communs à l'organisation. Un soumissionnaire ne voit que les procédures publiées.
  Une procédure archivée se consulte mais ne se modifie plus.

- **Authentification** par compte et mot de passe (bcrypt), limitation des tentatives, session 8 h.
- **Habilitations vérifiées côté serveur** pour chaque écriture (publier le CDC, noter, approuver, signer, etc.).
- **Conflit d'intérêts** : impossible de noter sans déclaration d'absence de conflit ; chacun ne déclare que pour soi.
- **Séquencement** : pas de notation avant la clôture du dépouillement, pas de clôture tant qu'un champ à faible
  confiance n'est pas confirmé, pas d'approbation avant la validation de l'évaluation, niveaux franchis dans l'ordre.
  Un retour en arrière n'est possible que par un recours déclaré fondé.
- **Justification obligatoire** de tout écart avec le score proposé par l'IA, vérifiée à la validation de l'évaluation.
- **Circuit d'approbation paramétrable** : chaque niveau peut ne s'appliquer qu'à partir d'un montant (fixé par le
  serveur à la validation de l'évaluation, d'après l'offre classée première) et être réservé à un rôle ; les niveaux se
  franchissent un par un, dans l'ordre ; le niveau attendu peut rejeter l'attribution, avec un motif obligatoire, ce
  qui rouvre l'évaluation. Le profil réglementaire impose un nombre minimum de niveaux requis.
- **Séparation des fonctions** : qui a noté ou validé l'évaluation ne peut pas approuver l'attribution, et inversement.
  L'identité et la date de chaque approbation sont posées par le serveur.
- **Verrous** : taux de change figés à la clôture du dépouillement ; grille, marge de préférence et confirmations
  figées ensuite ; notes et conformité figées à la validation ; offres non modifiables après dépôt ; aucun dépôt
  après la clôture.
- **Signature du marché** refusée tant que tous les niveaux d'approbation ne sont pas faits, que le délai de recours
  court (date d'ouverture posée par le serveur) ou qu'un recours est en instruction.
- **Piste d'audit chaînée par SHA-256** (identité et horodatage posés par le serveur) ; vérification : `GET /api/audit/verify`.
- **Dépôt d'offre** validé et construit par le serveur, accusé de réception numéroté (`DEP-0001`…).
- **Cloisonnement** : un soumissionnaire ne voit ni les autres offres, ni les notes, ni les décisions internes.
- **Multi-utilisateurs** : notes, justifications, confirmations, décisions de conformité et approbations s'écrivent
  une par une (deux évaluateurs peuvent noter en même temps) ; pour le reste, détection de conflits de modification
  (409) ; rafraîchissement automatique.

## Démarrer

```bash
npm install
npm start            # http://localhost:3000
npm test             # 90 tests (Node 22 requis pour better-sqlite3)
```

Comptes de démonstration (mot de passe `Marche+2026!`, modifiable via `SEED_PASSWORD`) :

| Courriel | Rôle |
|---|---|
| y.koffi@bal.ci | Responsable des achats |
| f.assamoi@bal.ci | Évaluateur technique |
| m.traore@bal.ci | Évaluateur financier |
| a.diomande@bal.ci | Membre du comité d'engagement |
| s.bamba@bal.ci | Auditeur interne |
| contact.sotrap@bal.ci | Soumissionnaire |
| administrateur@bal.ci | Administrateur fonctionnel |
| k.yao@bal.ci | Demandeur (service interne) |

## Déploiement (Docker)

```bash
export JWT_SECRET=$(openssl rand -hex 32)
docker compose up -d --build        # données dans le volume marcheplus-data
```

En production : `SEED_DEMO=0` (pas de comptes de démo), `ALLOW_RESET=0`, HTTPS devant le conteneur
(reverse proxy), sauvegarde régulière du volume `/data`. Les comptes se créent via `POST /api/auth/users`
(habilitation « Gérer les rôles »).

> GitHub Pages ne convient plus : le projet nécessite le serveur Node.

## Courriels (Microsoft 365)

Les courriels partent d'une boîte Microsoft 365 par l'API Microsoft Graph (`sendMail`), avec une application
enregistrée dans Entra ID (identifiants client, aucune dépendance ajoutée). Les notifications partent vers l'adresse
réelle des comptes destinataires, désignés par leur identifiant : une adresse fournie par le navigateur est ignorée.
Chaque message garde son statut (envoyé, ou échec avec sa cause) dans la boîte d'envoi de l'écran Notifications ;
chacun n'y voit que les courriels qui lui sont adressés (l'administration des notifications et l'audit voient tout).

Mise en place (administrateur Microsoft 365) :

1. **Boîte d'envoi** : créer une boîte partagée, par exemple `marches@votre-domaine` (sans licence).
2. **Application** : Entra ID → Inscriptions d'applications → Nouvelle inscription (« Marché+ — courriels »,
   locataire unique). Noter l'identifiant d'application (client) et l'identifiant de l'annuaire (locataire).
3. **Secret** : Certificats et secrets → Nouveau secret client ; noter sa **valeur** et sa date d'expiration
   (le renouveler avant cette date).
4. **Permission limitée à la boîte d'envoi** : accorder `Mail.Send` par le contrôle d'accès d'Exchange Online
   (« RBAC for Applications »), limité à la seule boîte d'envoi. Ne pas accorder `Mail.Send` dans Entra ID : une
   permission d'application accordée là vaut pour **toutes** les boîtes de l'organisation. Dans Exchange Online
   PowerShell (vérifier la syntaxe sur la documentation Microsoft « Role Based Access Control for Applications ») :
   ```powershell
   New-ServicePrincipal -AppId <client> -ObjectId <objet de l'application d'entreprise> -DisplayName "Marché+"
   New-ManagementScope -Name "Marche+ boite d'envoi" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'marches@votre-domaine'"
   New-ManagementRoleAssignment -App <client> -Role "Application Mail.Send" -CustomResourceScope "Marche+ boite d'envoi"
   Test-ServicePrincipalAuthorization -Identity <client> -Resource marches@votre-domaine
   ```
5. **Serveur** : dans le `.env` de production (jamais dans le dépôt), puis redémarrer le conteneur :
   ```
   APP_URL=https://tenders.neuronestech.com
   MAIL_MODE=graph
   M365_TENANT_ID=<locataire>
   M365_CLIENT_ID=<client>
   M365_CLIENT_SECRET=<valeur du secret>
   M365_SENDER=marches@votre-domaine
   ```
   L'écran Notifications indique alors « Envoi par Microsoft 365 » et le statut de chaque message.

## Pièces jointes

Le soumissionnaire téléverse chaque pièce exigée dans le portail (PDF, PNG, JPG, DOCX, XLSX, 10 Mo max par défaut,
`MAX_FILE_MB`). Le format est vérifié sur le contenu du fichier, une empreinte SHA-256 est enregistrée, et le dépôt de
l'offre est refusé si une pièce exigée manque. Les acheteurs téléchargent les pièces depuis « Réception des offres »
(chaque consultation est consignée à l'audit). Les fichiers sont dans `data/files` (ou `FILES_DIR`) : à sauvegarder
avec la base.

## Écrans d'administration

- **Comptes utilisateurs** : création, rôle, activation/désactivation, réinitialisation du mot de passe.
- **Piste d'audit** : bouton de vérification d'intégrité de la chaîne de hachage.

## Limites connues

- L'extraction IA des offres (scores, champs à confiance faible) reste celle des données de démonstration.
- Sans configuration Microsoft 365 (`MAIL_MODE=graph`), les courriels restent simulés. En production, l'inscription
  en ligne a besoin de l'envoi réel : sinon le lien de vérification n'est ni envoyé ni affiché (fermer l'inscription,
  Paramètres → 10, ou activer les comptes à la main).
- Les signaux d'anomalie (prix anormalement bas, structures de prix similaires…) sont calculés dans le navigateur ;
  le classement, la conformité et les justifications le sont aussi par le serveur (`public/js/regles.js`).
