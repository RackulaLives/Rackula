# Spike #2183: E2E Strategy for the M14 Shell

Date: 2026-06-14 Parent epic: #2017 (Canvas UX Overhaul, milestone M14) Sequencing: M14 wave 0, alongside guard rails #2098 (visual), #2099 (axe), #2100 (UX standards)

---

## Problem

M04 spent real effort on E2E: data-testids on structural components (#1419), helper migration to role and testid locators (#1420), the lint rule that blocks CSS class selectors (#1423), stale-selector cleanup (#1264), and coverage (#1227, #1231). Some of that effort is written against surfaces the M14 shell deletes. #2072 reframes the top bar and #2081 removes the StartScreen, so any spec that asserts on the toolbar or the start screen needs a decision: rewrite or delete. Nothing today says which.

Two shell features also need a test capability the suite does not have. The twin-tab guard (#2044) and lazy tab restore (#2080) involve more than one page on the same origin, and no existing E2E issue plans the multi-context harness they need.

This document is the strategy: which selectors and helpers carry over, the naming convention M14 slices follow as they add testids, the multi-context harness design, and the per-slice rewrite-or-delete call for the affected specs.

## Selector posture (unchanged)

The project already has a sound selector strategy, documented in `docs/guides/TESTING.md` (Selector Strategy) and enforced by the lint rule from #1423. M14 does not change it. The order of preference stays:

1. `getByRole()` with an accessible name. Doubles as an accessibility check.
2. `getByLabel()` or `getByText()` for form fields and visible copy.
3. `getByTestId()` for structural anchors with no natural role or label.

CSS class selectors are reserved for the few intentional anchors in `e2e/helpers/locators.ts`. A new `.locator(".foo")` fails lint. This holds through the overhaul: a shell that rebuilds the DOM is exactly the situation role and testid locators are meant to survive.

## Carry-over audit

The shell reframe touches the top bar, the entry flow, the palette, and adds the tab strip. The audit below classifies the #1419 testids and #1420 helpers against those changes.

### Testids: carry, rename, or retire

| Testid (or family) | Owner today | M14 fate |
| --- | --- | --- |
| `rack-canvas`, `rack-front`, `rack-rear` | Canvas | Carry. The canvas survives; verbs float over it. |
| `rack-device`, `rack-drop-zone` | RackView | Carry. Device chrome is unchanged by the shell. |
| `device-palette-item` | DevicePaletteItem | Carry, but stop indexing by position (see below). |
| `sidebar-tab-devices`, `sidebar-tab-racks` | SidebarTabs | Carry. A third tab, Layouts, joins them (#2082). |
| `drawer-left` | Sidebar | Carry. The left drawer stays the sidebar host. |
| `drawer-device-edit` | EditPanel | Carry. Becomes the side panel Edit tab (#2077). |
| `btn-export`, `btn-share` | Toolbar | Carry the action, expect a new home. Reach by role. |
| `menu-save`, `menu-load` | FileMenu | Reframed into the app menu (#2073). Reach by role. |
| `btn-new-rack` | SidebarTabs (Racks) | Carry. Creation moves toward place-first but the |
|  |  | button persists for the keyboard and explicit path. |
| `start-screen` | StartScreen | Retire with #2081. Specs that assert it are deleted |
|  |  | or rewritten to the WelcomeScreen empty state. |
| `toast-message`, `ctx-menu`, `ctx-menu-item` | Toast, ContextMenu | Carry. Both survive the shell. |
| `mobile-bottom-nav`, `nav-tab-*` | mobile nav | Carry. Mobile shell adaptation is deferred (M12). |
| `layout-tab-{id}`, `layout-tab-close-{id}` | LayoutTabs (#2079, landed) | Carry. Already follows the parametrized convention. |

The toolbar class anchors in `locators.ts` (`toolbar.root`, `toolbar.brand`, `toolbar.center`) belong to the surface #2072 reframes. They are not testids and not the preferred locator; the specs that use them are listed in the per-slice table and move to role or testid locators when #2072 lands.

### Helpers: carry, adjust, or retire

| Helper file | M14 fate |
| --- | --- |
| `a11y.ts` | Carry. The axe guard rail (#2099) grows a scan per new surface. |
| `base-test.ts` | Carry. The File System Access shim is shell-agnostic. |
| `device-actions.ts` | Adjust. Add name-based palette selection (done here, see below). |
| `index.ts`, `locators.ts` | Carry. Registry grows; the toolbar entries retire with #2072. |
| `mobile-navigation.ts` | Carry. Mobile shell work is deferred. |
| `rack-setup.ts` | Carry. The wizard path survives for explicit creation. |
| `test-layouts.ts` | Carry. Share-link fixtures are independent of the shell chrome. |
| `toolbar-actions.ts` | Adjust on #2073. `clickSave`/`clickLoad` move to the app menu; |
|  | the functions stay, their internals change. Already role-based. |
| `visual.ts` | Carry. The visual guard rail (#2098) re-baselines per slice. |
| `multi-context.ts` | New (this issue). Twin-tab and restore primitive for #2044/#2080. |

## Naming convention for new testids

M14 slices add surfaces. To keep the registry coherent and avoid the drift #1264 cleaned up, new testids follow the existing house style:

- Kebab-case, lowercase, scope-prefixed by surface: `side-panel`, `app-menu`, `storage-chip`, `layout-tab-{id}`.
- One stable id per structural anchor, parametrized by entity id where a set repeats (`layout-tab-{id}`, `layout-tab-close-{id}` is the precedent from #2079).
- Add a testid only when no role or accessible name reaches the element. Buttons, dialogs, and inputs are reached by role or label at the call site, never given a testid for its own sake. The registry comment in `locators.ts` states this; it stays true.
- Register a structural anchor in `e2e/helpers/locators.ts` rather than hard-coding the string in a spec, so a rename is a one-line registry edit.
- Every new surface gets an axe scan (#2099) and, where it is visually load-bearing, a visual baseline (#2098), per the patterns in `docs/guides/TESTING.md`.

## Palette selection: stop indexing by position

`dragDeviceToRack` indexed palette items by position (`querySelectorAll(...)[deviceIndex]`). Two M14-era facts break that:

- Virtualization (#2094, landed): the palette windows lists over 30 rows. Off-screen rows unmount, so a positional index does not map to a stable device.
- Favourites (#2094): a pinned device renders twice, once in the favourites section and once in its category, so an index can land on either copy.

There was already a skipped spec waiting on this: `custom-device.spec.ts` notes that custom devices sort into the brand list rather than appending, so `deviceIndex: count - 1` drags the wrong device, and asks for a `dragDeviceByName()` helper.

The fix, implemented in this issue:

- `dragDeviceToRack(page, { deviceName })` selects the palette item whose visible `.device-name` text matches, inside the drag `page.evaluate`. The `deviceIndex` path stays as a fallback so existing call sites are unchanged.
- `paletteItemByName(page, name)` returns the palette item locator by name, the same `getByTestId("device-palette-item").filter({ hasText })` pattern the skipped spec already uses inline. When a name is ambiguous because the device is pinned, scope to the favourites section first, then take `.first()`.

Name-based selection is the convention for the palette from here on. Positional indexing is the fallback only, and only where order is genuinely fixed.

## Multi-context harness (#2044, #2080)

Both features turn on one fact: pages in the same Playwright `BrowserContext` share an origin, so they share localStorage and receive each other's `storage` events. Pages in different contexts are isolated and share state only through an explicit `storageState` snapshot.

The harness wraps the same-context case, which is what the two features need:

- `openSecondTab(page)`: opens a second page in the same context. The two pages share the workspace index and layout bodies (`Rackula:workspace`, `Rackula:layout:<id>` per spike #2179). This is the arrangement the twin-tab guard (#2044) elects an editor across.
- `readStorageJson(page, key)`: reads and parses a localStorage key, for asserting that a write in one tab is visible to another.
- `collectStorageEvents(observer, action)`: records the `storage` events `observer` receives while `action` runs in another tab. The twin-tab guard reacts to these events, so its test asserts that a write in tab A fires a `storage` event in tab B.
- `snapshotStorage(context)`: captures `storageState` so a relaunch can be modelled with a fresh context. Lazy restore (#2080) reads the open-tab set at startup, so its test seeds one context, snapshots it, then launches a new cold context from the snapshot rather than reusing a live in-memory workspace.

The harness is deliberately thin. #2044 and #2080 are not built yet, so it provides the primitive without simulating behaviour that does not exist. `multi-context.spec.ts` smoke-tests the primitive against the current app (shared autosave slot, cross-tab `storage` event, restore from snapshot) so the harness is proven before the features depend on it. When the features land, their specs compose these helpers.

The Web Lock the spec describes (a `navigator.locks` lease keyed by layout id) is the editor election mechanism #2044 will build. There is no such code today, so the harness does not test it. When #2044 adds it, a twin-tab spec uses `openSecondTab` plus `collectStorageEvents` to assert that the second tab is paused and the first remains the editor.

## A multi-tab axe scan

`axe.spec.ts` scans single surfaces. A multi-tab axe scan (several layout tabs open, then scan the tab strip and the active canvas) is a noted follow-up there. It is not built in this issue because the tab strip's a11y is better scanned once the chevron overflow and the unbacked-changes dots land (both follow #2079). When that scan is added, it follows the existing axe pattern: open the surface with the shared helpers, then `expectNoA11yViolations(page, '[role="tablist"]')`.

## Per-slice decision: rewrite or delete

The specs and helpers that assert on a removed or reframed surface, with the call per slice. "Rewrite" means the user behaviour still exists and the spec retargets the new locator; "delete" means the surface is gone and the assertion has no successor.

| Slice | Spec or helper | Touches | Decision |
| --- | --- | --- | --- |
| #2072 top bar reframe | `smoke.spec.ts` | `toolbar.root` visible | Rewrite. Assert the workspace frame by role, not the `.toolbar` class. |
| #2072 top bar reframe | `deploy-smoke.spec.ts` | toolbar + startScreen | Rewrite the toolbar assertion; delete the start-screen branch (#2081). |
| #2072 top bar reframe | `device-images.spec.ts` | toolbar visible | Rewrite. The toolbar visibility check moves to the new frame anchor. |
| #2072 top bar reframe | `responsive.spec.ts` | `toolbar.center` | Rewrite. Retarget the responsive check to the reframed top bar. |
| #2072 top bar reframe | `helpers/locators.ts` | `toolbar.*` entries | Retire the `toolbar` registry entries once no spec references them. |
| #2072 top bar reframe | `helpers/visual.ts` | toolbar settle wait | Adjust the settle selector to the new frame; keep the visual baseline. |
| #2081 StartScreen removal | `helpers/locators.ts` | `startScreen.root` | Retire `start-screen` from the registry; the surface is deleted. |
| #2081 StartScreen removal | any spec asserting start screen | `start-screen` testid | Delete the start-screen assertion; rewrite entry to WelcomeScreen empty |
|  |  |  | state where a first-launch test still has value. |
| #2073 app menu | `helpers/toolbar-actions.ts` | File menu internals | Adjust. `clickSave`/`clickLoad` retarget the app menu; signatures hold. |
| #2079 tab strip (landed) | new `multi-context.spec.ts` | n/a | Already role/testid based; no rewrite needed. |
| #2094 palette (landed) | `device-actions.ts` | positional index | Adjusted here: name-based selection added, index kept as fallback. |

The rule for each slice: when the slice merges, the specs in its row are updated in the same PR (the slice owns its test impact), and the visual (#2098) and axe (#2099) baselines are refreshed for any surface it changes. No spec is left asserting a deleted surface.

## What this issue delivers

- This strategy document.
- `device-actions.ts`: `dragDeviceToRack({ deviceName })` and `paletteItemByName`, fixing the positional-index fragility under virtualization and favourites.
- `multi-context.ts`: the twin-tab and restore harness primitive (`openSecondTab`, `readStorageJson`, `collectStorageEvents`, `snapshotStorage`).
- `multi-context.spec.ts`: smoke coverage proving the harness against the current app.
- A pointer from `docs/guides/TESTING.md` to this document.

It does not rewrite the per-slice specs in the table: each is rewritten when its slice merges, by the slice's PR, because the new locator does not exist until the slice lands.
