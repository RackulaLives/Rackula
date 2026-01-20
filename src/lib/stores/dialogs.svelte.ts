/**
 * Centralized dialog state management
 *
 * Provides a single source of truth for all dialog/sheet open states.
 * Handlers remain in App.svelte as they require access to other stores.
 *
 * Only one dialog can be open at a time (enforced by using single openDialog state).
 * Sheets (mobile bottom sheets) use a separate state since they coexist with dialogs.
 */

export type DialogId =
  | "newRack"
  | "addDevice"
  | "confirmDelete"
  | "export"
  | "share"
  | "help"
  | "importNetBox"
  | "confirmReplace"
  | "cleanupDialog"
  | "cleanupPrompt";

export type SheetId = "deviceDetails" | "deviceLibrary" | "rackEdit";

export interface DeleteTarget {
  type: "rack" | "device";
  name: string;
}

// Dialog state
let openDialog = $state<DialogId | null>(null);
let deleteTarget = $state<DeleteTarget | null>(null);
let pendingSaveFirst = $state(false);
let exportQrCodeDataUrl = $state<string | undefined>(undefined);
/** Pre-selected rack IDs for export dialog (from context menu) */
let exportSelectedRackIds = $state<string[] | undefined>(undefined);
/** Pending operation that triggered cleanup prompt (save or export) */
let pendingCleanupOperation = $state<"save" | "export" | null>(null);

// Mobile sheet state
let openSheet = $state<SheetId | null>(null);
let selectedDeviceIndex = $state<number | null>(null);

/**
 * Open a dialog by ID. Closes any other open dialog.
 */
function open(id: DialogId) {
  openDialog = id;
}

/**
 * Close the current dialog and reset associated state.
 */
function close() {
  openDialog = null;
  deleteTarget = null;
  pendingSaveFirst = false;
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
  get pendingSaveFirst() {
    return pendingSaveFirst;
  },
  set pendingSaveFirst(value: boolean) {
    pendingSaveFirst = value;
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
  set pendingCleanupOperation(value: "save" | "export" | null) {
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
