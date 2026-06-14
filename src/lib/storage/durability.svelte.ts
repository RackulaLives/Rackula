/**
 * Layout durability: the single source of truth for storage status.
 *
 * Every storage-status surface (the toolbar chip today; the multi-layout tab
 * dots #2079 and sidebar #2082 tomorrow) derives its state from here and
 * nowhere else. The status formula lives in one pure function so it can be unit
 * tested and reused without DOM.
 *
 * This module lives in storage/ (not stores/layout/persistence.ts) on purpose:
 * it reads the persistence manager, which would create a manager <-> persistence
 * import cycle if the formula lived in the store layer.
 */

import {
  getStorageChipState,
  type SaveStatus,
} from "./manager.svelte";
import {
  getApiAvailableState,
  getStorageMode,
  type StorageMode,
} from "./availability.svelte";
import type { LayoutStore } from "$lib/stores/layout.svelte";

const MAX_SAVE_FAILURES = 3;

export type DurabilityStatus = "saved" | "pending" | "error";

export interface LayoutDurability {
  status: DurabilityStatus;
  mode: StorageMode;
  changesSinceExport: number;
  hasEverExported: boolean;
  isHealthy: boolean;
  label: string;
  icon: DurabilityStatus;
}

/**
 * The status formula. Pure: same inputs always yield the same status/label/icon,
 * with no reads of module state. This is the only place that decides what
 * "durable" means.
 *
 * Browser mode treats the local file export as the durability boundary: a layout
 * is durable only when it has been exported and nothing has changed since.
 * Server mode treats the server save as the boundary: changesSinceExport is
 * reset only on export (not on a server save), so server mode never reads it.
 */
export function computeLayoutStatus(
  saveStatus: SaveStatus,
  consecutiveSaveFailures: number,
  storageMode: StorageMode,
  apiAvailable: boolean | null,
  changesSinceExport: number,
  hasEverExported: boolean,
): { status: DurabilityStatus; label: string; icon: DurabilityStatus } {
  if (storageMode === "browser") {
    // Durable iff exported AND no edits since. The hasEverExported guard is
    // critical: a never-exported cold start has changesSinceExport === 0 yet is
    // not durable. Browser mode never reads saveStatus / apiAvailable.
    if (changesSinceExport === 0 && hasEverExported) {
      return { status: "saved", label: "Saved", icon: "saved" };
    }
    return { status: "pending", label: "Unsaved changes", icon: "pending" };
  }

  // Server mode, ordered most-severe first.
  if (consecutiveSaveFailures >= MAX_SAVE_FAILURES) {
    return { status: "error", label: "Server unavailable", icon: "error" };
  }
  if (apiAvailable === null) {
    return { status: "pending", label: "Checking connection", icon: "pending" };
  }
  if (apiAvailable === false) {
    return { status: "error", label: "Offline", icon: "error" };
  }
  if (saveStatus === "error") {
    return { status: "error", label: "Save error", icon: "error" };
  }
  if (saveStatus === "saving") {
    return { status: "pending", label: "Saving", icon: "pending" };
  }
  if (saveStatus === "saved") {
    return { status: "saved", label: "Saved", icon: "saved" };
  }
  return { status: "pending", label: "Pending save", icon: "pending" };
}

/**
 * Reactive durability for a layout store. Returns an object whose property reads
 * pull live reactive state (mirroring getStorageChipState's getter-object
 * idiom), so a component that reads these properties inside a reactive context
 * stays in sync as save state, API availability, or export state change. Do not
 * destructure: that snapshots the values and breaks reactivity.
 */
export function getLayoutDurability(layoutStore: LayoutStore): LayoutDurability {
  // Per-layout export tracking comes from the passed store (each layout owns its
  // own changesSinceExport / hasEverExported, ready for the multi-layout
  // workspace #2017). Save state and the failure circuit breaker come from the
  // persistence manager, which tracks the active save today.
  const chip = getStorageChipState();
  const compute = () =>
    computeLayoutStatus(
      chip.saveStatus,
      chip.consecutiveSaveFailures,
      getStorageMode(),
      getApiAvailableState(),
      layoutStore.changesSinceExport,
      layoutStore.hasEverExported,
    );
  return {
    get mode(): StorageMode {
      return getStorageMode();
    },
    get changesSinceExport(): number {
      return layoutStore.changesSinceExport;
    },
    get hasEverExported(): boolean {
      return layoutStore.hasEverExported;
    },
    get status(): DurabilityStatus {
      return compute().status;
    },
    get isHealthy(): boolean {
      return this.status !== "error";
    },
    get label(): string {
      return compute().label;
    },
    get icon(): DurabilityStatus {
      return compute().icon;
    },
  };
}

/**
 * Worst-wins rollup over many layouts (forward-compat for multi-layout tab dots
 * #2079 and sidebar #2082): a single error or pending child surfaces at the
 * workspace level. An empty workspace is "All saved". There is one active layout
 * today, so this is exercised by tests rather than the live UI.
 */
export function rollupDurabilities(
  durabilities: LayoutDurability[],
): LayoutDurability {
  const SEVERITY: Record<DurabilityStatus, number> = {
    saved: 0,
    pending: 1,
    error: 2,
  };
  const worst = durabilities.reduce<LayoutDurability | null>((acc, d) => {
    if (!acc || SEVERITY[d.status] > SEVERITY[acc.status]) return d;
    return acc;
  }, null);

  if (!worst) {
    return {
      status: "saved",
      mode: getStorageMode(),
      changesSinceExport: 0,
      hasEverExported: false,
      isHealthy: true,
      label: "All saved",
      icon: "saved",
    };
  }
  return worst;
}
