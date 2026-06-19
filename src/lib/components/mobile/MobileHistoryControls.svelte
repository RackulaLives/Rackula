<!--
  MobileHistoryControls Component
  Floating undo/redo controls for mobile users when keyboard shortcuts are
  unavailable. The cluster sits at the canvas bottom-left, a rounded rectangle
  consistent with the rectilinear mobile language (no pills or circles) and
  mirroring the desktop relocation of the history controls (#2458). It clears the
  fixed bottom navigation and the safe-area inset so it is never occluded.
-->
<script lang="ts">
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { appDebug } from "$lib/utils/debug";
  import { hapticTap } from "$lib/utils/haptics";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { IconRedoBold, IconUndoBold } from "../icons";

  const layoutStore = getLayoutStore();
  const viewportStore = getViewportStore();

  let shouldShow = $derived(
    viewportStore.isMobile && (layoutStore.canUndo || layoutStore.canRedo),
  );

  function handleUndo() {
    appDebug.mobile("mobile undo requested");
    if (!layoutStore.canUndo) {
      appDebug.mobile("mobile undo skipped: canUndo=false");
      return;
    }

    const didUndo = layoutStore.undo();
    if (!didUndo) {
      appDebug.mobile("mobile undo skipped: undo() returned false");
      return;
    }

    appDebug.mobile("mobile undo applied");

    hapticTap();
  }

  function handleRedo() {
    appDebug.mobile("mobile redo requested");
    if (!layoutStore.canRedo) {
      appDebug.mobile("mobile redo skipped: canRedo=false");
      return;
    }

    const didRedo = layoutStore.redo();
    if (!didRedo) {
      appDebug.mobile("mobile redo skipped: redo() returned false");
      return;
    }

    appDebug.mobile("mobile redo applied");

    hapticTap();
  }
</script>

{#if shouldShow}
  <div
    class="mobile-history-controls"
    role="group"
    aria-label="History actions"
  >
    <button
      class="history-button"
      type="button"
      aria-label="Undo"
      disabled={!layoutStore.canUndo}
      onclick={handleUndo}
      data-testid="btn-mobile-undo"
    >
      <IconUndoBold size={ICON_SIZE.md} />
    </button>

    <button
      class="history-button"
      type="button"
      aria-label="Redo"
      disabled={!layoutStore.canRedo}
      onclick={handleRedo}
      data-testid="btn-mobile-redo"
    >
      <IconRedoBold size={ICON_SIZE.md} />
    </button>
  </div>
{/if}

<style>
  .mobile-history-controls {
    position: absolute;
    /* Sit above the fixed bottom nav, the safe-area inset, and the on-screen
       keyboard. The nav itself shifts up by --keyboard-height when the keyboard
       opens (MobileBottomNav), so the cluster tracks the same offset to stay
       above it rather than slipping behind the raised nav. */
    bottom: calc(
      var(--bottom-nav-height) + var(--safe-area-bottom, 0px) +
        var(--keyboard-height, 0px) + var(--space-3)
    );
    left: max(var(--space-3), env(safe-area-inset-left, 0px));
    z-index: calc(var(--z-toolbar) + 1);
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1);
    border-radius: var(--radius-lg);
    border: 1px solid var(--bottom-nav-border);
    background: var(--bottom-nav-bg);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: var(--shadow-sm);
  }

  .history-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--touch-target-min);
    min-height: var(--touch-target-min);
    width: var(--touch-target-min);
    height: var(--touch-target-min);
    padding: 0;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--colour-text);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out),
      transform var(--duration-fast) var(--ease-out);
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .history-button:hover:not(:disabled) {
    background: var(--colour-overlay-hover);
    color: var(--colour-primary);
  }

  .history-button:active:not(:disabled) {
    transform: scale(0.97);
  }

  .history-button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring-glow);
    color: var(--colour-primary);
  }

  .history-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    .history-button {
      transition: none;
    }
  }
</style>
