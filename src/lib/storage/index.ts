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
  setApiAvailable,
  hasEverConnectedToApi,
} from "./availability.svelte";
export {
  listSavedLayouts,
  loadSavedLayout,
  deleteSavedLayout,
  PersistenceError,
  type SavedLayoutItem,
} from "./api";
export {
  loadSessionWithTimestamp,
  clearSession,
  isServerNewer,
} from "./working-copy";
export { loadFromApi, loadFromFile } from "./load-pipeline";
export {
  handleLoad,
  handleSaveToServer,
  handleSaveAsArchive,
  shouldSaveToServer,
  initPersistenceEffects,
  flushSessionSave,
  isSessionSavePending,
  isServerSavePending,
} from "./manager.svelte";
export { shouldWarnBeforeUnload, type UnloadRiskState } from "./unload-risk";
