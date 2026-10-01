#!/usr/bin/env bash
# Synchronise les fichiers de jeu (trop lourds pour git) vers le VPS.
# Usage : ./deploy-games.sh [user@host] [remote-path]
#
# Exemples :
#   ./deploy-games.sh ubuntu@mon-vps.com /var/www/lequizz
#   ./deploy-games.sh                    (utilise les valeurs par défaut ci-dessous)

REMOTE_USER_HOST="${1:-ubuntu@mon-vps.com}"
REMOTE_APP_PATH="${2:-/var/www/lequizz}"

echo "→ Synchronisation de games/ vers $REMOTE_USER_HOST:$REMOTE_APP_PATH/games/"

rsync -avz --progress \
  --exclude="*.exe" \
  --exclude="*.dll" \
  --exclude="*.pak" \
  --exclude="locales/" \
  --exclude="node_modules/" \
  games/mjlc/resources/app/ \
  "$REMOTE_USER_HOST:$REMOTE_APP_PATH/games/mjlc/resources/app/"

echo "✓ Terminé."
