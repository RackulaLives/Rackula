<!--
  DeviceLibraryFAB Component
  Floating action button for mobile device library access.
  Only renders on mobile viewports (< 1024px).
-->
<script lang="ts">
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { analytics } from "$lib/utils/analytics";
  import { IconPlusIconoir } from "./icons";

  interface Props {
    onclick?: () => void;
  }

  let { onclick }: Props = $props();

  const viewportStore = getViewportStore();

  function handleClick() {
    analytics.trackMobileFabClick();
    onclick?.();
  }
</script>

{#if viewportStore.isMobile}
  <button
    type="button"
    class="device-library-fab"
    onclick={handleClick}
    aria-label="Open device library"
  >
    <IconPlusIconoir />
  </button>
{/if}

<style>
  .device-library-fab {
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: var(--z-fab, 100);

    /* Touch target: 56px for comfortable tapping (exceeds 48px minimum per WCAG 2.5.5) */
    width: var(--touch-target-comfortable);
    height: var(--touch-target-comfortable);
    min-width: var(--touch-target-min);
    min-height: var(--touch-target-min);

    /* Styling */
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--colour-button-primary);
    color: var(--colour-text-on-primary);
    border: none;
    border-radius: 50%;
    box-shadow: var(--shadow-fab);
    cursor: pointer;
    transition:
      transform var(--duration-fast),
      box-shadow var(--duration-fast);

    /* Prevent text selection */
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .device-library-fab:hover {
    transform: scale(1.05);
    box-shadow: var(--shadow-fab-hover);
  }

  .device-library-fab:active {
    transform: scale(0.95);
  }

  .device-library-fab:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  .device-library-fab :global(svg) {
    width: var(--icon-size-lg);
    height: var(--icon-size-lg);
  }

  @media (prefers-reduced-motion: reduce) {
    .device-library-fab {
      transition: none;
    }
  }
</style>
