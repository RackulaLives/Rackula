<!--
  RackIndicator Component
  Shows current rack name and navigation dots on mobile when multiple racks exist.
  Switches to counter format (1/12) when >7 racks.
  Self-guarded: only renders on mobile with 2+ racks.
-->
<script lang="ts">
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";

  const viewportStore = getViewportStore();
  const layoutStore = getLayoutStore();
  const canvasStore = getCanvasStore();

  const DOT_THRESHOLD = 7;

  let activeIndex = $derived.by(() => {
    const idx = layoutStore.racks.findIndex(
      (r) => r.id === layoutStore.activeRackId,
    );
    return idx < 0 ? 0 : idx;
  });
  let activeRackName = $derived(layoutStore.activeRack?.name ?? "");
  let shouldShow = $derived(
    viewportStore.isMobile && layoutStore.racks.length > 1,
  );
  let useDots = $derived(layoutStore.racks.length <= DOT_THRESHOLD);

  function handleDotClick(rackId: string) {
    layoutStore.setActiveRack(rackId);
    canvasStore.focusRack(
      [rackId],
      layoutStore.racks,
      layoutStore.rack_groups,
      0,
    );
  }
</script>

{#if shouldShow}
  <div class="rack-indicator">
    <span class="rack-name">{activeRackName}</span>
    <div class="rack-nav">
      {#if useDots}
        {#each layoutStore.racks as rack (rack.id)}
          <button
            class="dot"
            class:active={rack.id === layoutStore.activeRackId}
            type="button"
            aria-label="Switch to {rack.name}"
            onclick={() => handleDotClick(rack.id)}
          >
            <span class="dot-indicator"></span>
          </button>
        {/each}
      {:else}
        <span class="rack-counter"
          >{activeIndex + 1}/{layoutStore.racks.length}</span
        >
      {/if}
    </div>
  </div>
{/if}

<style>
  .rack-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-1) var(--space-4);
    background: var(--colour-toolbar-bg);
    border-bottom: 1px solid var(--colour-border);
    flex-shrink: 0;
  }

  .rack-name {
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--colour-text);
  }

  .rack-nav {
    display: flex;
    align-items: center;
    gap: var(--space-0-5);
  }

  .dot {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .dot:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: -2px;
    border-radius: var(--radius-md);
  }

  .dot-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1.5px solid var(--colour-text-muted);
    background: transparent;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out);
  }

  .dot.active .dot-indicator {
    background: var(--colour-primary);
    border-color: var(--colour-primary);
  }

  .rack-counter {
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
    font-variant-numeric: tabular-nums;
  }
</style>
