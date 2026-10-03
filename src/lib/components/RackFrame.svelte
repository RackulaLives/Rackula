<!--
  RackFrame SVG Component
  Renders the static rack frame: interior background, rails, bars,
  U slot backgrounds, grid lines, mounting holes, U labels,
  blocked slot overlays, rack name, and view label.

  This is a pure rendering component — no interaction logic.
  Must be rendered as an early SVG layer (devices render on top).
-->
<script lang="ts">
  import type { BlockedSlot } from "$lib/utils/blocked-slots";
  import type { FormFactor, RackView } from "$lib/types";
  import { frameChromeFor } from "$lib/utils/rack-frame-chrome";
  import { fitTextToWidth, graphemes } from "$lib/utils/text-sizing";

  /** Blocked-slot caption font size range, and its inset from the rails */
  const BLOCKED_CAPTION_MAX_FONT = 10;
  const BLOCKED_CAPTION_MIN_FONT = 9;
  const BLOCKED_CAPTION_PADDING_X = 4;

  interface Props {
    /** Total rack width in pixels */
    rackWidth: number;
    /** Interior width between rails */
    interiorWidth: number;
    /** Rail width in pixels */
    railWidth: number;
    /** Rack form factor (drives the frame chrome) */
    formFactor: FormFactor;
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
    /** Unique rack identifier for SVG pattern IDs */
    rackId: string;
    /** Face this frame shows; blocked slots are captioned with the other face */
    viewFace?: RackView;
    /** Blocked slot ranges for the hatch overlay, each naming its device */
    blockedSlots?: BlockedSlot[];
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
    formFactor,
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
    viewFace,
    blockedSlots = [],
    dropPreview = null,
    isPlacementMode = false,
    validPlacementSlots,
  }: Props = $props();

  // Sanitise rackId + viewLabel into a safe SVG fragment identifier
  const patternId = $derived(
    `blocked-crosshatch-${rackId.replace(/[^a-zA-Z0-9_-]/g, "_")}${viewLabel ? `-${viewLabel.toLowerCase()}` : ""}`,
  );

  // Caption for a blocked range: names the half-depth device on the other face.
  // `full` feeds the hover title; `fitted` is sized and truncated for the rack
  // interior. When the full text does not fit, the caption drops to
  // "<name> (<face>)" and shortens the name, never the face: the face is the
  // part that explains the hatch. Null when the viewed face is unknown.
  function blockedCaption(slot: BlockedSlot) {
    if (!viewFace) return null;
    const otherFace = viewFace === "rear" ? "front" : "rear";
    const full = `${slot.deviceName} (${otherFace}, half depth)`;
    const fit = (text: string) =>
      fitTextToWidth(text, {
        maxFontSize: BLOCKED_CAPTION_MAX_FONT,
        minFontSize: BLOCKED_CAPTION_MIN_FONT,
        availableWidth: interiorWidth - 2 * BLOCKED_CAPTION_PADDING_X,
      });
    let fitted = fit(full);
    if (fitted.text !== full) {
      const suffix = ` (${otherFace})`;
      fitted = fit(`${slot.deviceName}${suffix}`);
      if (!fitted.text.endsWith(suffix)) {
        const keep = Math.max(
          1,
          graphemes(fitted.text).length - suffix.length - 1,
        );
        const name = graphemes(slot.deviceName).slice(0, keep).join("");
        fitted = { ...fitted, text: `${name}…${suffix}` };
      }
    }
    return { full, fitted };
  }

  // Frame chrome geometry. The per-form-factor decorative chrome is disabled
  // (issue #2805); every form factor renders the generic frame (solid top/bottom
  // bars, no decorative shapes). The U-grid, rails, holes and labels are
  // unchanged.
  const chrome = $derived(
    frameChromeFor(formFactor, {
      rackWidth,
      railWidth,
      totalHeight,
      rackPadding,
    }),
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

<!-- Top bar (horizontal) — geometry varies by form factor; inline fill: Safari iOS workaround (see interior comment) -->
<rect
  x="0"
  y={chrome.topBar.y}
  width={rackWidth}
  height={chrome.topBar.height}
  class="rack-rail"
  style="fill: var(--rack-rail)"
/>

<!-- Bottom bar (horizontal) — geometry varies by form factor; inline fill: Safari iOS workaround (see interior comment) -->
<rect
  x="0"
  y={chrome.bottomBar.y}
  width={rackWidth}
  height={chrome.bottomBar.height}
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
  <!-- Diagonal hatch for blocked slots: a texture, so the state does not rely
       on colour alone. One line per tile, rotated, so tiles join cleanly. -->
  <pattern
    id={patternId}
    patternUnits="userSpaceOnUse"
    width="8"
    height="8"
    patternTransform="rotate(45)"
  >
    <line
      x1="4"
      y1="0"
      x2="4"
      y2="8"
      class="blocked-hatch-line"
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
      {@const caption =
        slot.top - slot.bottom + 1 >= 1 ? blockedCaption(slot) : null}
      <g>
        {#if caption}
          <title>{caption.full}</title>
        {/if}
        <!-- Background wash -->
        <rect
          class="blocked-slot blocked-slot-bg"
          x={railWidth}
          y={slotY(slot)}
          width={slotWidth}
          height={slotHeight(slot)}
        />
        <!-- Hatch pattern for accessibility (visual texture, not just colour) -->
        <rect
          class="blocked-slot blocked-slot-pattern"
          x={railWidth}
          y={slotY(slot)}
          width={slotWidth}
          height={slotHeight(slot)}
          fill="url(#{patternId})"
        />
        <!-- Caption naming the blocking device. The title above carries the
             untruncated text, so the visible copy is hidden from assistive tech. -->
        {#if caption}
          <text
            class="blocked-slot-caption"
            x={rackWidth / 2}
            y={slotY(slot) + slotHeight(slot) / 2}
            font-size={caption.fitted.fontSize}
            text-anchor="middle"
            dominant-baseline="central"
            aria-hidden="true"
          >
            {caption.fitted.text}
          </text>
        {/if}
      </g>
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
    fill: color-mix(in srgb, var(--colour-placement-valid) 15%, transparent);
    animation: placement-pulse 2s ease-in-out infinite;
  }

  @keyframes placement-pulse {
    0%,
    100% {
      fill: color-mix(in srgb, var(--colour-placement-valid) 10%, transparent);
    }
    50% {
      fill: color-mix(in srgb, var(--colour-placement-valid) 25%, transparent);
    }
  }

  /* Blocked Slots - neutral hatch for slots a half-depth device occupies on
     the other face. A normal state, so it stays out of the error colours.
     Uses both pattern and colour for accessibility (WCAG: not relying solely on colour) */
  .blocked-hatch-line {
    stroke: var(--colour-blocked-stroke, rgba(161, 161, 170, 0.45));
  }

  .blocked-slot-bg {
    fill: var(--colour-blocked-bg, rgba(161, 161, 170, 0.12));
  }

  /* The interior-coloured outline keeps the caption legible over the hatch. */
  .blocked-slot-caption {
    fill: var(--colour-text-muted);
    stroke: var(--rack-interior);
    stroke-width: 3px;
    stroke-linejoin: round;
    paint-order: stroke;
    font-family: var(--font-family, system-ui, sans-serif);
    pointer-events: none;
    user-select: none;
  }

  .blocked-slot-pattern {
    pointer-events: none;
    opacity: 0.9;
  }

  /* Respect reduced motion - no pulse */
  @media (prefers-reduced-motion: reduce) {
    .u-slot.placement-valid {
      animation: none;
      fill: color-mix(in srgb, var(--colour-placement-valid) 20%, transparent);
    }
  }
</style>
