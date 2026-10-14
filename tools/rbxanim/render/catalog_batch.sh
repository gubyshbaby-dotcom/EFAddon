#!/usr/bin/env bash
# Render single animations listed as "category|id" lines (../catalog.py output): out/catalog/<category>/<id>/render.mp4 + sheet.png
# usage: catalog_batch.sh <json dir> <list file> [fps] [jobs]
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; D="$1"; LIST="$2"; FPS="${3:-30}"; JOBS="${4:-3}"
export PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers} HERE D FPS
one() {
  IFS='|' read -r cat id <<< "$1"
  out="$HERE/out/catalog/$cat/$id"
  [ -f "$out/render.mp4" ] && return
  node "$HERE/render.mjs" --data "$D" --out "$out" --fps "$FPS" --size 640x400 --cams solo --sheet 24 \
    --label "[$cat] ${id%%__*}" --actor "$id" 2>&1 | grep -E "rror" | sed "s/^/[$id] /"
}
export -f one
grep -v '^#' "$LIST" | grep -v '^\s*$' | xargs -P "$JOBS" -I{} bash -c 'one "$@"' _ {}
