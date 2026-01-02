<!--
  PortIndicators SVG Component
  Renders network interface port indicators on device SVG elements.

  Features:
  - Color-coded circles by interface type
  - Low-density mode: individual ports (≤24 ports)
  - High-density mode: grouped badges (>24 ports)
  - Management interface indicator (inner white dot)
  - PoE indicator (lightning bolt) for PSE interfaces
  - Click targets via foreignObject overlays
-->
<script lang="ts">
  import type { InterfaceTemplate, InterfaceType, RackView } from "$lib/types";

  interface Props {
    interfaces: InterfaceTemplate[];
    deviceWidth: number;
    deviceHeight: number;
    rackView: RackView;
    showPorts?: boolean;
    onPortClick?: (iface: InterfaceTemplate) => void;
  }

  let {
    interfaces,
    deviceWidth,
    deviceHeight,
    rackView,
    showPorts = true,
    onPortClick,
  }: Props = $props();

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

  // Default color for unknown types
  const DEFAULT_COLOR = "var(--colour-port-default)";

  // Constants for port rendering
  const PORT_RADIUS = 3;
  const PORT_SPACING = 8;
  const PORT_Y_OFFSET = 8; // Distance from bottom of device

  // High-density threshold
  const HIGH_DENSITY_THRESHOLD = 24;

  // Badge dimensions for high-density mode
  const BADGE_WIDTH = 24;
  const BADGE_HEIGHT = 8;
  const BADGE_SPACING = 4;

  // Get color for interface type
  function getInterfaceColor(type: InterfaceType): string {
    return INTERFACE_COLORS[type] ?? DEFAULT_COLOR;
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

  // Calculate port positions (centered horizontally)
  const portPositions = $derived.by(() => {
    if (isHighDensity) return [];

    const count = visibleInterfaces.length;
    if (count === 0) return [];

    const totalWidth = (count - 1) * PORT_SPACING;
    const startX = (deviceWidth - totalWidth) / 2;
    const y = deviceHeight - PORT_Y_OFFSET;

    return visibleInterfaces.map((iface, i) => ({
      iface,
      x: startX + i * PORT_SPACING,
      y,
      color: getInterfaceColor(iface.type),
    }));
  });

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

  function handlePortClick(iface: InterfaceTemplate) {
    onPortClick?.(iface);
  }
</script>

{#if showPorts && visibleInterfaces.length > 0}
  <g class="port-indicators">
    {#if !isHighDensity}
      <!-- Individual port circles for low-density devices -->
      {#each portPositions as { iface, x, y, color } (iface.name)}
        <circle
          class="port-circle"
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
      {/each}

      <!-- Invisible click targets (larger than visual ports) -->
      <foreignObject
        x="0"
        y={deviceHeight - PORT_Y_OFFSET - 8}
        width={deviceWidth}
        height="16"
        class="port-click-overlay"
      >
        <div xmlns="http://www.w3.org/1999/xhtml" class="port-click-container">
          {#each portPositions as { iface, x } (iface.name)}
            <button
              type="button"
              class="port-click-target"
              style="left: {x - 6}px; top: 2px;"
              title="{iface.name} ({iface.type})"
              onclick={() => handlePortClick(iface)}
            >
              <span class="sr-only">{iface.name}</span>
            </button>
          {/each}
        </div>
      </foreignObject>
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

  .port-click-overlay {
    overflow: visible;
    pointer-events: auto;
  }

  .port-click-container {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .port-click-target {
    position: absolute;
    width: 12px;
    height: 12px;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
    border-radius: 50%;
  }

  .port-click-target:hover {
    background: var(--colour-port-hover);
  }

  .port-click-target:focus {
    outline: 2px solid var(--colour-selection);
    outline-offset: 1px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .port-count-text {
    fill: var(--colour-port-indicator);
    font-size: 6px;
    font-weight: 600;
    font-family: var(--font-mono, monospace);
    text-shadow: var(--shadow-port-text);
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
