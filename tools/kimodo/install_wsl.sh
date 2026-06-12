#!/usr/bin/env bash
# Installe Kimodo dans WSL/Ubuntu sur un Python 3.12 dédié + PyTorch CUDA 12.8
# (compatible RTX 5090 / Blackwell). À lancer en root :
#   wsl -d Ubuntu -u root -- bash /mnt/c/Users/BRICKOUILLE/Documents/ShepaJouer/tools/kimodo/install_wsl.sh
set -e
export DEBIAN_FRONTEND=noninteractive
export PATH="$HOME/.local/bin:$PATH"

echo "==[1/6] apt deps=="
apt-get update -y
apt-get install -y cmake build-essential git curl ca-certificates pkg-config

echo "==[2/6] uv (gestionnaire Python)=="
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
export PATH="$HOME/.local/bin:$PATH"
uv --version

echo "==[3/6] Python 3.12=="
uv python install 3.12

echo "==[4/6] venv dans /root/kimodo/.venv=="
cd /root/kimodo
uv venv --python 3.12 .venv
source .venv/bin/activate

echo "==[5/6] PyTorch CUDA 12.8 (Blackwell)=="
uv pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128

echo "==[6/6] Kimodo (base + huggingface_hub)=="
uv pip install -e .
uv pip install --upgrade huggingface_hub

echo "==CHECK TORCH/GPU=="
python -c "import torch; print('torch', torch.__version__); print('cuda available:', torch.cuda.is_available()); print('device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NONE')"
echo "==CHECK KIMODO IMPORT=="
python -c "import kimodo; print('kimodo OK')" || echo "kimodo import FAILED"
echo "DONE_KIMODO_INSTALL"
