<!--
  MobileBottomNav Component
  Fixed bottom navigation bar for mobile viewports.
  Three tabs: File, View, Devices.
  Only renders on mobile (self-guarded via viewportStore.isMobile).
-->
<script lang="ts">
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { IconFolderBold, IconFitAllBold, IconServerBold } from "../icons";
  import { ICON_SIZE } from "$lib/constants/sizing";

  type Tab = "file" | "view" | "devices";

  interface Props {
    activeTab?: Tab | null;
    onfileclick?: () => void;
    onviewclick?: () => void;
    ondevicesclick?: () => void;
  }

  let {
    activeTab = null,
    onfileclick,
    onviewclick,
    ondevicesclick,
  }: Props = $props();

  const viewportStore = getViewportStore();
</script>

{#if viewportStore.isMobile}
  <nav class="bottom-nav" aria-label="Mobile navigation">
    <button
      class="nav-tab"
      class:active={activeTab === "file"}
      type="button"
      aria-current={activeTab === "file" ? "page" : undefined}
      onclick={onfileclick}
    >
      <IconFolderBold size={ICON_SIZE.lg} />
      <span class="nav-label">File</span>
    </button>

    <button
      class="nav-tab"
      class:active={activeTab === "view"}
      type="button"
      aria-current={activeTab === "view" ? "page" : undefined}
      onclick={onviewclick}
    >
      <IconFitAllBold size={ICON_SIZE.lg} />
      <span class="nav-label">View</span>
    </button>

    <button
      class="nav-tab"
      class:active={activeTab === "devices"}
      type="button"
      aria-current={activeTab === "devices" ? "page" : undefined}
      onclick={ondevicesclick}
    >
      <IconServerBold size={ICON_SIZE.lg} />
      <span class="nav-label">Devices</span>
    </button>
  </nav>
{/if}

<style>
  .bottom-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: var(--z-bottom-nav, 100);
    display: flex;
    justify-content: space-around;
    align-items: center;
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--colour-toolbar-bg, var(--toolbar-bg));
    border-top: 1px solid var(--colour-toolbar-border, var(--toolbar-border));
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .nav-tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: var(--touch-target-min);
    min-height: var(--touch-target-min);
    gap: var(--space-0-5);
    padding: var(--space-1) var(--space-2);
    border: none;
    background: transparent;
    cursor: pointer;
    transition: color var(--duration-fast) var(--ease-out);
  }

  .nav-tab.active {
    color: var(--colour-primary);
  }

  .nav-tab:not(.active) {
    color: var(--colour-text-muted);
  }

  .nav-tab:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: -2px;
    border-radius: var(--radius-md);
  }

  .nav-label {
    font-size: var(--font-size-2xs);
    line-height: 1;
  }
</style>
