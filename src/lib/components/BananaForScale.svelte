<!--
  BananaForScale Component
  A silly easter egg that draws an accurately-scaled banana
  next to the rack for visual scale reference.

  Scale: 1U = 1.75" = 22px, so 1" ≈ 12.57px
  Average banana: ~7" long × ~1.5" diameter
  Banana dimensions: ~88px × ~19px
-->
<script lang="ts">
  import { U_HEIGHT_PX } from "$lib/constants/layout";

  interface Props {
    /** Vertical offset from bottom of rack in pixels */
    bottomOffset?: number;
  }

  let { bottomOffset = 8 }: Props = $props();

  // Scale calculation:
  // 1U = 1.75" = U_HEIGHT_PX (22px from layout constants)
  // 1" = U_HEIGHT_PX / 1.75 ≈ 12.57px
  // Average banana: 7" long × 1.5" diameter
  const PIXELS_PER_INCH = U_HEIGHT_PX / 1.75;
  const BANANA_LENGTH_INCHES = 7;
  const BANANA_WIDTH_INCHES = 1.5;

  const bananaLength = Math.round(BANANA_LENGTH_INCHES * PIXELS_PER_INCH); // ~88px
  const bananaWidth = Math.round(BANANA_WIDTH_INCHES * PIXELS_PER_INCH); // ~19px
</script>

<svg
  class="banana-for-scale"
  width={bananaLength}
  height={bananaWidth + 10}
  viewBox="0 0 88 29"
  aria-label="Banana for scale (approximately 7 inches)"
  role="img"
  style:--bottom-offset="{bottomOffset}px"
  style:transform="rotate(-80deg)"
  style:transform-origin="right center"
>
  <title>Banana for scale (7 inches)</title>

  <!-- Banana body - curved yellow shape -->
  <path
    d="M8 20
       C3 18, 2 14, 4 10
       C6 5, 14 3, 25 2
       C40 1, 60 1, 75 3
       C82 4, 86 7, 86 12
       C86 16, 82 20, 75 22
       C60 25, 35 26, 18 24
       C12 23, 10 22, 8 20
       Z"
    fill="#FFE135"
  />

  <!-- Darker yellow for depth/shadow -->
  <path
    d="M10 19
       C6 17, 5 14, 6 11
       C8 7, 15 5, 28 4
       C45 3, 62 3, 74 5
       C79 6, 82 8, 82 12
       C82 14, 80 17, 74 19
       C60 21, 40 22, 22 21
       C15 20, 12 20, 10 19
       Z"
    fill="#F5D000"
  />

  <!-- Light highlight -->
  <path
    d="M25 6
       C40 5, 55 5, 68 7
       C72 8, 74 10, 73 12
       C65 10, 45 9, 28 10
       C22 10, 20 9, 25 6
       Z"
    fill="#FFF176"
    opacity="0.6"
  />

  <!-- Stem -->
  <ellipse cx="6" cy="15" rx="4" ry="3" fill="#8B7355" />
  <ellipse cx="5" cy="15" rx="2.5" ry="2" fill="#6B5344" />

  <!-- End tip -->
  <ellipse cx="85" cy="11" rx="3" ry="4" fill="#4A3728" />

  <!-- Brown spots (ripe banana) -->
  <ellipse cx="30" cy="14" rx="2" ry="1.5" fill="#8B4513" opacity="0.3" />
  <ellipse cx="50" cy="10" rx="1.5" ry="1" fill="#8B4513" opacity="0.25" />
  <ellipse cx="65" cy="15" rx="1.8" ry="1.2" fill="#8B4513" opacity="0.3" />
</svg>

<style>
  .banana-for-scale {
    pointer-events: none;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
  }
</style>
