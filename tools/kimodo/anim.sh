#!/usr/bin/env bash
# Génère une animation Kimodo (SOMA) et exporte un BVH prêt pour le retarget.
# Usage :  bash anim.sh "a cowboy tips his hat" tiphat 3.0
#   $1 = prompt texte | $2 = nom du fichier | $3 = durée en secondes (défaut 3)
set -e
cd /root/kimodo && source .venv/bin/activate
PROMPT="${1:?donne un prompt}"; NAME="${2:-clip}"; DUR="${3:-3.0}"
OUTDIR="/mnt/c/Users/BRICKOUILLE/Documents/ShepaJouer/tools/kimodo/out"
mkdir -p "$OUTDIR"
echo ">> génération : \"$PROMPT\" ($DUR s) -> $NAME"
kimodo_gen "$PROMPT" \
  --model Kimodo-SOMA-RP-v1 \
  --duration "$DUR" \
  --bvh --bvh_standard_tpose \
  --output "$OUTDIR/$NAME"
echo ">> OK : $OUTDIR/${NAME}_00.bvh"
