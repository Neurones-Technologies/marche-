# Marché+

Plateforme de gestion d'un appel d'offres (démonstration : AO-2026-014, Banque Atlantique du Littoral) :
cahier des charges, dossier d'appel d'offres, dépôt dématérialisé, dépouillement, conformité, évaluation,
décision, procès-verbal, recours, rôles et piste d'audit.

L'interface reprend à l'identique le prototype d'origine (`docs/prototype-original.html`) ; elle est maintenant
servie par un vrai backend avec comptes, droits et base de données.

## Architecture

```
public/            front (HTML/CSS/JS sans build) : index.html, css/, js/api.js (connexion, API), js/app.js (vues),
                   js/regles.js (calculs métier, partagés avec le serveur), js/profils.js (profils réglementaires)
server/
  index.js         Express, helmet (CSP), service du front
  db.js            SQLite (better-sqlite3) : schéma, jeu de données initial, audit chaîné
  auth.js          JWT en cookie HttpOnly/SameSite=Strict, middleware d'habilitations
  rules.js         règles métier côté serveur : qui peut écrire quoi, et dans quel ordre
  routes/          /api/auth/*, /api/state, /api/offers, /api/audit, /api/admin/reset
  seed/seed.json   données de référence extraites du prototype
  test/            tests (node:test) : API, calculs partagés, parcours complet d'une procédure
```

Ce que le serveur garantit (et que l'interface seule ne garantissait pas) :

- **Authentification** par compte et mot de passe (bcrypt), limitation des tentatives, session 8 h.
- **Habilitations vérifiées côté serveur** pour chaque écriture (publier le CDC, noter, approuver, signer, etc.).
- **Conflit d'intérêts** : impossible de noter sans déclaration d'absence de conflit ; chacun ne déclare que pour soi.
- **Séquencement** : pas de notation avant la clôture du dépouillement, pas de clôture tant qu'un champ à faible
  confiance n'est pas confirmé, pas d'approbation avant la validation de l'évaluation, niveaux franchis dans l'ordre.
  Un retour en arrière n'est possible que par un recours déclaré fondé.
- **Justification obligatoire** de tout écart avec le score proposé par l'IA, vérifiée à la validation de l'évaluation.
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
- **Multi-utilisateurs** : détection de conflits de modification (409) et rafraîchissement automatique.

## Démarrer

```bash
npm install
npm start            # http://localhost:3000
npm test             # 36 tests (Node 22 requis pour better-sqlite3)
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

## Déploiement (Docker)

```bash
export JWT_SECRET=$(openssl rand -hex 32)
docker compose up -d --build        # données dans le volume marcheplus-data
```

En production : `SEED_DEMO=0` (pas de comptes de démo), `ALLOW_RESET=0`, HTTPS devant le conteneur
(reverse proxy), sauvegarde régulière du volume `/data`. Les comptes se créent via `POST /api/auth/users`
(habilitation « Gérer les rôles »).

> GitHub Pages ne convient plus : le projet nécessite le serveur Node.

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
- Les courriels sont simulés (journalisés, non envoyés).
- Les signaux d'anomalie (prix anormalement bas, structures de prix similaires…) sont calculés dans le navigateur ;
  le classement, la conformité et les justifications le sont aussi par le serveur (`public/js/regles.js`).
