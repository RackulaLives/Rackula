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
    hidden?: boolean;
    onfileclick?: () => void;
    onviewclick?: () => void;
    ondevicesclick?: () => void;
  }

  let {
    activeTab = null,
    hidden = false,
    onfileclick,
    onviewclick,
    ondevicesclick,
  }: Props = $props();

  const viewportStore = getViewportStore();
</script>

{#if viewportStore.isMobile}
  <nav class="bottom-nav" class:hidden aria-label="Mobile navigation">
    <button
      class="nav-tab"
      class:active={activeTab === "file"}
      type="button"
      aria-current={activeTab === "file" ? "page" : undefined}
      onclick={onfileclick}
    >
      <IconFolderBold size={ICON_SIZE.xl} />
      <span class="nav-label">File</span>
    </button>

    <button
      class="nav-tab"
      class:active={activeTab === "view"}
      type="button"
      aria-current={activeTab === "view" ? "page" : undefined}
      onclick={onviewclick}
    >
      <IconFitAllBold size={ICON_SIZE.xl} />
      <span class="nav-label">View</span>
    </button>

    <button
      class="nav-tab"
      class:active={activeTab === "devices"}
      type="button"
      aria-current={activeTab === "devices" ? "page" : undefined}
      onclick={ondevicesclick}
    >
      <IconServerBold size={ICON_SIZE.xl} />
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
    align-items: stretch;
    height: var(--bottom-nav-height);
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--bottom-nav-bg);
    backdrop-filter: blur(var(--bottom-nav-blur));
    -webkit-backdrop-filter: blur(var(--bottom-nav-blur));
    border-top: 0.5px solid var(--bottom-nav-border);
    transform: translateY(0);
    transition: transform var(--bottom-nav-transition) var(--ease-in-out);
    will-change: transform;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .bottom-nav.hidden {
    transform: translateY(100%);
  }

  .nav-tab {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: var(--touch-target-min);
    gap: var(--space-1);
    padding: var(--space-2);
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--bottom-nav-inactive-colour);
    transition: color var(--duration-normal) var(--ease-out);
  }

  /* Pill-shaped active indicator */
  .nav-tab::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -65%) scaleX(0);
    width: 64px;
    height: 32px;
    border-radius: var(--bottom-nav-pill-radius);
    background: var(--bottom-nav-active-pill-bg);
    opacity: 0;
    transition:
      transform var(--duration-normal) var(--ease-spring),
      opacity var(--duration-normal) var(--ease-out);
    z-index: -1;
  }

  .nav-tab.active::before {
    transform: translate(-50%, -65%) scaleX(1);
    opacity: 1;
  }

  .nav-tab.active {
    color: var(--bottom-nav-active-colour);
  }

  .nav-tab:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: -2px;
    border-radius: var(--radius-md);
  }

  .nav-label {
    font-size: var(--bottom-nav-label-size);
    font-weight: var(--font-weight-medium);
    line-height: 1;
    letter-spacing: var(--letter-spacing-wide);
    text-transform: uppercase;
  }

  @media (prefers-reduced-motion: reduce) {
    .bottom-nav {
      transition: none;
    }
    .nav-tab::before {
      transition: none;
    }
  }
</style>
