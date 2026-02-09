<!--
  BottomSheet Component
  Slide-up modal for mobile device details with swipe-to-dismiss gesture
-->
<script lang="ts">
  interface Props {
    open: boolean;
    title?: string;
    onclose: () => void;
    children?: import("svelte").Snippet;
  }

  let { open = false, title, onclose, children }: Props = $props();

  let sheetElement: HTMLDivElement | null = $state(null);
  let startY = $state(0);
  let currentY = $state(0);
  let isDragging = $state(false);

  // Transform value for dragging (positive = dragging down)
  const translateY = $derived(isDragging ? Math.max(0, currentY - startY) : 0);

  // Close threshold: if dragged down more than 100px, close on release
  const CLOSE_THRESHOLD = 100;

  function handleBackdropClick(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!sheetElement || !sheetElement.contains(target)) {
      closeSheet();
    }
  }

  function closeSheet() {
    onclose();
  }

  // Swipe-to-dismiss gesture handlers
  function handlePointerDown(event: PointerEvent) {
    // Only handle touch/pen events on the sheet itself
    if (event.pointerType === "mouse") return;

    startY = event.clientY;
    currentY = event.clientY;
    isDragging = true;

    // Capture pointer for smooth tracking
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!isDragging) return;
    currentY = event.clientY;
  }

  function handlePointerUp(event: PointerEvent) {
    if (!isDragging) return;

    const dragDistance = currentY - startY;

    // Close if dragged down past threshold
    if (dragDistance > CLOSE_THRESHOLD) {
      closeSheet();
    }

    isDragging = false;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  }

  function handlePointerCancel(event: PointerEvent) {
    isDragging = false;
    if (event.currentTarget) {
      (event.currentTarget as HTMLElement).releasePointerCapture(
        event.pointerId,
      );
    }
  }

  // Handle Escape key to close
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && open) {
      closeSheet();
    }
  }

  // Prevent body scroll when sheet is open
  $effect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  });
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if open}
  <div
    class="bottom-sheet-container"
    onclick={handleBackdropClick}
    onkeydown={(e) => e.key === "Enter" && closeSheet()}
    role="presentation"
  >
    <!-- Backdrop -->
    <div class="backdrop" class:visible={open}></div>

    <!-- Sheet -->
    <div
      bind:this={sheetElement}
      class="bottom-sheet"
      class:open
      class:dragging={isDragging}
      style:transform={isDragging ? `translateY(${translateY}px)` : ""}
      role="dialog"
      aria-modal="true"
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointercancel={handlePointerCancel}
    >
      <!-- Header with drag handle, title and close button -->
      <div class="sheet-header">
        <div class="drag-handle-bar"></div>
        <div class="header-row">
          {#if title}
            <h2 class="sheet-title">{title}</h2>
          {:else}
            <div></div>
          {/if}
          <button
            type="button"
            class="close-button"
            onclick={closeSheet}
            aria-label="Close"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="sheet-content">
        {@render children?.()}
      </div>
    </div>
  </div>
{/if}

<style>
  .bottom-sheet-container {
    position: fixed;
    inset: 0;
    z-index: var(--z-bottom-sheet, 200);
    display: flex;
    align-items: flex-end;
    pointer-events: all;
  }

  .backdrop {
    position: absolute;
    inset: 0;
    background: var(--colour-backdrop);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .backdrop {
      transition: none;
    }
  }

  .backdrop.visible {
    opacity: 1;
  }

  .bottom-sheet {
    position: relative;
    width: 100%;
    /* Extend to just below toolbar */
    max-height: calc(
      100vh - var(--toolbar-height, 56px) - var(--keyboard-height, 0px)
    );
    max-height: calc(
      100dvh - var(--toolbar-height, 56px) - var(--keyboard-height, 0px)
    );
    background: var(--colour-bg);
    border-top-left-radius: 0.75rem;
    border-top-right-radius: 0.75rem;
    box-shadow: var(--shadow-sheet);
    transform: translateY(100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    touch-action: pan-y;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding-bottom: var(--safe-area-bottom, 0px);
  }

  @media (prefers-reduced-motion: reduce) {
    .bottom-sheet {
      transition: none;
    }
  }

  .bottom-sheet.open {
    transform: translateY(0);
  }

  .bottom-sheet.dragging {
    transition: none;
  }

  .sheet-header {
    flex-shrink: 0;
    padding: var(--space-2) var(--space-4) 0;
    cursor: grab;
    user-select: none;
  }

  .drag-handle-bar {
    width: 2.5rem;
    height: 0.25rem;
    margin: 0 auto var(--space-1);
    background: var(--colour-text-secondary);
    opacity: 0.4;
    border-radius: 0.125rem;
  }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .sheet-title {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--colour-text);
  }

  .close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--touch-target-min);
    height: var(--touch-target-min);
    padding: 0;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--colour-text-secondary);
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      color 0.15s ease;
  }

  .close-button:hover,
  .close-button:focus-visible {
    background: var(--colour-surface-secondary);
    color: var(--colour-text);
  }

  .close-button:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  .sheet-content {
    flex: 1;
    overflow: hidden;
    padding: 0 var(--space-4) var(--space-4);
    /* Let child components handle their own scrolling */
    display: flex;
    flex-direction: column;
  }

  /* Scrollbar styling */
  .sheet-content::-webkit-scrollbar {
    width: 0.5rem;
  }

  .sheet-content::-webkit-scrollbar-track {
    background: transparent;
  }

  .sheet-content::-webkit-scrollbar-thumb {
    background: var(--color-text-secondary);
    opacity: 0.3;
    border-radius: 0.25rem;
  }
</style>
