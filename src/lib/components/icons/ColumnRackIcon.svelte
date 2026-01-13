<!--
  Column Rack Icon
  Single vertical rack outline with horizontal U dividers.
  Used in the New Rack wizard layout type selection cards.
-->
<script lang="ts">
  interface Props {
    /** Width of the icon in pixels */
    width?: number;
    /** Whether the icon is in selected state (pink border + fill) */
    selected?: boolean;
  }

  let { width = 60, selected = false }: Props = $props();

  // Proportional height based on a typical rack aspect ratio (roughly 3:4)
  const height = $derived(Math.round(width * 1.33));

  // Rail width proportional to icon size
  const railWidth = $derived(Math.round(width * 0.1));

  // Interior dimensions
  const interiorX = $derived(railWidth);
  const interiorY = $derived(railWidth);
  const interiorWidth = $derived(width - railWidth * 2);
  const interiorHeight = $derived(height - railWidth * 2);

  // U divider lines (roughly 8 lines to suggest U divisions)
  const uLineCount = 8;
  const uLineSpacing = $derived(interiorHeight / (uLineCount + 1));
</script>

<svg
  {width}
  {height}
  viewBox="0 0 {width} {height}"
  fill="none"
  aria-hidden="true"
  class="column-rack-icon"
  class:selected
>
  <!-- Interior background (only visible when selected) -->
  {#if selected}
    <rect
      x={interiorX}
      y={interiorY}
      width={interiorWidth}
      height={interiorHeight}
      class="rack-interior"
    />
  {/if}

  <!-- Rack frame outline -->
  <rect
    x="0.5"
    y="0.5"
    width={width - 1}
    height={height - 1}
    rx="2"
    ry="2"
    class="rack-frame"
  />

  <!-- Left rail -->
  <rect
    x="0.5"
    y="0.5"
    width={railWidth}
    height={height - 1}
    class="rack-rail"
  />

  <!-- Right rail -->
  <rect
    x={width - railWidth - 0.5}
    y="0.5"
    width={railWidth}
    height={height - 1}
    class="rack-rail"
  />

  <!-- U divider lines -->
  {#each Array(uLineCount) as _, i (i)}
    <line
      x1={railWidth}
      y1={railWidth + (i + 1) * uLineSpacing}
      x2={width - railWidth}
      y2={railWidth + (i + 1) * uLineSpacing}
      class="u-line"
    />
  {/each}
</svg>

<style>
  .column-rack-icon {
    display: block;
  }

  .rack-frame {
    stroke: var(--colour-border);
    stroke-width: 1;
    fill: none;
  }

  .rack-rail {
    fill: var(--colour-border);
    opacity: 0.3;
  }

  .rack-interior {
    fill: var(--colour-selection);
    opacity: 0.1;
  }

  .u-line {
    stroke: var(--colour-border);
    stroke-width: 0.5;
    opacity: 0.5;
  }

  /* Selected state: pink border */
  .selected .rack-frame {
    stroke: var(--colour-selection);
    stroke-width: 1.5;
  }

  .selected .u-line {
    stroke: var(--colour-selection);
    opacity: 0.4;
  }

  .selected .rack-rail {
    fill: var(--colour-selection);
    opacity: 0.2;
  }
</style>
