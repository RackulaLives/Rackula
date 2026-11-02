#!/usr/bin/env bash
# media-changed.sh — Decide whether README media visibly changed.
#
# Usage: scripts/media-changed.sh <old-dir> <new-dir>
#
# Prints changed=true or changed=false. Both dirs hold rack.png and hero.gif.
# The hero is compared by its final frame: GIF bytes and in-between frames can
# differ between runs with nothing visibly changed. A missing baseline counts
# as changed.

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <old-dir> <new-dir>" >&2
  exit 2
fi

old_dir="$1"
new_dir="$2"
threshold=0.995

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if [ ! -f "$old_dir/rack.png" ] || [ ! -f "$old_dir/hero.gif" ]; then
  echo "changed=true"
  exit 0
fi

# -update 1 overwrites one file per frame, leaving the last.
last_frame() {
  ffmpeg -v error -y -i "$1" -update 1 "$2"
}

# Print the overall SSIM of two images, scaling the second to the first.
# The optional third argument is a filter applied to both before comparing.
ssim() {
  local size prefilter="${3:-null}"
  size=$(ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=p=0:s=x "$1")
  ffmpeg -hide_banner -i "$1" -i "$2" \
    -lavfi "[0]${prefilter}[a];[1]scale=$size:flags=lanczos,${prefilter}[b];[a][b]ssim" -f null - 2>&1 |
    sed -n 's/.*All:\([0-9.]*\).*/\1/p'
}

last_frame "$old_dir/hero.gif" "$work/old-last.png"
last_frame "$new_dir/hero.gif" "$work/new-last.png"

rack=$(ssim "$old_dir/rack.png" "$new_dir/rack.png")
# The GIF palette spans the whole animation, so a change in any frame re-dithers
# the last one. Downscaling averages that noise away.
hero=$(ssim "$work/old-last.png" "$work/new-last.png" "scale=iw/4:-2:flags=area")

if [ -z "$rack" ] || [ -z "$hero" ]; then
  echo "Could not read SSIM (rack='$rack' hero='$hero')" >&2
  exit 1
fi

if awk -v rack="$rack" -v hero="$hero" -v t="$threshold" \
  'BEGIN { exit !(rack < t || hero < t) }'; then
  echo "changed=true"
else
  echo "changed=false"
fi
