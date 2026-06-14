<!--
  Dialog — the unified overlay primitive (#2092)

  One component for every modal surface. Built on the bits-ui Dialog so focus is
  trapped, Escape closes, and an inert backdrop covers the page. Three fixed
  sizes (S 420, M 560, L 720) keep dialog widths consistent.

  Presentation adapts to the viewport: a centred dialog on desktop, a bottom
  sheet with a drag handle and swipe-to-dismiss below the mobile breakpoint. The
  API is identical for both. Enter and exit transitions respect
  prefers-reduced-motion.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { Dialog } from "bits-ui";
  import { IconClose } from "./icons";
  import { getViewportStore } from "$lib/utils/viewport.svelte";

  type DialogSize = "S" | "M" | "L";

  interface Props {
    open: boolean;
    title: string;
    size?: DialogSize;
    testid?: string;
    showClose?: boolean;
    onclose?: () => void;
    children?: Snippet;
    headerActions?: Snippet;
  }

  let {
    open = $bindable(),
    title,
    size = "M",
    testid,
    showClose = true,
    onclose,
    children,
    headerActions,
  }: Props = $props();

  const viewportStore = getViewportStore();
  const isSheet = $derived(viewportStore.isMobile);

  const sizeWidths: Record<DialogSize, string> = {
    S: "420px",
    M: "560px",
    L: "720px",
  };
  const dialogWidth = $derived(sizeWidths[size]);

  function handleOpenChange(newOpen: boolean) {
    open = newOpen;
    if (!newOpen) {
      onclose?.();
    }
  }

  // Swipe-to-dismiss for the mobile sheet. The bits-ui Dialog still owns focus
  // and Escape; the drag only adds a touch affordance to close.
  let dragStartY = $state(0);
  let dragOffset = $state(0);
  let isDragging = $state(false);

  const CLOSE_THRESHOLD = 100;

  // releasePointerCapture throws if the browser already released the capture
  // (e.g. the sheet unmounted mid-drag); swallow that so the handler still runs.
  function releaseCapture(event: PointerEvent) {
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(
        event.pointerId,
      );
    } catch {
      // Capture was already lost; nothing to release.
    }
  }

  function handleHeaderPointerDown(event: PointerEvent) {
    // Touch and pen only: a mouse drag on the header should not start a swipe,
    // so desktop and trackpad pointers fall through to normal click behaviour.
    if (!isSheet || event.pointerType === "mouse") return;
    // Ignore presses that land on a control in the header (close button, header
    // actions): capturing the pointer there would swallow the tap. Only the bare
    // header background starts a swipe.
    if (
      event.target instanceof Element &&
      event.target.closest("button, a, [role='button'], input, select, textarea")
    ) {
      return;
    }
    dragStartY = event.clientY;
    dragOffset = 0;
    isDragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function handleHeaderPointerMove(event: PointerEvent) {
    if (!isDragging) return;
    dragOffset = Math.max(0, event.clientY - dragStartY);
  }

  function handleHeaderPointerUp(event: PointerEvent) {
    if (!isDragging) return;
    const dragged = dragOffset;
    isDragging = false;
    dragOffset = 0;
    releaseCapture(event);
    if (dragged > CLOSE_THRESHOLD) {
      handleOpenChange(false);
    }
  }

  function handleHeaderPointerCancel(event: PointerEvent) {
    isDragging = false;
    dragOffset = 0;
    releaseCapture(event);
  }
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-backdrop" data-testid="dialog-backdrop" />
    <Dialog.Content
      class="dialog {isSheet ? 'dialog--sheet' : 'dialog--centred'}"
      data-testid={testid}
      data-size={size}
      style="--dialog-width: {dialogWidth}; {isDragging
        ? `transform: translateY(${dragOffset}px);`
        : ''}"
      data-dragging={isDragging ? "true" : undefined}
    >
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="dialog-header"
        onpointerdown={handleHeaderPointerDown}
        onpointermove={handleHeaderPointerMove}
        onpointerup={handleHeaderPointerUp}
        onpointercancel={handleHeaderPointerCancel}
      >
        {#if isSheet}
          <div class="dialog-drag-handle" aria-hidden="true"></div>
        {/if}
        <div class="dialog-header-row">
          <Dialog.Title class="dialog-title">{title}</Dialog.Title>
          <div class="dialog-header-actions">
            {#if headerActions}
              {@render headerActions()}
            {/if}
            {#if showClose}
              <Dialog.Close class="dialog-close" aria-label="Close dialog">
                <IconClose />
              </Dialog.Close>
            {/if}
          </div>
        </div>
      </div>
      <div class="dialog-content">
        {#if children}
          {@render children()}
        {/if}
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  /* Base dialog styles (.dialog-backdrop, .dialog, .dialog-title, .dialog-close)
     are defined in src/lib/styles/dialogs.css and imported globally */

  .dialog-header {
    flex-shrink: 0;
    padding: var(--space-4) var(--space-5);
  }

  .dialog-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .dialog-header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  /* Drag handle: only rendered in the sheet presentation. */
  .dialog-drag-handle {
    width: 2.5rem;
    height: 0.25rem;
    margin: 0 auto var(--space-2);
    background: var(--colour-text-secondary);
    opacity: 0.4;
    border-radius: 0.125rem;
  }

  @media (max-width: 430px) {
    .dialog-header {
      padding: var(--space-3) var(--space-4);
    }

    .dialog-header-actions {
      gap: var(--space-2);
    }
  }
</style>
