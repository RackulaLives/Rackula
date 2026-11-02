#!/usr/bin/env bats
# readme-media.bats — Tests for scripts/encode-hero.sh and scripts/media-changed.sh
#
# Run: bats scripts/readme-media.bats

setup() {
  WORK="$(mktemp -d)"
  SCRIPTS="$(cd "$(dirname "$BATS_TEST_FILENAME")" && pwd)"
  ENCODE="$SCRIPTS/encode-hero.sh"
  CHANGED="$SCRIPTS/media-changed.sh"
}

teardown() {
  rm -rf "$WORK"
}

# Write frames f0001.png onward from a lavfi source.
make_frames() {
  local dir="$1" count="$2" source="${3:-testsrc=size=640x400:rate=12}"
  mkdir -p "$dir"
  ffmpeg -v error -y -f lavfi -i "$source" -frames:v "$count" "$dir/f%04d.png"
}

# Write a media dir: rack.png from one source, hero.gif ending on another.
make_media() {
  local dir="$1" rack="$2" last="$3"
  mkdir -p "$dir"
  ffmpeg -v error -y -f lavfi -i "$rack" -frames:v 1 "$dir/rack.png"
  ffmpeg -v error -y \
    -f lavfi -i "testsrc=size=640x400:rate=12:duration=0.5" \
    -f lavfi -i "$last" \
    -filter_complex "[0][1]concat=n=2:v=1" -frames:v 12 "$dir/hero.gif"
}

@test "encode-hero: writes a 1000px wide GIF with every frame" {
  make_frames "$WORK/frames" 8
  run "$ENCODE" "$WORK/frames" "$WORK/hero.gif"
  [ "$status" -eq 0 ]
  width=$(ffprobe -v error -select_streams v -show_entries stream=width -of csv=p=0 "$WORK/hero.gif")
  frames=$(ffprobe -v error -count_frames -select_streams v -show_entries stream=nb_read_frames -of csv=p=0 "$WORK/hero.gif")
  [ "$width" -eq 1000 ]
  [ "$frames" -eq 8 ]
}

@test "encode-hero: fails over budget" {
  make_frames "$WORK/frames" 8
  HERO_MAX_BYTES=100 run "$ENCODE" "$WORK/frames" "$WORK/hero.gif"
  [ "$status" -ne 0 ]
  [[ "$output" == *"budget"* ]]
}

@test "media-changed: identical media is unchanged" {
  make_media "$WORK/old" "testsrc=size=640x400" "smptebars=size=640x400:rate=12:duration=0.5"
  cp -R "$WORK/old" "$WORK/new"
  run "$CHANGED" "$WORK/old" "$WORK/new"
  [ "$status" -eq 0 ]
  [ "$output" = "changed=false" ]
}

@test "media-changed: a different still is changed" {
  make_media "$WORK/old" "testsrc=size=640x400" "smptebars=size=640x400:rate=12:duration=0.5"
  cp -R "$WORK/old" "$WORK/new"
  ffmpeg -v error -y -f lavfi -i "smptebars=size=640x400" -frames:v 1 "$WORK/new/rack.png"
  run "$CHANGED" "$WORK/old" "$WORK/new"
  [ "$status" -eq 0 ]
  [ "$output" = "changed=true" ]
}

@test "media-changed: a different final GIF frame is changed" {
  make_media "$WORK/old" "testsrc=size=640x400" "smptebars=size=640x400:rate=12:duration=0.5"
  make_media "$WORK/new" "testsrc=size=640x400" "color=c=red:size=640x400:rate=12:duration=0.5"
  cp "$WORK/old/rack.png" "$WORK/new/rack.png"
  run "$CHANGED" "$WORK/old" "$WORK/new"
  [ "$status" -eq 0 ]
  [ "$output" = "changed=true" ]
}

@test "media-changed: an early-frame change alone is unchanged" {
  # The palette spans the animation, so an early change re-dithers the final
  # frame even though its source pixels are identical. A real UI screenshot with
  # motion and then a hold, as in the hero.
  ui="$SCRIPTS/../e2e/__screenshots__/visual-regression.spec.ts/canvas-populated-dark-linux.png"
  mkdir "$WORK/frames-old" "$WORK/frames-new" "$WORK/old" "$WORK/new"
  for frame in 1 2 3 4 5 6 7 8; do
    box="drawbox=x=$((frame * 60)):y=200:w=160:h=40:color=white:t=fill"
    ffmpeg -v error -y -i "$ui" -vf "$box" "$WORK/frames-old/f000$frame.png"
    ffmpeg -v error -y -i "$ui" -vf "$box,eq=brightness=0.02" "$WORK/frames-new/f000$frame.png"
  done
  for frame in 09 10 11 12; do
    cp "$ui" "$WORK/frames-old/f00$frame.png"
    cp "$ui" "$WORK/frames-new/f00$frame.png"
  done
  "$ENCODE" "$WORK/frames-old" "$WORK/old/hero.gif"
  "$ENCODE" "$WORK/frames-new" "$WORK/new/hero.gif"
  cp "$ui" "$WORK/old/rack.png"
  cp "$ui" "$WORK/new/rack.png"
  run "$CHANGED" "$WORK/old" "$WORK/new"
  [ "$status" -eq 0 ]
  [ "$output" = "changed=false" ]
}

@test "media-changed: missing baseline is changed" {
  make_media "$WORK/new" "testsrc=size=640x400" "smptebars=size=640x400:rate=12:duration=0.5"
  mkdir "$WORK/old"
  run "$CHANGED" "$WORK/old" "$WORK/new"
  [ "$status" -eq 0 ]
  [ "$output" = "changed=true" ]
}
