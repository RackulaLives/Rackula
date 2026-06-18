<!--
  RackFrame SVG Component
  Renders the static rack frame: interior background, rails, bars,
  U slot backgrounds, grid lines, mounting holes, U labels,
  blocked slot overlays, rack name, and view label.

  This is a pure rendering component — no interaction logic.
  Must be rendered as an early SVG layer (devices render on top).
-->
<script lang="ts">
  import type { URange } from "$lib/utils/blocked-slots";

  interface Props {
    /** Total rack width in pixels */
    rackWidth: number;
    /** Interior width between rails */
    interiorWidth: number;
    /** Rail width in pixels */
    railWidth: number;
    /** Top padding for rack name area */
    rackPadding: number;
    /** Height of one U in pixels */
    uHeight: number;
    /** Total height of all U slots in pixels */
    totalHeight: number;
    /** Number of rack units */
    rackHeight: number;
    /** U label data: unit number and Y position */
    uLabels: Array<{ uNumber: number; yPosition: number }>;
    /** Whether to hide U labels (e.g., in bayed view) */
    hideULabels?: boolean;
    /** Whether to hide the rack name */
    hideRackName?: boolean;
    /** Rack name text */
    rackName: string;
    /** View label (e.g., "FRONT" or "REAR") */
    viewLabel?: string;
    /** Y offset for the rack name */
    nameYOffset: number;
    /** Whether Shift key is held (shows half-U grid lines) */
    shiftKeyHeld?: boolean;
    /** Unique rack identifier for SVG pattern IDs */
    rackId: string;
    /** Blocked slot ranges for crosshatch overlay */
    blockedSlots?: URange[];
    /** Drop preview data for highlighting drop target U slots */
    dropPreview?: {
      position: number;
      height: number;
      feedback: "valid" | "invalid" | "blocked";
    } | null;
    /** Whether in mobile placement mode */
    isPlacementMode?: boolean;
    /** Set of valid placement U positions */
    validPlacementSlots?: Set<number>;
  }

  let {
    rackWidth,
    interiorWidth,
    railWidth,
    rackPadding,
    uHeight,
    totalHeight,
    rackHeight,
    uLabels,
    hideULabels = false,
    hideRackName = false,
    rackName,
    viewLabel,
    nameYOffset,
    rackId,
    shiftKeyHeld = false,
    blockedSlots = [],
    dropPreview = null,
    isPlacementMode = false,
    validPlacementSlots,
  }: Props = $props();

  // Sanitise rackId + viewLabel into a safe SVG fragment identifier
  const patternId = $derived(
    `blocked-crosshatch-${rackId.replace(/[^a-zA-Z0-9_-]/g, "_")}${viewLabel ? `-${viewLabel.toLowerCase()}` : ""}`,
  );
</script>

<!-- Rack background (interior)
     Inline style duplicates class fill as Safari iOS workaround:
     Safari 18.x mis-resolves CSS custom properties in scoped SVG fill declarations -->
<rect
  x={railWidth}
  y={rackPadding + railWidth}
  width={interiorWidth}
  height={totalHeight}
  class="rack-interior"
  style="fill: var(--rack-interior)"
/>

<!-- Top bar (horizontal) — inline fill: Safari iOS workaround (see interior comment) -->
<rect
  x="0"
  y={rackPadding}
  width={rackWidth}
  height={railWidth}
  class="rack-rail"
  style="fill: var(--rack-rail)"
/>

<!-- Bottom bar (horizontal) — inline fill: Safari iOS workaround (see interior comment) -->
<rect
  x="0"
  y={rackPadding + railWidth + totalHeight}
  width={rackWidth}
  height={railWidth}
  class="rack-rail"
  style="fill: var(--rack-rail)"
/>

<!-- Left rail (vertical) — inline fill: Safari iOS workaround (see interior comment) -->
<rect
  x="0"
  y={rackPadding + railWidth}
  width={railWidth}
  height={totalHeight}
  class="rack-rail"
  style="fill: var(--rack-rail)"
/>

<!-- Right rail (vertical) — inline fill: Safari iOS workaround (see interior comment) -->
<rect
  x={rackWidth - railWidth}
  y={rackPadding + railWidth}
  width={railWidth}
  height={totalHeight}
  class="rack-rail"
  style="fill: var(--rack-rail)"
/>

<!-- U slot backgrounds (for drop zone highlighting) -->
{#each Array(rackHeight).fill(null) as _slot, i (i)}
  {@const uPosition = rackHeight - i}
  {@const isDropTarget =
    dropPreview !== null &&
    uPosition >= dropPreview.position &&
    uPosition < dropPreview.position + dropPreview.height}
  {@const isPlacementValid =
    isPlacementMode && validPlacementSlots?.has(uPosition)}
  <rect
    class="u-slot"
    class:u-slot-even={uPosition % 2 === 0}
    class:drop-target={isDropTarget}
    class:drop-valid={isDropTarget && dropPreview?.feedback === "valid"}
    class:drop-invalid={isDropTarget &&
      (dropPreview?.feedback === "invalid" ||
        dropPreview?.feedback === "blocked")}
    class:placement-valid={isPlacementValid}
    x={railWidth}
    y={i * uHeight + rackPadding + railWidth}
    width={interiorWidth}
    height={uHeight}
  />
{/each}

<!-- Horizontal grid lines (U dividers) -->
{#each Array(rackHeight + 1).fill(null) as _gridLine, i (i)}
  <line
    x1={railWidth}
    y1={i * uHeight + rackPadding + railWidth}
    x2={rackWidth - railWidth}
    y2={i * uHeight + rackPadding + railWidth}
    class="rack-grid-line"
  />
{/each}

<!-- Half-U grid lines (shown when Shift is held for fine positioning) -->
{#if shiftKeyHeld}
  {#each Array(rackHeight).fill(null) as _halfLine, i (i)}
    <line
      x1={railWidth}
      y1={i * uHeight + uHeight / 2 + rackPadding + railWidth}
      x2={rackWidth - railWidth}
      y2={i * uHeight + uHeight / 2 + rackPadding + railWidth}
      class="rack-grid-line-half"
    />
  {/each}
{/if}

<!-- Rail mounting holes (3 per U on each rail) - rendered first so labels appear on top -->
{#each Array(rackHeight).fill(null) as _hole, i (i)}
  {@const baseY = i * uHeight + rackPadding + railWidth + 4}
  {@const leftHoleX = railWidth - 4}
  {@const rightHoleX = rackWidth - railWidth + 1}
  <!-- Left rail holes (behind U labels) -->
  <rect
    x={leftHoleX}
    y={baseY - 2}
    width="3"
    height="4"
    rx="0.5"
    class="rack-hole"
  />
  <rect
    x={leftHoleX}
    y={baseY + 5}
    width="3"
    height="4"
    rx="0.5"
    class="rack-hole"
  />
  <rect
    x={leftHoleX}
    y={baseY + 12}
    width="3"
    height="4"
    rx="0.5"
    class="rack-hole"
  />
  <!-- Right rail holes -->
  <rect
    x={rightHoleX}
    y={baseY - 2}
    width="3"
    height="4"
    rx="0.5"
    class="rack-hole"
  />
  <rect
    x={rightHoleX}
    y={baseY + 5}
    width="3"
    height="4"
    rx="0.5"
    class="rack-hole"
  />
  <rect
    x={rightHoleX}
    y={baseY + 12}
    width="3"
    height="4"
    rx="0.5"
    class="rack-hole"
  />
{/each}

<!-- U labels (always on left rail) - hidden when bayed rack view shows shared labels -->
{#if !hideULabels}
  {#each uLabels as { uNumber, yPosition } (uNumber)}
    <text
      x={railWidth / 2}
      y={yPosition}
      class="u-label"
      class:u-label-highlight={uNumber % 5 === 0}
      dominant-baseline="middle"
    >
      {uNumber}
    </text>
  {/each}
{/if}

<!-- SVG Defs for blocked slots pattern -->
<defs>
  <!-- Crosshatch pattern for blocked slots - uses two overlapping diagonal line sets
       for better visibility and accessibility (not relying solely on color) -->
  <pattern id={patternId} patternUnits="userSpaceOnUse" width="8" height="8">
    <!-- First diagonal (top-left to bottom-right) -->
    <line
      x1="0"
      y1="0"
      x2="8"
      y2="8"
      class="blocked-crosshatch-line"
      stroke-width="1.5"
    />
    <!-- Second diagonal (top-right to bottom-left) -->
    <line
      x1="8"
      y1="0"
      x2="0"
      y2="8"
      class="blocked-crosshatch-line"
      stroke-width="1.5"
    />
  </pattern>
</defs>

<!-- Blocked Slots Overlay (renders before devices so devices appear on top) -->
{#if blockedSlots.length > 0}
  {@const slotHeight = (slot: { bottom: number; top: number }) =>
    (slot.top - slot.bottom + 1) * uHeight}
  {@const slotY = (slot: { bottom: number; top: number }) =>
    (rackHeight - slot.top) * uHeight}
  {@const slotWidth = rackWidth - 2 * railWidth}
  <g
    class="blocked-slots-layer"
    transform="translate(0, {rackPadding + railWidth})"
  >
    {#each blockedSlots as slot (slot.bottom + "-" + slot.top)}
      <!-- Background wash with improved opacity -->
      <rect
        class="blocked-slot blocked-slot-bg"
        x={railWidth}
        y={slotY(slot)}
        width={slotWidth}
        height={slotHeight(slot)}
      />
      <!-- Crosshatch pattern for accessibility (visual texture, not just color) -->
      <rect
        class="blocked-slot blocked-slot-pattern"
        x={railWidth}
        y={slotY(slot)}
        width={slotWidth}
        height={slotHeight(slot)}
        fill="url(#{patternId})"
      />
    {/each}
  </g>
{/if}

<!-- Rack name at top (rendered last so it's on top) - hidden when hideRackName=true -->
{#if !hideRackName}
  <text
    x={rackWidth / 2}
    y={-nameYOffset + 20}
    class="rack-name"
    text-anchor="middle"
    dominant-baseline="text-before-edge"
  >
    {rackName}
  </text>
{/if}

<!-- View label (e.g., "FRONT" or "REAR") - shown when viewLabel is provided, positioned on top rail -->
{#if viewLabel}
  <text
    x={rackWidth / 2}
    y={rackPadding + railWidth / 2}
    class="rack-view-label"
    text-anchor="middle"
    dominant-baseline="central"
  >
    {viewLabel}
  </text>
{/if}

<style>
  .rack-interior {
    fill: var(--rack-interior);
  }

  /* U slot backgrounds */
  .u-slot {
    fill: var(--rack-slot);
    transition: fill var(--duration-fast) var(--ease-out);
  }

  .u-slot.u-slot-even {
    fill: var(--rack-slot-alt);
  }

  .u-slot.drop-target {
    transition: fill var(--duration-fast) var(--ease-out);
  }

  .u-slot.drop-target.drop-valid {
    fill: var(--colour-dnd-valid-bg);
  }

  .u-slot.drop-target.drop-invalid {
    fill: var(--colour-dnd-invalid-bg);
  }

  .rack-rail {
    fill: var(--rack-rail);
  }

  .rack-grid-line {
    stroke: var(--rack-grid);
    stroke-width: 1;
  }

  .rack-grid-line-half {
    stroke: var(--colour-selection);
    stroke-width: 1;
    stroke-dasharray: 4 2;
    opacity: 0.6;
  }

  .u-label {
    fill: var(--rack-text);
    font-size: var(--font-size-2xs);
    text-anchor: middle;
    font-family: var(--font-mono, monospace);
    font-variant-numeric: tabular-nums;
    user-select: none;
  }

  .u-label-highlight {
    font-weight: var(--font-weight-semibold, 600);
    fill: var(--rack-text-highlight);
  }

  .rack-hole {
    fill: var(--rack-grid);
  }

  .rack-name {
    fill: var(--colour-text);
    font-size: var(--font-size-base);
    font-weight: 500;
    text-anchor: middle;
    font-family: var(--font-family, system-ui, sans-serif);
  }

  .rack-view-label {
    fill: var(--colour-text-muted);
    font-size: var(--font-size-xs);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    text-anchor: middle;
    font-family: var(--font-family, system-ui, sans-serif);
  }

  /* Valid placement slots - subtle pulse highlight */
  .u-slot.placement-valid {
    fill: rgba(255, 121, 198, 0.15);
    animation: placement-pulse 2s ease-in-out infinite;
  }

  @keyframes placement-pulse {
    0%,
    100% {
      fill: rgba(255, 121, 198, 0.1);
    }
    50% {
      fill: rgba(255, 121, 198, 0.25);
    }
  }

  /* Blocked Slots - Crosshatch pattern for half-depth conflicts
     Uses both pattern and color for accessibility (WCAG: not relying solely on color) */
  .blocked-crosshatch-line {
    stroke: var(--colour-blocked-stroke, rgba(239, 68, 68, 0.45));
  }

  .blocked-slot-bg {
    fill: var(--colour-blocked-bg, rgba(239, 68, 68, 0.12));
  }

  .blocked-slot-pattern {
    pointer-events: none;
    opacity: 0.9;
  }

  /* Respect reduced motion - no pulse */
  @media (prefers-reduced-motion: reduce) {
    .u-slot.placement-valid {
      animation: none;
      fill: rgba(255, 121, 198, 0.2);
    }
  }
</style>
