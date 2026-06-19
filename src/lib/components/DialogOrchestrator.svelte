<!--
  DialogOrchestrator — manages all dialog and bottom sheet UI

  Extracted from App.svelte as part of decomposition (#1395).
  All dependencies are accessed via module imports and singleton stores (zero props).
-->
<script lang="ts">
  import { NewRackWizard, type CreateRackData } from "$lib/components/wizard";
  import { placementKey } from "$lib/utils/placement-key";
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
  import SettingsDialog from "$lib/components/SettingsDialog.svelte";
  import DeviceDetails from "$lib/components/DeviceDetails.svelte";
  import MobileBottomNav from "$lib/components/mobile/MobileBottomNav.svelte";
  import RackEditSheet from "$lib/components/RackEditSheet.svelte";
  import MobileViewSheet from "$lib/components/mobile/MobileViewSheet.svelte";
  import MobileLayoutsSheet from "$lib/components/mobile/MobileLayoutsSheet.svelte";
  import MobileRacksSheet from "$lib/components/mobile/MobileRacksSheet.svelte";
  import DevicePalette from "$lib/components/DevicePalette.svelte";
  import LoadDialog from "$lib/components/LoadDialog.svelte";
  import CommandPalette from "$lib/components/CommandPalette.svelte";

  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { getImageStore } from "$lib/stores/images.svelte";
  import type { ImageStoreMap } from "$lib/types/images";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { getPlacementStore } from "$lib/stores/placement.svelte";
  import { dialogStore } from "$lib/stores/dialogs.svelte";

  import {
    handleSaveToServer,
    handleSaveAsArchive,
    shouldSaveToServer,
    clearSession,
  } from "$lib/storage";
  import {
    handleExport,
    handleExportSubmit,
    handleFitAll,
    resetAndOpenNewRack,
  } from "$lib/utils/app-actions";
  import { parseDeviceLibraryImport } from "$lib/utils/import";
  import { registerImportDevicesTrigger } from "$lib/actions/import-devices-trigger";
  import { hapticTap } from "$lib/utils/haptics";
  import { appDebug, dialogDebug } from "$lib/utils/debug";
  import type { ImageData } from "$lib/types/images";
  import type { DisplayMode, Layout, RackWidth } from "$lib/types";
  import type { ImportResult } from "$lib/utils/netbox-import";

  import { getSelectionVerbsWithState } from "$lib/actions/verb-bars";
  import type { ActionEnabledContext, ActionId } from "$lib/actions/registry";
  import {
    moveSelectedDeviceUp,
    moveSelectedDeviceDown,
    moveSelectedDeviceToSlot,
    flipSelectedDeviceFace,
    duplicateSelection,
    canMoveSelectedDeviceSlot,
  } from "$lib/actions/selection-actions";
  import { handleDelete } from "$lib/utils/dialog-actions";
  import {
    findNextValidPosition,
    canMoveUp,
    canMoveDown,
    getMoveBlockedMessage,
    type MoveDirection,
  } from "$lib/utils/device-movement";
  import { getStorageMode } from "$lib/storage";

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
  let settingsDialogOpen = $derived(dialogStore.isOpen("settings"));
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
  let deviceLibrarySheetOpen = $derived(
    dialogStore.isSheetOpen("deviceLibrary"),
  );
  let yamlEditorSheetOpen = $derived(dialogStore.isSheetOpen("yamlEditor"));
  let rackEditSheetOpen = $derived(dialogStore.isSheetOpen("rackEdit"));
  let layoutsSheetOpen = $derived(dialogStore.isSheetOpen("layouts"));
  let racksSheetOpen = $derived(dialogStore.isSheetOpen("racks"));
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
    const saved = shouldSaveToServer()
      ? await handleSaveToServer(true)
      : await handleSaveAsArchive();
    if (saved) {
      resetAndOpenNewRack();
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
        handleSaveToServer(true);
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

  function handleOpenCleanupDialog() {
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
        handleSaveToServer(true);
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
    // On mobile a device removal was triggered from the device-details bottom
    // sheet. handleDelete() closed the sheet so the confirm dialog would not
    // render behind it (#2490). If the device is still selected (cancel path),
    // reopen the sheet so the user can continue editing.
    if (viewportStore.isMobile && selectionStore.isDeviceSelected) {
      const activeRack = layoutStore.activeRack;
      if (activeRack) {
        const deviceIndex = selectionStore.getSelectedDeviceIndex(
          activeRack.devices,
        );
        if (deviceIndex !== null) {
          dialogStore.openSheet("deviceDetails", deviceIndex);
        }
      }
    } else {
      handleFitAll();
    }
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

  function handleYamlEditorClose() {
    dialogStore.close();
    handleFitAll();
  }

  function handleYamlEditorSheetClose() {
    dialogStore.closeSheet();
    handleFitAll();
  }

  function handleYamlApply(
    nextLayout: Layout,
    images?: ImageStoreMap,
    failedImagesCount = 0,
  ) {
    // Applying YAML edits the working copy; preserve export tracking
    // across loadLayout's reset so the chip state survives the apply.
    const backupState = {
      changesSinceExport: layoutStore.changesSinceExport,
      hasEverExported: layoutStore.hasEverExported,
    };
    layoutStore.loadLayout(nextLayout);
    layoutStore.restoreBackupState(backupState);
    layoutStore.markDirty();
    // Overlay any images decoded from the applied YAML (e.g. a pasted full
    // layout that carries an embedded images section). The panel shows
    // image-free YAML, so a structural edit carries no images and the existing
    // image store is preserved untouched.
    if (images && images.size > 0) {
      for (const [key, deviceImages] of images) {
        // Replace the whole key, not per-side: a paste that omits one side must
        // not leave the previously stored opposite-side image behind.
        imageStore.removeAllDeviceImages(key);
        if (deviceImages.front) {
          imageStore.setDeviceImage(key, "front", deviceImages.front);
        }
        if (deviceImages.rear) {
          imageStore.setDeviceImage(key, "rear", deviceImages.rear);
        }
      }
      // A pasted layout brings its own complete image set, so drop user images
      // orphaned by it (keys the applied layout no longer uses). Valid keys are
      // the layout's device-type slugs plus per-placement keys; image-free edits
      // skip this block and leave the store untouched.
      // getUsedDeviceTypeSlugs returns a fresh set we own, so we extend it in
      // place with per-placement keys rather than allocating another set.
      const usedImageKeys = layoutStore.getUsedDeviceTypeSlugs();
      const nextLayoutId = nextLayout.metadata?.id;
      for (const rack of nextLayout.racks) {
        for (const device of rack.devices) {
          usedImageKeys.add(
            nextLayoutId
              ? placementKey(nextLayoutId, device.id)
              : `placement-${device.id}`,
          );
        }
      }
      imageStore.cleanupOrphanedImages(usedImageKeys);
    }
    selectionStore.clearSelection();
    toastStore.showToast("YAML applied", "success");
    if (failedImagesCount > 0) {
      toastStore.showToast(
        `Applied with ${failedImagesCount} image${failedImagesCount > 1 ? "s" : ""} that couldn't be read`,
        "warning",
      );
    }

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

  // --- Settings handlers ---

  function handleSettingsClose() {
    // Only close if settings is still the open dialog. The Review action hands
    // off to the cleanup dialog by switching openDialog directly; guarding here
    // keeps a stray close from clobbering the dialog that just opened.
    if (dialogStore.isOpen("settings")) {
      dialogStore.close();
    }
  }

  // --- Add device handlers ---

  function handleAddDevice() {
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

  // The file picker lives here (the hidden <input> below), but the command
  // dispatch needs a module-level trigger. Register the picker opener on mount
  // so the palette, app menu, and keyboard all run import-devices through the
  // same seam (see $lib/actions/import-devices-trigger).
  $effect(() => registerImportDevicesTrigger(openDeviceImportPicker));

  function openDeviceImportPicker() {
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

      const message =
        result.skipped > 0
          ? `Imported ${result.devices.length} devices (${result.skipped} skipped)`
          : `Imported ${result.devices.length} ${result.devices.length === 1 ? "device" : "devices"}`;

      toastStore.showToast(message, result.skipped > 0 ? "warning" : "success");
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

  // --- Mobile selection inspector: registry-driven verbs ---

  // Build the live enabledWhen context from the stores, mirroring
  // VerbBarOverlay's desktop projection so mobile and desktop share one
  // source of truth for verb availability. readOnly gates all mutation verbs
  // through the registry, so no individual call site needs to check it.
  const mobileActionCtx = $derived<ActionEnabledContext>({
    hasSelection: selectionStore.hasSelection,
    isDeviceSelected: selectionStore.isDeviceSelected,
    isRackSelected: selectionStore.isRackSelected,
    canUndo: layoutStore.canUndo,
    canRedo: layoutStore.canRedo,
    hasRacks: layoutStore.rackCount > 0,
    mode: getStorageMode(),
    canMoveDeviceSlot: canMoveSelectedDeviceSlot(),
    readOnly: uiStore.readOnly,
  });

  // The rack and device index the mobile sheet is acting on. The bottom sheet
  // renders activeRack.devices[selectedDeviceForSheet], so the nudge controls
  // must validate against that same target.
  const mobileMoveTarget = $derived.by(() => {
    const rack = layoutStore.activeRack;
    if (!rack || selectedDeviceForSheet === null) return null;
    if (!rack.devices[selectedDeviceForSheet]) return null;
    return { rack, deviceIndex: selectedDeviceForSheet };
  });

  // The registry's enabledWhen for the move verbs only checks isDeviceSelected,
  // not whether the nudge would actually land (bounds plus neighbours). Resolve
  // the real collision-aware reachability here so the mobile Move Up / Move Down
  // controls disable when blocked, matching the desktop edit panel (#2453). The
  // shared registry-bound move handler is tracked separately (#2471).
  const mobileVerbs = $derived.by(() => {
    const verbs = getSelectionVerbsWithState(mobileActionCtx);
    const target = mobileMoveTarget;
    if (!target) return verbs;

    const upBlocked = !canMoveUp(
      target.rack,
      layoutStore.device_types,
      target.deviceIndex,
    );
    const downBlocked = !canMoveDown(
      target.rack,
      layoutStore.device_types,
      target.deviceIndex,
    );

    return verbs.map((verb) => {
      if (verb.id === "move-device-up") {
        return { ...verb, disabled: verb.disabled || upBlocked };
      }
      if (verb.id === "move-device-down") {
        return { ...verb, disabled: verb.disabled || downBlocked };
      }
      return verb;
    });
  });

  // Inline-edit handlers for the mobile inspector fields. They write through
  // the recorded layout-store mutators (undo/redo aware) against the same rack
  // and device index the bottom sheet is showing.
  function handleEditDeviceName(name: string): void {
    const rackId = layoutStore.activeRack?.id;
    if (rackId == null || selectedDeviceForSheet === null) return;
    layoutStore.updateDeviceName(
      rackId,
      selectedDeviceForSheet,
      name || undefined,
    );
  }

  function handleEditDeviceIp(ip: string): void {
    const rackId = layoutStore.activeRack?.id;
    if (rackId == null || selectedDeviceForSheet === null) return;
    layoutStore.updateDeviceIp(rackId, selectedDeviceForSheet, ip || undefined);
  }

  function handleEditDeviceNotes(notes: string): void {
    const rackId = layoutStore.activeRack?.id;
    if (rackId == null || selectedDeviceForSheet === null) return;
    layoutStore.updateDeviceNotes(
      rackId,
      selectedDeviceForSheet,
      notes || undefined,
    );
  }

  // Nudge the sheet's device one whole U, surfacing a toast when the move is
  // blocked instead of silently doing nothing (#2453). Reuses the shared
  // collision logic (findNextValidPosition) to decide, then defers the actual
  // recorded move to the shared selection handler so undo/redo still applies.
  function nudgeSelectedDevice(direction: MoveDirection): void {
    const target = mobileMoveTarget;
    if (!target) return;

    const result = findNextValidPosition(
      target.rack,
      layoutStore.device_types,
      target.deviceIndex,
      direction,
    );

    const blockedMessage = getMoveBlockedMessage(result, direction);
    if (blockedMessage) {
      toastStore.showToast(blockedMessage, "warning");
      return;
    }

    if (direction === 1) {
      moveSelectedDeviceUp();
    } else {
      moveSelectedDeviceDown();
    }
  }

  // Dispatch a registry verb by action id to the shared handler. The handlers
  // read live selection state from the stores, so they act on the same device
  // the mobile bottom sheet is showing. The readOnly guard here is defence-in-
  // depth: the registry's enabledWhen already disables all mutation verbs when
  // readOnly is set, and DeviceDetails hides the controls entirely, so this
  // path should not be reachable while locked. Belt-and-suspenders keeps it safe
  // even if a future refactor opens another route to this function.
  function handleMobileVerb(id: ActionId): void {
    if (uiStore.readOnly) return;
    switch (id) {
      case "move-device-up":
        nudgeSelectedDevice(1);
        break;
      case "move-device-down":
        nudgeSelectedDevice(-1);
        break;
      case "move-device-slot":
        moveSelectedDeviceToSlot();
        break;
      case "flip-device-face":
        flipSelectedDeviceFace();
        break;
      case "duplicate-selection":
        duplicateSelection();
        break;
      case "delete-selection":
        handleDelete();
        break;
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

  // The Layouts and Racks tabs open titled bottom sheets: Layouts switches the
  // active layout (#2460) and Racks lists racks and opens their properties
  // (#2461).
  function handleLayoutsTabClick() {
    dialogStore.openSheet("layouts");
  }

  function handleLayoutsSheetClose() {
    dialogStore.closeSheet();
  }

  // The Layouts sheet opens a fresh layout itself (via the workspace store) and
  // then asks the orchestrator to raise the New Rack wizard, mirroring the
  // desktop New layout flow.
  function handleLayoutsNewLayout() {
    dialogStore.open("newRack");
  }

  function handleRacksTabClick() {
    dialogStore.openSheet("racks");
  }

  function handleRacksSheetClose() {
    dialogStore.closeSheet();
  }

  // The Racks sheet raises the New Rack wizard, mirroring the desktop New rack
  // flow. The wizard's create handler places the rack and centres the canvas.
  function handleRacksNewRack() {
    dialogStore.open("newRack");
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
    // Tap-to-place is suppressed when the layout is locked for viewing.
    if (uiStore.readOnly) return;
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
    {@const deviceIp =
      typeof device.custom_fields?.ip === "string"
        ? device.custom_fields.ip
        : ""}
    <Dialog
      open={bottomSheetOpen}
      title={deviceType.model ?? "Device"}
      size="M"
      onclose={handleBottomSheetClose}
    >
      <DeviceDetails
        {device}
        {deviceType}
        rackView={activeRack.view}
        {rackHeight}
        showActions={true}
        readOnly={uiStore.readOnly}
        verbs={mobileVerbs}
        onaction={handleMobileVerb}
        ip={deviceIp}
        oneditname={handleEditDeviceName}
        oneditip={handleEditDeviceIp}
        oneditnotes={handleEditDeviceNotes}
      />
    </Dialog>
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
  layoutId={layoutStore.layout.metadata?.id}
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
  size="L"
  onclose={handleYamlEditorClose}
>
  <LayoutYamlPanel
    open={yamlEditorDialogOpen}
    layout={layoutStore.layout}
    onapply={handleYamlApply}
  />
</Dialog>

<HelpPanel open={helpPanelOpen} onclose={handleHelpClose} />

<SettingsDialog
  open={settingsDialogOpen}
  onclose={handleSettingsClose}
  onopencleanup={handleOpenCleanupDialog}
/>

<CleanupDialog open={cleanupDialogOpen} onclose={handleCleanupDialogClose} />

<LoadDialog />

<CommandPalette />

<!-- Mobile bottom navigation bar -->
<MobileBottomNav
  activeTab={layoutsSheetOpen
    ? "layouts"
    : racksSheetOpen
      ? "racks"
      : deviceLibrarySheetOpen
        ? "devices"
        : viewSheetOpen
          ? "view"
          : null}
  hidden={false}
  onlayoutsclick={handleLayoutsTabClick}
  onracksclick={handleRacksTabClick}
  ondevicesclick={handleDeviceLibraryTabClick}
  onviewclick={handleViewSheetClick}
/>

<!-- Layouts tab sheet: scaffold. #2460 populates the layout switcher body. -->
{#if viewportStore.isMobile && layoutsSheetOpen}
  <Dialog
    open={layoutsSheetOpen}
    title="Layouts"
    size="M"
    onclose={handleLayoutsSheetClose}
  >
    <MobileLayoutsSheet
      onnewlayout={handleLayoutsNewLayout}
      onclose={handleLayoutsSheetClose}
    />
  </Dialog>
{/if}

<!-- Racks tab sheet: lists racks and opens their properties (#2461). -->
{#if viewportStore.isMobile && racksSheetOpen}
  <Dialog
    open={racksSheetOpen}
    title="Racks"
    size="M"
    onclose={handleRacksSheetClose}
  >
    <MobileRacksSheet
      onnewrack={handleRacksNewRack}
      onclose={handleRacksSheetClose}
    />
  </Dialog>
{/if}

{#if viewportStore.isMobile && yamlEditorSheetOpen}
  <Dialog
    open={yamlEditorSheetOpen}
    title="Layout YAML"
    size="L"
    onclose={handleYamlEditorSheetClose}
  >
    <LayoutYamlPanel
      open={yamlEditorSheetOpen}
      layout={layoutStore.layout}
      onapply={handleYamlApply}
    />
  </Dialog>
{/if}

{#if viewportStore.isMobile && viewSheetOpen}
  <Dialog
    open={viewSheetOpen}
    title="View"
    size="M"
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
  </Dialog>
{/if}

{#if viewportStore.isMobile && deviceLibrarySheetOpen}
  <Dialog
    open={deviceLibrarySheetOpen}
    title="Device Library"
    size="M"
    onclose={handleDeviceLibrarySheetClose}
  >
    <DevicePalette
      ondeviceselect={handleMobileDeviceSelect}
      oncreatedevice={handleAddDevice}
    />
  </Dialog>
{/if}

<!-- Mobile rack edit sheet (opened via long press on rack) -->
{#if viewportStore.isMobile && rackEditSheetOpen && layoutStore.activeRack}
  <Dialog
    open={rackEditSheetOpen}
    title="Edit Rack"
    size="M"
    onclose={handleRackEditSheetClose}
  >
    <RackEditSheet
      rack={layoutStore.activeRack}
      onclose={handleRackEditSheetClose}
    />
  </Dialog>
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

<!--
  Placement outcome SR announcer (#2473).
  Assertive live region announces placement transitions (placed, cancelled).
  The PlacementIndicator banner already covers the active-placing state via a
  polite region; this assertive region interrupts immediately when placement ends.
  No explicit role: role="alert" would redundantly duplicate aria-live="assertive"
  and could trigger axe-core's redundant-role rule. The region is always in the
  DOM so assistive technology registers it before any content arrives.
-->
<div
  aria-live="assertive"
  aria-atomic="true"
  class="sr-only"
  data-testid="placement-sr-announcer"
>
  {placementStore.placementAnnouncement ?? ""}
</div>
