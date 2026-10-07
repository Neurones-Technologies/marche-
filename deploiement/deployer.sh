#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# DÉPLOIEMENT MARCHÉ+ — À EXÉCUTER SUR LE VPS, pas sur un poste de travail.
#
# Usage :   sudo bash deployer.sh
#
# Idempotent : relançable autant de fois qu'on veut. Il met à jour le code,
# reconstruit l'image et redémarre le conteneur. La base SQLite vit dans le volume
# Docker `marcheplus-data` : elle survit aux redéploiements.
#
# ── CE QU'IL NE FAIT PAS, ET POURQUOI (même logique que hr360)
#
# · Il ne touche PAS au nginx de l'hôte. Le vhost se pose une fois, à la main
#   (voir nginx-hote-marcheplus.conf) : ce nginx sert d'autres applications.
# · Il ne demande PAS de certificat : `certbot --nginx` se lance à la main, une
#   fois, quand le domaine pointe sur la machine.
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

DEPOT="${DEPOT:-https://github.com/Neurones-Technologies/marche-.git}"
BRANCHE="${BRANCHE:-main}"
CIBLE="${CIBLE:-/opt/marcheplus}"
COMPOSE="docker compose -f docker-compose.yml"

dire() { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
echouer() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || echouer "docker est absent."
docker compose version >/dev/null 2>&1 || echouer "le plugin « docker compose » est absent."

# ── 1. Le code ────────────────────────────────────────────────────────────────
if [ -d "$CIBLE/.git" ]; then
  dire "Mise à jour du code dans $CIBLE"
  git -C "$CIBLE" fetch --depth 1 origin "$BRANCHE"
  git -C "$CIBLE" reset --hard "origin/$BRANCHE"
else
  dire "Clonage dans $CIBLE"
  mkdir -p "$(dirname "$CIBLE")"
  git clone --depth 1 --branch "$BRANCHE" "$DEPOT" "$CIBLE"
fi
cd "$CIBLE"

# ── 2. Le .env de production ──────────────────────────────────────────────────
# Généré UNE FOIS puis jamais réécrit : changer JWT_SECRET déconnecterait tout le
# monde, et SEED_PASSWORD n'agit qu'au premier amorçage de la base.
if [ ! -f .env ]; then
  dire "Création du .env de production (secrets tirés au hasard, jamais affichés)"
  {
    echo "JWT_SECRET=$(openssl rand -hex 32)"
    echo "JWT_TTL=8h"
    # 3610 : à côté de la série 360x de hr360, hors de la série 808x de la machine.
    echo "HTTP_PORT=${HTTP_PORT:-3610}"
    echo "HTTP_BIND=${HTTP_BIND:-127.0.0.1}"
    # Démonstration : comptes fictifs, mais mot de passe ALÉATOIRE. Celui du README
    # est public sur GitHub — avec lui, n'importe qui serait administrateur.
    echo "SEED_DEMO=${SEED_DEMO:-1}"
    echo "SEED_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=')"
    echo "ALLOW_RESET=${ALLOW_RESET:-1}"
    echo "MAX_FILE_MB=10"
    # Liens envoyés par courriel ; envoi réel par Microsoft 365 : renseigner MAIL_MODE=graph et
    # M365_* (voir README, « Courriels »). Tant qu'ils manquent, les courriels restent simulés.
    echo "APP_URL=${APP_URL:-https://tenders.neuronestech.com}"
    echo "MAIL_MODE=simule"
  } > .env
  chmod 600 .env
else
  dire "Le .env existe déjà — conservé tel quel"
fi

DOUBLONS=$(grep -oE '^[A-Z_][A-Z0-9_]*=' .env | sort | uniq -d | tr -d '=')
if [ -n "$DOUBLONS" ]; then
  printf '\033[1;33m⚠ Clés EN DOUBLE dans .env — Compose retient la DERNIÈRE : %s\033[0m\n' "$DOUBLONS"
fi

# ── 3. Construction et démarrage ──────────────────────────────────────────────
dire "Construction de l'image"
$COMPOSE build

dire "Démarrage"
$COMPOSE up -d --remove-orphans

dire "Attente du conteneur"
for i in $(seq 1 60); do
  etat=$($COMPOSE ps --format '{{.Health}}' marcheplus)
  [ "$etat" = "healthy" ] && break
  [ "$i" = "60" ] && { $COMPOSE logs --tail 40; echouer "le conteneur n'est pas devenu sain."; }
  sleep 2
done
printf '  Application saine.\n'

# ── 4. Ce qui reste à faire À LA MAIN ─────────────────────────────────────────
cat <<'FIN'

────────────────────────────────────────────────────────────────────────────────
APPLICATION DÉMARRÉE. À faire à la main, une seule fois :

1. VHOST NGINX (après avoir renseigné server_name dans le fichier) :
     cp /opt/marcheplus/deploiement/nginx-hote-marcheplus.conf /etc/nginx/sites-available/marcheplus
     ln -sf /etc/nginx/sites-available/marcheplus /etc/nginx/sites-enabled/marcheplus
     nginx -t && systemctl reload nginx

2. TLS, dès que le sous-domaine pointe sur cette machine :
     certbot --nginx -d <sous-domaine>
   SANS HTTPS, LA CONNEXION NE TIENT PAS : le cookie de session est marqué
   « Secure » en production, le navigateur le refuse sur http://.

3. Mot de passe des comptes de démonstration :
     grep SEED_PASSWORD /opt/marcheplus/.env

4. SAUVEGARDES du volume `marcheplus-data` (base + pièces jointes) : à écrire.
────────────────────────────────────────────────────────────────────────────────
FIN
