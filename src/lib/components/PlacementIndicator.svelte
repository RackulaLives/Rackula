<!--
  PlacementIndicator Component
  Visual banner shown during mobile tap-to-place workflow.
  Displays device being placed and provides cancel button.
-->
<script lang="ts">
  import type { DeviceType } from "$lib/types";
  import { hapticCancel } from "$lib/utils/haptics";
  import { IconClose } from "./icons";

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
        Placing: <strong
          >{device.model ?? device.slug} ({device.u_height}U)</strong
        >
      </span>
    </div>
    <button
      type="button"
      class="cancel-button"
      onclick={handleCancel}
      aria-label="Cancel placement"
    >
      <IconClose />
      <span class="cancel-label">Cancel</span>
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
    padding: var(--space-2) var(--space-4);

    background: var(--colour-surface, rgba(40, 42, 54, 0.96));
    border-bottom: 2px solid var(--colour-selection, #ff79c6);
    color: var(--colour-text, #f8f8f2);
    font-weight: 500;

    box-shadow: var(--shadow-indicator);
  }

  .indicator-content {
    flex: 1;
    min-width: 0;
  }

  .indicator-text {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-base, 1rem);
    line-height: 1.4;
  }

  .indicator-text strong {
    color: var(--colour-selection, #ff79c6);
    font-weight: 600;
  }

  .cancel-label {
    white-space: nowrap;
  }

  .cancel-button {
    flex-shrink: 0;

    /* Touch target: 48px minimum (WCAG 2.5.5) */
    min-width: var(--touch-target-min);
    min-height: var(--touch-target-min);

    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);

    padding: 0 var(--space-3);

    background: var(--colour-surface-overlay, rgba(0, 0, 0, 0.25));
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    color: inherit;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 600;
    cursor: pointer;
    transition: background-color var(--duration-fast);

    /* Remove tap highlight on mobile */
    -webkit-tap-highlight-color: transparent;
  }

  .cancel-button:hover {
    background: var(--colour-button-overlay-hover);
  }

  .cancel-button:active {
    background: var(--colour-button-overlay-hover);
  }

  .cancel-button:focus-visible {
    outline: 2px solid var(--colour-selection, #ff79c6);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .cancel-button {
      transition: none;
    }
  }
</style>
