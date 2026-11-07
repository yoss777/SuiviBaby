#!/usr/bin/env bash
# scripts/checkSiteTodos.sh
# S10.2 — Garde-fou avant déploiement du site (firebase deploy --only hosting).
#
# Échoue (code 1) si une page de public/ contient encore une case
# « À compléter » (<span class="todo">). Usage, depuis la racine du dépôt :
#   bash scripts/checkSiteTodos.sh
set -euo pipefail

cd "$(dirname "$0")/.."

total=0
for f in public/*.html; do
  # grep -c renvoie 1 quand il n'y a aucune correspondance : on neutralise.
  n=$(grep -c 'class="todo"' "$f" || true)
  if [ "$n" -gt 0 ]; then
    echo "✗ $f : $n case(s) à compléter"
    grep -n 'class="todo"' "$f" | cut -c1-160 | sed 's/^/    ligne /'
    total=$((total + n))
  fi
done

if [ "$total" -gt 0 ]; then
  echo "Déploiement bloqué : $total case(s) « À compléter » restante(s) dans public/."
  exit 1
fi
echo "✓ Aucune case « À compléter » dans public/*.html."
