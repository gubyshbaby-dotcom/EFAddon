#!/usr/bin/env bash
# Copy the vanilla textures the renderer needs (default skins, grass) from a local Minecraft client jar into ./tex.
# They are Mojang assets: kept out of git. usage: fetch_tex.sh [client.jar]
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
JAR="${1:-$(ls ~/.gradle/caches/fabric-loom/*/minecraft-client.jar ~/.gradle/caches/neoformruntime/*/*client*.jar 2>/dev/null | head -1)}"
mkdir -p "$HERE/tex"; T=$(mktemp -d)
unzip -q -o "$JAR" 'assets/minecraft/textures/entity/player/*' 'assets/minecraft/textures/block/grass_block_top.png' -d "$T"
for k in wide slim; do for f in "$T"/assets/minecraft/textures/entity/player/$k/*.png; do cp "$f" "$HERE/tex/${k}_$(basename "$f")"; done; done
cp "$T/assets/minecraft/textures/block/grass_block_top.png" "$HERE/tex/"
rm -rf "$T"; ls "$HERE/tex" | wc -l
