<!--
  Toast container component
  Displays all active toasts in a stack
-->
<script lang="ts">
  import { getToastStore } from "$lib/stores/toast.svelte";
  import Toast from "./Toast.svelte";

  const toastStore = getToastStore();
</script>

<div class="toast-container" aria-live="polite" aria-atomic="false">
  {#each toastStore.toasts as toast (toast.id)}
    <Toast {toast} />
  {/each}
</div>

<style>
  /* Anchored to the bottom-center of the canvas region (#2637): the conventional,
	   least-occluding spot for transient system feedback. Positioned absolutely
	   within the canvas region (its nearest positioned ancestor) so it centers over
	   the canvas, clear of the side panels and the bottom-left view controls. The
	   stack is bottom-anchored and grows upward: the newest toast sits at the bottom
	   (closest to its source) and older toasts push up as they accumulate. */
  .toast-container {
    position: absolute;
    bottom: var(--space-3);
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-toast);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    pointer-events: none;
  }

  .toast-container :global(.toast) {
    pointer-events: auto;
  }

  /* Mobile (matches the layout breakpoint, viewport <= 1024px): lift the stack
	   above the fixed bottom nav and the safe-area inset so it is never hidden
	   behind the nav. */
  @media (max-width: 1024px) {
    .toast-container {
      bottom: calc(
        var(--bottom-nav-height) + var(--space-3) +
          env(safe-area-inset-bottom, 0px)
      );
    }

    .toast-container :global(.toast) {
      max-width: min(420px, calc(100vw - 2 * var(--space-4)));
    }
  }
</style>
