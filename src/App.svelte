<!--
  Rackula - Rack Layout Designer
  Main application component
-->
<script lang="ts">
  import { onMount } from "svelte";
  import AnimationDefs from "$lib/components/AnimationDefs.svelte";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import Canvas from "$lib/components/Canvas.svelte";
  import CanvasViewControls from "$lib/components/canvas/CanvasViewControls.svelte";
  import DevicePalette from "$lib/components/DevicePalette.svelte";
  import SidePanel from "$lib/components/SidePanel.svelte";
  import CollapsedPanelStrip from "$lib/components/CollapsedPanelStrip.svelte";
  import PanelEdgeGrip from "$lib/components/PanelEdgeGrip.svelte";
  import ToastContainer from "$lib/components/ToastContainer.svelte";
  import PortTooltip from "$lib/components/PortTooltip.svelte";
  import DragTooltip from "$lib/components/DragTooltip.svelte";
  import KeyboardHandler from "$lib/components/KeyboardHandler.svelte";
  import MobileHistoryControls from "$lib/components/mobile/MobileHistoryControls.svelte";
  import RackIndicator from "$lib/components/mobile/RackIndicator.svelte";
  import SidebarTabs from "$lib/components/SidebarTabs.svelte";
  import RackList from "$lib/components/RackList.svelte";
  import LayoutsLibrary from "$lib/components/LayoutsLibrary.svelte";
  import PersistenceEffects from "$lib/components/PersistenceEffects.svelte";
  import DialogOrchestrator from "$lib/components/DialogOrchestrator.svelte";
  import RestoreFromFileDialog from "$lib/components/RestoreFromFileDialog.svelte";
  import OpenFileGuardDialog from "$lib/components/OpenFileGuardDialog.svelte";
  import {
    runOpenFileFlow,
    type OpenFileLoadAction,
  } from "$lib/actions/open-file-trigger";
  import { hasUnrestoredLocalChanges } from "$lib/actions/share-entry-guard";
  import {
    getShareParam,
    clearShareParam,
    decodeLayout,
  } from "$lib/utils/share";
  import {
    loadSessionWithTimestamp,
    setApiAvailable,
    initializePersistence,
    probeServerForBrowserHint,
    getStorageMode,
    getServerInstanceLabel,
    detectModeFlip,
    listSavedLayouts,
    loadSavedLayout,
    finalizeLayoutLoad,
    handleSaveToServer,
    reconcileSession,
    applyReconcile,
    uploadSnapshot,
    setServerBaseUpdatedAt,
    resolveBrowserLaunch,
    deleteLayoutBody,
  } from "$lib/storage";
  import { serializeLayoutToYaml } from "$lib/utils/yaml";
  import { maybeExport, handleFitAll } from "$lib/utils/app-actions";
  import {
    handleNewRack,
    handleDelete,
    handleAddDevice,
  } from "$lib/utils/dialog-actions";
  import {
    handleRackContextDuplicate,
    handleRackContextDelete,
    handleRackContextExport,
    handleRackContextFocus,
  } from "$lib/utils/rack-actions";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getWorkspaceStore } from "$lib/stores/workspace.svelte";
  import { createLayout } from "$lib/utils/serialization";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { getPlacementStore } from "$lib/stores/placement.svelte";
  import {
    primeKeyboardPlacement,
    focusRackContainer,
  } from "$lib/utils/placement-keyboard-controller";
  import type { DeviceType } from "$lib/types";
  import { createKonamiDetector } from "$lib/utils/konami";
  import {
    formatDevBuildMessage,
    getRuntimeEnv,
    shouldShowDevBuildToast,
  } from "$lib/utils/dev-build-toast";
  import { VERSION } from "$lib/version";
  import { persistenceDebug } from "$lib/utils/debug";
  import { dialogStore } from "$lib/stores/dialogs.svelte";
  import { Tooltip } from "bits-ui";
  import { debounce } from "$lib/utils/debounce";
  import { safeGetItem, safeSetItem } from "$lib/utils/safe-storage";

  const layoutStore = getLayoutStore();
  const workspaceStore = getWorkspaceStore();
  const selectionStore = getSelectionStore();
  const uiStore = getUIStore();
  const canvasStore = getCanvasStore();
  const toastStore = getToastStore();
  const viewportStore = getViewportStore();
  const placementStore = getPlacementStore();

  // Persistence state lives in $lib/storage (manager.svelte.ts); app-level
  // actions (save/export/share orchestration) live in $lib/utils/app-actions.

  // The active sidebar tab name, shown as the collapsed strip's rotated label.
  const sidebarTabLabels: Record<typeof uiStore.sidebarTab, string> = {
    layouts: "Layouts",
    racks: "Racks",
    devices: "Devices",
  };
  const sidebarTabLabel = $derived(sidebarTabLabels[uiStore.sidebarTab]);

  // Party Mode easter egg (triggered by Konami code)
  let partyMode = $state(false);
  let partyModeTimeout: ReturnType<typeof setTimeout> | null = null;

  // Konami detector for party mode
  const konamiDetector = createKonamiDetector(() => {
    activatePartyMode();
  });

  function activatePartyMode() {
    // Check for reduced motion preference
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      toastStore.showToast(
        "Party Mode disabled (reduced motion preference)",
        "info",
      );
      return;
    }

    // Clear existing timeout if party mode is re-triggered
    if (partyModeTimeout) {
      clearTimeout(partyModeTimeout);
    }

    partyMode = true;
    toastStore.showToast("Party Mode!", "info", 3000);

    // Auto-disable after 10 seconds
    partyModeTimeout = setTimeout(() => {
      partyMode = false;
      partyModeTimeout = null;
    }, 10_000);
  }

  // localStorage flag: the browser-mode first-run notice is shown once per device.
  const FIRST_RUN_NOTICE_KEY = "rackula.browserMode.firstRunSeen";

  // Startup must emit at most one storage toast (epic #2071 signal coherence).
  // First-run notice, mode-flip notice, and server-drop toast are mutually
  // exclusive; this guard dedups them.
  let storageToastShown = false;

  function showStorageToast(
    message: string,
    type: "info" | "warning",
    duration: number,
    action?: { label: string; onClick: () => void },
  ): void {
    if (storageToastShown) return;
    storageToastShown = true;
    toastStore.showToast(message, type, duration, action);
  }

  // Browser mode only: a one-time notice explaining where layouts live.
  function maybeShowFirstRunNotice(): void {
    if (safeGetItem(FIRST_RUN_NOTICE_KEY) === "true") return;
    safeSetItem(FIRST_RUN_NOTICE_KEY, "true");
    showStorageToast(
      "Layouts are saved in this browser. Export to a file to keep a copy.",
      "info",
      8000,
    );
  }

  // Restore an autosaved working copy into the store and recenter the view.
  function restoreLocalSession(
    session: NonNullable<ReturnType<typeof loadSessionWithTimestamp>>,
  ): void {
    layoutStore.loadLayout(session.layout);
    // Autosaved sessions are not explicitly saved, so they start dirty.
    layoutStore.markDirty();
    layoutStore.restoreBackupState({
      changesSinceExport: session.changesSinceExport,
      hasEverExported: session.hasEverExported,
    });
    requestAnimationFrame(() => {
      if (!canvasStore.restoreViewport()) {
        canvasStore.fitAll(layoutStore.racks, layoutStore.rack_groups);
      }
    });
  }

  // Auto-open new rack dialog when no racks exist (first-load experience)
  // Also handles loading shared layouts from URL params
  // Uses onMount to run once on initial load, not reactively
  onMount(async () => {
    // Dev environments only: show build info toast on load (#2106)
    if (shouldShowDevBuildToast(getRuntimeEnv(), import.meta.env.DEV)) {
      const commitHash =
        typeof __COMMIT_HASH__ !== "undefined" ? __COMMIT_HASH__ : "";
      const buildTime =
        typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "";
      toastStore.showToast(
        formatDevBuildMessage(VERSION, commitHash, buildTime),
        "info",
        8000,
      );
    }

    const serverMode = getStorageMode() === "server";

    // Server mode only: probe the API so server autosave/load can enable when
    // reachable. Browser mode skips the persistence probe (no server to reach),
    // but fires a one-shot, fire-and-forget health probe so the chip can surface
    // a passive "a server is reachable" hint if the deployment is misconfigured
    // (browser mode while /api/health answers, #2063). It shows no toast and is
    // never awaited on the entry path.
    const persistenceInitPromise = serverMode
      ? initializePersistence().catch((error) => {
          persistenceDebug.api(
            "persistence initialization failed; continuing without server persistence: %O",
            error,
          );
          setApiAvailable(false);
          return false;
        })
      : Promise.resolve(false);
    if (!serverMode) {
      void probeServerForBrowserHint();
    }

    // Priority 1: Check for shared layout in URL (highest priority)
    const shareParam = getShareParam();
    let pendingShareLoad: OpenFileLoadAction | null = null;
    if (shareParam) {
      const { layout: sharedLayout, error: shareError } =
        decodeLayout(shareParam);
      if (sharedLayout) {
        const loadSharedLayout: OpenFileLoadAction = (guarded) => {
          layoutStore.loadLayout(sharedLayout);
          layoutStore.markClean();
          // Name what became of the previous layout instead of a generic
          // success toast that implies nothing happened to it, mirroring
          // #2987's open-file guard (R3/#2988).
          toastStore.showToast(
            guarded
              ? "Previous layout kept in Layouts"
              : "Shared layout loaded",
            "success",
          );

          // Reset view to center the loaded rack after DOM updates
          requestAnimationFrame(() => {
            canvasStore.fitAll(layoutStore.racks, layoutStore.rack_groups);
          });
        };

        // Drop the URL payload now regardless of outcome: a refresh mid-decision
        // (or after a clean load) must never re-decode or re-prompt (#2988).
        clearShareParam();

        if (hasUnrestoredLocalChanges(serverMode)) {
          // Unexported local work is sitting in storage but has not been
          // restored into the live layout store yet, so runOpenFileFlow's own
          // changesSinceExport check would see the pristine boot-time store
          // and wrongly skip the guard. Defer applying the share until after
          // the normal restore below hydrates the real local layout: the
          // guard dialog then has real content to protect, "Export first" has
          // real content to export, and Cancel simply leaves that restored
          // layout in place.
          pendingShareLoad = loadSharedLayout;
        } else {
          // No unexported changes anywhere in local storage: load the shared
          // layout immediately, exactly as before this fix (AC3).
          loadSharedLayout(false);
          return; // Don't check autosave or show start screen
        }
      } else {
        clearShareParam();
        toastStore.showToast(shareError ?? "Invalid share link", "error");
      }
    }

    await restoreLocalWorkspaceOrSession();

    // A share link decoded successfully but was deferred above because local
    // storage had unexported changes. The restore just hydrated them into the
    // live layout store, so runOpenFileFlow's own check now sees the truth and
    // opens OpenFileGuardDialog (#2987) with the shared layout as its pending
    // load (Cancel / Export first / Replace).
    if (pendingShareLoad) {
      runOpenFileFlow(pendingShareLoad);
    }

    // Wrapped so the share-link guard above can await this exact restore
    // logic (unchanged from before #2988) before deciding whether to apply
    // a deferred share load; a hoisted function declaration so the earlier
    // await call can reach it.
    async function restoreLocalWorkspaceOrSession(): Promise<void> {
      // Browser mode: no server compare. Lazily restore the previously open tab
      // set from the multi-layout workspace (#2080), hydrating the active tab now
      // and the rest on first focus. With no persisted workspace, open straight to
      // the canvas empty state. Surface a server->browser flip notice when the
      // restored copy came from a server deployment (never silently degrade), else
      // a one-time first-run notice. No offline toasts ever in browser mode. Entry
      // actions (new/open/import) live in the sidebar and app menu.
      if (!serverMode) {
        const launch = resolveBrowserLaunch();
        if (launch.action === "empty") {
          if (!launch.everHadLayouts) {
            // Genuine fresh install: add one default rack to the already-seeded
            // first tab (its active layout has zero racks), so first run lands in
            // a layout with one rack and never a bare zero-rack void (#2831). Use
            // handleNewRack rather than handleNewLayout here: the latter opens a
            // second tab on top of the seed, leaving a phantom empty tab. The
            // first-run notice is for genuine fresh installs.
            handleNewRack();
            maybeShowFirstRunNotice();
          } else {
            // Returning user whose workspace is empty (data lost or wiped). The
            // zero-rack canvas shows the inline "Add a rack" affordance, so this
            // is not a dead end; do not tell them this is their first time.
            // #2095/#2018 own the lost-data recovery state.
            layoutStore.resetLayout();
          }
          return;
        }

        const activeEntry = launch.index.activeId
          ? launch.index.library[launch.index.activeId]
          : undefined;
        if (
          activeEntry &&
          detectModeFlip(activeEntry.storageMode) === "server-to-browser"
        ) {
          showStorageToast(
            "This deployment now stores layouts in your browser; your previous server library is not loaded here.",
            "warning",
            0,
          );
        } else {
          maybeShowFirstRunNotice();
        }

        // restoreWorkspace hydrates the active tab and restores its durability
        // (dirty by autosave convention, not explicitly saved). deleteBody wires
        // true library deletion (#2325): removing a layout drops its persisted
        // body and index entry, not just the open tab.
        workspaceStore.restoreWorkspace({
          index: launch.index,
          loadBody: launch.loadBody,
          deleteBody: deleteLayoutBody,
        });
        requestAnimationFrame(() => {
          if (!canvasStore.restoreViewport()) {
            canvasStore.fitAll(layoutStore.racks, layoutStore.rack_groups);
          }
        });
        return;
      }

      // Server mode below.

      // Get localStorage session data (with timestamp and stored mode if available)
      const localSession = loadSessionWithTimestamp();

      // No local session: open straight to the canvas empty state. The server
      // library is reachable through the sidebar Layouts tab and the app menu;
      // there is no blocking modal while the health check resolves.
      // Reset layout to clear any stale hasStarted flag from a previous session (#1326)
      if (!localSession) {
        layoutStore.resetLayout();
        return;
      }

      const instanceLabel = getServerInstanceLabel();
      const apiAvailable = await persistenceInitPromise;
      // initializePersistence() resolves to false for the common API-unavailable
      // case (checkApiHealth returns false rather than rejecting). In server mode
      // a down server is surfaced with an instance-named drop toast, and the
      // working copy keeps continuity.
      if (!apiAvailable) {
        showStorageToast(
          `Cannot reach ${instanceLabel}. Working from your local copy; reload to retry.`,
          "warning",
          0,
        );
      }

      // browser->server flip: the working copy's UUID is unknown to the server, so
      // offer to upload it as a new server layout rather than shadowing it with the
      // server list. Only meaningful while the server is reachable.
      const flip = detectModeFlip(localSession.storageMode);
      if (apiAvailable && flip === "browser-to-server") {
        restoreLocalSession(localSession);
        showStorageToast(
          "This deployment now stores layouts on the server. Upload your local copy to keep it here.",
          "info",
          0,
          {
            label: "Upload",
            onClick: () => {
              void handleSaveToServer(true);
            },
          },
        );
        return;
      }

      // Priority 3: When API and local session are both available, reconcile the
      // local working copy against the server's layout list by the echo model
      // (UUID match + updatedAt recency), snapshotting any losing local copy
      // before it is discarded (#2041).
      if (apiAvailable) {
        try {
          const savedLayouts = await listSavedLayouts();
          const localUuid = localSession.layout.metadata?.id ?? null;
          const action = reconcileSession({
            localUuid,
            localSavedAt: localSession.savedAt,
            localServerUpdatedAt: localSession.serverUpdatedAt,
            serverLayouts: savedLayouts,
          });
          await applyReconcile(action, {
            serializeLosingCopy: () =>
              serializeLayoutToYaml(localSession.layout, {}),
            uploadSnapshot,
            loadServer: async (item) => {
              const {
                layout,
                images,
                failedImagesCount,
                failedKeys,
                updatedAt,
              } = await loadSavedLayout(item.id);
              if (failedKeys.length > 0) {
                persistenceDebug.api(
                  "reconciliation: %d image(s) failed to read: %o",
                  failedKeys.length,
                  failedKeys,
                );
              }
              setServerBaseUpdatedAt(updatedAt ?? null);
              finalizeLayoutLoad(layout, images, failedImagesCount, {
                successMessage: null,
                failedKeys,
              });
            },
            restoreLocal: (reason) => {
              // A copy the server has never seen has no valid base: clear it so
              // the re-establishing PUT creates fresh instead of echoing a stale
              // updatedAt. Diverged/ahead copies keep their base.
              setServerBaseUpdatedAt(
                reason === "unknown-to-server"
                  ? null
                  : localSession.serverUpdatedAt,
              );
              restoreLocalSession(localSession);
            },
            toast: (m, t) => toastStore.showToast(m, t),
          });
          return;
        } catch (error) {
          persistenceDebug.api(
            "failed to reconcile saved layouts from server: %O",
            error,
          );
          setApiAvailable(false);
          showStorageToast(
            `Cannot reach ${instanceLabel}. Working from your local copy; reload to retry.`,
            "warning",
            0,
          );
        }
      }

      // Priority 4: No reachable server or no server layouts - restore the
      // localStorage working copy for continuity.
      restoreLocalSession(localSession);
      return;
    }
  });

  // Refit canvas on orientation change (mobile/tablet only).
  // Debounced 300ms to let the rotation animation complete before measuring the new viewport.
  onMount(() => {
    const onOrientationChange = debounce(() => {
      if (!viewportStore.isMobile) return;
      canvasStore.fitAll(layoutStore.racks, layoutStore.rack_groups);
    }, 300);

    if (typeof screen?.orientation?.addEventListener === "function") {
      screen.orientation.addEventListener("change", onOrientationChange);
      return () =>
        screen.orientation.removeEventListener("change", onOrientationChange);
    }

    // Fallback: detect orientation flip via resize event
    let lastIsLandscape = window.innerWidth > window.innerHeight;
    const onResize = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      if (isLandscape !== lastIsLandscape) {
        lastIsLandscape = isLandscape;
        onOrientationChange();
      }
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  });

  function handleCollapseSidebar() {
    uiStore.setSidebarCollapsed(true);
  }

  function handleExpandSidebar() {
    uiStore.setSidebarCollapsed(false);
  }

  function handleNewLayout() {
    workspaceStore.openTab(createLayout());
    handleNewRack();
  }

  function handleLayoutExport(tabId: string) {
    workspaceStore.switchTo(tabId);
    maybeExport();
  }

  // --- Thin wrappers for Toolbar/Canvas callbacks ---
  // These delegate to dialogStore; the actual dialog logic lives in DialogOrchestrator.

  function handleToggleDisplayMode() {
    uiStore.toggleDisplayMode();
    layoutStore.updateDisplayMode(uiStore.displayMode);
    layoutStore.updateShowLabelsOnImages(uiStore.showLabelsOnImages);
  }

  // Rack interaction handlers (used by Canvas and RackList)

  function handleRackLongPress(event: CustomEvent<{ rackId: string }>) {
    if (placementStore.isPlacing) return;
    const { rackId } = event.detail;
    layoutStore.setActiveRack(rackId);
    selectionStore.selectRack(rackId);
    dialogStore.closeSheet();
    dialogStore.openSheet("rackEdit");
  }

  function handleRackContextEdit(rackId: string) {
    layoutStore.setActiveRack(rackId);
    selectionStore.selectRack(rackId);
    if (viewportStore.isMobile) {
      dialogStore.openSheet("rackEdit");
    }
  }

  function handleRackContextRename(rackId: string) {
    handleRackContextEdit(rackId);
  }

  // Desktop keyboard placement (#106): Enter (or click) on a palette device arms
  // placement and seeds a keyboard cursor in the focused rack, so a keyboard-only
  // user can pick a device then drive the U-slot with the arrow keys. Pointer
  // placement (mobile tap-to-place) arms via a different handler and shows no
  // cursor; this path is the desktop sidebar palette.
  function handleDevicePaletteSelect(
    event: CustomEvent<{ device: DeviceType }>,
  ) {
    if (uiStore.readOnly) return;
    const { device } = event.detail;
    placementStore.startPlacement(device);
    primeKeyboardPlacement(
      {
        getRacks: () => layoutStore.racks,
        getDeviceLibrary: () => layoutStore.device_types,
        getActiveRackId: () => layoutStore.activeRackId,
        getTargetFace: () => placementStore.targetFace,
        setActiveRack: (id) => layoutStore.setActiveRack(id),
        setCursor: (rackId, position) =>
          placementStore.setCursor(rackId, position),
        announce: (text) => placementStore.announcePosition(text),
        abandonPlacement: () => placementStore.abandonPlacement(),
      },
      device,
    );
    // Move focus off the palette item onto the active rack, so the palette item
    // does not also handle the next Enter (which would re-arm the device) and so
    // focus follows the placement context. Use the active rack (not the cursor's
    // target) so focus still transfers when the rack is full and no cursor was
    // seeded; the user can then Tab to a rack with space. Synchronous so an
    // immediate second Enter lands on the rack.
    const rackToFocus = placementStore.targetRackId ?? layoutStore.activeRackId;
    if (rackToFocus) {
      focusRackContainer(rackToFocus);
    }
  }
</script>

<svelte:window onkeydown={(e) => konamiDetector.handleKeyDown(e)} />

<!-- Tooltip.Provider enables shared tooltip state - only one tooltip shows at a time -->
<Tooltip.Provider delayDuration={500}>
  <div class="app-layout">
    <Toolbar {partyMode} onlayoutexport={handleLayoutExport} />

    <RackIndicator />

    <main class="app-main" class:mobile={viewportStore.isMobile}>
      <MobileHistoryControls />

      {#if !viewportStore.isMobile}
        <div class="workspace">
          <!-- The sidebar stays a labelled landmark in both states: expanded it
               hosts the tabbed content, collapsed it is the 44px reopen strip
               (#2397). Keeping the aside in both states mirrors the right panel
               and preserves landmark navigation. -->
          <aside
            class="sidebar-panel"
            class:sidebar-panel--collapsed={uiStore.sidebarCollapsed}
            aria-label="Layouts, racks and devices panel"
            data-testid="drawer-left"
          >
            {#if uiStore.sidebarCollapsed}
              <CollapsedPanelStrip
                side="left"
                label={sidebarTabLabel}
                onexpand={handleExpandSidebar}
              />
            {:else}
              <SidebarTabs
                activeTab={uiStore.sidebarTab}
                onchange={(tab) => uiStore.setSidebarTab(tab)}
                oncollapse={handleCollapseSidebar}
              />
              <div class="sidebar-content">
                {#if uiStore.sidebarTab === "devices"}
                  <DevicePalette
                    ondeviceselect={handleDevicePaletteSelect}
                    oncreatedevice={handleAddDevice}
                  />
                {:else if uiStore.sidebarTab === "racks"}
                  <RackList
                    onnewrack={handleNewRack}
                    onexport={handleRackContextExport}
                    onfocus={handleRackContextFocus}
                    onedit={handleRackContextEdit}
                    onrename={handleRackContextRename}
                    onduplicate={handleRackContextDuplicate}
                  />
                {:else if uiStore.sidebarTab === "layouts"}
                  <LayoutsLibrary
                    onnewlayout={handleNewLayout}
                    onexport={handleLayoutExport}
                  />
                {/if}
              </div>
            {/if}
          </aside>

          <div class="canvas-region">
            <Canvas
              onnewrack={handleNewRack}
              onfitall={handleFitAll}
              onresetzoom={() => canvasStore.resetZoom()}
              displayMode={uiStore.displayMode}
              ontoggledisplaymode={handleToggleDisplayMode}
              {partyMode}
              enableLongPress={false}
              onracklongpress={handleRackLongPress}
              onrackfocus={handleRackContextFocus}
              onrackexport={handleRackContextExport}
              onrackedit={handleRackContextEdit}
              onrackrename={handleRackContextRename}
              onrackduplicate={handleRackContextDuplicate}
              onrackdelete={handleRackContextDelete}
              ondelete={handleDelete}
            />

            <CanvasViewControls
              displayMode={uiStore.displayMode}
              onfitall={handleFitAll}
              ontoggledisplaymode={handleToggleDisplayMode}
            />

            <!-- Toasts anchor to the bottom-center of the canvas region (#2637). -->
            <ToastContainer />
          </div>

          <SidePanel />

          <!-- Secondary collapse affordance for mouse users (#2553): a
               hover-revealed grip floated on each panel's canvas-facing seam,
               clear of panel content and the scrollbar (#2560). This branch is
               already non-mobile; the grips hide while a panel is collapsed, and
               the in-row chevron stays the primary control. -->
          {#if !uiStore.sidebarCollapsed}
            <div class="edge-grip-seam edge-grip-seam--left">
              <PanelEdgeGrip panel="left" oncollapse={handleCollapseSidebar} />
            </div>
          {/if}
          {#if !uiStore.sidePanelCollapsed}
            <div class="edge-grip-seam edge-grip-seam--right">
              <PanelEdgeGrip
                panel="right"
                oncollapse={() => uiStore.setSidePanelCollapsed(true)}
              />
            </div>
          {/if}
        </div>
      {:else}
        <Canvas
          onnewrack={handleNewRack}
          onfitall={handleFitAll}
          onresetzoom={() => canvasStore.resetZoom()}
          displayMode={uiStore.displayMode}
          ontoggledisplaymode={handleToggleDisplayMode}
          {partyMode}
          enableLongPress={viewportStore.isMobile && !placementStore.isPlacing}
          onracklongpress={handleRackLongPress}
          onrackfocus={handleRackContextFocus}
          onrackexport={handleRackContextExport}
          onrackedit={handleRackContextEdit}
          onrackrename={handleRackContextRename}
          onrackduplicate={handleRackContextDuplicate}
          onrackdelete={handleRackContextDelete}
          ondelete={handleDelete}
        />

        <!-- Mobile has no canvas-region wrapper; anchor toasts to .app-main, which
             spans the full mobile width (no side panels) and is bottom-center over
             the canvas (#2637). -->
        <ToastContainer />
      {/if}
    </main>

    <DialogOrchestrator />

    <RestoreFromFileDialog />

    <OpenFileGuardDialog />

    <KeyboardHandler />

    <PersistenceEffects />

    <!-- Global SVG gradient definitions for animations -->
    <AnimationDefs />

    <!-- Port tooltip for network interface hover -->
    <PortTooltip />

    <!-- Drag tooltip for device name/U-height during drag -->
    <DragTooltip />
  </div>
</Tooltip.Provider>

<style>
  .app-layout {
    display: flex;
    flex-direction: column;
    /* Use 100dvh for mobile to account for browser UI */
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
  }

  .app-main {
    display: flex;
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  /* Mobile-specific styles */
  .app-main.mobile {
    /* Prevent overscroll/bounce on iOS */
    overscroll-behavior: none;
    /* Account for fixed bottom nav */
    padding-bottom: calc(
      var(--bottom-nav-height) + var(--safe-area-bottom, 0px) +
        var(--keyboard-height, 0px)
    );
  }

  /* Desktop workspace: a fixed-width left panel (or its 44px collapsed strip),
     the flexible canvas region, and the fixed-width side panel (#2397). Both
     panels are fixed width with no drag-to-resize. */
  .workspace {
    display: flex;
    flex-direction: row;
    flex: 1;
    overflow: hidden;
    min-height: 0;
    background-color: var(--canvas-bg);
    /* Positioning context for the seam-mounted edge grips (.edge-grip-seam). */
    position: relative;
  }

  .sidebar-panel {
    width: var(--sidebar-width, 320px);
    flex-shrink: 0;
    background: var(--colour-sidebar-bg);
    border-right: 1px solid var(--colour-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: width var(--duration-normal) var(--ease-in-out);
    /* Stack above the canvas overlays (verb bar, placement indicator) so the
       panel occludes them where they overlap the canvas edge (#2491). */
    position: relative;
    z-index: var(--z-sidebar);
  }

  /* Collapsed: shrink to the 44px strip; the strip owns its own outer border. */
  .sidebar-panel--collapsed {
    width: var(--panel-collapsed-strip-width, 44px);
    border-right: none;
  }

  /* Holds the active tab's content below the tab row. */
  .sidebar-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  /* The hover-revealed edge grips float on each panel's canvas-facing seam,
     entirely on the canvas side, so they never overlap panel content or the
     device-list scrollbar (#2560). Stacked above the panels and canvas so the
     strip is clickable on the seam. Gated and hidden-while-collapsed in markup. */
  .edge-grip-seam {
    position: absolute;
    top: 0;
    bottom: 0;
    width: var(--panel-edge-grip-width, 12px);
    z-index: calc(var(--z-sidebar) + 1);
    /* The seam is pinned to the expanded panel width, but the panel animates its
       width on expand. Hold the grip hidden and non-interactive until the panel
       finishes expanding (the animation delay matches the panel's transition), so
       it never looks detached from the moving seam or intercepts a canvas click
       mid-transition (#2560). On collapse the grip unmounts immediately. */
    opacity: 0;
    pointer-events: none;
    animation: edge-grip-appear var(--duration-fast) var(--ease-out)
      var(--duration-normal) forwards;
  }

  @keyframes edge-grip-appear {
    from {
      opacity: 0;
      pointer-events: none;
    }
    to {
      opacity: 1;
      pointer-events: auto;
    }
  }

  .edge-grip-seam--left {
    left: var(--sidebar-width, 320px);
  }

  .edge-grip-seam--right {
    right: var(--side-panel-width, 320px);
  }

  @media (prefers-reduced-motion: reduce) {
    .edge-grip-seam {
      animation: none;
      opacity: 1;
      pointer-events: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sidebar-panel {
      transition: none;
    }
  }

  .canvas-region {
    flex: 1;
    min-width: 0;
    /* Keep the canvas clamped to the row's height; a flex item defaults to
       min-height: auto, which would let the tall rack content stretch the
       region past the viewport and skew the fit-to-view zoom. */
    min-height: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /* Anchor the bottom-left CanvasViewControls to the canvas region. */
    position: relative;
  }

  /* Note: Mobile overscroll prevention should be in global styles (index.html or app.css) */
  /* body { overscroll-behavior-y: contain; } for <1024px viewports */
</style>
