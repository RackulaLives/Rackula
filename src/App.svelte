<!--
  Rackula - Rack Layout Designer
  Main application component
-->
<script lang="ts">
  import { onMount } from "svelte";
  import AnimationDefs from "$lib/components/AnimationDefs.svelte";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import Canvas from "$lib/components/Canvas.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import DevicePalette from "$lib/components/DevicePalette.svelte";
  import EditPanel from "$lib/components/EditPanel.svelte";
  import NewRackForm from "$lib/components/NewRackForm.svelte";
  import AddDeviceForm from "$lib/components/AddDeviceForm.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import ConfirmReplaceDialog from "$lib/components/ConfirmReplaceDialog.svelte";
  import ToastContainer from "$lib/components/ToastContainer.svelte";
  import KeyboardHandler from "$lib/components/KeyboardHandler.svelte";
  import ExportDialog from "$lib/components/ExportDialog.svelte";
  import ShareDialog from "$lib/components/ShareDialog.svelte";
  import HelpPanel from "$lib/components/HelpPanel.svelte";
  import BottomSheet from "$lib/components/BottomSheet.svelte";
  import DeviceDetails from "$lib/components/DeviceDetails.svelte";
  import MobileWarningModal from "$lib/components/MobileWarningModal.svelte";
  import {
    getShareParam,
    clearShareParam,
    decodeLayout,
    generateShareUrl,
  } from "$lib/utils/share";
  import { generateQRCode, canFitInQR } from "$lib/utils/qrcode";
  import {
    saveSession,
    loadSession,
    clearSession,
  } from "$lib/utils/session-storage";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { getImageStore } from "$lib/stores/images.svelte";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { createKonamiDetector } from "$lib/utils/konami";
  import type { ImageData } from "$lib/types/images";
  import { openFilePicker } from "$lib/utils/file";
  import {
    downloadArchive,
    generateArchiveFilename,
    extractFolderArchive,
  } from "$lib/utils/archive";
  import {
    generateExportSVG,
    exportAsSVG,
    exportAsPNG,
    exportAsJPEG,
    exportAsPDF,
    exportToCSV,
    downloadBlob,
    generateExportFilename,
  } from "$lib/utils/export";
  import type { ExportOptions } from "$lib/types";
  import { analytics } from "$lib/utils/analytics";

  // Build-time environment constant from vite.config.ts
  declare const __BUILD_ENV__: string;

  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const uiStore = getUIStore();
  const canvasStore = getCanvasStore();
  const toastStore = getToastStore();
  const imageStore = getImageStore();
  const viewportStore = getViewportStore();

  // Dialog state
  let newRackFormOpen = $state(false);
  let addDeviceFormOpen = $state(false);
  let confirmDeleteOpen = $state(false);
  let exportDialogOpen = $state(false);
  let shareDialogOpen = $state(false);
  let helpPanelOpen = $state(false);
  let deleteTarget: { type: "rack" | "device"; name: string } | null =
    $state(null);
  let showReplaceDialog = $state(false);
  let pendingSaveFirst = $state(false);

  // QR code for export (generated when export dialog opens)
  let exportQrCodeDataUrl: string | undefined = $state(undefined);

  // Mobile bottom sheet state
  let bottomSheetOpen = $state(false);
  let selectedDeviceForSheet: number | null = $state(null);

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

  // Auto-open new rack dialog when no racks exist (first-load experience)
  // Also handles loading shared layouts from URL params
  // Uses onMount to run once on initial load, not reactively
  onMount(() => {
    // Priority 1: Check for shared layout in URL (highest priority)
    const shareParam = getShareParam();
    if (shareParam) {
      const sharedLayout = decodeLayout(shareParam);
      if (sharedLayout) {
        layoutStore.loadLayout(sharedLayout);
        layoutStore.markClean();
        clearShareParam();
        toastStore.showToast("Shared layout loaded", "success");

        // Reset view to center the loaded rack after DOM updates
        requestAnimationFrame(() => {
          canvasStore.fitAll(layoutStore.rack ? [layoutStore.rack] : []);
        });
        return; // Don't check autosave or show new rack dialog
      } else {
        clearShareParam();
        toastStore.showToast("Invalid share link", "error");
      }
    }

    // Priority 2: Check for autosaved session (if no share link)
    const autosaved = loadSession();
    if (autosaved) {
      layoutStore.loadLayout(autosaved);
      // Mark as dirty since this is an autosaved session (not explicitly saved)
      layoutStore.markDirty();
      // Don't show new rack dialog - user has work in progress
      // Reset view to center the loaded rack after DOM updates
      requestAnimationFrame(() => {
        canvasStore.fitAll(layoutStore.rack ? [layoutStore.rack] : []);
      });
      return;
    }

    // Priority 3: No share link or autosave, show new rack dialog if empty
    if (layoutStore.rackCount === 0) {
      newRackFormOpen = true;
    }
  });

  // Toolbar event handlers
  function handleNewRack() {
    if (layoutStore.rackCount > 0) {
      showReplaceDialog = true;
    } else {
      newRackFormOpen = true;
    }
  }

  function handleNewRackCreate(data: {
    name: string;
    height: number;
    width: number;
  }) {
    layoutStore.addRack(data.name, data.height, data.width);
    newRackFormOpen = false;
  }

  function handleNewRackCancel() {
    newRackFormOpen = false;
  }

  // Replace dialog handlers (single-rack mode)
  async function handleSaveFirst() {
    showReplaceDialog = false;
    pendingSaveFirst = true;
    await handleSave();
  }

  function handleReplace() {
    showReplaceDialog = false;
    layoutStore.resetLayout();
    // Clean up orphaned user images (layout is now empty)
    const usedSlugs = layoutStore.getUsedDeviceTypeSlugs();
    imageStore.cleanupOrphanedImages(usedSlugs);
    // Clear autosaved session when explicitly creating new rack
    clearSession();
    newRackFormOpen = true;
  }

  function handleCancelReplace() {
    showReplaceDialog = false;
  }

  async function handleSave() {
    try {
      // Get user images (exclude bundled images) for archive
      const images = imageStore.getUserImages();

      // Get the filename for the toast message
      const filename = generateArchiveFilename(layoutStore.layout);

      // Save as folder archive (.Rackula.zip)
      await downloadArchive(layoutStore.layout, images);
      layoutStore.markClean();
      // Clear autosaved session when explicitly saving
      clearSession();
      toastStore.showToast(`Saved ${filename}`, "success", 3000);

      // Track save event
      const deviceCount = layoutStore.rack?.devices.length ?? 0;
      analytics.trackSave(deviceCount);

      // After save, if pendingSaveFirst, reset and open new rack form
      if (pendingSaveFirst) {
        pendingSaveFirst = false;
        layoutStore.resetLayout();
        // Clean up orphaned user images (layout is now empty)
        const usedSlugs = layoutStore.getUsedDeviceTypeSlugs();
        imageStore.cleanupOrphanedImages(usedSlugs);
        newRackFormOpen = true;
      }
    } catch (error) {
      console.error("Failed to save layout:", error);
      toastStore.showToast(
        error instanceof Error ? error.message : "Failed to save layout",
        "error",
      );
    }
  }

  async function handleLoad() {
    try {
      const file = await openFilePicker();
      if (!file) {
        // User cancelled
        return;
      }

      // Load folder archive (.Rackula.zip)
      const { layout, images, failedImages } = await extractFolderArchive(file);

      // Clear and restore images from archive
      imageStore.clearAllImages();
      for (const [deviceSlug, deviceImages] of images) {
        if (deviceImages.front) {
          imageStore.setDeviceImage(deviceSlug, "front", deviceImages.front);
        }
        if (deviceImages.rear) {
          imageStore.setDeviceImage(deviceSlug, "rear", deviceImages.rear);
        }
      }
      // Reload bundled images (they were cleared above but not saved in archives)
      imageStore.loadBundledImages();

      layoutStore.loadLayout(layout);
      layoutStore.markClean();
      // Clear autosaved session when explicitly loading
      clearSession();
      selectionStore.clearSelection();

      // Reset view to center the loaded rack after DOM updates
      requestAnimationFrame(() => {
        canvasStore.fitAll(layoutStore.rack ? [layoutStore.rack] : []);
      });

      // Show appropriate toast based on image loading results
      if (failedImages.length > 0) {
        const count = failedImages.length;
        toastStore.showToast(
          `Layout loaded with ${count} image${count > 1 ? "s" : ""} that couldn't be read`,
          "warning",
        );
      } else {
        toastStore.showToast("Layout loaded successfully", "success");
      }

      // Track load event
      const deviceCount = layoutStore.rack?.devices.length ?? 0;
      analytics.trackLoad(deviceCount);
    } catch (error) {
      console.error("Failed to load layout:", error);
      toastStore.showToast(
        error instanceof Error ? error.message : "Failed to load layout file",
        "error",
      );
    }
  }

  async function handleExport() {
    if (!layoutStore.hasRack) {
      toastStore.showToast("No racks to export", "warning");
      return;
    }

    // Generate QR code for the share URL (for optional embedding in export)
    try {
      const shareUrl = generateShareUrl(layoutStore.layout);
      if (canFitInQR(shareUrl)) {
        exportQrCodeDataUrl = await generateQRCode(shareUrl, { width: 444 });
      } else {
        // Layout too large for QR code
        exportQrCodeDataUrl = undefined;
      }
    } catch {
      // If QR generation fails, continue without it
      exportQrCodeDataUrl = undefined;
    }

    exportDialogOpen = true;
  }

  async function handleExportSubmit(options: ExportOptions) {
    exportDialogOpen = false;

    try {
      // Single-rack mode: export the rack if it exists
      const racksToExport = layoutStore.rack ? [layoutStore.rack] : [];

      if (racksToExport.length === 0) {
        toastStore.showToast("No rack to export", "warning");
        return;
      }

      // Add current display mode to export options
      const exportOptions = {
        ...options,
        displayMode: uiStore.displayMode,
      };

      // Generate the SVG with images if in image mode
      const images = imageStore.getAllImages();
      const svg = generateExportSVG(
        racksToExport,
        layoutStore.device_types,
        exportOptions,
        images,
      );

      // Export based on selected format
      const exportViewOrDefault = options.exportView ?? "both";
      if (options.format === "svg") {
        const svgString = exportAsSVG(svg);
        const blob = new Blob([svgString], { type: "image/svg+xml" });
        const filename = generateExportFilename(
          layoutStore.layout.name,
          exportViewOrDefault,
          options.format,
        );
        downloadBlob(blob, filename);
        toastStore.showToast("SVG exported successfully", "success");
        analytics.trackExportImage("svg", exportViewOrDefault);
      } else if (options.format === "png") {
        const imageBlob = await exportAsPNG(svg);
        const filename = generateExportFilename(
          layoutStore.layout.name,
          exportViewOrDefault,
          options.format,
        );
        downloadBlob(imageBlob, filename);
        toastStore.showToast("PNG exported successfully", "success");
        analytics.trackExportImage("png", exportViewOrDefault);
      } else if (options.format === "jpeg") {
        const imageBlob = await exportAsJPEG(svg);
        const filename = generateExportFilename(
          layoutStore.layout.name,
          exportViewOrDefault,
          options.format,
        );
        downloadBlob(imageBlob, filename);
        toastStore.showToast("JPEG exported successfully", "success");
        analytics.trackExportImage("jpeg", exportViewOrDefault);
      } else if (options.format === "pdf") {
        const svgString = exportAsSVG(svg);
        const pdfBlob = await exportAsPDF(svgString, options.background);
        const filename = generateExportFilename(
          layoutStore.layout.name,
          exportViewOrDefault,
          options.format,
        );
        downloadBlob(pdfBlob, filename);
        toastStore.showToast("PDF exported successfully", "success");
        analytics.trackExportPDF(exportViewOrDefault);
      } else if (options.format === "csv") {
        // CSV export uses null view (no view in filename)
        const csvContent = exportToCSV(
          racksToExport[0]!,
          layoutStore.device_types,
        );
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
        const filename = generateExportFilename(
          layoutStore.layout.name,
          null,
          options.format,
        );
        downloadBlob(blob, filename);
        toastStore.showToast("CSV exported successfully", "success");
        analytics.trackExportCSV();
      }
    } catch (error) {
      console.error("Export failed:", error);
      toastStore.showToast(
        error instanceof Error ? error.message : "Export failed",
        "error",
      );
    }
  }

  function handleExportCancel() {
    exportDialogOpen = false;
  }

  function handleShare() {
    if (!layoutStore.hasRack) {
      toastStore.showToast("No rack to share", "warning");
      return;
    }
    shareDialogOpen = true;

    // Track share event
    const deviceCount = layoutStore.rack?.devices.length ?? 0;
    analytics.trackShare(deviceCount);
  }

  function handleShareClose() {
    shareDialogOpen = false;
  }

  function handleDelete() {
    if (selectionStore.isRackSelected && selectionStore.selectedRackId) {
      // Single-rack mode
      const rack = layoutStore.rack;
      if (rack) {
        deleteTarget = { type: "rack", name: rack.name };
        confirmDeleteOpen = true;
      }
    } else if (selectionStore.isDeviceSelected) {
      if (
        selectionStore.selectedRackId !== null &&
        selectionStore.selectedDeviceId !== null
      ) {
        // Single-rack mode
        const rack = layoutStore.rack;
        const deviceIndex = selectionStore.getSelectedDeviceIndex(
          rack?.devices ?? [],
        );
        if (rack && deviceIndex !== null && rack.devices[deviceIndex]) {
          const device = rack.devices[deviceIndex];
          const deviceDef = layoutStore.device_types.find(
            (d) => d.slug === device?.device_type,
          );
          deleteTarget = {
            type: "device",
            name: deviceDef?.model ?? deviceDef?.slug ?? "Device",
          };
          confirmDeleteOpen = true;
        }
      }
    }
  }

  function handleConfirmDelete() {
    if (deleteTarget?.type === "rack" && selectionStore.selectedRackId) {
      layoutStore.deleteRack(selectionStore.selectedRackId);
      selectionStore.clearSelection();
    } else if (deleteTarget?.type === "device") {
      const rack = layoutStore.rack;
      const deviceIndex = selectionStore.getSelectedDeviceIndex(
        rack?.devices ?? [],
      );
      if (selectionStore.selectedRackId !== null && deviceIndex !== null) {
        layoutStore.removeDeviceFromRack(
          selectionStore.selectedRackId,
          deviceIndex,
        );
        selectionStore.clearSelection();
      }
    }
    confirmDeleteOpen = false;
    deleteTarget = null;
  }

  function handleCancelDelete() {
    confirmDeleteOpen = false;
    deleteTarget = null;
  }

  function handleFitAll() {
    canvasStore.fitAll(layoutStore.rack ? [layoutStore.rack] : []);
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

  function handleHelp() {
    helpPanelOpen = true;
  }

  function handleHelpClose() {
    helpPanelOpen = false;
  }

  function handleAddDevice() {
    addDeviceFormOpen = true;
  }

  function handleAddDeviceCreate(data: {
    name: string;
    height: number;
    category: import("$lib/types").DeviceCategory;
    colour: string;
    notes: string;
    frontImage?: ImageData;
    rearImage?: ImageData;
  }) {
    const device = layoutStore.addDeviceType({
      name: data.name,
      u_height: data.height,
      category: data.category,
      colour: data.colour,
      comments: data.notes || undefined,
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

    addDeviceFormOpen = false;
  }

  function handleAddDeviceCancel() {
    addDeviceFormOpen = false;
  }

  // Beforeunload handler for unsaved changes
  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (layoutStore.isDirty) {
      event.preventDefault();
      // Modern browsers ignore custom messages, but we set it for legacy support
      event.returnValue = "You have unsaved changes. Leave anyway?";
      return event.returnValue;
    }
  }

  onMount(() => {
    // Apply theme from storage (already done in ui store init)
    // Session restore will be implemented in a later phase

    // Load bundled images for starter library devices
    imageStore.loadBundledImages();

    // Set window title with environment prefix in non-production environments
    const buildEnv = typeof __BUILD_ENV__ !== "undefined" ? __BUILD_ENV__ : "";
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    let envPrefix = "";
    if (isLocalhost) {
      envPrefix = "LOCAL - ";
    } else if (buildEnv === "development") {
      envPrefix = "DEV - ";
    }

    if (envPrefix) {
      document.title = `${envPrefix}${document.title}`;
    }
  });

  // Watch for device selection changes to trigger mobile bottom sheet
  $effect(() => {
    if (viewportStore.isMobile && selectionStore.isDeviceSelected) {
      const deviceIndex = selectionStore.getSelectedDeviceIndex(
        layoutStore.rack?.devices ?? [],
      );
      console.log("[Mobile] Device selected:", {
        deviceIndex,
        hasRack: !!layoutStore.rack,
      });
      if (deviceIndex !== null && layoutStore.rack) {
        selectedDeviceForSheet = deviceIndex;
        bottomSheetOpen = true;
        console.log(
          "[Mobile] Opening bottom sheet and auto-zooming to device",
          deviceIndex,
        );

        // Auto-zoom to device on mobile
        canvasStore.zoomToDevice(
          layoutStore.rack,
          deviceIndex,
          layoutStore.device_types,
        );
      }
    } else if (!selectionStore.isDeviceSelected) {
      // When device deselected, close sheet and fit all
      if (viewportStore.isMobile && bottomSheetOpen) {
        console.log(
          "[Mobile] Device deselected, closing bottom sheet and fitting all",
        );
        bottomSheetOpen = false;
        selectedDeviceForSheet = null;
        if (layoutStore.rack) {
          canvasStore.fitAll([layoutStore.rack]);
        }
      }
    }
  });

  // Handle bottom sheet close
  function handleBottomSheetClose() {
    bottomSheetOpen = false;
    selectedDeviceForSheet = null;
    selectionStore.clearSelection();
  }

  // Auto-save layout to localStorage with debouncing
  let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    // Watch layout changes (triggered when layout.rack or any property changes)
    // Access the layout to track it
    const currentLayout = layoutStore.layout;

    // Only save if there's a rack to save
    if (layoutStore.hasRack) {
      // Clear existing timer
      if (saveDebounceTimer) {
        clearTimeout(saveDebounceTimer);
      }

      // Debounce saves (1000ms)
      saveDebounceTimer = setTimeout(() => {
        saveSession(currentLayout);
        saveDebounceTimer = null;
      }, 1000);
    }
  });
</script>

<svelte:window
  onbeforeunload={handleBeforeUnload}
  onkeydown={(e) => konamiDetector.handleKeyDown(e)}
/>

<div class="app-layout">
  <Toolbar
    hasSelection={selectionStore.hasSelection}
    hasRacks={layoutStore.hasRack}
    theme={uiStore.theme}
    displayMode={uiStore.displayMode}
    {partyMode}
    onnewrack={handleNewRack}
    onsave={handleSave}
    onload={handleLoad}
    onexport={handleExport}
    onshare={handleShare}
    ondelete={handleDelete}
    onfitall={handleFitAll}
    ontoggletheme={handleToggleTheme}
    ontoggledisplaymode={handleToggleDisplayMode}
    onhelp={handleHelp}
  />

  <main class="app-main" class:mobile={viewportStore.isMobile}>
    {#if !viewportStore.isMobile}
      <Sidebar side="left">
        <DevicePalette onadddevice={handleAddDevice} />
      </Sidebar>
    {/if}

    <Canvas onnewrack={handleNewRack} onload={handleLoad} {partyMode} />

    {#if !viewportStore.isMobile}
      <EditPanel />
    {/if}
  </main>

  <!-- Mobile bottom sheet for device details -->
  {#if viewportStore.isMobile && bottomSheetOpen && selectedDeviceForSheet !== null && layoutStore.rack}
    {@const device = layoutStore.rack.devices[selectedDeviceForSheet]}
    {@const deviceType = device
      ? layoutStore.device_types.find((dt) => dt.slug === device.device_type)
      : null}
    {#if device && deviceType}
      <BottomSheet bind:open={bottomSheetOpen} onclose={handleBottomSheetClose}>
        <DeviceDetails
          {device}
          {deviceType}
          rackView={layoutStore.rack?.view}
          rackHeight={layoutStore.rack?.height}
        />
      </BottomSheet>
    {/if}
  {/if}

  <NewRackForm
    open={newRackFormOpen}
    rackCount={layoutStore.rackCount}
    oncreate={handleNewRackCreate}
    oncancel={handleNewRackCancel}
  />

  <AddDeviceForm
    open={addDeviceFormOpen}
    onadd={handleAddDeviceCreate}
    oncancel={handleAddDeviceCancel}
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

  <ExportDialog
    open={exportDialogOpen}
    racks={layoutStore.rack ? [layoutStore.rack] : []}
    deviceTypes={layoutStore.device_types}
    images={imageStore.getAllImages()}
    displayMode={uiStore.displayMode}
    layoutName={layoutStore.layout.name}
    selectedRackId={selectionStore.isRackSelected
      ? selectionStore.selectedRackId
      : null}
    qrCodeDataUrl={exportQrCodeDataUrl}
    onexport={(e) => handleExportSubmit(e.detail)}
    oncancel={handleExportCancel}
  />

  <ShareDialog
    open={shareDialogOpen}
    layout={layoutStore.layout}
    onclose={handleShareClose}
  />

  <HelpPanel open={helpPanelOpen} onclose={handleHelpClose} />

  <ToastContainer />

  <MobileWarningModal />

  <KeyboardHandler
    onsave={handleSave}
    onload={handleLoad}
    onexport={handleExport}
    ondelete={handleDelete}
    onfitall={handleFitAll}
    onhelp={handleHelp}
    ontoggledisplaymode={handleToggleDisplayMode}
  />

  <!-- Global SVG gradient definitions for animations -->
  <AnimationDefs />
</div>

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
  }

  /* Note: Mobile overscroll prevention should be in global styles (index.html or app.css) */
  /* body { overscroll-behavior-y: contain; } for <1024px viewports */
</style>
