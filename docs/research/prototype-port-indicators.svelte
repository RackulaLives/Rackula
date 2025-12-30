<!--
  PORT INDICATORS SVG PROTOTYPE

  This is a research prototype demonstrating how network interface ports
  could be rendered on device SVG elements in Rackula.

  NOT FOR PRODUCTION - This is documentation for spike #237

  Key concepts demonstrated:
  1. SVG circles for port indicators at device bottom edge
  2. Color coding by interface type
  3. foreignObject overlays for click events
  4. Zoom-level-aware rendering (hide at small scales)
  5. Hover state with tooltip potential
-->
<script lang="ts">
  // Types for interface ports (aligned with NetBox schema)
  interface InterfaceTemplate {
    name: string;
    type: InterfaceType;
    label?: string;
    mgmt_only?: boolean;
    position?: 'front' | 'rear';
    poe_mode?: 'pd' | 'pse';
  }

  type InterfaceType =
    | '1000base-t'      // 1GbE RJ45
    | '10gbase-t'       // 10GbE RJ45
    | '10gbase-x-sfpp'  // 10GbE SFP+
    | '25gbase-x-sfp28' // 25GbE SFP28
    | '40gbase-x-qsfpp' // 40GbE QSFP+
    | '100gbase-x-qsfp28'; // 100GbE QSFP28

  // Color scheme by interface type
  const INTERFACE_COLORS: Record<InterfaceType, string> = {
    '1000base-t': '#10b981',      // Emerald - 1GbE
    '10gbase-t': '#3b82f6',       // Blue - 10GbE copper
    '10gbase-x-sfpp': '#8b5cf6',  // Purple - SFP+
    '25gbase-x-sfp28': '#f59e0b', // Amber - SFP28
    '40gbase-x-qsfpp': '#ef4444', // Red - QSFP+
    '100gbase-x-qsfp28': '#ec4899', // Pink - QSFP28
  };

  // Props
  interface Props {
    interfaces: InterfaceTemplate[];
    deviceWidth: number;
    deviceHeight: number;
    rackView: 'front' | 'rear';
    showPorts?: boolean;  // Toggle visibility
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

  // Constants for port rendering
  const PORT_RADIUS = 3;
  const PORT_SPACING = 8;
  const PORT_PADDING = 4;
  const PORT_Y_OFFSET = 8; // Distance from bottom of device

  // Filter interfaces for current view
  const visibleInterfaces = $derived(
    interfaces.filter(iface => {
      const pos = iface.position ?? 'front';
      return pos === rackView;
    })
  );

  // Calculate port positions (center horizontally)
  const portPositions = $derived.by(() => {
    const count = visibleInterfaces.length;
    if (count === 0) return [];

    const totalWidth = (count - 1) * PORT_SPACING;
    const startX = (deviceWidth - totalWidth) / 2;
    const y = deviceHeight - PORT_Y_OFFSET;

    return visibleInterfaces.map((iface, i) => ({
      iface,
      x: startX + i * PORT_SPACING,
      y,
      color: INTERFACE_COLORS[iface.type] ?? '#6b7280',
    }));
  });

  // Check if ports should be hidden due to density
  // For high-density devices (>24 ports), consider grouping
  const isHighDensity = $derived(visibleInterfaces.length > 24);

  // Group ports for high-density devices
  const portGroups = $derived.by(() => {
    if (!isHighDensity) return null;

    // Group by type
    const groups = new Map<InterfaceType, InterfaceTemplate[]>();
    for (const iface of visibleInterfaces) {
      const list = groups.get(iface.type) ?? [];
      list.push(iface);
      groups.set(iface.type, list);
    }
    return groups;
  });

  function handlePortClick(iface: InterfaceTemplate) {
    onPortClick?.(iface);
  }
</script>

{#if showPorts && portPositions.length > 0}
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
          stroke="rgba(0,0,0,0.3)"
          stroke-width="0.5"
        />

        <!-- Management interface indicator (smaller inner circle) -->
        {#if iface.mgmt_only}
          <circle
            class="port-mgmt-indicator"
            cx={x}
            cy={y}
            r={1}
            fill="white"
          />
        {/if}

        <!-- PoE indicator (lightning bolt or similar) -->
        {#if iface.poe_mode === 'pse'}
          <text
            class="port-poe-indicator"
            x={x}
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
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          class="port-click-container"
        >
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
      <!-- Shows count badges instead of individual ports -->
      {@const groupArray = portGroups ? Array.from(portGroups.entries()) : []}
      {@const badgeWidth = 24}
      {@const badgeSpacing = 4}
      {@const totalBadgeWidth = groupArray.length * (badgeWidth + badgeSpacing) - badgeSpacing}
      {@const startX = (deviceWidth - totalBadgeWidth) / 2}
      {@const y = deviceHeight - PORT_Y_OFFSET}

      {#each groupArray as [type, ifaces], i (type)}
        {@const x = startX + i * (badgeWidth + badgeSpacing)}
        <g class="port-group-badge" transform="translate({x}, {y - 4})">
          <rect
            width={badgeWidth}
            height="8"
            rx="2"
            fill={INTERFACE_COLORS[type] ?? '#6b7280'}
            stroke="rgba(0,0,0,0.3)"
            stroke-width="0.5"
          />
          <text
            x={badgeWidth / 2}
            y="6"
            text-anchor="middle"
            class="port-count-text"
          >
            {ifaces.length}
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
    transition: r 150ms ease-out;
  }

  .port-circle:hover {
    r: 4;
  }

  .port-mgmt-indicator {
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
    background: rgba(255, 255, 255, 0.2);
  }

  .port-click-target:focus {
    outline: 2px solid var(--colour-selection, #ff79c6);
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
    fill: white;
    font-size: 6px;
    font-weight: 600;
    font-family: var(--font-mono, monospace);
    text-shadow: 0 0.5px 1px rgba(0, 0, 0, 0.5);
  }

  .port-group-badge rect {
    transition: transform 150ms ease-out;
  }

  .port-group-badge:hover rect {
    transform: scale(1.1);
  }
</style>
