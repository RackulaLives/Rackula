<!--
  DialogOrchestrator — manages all dialog and bottom sheet UI

  Extracted from App.svelte as part of decomposition (#1395).
  All dependencies are accessed via module imports and singleton stores (zero props).
-->
<script lang="ts">
  import { NewRackWizard, type CreateRackData } from "$lib/components/wizard";
  import AddDeviceForm from "$lib/components/AddDeviceForm.svelte";
  import ImportFromNetBoxDialog from "$lib/components/ImportFromNetBoxDialog.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import ConfirmReplaceDialog from "$lib/components/ConfirmReplaceDialog.svelte";
  import CleanupDialog from "$lib/components/CleanupDialog.svelte";
  import CleanupPromptDialog from "$lib/components/CleanupPromptDialog.svelte";
  import ExportDialog from "$lib/components/ExportDialog.svelte";
  import ShareDialog from "$lib/components/ShareDialog.svelte";
  import LayoutYamlPanel from "$lib/components/LayoutYamlPanel.svelte";
  import Dialog from "$lib/components/Dialog.svelte";
  import HelpPanel from "$lib/components/HelpPanel.svelte";
  import BottomSheet from "$lib/components/BottomSheet.svelte";
  import DeviceDetails from "$lib/components/DeviceDetails.svelte";
  import MobileFileSheet from "$lib/components/MobileFileSheet.svelte";
  import MobileBottomNav from "$lib/components/mobile/MobileBottomNav.svelte";
  import RackEditSheet from "$lib/components/RackEditSheet.svelte";
  import MobileViewSheet from "$lib/components/mobile/MobileViewSheet.svelte";
  import DevicePalette from "$lib/components/DevicePalette.svelte";
  import LoadDialog from "$lib/components/LoadDialog.svelte";

  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { getImageStore } from "$lib/stores/images.svelte";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { getPlacementStore } from "$lib/stores/placement.svelte";
  import { dialogStore } from "$lib/stores/dialogs.svelte";

  import {
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
    shouldSaveToServer,
  } from "$lib/utils/persistence-manager.svelte";

  import { clearSession } from "$lib/utils/session-storage";
  import { parseDeviceLibraryImport } from "$lib/utils/import";
  import { analytics } from "$lib/utils/analytics";
  import { hapticTap } from "$lib/utils/haptics";
  import { appDebug, dialogDebug } from "$lib/utils/debug";
  import type { ImageData } from "$lib/types/images";
  import type { DisplayMode, Layout, RackWidth } from "$lib/types";
  import type { ImportResult } from "$lib/utils/netbox-import";

  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const uiStore = getUIStore();
  const canvasStore = getCanvasStore();
  const toastStore = getToastStore();
  const imageStore = getImageStore();
  const viewportStore = getViewportStore();
  const placementStore = getPlacementStore();

  // Dialog state — derived from dialogStore
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

  // Mobile bottom sheet state
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

  // Device library import file input ref
  let deviceImportInputRef = $state<HTMLInputElement | null>(null);

  // --- New Rack handlers ---

  function handleNewRackCreate(data: CreateRackData) {
    if (data.layoutType === "bayed" && data.bayCount) {
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
      layoutStore.addRack(data.name, data.height, data.width);
    }
    dialogStore.close();
    requestAnimationFrame(() => handleFitAll());
  }

  function handleNewRackCancel() {
    dialogStore.close();
  }

  // --- Replace dialog handlers ---

  async function handleSaveFirst() {
    dialogStore.close();
    dialogStore.pendingSaveFirst = true;
    if (shouldSaveToServer()) {
      await handleSaveToServer();
    } else {
      await handleSaveAsArchive();
    }
  }

  function handleReplace() {
    dialogStore.close();
    clearSession();
    resetAndOpenNewRack();
  }

  function handleCancelReplace() {
    dialogStore.close();
  }

  // --- Cleanup handlers ---

  function getUnusedCustomTypeCount(): number {
    return layoutStore.getUnusedCustomDeviceTypes().length;
  }

  function handleCleanupReview() {
    const pendingOp = dialogStore.pendingCleanupOperation;
    cleanupReviewPendingOperation = pendingOp;
    dialogStore.close();
    dialogStore.open("cleanupDialog");
  }

  function handleCleanupKeepAll() {
    const pendingOp = dialogStore.pendingCleanupOperation;
    cleanupReviewPendingOperation = null;
    dialogStore.close();
    if (pendingOp === "save") {
      if (shouldSaveToServer()) {
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

  function handleCleanupCancel() {
    cleanupReviewPendingOperation = null;
    dialogStore.close();
  }

  function handleCleanupDontAskAgain() {
    uiStore.setPromptCleanupOnSave(false);
  }

  export function handleOpenCleanupDialog() {
    cleanupReviewPendingOperation = null;
    dialogStore.open("cleanupDialog");
  }

  function handleCleanupDialogClose(action: "delete" | "cancel" = "cancel") {
    const pendingOp = cleanupReviewPendingOperation;
    cleanupReviewPendingOperation = null;
    dialogStore.close();

    if (!pendingOp) {
      return;
    }

    if (action !== "delete") {
      return;
    }

    if (pendingOp === "save") {
      if (shouldSaveToServer()) {
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

  // --- Delete handlers ---

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

  // --- Export / Share handlers ---

  function handleExportCancel() {
    dialogStore.close();
    handleFitAll();
  }

  function handleShareClose() {
    dialogStore.close();
    handleFitAll();
  }

  // --- YAML editor handlers ---

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

  // --- Help handlers ---

  function handleHelpClose() {
    dialogStore.close();
    handleFitAll();
  }

  // --- Add device handlers ---

  function handleAddDevice() {
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

    if (data.frontImage) {
      imageStore.setDeviceImage(device.slug, "front", data.frontImage);
    }
    if (data.rearImage) {
      imageStore.setDeviceImage(device.slug, "rear", data.rearImage);
    }

    analytics.trackCustomDeviceCreate(data.category);
    toastStore.showToast(`"${data.name}" added to device library`, "success");
    dialogStore.close();
  }

  function handleAddDeviceCancel() {
    dialogStore.close();
  }

  // --- NetBox import handlers ---

  function handleNetBoxImport(result: ImportResult) {
    layoutStore.addDeviceTypeRaw(result.deviceType);
    layoutStore.markDirty();
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

  // --- Device library import handlers ---

  export function handleImportDevices() {
    deviceImportInputRef?.click();
  }

  async function handleDeviceImportFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    try {
      const text = await file.text();
      const existingSlugs = layoutStore.device_types.map((d) => d.slug);
      const result = parseDeviceLibraryImport(text, existingSlugs);

      if (result.error) {
        toastStore.showToast(`Import failed: ${result.error}`, "error");
        return;
      }

      for (const deviceType of result.devices) {
        layoutStore.addDeviceTypeRaw(deviceType);
      }
      layoutStore.markDirty();

      analytics.trackPaletteImport();

      const message =
        result.skipped > 0
          ? `Imported ${result.devices.length} devices (${result.skipped} skipped)`
          : `Imported ${result.devices.length} ${result.devices.length === 1 ? "device" : "devices"}`;

      toastStore.showToast(message, "success");
    } catch (error) {
      dialogDebug.import("Failed to import device library: %O", error);
      toastStore.showToast("Failed to import device library", "error");
    } finally {
      input.value = "";
    }
  }

  // --- Mobile bottom sheet handlers ---

  // Watch for device selection changes to trigger mobile bottom sheet
  $effect(() => {
    const activeRack = layoutStore.activeRack;
    if (viewportStore.isMobile && selectionStore.isDeviceSelected) {
      const deviceIndex = selectionStore.getSelectedDeviceIndex(
        activeRack?.devices ?? [],
      );
      appDebug.mobile("Device selected: %O", {
        deviceIndex,
        hasRack: !!activeRack,
      });
      if (deviceIndex !== null && activeRack) {
        dialogStore.openSheet("deviceDetails", deviceIndex);
        appDebug.mobile("Opening bottom sheet for device %d", deviceIndex);
      }
    } else if (!selectionStore.isDeviceSelected) {
      if (viewportStore.isMobile && bottomSheetOpen) {
        appDebug.mobile(
          "Device deselected, closing bottom sheet and fitting all",
        );
        dialogStore.closeSheet();
        canvasStore.fitAll(layoutStore.racks, layoutStore.rack_groups);
      }
    }
  });

  function handleBottomSheetClose() {
    dialogStore.closeSheet();
    selectionStore.clearSelection();
    handleFitAll();
  }

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
        const newPosition = device.position - 1;
        layoutStore.moveDevice(
          activeRack.id,
          selectedDeviceForSheet,
          newPosition,
        );
      }
    }
  }

  // --- Mobile view/file/device library sheet handlers ---

  function handleViewSheetClick() {
    dialogStore.openSheet("view");
  }

  function handleViewSheetClose() {
    dialogStore.closeSheet();
    handleFitAll();
  }

  function handleViewSheetActionClose() {
    dialogStore.closeSheet();
  }

  function handleDeviceLibraryTabClick() {
    dialogStore.openSheet("deviceLibrary");
  }

  function handleFileTabClick() {
    dialogStore.openSheet("fileActions");
  }

  function handleFileSheetClose() {
    dialogStore.closeSheet();
  }

  function handleDeviceLibrarySheetClose() {
    dialogStore.closeSheet();
    handleFitAll();
  }

  // --- Mobile rack edit sheet handlers ---

  function handleRackEditSheetClose() {
    dialogStore.closeSheet();
    handleFitAll();
  }

  // --- Mobile device selection (placement mode) ---

  function handleMobileDeviceSelect(
    event: CustomEvent<{ device: import("$lib/types").DeviceType }>,
  ) {
    const { device } = event.detail;
    hapticTap();
    placementStore.startPlacement(device);
    dialogStore.closeSheet();
  }

  // --- View settings handlers (forwarded from mobile sheets) ---

  function handleSetDisplayMode(mode: DisplayMode) {
    if (uiStore.displayMode === mode) return;
    uiStore.setDisplayMode(mode);
    layoutStore.updateDisplayMode(uiStore.displayMode);
    layoutStore.updateShowLabelsOnImages(uiStore.showLabelsOnImages);
    analytics.trackDisplayModeToggle(uiStore.displayMode);
  }

  function handleSetAnnotations(enabled: boolean) {
    uiStore.setAnnotations(enabled);
  }

  function handleSetTheme(theme: "dark" | "light") {
    if (uiStore.theme === theme) return;
    uiStore.setTheme(theme);
  }
</script>

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

<CleanupDialog open={cleanupDialogOpen} onclose={handleCleanupDialogClose} />

<LoadDialog />

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
  <BottomSheet open={fileSheetOpen} title="File" onclose={handleFileSheetClose}>
    <MobileFileSheet
      onload={handleLoad}
      onsave={maybeSave}
      onsaveas={maybeSaveAs}
      onexport={maybeExport}
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
  <BottomSheet open={viewSheetOpen} title="View" onclose={handleViewSheetClose}>
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

<!-- Hidden file input for device library JSON import -->
<input
  bind:this={deviceImportInputRef}
  type="file"
  accept=".json,application/json"
  onchange={handleDeviceImportFileChange}
  style="display: none;"
  aria-label="Import device library file"
/>
