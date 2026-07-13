/**
 * Centralized dialog state management
 *
 * Provides a single source of truth for all dialog/sheet open states.
 * Handlers live in DialogOrchestrator.svelte (dialog/sheet UI) and App.svelte (triggers).
 * The $lib/storage manager also opens the load dialog, and $lib/utils/app-actions
 * opens the cleanupPrompt, export, and share dialogs.
 *
 * Only one dialog can be open at a time (enforced by using single openDialog state).
 * Sheets (mobile bottom sheets) use a separate state since they coexist with dialogs.
 */

import { getToastStore } from "./toast.svelte";

export type DialogId =
  | "addDevice"
  | "confirmDelete"
  | "export"
  | "share"
  | "help"
  | "settings"
  | "importNetBox"
  | "confirmReplace"
  | "cleanupDialog"
  | "cleanupPrompt"
  | "yamlEditor"
  | "load"
  | "commandPalette";

export type SheetId =
  | "deviceDetails"
  | "deviceLibrary"
  | "rackEdit"
  | "layouts"
  | "racks"
  | "view"
  | "yamlEditor";

export interface DeleteTarget {
  /**
   * Racks are the only target the confirm-delete dialog gates now; device
   * removal is immediate with an undo toast instead (#2993). The literal type
   * is kept (rather than dropped) so a future second confirm-gated target
   * type doesn't need every call site re-touched.
   */
  type: "rack";
  name: string;
  /**
   * Rack identity captured at dialog-open time (#2918). Confirming the
   * dialog must act on this snapshot, not the live selectionStore, so a
   * selection change between open and confirm can't delete a different
   * rack than the one named in the dialog.
   */
  rackId: string;
}

// Dialog state
let openDialog = $state<DialogId | null>(null);
let deleteTarget = $state<DeleteTarget | null>(null);
let exportQrCodeDataUrl = $state<string | undefined>(undefined);
/** Pre-selected rack IDs for export dialog (from context menu) */
let exportSelectedRackIds = $state<string[] | undefined>(undefined);
/** Pending operation that triggered cleanup prompt (save or export) */
let pendingCleanupOperation = $state<"save" | "saveAs" | "export" | null>(null);

// Mobile sheet state
let openSheet = $state<SheetId | null>(null);
let selectedDeviceIndex = $state<number | null>(null);

/**
 * Open a dialog by ID. Closes any other open dialog and any open sheet so
 * dialogs always render without a sheet underneath them. On mobile this
 * prevents the device-details bottom sheet from occluding a confirm dialog
 * that opens on top of it (#2490).
 *
 * Also dismisses any toast currently on screen (#3004/R27a): a toast left
 * over from a prior action (e.g. "Device duplicated") must never linger and
 * cover this dialog's controls, including a destructive confirm's Cancel
 * button. This only fires once, at the open transition, so a toast raised by
 * an action taken inside this dialog after it opens (e.g. Share's "Link
 * copied") is unaffected.
 */
function open(id: DialogId) {
  getToastStore().clearAllToasts();
  openSheet = null;
  selectedDeviceIndex = null;
  openDialog = id;
}

/**
 * Close the current dialog and reset associated state.
 */
function close() {
  openDialog = null;
  deleteTarget = null;
  exportQrCodeDataUrl = undefined;
  exportSelectedRackIds = undefined;
  pendingCleanupOperation = null;
}

/**
 * Check if a specific dialog is currently open.
 */
function isOpen(id: DialogId): boolean {
  return openDialog === id;
}

/**
 * Open a mobile sheet by ID.
 */
function openSheetById(id: SheetId, deviceIndex?: number) {
  openSheet = id;
  if (deviceIndex !== undefined) {
    selectedDeviceIndex = deviceIndex;
  }
}

/**
 * Close the current mobile sheet.
 */
function closeSheet() {
  openSheet = null;
  selectedDeviceIndex = null;
}

/**
 * Check if a specific sheet is currently open.
 */
function isSheetOpen(id: SheetId): boolean {
  return openSheet === id;
}

// Export the dialog store
export const dialogStore = {
  // Dialog state getters
  get openDialog() {
    return openDialog;
  },
  get deleteTarget() {
    return deleteTarget;
  },
  set deleteTarget(value: DeleteTarget | null) {
    deleteTarget = value;
  },
  get exportQrCodeDataUrl() {
    return exportQrCodeDataUrl;
  },
  set exportQrCodeDataUrl(value: string | undefined) {
    exportQrCodeDataUrl = value;
  },
  get exportSelectedRackIds() {
    return exportSelectedRackIds;
  },
  set exportSelectedRackIds(value: string[] | undefined) {
    exportSelectedRackIds = value;
  },
  get pendingCleanupOperation() {
    return pendingCleanupOperation;
  },
  set pendingCleanupOperation(value: "save" | "saveAs" | "export" | null) {
    pendingCleanupOperation = value;
  },

  // Dialog actions
  open,
  close,
  isOpen,

  // Sheet state getters
  get currentSheet() {
    return openSheet;
  },
  get selectedDeviceIndex() {
    return selectedDeviceIndex;
  },
  set selectedDeviceIndex(value: number | null) {
    selectedDeviceIndex = value;
  },

  // Sheet actions
  openSheet: openSheetById,
  closeSheet,
  isSheetOpen,
};
