#!/usr/bin/env bash
# Render every pair in pairs.txt (3 in parallel): out/pairs/<NN>_<title>/render.mp4 (side | 3/4 front) + sheet.png.
# usage: batch.sh <json dir> [fps] [jobs]
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; D="$1"; FPS="${2:-30}"; JOBS="${3:-3}"
export PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers} HERE D FPS
one() {
  IFS='|' read -r n u v title <<< "$1"
  u=$(echo $u); v=$(echo $v); title=$(echo $title)
  uf=$(ls "$D" | grep "^$u" | head -1); vf=$(ls "$D" | grep "^$v" | head -1)
  if [ -z "$uf" ] || [ -z "$vf" ]; then echo "skip $title ($u / $v)"; return; fi
  slug=$(printf '%02d_%s' "$n" "$(echo "$title" | tr ' /()' '____' | tr -cd 'A-Za-z0-9_-')")
  [ -f "$HERE/out/pairs/$slug/render.mp4" ] && { echo "[$slug] exists"; return; }
  node "$HERE/render.mjs" --data "$D" --out "$HERE/out/pairs/$slug" --fps "$FPS" --size 960x540 --cams side,shoulder --sheet 24 \
    --label "$title" --actor "${uf%.json}" --actor "${vf%.json}" 2>&1 | grep -E "length|rror" | sed "s/^/[$slug] /"
}
export -f one
grep -v '^#' "$HERE/pairs.txt" | grep -v '^\s*$' | awk '{print NR "|" $0}' | xargs -P "$JOBS" -I{} bash -c 'one "$@"' _ {}
