# Marché+

Plateforme de gestion d'un appel d'offres (démonstration : AO-2026-014, Banque Atlantique du Littoral) :
cahier des charges, dossier d'appel d'offres, dépôt dématérialisé, dépouillement, conformité, évaluation,
décision, procès-verbal, recours, rôles et piste d'audit.

L'interface reprend à l'identique le prototype d'origine (`docs/prototype-original.html`) ; elle est maintenant
servie par un vrai backend avec comptes, droits et base de données.

## Architecture

```
public/            front (HTML/CSS/JS sans build) : index.html, css/, js/api.js (connexion, API), js/app.js (vues)
server/
  index.js         Express, helmet (CSP), service du front
  db.js            SQLite (better-sqlite3) : schéma, jeu de données initial, audit chaîné
  auth.js          JWT en cookie HttpOnly/SameSite=Strict, middleware d'habilitations
  rules.js         règles métier côté serveur (qui peut écrire quoi)
  routes/          /api/auth/*, /api/state, /api/offers, /api/audit, /api/admin/reset
  seed/seed.json   données de référence extraites du prototype
  test/            tests d'API (node:test)
```

Ce que le serveur garantit (et que l'interface seule ne garantissait pas) :

- **Authentification** par compte et mot de passe (bcrypt), limitation des tentatives, session 8 h.
- **Habilitations vérifiées côté serveur** pour chaque écriture (publier le CDC, noter, approuver, signer, etc.).
- **Conflit d'intérêts** : impossible de noter sans déclaration d'absence de conflit ; chacun ne déclare que pour soi.
- **Signature du marché** refusée tant que tous les niveaux d'approbation ne sont pas faits.
- **Piste d'audit chaînée par SHA-256** (identité et horodatage posés par le serveur) ; vérification : `GET /api/audit/verify`.
- **Dépôt d'offre** validé et construit par le serveur, accusé de réception numéroté (`DEP-0001`…).
- **Cloisonnement** : un soumissionnaire ne voit ni les autres offres, ni les notes, ni les décisions internes.
- **Multi-utilisateurs** : détection de conflits de modification (409) et rafraîchissement automatique.

## Démarrer

```bash
npm install
npm start            # http://localhost:3000
npm test             # 11 tests d'API
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

## Limites connues

- Les pièces jointes ne sont pas stockées : « Joindre la pièce » reste déclaratif, comme dans le prototype.
- L'extraction IA des offres (scores, champs à confiance faible) reste celle des données de démonstration.
- Les courriels sont simulés (journalisés, non envoyés).
- Pas d'écran d'administration des comptes (création / désactivation par API uniquement).
