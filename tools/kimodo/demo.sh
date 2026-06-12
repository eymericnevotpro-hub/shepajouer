#!/usr/bin/env bash
# Lance le DEMO interactif Kimodo (viewer 3D fond blanc) sur http://localhost:7860
# Aucun token HF requis (mode hors-ligne via le mirror public déjà en cache).
# Laisse ce terminal OUVERT tant que tu utilises le demo.
export PATH="$HOME/.local/bin:$PATH"
cd /root/kimodo && source .venv/bin/activate
export HF_HUB_OFFLINE=1 LOCAL_CACHE=true TEXT_ENCODER_DEVICE=cuda
echo ">> Ouvre http://localhost:7860 dans ton navigateur Windows"
kimodo_demo
