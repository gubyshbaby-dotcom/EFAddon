#!/usr/bin/env bash
# Small web copies of renders for a gallery: <in.mp4> -> <out.mp4> (1280 px wide, crf 30, faststart)
set -eu
ffmpeg -v error -y -i "$1" -vf "scale=1280:-2:flags=lanczos" -c:v libx264 -preset slow -crf 30 -pix_fmt yuv420p -movflags +faststart -an "$2"
