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

  /**
   * Calculate the geometry (position and dimensions) for a slot.
   * Slots are laid out horizontally based on their width_fraction and column index.
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

    // Calculate x offset by summing widths of all preceding slots
    let xOffset = 0;
    for (let i = 0; i < index; i++) {
      const prevSlot = slots[i];
      if (prevSlot) {
        xOffset += containerWidth * (prevSlot.width_fraction ?? 1.0);
      }
    }

    // Default slot height to container height (single row)
    // Future: support multi-row containers via height_units
    const heightUnits = slot.height_units ?? 1;
    const totalRowHeight = containerHeight;
    const height = (heightUnits / 1) * totalRowHeight; // Normalized for single-row

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

<g class="container-slots">
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
    stroke: var(--dracula-green);
    stroke-width: 2;
    stroke-dasharray: none;
    fill: rgba(80, 250, 123, 0.1);
  }

  .container-slot.invalid-drop-target {
    stroke: var(--dracula-red);
    stroke-width: 2;
    stroke-dasharray: 4 2;
    fill: rgba(255, 85, 85, 0.1);
  }

  /* Respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .container-slot {
      transition: none;
    }
  }
</style>
