#!/usr/bin/env bash
# TOUT-EN-UN : texte -> animation Kimodo -> retarget -> GLB prêt pour le jeu.
# (Aucun token Hugging Face requis : on utilise le mirror public du Llama, déjà en cache.)
#
# Usage, dans un terminal Ubuntu :
#   bash /mnt/c/Users/BRICKOUILLE/Documents/ShepaJouer/tools/kimodo/make_emote.sh "a cowboy tips his hat" tiphat 3.0
#     $1 = prompt anglais | $2 = nom (sans espace) | $3 = durée s (défaut 3)
set -e
PROMPT="${1:?donne un prompt en anglais}"; NAME="${2:?donne un nom de fichier}"; DUR="${3:-3.0}"
ROOT=/mnt/c/Users/BRICKOUILLE/Documents/ShepaJouer
cd /root/kimodo && source .venv/bin/activate
export HF_HUB_OFFLINE=1 LOCAL_CACHE=true TEXT_ENCODER_DEVICE=cuda
mkdir -p "$ROOT/tools/kimodo/out"

echo ">> [1/2] Génération Kimodo : \"$PROMPT\" ($DUR s)"
kimodo_gen "$PROMPT" --model Kimodo-SOMA-RP-v1 --duration "$DUR" \
  --bvh --bvh_standard_tpose --output "$ROOT/tools/kimodo/out/$NAME"

echo ">> [2/2] Retarget -> assets/marshmallow_$NAME.glb"
blender --background --python "$ROOT/tools/kimodo/retarget_marshmallow.py" -- \
  "$ROOT/tools/kimodo/out/${NAME}.bvh" "$ROOT/assets/marshmallow_$NAME.glb"

echo ""
echo "============================================================"
echo " FINI ! Ajoute cette ligne dans EMOTES (src/character.js) :"
echo "   { key: \"2\", name: \"$NAME\", url: \"assets/marshmallow_$NAME.glb\", dur: $DUR },"
echo "============================================================"
