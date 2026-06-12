#!/usr/bin/env bash
# Installe les dépendances du DEMO interactif Kimodo (viewer viser + corps SOMA).
set -e
export PATH="$HOME/.local/bin:$PATH"
cd /root/kimodo && source .venv/bin/activate
uv pip install -e ".[all]"
echo "DONE_DEMO_EXTRAS"
