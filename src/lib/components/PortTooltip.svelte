<!--
  PortTooltip Component
  Shows detailed information about a network interface port on hover.
  Renders at the document level, positioned using fixed coordinates.
-->
<script lang="ts">
  import type { InterfaceType } from "$lib/types";
  import { getPortTooltipState } from "$lib/stores/portTooltip.svelte";

  // Get reactive tooltip state from store
  const tooltipState = $derived(getPortTooltipState());
  const port = $derived(tooltipState.port);
  const x = $derived(tooltipState.x);
  const y = $derived(tooltipState.y);
  const visible = $derived(tooltipState.visible);

  // Human-readable type names
  const TYPE_LABELS: Partial<Record<InterfaceType, string>> = {
    "1000base-t": "1GbE (RJ45)",
    "10gbase-t": "10GbE (RJ45)",
    "10gbase-x-sfpp": "10GbE SFP+",
    "25gbase-x-sfp28": "25GbE SFP28",
    "40gbase-x-qsfpp": "40GbE QSFP+",
    "100gbase-x-qsfp28": "100GbE QSFP28",
    "1000base-x-sfp": "1GbE SFP",
    console: "Console",
    management: "Management",
  };

  // Get human-readable type label
  function getTypeLabel(type: InterfaceType): string {
    return TYPE_LABELS[type] ?? type;
  }

  // Get PoE label
  function getPoELabel(
    poeMode?: "pd" | "pse",
    poeType?: string,
  ): string | null {
    if (!poeMode) return null;

    const modeLabel = poeMode === "pse" ? "PoE Source" : "PoE Powered";
    if (poeType) {
      // Parse common PoE types
      if (poeType.includes("802.3af")) return `${modeLabel} (802.3af)`;
      if (poeType.includes("802.3at")) return `${modeLabel} (PoE+)`;
      if (poeType.includes("802.3bt")) return `${modeLabel} (PoE++)`;
      return `${modeLabel} (${poeType})`;
    }
    return modeLabel;
  }
</script>

{#if visible && port}
  <div class="port-tooltip" role="tooltip" style="left: {x}px; top: {y}px;">
    <div class="port-tooltip-name">{port.label ?? port.name}</div>
    <div class="port-tooltip-type">{getTypeLabel(port.type)}</div>
    {#if port.mgmt_only}
      <div class="port-tooltip-badge mgmt">Management Only</div>
    {/if}
    {#if port.poe_mode}
      <div class="port-tooltip-badge poe">
        ⚡ {getPoELabel(port.poe_mode, port.poe_type)}
      </div>
    {/if}
  </div>
{/if}

<style>
  .port-tooltip {
    position: fixed;
    z-index: var(--z-tooltip, 1000);
    padding: var(--space-2);
    background-color: var(--colour-surface-overlay);
    color: var(--colour-text-inverse);
    font-size: var(--font-size-xs);
    border-radius: var(--radius-sm);
    pointer-events: none;
    box-shadow: var(--shadow-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 120px;
    max-width: 200px;
    transform: translate(-50%, -100%) translateY(-8px);
    animation: tooltip-fade-in var(--duration-fast, 100ms)
      var(--ease-out, ease-out);
  }

  @keyframes tooltip-fade-in {
    from {
      opacity: 0;
      transform: translate(-50%, -100%) translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -100%) translateY(-8px);
    }
  }

  .port-tooltip-name {
    font-weight: 600;
    font-family: var(--font-mono, monospace);
    color: var(--colour-text-inverse);
    word-break: break-word;
  }

  .port-tooltip-type {
    color: var(--colour-text-muted-inverse, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-xs);
  }

  .port-tooltip-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 2px 6px;
    border-radius: var(--radius-xs, 2px);
    font-size: 10px;
    font-weight: 500;
  }

  .port-tooltip-badge.mgmt {
    background-color: rgba(255, 255, 255, 0.15);
    color: var(--colour-text-inverse);
  }

  .port-tooltip-badge.poe {
    background-color: rgba(251, 191, 36, 0.2);
    color: var(--colour-warning, #fbbf24);
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .port-tooltip {
      animation: none;
    }
  }
</style>
