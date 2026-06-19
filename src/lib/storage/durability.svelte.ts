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

import { getStorageChipState, type SaveStatus } from "./manager.svelte";
import {
  getApiAvailableState,
  getApiEverReached,
  isServerReachableInBrowser,
  getStorageMode,
  type StorageMode,
} from "./availability.svelte";
import type { LayoutStore } from "$lib/stores/layout.svelte";

const MAX_SAVE_FAILURES = 3;

export type DurabilityStatus = "saved" | "pending" | "error";

/**
 * A finer-grained discriminator than the three-value status (which only drives
 * the icon and colour). The chip and popover read kind to pick copy, in
 * particular to split the two server-mode error classes #2063 surfaces:
 * "offline" (reached then lost, the transient-outage drop-toast case) from
 * "server-not-found" (server mode but the API never answered, a broken
 * deployment).
 */
export type DurabilityKind =
  | "saved"
  | "pending"
  | "offline"
  | "server-not-found";

export interface LayoutDurability {
  status: DurabilityStatus;
  kind: DurabilityKind;
  mode: StorageMode;
  changesSinceExport: number;
  hasEverExported: boolean;
  isHealthy: boolean;
  label: string;
  detail: string;
  icon: DurabilityStatus;
  /**
   * Browser-mode misconfiguration signal: a server is reachable while this
   * instance stores layouts in the browser. Surfaced as a passive popover line
   * only, never a toast, and never changes the status/label/kind.
   */
  serverHint: boolean;
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
  apiEverReached: boolean,
): {
  status: DurabilityStatus;
  kind: DurabilityKind;
  label: string;
  detail: string;
  icon: DurabilityStatus;
} {
  if (storageMode === "browser") {
    // Durable iff exported AND no edits since. The hasEverExported guard is
    // critical: a never-exported cold start has changesSinceExport === 0 yet is
    // not durable. Browser mode never reads saveStatus / apiAvailable for the
    // status: a reachable server is only a passive popover hint (computeServerHint).
    if (changesSinceExport === 0 && hasEverExported) {
      return {
        status: "saved",
        kind: "saved",
        label: "Saved",
        detail: "Stored in this browser",
        icon: "saved",
      };
    }
    return {
      status: "pending",
      kind: "pending",
      label: "Unsaved changes",
      detail: "Stored in this browser",
      icon: "pending",
    };
  }

  // Server mode, ordered most-severe first.
  if (consecutiveSaveFailures >= MAX_SAVE_FAILURES) {
    // The breaker only opens after save attempts, which require a reachable
    // server, so this is always reached-then-lost: the transient-outage class,
    // not a never-reached misconfiguration.
    return {
      status: "error",
      kind: "offline",
      label: "Server unavailable",
      detail: "Working from your browser; reload to retry.",
      icon: "error",
    };
  }
  if (apiAvailable === null) {
    return {
      status: "pending",
      kind: "pending",
      label: "Checking connection",
      detail: "Looking for the server.",
      icon: "pending",
    };
  }
  if (apiAvailable === false) {
    // Split the two failure classes #2063 surfaces. Never reached since load is
    // a broken deployment (frontend-only install declared server mode, or the
    // API container is not running); reached then lost is a transient outage the
    // drop toast already covers. Fail honest: only call it an outage once the
    // server has genuinely answered.
    if (apiEverReached) {
      return {
        status: "error",
        kind: "offline",
        label: "Offline",
        detail: "Working from your browser; reload to retry.",
        icon: "error",
      };
    }
    return {
      status: "error",
      kind: "server-not-found",
      label: "Server not found",
      detail:
        "Check that the API container is running and RACKULA_STORAGE_MODE matches the deployment.",
      icon: "error",
    };
  }
  if (saveStatus === "error") {
    return {
      status: "error",
      kind: "offline",
      label: "Save error",
      detail: "The last save did not go through.",
      icon: "error",
    };
  }
  if (saveStatus === "saving") {
    return {
      status: "pending",
      kind: "pending",
      label: "Saving",
      detail: "Saving to server.",
      icon: "pending",
    };
  }
  if (saveStatus === "saved") {
    return {
      status: "saved",
      kind: "saved",
      label: "Saved",
      detail: "Saved to server",
      icon: "saved",
    };
  }
  return {
    status: "pending",
    kind: "pending",
    label: "Pending save",
    detail: "Saving to server.",
    icon: "pending",
  };
}

/**
 * Browser-mode misconfiguration probe: true when storage is browser yet a server
 * answered the dedicated browser-mode probe (serverReachableInBrowser). Pure so it
 * unit-tests without DOM. The hint is passive (popover only, never a toast) and
 * never feeds the durability status; it only tells the user a server is one header
 * away. In server mode a reachable server is the expected state, so there is never
 * a hint there.
 */
export function computeServerHint(
  storageMode: StorageMode,
  serverReachableInBrowser: boolean,
): boolean {
  return storageMode === "browser" && serverReachableInBrowser;
}

/**
 * Reactive durability for a layout store. Returns an object whose property reads
 * pull live reactive state (mirroring getStorageChipState's getter-object
 * idiom), so a component that reads these properties inside a reactive context
 * stays in sync as save state, API availability, or export state change. Do not
 * destructure: that snapshots the values and breaks reactivity.
 */
export function getLayoutDurability(
  layoutStore: LayoutStore,
): LayoutDurability {
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
      getApiEverReached(),
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
    get kind(): DurabilityKind {
      return compute().kind;
    },
    get isHealthy(): boolean {
      return this.status !== "error";
    },
    get label(): string {
      return compute().label;
    },
    get detail(): string {
      return compute().detail;
    },
    get icon(): DurabilityStatus {
      return compute().icon;
    },
    get serverHint(): boolean {
      return computeServerHint(getStorageMode(), isServerReachableInBrowser());
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
      kind: "saved",
      mode: getStorageMode(),
      changesSinceExport: 0,
      hasEverExported: false,
      isHealthy: true,
      label: "All saved",
      detail: "",
      icon: "saved",
      serverHint: false,
    };
  }
  return worst;
}
