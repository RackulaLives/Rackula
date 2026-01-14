<!--
  Bayed Rack Icon
  Multiple racks side-by-side with gap between bays.
  Used in the New Rack wizard layout type selection cards.
-->
<script lang="ts">
  interface Props {
    /** Number of rack bays to display (2 or 3) */
    bays?: 2 | 3;
    /** Width of the entire icon in pixels */
    width?: number;
    /** Whether the icon is in selected state (pink border + fill) */
    selected?: boolean;
  }

  let { bays = 2, width = 60, selected = false }: Props = $props();

  // Gap between bays (proportional to width)
  const bayGap = $derived(Math.round(width * 0.05));

  // Individual rack width
  const rackWidth = $derived(Math.round((width - bayGap * (bays - 1)) / bays));

  // Rack height (same aspect ratio as ColumnRackIcon)
  const rackHeight = $derived(Math.round(rackWidth * 1.33));

  // Rail width proportional to rack size
  const railWidth = $derived(Math.round(rackWidth * 0.12));

  // U divider lines (fewer than column since racks are narrower)
  const uLineCount = 6;
  const interiorHeight = $derived(rackHeight - railWidth * 2);
  const uLineSpacing = $derived(interiorHeight / (uLineCount + 1));

  // Create array of bay x-positions
  const bayPositions = $derived(
    Array.from({ length: bays }, (_, i) => i * (rackWidth + bayGap)),
  );
</script>

<svg
  {width}
  height={rackHeight}
  viewBox="0 0 {width} {rackHeight}"
  fill="none"
  aria-hidden="true"
  class="bayed-rack-icon"
  class:selected
>
  {#each bayPositions as x, bayIndex (bayIndex)}
    {@const interiorX = x + railWidth}
    {@const interiorY = railWidth}
    {@const interiorWidth = rackWidth - railWidth * 2}

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
      x={x + 0.5}
      y="0.5"
      width={rackWidth - 1}
      height={rackHeight - 1}
      rx="1.5"
      ry="1.5"
      class="rack-frame"
    />

    <!-- Left rail -->
    <rect
      x={x + 0.5}
      y="0.5"
      width={railWidth}
      height={rackHeight - 1}
      class="rack-rail"
    />

    <!-- Right rail -->
    <rect
      x={x + rackWidth - railWidth - 0.5}
      y="0.5"
      width={railWidth}
      height={rackHeight - 1}
      class="rack-rail"
    />

    <!-- U divider lines -->
    {#each Array(uLineCount) as _, lineIndex (lineIndex)}
      <line
        x1={x + railWidth}
        y1={railWidth + (lineIndex + 1) * uLineSpacing}
        x2={x + rackWidth - railWidth}
        y2={railWidth + (lineIndex + 1) * uLineSpacing}
        class="u-line"
      />
    {/each}
  {/each}
</svg>

<style>
  .bayed-rack-icon {
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
