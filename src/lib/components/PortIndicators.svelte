<!--
  PortIndicators SVG Component
  Renders network interface port indicators on device SVG elements.

  Features:
  - Color-coded circles by interface type
  - Low-density mode: individual ports (≤24 ports)
  - High-density mode: grouped badges (>24 ports)
  - Management interface indicator (inner white dot)
  - PoE indicator (lightning bolt) for PSE interfaces
  - SVG-native click targets (Safari compatible, fixes #400)
  - Hover tooltips with port details (#251)
-->
<script lang="ts">
  import type {
    InterfaceTemplate,
    InterfaceType,
    PlacedPort,
    PortClickInfo,
    PortDirection,
    RackView,
  } from "$lib/types";
  import {
    showPortTooltip,
    hidePortTooltip,
  } from "$lib/stores/portTooltip.svelte";
  import { getConnectionCreationStore } from "$lib/stores/connection-creation.svelte";
  import { getPortCategory, inferDirection } from "$lib/utils/port-utils";
  import {
    computeVisiblePortLayout,
    HIGH_DENSITY_THRESHOLD,
    PORT_Y_OFFSET,
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
  const INTERFACE_COLORS: Partial<Record<InterfaceType, string>> = {
    "1000base-t": "var(--colour-port-1gbe)", // Emerald - 1GbE
    "10gbase-t": "var(--colour-port-10gbe)", // Blue - 10GbE copper
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

  // Constants for port rendering
  const PORT_RADIUS = 3;

  // Badge dimensions for high-density mode
  const BADGE_WIDTH = 24;
  const BADGE_HEIGHT = 8;
  const BADGE_SPACING = 4;

  function getInterfaceColor(type: InterfaceType): string {
    return INTERFACE_COLORS[type] ?? CATEGORY_COLORS[getPortCategory(type)];
  }

  // Direction arrow shown for input/output ports (none for bidirectional,
  // and none when an AV type has no explicit or inferred direction).
  function getPortDirection(
    iface: InterfaceTemplate,
  ): PortDirection | undefined {
    return iface.direction ?? inferDirection(iface.type, iface.mgmt_only);
  }

  // Filter interfaces for current view
  const visibleInterfaces = $derived(
    interfaces.filter((iface) => {
      const pos = iface.position ?? "front";
      return pos === rackView;
    }),
  );

  // Check if we're in high-density mode
  const isHighDensity = $derived(
    visibleInterfaces.length > HIGH_DENSITY_THRESHOLD,
  );

  // Port positions (centered horizontally), keyed by PlacedPort.id where one
  // exists. Delegates to the shared geometry helper (#3089) so this layout
  // and the one ConnectionLayer (#1931) will look up an anchor from are
  // always identical.
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

  // Group ports by type for high-density mode
  const portGroups = $derived.by(() => {
    if (!isHighDensity) return [];

    // Use object instead of Map for ESLint compatibility
    const groups: Record<string, InterfaceTemplate[]> = {};
    for (const iface of visibleInterfaces) {
      const key = iface.type;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(iface);
    }

    return Object.entries(groups).map(([type, ifaces]) => ({
      type: type as InterfaceType,
      count: ifaces.length,
      color: getInterfaceColor(type as InterfaceType),
    }));
  });

  // Calculate badge positions for high-density mode
  const badgePositions = $derived.by(() => {
    if (portGroups.length === 0) return [];

    const totalWidth =
      portGroups.length * (BADGE_WIDTH + BADGE_SPACING) - BADGE_SPACING;
    const startX = (deviceWidth - totalWidth) / 2;
    const y = deviceHeight - PORT_Y_OFFSET;

    return portGroups.map((group, i) => ({
      ...group,
      x: startX + i * (BADGE_WIDTH + BADGE_SPACING),
      y: y - BADGE_HEIGHT / 2,
    }));
  });

  function handlePortClick(
    iface: InterfaceTemplate,
    port: PlacedPort | undefined,
  ) {
    onPortClick?.({ portId: port?.id, iface, port });
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

{#if showPorts && visibleInterfaces.length > 0}
  <g class="port-indicators">
    {#if !isHighDensity}
      <!-- Individual port circles for low-density devices -->
      <!-- Keyed by PlacedPort.id when available; falls back to the loop
           index, not iface.name, since duplicate interface names are legal
           (see port-geometry.ts) and legacy layouts can leave every port
           undefined, which would make an iface.name-only fallback collide. -->
      {#each portPositions as { iface, port, x, y, color }, i (port?.id ?? i)}
        <circle
          class="port-circle"
          class:port-connection-source={port?.id === connectionSourcePortId}
          class:port-connection-target={isConnectionCreationMode &&
            port?.id != null &&
            port.id !== connectionSourcePortId}
          cx={x}
          cy={y}
          r={PORT_RADIUS}
          fill={color}
          stroke-width="0.5"
        />

        <!-- Management interface indicator (smaller inner circle) -->
        {#if iface.mgmt_only}
          <circle class="port-mgmt-indicator" cx={x} cy={y} r={1} />
        {/if}

        <!-- PoE indicator (lightning bolt for PSE interfaces) -->
        {#if iface.poe_mode === "pse"}
          <text
            class="port-poe-indicator"
            {x}
            y={y - PORT_RADIUS - 2}
            text-anchor="middle"
            dominant-baseline="auto"
          >
            ⚡
          </text>
        {/if}

        <!-- Direction arrow (input/output only; bidirectional and unset show nothing) -->
        {#if getPortDirection(iface) === "input"}
          <text
            class="port-direction-indicator"
            x={x - PORT_RADIUS - 2}
            y={y + 2}
            text-anchor="end"
          >
            &#8594;
          </text>
        {:else if getPortDirection(iface) === "output"}
          <text
            class="port-direction-indicator"
            x={x + PORT_RADIUS + 2}
            y={y + 2}
            text-anchor="start"
          >
            &#8594;
          </text>
        {/if}
      {/each}

      <!-- Invisible SVG click targets (larger than visual ports, Safari compatible) -->
      {#each portPositions as { iface, port, x, y }, i (port?.id ?? i)}
        <circle
          class="port-hit-target"
          class:port-connection-source={port?.id === connectionSourcePortId}
          class:port-connection-target={isConnectionCreationMode &&
            port?.id != null &&
            port.id !== connectionSourcePortId}
          cx={x}
          cy={y}
          r={6}
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
    {:else}
      <!-- Grouped port summary for high-density devices -->
      {#each badgePositions as { type, count, color, x, y } (type)}
        <g class="port-group-badge" transform="translate({x}, {y})">
          <rect
            width={BADGE_WIDTH}
            height={BADGE_HEIGHT}
            rx="2"
            fill={color}
            stroke-width="0.5"
          />
          <text
            x={BADGE_WIDTH / 2}
            y={BADGE_HEIGHT - 2}
            text-anchor="middle"
            class="port-count-text"
          >
            {count}
          </text>
        </g>
      {/each}
    {/if}
  </g>
{/if}

<style>
  .port-indicators {
    pointer-events: none;
  }

  .port-circle {
    stroke: var(--colour-port-stroke);
    transition: r 150ms ease-out;
  }

  .port-mgmt-indicator {
    fill: var(--colour-port-indicator);
    pointer-events: none;
  }

  .port-poe-indicator {
    font-size: 6px;
    pointer-events: none;
  }

  .port-direction-indicator {
    fill: var(--colour-port-indicator);
    font-size: 6px;
    pointer-events: none;
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

  .port-group-badge rect {
    stroke: var(--colour-port-stroke);
    transition: transform 150ms ease-out;
  }

  /* Respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .port-circle,
    .port-group-badge rect {
      transition: none;
    }
  }
</style>
