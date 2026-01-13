<!--
  VaulBottomSheet Component (Evaluation)
  Equivalent to BottomSheet.svelte using vaul-svelte Drawer
  Created for spike #526 to compare UX with custom implementation
-->
<script lang="ts">
  import { Drawer } from "vaul-svelte";

  interface Props {
    open: boolean;
    title?: string;
    onclose?: () => void;
    children?: import("svelte").Snippet;
  }

  let { open = $bindable(false), title, onclose, children }: Props = $props();

  function handleOpenChange(isOpen: boolean) {
    open = isOpen;
    if (!isOpen) {
      onclose?.();
    }
  }
</script>

<Drawer.Root
  {open}
  onOpenChange={handleOpenChange}
  direction="bottom"
  shouldScaleBackground={false}
>
  <Drawer.Portal>
    <Drawer.Overlay class="vaul-backdrop" />
    <Drawer.Content class="vaul-sheet">
      <!-- Drag handle -->
      <div class="sheet-header">
        <Drawer.Handle class="drag-handle" />
        <div class="header-row">
          {#if title}
            <Drawer.Title class="sheet-title">{title}</Drawer.Title>
          {:else}
            <div></div>
          {/if}
          <Drawer.Close class="close-button" aria-label="Close">
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
          </Drawer.Close>
        </div>
      </div>

      <!-- Content -->
      <div class="sheet-content">
        {@render children?.()}
      </div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>

<style>
  :global(.vaul-backdrop) {
    position: fixed;
    inset: 0;
    background: var(--colour-backdrop);
    z-index: var(--z-bottom-sheet, 200);
  }

  :global(.vaul-sheet) {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: calc(100vh - var(--toolbar-height, 56px));
    background: var(--colour-bg);
    border-top-left-radius: 0.75rem;
    border-top-right-radius: 0.75rem;
    box-shadow: var(--shadow-sheet);
    z-index: var(--z-bottom-sheet, 200);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sheet-header {
    flex-shrink: 0;
    padding: var(--space-2) var(--space-4) 0;
    user-select: none;
  }

  :global(.drag-handle) {
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

  :global(.sheet-title) {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--colour-text);
  }

  :global(.close-button) {
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

  :global(.close-button:hover),
  :global(.close-button:focus-visible) {
    background: var(--colour-surface-secondary);
    color: var(--colour-text);
  }

  :global(.close-button:focus-visible) {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  .sheet-content {
    flex: 1;
    overflow: hidden;
    padding: 0 var(--space-4) var(--space-4);
    display: flex;
    flex-direction: column;
  }
</style>
