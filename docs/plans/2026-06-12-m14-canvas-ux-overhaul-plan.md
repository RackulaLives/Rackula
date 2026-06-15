# M14 -- Canvas UX Overhaul Execution Plan

> For agentic workers: execute one task per session via /dev-issue <number>. The GitHub issue body is the source of truth (each carries an Alignment audit 2026-06-12 section with binding ACs). Do not start a task whose listed blockers are open. Follow repo TDD policy (CLAUDE.md): tests only where behaviour warrants them.

## Goal

Reframe the canvas shell around one principle: place each control where its scope lives. The top bar becomes the workspace frame only (logo with app menu, tab strip, storage chip, settings). The app opens straight to the canvas and restores the open tab set lazily. Layouts become tabs over a sidebar Layouts library with cached previews. View and history controls move to the bottom-left of the canvas. Object verbs float on the object; properties dock in a tabbed, collapsible side panel. Sources of truth: epic #2017 and docs/superpowers/specs/2026-06-09-canvas-ux-overhaul-design.md, including its Alignment audit amendments (2026-06-12) section with the canonical-home table.

## Position in sequence

M14 runs after M03 in the working sequence M02 -> M04 -> M03 -> M14 -> M16, with M15 (Storage Model & Data Safety) running in parallel now. M04's decomposition and M03's carrier-first data model (#2158) are the floor this milestone builds on. M16 follows M14; #2094 absorbed M16's virtualization tracker (#114).

## Cross-milestone gates in

- M03 #2158 (carrier-first sub-U devices) lands before any M14 placement, drag, or verb-bar work; #2075's slot control is designed against the carrier model, not the slot_position pathway #2158 deletes.
- M03 #571 (published JSON Schema) is needed for #2095's CI validation of YAML templates; template authoring sequences after #2158's schema bump or commits to re-exporting templates post-bump.
- M15 #2037 (explicit storage mode) gates #2187 (app menu mode-aware items) only; the menu shell (#2073) is unblocked.
- M15 #2035 (storage chip) provides the per-layout durability derived API that #2079 tab dots and #2082 sidebar dots read from, and the chip that #2072 relocates. If #2035 has not landed when #2072 ships, the top bar ships an empty flex slot per the interim AC.
- M15 #2034 (change counter) and #2036 (runtime config) are closed; #2045's stated dependencies are satisfied.
- M04 #2146 is closed; the contained-device movement guard exists for #2075 to route through.

## Cross-milestone gates out

- M15 #2041 (conflict dialog), #2042 (snapshot restore), and #2044 (twin-tab guard) consume answers from wave-0 designs here: #2018 (deleted-while-open, twin-tab semantics), #2182 (undo/redo across restore).
- M12 (mobile) waits on #2097's decisions and the follow-up issues it files; months of M12 work must not target a shell that no longer exists.
- The future command palette (#2020, build later) layers on the #2096 registry as thin UI.
- #2098/#2099/#2100/#2185 become standing PR gates for all later milestones that touch the shell.

## Stage 0: Guard rails and wave-0 designs

No shell slice merges until #2098, #2099, and #2100 are green (epic #2017 audit gate). All tasks in this stage are parallel-safe.

### Task: #2098 ci: visual regression tests for key UI states

Blockers: none.
Why this position: wave-0 guard rail; the epic audit gates every shell slice on this being green, so it must land before Stage 1 starts.
Scope: Playwright screenshot snapshots diffed in CI for a small, stable surface set: empty canvas, populated rack (front and rear, label and image display modes), each dialog open, sidebar tabs, light and dark theme for the core canvas state. Deterministic rendering (fonts, animations disabled, fixed viewport), masked dynamic regions, documented snapshot update flow, diff images in CI artifacts. A tripwire, not pixel-perfect coverage.
Key files: e2e/playwright.config.ts, e2e/helpers/base-test.ts, .github/workflows/test-full.yml, .github/workflows/test.yml.
Verify: npm run test:e2e passes locally with snapshots committed; open a draft PR with a deliberate style perturbation and confirm the CI job fails with a diff artifact, then revert.
- [ ] Done when: the snapshot suite runs in CI on PRs with deterministic rendering, a documented update flow, and diff images in CI artifacts.

### Task: #2099 ci: automated accessibility checks with axe-core

Blockers: none.
Why this position: wave-0 guard rail; the shell changes keyboard navigation extensively and the spec makes accessibility part of the design, not a retrofit.
Scope: axe-core scans via @axe-core/playwright wired into the existing Playwright E2E job, covering canvas with selection, sidebar, each dialog, and the side panel as it lands. CI fails on WCAG 2.2 AA violations; existing violations are fixed or explicitly baselined with an issue each. Document the pattern for adding a scan when a new surface lands.
Key files: e2e/playwright.config.ts, e2e/helpers/base-test.ts, .github/workflows/test-full.yml, docs/guides/ACCESSIBILITY.md.
Verify: npm run test:e2e runs the axe scans; seed a violation locally and confirm the job fails; CI run on a PR shows the scan executing.
- [ ] Done when: axe scans run in the E2E job over the listed surfaces, CI fails on new AA violations, and the add-a-scan pattern is documented.

### Task: #2100 docs: formalize UX standards as PR gates

Blockers: none.
Why this position: wave-0 guard rail; names the standards every shell PR self-certifies against so PRs stop re-litigating touch targets and reduced motion.
Scope: update docs/guides/ACCESSIBILITY.md to name five standards: WCAG 2.2 AA conformance, 44px minimum touch targets on mobile surfaces, prefers-reduced-motion respected for all animation, visible focus states on every interactive element, and managed (never dropped) focus on open/close of panels, dialogs, and sheets. Wire a short self-certification checklist into the PR template and link the standards from the epic body.
Key files: docs/guides/ACCESSIBILITY.md, .github/PULL_REQUEST_TEMPLATE.md.
Verify: npm run lint passes; gh issue view 2017 shows the standards link; the PR template renders the checklist on a draft PR.
- [ ] Done when: ACCESSIBILITY.md names the five standards, the PR template carries the checklist, and the epic links the standards.

### Task: #2018 Tabs interaction model

Blockers: none (pairs with #2179, which owns persistence; this spike explicitly does not).
Why this position: wave 0; #2079 and #2080 cannot start until overflow, close-vs-delete, and the keyboard map are decided.
Scope: recommendations, with alternatives mocked, for: tab overflow (shrink-then-chevron leaning), making close unmistakably non-destructive, delete and rename while open (including the active vs inactive tab split and how the answer covers #2041's snapshot POST for deleted layouts), session restore mechanics (what an unloaded tab shows, deleted or unreadable layouts, closed-tab working copies), and the full browser-safe keyboard map reconciling Ctrl+S/O/E/H/D, I, F, Delete, and arrows. Audit-added questions: twin-tab guard semantics under multi-layout (#2044), whole-set restore failure in server mode, distinguishing lost-data-empty from fresh-install-empty for a returning user with zero restorable layouts (#2081 consumes this), and undo/redo across tab switch and lazy restore (with #2182). Decisions recorded back into the design spec.
Key files: docs/superpowers/specs/2026-06-09-canvas-ux-overhaul-design.md, src/lib/components/KeyboardHandler.svelte (existing shortcut map to reconcile), docs/research/ (spike output as 2018-spike.md).
Verify: spec diff shows each decision recorded; gh issue close 2018 with a summary comment linking the spec sections.
- [ ] Done when: a recommendation exists for each question with alternatives mocked, and the decisions are recorded in the design spec.

### Task: #2097 spike: mobile adaptation of the new shell

Blockers: none. Must complete before #2076 and #2075 begin (audit sequencing: runs at milestone start).
Why this position: wave 0; without these calls the EditPanel/RackEditSheet duplication gets rebuilt against the new side panel and M12 work targets a dead shell.
Scope: recommendations, with mocked alternatives, for: whether mobile reuses the side panel Edit/View content inside a bottom sheet (given #2092 renders dialogs as sheets on mobile), what replaces MobileBottomNav once the top bar is the workspace frame, whether floating verb bars work at touch sizes or selection opens the sheet directly, and which shell pieces are desktop-only with a named graceful fallback each. Decisions recorded into the design spec; follow-up issues filed (likely into M12).
Key files: src/lib/components/mobile/MobileBottomNav.svelte, src/lib/components/EditPanel.svelte, src/lib/components/RackEditSheet.svelte, src/lib/components/DeviceDetails.svelte, docs/superpowers/specs/2026-06-09-canvas-ux-overhaul-design.md.
Verify: spec diff records the decisions; gh issue list shows the filed M12 follow-ups; gh issue close 2097 with the summary.
- [ ] Done when: a recommendation per question is recorded in the spec and follow-up issues are filed.

### Task: #2096 feat: command registry as single source for menu, shortcuts, and help

Blockers: none. Must merge before #2092 migrates HelpPanel (ordering recorded on both issues: #2092 changes the container, this changes the content source) and before #2073 and #2075 start.
Why this position: foundational; the app menu, verb bars, keyboard handler, HelpPanel, and tooltips (#117) all read from this registry, and the future palette (#2020) layers on it.
Scope: a typed registry as the canonical source of command metadata: id, label, shortcut, scope (global, layout, selection), enabled-when predicate, run, optional description. Register the existing shortcuts (Ctrl+S, Ctrl+O, Ctrl+E, Ctrl+H, Ctrl+D, Ctrl+Z/Shift+Z/Y, I, F, Delete, arrows, Escape, ?). KeyboardHandler dispatches via the registry (the getShortcuts() migration is in scope; supersedes #2026, whose Toolbar callback migration is dropped because #2072/#2074 remove that surface). HelpPanel generates its shortcut list from the registry. Pick a name distinct from src/lib/stores/commands/ (the undo/redo Command Pattern), for example an actions registry.
Key files: src/lib/components/KeyboardHandler.svelte (getShortcuts() at line 78), src/lib/components/HelpPanel.svelte, src/lib/utils/keyboard.ts, src/lib/stores/commands/ (naming collision to avoid).
Verify: npm run test:run, npm run lint, npm run build; manual: every listed shortcut still works and ? shows the generated list.
- [ ] Done when: all five issue ACs are checked and #2073/#2075 are unblocked to consume the registry.

### Task: #2179 design: browser-mode multi-layout storage schema

Blockers: none.
Why this position: wave 0; five issues (#2082, #2079, #2080, #2045, #2035) presume a durable browser-mode multi-layout store that nothing defines. Current code persists exactly one localStorage slot (Rackula:autosave).
Scope: design deliverables: key structure for per-layout working copies and the durable library in browser mode (localStorage vs IndexedDB decision included); migration off the single Rackula:autosave slot; quota strategy (detection, eviction order, what the chip #2035 and twin-tab guard #2044 report when writes fail); how #2044's storage-event guard and Web Lock re-key per layout; per-layout durability state exposed as one source for the chip rollup, tab dots (#2079), and sidebar dots (#2082). Pairs with spike #2018, which does not own persistence.
Key files: src/lib/storage/working-copy.ts, src/lib/storage/manager.svelte.ts, src/lib/storage/api.ts, docs/research/ (design output as 2179-design.md).
Verify: design document reviewed against each presuming issue's AC; gh issue close 2179 noting #2079/#2080/#2082/#2045 unblocked.
- [ ] Done when: all five deliverables are recorded and the blocked issues can cite the schema.

### Task: #2182 design: undo/redo semantics across snapshot restore and tab switching

Blockers: none.
Why this position: wave 0; snapshot restore (#2042) and tab switching (#2079/#2080) replace layout state under the live undo stack, and a dangling stack corrupts the new state on Ctrl+Z.
Scope: decide whether history is per-tab (kept alive across switches), cleared on restore, or checkpointed; hand binding ACs to #2042 (restore) and #2079/#2080 (switch and lazy restore); cover the memory cost of N tabs times deep undo stacks. The same question is recorded on spike #2018.
Key files: src/lib/stores/commands/, src/lib/stores/history.svelte.ts, docs/research/ (design output as 2182-design.md).
Verify: decision recorded; gh issue comments on #2042, #2079, and #2080 carry the handed ACs; gh issue close 2182.
- [ ] Done when: the decision is recorded and ACs are handed to #2042, #2079, and #2080.

### Task: #2183 test: E2E strategy for the M14 shell (selector carry-over, multi-context Playwright)

Blockers: none.
Why this position: wave 0, pairing with the guard rails; M04's E2E investment is partly written against surfaces M14 deletes (#2072 removes Toolbar, #2081 removes StartScreen) and nothing assesses carry-over.
Scope: a carry-over audit of which #1419 data-testids and #1420 helpers survive the shell reframe, plus a naming convention so M14 slices add testids as they build; a multi-context Playwright harness (two pages sharing storage state) for twin-tab (#2044) and multi-tab restore (#2080) scenarios; a per-slice decision on which M04-era specs get rewritten vs deleted at each M14 slice.
Key files: e2e/helpers/locators.ts, e2e/helpers/toolbar-actions.ts, e2e/helpers/index.ts, e2e/playwright.config.ts.
Verify: npm run test:e2e passes with the harness in place; the audit table and per-slice decisions are committed (docs/guides/TESTING.md or e2e/helpers/).
- [ ] Done when: the carry-over audit, naming convention, multi-context harness, and per-slice rewrite-vs-delete decisions exist.

### Task: #2184 chore: decide i18n approach before M14/M15 mint new user-facing strings

Blockers: none.
Why this position: wave 0; cheap now, expensive after #2073/#2096/#2035 mint the project's largest batch of new copy.
Scope: decide between adopting and wiring the vestigial Paraglide runtime (strings in catalogues from day one, with a one-paragraph convention referenced by M14/M15 issue ACs) or deleting src/lib/i18n/ and accepting an M11 retrofit. If delete: remove the dead code entirely (no package.json dependency exists; the runtime is not imported by Toolbar or App).
Key files: src/lib/i18n/ (paraglide/ subdirectory), package.json.
Verify: npm run build and npm run test:run pass after the change; the decision is recorded on the issue and, if adopt, the convention paragraph is linked from affected issues.
- [ ] Done when: the decision is recorded and either Paraglide is wired with a convention or src/lib/i18n/ is removed.

### Task: #2185 ci: performance budget and baseline for the M14 shell

Blockers: none.
Why this position: wave 0; #2094 (virtualization), #2092 (13-surface dialog migration), and #2080 (lazy restore) carry implicit performance intent that no gate measures.
Scope: capture a pre-M14 baseline on the E2E infrastructure for initial render, palette scroll with a large library, tab switch, and dialog open; agree and document budget thresholds alongside the guard rails; add a CI check (or a scripted manual gate) comparing shell-slice PRs against the baseline.
Key files: e2e/playwright.config.ts, .github/workflows/test-full.yml, docs/guides/TESTING.md.
Verify: the baseline numbers are committed; the gate runs on a draft PR; npm run test:e2e remains green.
- [ ] Done when: the baseline is captured, thresholds are documented, and a comparison gate runs against shell-slice PRs.

## Stage 1: Foundations

Requires Stage 0 guard rails (#2098, #2099, #2100) green. #2092 lands first within the stage; #2076 and #2093 build on it; #2077/#2078 follow #2076.

### Task: #2092 feat: unified dialog and overlay system

Blockers: #2096 (lands first so this migrates HelpPanel's container after the content source changed), #2098, #2099, #2100.
Why this position: foundational primitive; the side panel (#2076) and settings dialog (#2093) land on it, so it opens the stage.
Scope: one Dialog primitive with three fixed sizes (S 420 / M 560 / L 720), built on the existing bits-ui wrapper pattern, rendering as a centred dialog on desktop and a bottom sheet with drag handle below the mobile breakpoint, same API. Consistent close button, Esc handling, and focus trap. Migrate all 9 dialogs (ExportDialog, ShareDialog, ImportFromNetBoxDialog, LoadDialog, CleanupDialog, CleanupPromptDialog, ConfirmDialog, ConfirmReplaceDialog, HelpPanel) and reuse the primitive in the 3 sheets (MobileFileSheet, MobileViewSheet, RackEditSheet). Reduced motion respected for enter/exit animations.
Key files: src/lib/components/Dialog.svelte, src/lib/components/BottomSheet.svelte, src/lib/components/DialogOrchestrator.svelte, src/lib/components/ui/Dialog/, src/lib/components/ExportDialog.svelte, src/lib/components/ShareDialog.svelte, src/lib/components/ImportFromNetBoxDialog.svelte, src/lib/components/LoadDialog.svelte, src/lib/components/CleanupDialog.svelte, src/lib/components/CleanupPromptDialog.svelte, src/lib/components/ConfirmDialog.svelte, src/lib/components/ConfirmReplaceDialog.svelte, src/lib/components/HelpPanel.svelte, src/lib/components/MobileFileSheet.svelte, src/lib/components/mobile/MobileViewSheet.svelte, src/lib/components/RackEditSheet.svelte.
Verify: npm run test:run, npm run lint, npm run build, npm run test:e2e (regenerate #2098 snapshots intentionally per the documented flow; axe scans stay green).
- [ ] Done when: all six issue ACs are checked and every listed dialog and sheet renders on the primitive.

### Task: #2076 feat: side panel architecture (tabbed Edit/View, collapsible)

Blockers: #2092, #2097 (mobile spike decisions land before this starts).
Why this position: owns the panel contract that #2077, #2078, and later #1398/#1948/#1939/#765 design against.
Scope: persistent right panel with Edit and View tabs and a slim collapsed rail; collapse state remembered across sessions; empty and multi-select states handled at the panel level. Audit a11y ACs are binding: focus never drops to body on collapse/expand or tab switch; collapse returns focus to the rail toggle; tab switch moves focus to the selected tab's panel heading; the panel uses landmark and label semantics so screen readers announce it.
Key files: src/lib/components/EditPanel.svelte, src/lib/components/ui/Tabs/, src/App.svelte, src/lib/stores/ui.svelte.ts.
Verify: npm run test:run, npm run lint, npm run test:e2e (axe scan added for the panel per #2099's pattern); manual keyboard walk of collapse/expand and tab switch confirming focus destinations.
- [ ] Done when: the three issue ACs plus the audit a11y ACs are met and the panel contract is in place for the tab issues.

### Task: #2077 feat: side panel Edit tab (contextual properties)

Blockers: #2076.
Why this position: first consumer of the panel contract; brings selection properties into the new shell.
Scope: Edit tab showing contextual properties for the current single or multi selection, with a clear empty-state prompt when nothing is selected. Properties reflect selection changes live.
Key files: src/lib/components/EditPanel.svelte, src/lib/components/DeviceDetails.svelte, src/lib/stores/selection.svelte.ts.
Verify: npm run test:run, npm run lint; manual: select device, rack, multi-select, and nothing, confirming the tab reflects each.
- [ ] Done when: properties reflect the current single or multi selection and the empty state is clear.

### Task: #2078 feat: side panel View tab (layout toggles)

Blockers: #2076.
Why this position: pairs with #2077 on the new panel; owns the annotations toggle that #2093 must not duplicate.
Scope: View tab with layout-scoped toggles (display mode, annotations, rear view), always reachable regardless of selection. Theme stays behind the Settings gear and is not duplicated here. Audit ACs: the display mode toggle mirrors the same layout-scoped state as the bottom-left lens (#2074, canonical) and the palette toggle (#2094); this issue owns the annotations toggle, absorbed from #2093's Appearance section and the current SettingsMenu, including re-scoping showAnnotations from ephemeral session state in ui.svelte.ts to a layout-scoped field.
Key files: src/lib/stores/ui.svelte.ts, src/lib/stores/layout.svelte.ts, src/lib/components/SettingsMenu.svelte.
Verify: npm run test:run, npm run lint; manual: toggle display mode here and at the lens, confirming one state across surfaces; annotations persist with the layout.
- [ ] Done when: layout-scoped toggles are present and always reachable, theme is not duplicated, and annotations are layout-scoped and owned here.

### Task: #2072 feat: reframe the top bar to workspace frame only

Blockers: #2098, #2099, #2100.
Why this position: early foundational slice; creates the frame that tabs (#2079), the app menu (#2073), and the chip dock into.
Scope: strip non-workspace controls from the top bar. Interim audit AC: at land time the tab strip, app menu, and chip may not all exist; this slice ships with an empty flex slot where they dock, and the "shows only logo/app-menu, tabs, storage chip, settings" AC is the end state, not this slice's exit criteria. Relocate the existing storage chip into the new top bar if #2035 (M15) has landed; otherwise the slot ships empty. View, history, and object controls leave the top bar (they move per #2074/#2075). No regression in settings or theme access.
Key files: src/lib/components/Toolbar.svelte, src/lib/components/SettingsMenu.svelte, src/App.svelte.
Verify: npm run test:run, npm run lint, npm run test:e2e (snapshots regenerated intentionally; #2183's per-slice call decides which Toolbar specs rewrite vs delete); manual: settings and theme still reachable.
- [ ] Done when: the top bar carries only workspace-frame elements plus the documented empty slot, and settings/theme access has no regression.

### Task: #2074 feat: move canvas view and history controls to bottom-left

Blockers: #2098, #2099, #2100.
Why this position: early foundational slice; pairs with #2072 to empty the top bar and establishes the canonical display-mode control.
Scope: relocate view and history controls to the bottom-left of the canvas in two visually separated groups: History (undo, redo) and View (zoom out, zoom readout, zoom in, fit, display-mode lens). All existing actions preserved and keyboard accessible; removed from the top bar. Audit AC: the display-mode lens here is the canonical control; the View tab (#2078) and palette toggle (#2094) mirror the same layout-scoped state per the spec's canonical-home table.
Key files: src/lib/components/Toolbar.svelte, src/lib/stores/canvas.svelte.ts, src/lib/stores/history.svelte.ts, src/lib/components/KeyboardHandler.svelte.
Verify: npm run test:run, npm run lint, npm run test:e2e; manual: undo/redo, zoom, fit, and lens all work from the new groups and via keyboard.
- [ ] Done when: two distinct bottom-left groups exist, all view/history actions are preserved and keyboard accessible, and the top bar no longer carries them.

### Task: #2093 feat: settings dialog with Appearance, Behaviour, and Data sections

Blockers: #2092. Pairs with #2072, which touches the gear.
Why this position: consumes the dialog primitive and consolidates the fragmented settings surfaces while the top bar is being reframed.
Scope: replace the SettingsMenu dropdown with a sectioned Settings dialog (size S) opened from the gear. Appearance: theme, banana for scale. Behaviour: compatible devices only, warn on unsaved changes, cleanup prompts. Data: clean up unused device types, reset dismissed prompts. Audit correction: show annotations is layout-scoped and lives in the side panel View tab (#2078); it is removed from this dialog's Appearance section, and the existing SettingsMenu toggle migrates to #2078, not here. Theme toggles are removed from CanvasContextMenu and HelpPanel so this dialog is the single canonical home. Settings persist as today.
Key files: src/lib/components/SettingsMenu.svelte, src/lib/components/CanvasContextMenu.svelte, src/lib/components/HelpPanel.svelte.
Verify: npm run test:run, npm run lint, npm run test:e2e; manual: theme changes only from Settings; dismissed prompts resettable under Data.
- [ ] Done when: the issue ACs minus the annotations item are met, annotations live only in #2078, and theme has a single canonical home.

## Stage 2: Tabs and entry

Tabs build on the wave-0 designs (#2018, #2179, #2182) and the Stage 1 top bar. Entry (StartScreen removal) gates on the app menu shell and the layouts sidebar.

### Task: #2079 feat: tab strip for open layouts

Blockers: #2018, #2179, #2072, #2035 (M15, per-layout durability source).
Why this position: first tabs slice; docks into the top bar slot and establishes the open-set model that #2080, #2082 sync, and #2045 ride.
Scope: tab strip showing open layouts with drag-to-reorder, hover close affordance, and an unbacked-changes dot on inactive tabs; closing a tab does not delete the layout (it persists in the sidebar, semantics per #2179); Alt+1-9 tab navigation avoiding browser-reserved Ctrl+W/T/Tab. Audit ACs: roving tabindex across tabs, aria-selected on the active tab, documented tab focus order; the dot carries accessible text (for example "unsaved changes"), never colour alone; the dot reads from the same per-layout durability source as the storage chip (#2035's derived-over-collection API), including how unloaded lazily-restored tabs count toward the workspace rollup, with no second bookkeeping. Undo behaviour across switches per #2182's handed AC.
Key files: src/App.svelte, src/lib/components/KeyboardHandler.svelte, src/lib/storage/working-copy.ts, src/lib/storage/manager.svelte.ts (new tab strip component added beside them).
Verify: npm run test:run, npm run lint, npm run test:e2e (axe scan on the strip; #2183 harness for multi-context cases); manual: reorder, close, Alt+1-9, dot text via screen reader.
- [ ] Done when: the issue ACs plus the audit a11y and aggregation ACs are met with one durability source.

### Task: #2080 feat: lazy tab restore on launch

Blockers: #2079, #2081, #2179, #2182, #2183 (multi-context harness for its tests).
Why this position: completes the tabs model; needs the strip, the entry rework, the storage schema, and the undo decision in place.
Scope: on launch, open straight to the canvas and restore the full set of previously open tabs; load the active layout immediately and the rest when focused; discard the undo stack when a tab closes (per #2182's decision). Audit ACs: define focus destination and screen-reader announcement when a lazily-restored tab loads and when it fails; define degraded launch states (whole-set restore failure in server mode, cross-mode tab set after a storage-mode flip) distinguished from #2081/#2095's first-run empty state, pairing with spike #2018's answers.
Key files: src/lib/storage/manager.svelte.ts, src/lib/storage/load-pipeline.ts, src/lib/storage/working-copy.ts, src/App.svelte.
Verify: npm run test:run, npm run test:e2e (multi-tab restore scenario on the #2183 harness); manual: relaunch with several tabs open, confirm only the active loads eagerly and focus/announcement behave as defined.
- [ ] Done when: the app opens to canvas with the prior tab set restored, only the active layout loads eagerly, and the focus and degraded-launch ACs are met.

### Task: #2073 feat: app menu in the logo

Blockers: #2096, #2072.
Why this position: audit split: this is slice (a), the menu shell with mode-agnostic items, sequenced after the registry that feeds its items; it un-gates the StartScreen-removal chain from M15.
Scope: lean app menu behind the logo with mode-agnostic items: new layout, open layout, import devices, import from NetBox, new custom device, export image, export backup, share link, view YAML, keyboard shortcuts, about. Menu opens from the logo and is keyboard accessible (that AC stays here). Items render from #2096 registry entries. Replaces scattered top-bar entry points. The mode-aware Save/Export logic is split to #2187 and does not block this slice.
Key files: src/App.svelte, src/lib/components/Toolbar.svelte, src/lib/utils/app-actions.ts.
Verify: npm run test:run, npm run lint, npm run test:e2e (axe scan on the open menu); manual: full keyboard traversal of the menu.
- [ ] Done when: the menu opens from the logo, is keyboard accessible, renders registry-fed mode-agnostic items, and replaces the scattered entry points.

### Task: #2187 feat: app menu mode-aware items (split from #2073)

Blockers: #2073, #2037 (M15).
Why this position: slice (b) of the menu; isolated so the storage-mode gate does not hold up the entry chain.
Scope: mode-aware Save/Export menu item logic: items reflect the active storage mode (browser vs server wording, enabled/disabled states), gated on the explicit storage mode from #2037. This is the AC split out of #2073.
Key files: src/lib/storage/availability.svelte.ts, src/lib/storage/api.ts, src/lib/utils/app-actions.ts.
Verify: npm run test:run, npm run lint; manual: flip storage mode config and confirm Save/Export items change wording and enablement.
- [ ] Done when: Save/Export items reflect the active storage mode in both wording and enabled state.

### Task: #2082 feat: layouts library sidebar tab

Blockers: #2179. The list-and-tab-strip sync AC is deferred until #2079 lands (audit: it was untestable as written).
Why this position: the durable library surface that entry (#2081) routes through; can start as soon as the storage schema design lands.
Scope: third sidebar tab beside Devices and Racks with a compact row list: preview, name, meta; open layouts show an indicator and the active one is highlighted; new-layout action at top; per-row hover/right-click rename, duplicate, export, delete. Audit ACs: open/active indicators are never colour-only (pair dot and highlight with text or icon, the WCAG 1.4.1 class fixed on the chip via #2035); full keyboard navigation of the list (arrow keys, Enter to open, Delete with confirm); browser-mode "durable library of everything that exists" follows the #2179 schema.
Key files: src/App.svelte, src/lib/components/DevicePalette.svelte, src/lib/components/RackList.svelte, src/lib/storage/manager.svelte.ts.
Verify: npm run test:run, npm run lint, npm run test:e2e (axe scan on the tab); manual: keyboard-only walk of the list and row actions.
- [ ] Done when: the tab lists all layouts with accessible open/active state, per-row actions, and full keyboard navigation; the sync AC closes after #2079.

### Task: #2081 feat: remove StartScreen, route entry through sidebar and app menu

Blockers: #2073 (slice a only, per the audit-corrected dependency), #2082.
Why this position: entry rework; needs both replacement surfaces (menu and sidebar) before the StartScreen can go.
Scope: remove the StartScreen; its functions (new layout, import, saved layouts list) move to the sidebar Layouts tab and the app menu; on true first launch with no layouts, show the existing WelcomeScreen empty state. Audit ACs: define where focus lands on launch without StartScreen (first interactive element of the workspace, announced for screen readers); the zero-layout returning user sees an empty state clearly distinguished from data loss (lost-data-empty vs fresh-install-empty; spike #2018 owns the detection question).
Key files: src/lib/components/StartScreen.svelte (deleted), src/lib/components/WelcomeScreen.svelte, src/App.svelte, src/lib/utils/focus.ts.
Verify: npm run test:run, npm run lint, npm run test:e2e (#2183's call on StartScreen specs applied; snapshots regenerated); manual: fresh profile launch lands focus as defined; all StartScreen functions reachable via menu and sidebar.
- [ ] Done when: StartScreen is removed, functions are reachable via sidebar and app menu, and the launch-focus and empty-state ACs are met.

### Task: #2095 feat: template empty state for new layouts

Blockers: #2081 (entry-point routing only). The audit decouples v1 from #2083: a first template chooser may ship on the existing WelcomeScreen with static pre-rendered preview images. Template CI validation needs #571 (M03); authoring sequences after #2158's schema bump or templates are re-exported post-bump.
Why this position: lands with #2081 so the removal and its replacement ship as one coherent slice; v1 may land earlier on WelcomeScreen per the audit.
Scope: the empty-canvas state becomes a template chooser plus the add-rack call to action: three to four starter templates (for example Home Lab, Network Closet, Media Server) as preview cards; templates are .rackula.yaml files in static/templates (format corrected by the audit: YAML, not .zip), validated in CI against the published JSON Schema (#571), so adding one requires no code; previews use the #2083 pipeline or static images for v1; below the templates, the existing add-rack, import file, and scan QR entry points; the empty state falls back to the WelcomeScreen baseline when templates fail to load. Templates double as living schema examples (#571) and regression fixtures (#1114). Supersedes #115.
Key files: src/lib/components/WelcomeScreen.svelte, static/templates (new directory), src/lib/schemas/.
Verify: npm run test:run, npm run lint, npm run build; CI shows template schema validation; manual: choose a template, confirm it loads as a new layout with normal undo and storage semantics.
- [ ] Done when: the empty canvas shows template cards, choosing one loads a new layout, entry points remain, templates load from static/templates with no per-template code, and the fallback works.

### Task: #2083 feat: cached layout previews in the Layouts sidebar

Blockers: #2082.
Why this position: replaces the sidebar's placeholders once the tab exists; #2095's full preview cards consume the same pipeline.
Scope: real cached mini-renders of layouts (not placeholders) in the Layouts sidebar tab, regenerated on save, with render-to-miniature logic and bounded cache management. Audit AC: previews render in a non-executing context (img src=data: base64 raster or canvas rasterization); never inject preview SVG via {@html} with user-controlled strings; user text (layout, rack, device names) is set via textContent or attribute bindings only.
Key files: src/lib/utils/export.ts (existing render pipeline), src/lib/components/Rack.svelte, src/lib/components/RackList.svelte (new preview-cache module added beside the storage layer).
Verify: npm run test:run, npm run lint; manual: save a layout and confirm the preview regenerates; inspect the DOM to confirm previews are raster/canvas, not injected SVG markup.
- [ ] Done when: real miniatures show per layout, regenerate on save with a bounded cache, and render in a non-executing context.

## Stage 3: Objects, palette, and export

The object and palette passes need the Stage 0 spikes and Stage 1 canonical controls; export-all needs the storage schema and benefits from tabs.

### Task: #2094 feat: device palette favourites, virtualization, and image toggle

Blockers: #2074 (canonical display-mode lens exists to mirror); #2100's 44px gate applies (green since Stage 0).
Why this position: one coherent pass over the Devices tab after the sidebar gained the Layouts tab and the canonical display-mode home is settled.
Scope: pinned section at the top of the palette with pin/unpin from item hover and context menu, persisting per browser; virtualized list rendering with smooth scrolling at 500+ device types while search, grouping modes, and keyboard navigation keep working; display-mode toggle surfaced in or near the palette header, mirroring the layout-scoped state owned by #2074 (discoverability half of #1540). Keyboard navigation and screen-reader announcements preserved. Audit notes: supersedes #114 (closed into this); #1052 closed as input here, so honour 44px touch targets in the virtualized rows.
Key files: src/lib/components/DevicePalette.svelte, src/lib/components/DevicePaletteItem.svelte, src/lib/utils/deviceFilters.ts, src/lib/utils/deviceGrouping.ts.
Verify: npm run test:run, npm run lint, npm run test:e2e (#2185's palette-scroll budget; axe scan); manual: pin/unpin persists across reload; scroll a large library smoothly; toggle mirrors the lens.
- [ ] Done when: all six issue ACs are checked, including persistence, virtualization at 500+, and the mirrored display-mode toggle.

### Task: #2075 feat: floating object verb bars for devices and racks

Blockers: #2096, #2097, #2158 (M03 carrier model). #2146 is closed, so the contained-device guard exists to route through.
Why this position: the object-interaction slice; sequenced after the registry (actions), the mobile spike (desktop-only calls), and the M03 carrier model (slot affordance).
Scope: floating action bars above selected objects. Device bar: move up, move down, flip face, duplicate, delete, plus slot control (half-width only). Rack bar: duplicate, focus, export, delete. Right-click mirrors the actions; bars flip below when near the object name; fully keyboard accessible per docs/guides/ACCESSIBILITY.md; a low-zoom threshold rule so bars do not dwarf small targets. Audit ACs: the slot control is designed against #2158's carrier model, not the slot_position pathway it deletes; verb-bar move up/down routes through the shared movement layer and respects the contained-device guard from #2146 (no ejecting children from carriers); record which behaviours are desktop-only per the #2097 outcome.
Key files: src/lib/utils/device-movement.ts, src/lib/stores/layout/device-actions.ts, src/lib/stores/selection.svelte.ts, src/lib/components/CanvasContextMenu.svelte, src/lib/components/RackContextMenu.svelte.
Verify: npm run test:run (movement-guard cases), npm run lint, npm run test:e2e (axe scan; snapshots); manual: verb-bar nudge of a contained device stays contained; bars reposition near the name.
- [ ] Done when: the issue ACs plus the audit carrier, guard, and desktop-only ACs are met.

### Task: #2045 feat: export-all with per-mode framing

Blockers: #2179. Stated dependencies #2034 and #2036 are closed. Rides #2079 (tabs) but does not hard-block on it: until tabs land it degrades to the single open layout (browser) or the server list (server).
Why this position: moved into M14 from M15 by the audit to ride the tabs work; the per-layout counters it resets come from the #2179 schema.
Scope: one ZIP artifact for all layouts via downloadArchive() mechanics, framed per storage mode. Browser mode: "Back up all layouts", resets per-layout counters, drives the chip. Server mode: "Export a copy", no chip effect, pulls YAML from GET /layouts; per the spec amendment, server mode flushes pending debounced saves before building the archive. See docs/research/spike-2019-storage-model-data-safety.md (export-all framing).
Key files: src/lib/utils/archive.ts, src/lib/storage/api.ts, src/lib/utils/export.ts.
Verify: npm run test:run, npm run lint; manual in both modes: archive contains every layout, browser-mode counters reset and the chip reacts, server-mode export follows a just-made edit (flush verified).
- [ ] Done when: the four issue ACs are checked and server-mode export flushes pending saves first.

## Stage 4: Deferred

### Task: #2020 Command palette

Blockers: #2096 (the registry the palette would layer on).
Why this position: the build-now-or-later call is made: build later. The spike is non-blocking for all shell work and is parked last; if it is still deferred at milestone close, re-milestone it rather than holding M14 open.
Scope: design spike for the palette itself: which commands it indexes (file operations, view toggles, layout switching, selection-aware verbs, device search and placement); invocation and discoverability (verify Ctrl+K interception per browser across Chrome, Firefox, and Safari rather than assuming it); its relationship to the menu (an accelerator, never the sole path to Save, Share, or Export); behaviour (fuzzy search, recents, contextual command set). Recommendation per question with a mock, recorded back into the design spec.
Key files: docs/superpowers/specs/2026-06-09-canvas-ux-overhaul-design.md, docs/research/ (spike output as 2020-spike.md).
Verify: spec diff records the recommendations; gh issue close 2020 (or gh issue edit 2020 --milestone <later> if deferred at close).
- [ ] Done when: a recommendation for each question with a mock is recorded in the spec, or the issue is explicitly re-milestoned per the build-later call.

## Verification

Milestone close-out checklist:

- [ ] gh issue list -R RackulaLives/Rackula --milestone "M14 -- Canvas UX Overhaul" --state open returns no issues (or only #2020, explicitly re-milestoned per its build-later call).
- [ ] Epic #2017 closed: every child checkbox in its body is done, including the surface-consistency and guard-rail lists.
- [ ] Guard rails stayed green throughout: #2098 visual snapshots, #2099 axe scans, and #2185's perf gate pass on main; no unexplained snapshot or baseline churn.
- [ ] npm run test:run, npm run lint, npm run build, and npm run test:e2e all pass on main.
- [ ] Shell smoke (manual, fresh profile): app opens straight to the canvas with no StartScreen; prior tab set restores lazily; top bar carries only logo/app-menu, tabs, storage chip, settings; bottom-left shows the History and View groups; side panel offers Edit and View tabs and collapses to a rail; verb bars float on device and rack selection; the Layouts sidebar tab lists layouts with real previews; Settings dialog is the only theme home; export-all produces one ZIP framed for the active mode.
- [ ] Canonical-home invariants hold (spec table): display mode is one state across lens, View tab, and palette toggle; annotations live only in the View tab; per-layout durability feeds chip, tab dots, and sidebar dots from one source.
- [ ] Wave-0 design outputs are recorded in the spec or docs/research/ and their handed ACs were honoured by the consuming issues (#2018, #2179, #2182, #2183, #2184, #2185, #2097).
- [ ] Cross-milestone follow-ups exist: M12 issues filed from #2097; M15 issues #2041/#2042/#2044 reference the #2018/#2182 answers.
