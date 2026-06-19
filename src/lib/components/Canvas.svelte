<!--
  Canvas Component
  Viewport shell for the rack designer: owns the panzoom container, swipe and
  long-press gesture wiring, and the onboarding hint. Rack rendering lives in
  RackCanvasView; gesture math lives in the canvas-* utils (#1610).
-->
<script lang="ts">
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import {
    getCanvasStore,
    ZOOM_MIN,
    ZOOM_MAX,
  } from "$lib/stores/canvas.svelte";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { getPlacementStore } from "$lib/stores/placement.svelte";
  import { debug } from "$lib/utils/debug";
  import { useLongPress } from "$lib/utils/gestures";
  import { isRackInteractionTarget } from "$lib/utils/canvas-coordinates";
  import { createCanvasPanzoom } from "$lib/utils/panzoom-lifecycle";
  import { createRackSwipeController } from "$lib/utils/canvas-swipe.svelte";
  import { createCanvasDoubleTap } from "$lib/utils/canvas-double-tap.svelte";
  import { dispatchContextMenuAtPoint } from "$lib/utils/context-menu";
  import { hapticTap } from "$lib/utils/haptics";
  import { safeGetItem, safeSetItem } from "$lib/utils/safe-storage";
  import type { DeviceFace } from "$lib/types";
  import {
    loadStarterTemplates,
    type StarterTemplate,
  } from "$lib/templates/starter-templates";
  import RackCanvasView from "./RackCanvasView.svelte";
  import WelcomeScreen from "./WelcomeScreen.svelte";
  import CanvasContextMenu from "./CanvasContextMenu.svelte";
  import VerbBarOverlay from "./VerbBarOverlay.svelte";
  import PlacementIndicator from "./PlacementIndicator.svelte";

  const ONBOARDING_HINT_KEY = "Rackula_onboarding_hint_dismissed";

  interface Props {
    partyMode?: boolean;
    /** Enable long press gesture for mobile rack editing */
    enableLongPress?: boolean;
    onnewrack?: () => void;
    onload?: () => void;
    /** Load a starter template as a new layout (empty-state picker). */
    onchoosetemplate?: (template: StarterTemplate) => void;
    /** Open the share flow from the empty-state picker. */
    onshare?: () => void;
    onfitall?: () => void;
    onresetzoom?: () => void;
    onrackselect?: (event: CustomEvent<{ rackId: string }>) => void;
    ondeviceselect?: (
      event: CustomEvent<{ deviceId?: string; slug: string; position: number }>,
    ) => void;
    ondevicedrop?: (
      event: CustomEvent<{
        rackId: string;
        slug: string;
        position: number;
        face: "front" | "rear";
      }>,
    ) => void;
    ondevicemove?: (
      event: CustomEvent<{
        rackId: string;
        deviceIndex: number;
        newPosition: number;
      }>,
    ) => void;
    ondevicemoverack?: (
      event: CustomEvent<{
        sourceRackId: string;
        sourceIndex: number;
        targetRackId: string;
        targetPosition: number;
        face: DeviceFace;
      }>,
    ) => void;
    /** Mobile long press for rack editing */
    onracklongpress?: (event: CustomEvent<{ rackId: string }>) => void;
    /** Rack context menu: focus rack/group callback */
    onrackfocus?: (rackIds: string[]) => void;
    /** Rack context menu: export rack/group callback */
    onrackexport?: (rackIds: string[]) => void;
    /** Rack context menu: edit rack callback */
    onrackedit?: (rackId: string) => void;
    /** Rack context menu: rename rack callback */
    onrackrename?: (rackId: string) => void;
    /** Rack context menu: duplicate rack callback */
    onrackduplicate?: (rackId: string) => void;
    /** Rack context menu: delete rack callback */
    onrackdelete?: (rackId: string) => void;
    /** Delete the current selection (device or rack), for the floating verb bar. */
    ondelete?: () => void;
  }

  let {
    partyMode = false,
    enableLongPress = false,
    onnewrack,
    onload,
    onchoosetemplate,
    onshare,
    onfitall,
    onresetzoom,
    onrackselect,
    ondeviceselect,
    ondevicedrop,
    ondevicemove,
    ondevicemoverack,
    onracklongpress,
    onrackfocus,
    onrackexport,
    onrackedit,
    onrackrename,
    onrackduplicate,
    onrackdelete,
    ondelete,
  }: Props = $props();

  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const canvasStore = getCanvasStore();
  const viewportStore = getViewportStore();
  const placementStore = getPlacementStore();

  // Multi-rack mode: access all racks
  const racks = $derived(layoutStore.racks);
  const hasRacks = $derived(layoutStore.rackCount > 0);
  const allRacksEmpty = $derived(racks.every((r) => r.devices.length === 0));
  let hintDismissed = $state(safeGetItem(ONBOARDING_HINT_KEY) === "1");

  // Starter templates for the empty-state picker. Loaded lazily the first time
  // the canvas has no racks, so the fetch never runs for users who arrive with a
  // restored layout. A load failure leaves the list empty, and the picker falls
  // back to its blank-layout affordance (#2095).
  let starterTemplates = $state<StarterTemplate[]>([]);
  let templatesRequested = false;

  $effect(() => {
    if (hasRacks || templatesRequested) return;
    templatesRequested = true;
    loadStarterTemplates().then((loaded) => {
      starterTemplates = loaded;
    });
  });

  function dismissOnboardingHint() {
    safeSetItem(ONBOARDING_HINT_KEY, "1");
    hintDismissed = true;
  }

  // Panzoom container reference
  let panzoomContainer: HTMLDivElement | null = $state(null);
  let canvasContainer: HTMLDivElement | null = $state(null);
  let canvasLongPressPoint = $state<{ x: number; y: number } | null>(null);
  let canvasLongPressTarget = $state<Element | null>(null);

  // Swipe-to-switch-rack gesture state machine. Reads live store values via
  // getters so the same controller instance stays correct as racks change.
  const swipeController = createRackSwipeController({
    isMobile: () => viewportStore.isMobile,
    getRacks: () => layoutStore.racks,
    getRackGroups: () => layoutStore.rack_groups,
    isPlacing: () => placementStore.isPlacing,
    getActiveRackId: () => layoutStore.activeRackId,
    setActiveRack: (id) => layoutStore.setActiveRack(id),
    selectRack: (id) => selectionStore.selectRack(id),
    focusRack: (rackIds, allRacks, groups, rightOffset) =>
      canvasStore.focusRack(rackIds, allRacks, groups, rightOffset),
  });

  // Double-tap-to-fit gesture. Two quick taps in the same spot fit the layout
  // to the screen, resolving the fit verb through the same path as the toolbar
  // and context menu so mobile does not fork its own fit logic.
  const doubleTapController = createCanvasDoubleTap({
    isMobile: () => viewportStore.isMobile,
    isPlacing: () => placementStore.isPlacing,
    onfit: () => {
      if (onfitall) {
        onfitall();
      } else {
        canvasStore.fitAll(racks);
      }
    },
  });

  const TOUCH_LISTENER_OPTIONS: AddEventListenerOptions = {
    // Capture keeps swipe tracking robust even if child components stop bubbling.
    // Because listeners are passive and never call stopPropagation/preventDefault,
    // child touch handlers still run and panzoom keeps gesture ownership.
    capture: true,
    passive: true,
  };

  // Keep touch listener lifecycle synced to the current bound canvas element.
  // We intentionally use passive listeners and never call preventDefault here so
  // panzoom retains control for pan/pinch behavior.
  $effect(() => {
    const element = canvasContainer;
    if (!element) {
      canvasStore.setCanvasElement(null);
      return;
    }

    canvasStore.setCanvasElement(element);

    element.addEventListener(
      "touchstart",
      swipeController.handleTouchStart,
      TOUCH_LISTENER_OPTIONS,
    );
    element.addEventListener(
      "touchmove",
      swipeController.handleTouchMove,
      TOUCH_LISTENER_OPTIONS,
    );
    element.addEventListener(
      "touchend",
      swipeController.handleTouchEnd,
      TOUCH_LISTENER_OPTIONS,
    );
    element.addEventListener(
      "touchcancel",
      swipeController.handleTouchCancel,
      TOUCH_LISTENER_OPTIONS,
    );
    element.addEventListener(
      "touchstart",
      doubleTapController.handleTouchStart,
      TOUCH_LISTENER_OPTIONS,
    );
    element.addEventListener(
      "touchend",
      doubleTapController.handleTouchEnd,
      TOUCH_LISTENER_OPTIONS,
    );
    element.addEventListener(
      "touchcancel",
      doubleTapController.handleTouchCancel,
      TOUCH_LISTENER_OPTIONS,
    );

    return () => {
      element.removeEventListener(
        "touchstart",
        swipeController.handleTouchStart,
        TOUCH_LISTENER_OPTIONS,
      );
      element.removeEventListener(
        "touchmove",
        swipeController.handleTouchMove,
        TOUCH_LISTENER_OPTIONS,
      );
      element.removeEventListener(
        "touchend",
        swipeController.handleTouchEnd,
        TOUCH_LISTENER_OPTIONS,
      );
      element.removeEventListener(
        "touchcancel",
        swipeController.handleTouchCancel,
        TOUCH_LISTENER_OPTIONS,
      );
      element.removeEventListener(
        "touchstart",
        doubleTapController.handleTouchStart,
        TOUCH_LISTENER_OPTIONS,
      );
      element.removeEventListener(
        "touchend",
        doubleTapController.handleTouchEnd,
        TOUCH_LISTENER_OPTIONS,
      );
      element.removeEventListener(
        "touchcancel",
        doubleTapController.handleTouchCancel,
        TOUCH_LISTENER_OPTIONS,
      );
      canvasStore.setCanvasElement(null);
    };
  });

  // Long-press on empty canvas opens canvas context menu on mobile/tablet.
  $effect(() => {
    if (!enableLongPress || !canvasContainer) {
      canvasLongPressPoint = null;
      canvasLongPressTarget = null;
      return;
    }

    const cleanup = useLongPress(
      canvasContainer,
      () => {
        const point = canvasLongPressPoint;
        const target = canvasLongPressTarget;
        canvasLongPressPoint = null;
        canvasLongPressTarget = null;

        if (!point || isRackInteractionTarget(target)) return;

        hapticTap();
        dispatchContextMenuAtPoint(point.x, point.y, canvasContainer);
      },
      {
        onStart: (x, y) => {
          canvasLongPressPoint = { x, y };
          canvasLongPressTarget = document.elementFromPoint(x, y);
        },
        onCancel: () => {
          canvasLongPressPoint = null;
          canvasLongPressTarget = null;
        },
      },
    );

    return cleanup;
  });

  // Initialize panzoom reactively when container becomes available
  $effect(() => {
    if (panzoomContainer) {
      const instance = createCanvasPanzoom(panzoomContainer, {
        minZoom: ZOOM_MIN,
        maxZoom: ZOOM_MAX,
      });

      canvasStore.setPanzoomInstance(instance);

      // Center content on initial load
      requestAnimationFrame(() => {
        canvasStore.fitAll(racks);
      });

      return () => {
        debug.log("Disposing panzoom");
        canvasStore.disposePanzoom();
      };
    }
  });

  // Clear the swipe animation timer when the canvas unmounts.
  $effect(() => () => swipeController.dispose());

  function handleCanvasClick(event: MouseEvent) {
    // Only clear selection if clicking directly on the canvas (not on a rack)
    if (event.target === event.currentTarget) {
      selectionStore.clearSelection();
    }
  }

  function handleNewRack() {
    onnewrack?.();
  }

  // Cancel an armed tap/click-to-place from the placement banner. Mirrors the
  // rack-level cancel: drop placement state and re-fit so the rack is fully in
  // view again (the same exit used after a successful placement).
  function handleCancelPlacement() {
    placementStore.cancelPlacement();
    if (onfitall) {
      onfitall();
    } else {
      canvasStore.fitAll(racks, layoutStore.rack_groups);
    }
  }

  // Screen reader accessible description of rack contents
  const rackDescription = $derived.by(() => {
    if (racks.length === 0) return "No racks configured";
    const rackWord = racks.length === 1 ? "rack" : "racks";
    const totalDevices = racks.reduce((sum, r) => sum + r.devices.length, 0);
    const deviceWord = totalDevices === 1 ? "device" : "devices";
    return `${racks.length} ${rackWord} with ${totalDevices} ${deviceWord} total`;
  });

  const deviceListDescription = $derived.by(() => {
    const activeRack = layoutStore.activeRack;
    if (!activeRack || activeRack.devices.length === 0) return "";
    const deviceNames = [...activeRack.devices]
      .sort((a, b) => b.position - a.position) // Top to bottom
      .map((d) => {
        const deviceType = layoutStore.device_types.find(
          (dt) => dt.slug === d.device_type,
        );
        const name = d.label || deviceType?.model || d.device_type;
        return `U${d.position}: ${name}`;
      });
    return `Active rack devices from top to bottom: ${deviceNames.join(", ")}`;
  });

  function handleCanvasKeydown(event: KeyboardEvent) {
    // Handle Enter/Space as click for accessibility
    if (event.key === "Enter" || event.key === " ") {
      selectionStore.clearSelection();
    }
  }
</script>

<!-- eslint-disable-next-line svelte/no-unused-svelte-ignore -- these warnings appear in Vite build but not ESLint -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (role="application" makes this interactive per WAI-ARIA) -->
<CanvasContextMenu
  onnewrack={handleNewRack}
  onfitall={() => onfitall?.() ?? canvasStore.fitAll(racks)}
  onresetzoom={() => onresetzoom?.() ?? canvasStore.resetZoom()}
>
  <div
    class="canvas"
    class:party-mode={partyMode}
    data-testid="rack-canvas"
    role="application"
    aria-label={rackDescription}
    aria-describedby={deviceListDescription ? "canvas-device-list" : undefined}
    tabindex="0"
    bind:this={canvasContainer}
    onclick={handleCanvasClick}
    onkeydown={handleCanvasKeydown}
  >
    <!-- Hidden description for screen readers -->
    {#if deviceListDescription}
      <p id="canvas-device-list" class="sr-only">{deviceListDescription}</p>
    {/if}

    <!-- Tap/click-to-place banner: full-width overlay that names the armed
         device and offers Cancel. Valid U-slots are highlighted on the rack and
         canvas pan is paused while placing (panzoom defers to the rack). -->
    <PlacementIndicator
      isPlacing={placementStore.isPlacing}
      device={placementStore.pendingDevice}
      oncancel={handleCancelPlacement}
    />

    {#if hasRacks && allRacksEmpty && !hintDismissed}
      <div class="onboarding-hint" role="status" aria-live="polite">
        {#if viewportStore.isMobile}
          <span
            >Open the Devices tab, tap a device to arm it, then tap a rack slot
            to place it.</span
          >
        {:else}
          <span
            >Open the Devices tab on the left and drag items into your rack.</span
          >
        {/if}
        <button
          class="hint-dismiss"
          onclick={dismissOnboardingHint}
          aria-label="Dismiss hint">&times;</button
        >
      </div>
    {/if}

    {#if hasRacks}
      <div class="panzoom-container" bind:this={panzoomContainer}>
        <RackCanvasView
          {partyMode}
          {enableLongPress}
          swipeAnimationDirection={swipeController.animationDirection}
          {onrackselect}
          {ondeviceselect}
          {ondevicedrop}
          {ondevicemove}
          {ondevicemoverack}
          {onracklongpress}
          {onrackfocus}
          {onrackexport}
          {onrackedit}
          {onrackrename}
          {onrackduplicate}
          {onrackdelete}
        />
      </div>
      {#if !viewportStore.isMobile}
        <VerbBarOverlay
          canvasEl={canvasContainer}
          {ondelete}
          {onrackfocus}
          {onrackexport}
        />
      {/if}
    {:else}
      <WelcomeScreen
        templates={starterTemplates}
        onchoosetemplate={(template) => onchoosetemplate?.(template)}
        onblank={handleNewRack}
        onimport={() => onload?.()}
        onshare={() => onshare?.()}
      />
    {/if}
  </div>
</CanvasContextMenu>

<style>
  .canvas {
    flex: 1;
    overflow: hidden;
    background-color: var(--canvas-bg);
    min-height: 0;
    position: relative;
  }

  .panzoom-container {
    /* No flexbox centering - panzoom controls all positioning */
    /* fitAll() centers content on load and when toolbar button clicked */
    min-width: 100%;
    min-height: 100%;
    transform-origin: 0 0;
    touch-action: none;
    cursor: grab;
  }

  .panzoom-container:active {
    cursor: grabbing;
  }

  /* Party mode: animated gradient background */
  @keyframes party-bg {
    0% {
      background-color: hsl(0, 30%, 12%);
    }
    33% {
      background-color: hsl(120, 30%, 12%);
    }
    66% {
      background-color: hsl(240, 30%, 12%);
    }
    100% {
      background-color: hsl(360, 30%, 12%);
    }
  }

  .canvas.party-mode {
    animation: party-bg 4s linear infinite;
  }

  /* Respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .canvas.party-mode {
      animation: none;
    }
  }

  .onboarding-hint {
    position: absolute;
    bottom: var(--space-6, 24px);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
    padding: var(--space-3, 12px) var(--space-4, 16px);
    background: var(--colour-surface, rgba(40, 42, 54, 0.92));
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md, 6px);
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
    max-width: min(90%, 480px);
    pointer-events: none;
    z-index: 10;
  }

  .hint-dismiss {
    background: none;
    border: none;
    color: var(--colour-text-muted);
    cursor: pointer;
    font-size: var(--font-size-base);
    line-height: 1;
    flex-shrink: 0;
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    min-height: 24px;
  }

  .hint-dismiss:hover {
    color: var(--colour-text);
  }
</style>
