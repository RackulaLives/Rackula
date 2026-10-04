<!--
  PortIndicators SVG Component
  Renders network interface port indicators on device SVG elements.

  Features:
  - Markers colour-coded by interface type; shape by medium (#3450):
    pluggable types are rounded squares, copper and the rest are circles
  - Strip mode: one marker per port on the shared right-aligned grid
  - Chip mode: a single count chip for more than 24 ports, and for a strip
    collapsed on a narrow rack. The chip opens a port picker (#3462)
  - Management interface indicator (inner white dot)
  - PoE indicator (ring inside the marker) for PSE interfaces
  - SVG-native click targets (Safari compatible, fixes #400)
  - Hover tooltips with port details (#251)
-->
<script lang="ts">
  import { DropdownMenu } from "bits-ui";
  import type { ClassValue } from "svelte/elements";
  import type {
    InterfaceTemplate,
    InterfaceType,
    KnownInterfaceType,
    PlacedPort,
    PortClickInfo,
    RackView,
  } from "$lib/types";
  import {
    showPortTooltip,
    hidePortTooltip,
  } from "$lib/stores/portTooltip.svelte";
  import { getConnectionCreationStore } from "$lib/stores/connection-creation.svelte";
  import { getConnectionStore } from "$lib/stores/connection.svelte";
  import "$lib/styles/menu.css";
  import {
    getDominantInterfaceType,
    getPortCategory,
    getPortMarkerShape,
    isKnownInterfaceType,
    type PortMarkerShape,
  } from "$lib/utils/port-utils";
  import {
    computeVisiblePortLayout,
    getPortChipPosition,
    PORT_MARKER_SIZE,
    PORT_PITCH,
  } from "$lib/utils/port-geometry";

  interface Props {
    interfaces: InterfaceTemplate[];
    /** Placed port instances for this device, keyed to `interfaces` by template_index (#3089). */
    ports?: PlacedPort[];
    deviceWidth: number;
    deviceHeight: number;
    rackView: RackView;
    showPorts?: boolean;
    onPortClick?: (info: PortClickInfo) => void;
  }

  let {
    interfaces,
    ports = [],
    deviceWidth,
    deviceHeight,
    rackView,
    showPorts = true,
    onPortClick,
  }: Props = $props();

  // Tooltip delay timer (reactive state for proper cleanup)
  let hoverTimeoutId = $state<ReturnType<typeof setTimeout> | null>(null);
  const TOOLTIP_DELAY_MS = 300;

  // Connection-creation mode (#1932): while armed, the source port shows as
  // active and every other rendered port shows as a potential target. Read
  // directly from the store (like placementStore elsewhere) rather than
  // threaded as a prop, since every PortIndicators instance needs the same
  // global mode state.
  const connectionCreationStore = getConnectionCreationStore();
  const connectionSourcePortId = $derived(
    connectionCreationStore.isCreating
      ? connectionCreationStore.sourcePortId
      : null,
  );
  const isConnectionCreationMode = $derived(connectionCreationStore.isCreating);

  // Cleanup timeout on component unmount to prevent dangling timers
  $effect(() => {
    return () => {
      if (hoverTimeoutId) {
        clearTimeout(hoverTimeoutId);
        hoverTimeoutId = null;
      }
    };
  });

  // Color scheme by interface type (NetBox-inspired)
  // Uses CSS custom properties from tokens.css for design system consistency
  const INTERFACE_COLORS: Partial<Record<KnownInterfaceType, string>> = {
    "1000base-t": "var(--colour-port-1gbe)", // Emerald - 1GbE
    "10gbase-t": "var(--colour-port-10gbe)", // Blue - 10GbE copper
    "1000base-x-sfp": "var(--colour-port-sfp)", // Cyan - 1GbE SFP
    "10gbase-x-sfpp": "var(--colour-port-sfpp)", // Purple - SFP+
    "25gbase-x-sfp28": "var(--colour-port-sfp28)", // Amber - SFP28
    "40gbase-x-qsfpp": "var(--colour-port-qsfpp)", // Red - QSFP+
    "100gbase-x-qsfp28": "var(--colour-port-qsfp28)", // Pink - QSFP28
  };

  const CATEGORY_COLORS = {
    network: "var(--colour-port-default)",
    console: "var(--colour-port-console)",
    power: "var(--colour-port-power)",
    av: "var(--colour-port-av)",
  };

  // Corner radius of a square marker, as a share of its size.
  const MARKER_CORNER_RATIO = 0.2;

  // The PoE ring sits just inside the marker's own outline, so it never
  // reaches into the neighbouring cell on the PORT_PITCH grid.
  const POE_RING_SIZE = PORT_MARKER_SIZE - 0.5;

  // One hit target per grid cell: neighbours touch but do not overlap.
  const HIT_TARGET_RADIUS = PORT_PITCH / 2;

  // An unknown type (#3289) falls back to its category colour.
  function getInterfaceColor(type: InterfaceType): string {
    return (
      (isKnownInterfaceType(type) ? INTERFACE_COLORS[type] : undefined) ??
      CATEGORY_COLORS[getPortCategory(type)]
    );
  }

  // Filter interfaces for current view
  const visibleInterfaces = $derived(
    interfaces.filter((iface) => {
      const pos = iface.position ?? "front";
      return pos === rackView;
    }),
  );

  // Port positions (right-aligned grid, or stacked on the chip's marker when a
  // narrow rack collapses the strip), keyed by PlacedPort.id where one exists.
  // Delegates to the shared geometry helper (#3089) so this layout and the one
  // ConnectionLayer (#1931) will look up an anchor from are always identical.
  const portPositions = $derived(
    computeVisiblePortLayout({
      interfaces,
      ports,
      rackView,
      deviceWidth,
      deviceHeight,
    }).map((entry) => ({
      ...entry,
      color: getInterfaceColor(entry.iface.type),
    })),
  );

  // The count chip, when the ports do not render as a strip: more than
  // HIGH_DENSITY_THRESHOLD ports, or a strip collapsed on a narrow rack. Its
  // marker takes the shape and colour of the most frequent visible type.
  const chip = $derived.by(() => {
    const position = getPortChipPosition({
      interfaces,
      ports,
      rackView,
      deviceWidth,
      deviceHeight,
    });
    const type = getDominantInterfaceType(
      visibleInterfaces.map((iface) => iface.type),
    );
    if (!position || type === undefined) return undefined;

    const markerRight = position.markerCx + PORT_MARKER_SIZE / 2;
    return {
      ...position,
      shape: getPortMarkerShape(type),
      color: getInterfaceColor(type),
      // The count is centred in the space right of the marker.
      textX: (markerRight + position.x + position.width) / 2,
    };
  });

  function handlePortClick(
    iface: InterfaceTemplate,
    port: PlacedPort | undefined,
  ) {
    onPortClick?.({ portId: port?.id, iface, port });
  }

  // The chip's port picker (#3462). Its rows only exist while it is open.
  let pickerOpen = $state(false);
  const connectionStore = getConnectionStore();
  const chipHasSource = $derived(
    connectionSourcePortId != null &&
      portPositions.some(({ port }) => port?.id === connectionSourcePortId),
  );

  // A legacy interface with no PlacedPort cannot be connected (#3089).
  const chipHasChoosablePort = $derived(
    portPositions.some(({ port }) => port?.id != null),
  );

  function portStatus(port: PlacedPort | undefined): string {
    if (port?.id == null) return "unavailable";
    if (port.id === connectionSourcePortId) {
      return "connection source";
    }
    if (port && connectionStore.getConnectionsForPort(port.id).length > 0) {
      return "connected";
    }
    return "free";
  }

  // Keys the chip opens the picker with must not also select the device or
  // run a global shortcut (arrows move the selected device).
  function handleChipKeyDown(event: KeyboardEvent) {
    if (["Enter", " ", "ArrowDown"].includes(event.key)) {
      event.stopPropagation();
    }
  }

  // The picker keeps its keys to itself for the same reason. Escape closes it
  // here rather than reaching the window, where it would also cancel
  // connection creation or clear the selection.
  function handlePickerKeyDown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      pickerOpen = false;
    }
  }

  function handlePortMouseEnter(event: MouseEvent, iface: InterfaceTemplate) {
    // Clear any pending timeout
    if (hoverTimeoutId) {
      clearTimeout(hoverTimeoutId);
    }

    // Delay before showing tooltip
    hoverTimeoutId = setTimeout(() => {
      const target = event.target as SVGElement;
      const rect = target.getBoundingClientRect();
      showPortTooltip(iface, rect.left + rect.width / 2, rect.top);
    }, TOOLTIP_DELAY_MS);
  }

  function handlePortMouseLeave() {
    // Clear pending timeout
    if (hoverTimeoutId) {
      clearTimeout(hoverTimeoutId);
      hoverTimeoutId = null;
    }
    hidePortTooltip();
  }
</script>

<!-- A marker outline centred on (cx, cy): a rounded square or a circle. -->
{#snippet marker(
  shape: PortMarkerShape,
  cx: number,
  cy: number,
  size: number,
  classes: ClassValue,
  fill: string,
)}
  {#if shape === "square"}
    <rect
      class={classes}
      x={cx - size / 2}
      y={cy - size / 2}
      width={size}
      height={size}
      rx={size * MARKER_CORNER_RATIO}
      {fill}
    />
  {:else}
    <circle class={classes} {cx} {cy} r={size / 2} {fill} />
  {/if}
{/snippet}

{#if showPorts && visibleInterfaces.length > 0}
  <g class="port-indicators">
    {#if chip}
      <!-- Count chip: the dominant type's marker, then the visible port count.
           The chip box is the one target for all its ports: it opens the
           port picker, whose rows act like clicking a port marker (#3462). -->
      <DropdownMenu.Root bind:open={pickerOpen}>
        <DropdownMenu.Trigger
          onkeydown={handleChipKeyDown}
          disabled={!chipHasChoosablePort}
        >
          {#snippet child({ props })}
            <rect
              {...props}
              class={[
                "port-chip",
                chipHasSource && "port-connection-source",
                isConnectionCreationMode &&
                  !chipHasSource &&
                  "port-connection-target",
              ]}
              x={chip.x}
              y={chip.y}
              width={chip.width}
              height={chip.height}
              rx="2"
              role="button"
              tabindex={chipHasChoosablePort ? 0 : -1}
              aria-disabled={!chipHasChoosablePort}
              aria-label="{chipHasChoosablePort
                ? 'Choose a port'
                : 'No ports to choose'} ({chip.count} ports){chipHasSource
                ? ', has connection source'
                : isConnectionCreationMode
                  ? ', potential connection target'
                  : ''}"
            />
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            class="menu-content port-picker"
            aria-label="Ports"
            side="bottom"
            align="end"
            sideOffset={4}
            preventScroll={false}
            onkeydown={handlePickerKeyDown}
          >
            {#each portPositions as { iface, port }, i (port?.id ?? i)}
              {@const name = iface.label ?? iface.name}
              {@const status = portStatus(port)}
              <DropdownMenu.Item
                class="menu-item"
                disabled={port?.id == null}
                aria-label="{name}, {iface.type}, {status}"
                onSelect={() => handlePortClick(iface, port)}
              >
                <span
                  class="port-picker-swatch"
                  style:background-color={getInterfaceColor(iface.type)}
                  aria-hidden="true"
                ></span>
                <span class="menu-label">{name}</span>
                <span class="port-picker-type">{iface.type}</span>
                <span class="port-picker-status">{status}</span>
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {@render marker(
        chip.shape,
        chip.markerCx,
        chip.markerCy,
        PORT_MARKER_SIZE,
        "port-marker",
        chip.color,
      )}
      <text
        class="port-count-text"
        x={chip.textX}
        y={chip.cy}
        text-anchor="middle"
        dominant-baseline="central"
      >
        {chip.count}
      </text>
    {:else}
      <!-- One marker per port in strip mode -->
      <!-- Keyed by PlacedPort.id when available; falls back to the loop
           index, not iface.name, since duplicate interface names are legal
           (see port-geometry.ts) and legacy layouts can leave every port
           undefined, which would make an iface.name-only fallback collide. -->
      {#each portPositions as { iface, port, x, y, color }, i (port?.id ?? i)}
        {@const shape = getPortMarkerShape(iface.type)}
        {@render marker(
          shape,
          x,
          y,
          PORT_MARKER_SIZE,
          [
            "port-marker",
            port?.id === connectionSourcePortId && "port-connection-source",
            isConnectionCreationMode &&
              port?.id != null &&
              port.id !== connectionSourcePortId &&
              "port-connection-target",
          ],
          color,
        )}

        <!-- PoE indicator (ring inside the marker for PSE interfaces) -->
        {#if iface.poe_mode === "pse"}
          {@render marker(
            shape,
            x,
            y,
            POE_RING_SIZE,
            "port-poe-indicator",
            "none",
          )}
        {/if}

        <!-- Management interface indicator (smaller inner circle) -->
        {#if iface.mgmt_only}
          <circle class="port-mgmt-indicator" cx={x} cy={y} r={1} />
        {/if}
      {/each}
      <!-- Invisible SVG click targets, one per port cell (Safari compatible). -->
      {#each portPositions as { iface, port, x, y }, i (port?.id ?? i)}
        <circle
          class="port-hit-target"
          class:port-connection-source={port?.id === connectionSourcePortId}
          class:port-connection-target={isConnectionCreationMode &&
            port?.id != null &&
            port.id !== connectionSourcePortId}
          cx={x}
          cy={y}
          r={HIT_TARGET_RADIUS}
          fill="transparent"
          role="button"
          tabindex="0"
          aria-label="{iface.label ?? iface.name} ({iface.type}){port?.id ===
          connectionSourcePortId
            ? ', connection source'
            : isConnectionCreationMode &&
                port?.id != null &&
                port.id !== connectionSourcePortId
              ? ', potential connection target'
              : ''}"
          onclick={() => handlePortClick(iface, port)}
          onmouseenter={(e) => handlePortMouseEnter(e, iface)}
          onmouseleave={handlePortMouseLeave}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handlePortClick(iface, port);
            }
          }}
        >
          <title>{iface.label ?? iface.name} ({iface.type})</title>
        </circle>
      {/each}
    {/if}
  </g>
{/if}

<style>
  .port-indicators {
    pointer-events: none;
  }

  .port-marker {
    stroke: var(--colour-port-stroke);
    stroke-width: 0.5;
  }

  .port-mgmt-indicator {
    fill: var(--colour-port-indicator);
    pointer-events: none;
  }

  .port-poe-indicator {
    stroke: var(--colour-port-power);
    stroke-width: 0.75;
    pointer-events: none;
  }

  .port-chip {
    fill: var(--colour-port-chip-bg);
    pointer-events: auto;
    cursor: pointer;
  }

  .port-chip:hover:not([aria-disabled="true"]) {
    fill: var(--colour-port-hover);
  }

  .port-chip[aria-disabled="true"] {
    cursor: default;
  }

  .port-chip:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 1px;
  }

  /* Rendered by bits-ui in a portal, so the class is not scoped here. A
     48-port device scrolls within the picker instead of past the viewport. */
  :global(.port-picker) {
    max-height: min(
      var(--bits-dropdown-menu-content-available-height, 320px),
      320px
    );
    overflow-y: auto;
  }

  .port-picker-swatch {
    width: 8px;
    height: 8px;
    flex-shrink: 0;
    border-radius: var(--radius-sm);
  }

  .port-picker-type,
  .port-picker-status {
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted-inverse);
  }

  .port-picker-type {
    font-family: var(--font-mono, monospace);
  }

  .port-hit-target {
    pointer-events: auto;
    cursor: pointer;
  }

  .port-hit-target:hover {
    fill: var(--colour-port-hover);
  }

  .port-hit-target:focus {
    outline: 2px solid var(--colour-selection);
    outline-offset: 1px;
  }

  .port-count-text {
    fill: var(--colour-port-indicator);
    font-size: 6px;
    font-weight: 600;
    font-family: var(--font-mono, monospace);
    text-shadow: var(--shadow-port-text);
  }

  /* Connection-creation mode (#1932): the source port shows as active... */
  .port-connection-source {
    stroke: var(--colour-selection, var(--dracula-pink, #ff79c6));
    stroke-width: 1.5;
  }

  /* ...every other port shows as a potential target while the mode is armed.
     Stroke-only: the hit-target's fill stays transparent (or its existing
     hover tint) so this layers with, rather than replaces, hover feedback. */
  .port-connection-target {
    stroke: var(--colour-selection, var(--dracula-pink, #ff79c6));
    stroke-width: 1;
    stroke-dasharray: 1.5 1;
  }
</style>
