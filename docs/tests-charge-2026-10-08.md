# Tests de charge et de stress — Marché+ — 2026-10-08

## Cadre

- **Objet** : volet charge/stress (la correction fonctionnelle est couverte par la suite de 180 tests). Répond à « est-ce que ça tient quand ça monte ? ».
- **Environnement** : **instance locale jetable** (conteneur Node 22, même code que la production, moteur SQLite WAL, `better-sqlite3`). Base de volume réaliste : démo + 660 comptes (600 soumissionnaires, 60 agents) + procédure `p1` publiée en marché public ouvert. **Jamais la production** (elle héberge des espaces réels).
- **Hôte de test** : machine à 20 cœurs, conteneur sans limite de CPU. Comme Node exécute le JavaScript sur **un seul thread**, le plafond observé est celui d'**un cœur** ; un VPS à cœurs plus lents plafonnera plus bas.
- **Injecteur** : k6 (grafana/k6), dans un conteneur voisin sur le même réseau Docker. Mesure côté client ; CPU/mémoire côté serveur via `docker stats`.
- **Objectifs (SLO)** retenus pour l'échelle « élevée » : **p95 < 600 ms** sur la charge attendue, **taux d'erreur < 1 %**, puis recherche du point de rupture.
- **Scénarios** (versionnés dans `tests/charge/`) : référence, charge, stress, pic de dépôt, endurance.

## Résumé

**L'application tient très largement la charge réaliste d'une direction des achats, et se dégrade proprement au-delà, sans jamais s'effondrer ni fuir la mémoire.**

| Essai | Charge | Débit | Latence (p95 / p99) | Erreurs | Verdict |
|---|---|---|---|---|---|
| Référence | 2 VU | 3 req/s | state 18 ms / 20 ms | 0 % | — |
| **Charge** | 200 VU | 223 req/s | state **153 ms** / 250 ms | **0 %** | **SLO tenu** |
| Stress | →1200 VU | ~240 req/s (plafond) | state 596 ms / 725 ms ; global p99 **60 s** | 2,2 % (au pic) | rupture ~500-800 VU, **dégradation propre** |
| Pic de dépôt | 300 VU, 600 dépôts | 41 req/s | dépôt 1,57 s ; upload 1,60 s | 8,7 % (**connexions**) | écritures OK, **bcrypt = goulot** |
| Endurance | 50 VU, 8 min | 71 req/s | state 62 ms / 131 ms | 0 % | **pas de fuite mémoire** |

**Les trois enseignements :**

1. **200 utilisateurs internes simultanés tiennent le SLO** (p95 153 ms, 0 erreur) — très au-delà d'un usage réaliste de banque.
2. **Le goulot est le thread unique de Node** : le débit plafonne à ~240 req/s (sur un cœur) ; ajouter de la concurrence augmente la latence, pas le débit. `better-sqlite3` (synchrone) et `bcrypt` (synchrone) s'exécutent sur ce thread.
3. **Le moment critique n'est pas l'écriture mais la connexion** : lors d'une rafale de dépôts, ce sont les vérifications **bcrypt** des connexions simultanées qui saturent le CPU et font expirer des requêtes — pas les transactions SQLite, qui passent sans erreur.

## Détail des essais

### Référence (2 VU, 30 s)
`GET /api/procedures/p1/state` (lecture la plus lourde : toutes les clés `pkv`) : p95 **18 ms**. `GET /api/procedures` : p95 5 ms. Base de comparaison.

### Charge — 200 VU, parcours bureau (connexion, liste, état, partenaires, pauses 1-3 s)
- **223 req/s**, 0 % d'erreur sur 47 000 requêtes.
- `state` p95 **153 ms**, p99 250 ms ; global p95 200 ms. **SLO (p95 < 600 ms) tenu avec marge.**
- CPU serveur : ~78 % d'un cœur. Mémoire : ~88 Mo.
- Conclusion : la charge attendue, et même un pic important d'utilisateurs internes, passe sans difficulté.

### Stress — montée par paliers jusqu'à 1200 VU
- Le débit **plafonne à ~240 req/s** dès ~200 VU : au-delà, la latence monte mais pas le débit (saturation du thread unique).
- Point de dégradation du SLO : entre **500 et 800 VU** (`state` p95 franchit 600 ms).
- Au pic (1200 VU) : CPU **97 % d'un cœur**, global p99 **60 s** (délai k6 atteint), **2,2 %** de requêtes expirées.
- **Aucune erreur 5xx, aucune exception serveur, mémoire stable (120 Mo).** Après l'arrêt de la charge, `GET /healthz` répond en **2-3 ms** : récupération immédiate. → **dégradation propre, pas d'effondrement.**

### Pic de dépôt — 300 soumissionnaires, 600 dépôts (uploads + transaction)
- 381 offres déposées, `t_depot` p95 **1,57 s**, `t_upload` p95 1,60 s.
- **8,7 % d'échecs — tous des délais de connexion** (`POST /api/auth/login: request timeout`), **aucune** erreur SQLite, aucun verrou, aucune exception (logs serveur propres).
- Cause : **`bcrypt.compareSync` (coût 10) est synchrone et bloque le thread** ; 300 connexions quasi simultanées saturent le CPU (99,8 % d'un cœur) et font expirer des connexions. Le chemin d'écriture lui-même (téléversements + insertion de l'offre en transaction) **tient sans contention**.
- Nuance réelle : une session dure 8 h ; en pratique les soumissionnaires se connectent une fois et sur plusieurs minutes, pas 300 d'un coup. Ce scénario est un pire cas.

### Endurance — 50 VU, 8 min
- 37 000 requêtes, **0 % d'erreur**, latences stables (`state` p95 62 ms).
- Mémoire : ~99 Mo → plateau ~127 Mo après la chauffe, **sans dérive**. Pas de fuite sur cette fenêtre.
- Réserve : une endurance probante dure **des heures** ; 8 min écarte une fuite rapide, pas une lente.

## Goulot d'étranglement

**Le thread JavaScript unique de Node**, sur lequel s'exécutent de façon **synchrone** :
- les requêtes SQLite (`better-sqlite3`),
- le hachage/vérification de mot de passe (`bcrypt`, coût 10).

Conséquence : un débit plafond par cœur (~240 req/s de lectures ici), et une sensibilité aux rafales de connexions. La mémoire n'est jamais un facteur limitant (< 130 Mo).

## Recommandations (hiérarchisées)

1. **Dimensionner le VPS sur la vitesse d'un cœur, pas le nombre de cœurs.** Le débit dépend du mono-cœur. Vérifier que le VPS a de bonnes performances single-core ; surveiller le CPU lors des premières échéances réelles.
2. **Rafale de connexions (échéances) — à surveiller d'abord, optimiser si besoin.** Si des échéances réelles réunissent des centaines de connexions en quelques secondes, options par coût croissant :
   - accepter la file d'attente (les sessions durent 8 h, la rafale est bornée) ;
   - déporter `bcrypt` sur des *worker threads* pour libérer la boucle d'événements ;
   - passer Node en mode *cluster* (plusieurs workers) derrière nginx. **Attention** : plusieurs processus écrivant le même fichier SQLite peuvent se heurter (`SQLITE_BUSY`) — à valider par un test avant d'adopter, ou réserver le cluster aux lectures.
3. **Lecture `/state` = endpoint le plus chaud** (toutes les clés `pkv`). La révision (`rev`) est déjà suivie : un cache par révision éviterait de tout relire à chaque appel. Priorité basse vu la marge actuelle.
4. **Avant un lancement majeur** : rejouer une **endurance de plusieurs heures** pour écarter une fuite lente, et refaire le pic de dépôt sur le VPS cible (pas seulement en local).
5. **Scénarios versionnés** dans `tests/charge/` : rejouer après toute optimisation pour comparer.

## Reproduire

```bash
# 1. base de volume réaliste
docker run --rm -e DB_FILE=/data/load.db -e MARCHES_PUBLICS=1 -e N_SOUM=600 -e N_INTERNE=60 \
  -v mp-charge-data:/data -v "$PWD:/app" -w /app node:22 node tests/charge/seed-load.js
# 2. instance cible
docker run -d --name mp-charge-app --network mp-charge -e DB_FILE=/data/load.db -e MARCHES_PUBLICS=1 \
  -e NODE_ENV=charge -e LOGIN_RATE_LIMIT=10000000 -e SAUVEGARDE_HEURES=0 -e RAPPELS=0 \
  -v mp-charge-data:/data -v "$PWD:/app" -w /app node:22 node server/index.js
# 3. essais (PROFILE = baseline | load | stress | soak ; deposit.js pour le pic)
docker run --rm --network mp-charge -v "$PWD/tests/charge:/scripts" -e PROFILE=load grafana/k6 run /scripts/office.js
docker run --rm --network mp-charge -v "$PWD/tests/charge:/scripts" -e VUS=300 -e ITER=600 grafana/k6 run /scripts/deposit.js
```

## Hors couverture

Ce volet mesure le comportement du **code** sous charge. Il ne mesure pas le dimensionnement exact du VPS (hôte de test différent), ni la couche réseau/nginx réelle, ni une endurance de longue durée. Le pentest du jour (`docs/pentest-2026-10-08.md`) couvre la sécurité ; la suite de 180 tests couvre la correction fonctionnelle.
