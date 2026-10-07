# Sauvegardes

Marché+ sauvegarde lui-même ses données. La sauvegarde a lieu toutes les 24 heures. La première est faite deux
minutes après le démarrage si aucune n'est assez récente. Le code est dans `server/sauvegardes.js`.

## Ce qui est sauvegardé

Les sauvegardes sont rangées dans `SAUVEGARDE_DOSSIER`. En conteneur, c'est le volume `marcheplus-sauvegardes`,
monté sur `/sauvegardes` et distinct du volume des données.

| Emplacement | Contenu |
|---|---|
| `<date>/<espace>.db` | Copie de la base de chaque espace : procédures, offres, commandes, comptes, journal d'audit. |
| `<date>/plateforme.db` | Copie du registre des espaces : opérateurs, inscriptions, journal de la console. |
| `<date>/manifeste.json` | Pour chaque base : date, déclencheur, durée, emplacement d'origine (`source`, `pieces`), taille, empreinte SHA-256 et résultat de la vérification (`integrite`). |
| `fichiers/<espace>/` | Pièces déposées : offres, mémoires, pièces de référencement. Chaque pièce est copiée une seule fois, car elle ne change jamais. |

Chaque copie de base est faite à chaud, avec l'API de sauvegarde de SQLite. Elle est donc cohérente même pendant
l'utilisation. La copie est ensuite rouverte en lecture et vérifiée avec `PRAGMA integrity_check`. Une sauvegarde
dont une base échoue à cette vérification porte le statut `anomalie`.

Seules les `SAUVEGARDE_CONSERVER` dernières sauvegardes sont gardées (14 par défaut).

## Réglages (`.env`)

| Clé | Défaut | Effet |
|---|---|---|
| `SAUVEGARDE_HEURES` | `24` | Intervalle entre deux sauvegardes. `0` désactive les sauvegardes automatiques. |
| `SAUVEGARDE_CONSERVER` | `14` | Nombre de sauvegardes conservées. |
| `SAUVEGARDE_DOSSIER` | `/sauvegardes` en conteneur | Dossier de destination. |

## Suivi

- **Console** (`/console`, onglet « Sauvegardes ») : chaque sauvegarde avec son statut, sa taille et son
  déclencheur. Le bouton « Sauvegarder maintenant » lance une sauvegarde, inscrite au journal de la console.
- **Paramètres d'un espace** : l'administrateur voit la date de la dernière sauvegarde et le résultat de la
  vérification de sa propre base.

## Copie hors du serveur

Le volume des sauvegardes est sur le même disque que les données. Il protège contre une erreur de manipulation ou
une base abîmée, mais pas contre la perte du serveur. Il faut donc copier régulièrement les sauvegardes ailleurs.
Par exemple, une tâche cron sur l'hôte, chaque nuit :

```bash
# /etc/cron.d/marcheplus-sauvegardes : copie locale puis envoi vers un autre serveur
30 3 * * * root docker run --rm -v marcheplus_marcheplus-sauvegardes:/s:ro -v /srv/sauvegardes-marcheplus:/out alpine sh -c 'cp -a /s/. /out/' && rsync -a --delete /srv/sauvegardes-marcheplus/ sauvegarde@autre-serveur:/sauvegardes/marcheplus/
```

Le nom exact du volume s'affiche avec `docker volume ls | grep sauvegardes`. Le préfixe est le nom du dossier
du projet.

## Restaurer

Les commandes ci-dessous supposent le projet installé dans `/opt/marcheplus` (volumes `marcheplus_…`).

1. **Arrêter l'application** :
   ```bash
   cd /opt/marcheplus && docker compose -f docker-compose.yml stop
   ```
2. **Choisir la sauvegarde** et lire son manifeste. Il indique, pour chaque espace, où remettre la base (`source`)
   et les pièces (`pieces`) :
   ```bash
   docker run --rm -v marcheplus_marcheplus-sauvegardes:/s alpine sh -c 'ls /s; cat /s/<date>/manifeste.json'
   ```
3. **Remettre la base**. L'exemple ci-dessous concerne l'espace `demo`, dont la `source` est `/data/marcheplus.db`.
   Il faut supprimer les fichiers `-wal` et `-shm` de l'ancienne base :
   ```bash
   docker run --rm -v marcheplus_marcheplus-sauvegardes:/s -v marcheplus_marcheplus-data:/data alpine sh -c \
     'cp /s/<date>/demo.db /data/marcheplus.db && rm -f /data/marcheplus.db-wal /data/marcheplus.db-shm && chown 1000:1000 /data/marcheplus.db'
   ```
   Pour un autre espace, remettre `<espace>.db` à sa `source` (`/data/espaces/<espace>/…`). Pour le registre de
   la plateforme, remettre `plateforme.db` à `/data/plateforme.db`.
4. **Remettre les pièces manquantes** (`-n` : sans écraser celles qui sont présentes) :
   ```bash
   docker run --rm -v marcheplus_marcheplus-sauvegardes:/s -v marcheplus_marcheplus-data:/data alpine sh -c \
     'cp -n /s/fichiers/demo/* <pieces> && chown -R 1000:1000 <pieces>'
   ```
5. **Redémarrer** et vérifier dans l'application. Le journal d'audit d'un espace se contrôle depuis son écran
   « Audit », qui vérifie la chaîne d'empreintes.
   ```bash
   docker compose -f docker-compose.yml up -d
   ```

Il faut tester une restauration au moins une fois, sur un serveur de recette. C'est la seule façon de savoir que
les sauvegardes sont utilisables.
