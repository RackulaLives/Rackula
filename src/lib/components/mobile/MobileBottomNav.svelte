<!--
  MobileBottomNav Component
  Fixed bottom navigation bar for mobile viewports.
  Four tabs in the thumb zone, each opening a bottom sheet: Layouts, Racks, Devices, View.
  Mirrors the desktop left-panel structure. Tab actions resolve through the
  dialogStore sheet keys in DialogOrchestrator; this component is presentation only.
  Only renders on mobile (self-guarded via viewportStore.isMobile).
-->
<script lang="ts">
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import {
    IconFolderBold,
    IconServerBold,
    IconImageBold,
    IconFitAllBold,
  } from "../icons";
  import { ICON_SIZE } from "$lib/constants/sizing";

  type Tab = "layouts" | "racks" | "devices" | "view";

  interface Props {
    activeTab?: Tab | null;
    hidden?: boolean;
    onlayoutsclick?: () => void;
    onracksclick?: () => void;
    ondevicesclick?: () => void;
    onviewclick?: () => void;
  }

  let {
    activeTab = null,
    hidden = false,
    onlayoutsclick,
    onracksclick,
    ondevicesclick,
    onviewclick,
  }: Props = $props();

  const viewportStore = getViewportStore();

  /**
   * Focus the tapped button before invoking the sheet-open handler.
   * Touch taps do not move keyboard focus on mobile by default, so bits-ui
   * cannot capture a "previously focused element" for focus restoration on
   * sheet close. Calling focus() first ensures the button is the pre-focus
   * element that bits-ui restores when the sheet closes.
   */
  function handleTabClick(
    event: MouseEvent,
    handler: (() => void) | undefined,
  ): void {
    (event.currentTarget as HTMLElement).focus();
    handler?.();
  }
</script>

{#if viewportStore.isMobile}
  <nav
    class="bottom-nav"
    class:hidden
    data-testid="mobile-bottom-nav"
    aria-label="Mobile navigation"
  >
    <button
      class="nav-tab"
      class:active={activeTab === "layouts"}
      type="button"
      data-testid="nav-tab-layouts"
      aria-current={activeTab === "layouts" ? "page" : undefined}
      aria-expanded={activeTab === "layouts"}
      onclick={(e) => handleTabClick(e, onlayoutsclick)}
    >
      <IconFolderBold size={ICON_SIZE.xl} />
      <span class="nav-label">Layouts</span>
    </button>

    <button
      class="nav-tab"
      class:active={activeTab === "racks"}
      type="button"
      data-testid="nav-tab-racks"
      aria-current={activeTab === "racks" ? "page" : undefined}
      aria-expanded={activeTab === "racks"}
      onclick={(e) => handleTabClick(e, onracksclick)}
    >
      <IconServerBold size={ICON_SIZE.xl} />
      <span class="nav-label">Racks</span>
    </button>

    <button
      class="nav-tab"
      class:active={activeTab === "devices"}
      type="button"
      data-testid="nav-tab-devices"
      aria-current={activeTab === "devices" ? "page" : undefined}
      aria-expanded={activeTab === "devices"}
      onclick={(e) => handleTabClick(e, ondevicesclick)}
    >
      <IconImageBold size={ICON_SIZE.xl} />
      <span class="nav-label">Devices</span>
    </button>

    <button
      class="nav-tab"
      class:active={activeTab === "view"}
      type="button"
      data-testid="nav-tab-view"
      aria-current={activeTab === "view" ? "page" : undefined}
      aria-expanded={activeTab === "view"}
      onclick={(e) => handleTabClick(e, onviewclick)}
    >
      <IconFitAllBold size={ICON_SIZE.xl} />
      <span class="nav-label">View</span>
    </button>
  </nav>
{/if}

<style>
  .bottom-nav {
    position: fixed;
    bottom: var(--keyboard-height, 0px);
    left: 0;
    right: 0;
    z-index: var(--z-bottom-nav, 100);
    display: flex;
    justify-content: space-around;
    align-items: stretch;
    height: var(--bottom-nav-height);
    padding-bottom: var(--safe-area-bottom, 0px);
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
