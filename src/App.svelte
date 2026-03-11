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
  import { NewRackWizard, type CreateRackData } from "$lib/components/wizard";
  import AddDeviceForm from "$lib/components/AddDeviceForm.svelte";
  import ImportFromNetBoxDialog from "$lib/components/ImportFromNetBoxDialog.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import ConfirmReplaceDialog from "$lib/components/ConfirmReplaceDialog.svelte";
  import CleanupDialog from "$lib/components/CleanupDialog.svelte";
  import CleanupPromptDialog from "$lib/components/CleanupPromptDialog.svelte";
  import ToastContainer from "$lib/components/ToastContainer.svelte";
  import PortTooltip from "$lib/components/PortTooltip.svelte";
  import DragTooltip from "$lib/components/DragTooltip.svelte";
  import KeyboardHandler from "$lib/components/KeyboardHandler.svelte";
  import ExportDialog from "$lib/components/ExportDialog.svelte";
  import ShareDialog from "$lib/components/ShareDialog.svelte";
  import LayoutYamlPanel from "$lib/components/LayoutYamlPanel.svelte";
  import Dialog from "$lib/components/Dialog.svelte";
  import HelpPanel from "$lib/components/HelpPanel.svelte";
  import BottomSheet from "$lib/components/BottomSheet.svelte";
  import DeviceDetails from "$lib/components/DeviceDetails.svelte";
  import MobileFileSheet from "$lib/components/MobileFileSheet.svelte";
  import MobileBottomNav from "$lib/components/mobile/MobileBottomNav.svelte";
  import MobileHistoryControls from "$lib/components/mobile/MobileHistoryControls.svelte";
  import RackIndicator from "$lib/components/mobile/RackIndicator.svelte";
  import RackEditSheet from "$lib/components/RackEditSheet.svelte";
  import MobileViewSheet from "$lib/components/mobile/MobileViewSheet.svelte";
  import SidebarTabs from "$lib/components/SidebarTabs.svelte";
  import RackList from "$lib/components/RackList.svelte";
  import LoadDialog from "$lib/components/LoadDialog.svelte";
  import PersistenceEffects from "$lib/components/PersistenceEffects.svelte";
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
  import { getImageStore } from "$lib/stores/images.svelte";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { getPlacementStore } from "$lib/stores/placement.svelte";
  import { createKonamiDetector } from "$lib/utils/konami";
  import type { ImageData } from "$lib/types/images";
  import type { DisplayMode, Layout, RackWidth } from "$lib/types";
  import type { ImportResult } from "$lib/utils/netbox-import";
  import { parseDeviceLibraryImport } from "$lib/utils/import";
  import { analytics } from "$lib/utils/analytics";
  import { hapticTap } from "$lib/utils/haptics";
  import { debug, persistenceDebug } from "$lib/utils/debug";
  import { dialogStore } from "$lib/stores/dialogs.svelte";
  import { Tooltip } from "bits-ui";
  import {
    isApiAvailable,
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
    handleExport,
    handleExportSubmit,
    handleShare,
    handleSaveToServer,
    handleSaveAsArchive,
    handleFitAll,
    resetAndOpenNewRack,
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
  const imageStore = getImageStore();
  const viewportStore = getViewportStore();
  const placementStore = getPlacementStore();

  // Persistence state — delegated to persistence-manager module
  let saveStatus = $derived(getSaveStatus());

  // Dialog state - now managed by dialogStore
  // Legacy local aliases for gradual migration
  let newRackFormOpen = $derived(dialogStore.isOpen("newRack"));
  let addDeviceFormOpen = $derived(dialogStore.isOpen("addDevice"));
  let confirmDeleteOpen = $derived(dialogStore.isOpen("confirmDelete"));
  let exportDialogOpen = $derived(dialogStore.isOpen("export"));
  let shareDialogOpen = $derived(dialogStore.isOpen("share"));
  let yamlEditorDialogOpen = $derived(dialogStore.isOpen("yamlEditor"));
  let helpPanelOpen = $derived(dialogStore.isOpen("help"));
  let importFromNetBoxOpen = $derived(dialogStore.isOpen("importNetBox"));
  let showReplaceDialog = $derived(dialogStore.isOpen("confirmReplace"));
  let cleanupDialogOpen = $derived(dialogStore.isOpen("cleanupDialog"));
  let cleanupPromptOpen = $derived(dialogStore.isOpen("cleanupPrompt"));
  let cleanupPromptOperation = $derived(dialogStore.pendingCleanupOperation);
  let cleanupReviewPendingOperation = $state<
    "save" | "saveAs" | "export" | null
  >(null);

  // Mobile bottom sheet state - managed by dialogStore
  let bottomSheetOpen = $derived(dialogStore.isSheetOpen("deviceDetails"));
  let fileSheetOpen = $derived(dialogStore.isSheetOpen("fileActions"));
  let deviceLibrarySheetOpen = $derived(
    dialogStore.isSheetOpen("deviceLibrary"),
  );
  let yamlEditorSheetOpen = $derived(dialogStore.isSheetOpen("yamlEditor"));
  let rackEditSheetOpen = $derived(dialogStore.isSheetOpen("rackEdit"));
  let viewSheetOpen = $derived(dialogStore.isSheetOpen("view"));

  // Aliases to dialogStore properties for template access
  let deleteTarget = $derived(dialogStore.deleteTarget);
  let selectedDeviceForSheet = $derived(dialogStore.selectedDeviceIndex);
  let exportQrCodeDataUrl = $derived(dialogStore.exportQrCodeDataUrl);

  // Sidebar width: read once from the UI store.
  // This is intentionally NOT reactive because changes to sidebarWidth are driven
  // by layout / resize logic elsewhere that also writes back to uiStore. If this
  // value were reactive, it could participate in a feedback loop (store → layout
  // recompute → store) and cause jittery or repeated layout updates. We only need
  // an initial width to seed the layout; subsequent updates use the store directly.
  const initialSidebarWidthPx =
    uiStore.sidebarWidth ?? untrack(() => sidePanelSizeDefault);

  // Device library import file input ref
  let deviceImportInputRef = $state<HTMLInputElement | null>(null);

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

  // Toolbar event handlers
  function handleNewRack() {
    // Multi-rack mode: always open new rack form (no replace dialog)
    if (!layoutStore.canAddRack) {
      toastStore.showToast("Maximum number of racks reached", "warning");
      return;
    }
    dialogStore.open("newRack");
  }

  function handleNewRackCreate(data: CreateRackData) {
    if (data.layoutType === "bayed" && data.bayCount) {
      // Create bayed rack group
      const result = layoutStore.addBayedRackGroup(
        data.name,
        data.bayCount,
        data.height,
        data.width,
      );
      if (!result) {
        toastStore.showToast(
          "Could not create Bayed Rack: insufficient capacity",
          "error",
        );
        return;
      }
    } else {
      // Create single column rack
      layoutStore.addRack(data.name, data.height, data.width);
    }
    dialogStore.close();
    // Auto-fit after creating new rack so it's visible
    requestAnimationFrame(() => handleFitAll());
  }

  function handleNewRackCancel() {
    dialogStore.close();
  }

  // Replace dialog handlers (single-rack mode)
  async function handleSaveFirst() {
    dialogStore.close();
    dialogStore.pendingSaveFirst = true;
    if (isApiAvailable()) {
      await handleSaveToServer();
    } else {
      await handleSaveAsArchive();
    }
  }

  function handleReplace() {
    dialogStore.close();
    // Clear autosaved session when explicitly creating new rack
    clearSession();
    resetAndOpenNewRack();
  }

  function handleCancelReplace() {
    dialogStore.close();
  }

  /**
   * Get count of unused custom device types
   */
  function getUnusedCustomTypeCount(): number {
    return layoutStore.getUnusedCustomDeviceTypes().length;
  }

  /**
   * Handle "Review & Clean Up" button in cleanup prompt
   * Opens bulk cleanup workflow before continuing with pending operation.
   */
  function handleCleanupReview() {
    const pendingOp = dialogStore.pendingCleanupOperation;
    cleanupReviewPendingOperation = pendingOp;
    dialogStore.close();
    dialogStore.open("cleanupDialog");
  }

  /**
   * Handle "Keep All" button in cleanup prompt
   * Proceeds with the pending operation without cleanup
   */
  function handleCleanupKeepAll() {
    const pendingOp = dialogStore.pendingCleanupOperation;
    cleanupReviewPendingOperation = null;
    dialogStore.close();
    if (pendingOp === "save") {
      if (isApiAvailable()) {
        handleSaveToServer();
      } else {
        handleSaveAsArchive();
      }
    } else if (pendingOp === "saveAs") {
      handleSaveAsArchive();
    } else if (pendingOp === "export") {
      handleExport();
    }
  }

  /**
   * Handle "Cancel" button in cleanup prompt
   * Aborts the pending operation
   */
  function handleCleanupCancel() {
    cleanupReviewPendingOperation = null;
    dialogStore.close();
  }

  /**
   * Handle "Don't ask again" checkbox
   * Disables the cleanup prompt setting
   */
  function handleCleanupDontAskAgain() {
    uiStore.setPromptCleanupOnSave(false);
  }

  function handleExportCancel() {
    dialogStore.close();
    handleFitAll();
  }

  function handleShareClose() {
    dialogStore.close();
    handleFitAll();
  }

  function handleOpenYamlEditor() {
    if (viewportStore.isMobile) {
      dialogStore.openSheet("yamlEditor");
      return;
    }

    dialogStore.open("yamlEditor");
  }

  function handleYamlEditorClose() {
    dialogStore.close();
    handleFitAll();
  }

  function handleYamlEditorSheetClose() {
    dialogStore.closeSheet();
    handleFitAll();
  }

  function handleYamlApply(nextLayout: Layout) {
    layoutStore.loadLayout(nextLayout);
    layoutStore.markDirty();
    selectionStore.clearSelection();
    toastStore.showToast("YAML applied", "success");

    if (viewportStore.isMobile) {
      dialogStore.closeSheet();
    } else {
      dialogStore.close();
    }

    requestAnimationFrame(() => {
      handleFitAll();
    });
  }

  function handleDelete() {
    if (selectionStore.isRackSelected && selectionStore.selectedRackId) {
      // Get the selected rack by ID
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
        // Get the rack containing the selected device
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

  function handleConfirmDelete() {
    if (deleteTarget?.type === "rack" && selectionStore.selectedRackId) {
      layoutStore.deleteRack(selectionStore.selectedRackId);
      selectionStore.clearSelection();
    } else if (deleteTarget?.type === "device") {
      const rackId = selectionStore.selectedRackId;
      const rack = rackId ? layoutStore.getRackById(rackId) : null;
      const deviceIndex = selectionStore.getSelectedDeviceIndex(
        rack?.devices ?? [],
      );
      if (rackId !== null && deviceIndex !== null) {
        layoutStore.removeDeviceFromRack(rackId, deviceIndex);
        selectionStore.clearSelection();
      }
    }
    dialogStore.close();
  }

  function handleCancelDelete() {
    dialogStore.close();
    handleFitAll();
  }

  function handleToggleTheme() {
    uiStore.toggleTheme();
  }

  function handleToggleDisplayMode() {
    uiStore.toggleDisplayMode();
    // Sync with layout settings
    layoutStore.updateDisplayMode(uiStore.displayMode);
    // Also sync showLabelsOnImages for backward compatibility
    layoutStore.updateShowLabelsOnImages(uiStore.showLabelsOnImages);
    // Track display mode change
    analytics.trackDisplayModeToggle(uiStore.displayMode);
  }

  function handleSetDisplayMode(mode: DisplayMode) {
    if (uiStore.displayMode === mode) return;
    uiStore.setDisplayMode(mode);
    // Sync with layout settings
    layoutStore.updateDisplayMode(uiStore.displayMode);
    // Also sync showLabelsOnImages for backward compatibility
    layoutStore.updateShowLabelsOnImages(uiStore.showLabelsOnImages);
    // Track display mode change
    analytics.trackDisplayModeToggle(uiStore.displayMode);
  }

  function handleToggleAnnotations() {
    uiStore.toggleAnnotations();
  }

  function handleSetAnnotations(enabled: boolean) {
    uiStore.setAnnotations(enabled);
  }

  function handleSetTheme(theme: "dark" | "light") {
    if (uiStore.theme === theme) return;
    uiStore.setTheme(theme);
  }

  function handleHelp() {
    dialogStore.open("help");
  }

  function handleHelpClose() {
    dialogStore.close();
    handleFitAll();
  }

  function handleOpenCleanupDialog() {
    cleanupReviewPendingOperation = null;
    dialogStore.open("cleanupDialog");
  }

  function handleCleanupDialogClose(action: "delete" | "cancel" = "cancel") {
    const pendingOp = cleanupReviewPendingOperation;
    cleanupReviewPendingOperation = null;
    dialogStore.close();

    // Settings-triggered cleanup has no pending operation to continue.
    if (!pendingOp) {
      return;
    }

    // User cancelled review flow from cleanup dialog.
    if (action !== "delete") {
      return;
    }

    if (pendingOp === "save") {
      if (isApiAvailable()) {
        handleSaveToServer();
      } else {
        handleSaveAsArchive();
      }
    } else if (pendingOp === "saveAs") {
      handleSaveAsArchive();
    } else if (pendingOp === "export") {
      handleExport();
    }
  }

  function handleAddDevice() {
    // Close bottom sheet first to avoid z-index conflict on mobile
    dialogStore.closeSheet();
    dialogStore.open("addDevice");
  }

  function handleAddDeviceCreate(data: {
    name: string;
    height: number;
    category: import("$lib/types").DeviceCategory;
    colour: string;
    notes: string;
    isFullDepth: boolean;
    isHalfWidth: boolean;
    rackWidths: RackWidth[];
    frontImage?: ImageData;
    rearImage?: ImageData;
  }) {
    const device = layoutStore.addDeviceType({
      name: data.name,
      u_height: data.height,
      category: data.category,
      colour: data.colour,
      notes: data.notes || undefined,
      is_full_depth: data.isFullDepth ? undefined : false,
      slot_width: data.isHalfWidth ? 1 : undefined,
      rack_widths: data.rackWidths,
    });

    // Store images if provided (v0.1.0)
    if (data.frontImage) {
      imageStore.setDeviceImage(device.slug, "front", data.frontImage);
    }
    if (data.rearImage) {
      imageStore.setDeviceImage(device.slug, "rear", data.rearImage);
    }

    // Track custom device creation
    analytics.trackCustomDeviceCreate(data.category);

    toastStore.showToast(`"${data.name}" added to device library`, "success");
    dialogStore.close();
  }

  function handleAddDeviceCancel() {
    dialogStore.close();
  }

  // NetBox import handlers
  function handleImportFromNetBox() {
    dialogStore.open("importNetBox");
  }

  function handleNetBoxImport(result: ImportResult) {
    // Add the imported device type to the library
    layoutStore.addDeviceTypeRaw(result.deviceType);
    layoutStore.markDirty();

    // Track the import
    analytics.trackCustomDeviceCreate(result.deviceType.category);

    toastStore.showToast(
      `Imported "${result.deviceType.model}" to device library`,
      "success",
    );
    dialogStore.close();
  }

  function handleNetBoxImportCancel() {
    dialogStore.close();
  }

  // Device library JSON import handlers
  function handleImportDevices() {
    deviceImportInputRef?.click();
  }

  async function handleDeviceImportFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    try {
      const text = await file.text();

      // Get existing device slugs for duplicate detection
      const existingSlugs = layoutStore.device_types.map((d) => d.slug);

      // Parse and validate the import (returns DeviceType[])
      const result = parseDeviceLibraryImport(text, existingSlugs);

      if (result.error) {
        toastStore.showToast(`Import failed: ${result.error}`, "error");
        return;
      }

      // Add imported devices to library
      for (const deviceType of result.devices) {
        layoutStore.addDeviceTypeRaw(deviceType);
      }

      // Track successful import
      analytics.trackPaletteImport();

      // Show success toast
      const message =
        result.skipped > 0
          ? `Imported ${result.devices.length} devices (${result.skipped} skipped)`
          : `Imported ${result.devices.length} ${result.devices.length === 1 ? "device" : "devices"}`;

      toastStore.showToast(message, "success");
    } catch (error) {
      console.error("Failed to import device library:", error);
      toastStore.showToast("Failed to import device library", "error");
    } finally {
      // Reset file input
      input.value = "";
    }
  }

  // Watch for device selection changes to trigger mobile bottom sheet
  $effect(() => {
    const activeRack = layoutStore.activeRack;
    if (viewportStore.isMobile && selectionStore.isDeviceSelected) {
      const deviceIndex = selectionStore.getSelectedDeviceIndex(
        activeRack?.devices ?? [],
      );
      debug.log("[Mobile] Device selected:", {
        deviceIndex,
        hasRack: !!activeRack,
      });
      if (deviceIndex !== null && activeRack) {
        dialogStore.openSheet("deviceDetails", deviceIndex);
        debug.log("[Mobile] Opening bottom sheet for device", deviceIndex);
        // Note: Not zooming because bottom sheet covers most of viewport
      }
    } else if (!selectionStore.isDeviceSelected) {
      // When device deselected, close sheet and fit all
      if (viewportStore.isMobile && bottomSheetOpen) {
        debug.log(
          "[Mobile] Device deselected, closing bottom sheet and fitting all",
        );
        dialogStore.closeSheet();
        canvasStore.fitAll(layoutStore.racks, layoutStore.rack_groups);
      }
    }
  });

  // Handle bottom sheet close
  function handleBottomSheetClose() {
    dialogStore.closeSheet();
    selectionStore.clearSelection();
    handleFitAll();
  }

  // Handle mobile device actions (remove, move)
  function handleMobileRemoveDevice() {
    const activeRack = layoutStore.activeRack;
    if (selectedDeviceForSheet !== null && activeRack) {
      layoutStore.removeDeviceFromRack(activeRack.id, selectedDeviceForSheet);
      handleBottomSheetClose();
    }
  }

  function handleMobileMoveDeviceUp() {
    const activeRack = layoutStore.activeRack;
    if (selectedDeviceForSheet !== null && activeRack) {
      const device = activeRack.devices[selectedDeviceForSheet];
      const deviceType = layoutStore.device_types.find(
        (dt) => dt.slug === device?.device_type,
      );
      if (device && deviceType) {
        // Move up = increase position (higher U number)
        const newPosition = device.position + 1;
        layoutStore.moveDevice(
          activeRack.id,
          selectedDeviceForSheet,
          newPosition,
        );
      }
    }
  }

  function handleMobileMoveDeviceDown() {
    const activeRack = layoutStore.activeRack;
    if (selectedDeviceForSheet !== null && activeRack) {
      const device = activeRack.devices[selectedDeviceForSheet];
      if (device && device.position > 1) {
        // Move down = decrease position (lower U number)
        const newPosition = device.position - 1;
        layoutStore.moveDevice(
          activeRack.id,
          selectedDeviceForSheet,
          newPosition,
        );
      }
    }
  }

  // Handle view tab click (mobile)
  function handleViewSheetClick() {
    dialogStore.openSheet("view");
  }

  // Handle view sheet close (manual dismiss — re-fits canvas)
  function handleViewSheetClose() {
    dialogStore.closeSheet();
    handleFitAll();
  }

  // Handle view sheet close after an action (no re-fit)
  function handleViewSheetActionClose() {
    dialogStore.closeSheet();
  }

  // Handle device library tab click (mobile bottom nav)
  function handleDeviceLibraryTabClick() {
    dialogStore.openSheet("deviceLibrary");
  }

  // Handle file tab click (mobile)
  function handleFileTabClick() {
    dialogStore.openSheet("fileActions");
  }

  // Handle file sheet close
  function handleFileSheetClose() {
    dialogStore.closeSheet();
  }

  // Handle device library sheet close
  function handleDeviceLibrarySheetClose() {
    dialogStore.closeSheet();
    handleFitAll();
  }

  // Handle rack long press (mobile rack editing)
  function handleRackLongPress(_event: CustomEvent<{ rackId: string }>) {
    // Ignore if in placement mode (handled by enableLongPress prop, but double-check)
    if (placementStore.isPlacing) return;

    // Close any other open sheets first
    dialogStore.closeSheet();
    // Open rack edit sheet
    dialogStore.openSheet("rackEdit");
  }

  // Handle rack edit sheet close
  function handleRackEditSheetClose() {
    dialogStore.closeSheet();
    handleFitAll();
  }

  // Rack context menu handlers
  function handleRackContextEdit(rackId: string) {
    layoutStore.setActiveRack(rackId);
    selectionStore.selectRack(rackId);
    if (viewportStore.isMobile) {
      dialogStore.openSheet("rackEdit");
    }
    // On desktop, the EditPanel automatically shows for selected rack
  }

  function handleRackContextRename(rackId: string) {
    // Same as edit for now - opens the edit panel where name can be changed
    handleRackContextEdit(rackId);
  }

  function handleRackContextDuplicate(rackId: string) {
    const result = layoutStore.duplicateRack(rackId);
    if (result.error) {
      toastStore.showToast(result.error, "error");
    } else {
      toastStore.showToast("Rack duplicated", "success");
      // Fit all to show the new rack
      handleFitAll();
    }
  }

  function handleRackContextDelete(rackId: string) {
    const rack = layoutStore.getRackById(rackId);
    if (rack) {
      // Set up and show delete confirmation
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

    // Generate QR code for the share URL (for optional embedding in export)
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

    // Set pre-selected rack IDs for export dialog
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

  // Handle mobile device selection from palette (enters placement mode)
  function handleMobileDeviceSelect(
    event: CustomEvent<{ device: import("$lib/types").DeviceType }>,
  ) {
    const { device } = event.detail;
    hapticTap(); // Fire haptic immediately for snappier feedback
    placementStore.startPlacement(device);
    // Close all sheets when entering placement mode
    dialogStore.closeSheet();
  }
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

    <!-- Mobile bottom sheet for device details -->
    {#if viewportStore.isMobile && bottomSheetOpen && selectedDeviceForSheet !== null && layoutStore.activeRack}
      {@const activeRack = layoutStore.activeRack}
      {@const device = activeRack.devices[selectedDeviceForSheet]}
      {@const deviceType = device
        ? layoutStore.device_types.find((dt) => dt.slug === device.device_type)
        : null}
      {#if device && deviceType}
        {@const rackHeight = activeRack.height}
        {@const maxPosition = rackHeight - deviceType.u_height + 1}
        {@const canMoveUp = device.position < maxPosition}
        {@const canMoveDown = device.position > 1}
        <BottomSheet
          open={bottomSheetOpen}
          title={deviceType.model}
          onclose={handleBottomSheetClose}
        >
          <DeviceDetails
            {device}
            {deviceType}
            rackView={activeRack.view}
            {rackHeight}
            showActions={true}
            onremove={handleMobileRemoveDevice}
            onmoveup={handleMobileMoveDeviceUp}
            onmovedown={handleMobileMoveDeviceDown}
            {canMoveUp}
            {canMoveDown}
          />
        </BottomSheet>
      {/if}
    {/if}

    <NewRackWizard
      open={newRackFormOpen}
      rackCount={layoutStore.rackCount}
      oncreate={handleNewRackCreate}
      oncancel={handleNewRackCancel}
    />

    <AddDeviceForm
      open={addDeviceFormOpen}
      activeRackWidth={layoutStore.activeRack?.width}
      onadd={handleAddDeviceCreate}
      oncancel={handleAddDeviceCancel}
    />

    <ImportFromNetBoxDialog
      open={importFromNetBoxOpen}
      onimport={handleNetBoxImport}
      oncancel={handleNetBoxImportCancel}
    />

    <ConfirmDialog
      open={confirmDeleteOpen}
      title={deleteTarget?.type === "rack" ? "Delete Rack" : "Remove Device"}
      message={deleteTarget?.type === "rack"
        ? `Are you sure you want to delete "${deleteTarget?.name}"? All devices in this rack will be removed.`
        : `Are you sure you want to remove "${deleteTarget?.name}" from this rack?`}
      confirmLabel={deleteTarget?.type === "rack" ? "Delete Rack" : "Remove"}
      onconfirm={handleConfirmDelete}
      oncancel={handleCancelDelete}
    />

    <ConfirmReplaceDialog
      open={showReplaceDialog}
      onSaveFirst={handleSaveFirst}
      onReplace={handleReplace}
      onCancel={handleCancelReplace}
    />

    <CleanupPromptDialog
      open={cleanupPromptOpen}
      operation={cleanupPromptOperation}
      unusedCount={getUnusedCustomTypeCount()}
      onreview={handleCleanupReview}
      onkeepall={handleCleanupKeepAll}
      oncancel={handleCleanupCancel}
      ondontaskagain={handleCleanupDontAskAgain}
    />

    <ExportDialog
      open={exportDialogOpen}
      racks={layoutStore.racks}
      rackGroups={layoutStore.rack_groups}
      deviceTypes={layoutStore.device_types}
      images={imageStore.getAllImages()}
      displayMode={uiStore.displayMode}
      layoutName={layoutStore.layout.name}
      selectedRackId={selectionStore.isRackSelected
        ? selectionStore.selectedRackId
        : null}
      selectedRackIds={dialogStore.exportSelectedRackIds}
      qrCodeDataUrl={exportQrCodeDataUrl}
      onexport={(e) => handleExportSubmit(e.detail)}
      oncancel={handleExportCancel}
    />

    <ShareDialog
      open={shareDialogOpen}
      layout={layoutStore.layout}
      onclose={handleShareClose}
    />

    <Dialog
      open={yamlEditorDialogOpen}
      title="Layout YAML"
      width="min(980px, 95vw)"
      onclose={handleYamlEditorClose}
    >
      <LayoutYamlPanel
        open={yamlEditorDialogOpen}
        layout={layoutStore.layout}
        onapply={handleYamlApply}
      />
    </Dialog>

    <HelpPanel open={helpPanelOpen} onclose={handleHelpClose} />

    <CleanupDialog
      open={cleanupDialogOpen}
      onclose={handleCleanupDialogClose}
    />

    <LoadDialog />

    <ToastContainer />

    <!-- Port tooltip for network interface hover -->
    <PortTooltip />

    <!-- Drag tooltip for device name/U-height during drag -->
    <DragTooltip />

    <!-- Mobile bottom navigation bar -->
    <MobileBottomNav
      activeTab={fileSheetOpen
        ? "file"
        : viewSheetOpen
          ? "view"
          : deviceLibrarySheetOpen
            ? "devices"
            : null}
      hidden={false}
      onfileclick={handleFileTabClick}
      onviewclick={handleViewSheetClick}
      ondevicesclick={handleDeviceLibraryTabClick}
    />

    {#if viewportStore.isMobile && fileSheetOpen}
      <BottomSheet
        open={fileSheetOpen}
        title="File"
        onclose={handleFileSheetClose}
      >
        <MobileFileSheet
          onload={handleLoad}
          onsave={maybeSave}
          onsaveas={maybeSaveAs}
          onexport={handleExport}
          onshare={handleShare}
          onviewyaml={handleOpenYamlEditor}
          onclose={handleFileSheetClose}
          hasRacks={layoutStore.hasRack}
        />
      </BottomSheet>
    {/if}

    {#if viewportStore.isMobile && yamlEditorSheetOpen}
      <BottomSheet
        open={yamlEditorSheetOpen}
        title="Layout YAML"
        onclose={handleYamlEditorSheetClose}
      >
        <LayoutYamlPanel
          open={yamlEditorSheetOpen}
          layout={layoutStore.layout}
          onapply={handleYamlApply}
        />
      </BottomSheet>
    {/if}

    {#if viewportStore.isMobile && viewSheetOpen}
      <BottomSheet
        open={viewSheetOpen}
        title="View"
        onclose={handleViewSheetClose}
      >
        <MobileViewSheet
          displayMode={uiStore.displayMode}
          showAnnotations={uiStore.showAnnotations}
          theme={uiStore.theme}
          ondisplaymodechange={handleSetDisplayMode}
          onannotationschange={handleSetAnnotations}
          onthemechange={handleSetTheme}
          onfitall={handleFitAll}
          onresetzoom={() => canvasStore.resetZoom()}
          onclose={handleViewSheetActionClose}
        />
      </BottomSheet>
    {/if}

    {#if viewportStore.isMobile && deviceLibrarySheetOpen}
      <BottomSheet
        open={deviceLibrarySheetOpen}
        title="Device Library"
        onclose={handleDeviceLibrarySheetClose}
      >
        <DevicePalette
          ondeviceselect={handleMobileDeviceSelect}
          oncreatedevice={handleAddDevice}
        />
      </BottomSheet>
    {/if}

    <!-- Mobile rack edit sheet (opened via long press on rack) -->
    {#if viewportStore.isMobile && rackEditSheetOpen && layoutStore.activeRack}
      <BottomSheet
        open={rackEditSheetOpen}
        title="Edit Rack"
        onclose={handleRackEditSheetClose}
      >
        <RackEditSheet
          rack={layoutStore.activeRack}
          onclose={handleRackEditSheetClose}
        />
      </BottomSheet>
    {/if}

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

    <!-- Hidden file input for device library JSON import -->
    <input
      bind:this={deviceImportInputRef}
      type="file"
      accept=".json,application/json"
      onchange={handleDeviceImportFileChange}
      style="display: none;"
      aria-label="Import device library file"
    />
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
