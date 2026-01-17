<!--
  ContainerSlots SVG Component
  Renders a slot grid overlay for container devices.
  Visual states per Epic #159 UX Principles:
  - Empty slot: Dotted border (muted)
  - Valid drop target: Solid border (accent color)
  - Invalid drop target: Red dotted border
  - Occupied slot: Shows contained device
  - Container selected: Slot grid becomes visible
-->
<script lang="ts">
  import type { DeviceType, Slot } from "$lib/types";

  interface Props {
    /** The container device type with slots array */
    containerType: DeviceType;
    /** Width of the container in pixels */
    containerWidth: number;
    /** Height of the container in pixels */
    containerHeight: number;
    /** ID of the currently selected slot (null if none) */
    selectedSlotId: string | null;
    /** ID of the slot that is currently a drop target (null if none) */
    dropTargetSlotId?: string | null;
    /** Whether the current drop target is valid for placement */
    isValidDropTarget?: boolean;
    /** Callback when a slot is clicked */
    onslotclick?: (slotId: string) => void;
  }

  let {
    containerType,
    containerWidth,
    containerHeight,
    selectedSlotId,
    dropTargetSlotId = null,
    isValidDropTarget = false,
    onslotclick,
  }: Props = $props();

  // Get slots from container type, defaulting to empty array
  const slots = $derived(containerType.slots ?? []);

  // Detect container type for visual styling variants
  const isShelf = $derived(containerType.category === "shelf");
  // Chassis-style: blade chassis, modular switches, or subdevice_role="parent"
  const isChassis = $derived(
    !isShelf &&
      (containerType.subdevice_role === "parent" ||
        containerType.category === "chassis" ||
        (containerType.slots?.length ?? 0) > 2), // Many slots suggests blade chassis
  );

  // Pre-compute cumulative x offsets for all slots (O(n) instead of O(n²))
  // Each slot lookup becomes O(1) since we just read from this array by index
  const cumulativeXOffsets = $derived.by(() => {
    const offsets: number[] = [];
    let cumulative = 0;
    for (const slot of slots) {
      offsets.push(cumulative);
      cumulative += containerWidth * (slot.width_fraction ?? 1.0);
    }
    return offsets;
  });

  /**
   * Calculate the geometry (position and dimensions) for a slot.
   * Slots are laid out horizontally based on their width_fraction and column index.
   * Uses precomputed cumulative x offsets for O(1) lookup per slot.
   *
   * @param slot - The slot to calculate geometry for
   * @param index - The index of the slot in the slots array
   * @returns Object with x, y, width, height in pixels
   */
  function getSlotGeometry(
    slot: Slot,
    index: number,
  ): { x: number; y: number; width: number; height: number } {
    const widthFraction = slot.width_fraction ?? 1.0;
    const width = containerWidth * widthFraction;

    // Use precomputed offset (O(1) lookup)
    const xOffset = cumulativeXOffsets[index] ?? 0;

    // Default slot height to container height (single row)
    // Future: support multi-row containers via height_units
    const heightUnits = slot.height_units ?? 1;
    const totalRowHeight = containerHeight;
    const height = heightUnits * totalRowHeight;

    return { x: xOffset, y: 0, width, height };
  }

  /**
   * Build CSS class string for a slot based on its state.
   */
  function getSlotClass(slotId: string): string {
    const classes = ["container-slot"];

    if (slotId === selectedSlotId) {
      classes.push("selected");
    }

    if (slotId === dropTargetSlotId) {
      classes.push(
        isValidDropTarget ? "valid-drop-target" : "invalid-drop-target",
      );
    }

    return classes.join(" ");
  }

  function handleSlotClick(slotId: string) {
    onslotclick?.(slotId);
  }

  function handleSlotKeydown(event: KeyboardEvent, slotId: string) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      // Return focus to parent container device
      const container = (event.target as Element).closest(".rack-device");
      if (container instanceof SVGElement) {
        (container as unknown as HTMLElement).focus();
      }
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      handleSlotClick(slotId);
    }
  }
</script>

<g
  class="container-slots"
  class:shelf-style={isShelf}
  class:chassis-style={isChassis}
>
  {#each slots as slot, index (slot.id)}
    {@const geometry = getSlotGeometry(slot, index)}
    {@const slotClass = getSlotClass(slot.id)}
    {@const insetPadding = 2}
    <rect
      data-slot-id={slot.id}
      class={slotClass}
      x={geometry.x + insetPadding}
      y={geometry.y + insetPadding}
      width={geometry.width - insetPadding * 2}
      height={geometry.height - insetPadding * 2}
      rx="2"
      ry="2"
      onclick={() => handleSlotClick(slot.id)}
      onkeydown={(e) => handleSlotKeydown(e, slot.id)}
      role="button"
      tabindex="0"
      aria-label="{slot.name ?? slot.id} slot{selectedSlotId === slot.id
        ? ', selected'
        : ''}"
    />
    <!-- Bay label for chassis containers (when slot has a name) -->
    {#if isChassis && slot.name}
      <text
        class="bay-label"
        x={geometry.x + geometry.width / 2}
        y={geometry.y + 12}
        text-anchor="middle"
        font-size="9"
      >
        {slot.name}
      </text>
    {/if}
  {/each}
</g>

<style>
  .container-slots {
    pointer-events: none;
  }

  .container-slot {
    fill: transparent;
    stroke: var(--neutral-500);
    stroke-width: 1;
    stroke-dasharray: 4 2;
    cursor: pointer;
    pointer-events: auto;
    transition:
      stroke var(--duration-fast, 150ms) ease-out,
      stroke-dasharray var(--duration-fast, 150ms) ease-out,
      fill var(--duration-fast, 150ms) ease-out;
  }

  .container-slot:hover {
    stroke: var(--colour-selection);
    stroke-dasharray: none;
  }

  .container-slot:focus {
    outline: none;
    stroke: var(--colour-focus-ring);
    stroke-width: 2;
    stroke-dasharray: none;
  }

  .container-slot.selected {
    stroke: var(--colour-selection);
    stroke-width: 2;
    stroke-dasharray: none;
  }

  .container-slot.valid-drop-target {
    stroke: var(--colour-dnd-valid);
    stroke-width: 2;
    stroke-dasharray: none;
    fill: var(--colour-dnd-valid-bg);
  }

  .container-slot.invalid-drop-target {
    stroke: var(--colour-dnd-invalid);
    stroke-width: 2;
    stroke-dasharray: 4 2;
    fill: var(--colour-dnd-invalid-bg);
  }

  /* Shelf-specific styling - lighter, more subtle */
  .shelf-style .container-slot {
    stroke: var(--neutral-400);
    stroke-width: 0.5;
    stroke-dasharray: 2 4;
    opacity: 0.7;
  }

  .shelf-style .container-slot:hover {
    stroke: var(--colour-selection);
    stroke-dasharray: none;
    opacity: 1;
  }

  .shelf-style .container-slot:focus {
    stroke: var(--colour-focus-ring);
    stroke-width: 2;
    stroke-dasharray: none;
    opacity: 1;
  }

  .shelf-style .container-slot.selected {
    stroke: var(--colour-selection);
    stroke-width: 1.5;
    stroke-dasharray: none;
    opacity: 1;
  }

  /* Chassis-specific styling - blade chassis, modular switches
     More prominent borders to indicate enclosed device bays */
  .chassis-style .container-slot {
    stroke: var(--neutral-600);
    stroke-width: 1.5;
    stroke-dasharray: none;
    fill: rgba(0, 0, 0, 0.08);
  }

  .chassis-style .container-slot:hover {
    stroke: var(--colour-selection);
    stroke-width: 2;
    fill: rgba(var(--colour-selection-rgb, 74, 122, 138), 0.15);
  }

  .chassis-style .container-slot:focus {
    stroke: var(--colour-focus-ring);
    stroke-width: 2.5;
    fill: rgba(var(--colour-selection-rgb, 74, 122, 138), 0.1);
  }

  .chassis-style .container-slot.selected {
    stroke: var(--colour-selection);
    stroke-width: 2.5;
    fill: rgba(var(--colour-selection-rgb, 74, 122, 138), 0.12);
  }

  .chassis-style .container-slot.valid-drop-target {
    stroke: var(--colour-dnd-valid);
    stroke-width: 2.5;
    fill: var(--colour-dnd-valid-bg);
  }

  .chassis-style .container-slot.invalid-drop-target {
    stroke: var(--colour-dnd-invalid);
    stroke-width: 2;
    fill: var(--colour-dnd-invalid-bg);
  }

  /* Bay label styling for chassis containers */
  .bay-label {
    fill: var(--neutral-500);
    font-family: var(--font-family, system-ui, sans-serif);
    font-weight: 500;
    pointer-events: none;
    user-select: none;
    opacity: 0.8;
  }

  .chassis-style:hover .bay-label {
    opacity: 1;
  }

  /* Respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .container-slot {
      transition: none;
    }
  }
</style>
