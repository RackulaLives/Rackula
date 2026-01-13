<!--
  Rackula - Rack Layout Designer
  Main application component
-->
<script lang="ts">
  import { onMount } from "svelte";
  import AnimationDefs from "$lib/components/AnimationDefs.svelte";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import Canvas from "$lib/components/Canvas.svelte";
  import { PaneGroup, Pane, PaneResizer } from "paneforge";
  import DevicePalette from "$lib/components/DevicePalette.svelte";
  import EditPanel from "$lib/components/EditPanel.svelte";
  import NewRackForm from "$lib/components/NewRackForm.svelte";
  import AddDeviceForm from "$lib/components/AddDeviceForm.svelte";
  import ImportFromNetBoxDialog from "$lib/components/ImportFromNetBoxDialog.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import ConfirmReplaceDialog from "$lib/components/ConfirmReplaceDialog.svelte";
  import ToastContainer from "$lib/components/ToastContainer.svelte";
  import PortTooltip from "$lib/components/PortTooltip.svelte";
  import KeyboardHandler from "$lib/components/KeyboardHandler.svelte";
  import ExportDialog from "$lib/components/ExportDialog.svelte";
  import ShareDialog from "$lib/components/ShareDialog.svelte";
  import HelpPanel from "$lib/components/HelpPanel.svelte";
  import BottomSheet from "$lib/components/BottomSheet.svelte";
  import DeviceDetails from "$lib/components/DeviceDetails.svelte";
  import DeviceLibraryFAB from "$lib/components/DeviceLibraryFAB.svelte";
  import RackEditSheet from "$lib/components/RackEditSheet.svelte";
  import SidebarTabs from "$lib/components/SidebarTabs.svelte";
  import RackList from "$lib/components/RackList.svelte";
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
  import { getPlacementStore } from "$lib/stores/placement.svelte";
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
  import type { ImportResult } from "$lib/utils/netbox-import";
  import { analytics } from "$lib/utils/analytics";
  import { hapticTap } from "$lib/utils/haptics";
  import { debug } from "$lib/utils/debug";
  import { dialogStore } from "$lib/stores/dialogs.svelte";
  import { Tooltip } from "bits-ui";

  // Build-time environment constant from vite.config.ts
  declare const __BUILD_ENV__: string;

  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const uiStore = getUIStore();
  const canvasStore = getCanvasStore();
  const toastStore = getToastStore();
  const imageStore = getImageStore();
  const viewportStore = getViewportStore();
  const placementStore = getPlacementStore();

  // Dialog state - now managed by dialogStore
  // Legacy local aliases for gradual migration
  let newRackFormOpen = $derived(dialogStore.isOpen("newRack"));
  let addDeviceFormOpen = $derived(dialogStore.isOpen("addDevice"));
  let confirmDeleteOpen = $derived(dialogStore.isOpen("confirmDelete"));
  let exportDialogOpen = $derived(dialogStore.isOpen("export"));
  let shareDialogOpen = $derived(dialogStore.isOpen("share"));
  let helpPanelOpen = $derived(dialogStore.isOpen("help"));
  let importFromNetBoxOpen = $derived(dialogStore.isOpen("importNetBox"));
  let showReplaceDialog = $derived(dialogStore.isOpen("confirmReplace"));

  // Mobile bottom sheet state - managed by dialogStore
  let bottomSheetOpen = $derived(dialogStore.isSheetOpen("deviceDetails"));
  let deviceLibrarySheetOpen = $derived(
    dialogStore.isSheetOpen("deviceLibrary"),
  );
  let rackEditSheetOpen = $derived(dialogStore.isSheetOpen("rackEdit"));

  // Aliases to dialogStore properties for template access
  let deleteTarget = $derived(dialogStore.deleteTarget);
  let selectedDeviceForSheet = $derived(dialogStore.selectedDeviceIndex);
  let exportQrCodeDataUrl = $derived(dialogStore.exportQrCodeDataUrl);

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
          canvasStore.fitAll(layoutStore.racks);
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
        canvasStore.fitAll(layoutStore.racks);
      });
      return;
    }

    // Priority 3: No share link or autosave, show new rack dialog if empty
    if (layoutStore.rackCount === 0) {
      dialogStore.open("newRack");
    }
  });

  // Toolbar event handlers
  function handleNewRack() {
    // Multi-rack mode: always open new rack form (no replace dialog)
    if (!layoutStore.canAddRack) {
      toastStore.showToast("Maximum number of racks reached", "warning");
      return;
    }
    dialogStore.open("newRack");
  }

  function handleNewRackCreate(data: {
    name: string;
    height: number;
    width: number;
  }) {
    layoutStore.addRack(data.name, data.height, data.width);
    dialogStore.close();
  }

  function handleNewRackCancel() {
    dialogStore.close();
  }

  // Replace dialog handlers (single-rack mode)
  async function handleSaveFirst() {
    dialogStore.close();
    dialogStore.pendingSaveFirst = true;
    await handleSave();
  }

  function handleReplace() {
    dialogStore.close();
    layoutStore.resetLayout();
    // Clean up orphaned user images (layout is now empty)
    const usedSlugs = layoutStore.getUsedDeviceTypeSlugs();
    imageStore.cleanupOrphanedImages(usedSlugs);
    // Clear autosaved session when explicitly creating new rack
    clearSession();
    dialogStore.open("newRack");
  }

  function handleCancelReplace() {
    dialogStore.close();
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

      // Track save event (total devices across all racks)
      analytics.trackSave(layoutStore.totalDeviceCount);

      // After save, if pendingSaveFirst, reset and open new rack form
      if (dialogStore.pendingSaveFirst) {
        dialogStore.pendingSaveFirst = false;
        layoutStore.resetLayout();
        // Clean up orphaned user images (layout is now empty)
        const usedSlugs = layoutStore.getUsedDeviceTypeSlugs();
        imageStore.cleanupOrphanedImages(usedSlugs);
        dialogStore.open("newRack");
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
        canvasStore.fitAll(layoutStore.racks);
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

      // Track load event (total devices across all racks)
      analytics.trackLoad(layoutStore.totalDeviceCount);
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
        dialogStore.exportQrCodeDataUrl = await generateQRCode(shareUrl, {
          width: 444,
        });
      } else {
        // Layout too large for QR code
        dialogStore.exportQrCodeDataUrl = undefined;
      }
    } catch {
      // If QR generation fails, continue without it
      dialogStore.exportQrCodeDataUrl = undefined;
    }

    dialogStore.open("export");
  }

  async function handleExportSubmit(options: ExportOptions) {
    dialogStore.close();

    try {
      // Multi-rack mode: export all racks
      const racksToExport = layoutStore.racks;

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
        // CSV export only supports single rack - warn if multiple racks exist
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
        const successMsg =
          racksToExport.length > 1
            ? `CSV exported (first rack only - "${racksToExport[0]!.name}")`
            : "CSV exported successfully";
        toastStore.showToast(successMsg, "success");
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
    dialogStore.close();
  }

  function handleShare() {
    if (!layoutStore.hasRack) {
      toastStore.showToast("No rack to share", "warning");
      return;
    }
    dialogStore.open("share");

    // Track share event (total devices across all racks)
    analytics.trackShare(layoutStore.totalDeviceCount);
  }

  function handleShareClose() {
    dialogStore.close();
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
  }

  function handleFitAll() {
    canvasStore.fitAll(layoutStore.racks);
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

  function handleToggleAnnotations() {
    uiStore.toggleAnnotations();
  }

  function handleHelp() {
    dialogStore.open("help");
  }

  function handleHelpClose() {
    dialogStore.close();
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
    frontImage?: ImageData;
    rearImage?: ImageData;
  }) {
    const device = layoutStore.addDeviceType({
      name: data.name,
      u_height: data.height,
      category: data.category,
      colour: data.colour,
      comments: data.notes || undefined,
      is_full_depth: data.isFullDepth ? undefined : false,
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
        canvasStore.fitAll(layoutStore.racks);
      }
    }
  });

  // Handle bottom sheet close
  function handleBottomSheetClose() {
    dialogStore.closeSheet();
    selectionStore.clearSelection();
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

  // Handle device library FAB click (mobile)
  function handleDeviceLibraryFABClick() {
    dialogStore.openSheet("deviceLibrary");
  }

  // Handle device library sheet close
  function handleDeviceLibrarySheetClose() {
    dialogStore.closeSheet();
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

    // Cleanup on component destroy or effect re-run
    return () => {
      if (saveDebounceTimer) {
        clearTimeout(saveDebounceTimer);
        saveDebounceTimer = null;
      }
    };
  });
</script>

<svelte:window
  onbeforeunload={handleBeforeUnload}
  onkeydown={(e) => konamiDetector.handleKeyDown(e)}
/>

<!-- Tooltip.Provider enables shared tooltip state - only one tooltip shows at a time -->
<Tooltip.Provider delayDuration={500}>
  <div
    class="app-layout"
    style="--sidebar-width: min({uiStore.sidebarWidthPx}px, var(--sidebar-width-max))"
  >
    <Toolbar
      hasSelection={selectionStore.hasSelection}
      hasRacks={layoutStore.hasRack}
      theme={uiStore.theme}
      displayMode={uiStore.displayMode}
      showAnnotations={uiStore.showAnnotations}
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
      ontoggleannotations={handleToggleAnnotations}
      onhelp={handleHelp}
    />

    <main class="app-main" class:mobile={viewportStore.isMobile}>
      {#if !viewportStore.isMobile}
        <!-- Show sidebar toggle when hidden -->
        {#if uiStore.sidebarTab === "hide"}
          <button
            type="button"
            class="sidebar-show-btn"
            onclick={() => uiStore.setSidebarTab("devices")}
            aria-label="Show sidebar"
            title="Show sidebar"
          >
            <span aria-hidden="true">→</span>
          </button>
        {/if}

        <PaneGroup
          direction="horizontal"
          autoSaveId={uiStore.sidebarTab !== "hide"
            ? "rackula-main-layout"
            : "rackula-main-layout-no-sidebar"}
          keyboardResizeBy={10}
          class="pane-group"
        >
          {#if uiStore.sidebarTab !== "hide"}
            <Pane
              defaultSize={20}
              minSize={10}
              maxSize={40}
              collapsible={true}
              collapsedSize={3}
              id="sidebar-pane"
              class="sidebar-pane"
            >
              <SidebarTabs
                activeTab={uiStore.sidebarTab}
                onchange={(tab) => uiStore.setSidebarTab(tab)}
              />
              {#if uiStore.sidebarTab === "devices"}
                <DevicePalette
                  onadddevice={handleAddDevice}
                  onimportfromnetbox={handleImportFromNetBox}
                />
              {:else if uiStore.sidebarTab === "racks"}
                <RackList onaddrack={handleNewRack} />
              {/if}
            </Pane>

            <PaneResizer class="resize-handle" />
          {/if}

          <Pane class="main-pane">
            <Canvas
              onnewrack={handleNewRack}
              onload={handleLoad}
              {partyMode}
              enableLongPress={false}
              onracklongpress={handleRackLongPress}
            />

            <EditPanel />
          </Pane>
        </PaneGroup>
      {:else}
        <Canvas
          onnewrack={handleNewRack}
          onload={handleLoad}
          {partyMode}
          enableLongPress={viewportStore.isMobile && !placementStore.isPlacing}
          onracklongpress={handleRackLongPress}
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
          bind:open={bottomSheetOpen}
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

    <ExportDialog
      open={exportDialogOpen}
      racks={layoutStore.racks}
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

    <HelpPanel
      open={helpPanelOpen}
      showBanana={uiStore.showBanana}
      onclose={handleHelpClose}
      ontogglebanana={() => uiStore.toggleBanana()}
    />

    <ToastContainer />

    <!-- Port tooltip for network interface hover -->
    <PortTooltip />

    <!-- Mobile device library FAB and bottom sheet -->
    <DeviceLibraryFAB onclick={handleDeviceLibraryFABClick} />

    {#if viewportStore.isMobile && deviceLibrarySheetOpen}
      <BottomSheet
        bind:open={deviceLibrarySheetOpen}
        title="Device Library"
        onclose={handleDeviceLibrarySheetClose}
      >
        <DevicePalette
          onadddevice={handleAddDevice}
          onimportfromnetbox={handleImportFromNetBox}
          ondeviceselect={handleMobileDeviceSelect}
        />
      </BottomSheet>
    {/if}

    <!-- Mobile rack edit sheet (opened via long press on rack) -->
    {#if viewportStore.isMobile && rackEditSheetOpen && layoutStore.activeRack}
      <BottomSheet
        bind:open={rackEditSheetOpen}
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
      onsave={handleSave}
      onload={handleLoad}
      onexport={handleExport}
      ondelete={handleDelete}
      onfitall={handleFitAll}
      onhelp={handleHelp}
      ontoggledisplaymode={handleToggleDisplayMode}
      ontoggleannotations={handleToggleAnnotations}
    />

    <!-- Global SVG gradient definitions for animations -->
    <AnimationDefs />
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
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Show sidebar button when sidebar is hidden */
  .sidebar-show-btn {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    z-index: 10;
    width: 24px;
    height: 48px;
    padding: 0;
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-left: none;
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    color: var(--colour-text-muted);
    font-size: var(--font-size-base);
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sidebar-show-btn:hover {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  .sidebar-show-btn:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: -2px;
  }

  /* Note: Mobile overscroll prevention should be in global styles (index.html or app.css) */
  /* body { overscroll-behavior-y: contain; } for <1024px viewports */
</style>
