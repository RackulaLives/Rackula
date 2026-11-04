#!/usr/bin/env bash
# encode-hero.sh — Encode README hero frames into a GIF.
#
# Usage: scripts/encode-hero.sh <frames-dir> <out.gif>
#
# Frames are scaled before the palette pass: a size change inside a
# palettegen run restarts it and silently drops every earlier frame.
#
# HERO_MAX_BYTES overrides the size budget.

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <frames-dir> <out.gif>" >&2
  exit 2
fi

frames_dir="$1"
out="$2"
max_bytes="${HERO_MAX_BYTES:-2000000}"
width=1000
fps=12

scaled="$(mktemp -d)"
trap 'rm -rf "$scaled"' EXIT

ffmpeg -v error -y -framerate "$fps" -i "$frames_dir/f%04d.png" \
  -vf "scale=$width:-2:flags=lanczos" "$scaled/f%04d.png"

ffmpeg -v error -y -framerate "$fps" -i "$scaled/f%04d.png" \
  -vf "split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  -loop 0 "$out"

bytes=$(wc -c <"$out" | tr -d ' ')
if [ "$bytes" -gt "$max_bytes" ]; then
  echo "Hero is $bytes bytes, over the $max_bytes byte budget" >&2
  exit 1
fi
