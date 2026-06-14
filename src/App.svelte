<!--
  Rackula - Rack Layout Designer
  Main application component
-->
<script lang="ts">
  import { onMount, untrack } from "svelte";
  import AnimationDefs from "$lib/components/AnimationDefs.svelte";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import Canvas from "$lib/components/Canvas.svelte";
  import { PaneGroup, Pane, PaneResizer } from "paneforge";
  import DevicePalette from "$lib/components/DevicePalette.svelte";
  import EditPanel from "$lib/components/EditPanel.svelte";
  import ToastContainer from "$lib/components/ToastContainer.svelte";
  import PortTooltip from "$lib/components/PortTooltip.svelte";
  import DragTooltip from "$lib/components/DragTooltip.svelte";
  import KeyboardHandler from "$lib/components/KeyboardHandler.svelte";
  import MobileHistoryControls from "$lib/components/mobile/MobileHistoryControls.svelte";
  import RackIndicator from "$lib/components/mobile/RackIndicator.svelte";
  import SidebarTabs from "$lib/components/SidebarTabs.svelte";
  import LayoutTabs from "$lib/components/LayoutTabs.svelte";
  import RackList from "$lib/components/RackList.svelte";
  import PersistenceEffects from "$lib/components/PersistenceEffects.svelte";
  import DialogOrchestrator from "$lib/components/DialogOrchestrator.svelte";
  import StartScreen, {
    type StartScreenCloseOptions,
  } from "$lib/components/StartScreen.svelte";
  import {
    getShareParam,
    clearShareParam,
    decodeLayout,
  } from "$lib/utils/share";
  import {
    loadSessionWithTimestamp,
    setApiAvailable,
    initializePersistence,
    getStorageMode,
    getServerInstanceLabel,
    detectModeFlip,
    listSavedLayouts,
    loadSavedLayout,
    finalizeLayoutLoad,
    handleLoad,
    handleSaveToServer,
    reconcileSession,
    applyReconcile,
    uploadSnapshot,
    setServerBaseUpdatedAt,
  } from "$lib/storage";
  import { serializeLayoutToYaml } from "$lib/utils/yaml";
  import {
    maybeSave,
    maybeSaveAs,
    maybeExport,
    handleShare,
    handleFitAll,
    resetAndOpenNewRack,
  } from "$lib/utils/app-actions";
  import {
    handleNewRack,
    handleDelete,
    handleHelp,
    handleAddDevice,
    handleImportFromNetBox,
    handleOpenYamlEditor,
  } from "$lib/utils/dialog-actions";
  import {
    handleRackContextDuplicate,
    handleRackContextDelete,
    handleRackContextExport,
    handleRackContextFocus,
  } from "$lib/utils/rack-actions";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { getPlacementStore } from "$lib/stores/placement.svelte";
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

  // Sidebar size configuration (in pixels)
  interface Props {
    sidePanelSizeMin?: number;
    sidePanelSizeMax?: number;
    sidePanelSizeDefault?: number;
  }

  let {
    sidePanelSizeMin = 290,
    sidePanelSizeMax = 420,
    sidePanelSizeDefault = 320,
  }: Props = $props();

  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const uiStore = getUIStore();
  const canvasStore = getCanvasStore();
  const toastStore = getToastStore();
  const viewportStore = getViewportStore();
  const placementStore = getPlacementStore();

  // Persistence state lives in $lib/storage (manager.svelte.ts); app-level
  // actions (save/export/share orchestration) live in $lib/utils/app-actions.

  // Sidebar width: read once from the UI store.
  // This is intentionally NOT reactive because changes to sidebarWidth are driven
  // by layout / resize logic elsewhere that also writes back to uiStore. If this
  // value were reactive, it could participate in a feedback loop (store → layout
  // recompute → store) and cause jittery or repeated layout updates. We only need
  // an initial width to seed the layout; subsequent updates use the store directly.
  const initialSidebarWidthPx =
    uiStore.sidebarWidth ?? untrack(() => sidePanelSizeDefault);

  // Safe viewport width: use viewportStore if available, else fallback to reasonable default
  // Guards against SSR/test environments where window may not exist
  /**
   * Returns a safe viewport width in pixels for layout calculations.
   *
   * Uses the current value from {@link viewportStore.width} when it is greater than 0.
   * In SSR or test environments (or when the width is not yet initialized), it falls
   * back to a sensible default of 1280px to keep percentage-based sizing stable.
   *
   * @returns A positive viewport width in pixels, defaulting to 1280 when unavailable.
   */
  function getSafeViewportWidth(): number {
    const width = viewportStore.width;
    // Fallback to 1280px (common desktop width) to ensure sensible percentage calculations
    return width > 0 ? width : 1280;
  }

  // Convert pixel sizes to percentages based on viewport width
  let sidebarMinPercent = $derived(
    (sidePanelSizeMin / getSafeViewportWidth()) * 100,
  );
  let sidebarMaxPercent = $derived(
    (sidePanelSizeMax / getSafeViewportWidth()) * 100,
  );
  // Initial default size - computed once, not reactive
  const sidebarDefaultPercent =
    (initialSidebarWidthPx / getSafeViewportWidth()) * 100;

  // Handle resize - convert percentage back to pixels and persist
  function handleSidebarResize(size: number) {
    const viewportWidth = getSafeViewportWidth();
    const widthPx = (size / 100) * viewportWidth;
    uiStore.setSidebarWidth(widthPx);
  }

  // Party Mode easter egg (triggered by Konami code)
  let partyMode = $state(false);
  let partyModeTimeout: ReturnType<typeof setTimeout> | null = null;
  let showStartScreen = $state(false);

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
    // reachable. Browser mode skips the probe entirely (no server to reach).
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

    // Priority 1: Check for shared layout in URL (highest priority)
    const shareParam = getShareParam();
    if (shareParam) {
      const { layout: sharedLayout, error: shareError } =
        decodeLayout(shareParam);
      if (sharedLayout) {
        layoutStore.loadLayout(sharedLayout);
        layoutStore.markClean();
        clearShareParam();
        toastStore.showToast("Shared layout loaded", "success");

        // Reset view to center the loaded rack after DOM updates
        requestAnimationFrame(() => {
          canvasStore.fitAll(layoutStore.racks, layoutStore.rack_groups);
        });
        return; // Don't check autosave or show start screen
      } else {
        clearShareParam();
        toastStore.showToast(shareError ?? "Invalid share link", "error");
      }
    }

    // Get localStorage session data (with timestamp and stored mode if available)
    const localSession = loadSessionWithTimestamp();

    // Browser mode: no server compare. Restore the working copy if present,
    // otherwise show the Start Screen. Surface a server->browser flip notice when
    // the saved copy came from a server deployment (never silently degrade), else
    // a one-time first-run notice. No offline toasts ever in browser mode.
    if (!serverMode) {
      if (!localSession) {
        layoutStore.resetLayout();
        maybeShowFirstRunNotice();
        showStartScreen = true;
        return;
      }
      if (detectModeFlip(localSession.storageMode) === "server-to-browser") {
        showStorageToast(
          "This deployment now stores layouts in your browser; your previous server library is not loaded here.",
          "warning",
          0,
        );
      } else {
        maybeShowFirstRunNotice();
      }
      restoreLocalSession(localSession);
      return;
    }

    // Server mode below.

    // No local session: show the Start Screen immediately. It handles the
    // loading/offline state while the health check resolves.
    // Reset layout to clear any stale hasStarted flag from a previous session (#1326)
    if (!localSession) {
      layoutStore.resetLayout();
      showStartScreen = true;
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
            const { layout, images, failedImagesCount, failedKeys, updatedAt } =
              await loadSavedLayout(item.id);
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

  function handleShowLayouts() {
    if (uiStore.warnOnUnsavedChanges && layoutStore.isDirty) {
      if (!window.confirm("You have unsaved changes. Leave anyway?")) {
        return;
      }
    }
    showStartScreen = true;
  }

  function handleStartScreenClose(options?: StartScreenCloseOptions) {
    showStartScreen = false;

    // User explicitly requested a fresh layout; StartScreen already opened NewRack.
    if (options?.skipAutosave) {
      return;
    }

    // Continue flow fallback: no loaded/imported layout, open wizard.
    if (layoutStore.rackCount === 0) {
      dialogStore.open("newRack");
      return;
    }

    // Layout was loaded/imported; center it after Start Screen closes.
    requestAnimationFrame(() => {
      canvasStore.fitAll(layoutStore.racks, layoutStore.rack_groups);
    });
  }

  // --- Thin wrappers for Toolbar/Canvas/KeyboardHandler callbacks ---
  // These delegate to dialogStore; the actual dialog logic lives in DialogOrchestrator.

  function handleToggleTheme() {
    uiStore.toggleTheme();
  }

  function handleToggleDisplayMode() {
    uiStore.toggleDisplayMode();
    layoutStore.updateDisplayMode(uiStore.displayMode);
    layoutStore.updateShowLabelsOnImages(uiStore.showLabelsOnImages);
  }

  function handleToggleAnnotations() {
    uiStore.toggleAnnotations();
  }

  function handleImportDevices() {
    // Delegates to DialogOrchestrator's hidden file input via dialogStore
    // The DialogOrchestrator handles the actual file input click
    dialogOrchestrator.handleImportDevices();
  }

  function handleOpenCleanupDialog() {
    dialogOrchestrator.handleOpenCleanupDialog();
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

  // DialogOrchestrator component reference for delegating calls
  let dialogOrchestrator: DialogOrchestrator;
</script>

<svelte:window onkeydown={(e) => konamiDetector.handleKeyDown(e)} />

<!-- Tooltip.Provider enables shared tooltip state - only one tooltip shows at a time -->
<Tooltip.Provider delayDuration={500}>
  {#if showStartScreen}
    <StartScreen onClose={handleStartScreenClose} />
  {/if}

  <div
    class="app-layout"
    style="--sidebar-width: min({uiStore.sidebarWidth ??
      sidePanelSizeDefault}px, var(--sidebar-width-max))"
  >
    <Toolbar
      hasRacks={layoutStore.hasRack}
      theme={uiStore.theme}
      displayMode={uiStore.displayMode}
      showAnnotations={uiStore.showAnnotations}
      showBanana={uiStore.showBanana}
      compatibleOnly={uiStore.compatibleOnly}
      warnOnUnsavedChanges={uiStore.warnOnUnsavedChanges}
      promptCleanupOnSave={uiStore.promptCleanupOnSave}
      {partyMode}
      onsave={maybeSave}
      onsaveas={maybeSaveAs}
      onload={handleLoad}
      onexport={maybeExport}
      onshare={handleShare}
      onviewyaml={handleOpenYamlEditor}
      onimportdevices={handleImportDevices}
      onimportnetbox={handleImportFromNetBox}
      onnewcustomdevice={handleAddDevice}
      onlayouts={handleShowLayouts}
      onfitall={handleFitAll}
      ontoggletheme={handleToggleTheme}
      ontoggledisplaymode={handleToggleDisplayMode}
      ontoggleannotations={handleToggleAnnotations}
      ontogglebanana={() => uiStore.toggleBanana()}
      ontogglecompatibleonly={() => uiStore.toggleCompatibleOnly()}
      ontogglewarnunsaved={() => uiStore.toggleWarnOnUnsavedChanges()}
      ontogglepromptcleanup={() => uiStore.togglePromptCleanupOnSave()}
      onopencleanup={handleOpenCleanupDialog}
      onhelp={handleHelp}
      onnewlayout={resetAndOpenNewRack}
    />

    <RackIndicator />

    <LayoutTabs />

    <main class="app-main" class:mobile={viewportStore.isMobile}>
      <MobileHistoryControls />

      {#if !viewportStore.isMobile}
        <PaneGroup
          direction="horizontal"
          keyboardResizeBy={10}
          class="pane-group"
        >
          <Pane
            defaultSize={sidebarDefaultPercent}
            minSize={sidebarMinPercent}
            maxSize={sidebarMaxPercent}
            onResize={handleSidebarResize}
            id="sidebar-pane"
            class="sidebar-pane"
            data-testid="drawer-left"
          >
            <SidebarTabs
              activeTab={uiStore.sidebarTab}
              onchange={(tab) => uiStore.setSidebarTab(tab)}
            />
            {#if uiStore.sidebarTab === "devices"}
              <DevicePalette
                oncreatedevice={handleAddDevice}
                ontoggledisplaymode={handleToggleDisplayMode}
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
            {/if}
          </Pane>

          <PaneResizer class="resize-handle" />

          <Pane class="main-pane">
            <Canvas
              onnewrack={handleNewRack}
              onload={handleLoad}
              onfitall={handleFitAll}
              onresetzoom={() => canvasStore.resetZoom()}
              ontoggletheme={handleToggleTheme}
              {partyMode}
              enableLongPress={false}
              onracklongpress={handleRackLongPress}
              onrackfocus={handleRackContextFocus}
              onrackexport={handleRackContextExport}
              onrackedit={handleRackContextEdit}
              onrackrename={handleRackContextRename}
              onrackduplicate={handleRackContextDuplicate}
              onrackdelete={handleRackContextDelete}
            />

            <EditPanel />
          </Pane>
        </PaneGroup>
      {:else}
        <Canvas
          onnewrack={handleNewRack}
          onload={handleLoad}
          onfitall={handleFitAll}
          onresetzoom={() => canvasStore.resetZoom()}
          ontoggletheme={handleToggleTheme}
          {partyMode}
          enableLongPress={viewportStore.isMobile && !placementStore.isPlacing}
          onracklongpress={handleRackLongPress}
          onrackfocus={handleRackContextFocus}
          onrackexport={handleRackContextExport}
          onrackedit={handleRackContextEdit}
          onrackrename={handleRackContextRename}
          onrackduplicate={handleRackContextDuplicate}
          onrackdelete={handleRackContextDelete}
        />
      {/if}
    </main>

    <DialogOrchestrator bind:this={dialogOrchestrator} />

    <KeyboardHandler
      onsave={maybeSave}
      onsaveas={maybeSaveAs}
      onload={handleLoad}
      onexport={maybeExport}
      onshare={handleShare}
      ondelete={handleDelete}
      onfitall={handleFitAll}
      onhelp={handleHelp}
      ontoggledisplaymode={handleToggleDisplayMode}
      ontoggleannotations={handleToggleAnnotations}
    />

    <PersistenceEffects />

    <!-- Global SVG gradient definitions for animations -->
    <AnimationDefs />

    <ToastContainer />

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

  /* PaneForge styles */
  :global(.pane-group) {
    flex: 1;
    overflow: hidden;
  }

  :global(.sidebar-pane) {
    background: var(--colour-sidebar-bg);
    border-right: 1px solid var(--colour-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: var(--sidebar-width-min);
  }

  :global(.resize-handle) {
    width: 4px;
    background: var(--colour-border);
    cursor: col-resize;
    transition: background var(--duration-fast) var(--ease-out);
    position: relative;
  }

  :global(.resize-handle:hover),
  :global(.resize-handle[data-resize-handle-active]) {
    background: var(--colour-selection);
  }

  :global(.main-pane) {
    /* Note: paneforge applies inline flex: X 1 0px - don't override with flex: 1 */
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
    height: 100%; /* Required for percentage-based children to fill space */
    background-color: var(--canvas-bg);
  }

  /* Note: Mobile overscroll prevention should be in global styles (index.html or app.css) */
  /* body { overscroll-behavior-y: contain; } for <1024px viewports */
</style>
