# Storage Server Opt-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the dev environment to server mode, and add a one-click opt-in so that when the app runs in browser mode while a storage server is reachable, the user can upload their work and switch to server mode.

**Architecture:** Storage mode stays declarative (`getStorageMode()` reads `window.__RACKULA_CONFIG__.storage`). We add a localStorage opt-in override that can only upgrade browser to server, never downgrade a config-declared server deployment. The switch uploads the active browser layout to the server via the existing `saveLayoutToServer`, sets the override, and reloads the page so the app boots cleanly in server mode. A dismissible banner and a chip attention state surface the offer; the existing `serverReachableInBrowser` probe (#2063) is the trigger.

**Tech Stack:** Svelte 5 runes, TypeScript strict, Vitest (happy-dom), existing storage module under `src/lib/storage`.

## Global Constraints

- Svelte 5 runes only (`$state`, `$derived`, `$effect`). No Svelte 4 stores.
- TypeScript strict mode.
- User-facing copy: no em dashes, en dashes, or smart quotes; no emoji; no bold inside list items (bold only for column headers and UI labels); be succinct.
- Test ESLint hard-blocks: no `querySelector()`/DOM-node access in tests, no `toHaveClass()`, no `toHaveLength(literal)`, no hardcoded colour assertions. Test behaviour, not rendering.
- The override only ever upgrades browser to server. A config value of exactly `"server"` is the source of truth and is never overridden down.
- Non-destructive: switching never deletes browser localStorage data. Uploads are copies.
- Run a single test file with `npm run test:run -- <path>`.
- Every commit uses `git commit -s` (DCO) and ends with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.
- Work happens in the existing worktree at `.worktree/Rackula-storage-server-opt-in` on branch `feat/storage-server-opt-in`.

---

### Task 1: Restore dev to server mode and fix stale deployment docs

This is the standalone fix for the reported symptom. It does not depend on any other task and can ship first.

**Files:**

- Modify: `.github/workflows/deploy-dev.yml` (the generated `.env` heredoc, around lines 152-160)
- Modify: `CLAUDE.md` (Deployment table and "Dev Deployment" prose)
- Modify: `docs/ARCHITECTURE.md` (dev deployment description)
- Modify: `docs/reference/SPEC.md` (only if it describes dev as static GitHub Pages)

**Interfaces:**

- Consumes: nothing.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the storage-mode env var to the dev deploy**

In `.github/workflows/deploy-dev.yml`, inside the `cat > /opt/rackula/rackula-dev/.env << 'EOF'` heredoc, add one line alongside the existing vars:

```
RACKULA_STORAGE_MODE=server
```

The block should read (existing lines plus the new one):

```
RACKULA_PORT=127.0.0.1:8081
RACKULA_IMAGE=ghcr.io/rackulalives/rackula:main
RACKULA_API_IMAGE=ghcr.io/rackulalives/rackula-api:main
RACKULA_CONTAINER_NAME=rackula-dev
RACKULA_API_CONTAINER_NAME=rackula-api-dev
CORS_ORIGIN=https://d.racku.la
ALLOW_INSECURE_CORS=false
RACKULA_STORAGE_MODE=server
```

- [ ] **Step 2: Fix the stale dev-is-GitHub-Pages references in the docs**

Find every stale claim that dev is GitHub Pages / static-only:

Run: `grep -rn "GitHub Pages" CLAUDE.md docs/ARCHITECTURE.md docs/reference/SPEC.md`

In `CLAUDE.md`, the Deployment table row for Dev currently reads Infrastructure "GitHub Pages". Change the Dev row Infrastructure cell to `VPS (Docker)` so it matches prod's hosting model (dev still triggers on push to `main`; prod on tag). Update the "Dev Deployment" prose that says it deploys to GitHub Pages so it states: dev builds and pushes the web and API Docker images and deploys them via docker-compose to the self-hosted VPS (`d.racku.la`), running in server mode. Keep edits surgical: change only the stale sentences and the table cell, do not reflow surrounding paragraphs.

In `docs/ARCHITECTURE.md`, update the dev deployment description (the `dev.racku.la` / GitHub Pages section) to: a Docker web-plus-API stack on the self-hosted VPS, deployed by `.github/workflows/deploy-dev.yml` on push to `main`, running in server mode (`RACKULA_STORAGE_MODE=server`).

In `docs/reference/SPEC.md`, only if a passage states dev is static GitHub Pages, correct it the same way. The general Static vs Persist "Deployment Modes" table is accurate and stays.

- [ ] **Step 3: Verify no stale references remain**

Run: `grep -rn "GitHub Pages" CLAUDE.md docs/ARCHITECTURE.md docs/reference/SPEC.md` Expected: no line still claims dev is hosted on GitHub Pages. (Other historical mentions, if any, that are not about the current dev deployment may remain; the dev deployment must read as VPS Docker server mode.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy-dev.yml CLAUDE.md docs/ARCHITECTURE.md docs/reference/SPEC.md
git commit -s -m "fix: run dev in server mode and correct stale dev-deploy docs

Dev deploys the web+API Docker stack to the self-hosted VPS but the
generated .env never set RACKULA_STORAGE_MODE, so the entrypoint
defaulted the frontend to browser mode while the API ran unused. Set
it to server, and fix docs that still describe dev as GitHub Pages.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Storage-mode override and precedence resolver

Adds the localStorage opt-in override and extends `getStorageMode()` with the upgrade-only precedence rule. Pure logic, tested first.

**Files:**

- Modify: `src/lib/storage/availability.svelte.ts`
- Test: `src/tests/storage-mode-override.test.ts` (new)

**Interfaces:**

- Consumes: existing `getStorageMode()`, `StorageMode` from `availability.svelte.ts`.
- Produces (later tasks rely on these exact signatures):
  - `getStorageModeOverride(): "server" | null`
  - `setStorageModeOverride(): void` (sets the override to server)
  - `clearStorageModeOverride(): void`
  - `isStorageModeFromOverride(): boolean` (true when config is not `"server"` but the override is active and currently in effect)
  - `getStorageMode(): StorageMode` (unchanged signature, new precedence)

- [ ] **Step 1: Write the failing tests**

Create `src/tests/storage-mode-override.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getStorageMode,
  getStorageModeOverride,
  setStorageModeOverride,
  clearStorageModeOverride,
  isStorageModeFromOverride,
} from "$lib/storage/availability.svelte";

/**
 * The override may only upgrade browser to server. A config value of exactly
 * "server" is the source of truth and is never overridden down.
 */
describe("storage-mode override precedence", () => {
  const original = window.__RACKULA_CONFIG__;

  beforeEach(() => {
    clearStorageModeOverride();
  });

  afterEach(() => {
    window.__RACKULA_CONFIG__ = original;
    clearStorageModeOverride();
  });

  it("config server resolves to server with no override", () => {
    window.__RACKULA_CONFIG__ = { storage: "server" };
    expect(getStorageMode()).toBe("server");
    expect(isStorageModeFromOverride()).toBe(false);
  });

  it("config browser with no override resolves to browser", () => {
    window.__RACKULA_CONFIG__ = { storage: "browser" };
    expect(getStorageMode()).toBe("browser");
    expect(isStorageModeFromOverride()).toBe(false);
  });

  it("override upgrades browser config to server", () => {
    window.__RACKULA_CONFIG__ = { storage: "browser" };
    setStorageModeOverride();
    expect(getStorageModeOverride()).toBe("server");
    expect(getStorageMode()).toBe("server");
    expect(isStorageModeFromOverride()).toBe(true);
  });

  it("override never downgrades a config-declared server deployment", () => {
    window.__RACKULA_CONFIG__ = { storage: "server" };
    setStorageModeOverride();
    expect(getStorageMode()).toBe("server");
    // The mode came from config, not the override.
    expect(isStorageModeFromOverride()).toBe(false);
  });

  it("clearing the override returns browser config to browser", () => {
    window.__RACKULA_CONFIG__ = { storage: "browser" };
    setStorageModeOverride();
    clearStorageModeOverride();
    expect(getStorageModeOverride()).toBe(null);
    expect(getStorageMode()).toBe("browser");
    expect(isStorageModeFromOverride()).toBe(false);
  });

  it("ignores an unknown override value", () => {
    window.__RACKULA_CONFIG__ = { storage: "browser" };
    localStorage.setItem("Rackula:storage-mode-override", "bogus");
    expect(getStorageModeOverride()).toBe(null);
    expect(getStorageMode()).toBe("browser");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- src/tests/storage-mode-override.test.ts` Expected: FAIL with import errors (the new functions are not exported yet).

- [ ] **Step 3: Implement the override and precedence**

In `src/lib/storage/availability.svelte.ts`, add a storage key constant near the top (after the imports) and the override accessors, and extend `getStorageMode()`. Replace the existing `getStorageMode` body:

```typescript
const STORAGE_MODE_OVERRIDE_KEY = "Rackula:storage-mode-override";

/**
 * Read the user opt-in override. Returns "server" only when the stored value is
 * exactly "server"; any other or missing value is null (no override).
 */
export function getStorageModeOverride(): "server" | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_MODE_OVERRIDE_KEY) === "server"
      ? "server"
      : null;
  } catch {
    return null;
  }
}

/** Opt this browser into server mode. Only ever upgrades browser to server. */
export function setStorageModeOverride(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_MODE_OVERRIDE_KEY, "server");
  } catch {
    // Quota or unavailable storage: the switch handler re-checks and surfaces.
  }
}

/** Remove the opt-in override, returning a browser deployment to browser mode. */
export function clearStorageModeOverride(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_MODE_OVERRIDE_KEY);
  } catch {
    // Nothing to do; a failed remove leaves the prior mode in place.
  }
}

/**
 * True when the resolved server mode comes from the user override rather than
 * the deployment config. Drives the reverse "switch back to browser" affordance,
 * which must never appear on a deployment that declares server mode in config.
 */
export function isStorageModeFromOverride(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__RACKULA_CONFIG__?.storage === "server") return false;
  return getStorageModeOverride() === "server";
}
```

Then change `getStorageMode()` to:

```typescript
export function getStorageMode(): StorageMode {
  if (typeof window === "undefined") return "browser";
  // Config declaring server is the source of truth; never overridden down.
  if (window.__RACKULA_CONFIG__?.storage === "server") return "server";
  // Config is browser or absent: honour a user opt-in upgrade to server.
  if (getStorageModeOverride() === "server") return "server";
  return "browser";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/tests/storage-mode-override.test.ts` Expected: PASS (all six tests).

- [ ] **Step 5: Run the existing storage-mode tests to confirm no regression**

Run: `npm run test:run -- src/tests/storage-mode.test.ts src/tests/persistence-manager-mode.test.ts` Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/availability.svelte.ts src/tests/storage-mode-override.test.ts
git commit -s -m "feat: add upgrade-only storage-mode override

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Switch-to-server handler (upload active layout, set override)

The logic the banner calls. Uploads the active browser layout to the server (matching `exportAllBrowser`'s active-layout scope), sets the override on success, and reports a result. It does not reload; the caller reloads when `switched` is true, so this stays unit-testable.

**Files:**

- Create: `src/lib/storage/server-opt-in.svelte.ts`
- Test: `src/tests/server-opt-in.test.ts` (new)

**Interfaces:**

- Consumes:
  - `setStorageModeOverride()` from `availability.svelte.ts` (Task 2)
  - `checkApiHealth()` from `api.ts`: `() => Promise<boolean>`
  - `saveLayoutToServer(layout, userImages, lastKnownUpdatedAt)` from `api.ts`: `(Layout, ImageStoreMap, string | null) => Promise<{ id: string; updatedAt: string }>`
  - `getLayoutStore()` from `$lib/stores/layout.svelte` (exposes `.layout: Layout`, `.hasRack: boolean`)
  - `getImageStore()` from `$lib/stores/images.svelte` (exposes `.getUserImages(): ImageStoreMap`)
- Produces (Task 4 relies on this):
  - `switchToServerMode(): Promise<SwitchResult>` where `type SwitchResult = { switched: true } | { switched: false; reason: "unreachable" | "upload-failed"; message: string }`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/server-opt-in.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  checkApiHealth: vi.fn(async () => true),
  saveLayoutToServer: vi.fn(async () => ({ id: "uuid-1", updatedAt: "t0" })),
}));
vi.mock("$lib/storage/api", () => ({
  checkApiHealth: apiMocks.checkApiHealth,
  saveLayoutToServer: apiMocks.saveLayoutToServer,
}));

const storeMocks = vi.hoisted(() => ({
  hasRack: true,
  layout: { name: "My Rack", metadata: { id: "uuid-1" } },
  images: new Map(),
}));
vi.mock("$lib/stores/layout.svelte", () => ({
  getLayoutStore: () => ({
    get layout() {
      return storeMocks.layout;
    },
    get hasRack() {
      return storeMocks.hasRack;
    },
  }),
}));
vi.mock("$lib/stores/images.svelte", () => ({
  getImageStore: () => ({ getUserImages: () => storeMocks.images }),
}));

import { switchToServerMode } from "$lib/storage/server-opt-in.svelte";
import {
  getStorageModeOverride,
  clearStorageModeOverride,
} from "$lib/storage/availability.svelte";

describe("switchToServerMode", () => {
  const original = window.__RACKULA_CONFIG__;

  beforeEach(() => {
    window.__RACKULA_CONFIG__ = { storage: "browser" };
    clearStorageModeOverride();
    apiMocks.checkApiHealth.mockClear().mockResolvedValue(true);
    apiMocks.saveLayoutToServer
      .mockClear()
      .mockResolvedValue({ id: "uuid-1", updatedAt: "t0" });
    storeMocks.hasRack = true;
  });

  afterEach(() => {
    window.__RACKULA_CONFIG__ = original;
    clearStorageModeOverride();
  });

  it("uploads the active layout and sets the override on success", async () => {
    const result = await switchToServerMode();
    expect(result.switched).toBe(true);
    expect(apiMocks.saveLayoutToServer).toHaveBeenCalledTimes(1);
    expect(getStorageModeOverride()).toBe("server");
  });

  it("does not switch when the server is no longer reachable", async () => {
    apiMocks.checkApiHealth.mockResolvedValue(false);
    const result = await switchToServerMode();
    expect(result.switched).toBe(false);
    expect(apiMocks.saveLayoutToServer).not.toHaveBeenCalled();
    expect(getStorageModeOverride()).toBe(null);
  });

  it("does not switch and keeps browser data when the upload fails", async () => {
    apiMocks.saveLayoutToServer.mockRejectedValue(new Error("boom"));
    const result = await switchToServerMode();
    expect(result.switched).toBe(false);
    expect(getStorageModeOverride()).toBe(null);
  });

  it("switches without uploading when there is no layout to move", async () => {
    storeMocks.hasRack = false;
    const result = await switchToServerMode();
    expect(result.switched).toBe(true);
    expect(apiMocks.saveLayoutToServer).not.toHaveBeenCalled();
    expect(getStorageModeOverride()).toBe("server");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- src/tests/server-opt-in.test.ts` Expected: FAIL (module `server-opt-in.svelte` not found).

- [ ] **Step 3: Implement the handler**

Create `src/lib/storage/server-opt-in.svelte.ts`:

```typescript
/**
 * Browser-to-server opt-in. When a server is reachable in browser mode, this
 * uploads the active layout to the server (matching exportAllBrowser's
 * active-layout scope; full multi-layout upload rides on the future tabs work),
 * then sets the upgrade-only override. The caller reloads on a true result so
 * the app boots cleanly in server mode. Browser localStorage is never deleted.
 */
import { checkApiHealth, saveLayoutToServer } from "./api";
import { setStorageModeOverride } from "./availability.svelte";
import { getLayoutStore } from "$lib/stores/layout.svelte";
import { getImageStore } from "$lib/stores/images.svelte";

export type SwitchResult =
  | { switched: true }
  | {
      switched: false;
      reason: "unreachable" | "upload-failed";
      message: string;
    };

export async function switchToServerMode(): Promise<SwitchResult> {
  // Re-verify health so a server that dropped since the probe does not strand
  // the user in a dead server mode.
  const healthy = await checkApiHealth();
  if (!healthy) {
    return {
      switched: false,
      reason: "unreachable",
      message: "The storage server is no longer reachable.",
    };
  }

  const layoutStore = getLayoutStore();
  if (layoutStore.hasRack) {
    try {
      const snapshot = structuredClone($state.snapshot(layoutStore.layout));
      await saveLayoutToServer(snapshot, getImageStore().getUserImages(), null);
    } catch (error) {
      return {
        switched: false,
        reason: "upload-failed",
        message:
          error instanceof Error
            ? error.message
            : "Could not upload your layout to the server.",
      };
    }
  }

  setStorageModeOverride();
  return { switched: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/tests/server-opt-in.test.ts` Expected: PASS (all four tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/server-opt-in.svelte.ts src/tests/server-opt-in.test.ts
git commit -s -m "feat: add switch-to-server handler with active-layout upload

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Banner, chip attention state, and reverse switch action

The UI. This is visual wiring on top of the tested logic from Tasks 2 and 3, so per the project TDD policy it gets no unit tests. The barrel re-exports keep imports consistent with the codebase.

**Files:**

- Modify: `src/lib/storage/index.ts` (re-export the new functions so components import from `$lib/storage`)
- Create: `src/lib/components/ServerAvailableBanner.svelte`
- Modify: `src/lib/components/StorageStatusChip.svelte`

**Interfaces:**

- Consumes: `switchToServerMode()` (Task 3); `isStorageModeFromOverride()`, `clearStorageModeOverride()` (Task 2); `getLayoutDurability(layoutStore)` returning `LayoutDurability` with `serverHint: boolean` (existing, `durability.svelte.ts`); `getLayoutStore()`; `getToastStore().showToast(message, type, duration, action?)`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Re-export the new storage functions from the barrel**

In `src/lib/storage/index.ts`, add exports so components can import from `$lib/storage` (match the existing re-export style in that file):

```typescript
export {
  isStorageModeFromOverride,
  clearStorageModeOverride,
} from "./availability.svelte";
export { switchToServerMode } from "./server-opt-in.svelte";
export type { SwitchResult } from "./server-opt-in.svelte";
```

Confirm `getStorageMode` and `getLayoutDurability` are already exported from this barrel (they are used by `StorageStatusChip.svelte` today). If not, add `getStorageMode` to the export list.

- [ ] **Step 2: Create the banner component**

Create `src/lib/components/ServerAvailableBanner.svelte`. It shows when the app is in browser mode with a reachable server and the user has not dismissed it. Primary action confirms what moves, then switches and reloads; secondary dismisses and remembers the dismissal.

```svelte
<script lang="ts">
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { switchToServerMode } from "$lib/storage";

  // Shown only when the parent determines a server is reachable in browser mode.
  let { onDismiss }: { onDismiss: () => void } = $props();

  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();

  let confirming = $state(false);
  let working = $state(false);

  const layoutName = $derived(layoutStore.layout?.name ?? "your layout");
  const hasWork = $derived(layoutStore.hasRack);

  async function confirmSwitch() {
    working = true;
    const result = await switchToServerMode();
    if (result.switched) {
      // Boot cleanly in server mode; the override now resolves getStorageMode.
      window.location.reload();
      return;
    }
    working = false;
    confirming = false;
    toastStore.showToast(result.message, "warning", 6000);
  }

  function startSwitch() {
    if (hasWork) {
      confirming = true;
    } else {
      void confirmSwitch();
    }
  }
</script>

<div class="server-banner" role="alert">
  {#if !confirming}
    <div class="server-banner-body">
      <p class="server-banner-title">A storage server is available</p>
      <p class="server-banner-text">
        Your layouts are saving to this browser only. Switch to server mode to
        save them on the server and sync across devices.
      </p>
      <p class="server-banner-hint">
        To make server mode the default for everyone, set
        RACKULA_STORAGE_MODE=server.
      </p>
    </div>
    <div class="server-banner-actions">
      <button type="button" onclick={startSwitch}>Switch to server mode</button>
      <button type="button" class="server-banner-secondary" onclick={onDismiss}>
        Stay in browser mode
      </button>
    </div>
  {:else}
    <div class="server-banner-body">
      <p class="server-banner-title">Upload and switch?</p>
      <p class="server-banner-text">
        Upload "{layoutName}" to the server and switch to server mode. Your
        browser copy stays until you remove it.
      </p>
    </div>
    <div class="server-banner-actions">
      <button type="button" disabled={working} onclick={confirmSwitch}>
        {working ? "Uploading..." : "Upload and switch"}
      </button>
      <button
        type="button"
        class="server-banner-secondary"
        disabled={working}
        onclick={() => (confirming = false)}
      >
        Cancel
      </button>
    </div>
  {/if}
</div>

<style>
  .server-banner {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-raised);
  }
  .server-banner-title {
    font-weight: 600;
    margin: 0;
  }
  .server-banner-text,
  .server-banner-hint {
    margin: 0;
    font-size: var(--font-size-sm);
  }
  .server-banner-hint {
    color: var(--color-text-muted);
  }
  .server-banner-actions {
    display: flex;
    gap: var(--space-2);
  }
</style>
```

Match token names to those already used in `src/lib/styles/tokens.css`. If a referenced token does not exist, substitute the nearest existing token rather than hardcoding a value. Validate the component with the Svelte MCP `svelte-autofixer` tool before moving on.

- [ ] **Step 3: Wire the banner and attention state into the chip**

In `src/lib/components/StorageStatusChip.svelte`:

Make the mode and hint reactive (today `isServerMode` is read once). Add derived state from the durability object the chip already computes, plus the dismissal flag, and render the banner and a reverse action. Add this to the `<script>`:

```typescript
import {
  getStorageMode,
  isStorageModeFromOverride,
  clearStorageModeOverride,
} from "$lib/storage";
import ServerAvailableBanner from "./ServerAvailableBanner.svelte";

const DISMISS_KEY = "Rackula:server-hint-dismissed";

let dismissed = $state(
  typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1",
);

// durability is the existing reactive value already used to render the chip.
const showServerBanner = $derived(durability.serverHint && !dismissed);
const fromOverride = $derived(isStorageModeFromOverride());

function dismissBanner() {
  dismissed = true;
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Dismissal is a convenience; ignore storage failure.
  }
}

function switchBackToBrowser() {
  clearStorageModeOverride();
  window.location.reload();
}
```

In the markup, add an attention modifier class to the chip wrapper when `durability.serverHint` is true (extend the existing `class="storage-chip storage-chip-{durability.status}"` with a conditional `{durability.serverHint ? ' storage-chip--attention' : ''}` or the `class:` directive). Render `<ServerAvailableBanner onDismiss={dismissBanner} />` when `showServerBanner` is true, near the chip. When `fromOverride` is true, render a small "Switch back to browser mode" button that calls `switchBackToBrowser`.

Add a `.storage-chip--attention` style that draws attention using existing tokens (for example a `--color-warning` border or background already defined in the token set). Do not hardcode colours.

Validate the modified component with the Svelte MCP `svelte-autofixer` tool.

- [ ] **Step 4: Type-check and lint**

Run: `npm run lint` Expected: no new errors from the changed files.

Run: `npx tsc --noEmit` (or the project's type-check script if different) Expected: no new type errors from the changed files.

- [ ] **Step 5: Verify the full unit suite is green**

Run: `npm run test:run` Expected: PASS, including the Task 2 and Task 3 suites.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/index.ts src/lib/components/ServerAvailableBanner.svelte src/lib/components/StorageStatusChip.svelte
git commit -s -m "feat: surface a server-available banner and one-click opt-in

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Manual verification and PR

**Files:** none (verification only).

- [ ] **Step 1: Verify the dev fix shape**

Confirm `.github/workflows/deploy-dev.yml` sets `RACKULA_STORAGE_MODE=server` in the generated `.env`. This is what makes dev use the API once deployed; it cannot be verified locally without the VPS, so the check is that the line is present and inside the heredoc.

- [ ] **Step 2: Manual browser check of the opt-in (optional but recommended)**

Run the app locally pointed at a reachable API (or stub `window.__RACKULA_CONFIG__ = { storage: "browser" }` with a local API answering `/api/health`). Confirm: the banner appears, "Stay in browser mode" dismisses and persists across reload, "Switch to server mode" with a placed layout shows the confirm naming the layout, and after confirming the app reloads into server mode. Confirm the chip then offers "Switch back to browser mode" (override path), and that clearing it reloads back to browser mode.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin feat/storage-server-opt-in
gh pr create --title "feat: storage server opt-in (restore dev server mode + browser-to-server switch)" --body "<summary referencing the spec at docs/superpowers/specs/2026-06-22-storage-server-opt-in-design.md, the root cause from PR #2051, and the four-row precedence rule>"
```

Wait for CodeRabbit and CodeAnt to clear before merging, per the project PR workflow.

---

## Notes for the implementer

- The three autosave `$effect`s in `manager.svelte.ts` already read `getStorageMode()` dynamically, so they pick up the new mode after reload with no change. We reload on switch rather than flipping mode mid-session, so no mid-session reactive re-init is needed.
- Scope of "bring my work with me": the active layout, matching the existing `exportAllBrowser` degradation (the multi-tab browser workspace is not yet wired; manager.svelte.ts:354-356). Any other layouts in the browser `library` stay in localStorage untouched (non-destructive) and become uploadable when the tabs work lands.
- The override resolves `getStorageMode()` to `server` whenever set on a browser-config deployment. If the server is later unreachable, the existing server-mode-down handling provides the honest "server unavailable" chip state and working-copy continuity; the chip's "Switch back to browser mode" action clears the override.
