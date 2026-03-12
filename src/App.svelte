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
    clearSession,
    isServerNewer,
  } from "$lib/utils/session-storage";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { getPlacementStore } from "$lib/stores/placement.svelte";
  import { createKonamiDetector } from "$lib/utils/konami";
  import { analytics } from "$lib/utils/analytics";
  import { persistenceDebug } from "$lib/utils/debug";
  import { dialogStore } from "$lib/stores/dialogs.svelte";
  import { generateShareUrl } from "$lib/utils/share";
  import { generateQRCode, canFitInQR } from "$lib/utils/qrcode";
  import { DRAWER_WIDTH } from "$lib/constants/layout";
  import { Tooltip } from "bits-ui";
  import {
    setApiAvailable,
    initializePersistence,
    hasEverConnectedToApi,
  } from "$lib/stores/persistence.svelte";
  import {
    listSavedLayouts,
    loadSavedLayout,
  } from "$lib/utils/persistence-api";
  import {
    getSaveStatus,
    setSaveStatus,
    maybeSave,
    maybeSaveAs,
    maybeExport,
    handleLoad,
    handleShare,
    handleFitAll,
  } from "$lib/utils/persistence-manager.svelte";

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

  // Persistence state — delegated to persistence-manager module
  let saveStatus = $derived(getSaveStatus());

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

  // Auto-open new rack dialog when no racks exist (first-load experience)
  // Also handles loading shared layouts from URL params
  // Uses onMount to run once on initial load, not reactively
  onMount(async () => {
    // Start API health check immediately so all startup paths (including share links)
    // initialize persistence and can enable server autosave when available.
    const persistenceInitPromise = initializePersistence().catch((error) => {
      console.error(
        "Persistence initialization failed; continuing without server persistence:",
        error,
      );
      setApiAvailable(false);
      if (hasEverConnectedToApi()) {
        setSaveStatus("offline");
      } else {
        setSaveStatus("disabled");
      }
      return false;
    });

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

    // Get localStorage session data (with timestamp if available)
    const localSession = loadSessionWithTimestamp();

    // Priority 2: With no local session, show Start Screen immediately.
    // It handles loading/offline state while API health check resolves.
    // Reset layout to clear any stale hasStarted flag from a previous session (#1326)
    if (!localSession) {
      layoutStore.resetLayout();
      showStartScreen = true;
      return;
    }

    const apiAvailable = await persistenceInitPromise;
    if (!apiAvailable) {
      setSaveStatus(hasEverConnectedToApi() ? "offline" : "disabled");
    }

    // Priority 3: When API and local session are both available,
    // compare server and local timestamps to avoid stale overwrite (#1012).
    if (apiAvailable) {
      try {
        const savedLayouts = await listSavedLayouts();
        if (savedLayouts.length > 0) {
          // Sort by updatedAt descending and get the most recent
          const mostRecent = savedLayouts.toSorted(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          )[0]!;

          // Compare timestamps: load server data if it's newer than localStorage
          // or if localStorage has no timestamp (legacy data)
          if (isServerNewer(localSession.savedAt, mostRecent.updatedAt)) {
            const serverLayout = await loadSavedLayout(mostRecent.id);
            layoutStore.loadLayout(serverLayout);
            layoutStore.markClean();

            // Clear stale localStorage to prevent future conflicts
            if (localSession) {
              clearSession();
            }

            toastStore.showToast(
              `Loaded "${mostRecent.name}" from server`,
              "success",
            );

            // Reset view to center the loaded rack after DOM updates
            requestAnimationFrame(() => {
              canvasStore.fitAll(layoutStore.racks, layoutStore.rack_groups);
            });
            return;
          }

          // LocalStorage is newer than server - load it and warn user
          // Their local changes will auto-save to server on next edit
          layoutStore.loadLayout(localSession.layout);
          layoutStore.markDirty();
          toastStore.showToast(
            "Loaded unsaved local changes (newer than server)",
            "info",
          );

          requestAnimationFrame(() => {
            canvasStore.fitAll(layoutStore.racks, layoutStore.rack_groups);
          });
          return;
        }
      } catch (error) {
        // If server check fails, fall through to localStorage
        persistenceDebug.api(
          "failed to load saved layouts from server: %O",
          error,
        );
        // Treat server data failures as offline and fall back gracefully.
        setApiAvailable(false);
        if (hasEverConnectedToApi()) {
          setSaveStatus("offline");
        } else {
          setSaveStatus("disabled");
        }
      }
    }

    // Priority 4: No API or no server layouts - check localStorage autosave
    if (localSession) {
      layoutStore.loadLayout(localSession.layout);
      // Mark as dirty since this is an autosaved session (not explicitly saved)
      layoutStore.markDirty();
      // Don't show new rack dialog - user has work in progress
      // Reset view to center the loaded rack after DOM updates
      requestAnimationFrame(() => {
        canvasStore.fitAll(layoutStore.racks, layoutStore.rack_groups);
      });
      return;
    }
  });

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

  function handleNewRack() {
    if (!layoutStore.canAddRack) {
      toastStore.showToast("Maximum number of racks reached", "warning");
      return;
    }
    dialogStore.open("newRack");
  }

  function handleDelete() {
    if (selectionStore.isRackSelected && selectionStore.selectedRackId) {
      const rack = layoutStore.getRackById(selectionStore.selectedRackId);
      if (rack) {
        dialogStore.deleteTarget = { type: "rack", name: rack.name };
        dialogStore.open("confirmDelete");
      }
    } else if (selectionStore.isDeviceSelected) {
      if (
        selectionStore.selectedRackId !== null &&
        selectionStore.selectedDeviceId !== null
      ) {
        const rack = layoutStore.getRackById(selectionStore.selectedRackId);
        const deviceIndex = selectionStore.getSelectedDeviceIndex(
          rack?.devices ?? [],
        );
        if (rack && deviceIndex !== null && rack.devices[deviceIndex]) {
          const device = rack.devices[deviceIndex];
          const deviceDef = layoutStore.device_types.find(
            (d) => d.slug === device?.device_type,
          );
          dialogStore.deleteTarget = {
            type: "device",
            name: deviceDef?.model ?? deviceDef?.slug ?? "Device",
          };
          dialogStore.open("confirmDelete");
        }
      }
    }
  }

  function handleToggleTheme() {
    uiStore.toggleTheme();
  }

  function handleToggleDisplayMode() {
    uiStore.toggleDisplayMode();
    layoutStore.updateDisplayMode(uiStore.displayMode);
    layoutStore.updateShowLabelsOnImages(uiStore.showLabelsOnImages);
    analytics.trackDisplayModeToggle(uiStore.displayMode);
  }

  function handleToggleAnnotations() {
    uiStore.toggleAnnotations();
  }

  function handleHelp() {
    dialogStore.open("help");
  }

  function handleAddDevice() {
    dialogStore.closeSheet();
    dialogStore.open("addDevice");
  }

  function handleImportFromNetBox() {
    dialogStore.open("importNetBox");
  }

  function handleImportDevices() {
    // Delegates to DialogOrchestrator's hidden file input via dialogStore
    // The DialogOrchestrator handles the actual file input click
    dialogOrchestrator.handleImportDevices();
  }

  function handleOpenYamlEditor() {
    if (viewportStore.isMobile) {
      dialogStore.openSheet("yamlEditor");
      return;
    }
    dialogStore.open("yamlEditor");
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

  function handleRackContextDuplicate(rackId: string) {
    const result = layoutStore.duplicateRack(rackId);
    if (result.error) {
      toastStore.showToast(result.error, "error");
    } else {
      toastStore.showToast("Rack duplicated", "success");
      handleFitAll();
    }
  }

  function handleRackContextDelete(rackId: string) {
    const rack = layoutStore.getRackById(rackId);
    if (rack) {
      layoutStore.setActiveRack(rackId);
      selectionStore.selectRack(rackId);
      dialogStore.deleteTarget = { type: "rack", name: rack.name };
      dialogStore.open("confirmDelete");
    }
  }

  async function handleRackContextExport(rackIds: string[]) {
    if (rackIds.length === 0) {
      toastStore.showToast("No racks to export", "warning");
      return;
    }

    try {
      const shareUrl = generateShareUrl(layoutStore.layout);
      if (canFitInQR(shareUrl)) {
        dialogStore.exportQrCodeDataUrl = await generateQRCode(shareUrl, {
          width: 444,
        });
      } else {
        dialogStore.exportQrCodeDataUrl = undefined;
      }
    } catch {
      dialogStore.exportQrCodeDataUrl = undefined;
    }

    dialogStore.exportSelectedRackIds = rackIds;
    dialogStore.open("export");
  }

  function handleRackContextFocus(rackIds: string[]) {
    if (rackIds.length === 0) return;
    const rightOffset = uiStore.rightDrawerOpen ? DRAWER_WIDTH : 0;
    canvasStore.focusRack(
      rackIds,
      layoutStore.racks,
      layoutStore.rack_groups,
      rightOffset,
    );
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
      {saveStatus}
      onsave={maybeSave}
      onsaveas={maybeSaveAs}
      onload={handleLoad}
      onexport={maybeExport}
      onshare={handleShare}
      onviewyaml={handleOpenYamlEditor}
      onimportdevices={handleImportDevices}
      onimportnetbox={handleImportFromNetBox}
      onnewcustomdevice={handleAddDevice}
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
    />

    <RackIndicator />

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
          >
            <SidebarTabs
              activeTab={uiStore.sidebarTab}
              onchange={(tab) => uiStore.setSidebarTab(tab)}
            />
            {#if uiStore.sidebarTab === "devices"}
              <DevicePalette oncreatedevice={handleAddDevice} />
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
