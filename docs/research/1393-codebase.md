# Spike #1393: Codebase Exploration

**Date:** 2026-03-08
**Scope:** Catalogue of E2E test files, selector patterns, helper modules, fixtures, and disabled tests

---

## 1. Spec File Catalogue

**Total:** 23 spec files | **~3,875 LOC**

| File | LOC | Purpose | Category |
|------|-----|---------|----------|
| basic-workflow.spec.ts | 109 | Device placement, movement, deletion | Core |
| smoke.spec.ts | 154 | JS initialisation, error collection | QA |
| export.spec.ts | 121 | Export PNG/SVG/JPEG, legend options | Features |
| keyboard.spec.ts | 129 | Keyboard shortcuts (Ctrl+S, Delete, arrows, ?) | Accessibility |
| rack-configuration.spec.ts | 115 | Rack creation, width/height presets, unit labels | Config |
| device-metadata.spec.ts | 360 | IP, notes, name, colour persistence | Data |
| starter-library.spec.ts | 288 | Device library categories and item counts | Library |
| dual-view.spec.ts | 274 | Front/rear rack rendering, display modes | View |
| android-chrome.spec.ts | 428 | Android viewports, mobile interactions | Mobile |
| ios-safari.spec.ts | 201 | iOS navigation, bottom sheet | Mobile |
| device-images.spec.ts | 106 | Image uploads, display mode toggle | Features |
| device-name.spec.ts | 182 | Custom naming, display name persistence | Features |
| persistence.spec.ts | 110 | Save/load, session storage, unsaved warning | Data |
| archive-format.spec.ts | 143 | ZIP format, legacy JSON migration | Format |
| migration.spec.ts | 132 | Position migration from v0.6 YAML | Legacy |
| carlton-migration.spec.ts | 153 | Carlton format to Rackula migration | Legacy |
| single-rack.spec.ts | 168 | Rack replacement flow, new rack dialog | UI Flows |
| responsive.spec.ts | 178 | Desktop/mobile viewports, responsive layout | Responsive |
| custom-device.spec.ts | 77 | Custom device creation, height preservation | Features |
| shelf-category.spec.ts | 74 | Shelf category devices, search | Library |
| rack-context-menu-focus.spec.ts | 126 | Context menu, focus on rack/panel | UI |
| view-reset.spec.ts | 131 | Panzoom transform, view reset | View |
| duplicate-device-ids.spec.ts | 116 | Duplicate device handling in migrations | Data Integrity |

---

## 2. Data-testid Audit

### Defined in Source (34 across 11 components)

| Component | TestIds | Count |
|-----------|---------|-------|
| Toolbar.svelte | `btn-logo-about`, `btn-undo`, `btn-redo`, `btn-display-mode`, `btn-fit-all`, `btn-export`, `btn-share`, `btn-mobile-save`, `btn-mobile-load`, `btn-mobile-export` | 10 |
| ShareDialog.svelte | `share-url-input`, `share-copy-btn`, `qr-error`, `qr-loading`, `qr-container`, `qr-download-btn` | 6 |
| LayoutYamlPanel.svelte | `yaml-mode-label`, `yaml-conflict-prompt`, `yaml-validation-message`, `yaml-textarea` | 4 |
| RackList.svelte | `btn-new-rack`, `rack-item-group-{id}`, `rack-item-{id}` | 3 |
| DevicePaletteItem.svelte | `device-palette-item`, `delete-device-type-btn` | 2 |
| SidebarTabs.svelte | `sidebar-tab-{id}` | 2 |
| DevicePalette.svelte | `search-devices`, `btn-create-custom-device` | 2 |
| MobileHistoryControls.svelte | `btn-mobile-undo`, `btn-mobile-redo` | 2 |
| Dialog.svelte | `dialog-backdrop` | 1 |
| LoadDialog.svelte | `spinner-loader` | 1 |
| StartScreen.svelte | `start-screen` | 1 |

### Used in E2E Tests

Only **6 unique testids** are actively used in tests:
- `sidebar-tab-racks`, `btn-new-rack`, `btn-export` (toolbar-actions.ts)
- `search-devices`, `btn-create-custom-device` (custom-device.spec.ts, shelf-category.spec.ts)
- `layout-name` (migration specs)

**28 testids exist in components but are never referenced in E2E tests.**

### Critical Gaps (No testid exists)

| UI Region | Current Selector | Impact |
|-----------|-----------------|--------|
| Rack canvas | `.rack-container`, `.rack-svg` | Every test that interacts with rack |
| Devices in rack | `.rack-device` | Device selection, counting, assertions |
| Front/rear views | `.rack-front`, `.rack-rear` | Dual-view tests |
| Device palette | `.device-palette`, `.device-palette-item` | Device drag operations |
| Side drawers | `.drawer-right`, `.drawer-left` | Edit panel visibility checks |
| Context menus | `.context-menu-content`, `.context-menu-item` | Context menu tests |
| Dialogs | `.dialog`, `.dialog-title` | All dialog interactions |
| Device edit panel | `.display-name-input`, `.display-name-display` | Metadata editing |
| Canvas/viewport | `.canvas`, `.panzoom-container` | View reset, zoom tests |
| Mobile elements | `.bottom-sheet`, `.drag-handle-bar` | Mobile tests |
| Toast notifications | `.toast`, `.toast--success` | Success/error feedback |

---

## 3. Helper Module Analysis

### 7 modules in `e2e/helpers/`

**base-test.ts** (27 lines) — Custom Playwright fixture that deletes File System Access API (`showOpenFilePicker`, `showSaveFilePicker`, `showDirectoryPicker`) before page scripts run, forcing `browser-fs-access` fallback to anchor downloads. All spec files import `test` and `expect` from here.

**test-layouts.ts** (117 lines) — Pre-encoded share link fixtures using pako compression + base64url encoding. Provides 5 fixtures (`EMPTY_RACK_SHARE`, `SMALL_RACK_SHARE`, `MEDIUM_RACK_SHARE`, `STANDARD_RACK_SHARE`, `RACK_WITH_DEVICE_SHARE`) and `gotoWithRack()` helper.

**device-actions.ts** (135 lines) — Device manipulation: `dragDeviceToRack()` (manual DragEvent dispatch via `page.evaluate()`), `selectDevice()`, `deselectDevice()`, `deleteSelectedDevice()`. Uses mix of class selectors and aria-label.

**rack-setup.ts** (151 lines) — Wizard form helpers: `completeWizardWithKeyboard()`, `completeWizardWithClicks()`, `fillRackForm()`. Uses form IDs (`#rack-name`, `#custom-height`), class selectors (`.height-btn`, `.bay-btn`), and `:has-text()`.

**toolbar-actions.ts** (47 lines) — Toolbar interactions: `clickNewRack()`, `clickSave()`, `clickLoad()`, `clickExport()`. Best-practice example — uses `data-testid` and `aria-label` selectors.

**mobile-navigation.ts** (8 lines) — Single function `openDeviceLibraryFromBottomNav()` using `getByRole()`.

**index.ts** (41 lines) — Barrel export for all helpers.

### What's Missing from Helpers

- Device metadata editing (name, IP, notes, colour)
- Context menu interactions
- Toast/notification assertion helpers
- Undo/redo workflow helpers
- Rack edit panel interactions
- Multi-rack navigation

---

## 4. Selector Pattern Statistics

| Pattern | Approx. Count | % of Total | Reliability |
|---------|--------------|------------|-------------|
| `.locator(".class-name")` | ~180 | 55% | Low |
| `:has-text("...")` | ~40 | 12% | Low |
| `getByRole(...)` | ~35 | 11% | High |
| Compound `.class .subclass` | ~20 | 6% | Very Low |
| `#id` selectors | ~12 | 4% | Medium |
| `getByText(...)` | ~10 | 3% | Medium |
| `[aria-label="..."]` | ~8 | 2% | Medium |
| `querySelector` in evaluate() | ~8 | 2% | Very Low |
| `getByTestId(...)` / `[data-testid]` | ~13 | 4% | High |

**Summary:** ~75% of selectors use CSS classes, text matching, or DOM queries. Only ~15% use semantic patterns (testid, role, aria-label).

---

## 5. Disabled Tests (11 total)

### File Chooser Interaction (3 tests)

| File | Test | Notes |
|------|------|-------|
| persistence.spec.ts:66 | `load layout from file` | File chooser unreliable in headless |
| archive-format.spec.ts:84 | `load saved ZIP restores layout` | Same |
| device-name.spec.ts:43 | `display name persists after save/load` | Likely same root cause |

### Unimplemented UI (3 tests)

| File | Test | Notes |
|------|------|-------|
| rack-configuration.spec.ts:72 | `descending units shows U1 at top` | Checkbox not implemented |
| rack-configuration.spec.ts:106 | `custom starting unit displays correct labels` | Input not implemented |
| rack-configuration.spec.ts:112 | `form factor selection is available` | Dropdown not implemented |

### UX Redesign Pending (3 tests)

| File | Test | Notes |
|------|------|-------|
| basic-workflow.spec.ts:25 | `can replace current rack` | FIXME(#903) |
| basic-workflow.spec.ts:33 | `rack appears after replacement` | FIXME(#903) |
| basic-workflow.spec.ts:103 | `can clear rack` | FIXME(#903) |

### Complex UI Interaction (1 test)

| File | Test | Notes |
|------|------|-------|
| device-metadata.spec.ts:293 | `metadata persists across racks` | Multi-rack sidebar complexity |

### Undo/Redo (1 test)

| File | Test | Notes |
|------|------|-------|
| device-name.spec.ts | `display name persists after undo/redo` | Undo/redo not tested for names |

---

## 6. Test Fixture Patterns

### Primary: Share Link Encoding (90% of tests)

`MinimalLayout` → JSON → pako DEFLATE → base64url → `/?l={encoded}`

5 pre-built fixtures in `test-layouts.ts`, loaded via `gotoWithRack(page, fixture)`.

**Strengths:** Fast, deterministic, stateless, parallel-safe, uses production code path.
**Weakness:** Opaque encoded strings; adding new fixture requires encoding pipeline.

### Secondary: Wizard Form Completion

`completeWizardWithClicks()` / `completeWizardWithKeyboard()` in `rack-setup.ts`. Tests the wizard UX itself.

### Tertiary: File-Based Fixtures

Migration tests create legacy JSON/YAML files in `beforeAll()` hooks using `test.info().outputPath()`. Cleaned up in `afterAll()`.

### Ad-Hoc: Dynamic UI Creation

Custom device tests fill forms inline (`#device-name`, `#device-height`). Image tests generate minimal PNG buffers programmatically.
