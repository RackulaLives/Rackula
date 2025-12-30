<!--
  PlacementIndicator Component
  Visual banner shown during mobile tap-to-place workflow.
  Displays device being placed and provides cancel button.
-->
<script lang="ts">
  import type { DeviceType } from "$lib/types";
  import { hapticCancel } from "$lib/utils/haptics";

  interface Props {
    isPlacing: boolean;
    device: DeviceType | null;
    oncancel?: () => void;
  }

  let { isPlacing, device, oncancel }: Props = $props();

  function handleCancel() {
    hapticCancel();
    oncancel?.();
  }
</script>

{#if isPlacing && device}
  <div class="placement-indicator" role="status" aria-live="polite">
    <div class="indicator-content">
      <span class="indicator-text">
        Tap rack to place <strong>{device.model}</strong>
      </span>
    </div>
    <button
      type="button"
      class="cancel-button"
      onclick={handleCancel}
      aria-label="Cancel placement"
    >
      <!-- X icon -->
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </div>
{/if}

<style>
  .placement-indicator {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: var(--z-placement-indicator, 50);

    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);

    min-height: var(--touch-target-min);
    padding: var(--space-3) var(--space-4);

    background: var(--dracula-orange, #ffb86c);
    color: var(--dracula-bg, #282a36);
    font-weight: 500;

    box-shadow: var(--shadow-indicator);
  }

  .indicator-content {
    flex: 1;
    min-width: 0;
  }

  .indicator-text {
    display: block;
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.4;
  }

  .indicator-text strong {
    font-weight: 600;
  }

  .cancel-button {
    flex-shrink: 0;

    /* Touch target: 48px minimum (WCAG 2.5.5) */
    min-width: var(--touch-target-min);
    min-height: var(--touch-target-min);
    width: var(--touch-target-min);
    height: var(--touch-target-min);

    display: flex;
    align-items: center;
    justify-content: center;

    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    color: inherit;
    cursor: pointer;
    transition: background-color var(--duration-fast);

    /* Remove tap highlight on mobile */
    -webkit-tap-highlight-color: transparent;
  }

  .cancel-button:hover {
    background: var(--colour-button-overlay);
  }

  .cancel-button:active {
    background: var(--colour-button-overlay-hover);
  }

  .cancel-button:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .cancel-button {
      transition: none;
    }
  }
</style>
