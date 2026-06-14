<!--
  RackDropZone SVG Component
  Renders the drop preview indicator during drag-and-drop operations.
  Shows a dashed rectangle at the target position with valid/invalid/blocked styling,
  and a slot divider line for half-width device placement.

  This is a pure rendering component — no interaction logic.
  Must be rendered after devices in SVG order (appears on top).
-->
<script lang="ts">
  import type { DropFeedback } from "$lib/utils/dragdrop";
  import type { SlotPosition } from "$lib/types";

  interface Props {
    /** Drop preview position (1-indexed U position from bottom) */
    position: number;
    /** Height of the device being dropped in U */
    height: number;
    /** Feedback state: valid, invalid, or blocked */
    feedback: DropFeedback;
    /** Slot position for half-width devices */
    slotPosition?: SlotPosition;
    /** Whether this is a half-width device */
    isHalfWidth?: boolean;
    /** Rail width in pixels */
    railWidth: number;
    /** Interior width between rails */
    interiorWidth: number;
    /** Height of one U in pixels */
    uHeight: number;
    /** Number of rack units */
    rackHeight: number;
    /** Top padding for rack name area */
    rackPadding: number;
  }

  let {
    position,
    height,
    feedback,
    slotPosition,
    isHalfWidth = false,
    railWidth,
    interiorWidth,
    uHeight,
    rackHeight,
    rackPadding,
  }: Props = $props();

  // Calculate Y position in SVG coordinates
  const previewY = $derived(
    (rackHeight - position - height + 1) * uHeight + rackPadding + railWidth,
  );
</script>

<!-- Split line for half-width devices -->
{#if isHalfWidth}
  <line
    x1={railWidth + interiorWidth / 2}
    y1={previewY}
    x2={railWidth + interiorWidth / 2}
    y2={previewY + height * uHeight}
    class="slot-divider"
    stroke-dasharray="4 2"
  />
{/if}

<!-- Drop preview rectangle (half-width for half-width devices) -->
<rect
  x={isHalfWidth && slotPosition === "right"
    ? railWidth + interiorWidth / 2 + 2
    : railWidth + 2}
  y={previewY}
  width={isHalfWidth ? interiorWidth / 2 - 4 : interiorWidth - 4}
  height={height * uHeight - 2}
  class="drop-preview"
  data-testid="rack-drop-zone"
  class:drop-valid={feedback === "valid"}
  class:drop-invalid={feedback === "invalid"}
  class:drop-blocked={feedback === "blocked"}
  rx="2"
  ry="2"
/>

<style>
  .drop-preview {
    pointer-events: none;
    stroke-dasharray: 4 2;
    opacity: 0.8;
  }

  .drop-valid {
    fill: var(--colour-dnd-valid-bg);
    stroke: var(--colour-dnd-valid);
    stroke-width: 2;
  }

  .drop-invalid {
    fill: var(--colour-dnd-invalid-bg);
    stroke: var(--colour-dnd-invalid);
    stroke-width: 2;
  }

  .drop-blocked {
    fill: var(--colour-dnd-invalid-bg);
    stroke: var(--colour-dnd-invalid);
    stroke-width: 2;
  }

  .slot-divider {
    stroke: var(--colour-selection);
    stroke-width: 1;
    opacity: 0.7;
    pointer-events: none;
  }
</style>
