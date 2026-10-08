# Tests de charge et de stress (k6)

Scénarios versionnés pour rejouer la campagne charge/stress sur une **instance locale jetable**
(jamais la production). Voir le rapport `docs/tests-charge-2026-10-08.md` pour la démarche, les
résultats et les commandes de reproduction complètes.

- `seed-load.js` — prépare une base de volume réaliste (démo + N comptes, procédure p1 publiée ouverte).
- `office.js` — parcours « bureau » (lecture). `PROFILE` = baseline | load | stress | soak.
- `deposit.js` — parcours « dépôt avant échéance » (pic d'écritures). `VUS`, `ITER`.

Objectifs (SLO) : p95 < 600 ms sous charge attendue, erreurs < 1 %.
