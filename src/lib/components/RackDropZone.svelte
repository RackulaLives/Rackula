<!--
  RackDropZone SVG Component
  Renders the drop preview indicator during drag-and-drop operations.
  Shows a dashed rectangle at the target position with valid/invalid/blocked styling.

  This is a pure rendering component — no interaction logic.
  Must be rendered after devices in SVG order (appears on top).
-->
<script lang="ts">
  import type { DropFeedback } from "$lib/utils/dragdrop";
  import { Tween, prefersReducedMotion } from "svelte/motion";
  import { cubicOut } from "svelte/easing";

  interface Props {
    /** Drop preview position (1-indexed U position from bottom) */
    position: number;
    /** Height of the device being dropped in U */
    height: number;
    /** Feedback state: valid, invalid, or blocked */
    feedback: DropFeedback;
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

  // Glide between whole-U slots. Slot targets are discrete commits, never
  // per-frame pointer tracking, so the tween cannot fight the pointer.
  const previewYMotion = Tween.of(() => previewY, {
    duration: 90,
    easing: cubicOut,
  });
</script>

<!-- Drop preview rectangle (carrier-first: always full-width) -->
<rect
  x={railWidth + 2}
  y={prefersReducedMotion.current ? previewY : previewYMotion.current}
  width={interiorWidth - 4}
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
</style>
