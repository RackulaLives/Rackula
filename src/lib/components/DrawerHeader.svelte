<!--
  DrawerHeader Component
  Header section for drawers with title and optional close button
-->
<script lang="ts">
  import { IconClose } from "./icons";

  interface Props {
    title: string;
    showClose?: boolean;
    onclose?: () => void;
  }

  let { title, showClose = true, onclose }: Props = $props();
</script>

<div class="drawer-header">
  <h2 class="drawer-title">{title}</h2>
  {#if showClose}
    <button
      type="button"
      class="close-button"
      aria-label="Close drawer"
      onclick={onclose}
    >
      <IconClose />
    </button>
  {/if}
</div>

<style>
  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--colour-border);
    flex-shrink: 0;
  }

  .drawer-title {
    font-size: var(--font-size-md);
    font-weight: 600;
    margin: 0;
    color: var(--colour-text);
  }

  .close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--colour-text-muted);
    transition:
      background-color var(--transition-fast),
      color var(--transition-fast);
  }

  .close-button:hover {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  .close-button:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }
</style>
