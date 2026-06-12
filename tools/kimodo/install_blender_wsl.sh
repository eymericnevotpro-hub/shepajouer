#!/usr/bin/env bash
# Installe Blender 4.2 LTS (portable) + libs runtime dans WSL, pour le retarget headless.
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
# libs dont Blender a besoin même en --background
apt-get install -y --no-install-recommends \
  libxi6 libxxf86vm1 libxfixes3 libxrender1 libxkbcommon0 libsm6 \
  libgl1 libglu1-mesa libegl1 xz-utils wget ca-certificates
mkdir -p /opt/blender && cd /opt/blender
VER=4.2.3
if [ ! -x /opt/blender/blender-${VER}-linux-x64/blender ]; then
  wget -q https://download.blender.org/release/Blender4.2/blender-${VER}-linux-x64.tar.xz
  tar xf blender-${VER}-linux-x64.tar.xz
  rm -f blender-${VER}-linux-x64.tar.xz
fi
ln -sf /opt/blender/blender-${VER}-linux-x64/blender /usr/local/bin/blender
echo "blender installed:"; blender --version 2>&1 | head -1
echo "DONE_BLENDER_INSTALL"
