<!--
  SaveStatus - Subtle save status indicator for toolbar
  Uses bits-ui Progress for indeterminate saving state

  Shows transient save status feedback:
  - "Saving..." with progress indicator during save
  - "Saved" checkmark that auto-hides after 2 seconds
  - "Save failed" error state
  - "Offline" warning state
-->
<script lang="ts">
  import { Progress } from "bits-ui";
  import type { SaveStatus } from "$lib/utils/persistence-api";
  import { fade } from "svelte/transition";
  import IconBug from "./icons/IconBug.svelte";
  import IconCheck from "./icons/IconCheck.svelte";
  import IconCloudOff from "./icons/IconCloudOff.svelte";

  interface Props {
    status: SaveStatus;
  }

  let { status }: Props = $props();

  // Respect user's reduced motion preference (reactive to runtime changes)
  let prefersReducedMotion = $state(false);

  $effect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersReducedMotion = mediaQuery.matches;

    function handleChange(e: MediaQueryListEvent) {
      prefersReducedMotion = e.matches;
    }

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  });

  // Auto-hide "saved" after 2 seconds
  // Note: This uses $effect with setTimeout intentionally - it's imperative
  // timing logic that cannot be expressed as $derived
  let showSaved = $state(false);

  $effect(() => {
    if (status === "saved") {
      showSaved = true;
      const timeout = setTimeout(() => {
        showSaved = false;
      }, 2000);
      return () => clearTimeout(timeout);
    } else {
      showSaved = false;
    }
  });

  const shouldShow = $derived(
    status === "saving" ||
      status === "error" ||
      status === "offline" ||
      (status === "saved" && showSaved),
  );
</script>

{#if shouldShow}
  <div
    class="save-status"
    role="status"
    aria-live="polite"
    aria-atomic="true"
    transition:fade={{ duration: prefersReducedMotion ? 0 : 200 }}
  >
    <!-- Screen reader announcement -->
    <span class="sr-only">
      {#if status === "saving"}
        Saving layout
      {:else if status === "saved"}
        Layout saved
      {:else if status === "error"}
        Save failed
      {:else if status === "offline"}
        Working offline
      {/if}
    </span>
    {#if status === "saving"}
      <Progress.Root
        value={null}
        class="progress-root"
        aria-label="Saving layout"
      >
        <Progress.Indicator class="progress-indicator" />
      </Progress.Root>
      <span class="status-text">Saving...</span>
    {:else if status === "saved"}
      <IconCheck size={14} class="icon-success" />
      <span class="status-text">Saved</span>
    {:else if status === "error"}
      <IconBug size={14} />
      <span class="status-text error">Save failed</span>
    {:else if status === "offline"}
      <IconCloudOff size={14} />
      <span class="status-text warning">Offline</span>
    {/if}
  </div>
{/if}

<style>
  /* Visually hidden but accessible to screen readers */
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

  .save-status {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.75rem;
    color: var(--colour-text-muted);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--colour-surface);
  }

  .status-text {
    white-space: nowrap;
  }

  .status-text.error {
    color: var(--colour-error);
  }

  .status-text.warning {
    color: var(--colour-warning);
  }

  :global(.icon-success) {
    color: var(--colour-success);
  }

  :global(.progress-root) {
    width: 40px;
    height: 3px;
    background: var(--colour-border);
    border-radius: 2px;
    overflow: hidden;
  }

  :global(.progress-indicator) {
    height: 100%;
    width: 30%;
    background: var(--colour-primary);
    border-radius: 2px;
    animation: indeterminate 1.5s ease-in-out infinite;
  }

  @keyframes indeterminate {
    0% {
      transform: translateX(-100%);
    }
    50% {
      transform: translateX(200%);
    }
    100% {
      transform: translateX(-100%);
    }
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    :global(.progress-indicator) {
      animation: none;
      width: 100%;
      opacity: 0.5;
    }
  }
</style>
