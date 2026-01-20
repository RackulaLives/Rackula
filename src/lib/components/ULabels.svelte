<!--
  ULabels Component
  Renders a vertical column of U-position labels for rack visualization.
  Used in BayedRackView to show slot numbers alongside rack bays.
-->
<script lang="ts">
  interface ULabel {
    uNumber: number;
    yPosition: number;
  }

  interface Props {
    /** Array of U labels with position and number */
    uLabels: ULabel[];
    /** Total height of the U-labels column in pixels */
    uColumnHeight: number;
    /** Height of the top/bottom rail bars in pixels */
    railWidth: number;
    /** Padding at top of column (to match rack padding) */
    topPadding?: number;
  }

  let { uLabels, uColumnHeight, railWidth, topPadding = 0 }: Props = $props();
</script>

<svg
  class="u-labels-svg"
  width="32"
  height={uColumnHeight}
  viewBox="0 0 32 {uColumnHeight}"
  role="img"
  aria-label="U position labels"
>
  <!-- Background -->
  <rect x="0" y="0" width="32" height={uColumnHeight} class="u-column-bg" />

  <!-- Top rail (offset by topPadding to match Rack.svelte layout) -->
  <rect
    x="0"
    y={topPadding}
    width="32"
    height={railWidth}
    class="u-column-rail"
  />

  <!-- Bottom rail -->
  <rect
    x="0"
    y={uColumnHeight - railWidth}
    width="32"
    height={railWidth}
    class="u-column-rail"
  />

  <!-- U labels -->
  {#each uLabels as { uNumber, yPosition } (uNumber)}
    <text
      x="16"
      y={yPosition}
      class="u-label"
      class:u-label-highlight={uNumber % 5 === 0}
      text-anchor="middle"
      dominant-baseline="middle"
    >
      {uNumber}
    </text>
  {/each}
</svg>

<style>
  .u-labels-svg {
    display: block;
  }

  .u-column-bg {
    fill: var(--rack-interior);
  }

  .u-column-rail {
    fill: var(--rack-rail);
  }

  .u-label {
    fill: var(--rack-text);
    font-size: var(--font-size-2xs);
    font-family: var(--font-mono, monospace);
    font-variant-numeric: tabular-nums;
    user-select: none;
  }

  .u-label-highlight {
    font-weight: var(--font-weight-semibold, 600);
    fill: var(--rack-text-highlight);
  }
</style>
