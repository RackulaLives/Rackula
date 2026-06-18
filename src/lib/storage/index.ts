/**
 * Storage interface
 * Single entry point for persistence: API availability detection, the API
 * client, the localStorage working copy, the load pipeline, and the save
 * manager. Modules inside this directory import each other by relative
 * path; everything else imports from $lib/storage.
 */
export {
  initializePersistence,
  isApiAvailable,
  getApiAvailableState,
  getApiEverReached,
  resetAvailabilityState,
  setApiAvailable,
  probeServerForBrowserHint,
  getStorageMode,
  type StorageMode,
} from "./availability.svelte";
export {
  listSavedLayouts,
  loadSavedLayout,
  deleteSavedLayout,
  listSnapshots,
  PersistenceError,
  getServerInstanceLabel,
  type SavedLayoutItem,
  type SnapshotItem,
} from "./api";
export {
  loadSessionWithTimestamp,
  clearSession,
  isServerNewer,
  detectModeFlip,
  type ModeFlip,
} from "./working-copy";
export {
  finalizeLayoutLoad,
  loadFromApi,
  loadFromFile,
  restoreFromSnapshot,
} from "./load-pipeline";
export {
  handleLoad,
  handleSaveToServer,
  handleSaveAsArchive,
  handleExportAll,
  shouldSaveToServer,
  initPersistenceEffects,
  flushSessionSave,
  getStorageChipState,
  type SaveStatus,
  isSessionSavePending,
  isServerSavePending,
} from "./manager.svelte";
export { shouldWarnBeforeUnload, type UnloadRiskState } from "./unload-risk";
export { getServerBaseUpdatedAt, setServerBaseUpdatedAt } from "./server-base";
export { uploadSnapshot } from "./api";
export {
  reconcileSession,
  applyReconcile,
  type ReconcileAction,
  type ReconcileDeps,
} from "./reconcile";
export {
  computeLayoutStatus,
  computeServerHint,
  getLayoutDurability,
  rollupDurabilities,
  type DurabilityStatus,
  type DurabilityKind,
  type LayoutDurability,
} from "./durability.svelte";
export {
  loadWorkspaceIndex,
  saveWorkspaceIndex,
  loadLayoutBody,
  saveLayoutBody,
  deleteLayoutBody,
  hasEverHadLayouts,
  markEverHadLayouts,
  adoptLegacyAutosave,
  type WorkspaceIndex,
  type LibraryEntry,
  type LayoutBodyResult,
} from "./browser-workspace";
export { resolveBrowserLaunch, type BrowserLaunch } from "./browser-launch";
export {
  persistBrowserWorkspace,
  type PersistTab,
} from "./browser-workspace-persist";
export {
  getTwinTabGuard,
  setForeignWriteNotifier,
  type TwinTabGuard,
} from "./twin-tab-guard";
export {
  adaptLegacyLayout,
  CARRIER_2COL_SLUG,
  CARRIER_2X2_SLUG,
} from "./adapt-legacy-layout";
export {
  ensurePreCarrierBackup,
  hasPreCarrierBackup,
  restorePreCarrierBackup,
  discardPreCarrierBackup,
} from "./pre-carrier-backup";
