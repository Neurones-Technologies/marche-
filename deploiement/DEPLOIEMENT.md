# Déploiement de Marché+ sur le VPS

Procédure de mise en ligne de Marché+ sur `srv1763669` (76.13.51.87), sur le même modèle que hr360 :
un conteneur Docker lié à la boucle locale, derrière le nginx de l'hôte, avec un certificat Let's Encrypt.

| | |
|---|---|
| Adresse publique | https://tenders.neuronestech.com |
| Dépôt | https://github.com/Neurones-Technologies/marche-.git (public), branche `main` |
| Dossier sur le VPS | `/opt/marcheplus` |
| Conteneur | `marcheplus-marcheplus-1`, écoute sur `127.0.0.1:3610` |
| Données | volume Docker `marcheplus-data` (base SQLite + pièces jointes) |
| Vhost nginx | `/etc/nginx/sites-available/marcheplus` |
| Certificat | `/etc/letsencrypt/live/tenders.neuronestech.com/` |

## Architecture

```
navigateur ──► nginx de l'hôte (ports 80 / 443, TLS)
                   │  server_name tenders.neuronestech.com
                   ▼
             127.0.0.1:3610 ──► conteneur marcheplus (Node 22, port 3000)
                                      │
                                      ▼
                               volume marcheplus-data (/data)
```

Le nginx de l'hôte sert déjà d'autres applications (hr360, neurones-ia, ao…). Marché+ **ne prend pas**
le port 80 : il ajoute un bloc `server` dans ce nginx, reconnu par son `server_name`. Le conteneur
n'écoute que sur `127.0.0.1`, il n'est donc pas joignable directement depuis Internet.

## Fichiers du dépôt

| Fichier | Rôle |
|---|---|
| `Dockerfile` | Image Node 22. L'étape de construction installe `python3 make g++` : `better-sqlite3` compile son module natif à l'installation. |
| `docker-compose.yml` | Publie le port sur `${HTTP_BIND:-127.0.0.1}:${HTTP_PORT:-3000}`. Les secrets viennent du `.env`. |
| `deploiement/deployer.sh` | Script idempotent à lancer **sur le VPS** : clone ou met à jour le code, crée le `.env` une fois, construit, démarre, attend l'état « healthy ». |
| `deploiement/nginx-hote-marcheplus.conf` | Vhost à copier une fois dans le nginx de l'hôte. |
| `.gitattributes` | Force les fins de ligne LF sur `.sh` et `.conf` (sinon bash échoue sur le VPS). |

## Premier déploiement

### 1. Vérifier le DNS

L'enregistrement A du sous-domaine doit pointer sur l'IP du VPS **avant** de demander le certificat.

```bash
curl -4 ifconfig.me                                   # IP du VPS : 76.13.51.87
dig +short tenders.neuronestech.com @8.8.8.8          # doit renvoyer la même IP
```

### 2. Récupérer le code et lancer le script

Sur le VPS, en `root` :

```bash
git clone https://github.com/Neurones-Technologies/marche-.git /opt/marcheplus
sudo bash /opt/marcheplus/deploiement/deployer.sh
```

Le script :
- crée `/opt/marcheplus/.env` **une seule fois** (`chmod 600`) avec `JWT_SECRET` et `SEED_PASSWORD`
  tirés au hasard, `HTTP_PORT=3610`, `HTTP_BIND=127.0.0.1`, `SHOW_DEMO_ACCOUNTS=0` ;
- signale les clés en double dans le `.env` (Compose retient la dernière) ;
- construit l'image, démarre le conteneur et attend qu'il soit sain.

Ne jamais supprimer ni régénérer le `.env` d'une instance en service : changer `JWT_SECRET`
déconnecte tout le monde, et `SEED_PASSWORD` n'agit qu'au premier amorçage de la base.

### 3. Poser le vhost nginx

```bash
cp /opt/marcheplus/deploiement/nginx-hote-marcheplus.conf /etc/nginx/sites-available/marcheplus
ln -sf /etc/nginx/sites-available/marcheplus /etc/nginx/sites-enabled/marcheplus
grep -n "listen\|server_name" /etc/nginx/sites-available/marcheplus
nginx -t && systemctl reload nginx
```

Le `grep` doit montrer **`listen 80;`** et `server_name tenders.neuronestech.com;`.
Le port 3610 n'apparaît que dans le bloc `upstream` (`server 127.0.0.1:3610;`), jamais dans `listen`.

Avant d'activer, vérifier qu'aucun autre vhost ne revendique le même nom :

```bash
grep -rn "tenders" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/
```

### 4. Certificat TLS

```bash
certbot --nginx -d tenders.neuronestech.com
```

Accepter la redirection HTTP → HTTPS. Si un certificat existe déjà pour ce nom (`certbot certificates`),
le brancher sans en redemander un :

```bash
certbot install --nginx --cert-name tenders.neuronestech.com
```

**Sans HTTPS, la connexion ne fonctionne pas** : en production, le cookie de session est marqué
`Secure`, et le navigateur le refuse sur `http://`.

### 5. Vérifier

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3610/healthz              # 200 : l'application répond
curl -s -o /dev/null -w "%{http_code}\n" https://tenders.neuronestech.com/healthz   # 200 : nginx + TLS OK
grep SEED_PASSWORD /opt/marcheplus/.env                                             # mot de passe des comptes de démo
```

Puis se connecter sur https://tenders.neuronestech.com, par exemple avec `y.koffi@bal.ci`
(responsable des achats) et le mot de passe lu ci-dessus.

## Mises à jour

1. Sur le poste de travail : committer et pousser sur `main`.
2. Sur le VPS :

```bash
sudo bash /opt/marcheplus/deploiement/deployer.sh
```

Le script récupère `origin/main` (`git reset --hard` : toute modification faite à la main dans
`/opt/marcheplus` est écrasée, sauf le `.env` qui n'est pas suivi par git). La base est conservée
dans le volume.

**Courriels (Microsoft 365)** : le `.env` existant n'est jamais réécrit. Pour activer l'envoi réel, y ajouter à la
main `APP_URL`, `MAIL_MODE=graph` et les variables `M365_*` (procédure dans le README, « Courriels »), puis relancer
le script. Garder `chmod 600` sur le `.env` : il contient alors le secret de l'application Entra ID.

**IA de préparation (Claude, Anthropic)** : ajouter `ANTHROPIC_API_KEY=<clé>` au `.env` (clé créée sur platform.claude.com),
puis relancer le script. Les documents chargés et les idées saisies sont envoyés à l'API d'Anthropic pour rédiger la
proposition. Une demande coûte de l'ordre de 0,05 à 0,30 $ ; `IA_PAR_HEURE` (30 par défaut) limite les demandes par compte.
La proposition est rendue en tâche de fond (le navigateur interroge son état) : aucun réglage du délai de nginx n'est requis.

**Mise à jour de la version d'avant les procédures multiples** : les migrations reprennent les données au démarrage
(procédure p1, rôles et habilitations, fiches partenaires). Sauvegarder d'abord le volume (voir « Exploitation »).

Si le vhost change dans le dépôt, le recopier à la main (étape 3) : le script ne touche jamais au nginx
de l'hôte. Attention, le fichier installé contient alors les blocs ajoutés par certbot : sauvegarder
l'existant avant de l'écraser, puis relancer `certbot install --nginx --cert-name tenders.neuronestech.com`.

## Exploitation

```bash
cd /opt/marcheplus
docker compose -f docker-compose.yml ps           # état du conteneur
docker compose -f docker-compose.yml logs -f      # journaux
docker compose -f docker-compose.yml restart      # redémarrage
```

Paramètres du `.env` utiles :

| Clé | Valeur | Effet |
|---|---|---|
| `SEED_DEMO` | `1` | Crée les comptes de démonstration si la base est vide. `0` en production réelle (comptes à créer par `POST /api/auth/users`). |
| `SHOW_DEMO_ACCOUNTS` | `0` | **Ne jamais mettre `1` sur Internet** : l'écran de connexion afficherait le mot de passe. |
| `ALLOW_RESET` | `1` | Bouton « Réinitialiser la démo » (réservé aux droits paramètres/rôles). `0` pour le désactiver. |
| `MAX_FILE_MB` | `10` | Taille maximale d'une pièce jointe. Garder `client_max_body_size` du vhost au-dessus. |

Après modification du `.env` : `docker compose -f docker-compose.yml up -d`.

## Plateforme multi-entreprises (sous-domaines)

Avec `PLATEFORME_DOMAINE=tenders.neuronestech.com`, chaque entreprise a son espace à son sous-domaine
(`bal.tenders.neuronestech.com`), avec sa base et ses pièces dans `/data/espaces/<sous-domaine>/`. L'adresse
racine sert la page « Créer votre espace ». L'installation existante devient l'espace `demo`
(`ESPACE_INITIAL`) sans rien perdre : sa base reste `/data/marcheplus.db`. Le registre des espaces est
`/data/plateforme.db`.

Mise en place, une fois (**sauvegarder le volume avant**) :

1. **DNS** : une entrée générique `*.tenders.neuronestech.com` de type A vers `76.13.51.87` (en plus de
   l'entrée `tenders.neuronestech.com` existante), chez l'hébergeur du domaine `neuronestech.com`.
2. **Certificat générique** : Let's Encrypt n'en délivre qu'avec un défi DNS. Soit avec le greffon certbot de
   l'hébergeur DNS (`certbot certonly --dns-<hebergeur> -d tenders.neuronestech.com -d '*.tenders.neuronestech.com'`),
   soit à la main : `certbot certonly --manual --preferred-challenges dns -d tenders.neuronestech.com -d '*.tenders.neuronestech.com'`
   puis poser l'enregistrement TXT `_acme-challenge.tenders.neuronestech.com` demandé (le renouvellement manuel
   est à refaire tous les 90 jours : préférer le greffon).
3. **nginx** : `server_name tenders.neuronestech.com *.tenders.neuronestech.com;` dans le vhost, certificat du point
   2 sur le bloc 443. `proxy_set_header Host $host;` est indispensable (l'application lit le sous-domaine) ;
   il y est déjà.
4. **.env** : `PLATEFORME_DOMAINE=tenders.neuronestech.com`, `APP_URL=https://tenders.neuronestech.com` ; puis
   `docker compose -f docker-compose.yml up -d`.
5. **Vérifier** : `https://tenders.neuronestech.com` affiche « Créer votre espace » ; `https://demo.tenders.neuronestech.com`
   ouvre l'installation existante (mêmes comptes).

**Console des opérateurs** : `https://tenders.neuronestech.com/console`. Une inscription en ligne, son courriel
confirmé, y attend l'accord d'un opérateur (accepter ou refuser avec un motif) ; on y crée aussi un espace à la main,
on suspend, réactive ou supprime un espace (suppression : espace suspendu d'abord, adresse ressaisie ; jamais l'espace
`demo`), on gère les opérateurs, et un journal garde chaque action avec l'adresse IP. Le premier opérateur vient du
.env : `CONSOLE_EMAIL`, `CONSOLE_NOM`, `CONSOLE_MOT_DE_PASSE` (lu une seule fois, quand aucun opérateur n'existe ;
changer ensuite le mot de passe dans la console). `PLATEFORME_VALIDATION=auto` ouvre les espaces sans validation.

Tant que Microsoft 365 n'est pas configuré (`MAIL_MODE=graph`), le lien de confirmation d'un nouvel espace est
affiché directement à l'écran au lieu d'être envoyé : n'importe qui peut alors créer un espace. À réserver à la
démonstration ; configurer les courriels avant d'ouvrir la plateforme au public. Limite :
`PLATEFORME_CREATIONS_PAR_HEURE` (5 par adresse IP et par heure).

## Problèmes rencontrés lors du premier déploiement

| Symptôme | Cause | Correction |
|---|---|---|
| `required variable JWT_SECRET is missing a value` (en local) | Pas de `.env`. | Créer un `.env` avec `JWT_SECRET`. Sur le VPS, le script le fait. |
| `failed to connect to the docker API … dockerDesktopLinuxEngine` (en local) | Docker Desktop non démarré. | Lancer Docker Desktop, attendre « Engine running », vérifier avec `docker info`. |
| `npm ci` échoue, `gyp ERR! find Python` | `better-sqlite3` 13 compile son module natif ; `node:22-slim` n'a ni Python ni compilateur. | Ajout de `python3 make g++` à l'étape de construction du `Dockerfile`. |
| `npm ci` échoue sous Windows avec Node 24 | Même module, pas de binaire précompilé pour cette version. | Utiliser Node 22 en local, ou Docker. |
| certbot : `Timeout during connect (likely firewall problem)` | Le sous-domaine essayé pointait vers une autre IP (89.116.30.238) que le VPS. | Vérifier le DNS (étape 1). Le bon nom était `tenders`. |
| Le site ne répond pas sur le domaine | Vhost modifié à la main avec `listen 3610;` : nginx n'écoutait pas sur 80, et 3610 est déjà pris par le conteneur. | Remettre `listen 80;` et `listen [::]:80;`. |

## Points de vigilance

- **Dépôt public** : ne jamais committer de `.env`, de clé ou de mot de passe. Le mot de passe de démo
  `Marche+2026!` figure dans le README ; le VPS ne l'utilise pas (`SEED_PASSWORD` aléatoire).
- **Sauvegardes : non mises en place.** Le volume `marcheplus-data` contient la base et les pièces jointes.
  Une sauvegarde n'est valable qu'après une restauration réussie au moins une fois.
- **Vhost `ao`** : un autre vhost d'appels d'offres existe sur la machine. Vérifier qu'il ne revendique pas
  `tenders.neuronestech.com` (`grep -n server_name /etc/nginx/sites-available/ao`).
- **Données de démonstration uniquement** : la plateforme ne gère qu'une procédure fictive (AO-2026-014),
  l'IA et les courriels sont simulés. Pas de données réelles de client tant que ces limites existent.
