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

@test "media-changed: missing baseline is changed" {
  make_media "$WORK/new" "testsrc=size=640x400" "smptebars=size=640x400:rate=12:duration=0.5"
  mkdir "$WORK/old"
  run "$CHANGED" "$WORK/old" "$WORK/new"
  [ "$status" -eq 0 ]
  [ "$output" = "changed=true" ]
}
