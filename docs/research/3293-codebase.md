# Spike #3293: codebase findings

Scope: the codebase facts behind "support layouts of about 100 racks instead of a fixed rack cap". Written against the worktree at `4c627f07` (post v26.9.0). Every claim cites `path:line` verified by reading the file at that line. Prior spike #3287's measurements are in `docs/research/3287-scale.md`; its codebase notes (`docs/research/3287-codebase.md` sections 5, 6, 11) were re-verified here because line numbers moved since v26.8.0.

Arithmetic marked "derived" is computed from the constants cited, not measured.

Citation caveat: line numbers are against the committed tree at `4c627f07`. While this was being written, an uncommitted prototype for this spike appeared in the same worktree on `src/lib/components/RackFrame.svelte` (it collapses the grid lines and rail holes into one `<path>` each), which shifts that one file's template lines by about +19 relative to the numbers cited below. Read it with `git show HEAD:src/lib/components/RackFrame.svelte` to match.

## Files Examined (path: purpose)

- `src/lib/types/constants.ts`: MAX_RACKS and the other domain limits.
- `src/lib/stores/layout.svelte.ts`: layout store state, `canAddRack`, derived surface.
- `src/lib/stores/layout/rack-actions.ts`: addRack, addBayedRackGroup, duplicateRack, cap checks.
- `src/lib/stores/layout/rack-groups.ts`: group CRUD, addBayToGroup, setBayCount, createBayedRack, cap checks.
- `src/lib/stores/layout/mutators.ts`: raw mutators; every mutation replaces the whole layout object.
- `src/lib/stores/layout/layout-lifecycle.ts`: `loadLayout`, the single store ingress for every load path.
- `src/lib/stores/canvas.svelte.ts`: panzoom instance, ZOOM_MIN/MAX, fitAll, focusRack, ensureRacksVisible, zoomToDevice.
- `src/lib/utils/canvas.ts`: rack-to-canvas geometry, fit-all maths, bayed/dual-view dimensions.
- `src/lib/utils/rack-row.ts`: `organizeRackRow`, row ordering, reorder and bay planning.
- `src/lib/utils/panzoom-lifecycle.ts`: panzoom construction, wheel and mousedown gating.
- `src/lib/components/Canvas.svelte`: viewport shell, panzoom container, gestures, a11y description.
- `src/lib/components/RackCanvasView.svelte`: the single row, row slots, resize and bay grips.
- `src/lib/components/RackDualView.svelte`: front and rear `Rack` instances per rack.
- `src/lib/components/BayedRackView.svelte`: stacked front/rear rows for a bayed group.
- `src/lib/components/Rack.svelte`: one SVG face, device list, drop handling, ConnectionLayer mount.
- `src/lib/components/RackFrame.svelte`: per-U frame chrome (slots, grid, holes, labels).
- `src/lib/components/RackDevice.svelte`: one placed device (rect, label, icon, image, ports, children).
- `src/lib/components/PortIndicators.svelte`: per-port circles, hit targets, grouped badges.
- `src/lib/components/ConnectionLayer.svelte` and `src/lib/utils/connection-path.ts`: connection anchoring and routing.
- `src/lib/components/VerbBarOverlay.svelte`: selection-anchored verb bar, DOM measurement loop.
- `src/lib/components/RackList.svelte`, `src/lib/components/mobile/RackIndicator.svelte`, `src/lib/components/mobile/MobileRacksSheet.svelte`: rack-finding UI.
- `src/lib/actions/registry.ts`, `src/lib/actions/dispatch.ts`, `src/lib/actions/selection-actions.ts`: commands, keybindings, selection verbs.
- `src/lib/utils/export/svg.ts`, `raster.ts`, `vector.ts`, `multi.ts`, `src/lib/utils/app-actions.ts`: export pipeline.
- `src/lib/components/ExportDialog.svelte`, `src/lib/components/LayoutsLibrary.svelte`, `src/lib/components/layout-preview-render.ts`, `layout-preview-cache.ts`: export preview and thumbnails.
- `src/lib/utils/share.ts`, `src/lib/schemas/share.ts`, `src/lib/components/ShareDialog.svelte`: share-link format and limits.
- `src/lib/utils/yaml.ts`, `src/lib/utils/yaml-field-order.ts`, `src/lib/utils/archive.ts`, `src/lib/utils/archive-extract.ts`: YAML and ZIP read/write and their size caps.
- `src/lib/schemas/index.ts`, `src/lib/schemas/migrations.ts`: layout schema, transform, superRefine, version gate.
- `src/lib/storage/adapt-legacy-layout.ts`, `load-pipeline.ts`, `api.ts`, `browser-workspace.ts`, `browser-workspace-persist.ts`, `manager.svelte.ts`: load path, server and browser persistence.
- `src/lib/components/PersistenceEffects.svelte`: browser autosave effect.
- `api/src/app.ts`, `api/src/routes/layouts.ts`, `api/src/schemas/layout.ts`, `api/src/yaml-safety.ts`, `api/src/security/storage-quota-middleware.ts`: server-side limits.
- `src/lib/utils/netbox-import.ts`, `src/lib/components/ImportFromNetBoxDialog.svelte`, `scripts/import-netbox-devices.ts`: what NetBox import actually imports.
- `e2e/multi-rack.spec.ts`, `src/tests/layout-rack-actions.test.ts`, `src/tests/layout-store.test.ts`, `docs/research/3287-scale-measure.mjs`: tests and harness pinned to the cap and to full-DOM rendering.
- `src/tests/fixtures/upgrade-corpus/`, `scripts/check-corpus-freshness.sh`: prior-release data contract.

## 1. Cap enforcement

Constant and derived flag:

- `MAX_RACKS = 10`, commented "v0.6.0: Multi-rack support enabled" (`src/lib/types/constants.ts:87-90`).
- `canAddRack = layout.racks.length < MAX_RACKS` (`src/lib/stores/layout.svelte.ts:216`), exposed at `src/lib/stores/layout.svelte.ts:284-286`, and pinned in the store contract test list (`src/tests/layout-store-contract.test.ts:27`).

Every site that reads the cap (7 in app code):

- `addRack` returns null at the cap (`src/lib/stores/layout/rack-actions.ts:313-316`).
- `addBayedRackGroup` returns null when `racks.length + bayCount > MAX_RACKS` (`src/lib/stores/layout/rack-actions.ts:404-407`).
- `duplicateRack` returns `{ error: "Maximum of 10 racks allowed" }` (`src/lib/stores/layout/rack-actions.ts:620-622`).
- `addBayToGroup` returns `{ error: "Maximum rack limit reached" }` (`src/lib/stores/layout/rack-groups.ts:456-458`).
- `setBayCount` returns `{ error: "Maximum rack limit would be exceeded" }` (`src/lib/stores/layout/rack-groups.ts:622-624`).
- `createBayedRack` returns `{ error: "Maximum rack limit reached" }` (`src/lib/stores/layout/rack-groups.ts:838-840`).
- `handleNewRack` checks `canAddRack` before calling the store (`src/lib/utils/dialog-actions.ts:63-66`).

User-facing messages:

- Add rack: toast, warning, "Maximum number of racks reached" (`src/lib/utils/dialog-actions.ts:65`).
- Duplicate rack (context menu): toast, error, the store's `Maximum of 10 racks allowed` (`src/lib/utils/rack-actions.ts:40-41`).
- Duplicate selection (Ctrl+D on a rack): same string, error toast (`src/lib/actions/selection-actions.ts:414-416`).
- Bay a rack (verb bar or edge grip): toast, warning, `Maximum rack limit reached`, plus `hapticError()` (`src/lib/actions/selection-actions.ts:298-306`).
- Bay count field in the rack edit sheet: inline error text, not a toast (`src/lib/components/RackEditSheet.svelte:167-170`).
- Nothing disables an affordance: the palette's `create-rack` is gated only on `!ctx.readOnly` (`src/lib/actions/registry.ts:545-556`), and the bay verb only on the bayed-racks setting and selection shape (`src/lib/components/VerbBarOverlay.svelte:106-108`). The cap is always discovered after the click.

Load paths: none check the cap.

- `loadLayout` is the single store ingress (`src/lib/stores/layout/layout-lifecycle.ts:35-229`); it adapts legacy data, regenerates ids, defaults `position` to the array index (`:122`), dedups port ids (`:149-180`), and sets the layout (`:209-215`). No rack-count check.
- `LayoutSchema` requires at least one rack (`src/lib/schemas/index.ts:884-891`) and has no upper bound: `racks: z.array(RackSchemaInput).optional()` (`src/lib/schemas/index.ts:781`).
- File open and API load funnel through `finalizeLayoutLoad` (`src/lib/storage/load-pipeline.ts:44-101`, `loadLayout` at `:74`), which also runs `fitAll` on the next frame (`:82-84`).
- Share link: decode then `loadLayout` plus `fitAll` (`src/App.svelte:229-251`); an invalid link toasts "Invalid share link" (`src/App.svelte:276`).
- Starter templates: `openStarter` clones the parsed layout into a new tab and fits (`src/lib/stores/starter-templates.svelte.ts:85-101`). The three shipped starters are `home-lab`, `network-closet`, `media-server` (`src/lib/templates/starter-templates.ts:41-45`), all fetched together on first use (`src/lib/templates/starter-templates.ts:128-135`).
- YAML editor apply: `loadLayout` with export-tracking preserved (`src/lib/components/DialogOrchestrator.svelte:302-314`).
- Workspace restore and tab hydration: `loadLayout` at `src/lib/stores/workspace.svelte.ts:191`, `:286`, `:382`.
- Result today: a 71-rack file opens, autosaves, and renders; only the add, duplicate and bay verbs refuse (confirmed by measurement in `docs/research/3287-scale.md`).

NetBox: there is no rack or inventory importer.

- The in-app dialog parses one netbox-community devicetype-library YAML (pasted text or one file) into one layout-scoped `DeviceType` (`src/lib/utils/netbox-import.ts:1-4`, `:883-898`; `src/lib/components/ImportFromNetBoxDialog.svelte:163`, `:222`, `:271-290`).
- `scripts/import-netbox-devices.ts`, `scripts/bulk-import-netbox.ts`, `scripts/curated-import.ts` generate brand-pack TypeScript, not layouts.
- So "a NetBox import with many racks" can only reach the app as an externally produced Rackula YAML through File Open, which is uncapped.

Paste and other multi-rack creation:

- There is no rack paste path (no clipboard rack handling in `src/lib`; the only "paste" hits are the NetBox dialog's textarea).
- `createRackGroup` (row preset) exists in the store (`src/lib/stores/layout/rack-groups.ts:195`, `:228`; wrapper `src/lib/stores/layout.svelte.ts:561`) but no component calls it: row groups can only arrive from a file or the YAML editor.

Other count limits anywhere:

- Rack height 1 to 100U (`src/lib/types/constants.ts:65-66`, schema `src/lib/schemas/index.ts:637-641`, `:674-678`).
- Device height 0.5 to 42U (`src/lib/types/constants.ts:71-72`).
- Undo history depth 50 (`src/lib/stores/history.svelte.ts:16`).
- Ports: no count limit, but more than 24 visible ports on a face switches to grouped badges with no anchors (`src/lib/utils/port-geometry.ts:33`, `:129-130`).
- Connections, devices, groups, device types: no maximum anywhere. `RackGroupSchema.rack_ids` is `min(1)` with no max (`src/lib/schemas/index.ts:710-719`).
- Server: per-user layout count and per-layout asset count quotas only (`api/src/security/storage-quota-middleware.ts:43-70`, wired at `api/src/app.ts:907-918`). No rack or device limit in `api/src/schemas/layout.ts:197-228`.

Tests pinned to 10:

- `e2e/multi-rack.spec.ts:56-71` creates 9 more racks, asserts 10 fronts, then asserts a warning toast on the 11th.
- `src/tests/layout-rack-actions.test.ts:121-142` loops 9 and 8 racks to hit the cap for 2-bay and 3-bay groups.
- `src/tests/layout-store.test.ts:54-56` asserts `canAddRack` under the cap.

## 2. Canvas layout and navigation

Component tree from canvas root to one device SVG:

- `Canvas.svelte` owns the viewport, the panzoom container (`src/lib/components/Canvas.svelte:464`) and mounts `RackCanvasView` (`:465`).
- `RackCanvasView.svelte` derives row items via `organizeRackRow` (`src/lib/components/RackCanvasView.svelte:107`) and renders one `.row-slot` per item in a flex row (`:638`, CSS `:865-873`).
- A standalone rack renders `RackDualView` (`:656`); a bayed group renders `BayedRackView` (`:755`); a row group renders a bordered, labelled container whose members are each a `RackDualView` (`:816-825`).
- `RackDualView` renders two `Rack` instances, `faceFilter="front"` (`src/lib/components/RackDualView.svelte:340-349`) and, when `rack.show_rear`, `faceFilter="rear"` (`:368-379`), both with `hideRackName={true}` and a FRONT/REAR view label.
- `Rack.svelte` is one `<svg>` per face (`src/lib/components/Rack.svelte:542`) holding `RackFrame` (`:564`), a `<g>` with one `RackDevice` per visible top-level device (`:588-603`), and one `ConnectionLayer` (`:647`).
- `RackDevice.svelte` renders the device group and, separately, its container children (`src/lib/components/RackDevice.svelte:848-1133`).
- `BayedRackView` renders every member's front row (`src/lib/components/BayedRackView.svelte:421-463`) above every member's rear row (`:535-577`), with `hideULabels={true}` because the group shares one U-label column.

Positioning today:

- One bottom-aligned horizontal row, ordered by `Rack.position`, an integer order index (`src/lib/schemas/index.ts:652`, `:690`). The template comment states "There is no free 2D placement" (`src/lib/components/RackCanvasView.svelte:600-607`).
- `organizeRackRow` gives each group one row slot at its lowest-position member, keeps members contiguous, claims a rack for the first group that lists it, and sorts slots by position with an insertion-sequence tie-break (`src/lib/utils/rack-row.ts:21-64`).
- No x/y, row index, hall, or wrap field exists on `Rack`, `RackGroup`, or `settings` (`src/lib/schemas/index.ts:630-719`, `:771-789`). `RackGroup` carries only `id`, `name`, `rack_ids`, `layout_preset` (bayed or row), plus passthrough (`:710-719`).
- Sizes (`src/lib/constants/layout.ts`): `U_HEIGHT_PX = 22` (`:24`), `RAIL_WIDTH = 17` (`:30`), `BASE_RACK_WIDTH = 220` (`:36`), `RACK_PADDING_HIDDEN = 4` (`:48`), `RACK_ROW_PADDING = 16` (`:62`), `DUAL_VIEW_GAP = 24` (`:68`), `DUAL_VIEW_EXTRA_HEIGHT = 64` (`:85`), `RACK_GAP = 24` (`:91`), `FIT_ALL_PADDING = 48` (`:101`), `SELECTION_HIGHLIGHT_PADDING = 8` (`:119`).
- Derived: a dual-view 19-inch slot is 220x2 + 24 + 2x8 = 480 px wide and, at 48U, 4 + 34 + 1056 + 64 + 16 = 1174 px tall (`src/lib/utils/canvas.ts:317-337`), so the row pitch is 504 px. 69 racks is about 34,800 px; 100 racks is about 50,400 px.

Fit-all and the zoom floor:

- `ZOOM_MIN = 0.25`, `ZOOM_MAX = 2` (`src/lib/stores/canvas.svelte.ts:34-35`), passed to panzoom at construction (`src/lib/components/Canvas.svelte:312-315`, `src/lib/utils/panzoom-lifecycle.ts:129-131`), so wheel zoom-out also stops at 0.25.
- A second copy of the floor lives in `src/lib/utils/canvas.ts:95` (`FIT_ALL_MIN_ZOOM = 0.25`, comment "must match ZOOM_MIN in canvas store") and is applied at `:136-139`; the same constant also floors `ensureVisibleTransform` (`:232-236`).
- `calculateFitAll` zooms to the bounding box plus padding, then, when the scaled content still overflows, aligns top-left instead of centring (`src/lib/utils/canvas.ts:112-168`).
- The zoom ladder for the +/- buttons is `[0.25 ... 2.0]` (`src/lib/stores/canvas.svelte.ts:38`, `snapZoom` `:46-53`), used by `zoomIn`/`zoomOut` (`:312-340`) from `CanvasViewControls.svelte:131`, `:157` and `MobileViewSheet.svelte:113`, `:130`. There is no keyboard zoom binding; `filterKey: () => true` disables panzoom's own keys (`src/lib/utils/panzoom-lifecycle.ts:179`). The only navigation binding is `f` for fit-all (`src/lib/actions/registry.ts:188-195`).
- A second, apparently unused zoom range exists in the UI store: `ZOOM_MIN = 50`, `ZOOM_MAX = 200` with `zoomIn`/`zoomOut`/`setZoom` (`src/lib/stores/ui.svelte.ts:198-200`, `:410-437`). No component reads `uiStore.zoom`.
- Derived: fitting 100 dual racks into a 1600 px viewport needs about 0.032 zoom; at the 0.25 floor about 12 to 13 racks are visible. A 10x10 grid would need about 0.083 and a 20x5 grid about 0.157, both still below the floor, so any 100-rack framing requires lowering `ZOOM_MIN` whatever the layout shape.

Fit-all is called far more often than the toolbar button:

- After every load (`src/lib/storage/load-pipeline.ts:82-84`), share load (`src/App.svelte:249-251`), starter open (`src/lib/stores/starter-templates.svelte.ts:99`), new rack (`src/lib/utils/dialog-actions.ts:91`), rack duplicate (`src/lib/utils/rack-actions.ts:44`, `src/lib/actions/selection-actions.ts:419-421`), successful tap-to-place (`src/lib/components/RackCanvasView.svelte:485`), keyboard placement (`src/lib/components/KeyboardHandler.svelte:62-63`), panzoom init (`src/lib/components/Canvas.svelte:318-322`), double-tap on mobile (`:168-174`), and many dialog closes (`src/lib/components/DialogOrchestrator.svelte:276-300`, `:735`, `:780-787`).
- Several of those calls omit `rack_groups` (`src/lib/components/Canvas.svelte:172`, `:321`, `:410`; `src/lib/components/RackCanvasView.svelte:485`), so bayed groups are measured as ungrouped dual-view racks in those fits.
- At 100 racks each of these snaps the camera to the 0.25 floor and top-left, discarding the user's position.

Finding a rack today:

- Rack list in the sidebar (`src/App.svelte:645`, `src/lib/components/RackList.svelte`): ungrouped racks plus groups, no search, no virtualisation; a click selects and activates but does not move the camera (`src/lib/components/RackList.svelte:73-76`).
- Focus rack (pan and zoom to fit one rack or a whole bayed group) exists as a context-menu and verb entry: `handleRackContextFocus` (`src/lib/utils/rack-actions.ts:86-97`) to `canvasStore.focusRack` (`src/lib/stores/canvas.svelte.ts:607-680`); palette id `focus-rack`, enabled only when a rack is selected, no keybinding (`src/lib/actions/registry.ts:367-373`, `src/lib/actions/dispatch.ts:282-285`).
- Previous/next rack, bound to `[` and `]` (`src/lib/actions/registry.ts:196-216`), cycles `layout.racks` array order, not row order, and does not move the camera; it only sets active, selects, and toasts the name (`src/lib/actions/dispatch.ts:126-148`).
- Command palette has no rack or placed-device search: its second page searches the device-type library for placement (`src/lib/components/CommandPalette.svelte:58`, `:110-136`).
- Mobile: swipe left/right switches rack in array order and focuses it (`src/lib/utils/canvas-swipe.svelte.ts:99-118`); a rack indicator shows dots for up to 7 racks and an "n/total" counter above that (`src/lib/components/mobile/RackIndicator.svelte:18`, `:30`, `:62-67`); a racks sheet lists every rack and opens its edit sheet (`src/lib/components/mobile/MobileRacksSheet.svelte:44-46`).
- There is no minimap, no jump-to-rack, no overview mode, and no scroll-into-view: a repo-wide search for minimap/jump-to-rack/scrollIntoView finds only the mobile keyboard helper `src/lib/utils/keyboard-viewport.ts`.
- `zoomToDevice` (mobile long-press) computes a rack-independent x (`src/lib/stores/canvas.svelte.ts:732`, `const deviceAbsX = RACK_ROW_PADDING + dualViewWidth / 2`), so for any rack past the first it frames the wrong column. Inferred from the code, not observed.

Geometry divergence between the renderer and the camera maths (matters for culling and for any 2D layout):

- `racksToPositionsWithIds` is the camera's model (`src/lib/utils/canvas.ts:394-469`). It sorts by position with a rack-id tie-break (`:448`), while the renderer ties by insertion order (`src/lib/utils/rack-row.ts:62`).
- It treats row-group members as ungrouped racks (`src/lib/utils/canvas.ts:401-403`), so the group's dashed container padding (`var(--space-3)`), its label row, and its 16 px inner gap (`src/lib/components/RackCanvasView.svelte:921-945`) are unmodelled, while the row gap it does apply is 24 px.
- Bayed group size comes from hand-copied constants (`U_LABELS_WIDTH = 32`, `BAYED_GROUP_HEIGHT_BASE = 172`, `BAYED_GROUP_NAME_HEIGHT = 24`; `src/lib/utils/canvas.ts:297-306`, `:342-371`).
- A layout whose racks share a position (every share-link decode, see section 5) therefore renders in one order and is measured in another.

## 3. Render path and performance-relevant code

What happens on zoom:

- panzoom writes a CSS matrix to the container (`node_modules/panzoom/lib/makeDomController.js:42-43`), and the container sets `transform-origin: 0 0` (`src/lib/components/Canvas.svelte:517-523`). No Svelte state drives the transform.
- The store's `zoom` listener sets `currentZoom`, flags `isZooming` for 140 ms, and debounces a viewport save by 500 ms (`src/lib/stores/canvas.svelte.ts:262-275`, `:167-188`).
- Reactive readers of `canvasStore.zoom` are few and all off the per-device path: the zoom readout (`src/lib/components/canvas/CanvasViewControls.svelte:143-146`, `src/lib/components/mobile/MobileViewSheet.svelte:121-123`), resize-grip counter-scaling for the selected rack only (`src/lib/components/RackCanvasView.svelte:616`, `:713`, inside `{#if isSelected}` at `:686`; `src/lib/components/BayedRackView.svelte:483`, gated by `enableBayDrag`), grip hit height (`src/lib/components/RackCanvasView.svelte:157`), bay drag maths (`:256`, `:281`, `:380`), and the verb bar (`src/lib/components/VerbBarOverlay.svelte:250`, `:260`).
- There is no level of detail: nothing hides labels, ports, holes, or grid lines at low zoom, and no stroke or font is counter-scaled (no `vector-effect` in the tree).
- With a selection and zoom at or above 0.5, the verb bar runs a per-frame `requestAnimationFrame` loop while `isInteracting` is set: each tick calls `canvasEl.querySelector` with an attribute selector over the whole canvas subtree and two `getBoundingClientRect` calls (`src/lib/components/VerbBarOverlay.svelte:208-238`, `:246-270`, `:321-363`). Below `VERB_BAR_LOW_ZOOM_THRESHOLD = 0.5` it hides and skips the work (`src/lib/utils/verb-bar-position.ts:59`, `src/lib/components/VerbBarOverlay.svelte:250`).

Virtualisation, culling, LOD, lazy mount: none on the canvas.

- Every row item renders (`src/lib/components/RackCanvasView.svelte:638`); no IntersectionObserver, `content-visibility`, `contain`, or `will-change` on containers; a repo-wide search for those finds only `LayoutTabs.svelte`'s ResizeObserver.
- A windowing util does exist for lists: `computeVisibleWindow` with overscan (`src/lib/utils/virtualList.ts:41`) used by `VirtualList.svelte` in the device palette (`src/lib/components/DevicePalette.svelte:652`), including a roving-tabindex re-anchor for unmounted rows (`src/lib/components/VirtualList.svelte:20-31`).
- No Web Worker anywhere in `src`.

Per-rack SVG node cost (structural count from the template):

- `RackFrame` emits 5 frame rects (`src/lib/components/RackFrame.svelte:104`, `:114`, `:124`, `:134`, `:144`), one U-slot rect per U (`:154-177`), one grid line per U plus one (`:179-188`), six mounting-hole rects per U (`:190-245`), one U-label text per U unless hidden (`:247-259`), a defs and a crosshatch pattern with two lines (`:262-285`), and a view-label text (`:334-345`).
- Derived: about 9 x U + 11 elements per face, plus the `<svg>`, the device `<g>`, and the ConnectionLayer `<g>` from `Rack.svelte` (`:542`, `:587`, `:647`). A 48U face is about 446 elements; a dual-view 48U rack about 892; 100 such racks about 89,000 elements before a single device. This matches `docs/research/performance-baseline.md:12` ("~400 SVG elements" for an empty rack) and is consistent with #3287's measured 80,642 nodes for 71 racks.
- Frame chrome, not devices, is the dominant node cost at 100 racks.

Per-device SVG node cost:

- Always: transition wrapper `<g>` (`src/lib/components/Rack.svelte:595-599`), positioned wrapper `<g>` (`src/lib/components/RackDevice.svelte:848`), interactive `<g>` (`:856`), body rect (`:875`), and, when selected, an outline rect (`:896-906`).
- Label mode: one auto-fitted `<text>` (`:978-987`) plus, at 1U or taller, a `CategoryIconSVG` (`:992-999`), which is a nested `<svg>` wrapping a Lucide icon `<svg>` with a `drop-shadow` filter (`src/lib/components/CategoryIconSVG.svelte:60-76`).
- Image mode (`displayMode` is `image` or `image-label`, `src/lib/schemas/index.ts:97`): a `<defs>` plus per-device `<clipPath>` and rect, an `<image>` keyed on the URL (`src/lib/components/RackDevice.svelte:909-942`), optionally a `LabelOverlaySVG` (`:944-950`); a referenced-but-missing image renders a placeholder rect plus icon (`:952-975`).
- Rear face of a full-depth device: a REAR badge text (`:1003-1013`) and a `filter: saturate(0.45) brightness(0.82)` on the body rect when no rear image is shown (`:1234-1239`).
- Ports, when the device type has interfaces (`:1016-1025`): under the threshold, per port a visible circle, an invisible `r=6` hit circle with `tabindex="0"` and a `<title>`, plus optional mgmt dot, PoE glyph and direction arrow (`src/lib/components/PortIndicators.svelte:238-324`); over 24 visible ports, one `<g>` plus rect plus text per interface type (`:328-349`).
- Every device wrapper carries `will-change: filter` with a filter transition (`src/lib/components/RackDevice.svelte:1137-1141`) and a `Tween` on its y position (`:339-342`).

ConnectionLayer, exactly:

- Mounted once per rack face (`src/lib/components/Rack.svelte:647`), twice per dual-view rack, and once per bayed member per row (`src/lib/components/BayedRackView.svelte:453`, `:567` mount `Rack`, which mounts its own layer).
- It builds its own slug index (`src/lib/components/ConnectionLayer.svelte:55`), then `buildPortAnchorMap` over this face's devices (`:57-59`), then `buildRenderedConnections` over the entire layout connection list (`:68-74`).
- `buildPortAnchorMap` skips a device with no interfaces, computes its offset, calls `getPortAnchors`, and does `ports.find` per anchor (`src/lib/utils/connection-path.ts:496-540`, the find at `:528`), so O(anchors x ports) per device, bounded by the 24-anchor cap.
- `buildRenderedConnections` loops every connection and drops any whose two endpoints are not both in this face's anchor map (`src/lib/utils/connection-path.ts:562-591`, loop `:571`, skip `:574`). Cost is O(faces x connections) per recompute; for 100 dual racks and 3,000 connections that is about 600,000 map lookups.
- `getPortAnchors` returns nothing once a face shows more than `HIGH_DENSITY_THRESHOLD = 24` ports (`src/lib/utils/port-geometry.ts:33`, `:122-131`, `:154`), which is why #3287 drew 0 of 2,887 connections.
- Recompute triggers: `connectionStore.connections` is a getter that reads `layoutStore.layout.connections` (`src/lib/stores/connection.svelte.ts:157`, `:319-321`), and every mutation replaces the whole `layout` object (`src/lib/stores/layout/mutators.ts:64-79`, assignment at `src/lib/stores/layout.svelte.ts:174-176`). So the derived at `ConnectionLayer.svelte:68` re-runs in every mounted face on any layout change anywhere, not just on connection edits. Inferred from Svelte 5 dependency tracking, not measured.
- Each drawn connection is a `<g>` with two paths (visible plus hit) and an optional arrow polygon (`src/lib/components/ConnectionPath.svelte:48-70`).

Why selection can cost O(racks):

- The row each-block re-evaluates selection expressions for every item (`src/lib/components/RackCanvasView.svelte:643-645`, `:661-664`, `:821-833`); standalone and row-group racks compare `selectedRackId` so only the affected rack's props change.
- `BayedRackView` gets `selectedDeviceId` ungated by rack (`src/lib/components/RackCanvasView.svelte:760-762`), so every bayed group re-renders its prop graph on any device selection (it re-gates internally at `src/lib/components/BayedRackView.svelte:457`, `:571`).
- Selecting a device also calls `setActiveRack` (`src/lib/components/RackCanvasView.svelte:526-535`), which flips `isActive` and the `.active` class for two row items.
- The verb bar reacts: `anchorSignal` scans every rack and every device to build a geometry signature (`src/lib/components/VerbBarOverlay.svelte:277-312`, the nested loop at `:289`), a rack selection recomputes `getRackSlotControls`, which re-runs `organizeRackRow` (`:87-101`, `src/lib/utils/rack-row.ts:113-135`), and the measure loop then does an attribute `querySelector` over the canvas subtree plus two `getBoundingClientRect` calls, forcing style and layout over the whole 80k-node SVG (`:208-270`).
- Class changes (`.selected` on the device, `.active` on the wrapper) invalidate style for a document of that size. #3287 measured selection at 355 ms (39 racks) and 529 ms (71 racks) at 4x throttle; the split between forced layout, style recalc, and store work is not established here.

Load path cost:

- `js-yaml` parse on the main thread (`src/lib/utils/yaml.ts:87-90`, wrapped at `:99-106`).
- Zod runs twice over the whole document: `LayoutSchemaBase.safeParse` (transform: id generation, per-rack device-id dedup, position migration, over-rack clamp; `src/lib/schemas/index.ts:799-877`), then `adaptLegacyLayout`, then `LayoutSchema.safeParse` on the adapted copy, and `LayoutSchema` is `LayoutSchemaBase.superRefine(...)` so the base transform runs again (`src/lib/utils/yaml.ts:356-366`, `src/lib/schemas/index.ts:884`).
- `superRefine` is linear: rack-id counts, slug uniqueness, a `rackById` map, per-group rack-id checks, per-rack device maps (`src/lib/schemas/index.ts:892-1000`).
- `adaptLegacyLayout` is linear with maps and sets (`src/lib/storage/adapt-legacy-layout.ts:616-748`); its dangling-connection salvage builds one port-id set then filters (`:567-608`).
- `loadLayout` does three linear passes (racks and devices, rack_groups remap, port-id dedup and connection remap) (`src/lib/stores/layout/layout-lifecycle.ts:67-206`).
- Then the whole tree mounts synchronously; `fitAll` runs in the next frame (`src/lib/storage/load-pipeline.ts:82-84`).
- Per-edit cost after load: the browser autosave effect deep-clones every hydrated tab's layout with `$state.snapshot` synchronously on each change, then debounces the `JSON.stringify` plus `localStorage.setItem` by 1 s (`src/lib/components/PersistenceEffects.svelte:74-107`, `:145-165`; write at `src/lib/storage/browser-workspace.ts:273-284`).
- Known non-linear work outside the load path: `validateConnection` rebuilds the flat port list and linearly scans ports and connections per call (`src/lib/stores/connection.svelte.ts:50-55`, `:84`, `:94-118`, `:339`), so building a fabric one connection at a time through the store is quadratic; file loads skip it.
- Smaller quadratic spots: bayed member lookup `group.rack_ids.map(id => racks.find(...))` in the camera model (`src/lib/utils/canvas.ts:410`) and in the export renderer (`src/lib/utils/export/svg.ts:433-437`); collision checks do `deviceLibrary.find` per placed device (`src/lib/utils/collision.ts:173`, `:230`); placement arming computes `validPlacementSlots` in every mounted face (`src/lib/components/Rack.svelte:325-343` calling `validStartPositions`, `src/lib/utils/placement-keyboard.ts:27-57`, one `getDropFeedback` per U).
- Every mounted face registers three document listeners for the pointer-drag protocol (`src/lib/components/Rack.svelte:430`, `src/lib/utils/rack-pointer-drag.ts:164-169`) and every one of them calls `getBoundingClientRect` on its own SVG per `rackula:dragmove` event (`src/lib/utils/rack-pointer-drag.ts:43-51`, `:64-74`): 200 rect reads per pointer move at 100 dual racks.
- In image modes each device's `placementImageUrl` derived reads `layoutStore.layout.metadata?.id` (`src/lib/components/RackDevice.svelte:181-192`), so it re-runs for every device on every layout mutation.

## 4. Consumers that need all racks

All of them render from data; none clones or serialises the live canvas DOM (the only `XMLSerializer` uses are on export-built SVG: `src/lib/utils/export/raster.ts:54`, `src/lib/utils/export/vector.ts:11`).

- Image and vector export: `handleExportSubmit` filters the selected racks, builds one SVG with `generateExportSVG`, and downloads SVG, PNG, JPEG or PDF (`src/lib/utils/app-actions.ts:192-305`, generate at `:217-224`, PNG at `:248`, PDF at `:264-265`).
- `generateExportSVG` is an independent renderer using `document.createElementNS` (`src/lib/utils/export/svg.ts:394`, `:578`). It places bayed groups first, then standalone racks in array order (`:424-455`, `:1213-1225`), ignoring `Rack.position` and row groups; its gap is `RACK_GAP = 40` and rack width `BASE_RACK_WIDTH` (`:33-35`). It draws no ports and no connections (zero occurrences of "connection" in the file).
- Derived: 100 dual-view racks export at about 520 px each, roughly 52,000 px wide; PNG rasterises at `scale = 2` into a canvas of `width * scale` (`src/lib/utils/export/raster.ts:6`, `:36-37`), about 104,000 px wide, and a failed `toBlob` surfaces as "Failed to create blob" (`:74`). Browser canvas dimension limits are external to this repo, but this is far past them.
- PDF fits the whole SVG onto one US Letter page with `scale = min(available/img)` (`src/lib/utils/export/vector.ts:80-105`); 52,000 px onto 720 pt is about 0.014, unreadable.
- Per-rack ZIP and multi-page PDF exist (`src/lib/utils/export/multi.ts:27`, `:101`) but I found no app call site: the only importers are the barrel `src/lib/utils/export/index.ts` and tests. The dialog nevertheless promises them for 4 or more racks ("will export as ZIP with one image per rack", `src/lib/components/ExportDialog.svelte:206`, `:229-234`) and previews one rack at a time in that case (`:289-291`), while `handleExport` sends a plain options object (`:325-341`) and `handleExportSubmit` always builds the composite. Worth confirming with a real export before relying on it.
- CSV export covers the first selected rack only (`src/lib/utils/app-actions.ts:288-300`).
- Export dialog preview: rebuilds the full export SVG in an effect whenever options change and injects `svg.outerHTML` (`src/lib/components/ExportDialog.svelte:263-311`).
- Layout thumbnails in the Layouts sidebar: `renderLayoutPreviewSvg` reuses `generateExportSVG` for the whole layout, front view, label mode (`src/lib/components/layout-preview-render.ts:25-55`), cached per row behind a content key that is `JSON.stringify` of every rack, device, type and group (`src/lib/components/layout-preview-cache.ts:31-74`, LRU of 24 at `:104`). `previewFor` runs in the row template (`src/lib/components/LayoutsLibrary.svelte:173-203`, called at `:496`), so with the Layouts tab open, each edit re-keys and re-renders the whole-layout SVG for the active row.
- Print: no print path exists (no `window.print`, no `@media print` in `src`).
- Share preview: the share dialog only encodes the minimal layout and draws a QR (`src/lib/components/ShareDialog.svelte:44-47`), no canvas capture.
- NetBox export writes device types only (`src/lib/utils/netbox-export.ts:1-12`).
- Live-DOM readers that need the selected or targeted rack present: the verb bar (`src/lib/components/VerbBarOverlay.svelte:208-238`), keyboard placement rack focus (`src/lib/utils/placement-keyboard-controller.ts:90-94`), and the drag protocol's per-face rect reads (`src/lib/utils/rack-pointer-drag.ts:43-51`). `data-rack-id` is emitted by `RackDualView.svelte:313` and `BayedRackView.svelte:446`, `:560`.
- Accessibility: the canvas label counts all racks and devices (`src/lib/components/Canvas.svelte:371-377`), the described device list covers the active rack only and does a `device_types.find` per device (`:379-394`), and every rack is a `listitem` focus stop with every device a `button` and every port hit target `tabindex="0"` (`src/lib/components/Rack.svelte:529-539`, `src/lib/components/RackDevice.svelte:856-871`, `src/lib/components/PortIndicators.svelte:294-304`).
- Test harnesses: `docs/research/3287-scale-measure.mjs:158` waits until `[data-testid="rack-device"]` count reaches the placed-device count, and `e2e/multi-rack.spec.ts:63-70` counts rack fronts. Both assume no culling.

## 5. Data and file limits

Share link:

- Format: minimal v2 JSON compressed with `LZString.compressToEncodedURIComponent`, legacy pako gzip accepted on decode only (`src/lib/utils/share.ts:15-20`, `:427-443`, `:516-545`).
- Carried per rack: short id, name, height, width normalised to 10 or 19, devices (`src/lib/schemas/share.ts:152-190`, `src/lib/utils/share.ts:241-247`). Carried per device: type slug, position, face, optional name, container parent and slot (`src/lib/schemas/share.ts:86-101`). Groups carry short ids, name, preset (`:192-199`).
- Dropped: ports, connections, interfaces, power, weight, depth, form factor, desc_units, starting_unit, show_rear, notes, images, and `Rack.position` itself. The dialog's note only mentions images (`src/lib/components/ShareDialog.svelte:188-191`).
- Decode rebuilds racks through `createDefaultRack`, which sets `position: 0` (`src/lib/utils/share.ts:313-338`, `src/lib/utils/serialization.ts:44-66`), and `loadLayout` keeps a finite 0 (`src/lib/stores/layout/layout-lifecycle.ts:122`). Every decoded rack therefore has position 0 and order falls to tie-breaks, which differ between the renderer (insertion order, groups first) and the camera model (rack-id sort): see section 2.
- Limits: decode rejects an encoded value over `MAX_ENCODED_LENGTH = 64 KB` (`src/lib/utils/share.ts:463`, check at `:520-522`) and output over `MAX_DECOMPRESSED_BYTES = 8 MB` (`:470`, checks at `:529-531`, `:478-500`). Encoding has no length check (`:427-443`, `:587-597`), so an over-long link can be produced and then refused on open.
- The dialog warns above 1800 URL characters ("too long for some browsers; download the file instead") and swaps the primary button to a file download (`src/lib/components/ShareDialog.svelte:24`, `:151-157`, `:196-206`); QR generation is gated by `canFitInQR` (`:47`, `:164-169`).
- The source comment claims an extreme 100-rack, 4,200-device layout encodes to about 35 KB (`src/lib/utils/share.ts:456-462`), so rack count is not the binding constraint; loss of ports and connections is.

YAML and ZIP:

- Plain YAML load is capped at `MAX_YAML_BYTES = 5 MB` (`src/lib/utils/archive-extract.ts:142-153`, checked at `:270-276` for a bare YAML and at `:374`, `:456` inside archives). The comment notes the deliberate mismatch with the server's 1 MB PUT cap (`:266-269`).
- ZIP: 50 MB archive, 250 MB uncompressed measured by streaming, 500 entries, 100:1 ratio (`src/lib/utils/archive-extract.ts:142-153`, `:57-101`, `:287-334`).
- Save: plain YAML embeds user images as base64 with an oversize count for a warning toast (`src/lib/utils/archive.ts:271-288`); the ZIP writes images as files (`:147-244`). The ZIP writer resolves each placement image by `racks.flatMap(...).find(...)` (`:201-204`), O(images x devices).
- Serialization preserves unknown keys: unknown top-level sections (`src/lib/utils/yaml-field-order.ts:255-268`), unknown rack, device, device-type and connection keys (`:364-378`, rack call at `:173`), and `rack_groups` is written verbatim (`:418-421`). `docs/reference/SCHEMA.md:608-610` still says unknown fields are not written back; the code (since #2927) contradicts that.
- Schema version: `SCHEMA_VERSION = "1.1"`, loadability gated on MAJOR only (`src/lib/schemas/migrations.ts:21`, `:42-51`).
- Reference for scale: #3287's generated files were 292 KB for 12 racks, 397 KB for 20, 1.2 MB for 39 and 1.4 MB for 71 racks with ports and connections (`docs/research/3287-scale.md`, scenario table). Extrapolating, 100 such racks is roughly 2 MB: under the 5 MB local cap, over the 1 MB server cap.

Server storage mode:

- Layout PUT and GET bodies are capped at 1 MB, hard-coded with no env override (`api/src/app.ts:41-42`, `:899-905`); assets at 5 MB with a `MAX_ASSET_SIZE` override (`:884-895`).
- The client refuses a GET whose body exceeds the same 1 MB (`src/lib/storage/api.ts:83-85`, `:356-366`).
- `saveLayoutToServer` serialises YAML and PUTs it with no client-side size pre-check (`src/lib/storage/api.ts:520-624`). A 413 carries `{"error":"Layout data too large"}` (`api/src/app.ts:899-902`) and surfaces as a sticky "Save failed" error toast with a retry action, not a size-specific message (`src/lib/storage/manager.svelte.ts:433-439`).
- The server parses YAML per PUT with an alias-expansion guard sized at 4x the input bytes (`api/src/routes/layouts.ts:84-107`, `:158-175`; `api/src/yaml-safety.ts:26-36`, `:56-66`), then validates a minimal schema with no rack limit (`api/src/schemas/layout.ts:197-228`).
- Quotas are counts of layouts and of assets per layout, enforced on PUT only (`api/src/security/storage-quota-middleware.ts:43-70`, `api/src/app.ts:907-918`).

Browser storage:

- Keys: `Rackula:workspace` (index), `Rackula:layout:<id>` (one body per layout), `Rackula:autosave` (legacy or server-mode working copy), `Rackula:viewport`, plus small flags (`src/lib/storage/browser-workspace.ts:39-44`, `src/lib/storage/working-copy.ts:13`, `src/lib/stores/canvas.svelte.ts:55`). No IndexedDB anywhere.
- A body is `JSON.stringify({schemaVersion, layout, savedAt, writerTabId})` written with `safeSetItem` (`src/lib/storage/browser-workspace.ts:273-284`), which swallows the exception and returns false (`src/lib/utils/safe-storage.ts:39-50`).
- On a failed write the index entry records `writeFailed: true` (`src/lib/storage/browser-workspace.ts:306`), which only suppresses the "Auto-saved" time in the storage chip (`:322-326`, `src/lib/components/StorageStatusChip.svelte:147`). I found no toast for a browser-mode quota failure: a 100-rack layout that exceeds the origin quota would stop autosaving quietly.
- Every hydrated tab is written on each persist pass, not just the active one (`src/lib/storage/browser-workspace-persist.ts:106-121`), and each pass is preceded by a synchronous deep `$state.snapshot` per tab (`src/lib/components/PersistenceEffects.svelte:88-96`).
- #3287 confirmed 12-, 20-, 39- and 71-rack files autosaved successfully in browser mode.

Schema implications of more racks:

- `Rack.position` is `z.number().int().min(0)` with no relation to geometry (`src/lib/schemas/index.ts:652`, `:690`); adding 2D coordinates means new fields, not a reinterpretation.
- `RackSchema` and `RackGroupSchema` are `.passthrough()` (`src/lib/schemas/index.ts:662`, `:700`, `:719`) and the serializer round-trips unknown keys, so optional additive fields (for example `row`, `x`, `y`) survive a load and resave by an older release; a share link, being a separate minimal format, silently drops them.
- Bayed groups still require equal member heights (`src/lib/schemas/index.ts:943-959`) and at least 2 members (`src/lib/stores/layout/rack-groups.ts:608-610`). Groups cannot nest and have no row or hall field.
- The JSON Schema published for editors is generated from Zod by `scripts/generate-schema.ts`, so any field addition needs a regeneration.

## Integration Points

Culling or virtualisation:

- The natural unit is the row slot: `{#each rowItems}` in `src/lib/components/RackCanvasView.svelte:638`, one slot per standalone rack or per group. A culled slot needs a same-size placeholder so the flex row keeps its geometry (`.row-slot`, `.racks-wrapper` at `:865-873`, `:955-963`).
- Geometry source: `racksToPositionsWithIds` (`src/lib/utils/canvas.ts:394-469`) already produces per-slot boxes, but it must first be reconciled with `organizeRackRow`'s ordering and row-group chrome (section 2), or the visible window will be computed against different boxes than the DOM has.
- Viewport signal: the canvas store listens only to `zoom`, `panstart`, `panend` (`src/lib/stores/canvas.svelte.ts:262-288`) and the verb bar comment states pan has no reactive signal (`src/lib/components/VerbBarOverlay.svelte:314-318`). panzoom emits `pan`, `zoom` and `transform` (`node_modules/panzoom/index.js:301`, `:426`, `:532`), so a throttled transform-derived store value is the hook.
- Windowing maths can reuse `computeVisibleWindow` (`src/lib/utils/virtualList.ts:41`) and the roving-tabindex precedent in `src/lib/components/VirtualList.svelte:20-31`.
- Things that break if racks leave the DOM: the verb bar's `querySelector` anchor (`src/lib/components/VerbBarOverlay.svelte:208-238`), `focusRackContainer` during keyboard placement (`src/lib/utils/placement-keyboard-controller.ts:90-94`), cross-rack pointer drops (`src/lib/utils/rack-pointer-drag.ts:64-92`), the `role="list"` rack sequence for screen readers, and the #3287 harness's device-count wait (`docs/research/3287-scale-measure.mjs:158`).

Level of detail:

- Frame chrome is the biggest single lever: the per-U loops in `src/lib/components/RackFrame.svelte:154-259` are about 9 elements per U per face, of which 6 are mounting holes and 1 is a U label.
- Device detail: `CategoryIconSVG` (`src/lib/components/RackDevice.svelte:968-999`) and `PortIndicators` (`:1016-1025`) are the two cheapest things to drop at low zoom; the icon also carries a CSS `drop-shadow` (`src/lib/components/CategoryIconSVG.svelte:76`).
- A zoom tier must be quantised before it reaches per-rack components: `canvasStore.zoom` updates on every wheel event (`src/lib/stores/canvas.svelte.ts:262-264`), so reading it directly in 200 `Rack` instances would trade raster cost for reactive cost.
- `rack.show_rear = false` already halves a rack's node count by skipping the rear `Rack` (`src/lib/components/RackDualView.svelte:368-379`), which is a precedent for a per-view density control.

2D layout:

- Data: add optional fields to `RackSchemaInput`/`RackSchema` (`src/lib/schemas/index.ts:630-700`) or to `RackGroupSchema` (`:710-719`); both passthrough and the serializer preserves unknown keys (`src/lib/utils/yaml-field-order.ts:173`, `:418-421`).
- Render: `.racks-wrapper` is a single flex row (`src/lib/components/RackCanvasView.svelte:865-873`); wrapping or a grid changes only this container and the row-slot placement, since each slot is self-contained.
- Camera: `racksToPositionsWithIds` (`src/lib/utils/canvas.ts:394-469`) must produce the same 2D boxes, and `zoomToDevice`'s hard-coded x must be fixed (`src/lib/stores/canvas.svelte.ts:732`).
- Grouping primitive that already exists: `layout_preset: "row"` renders as a labelled container of racks (`src/lib/components/RackCanvasView.svelte:814-856`) but has no UI creator (`createRackGroup` has no component call site), so a "row" concept can be adopted without a schema change, only a UI and a canvas-geometry change.
- Export and thumbnails have their own single-row layout (`src/lib/utils/export/svg.ts:424-455`, `:1213-1225`), so a 2D canvas needs a matching change there or an accepted divergence.

Minimap:

- Cheapest source is `racksToPositionsWithIds` plus the panzoom transform (`src/lib/stores/canvas.svelte.ts:371-377` for `getTransform`); each slot is one rect, so a 100-rack minimap is about 100 elements.
- Do not reuse `renderLayoutPreviewSvg` for a live minimap: it builds a full export SVG of every U of every rack (`src/lib/components/layout-preview-render.ts:44-55`).
- Camera moves already exist: `smoothMoveTo`, `focusRack`, `ensureRacksVisible` (`src/lib/stores/canvas.svelte.ts:451`, `:555`, `:607`).

Jump to rack:

- Command surface: add an action to `ACTION_REGISTRY` (`src/lib/actions/registry.ts:186-216` for the navigation group) plus a dispatch entry (`src/lib/actions/dispatch.ts:225-229`), and reuse the palette's existing sub-page pattern (`src/lib/components/CommandPalette.svelte:58`, `:110-136`).
- Target action already exists: `handleRackContextFocus` (`src/lib/utils/rack-actions.ts:86-97`) to `focusRack` (`src/lib/stores/canvas.svelte.ts:607`).
- Cheap wins in the same area: make `RackList` clicks focus the camera (`src/lib/components/RackList.svelte:73-76`), and make `[` and `]` cycle row order and move the camera (`src/lib/actions/dispatch.ts:126-148`).

Soft cap or complexity budget:

- Seven store-level checks plus one UI check to change (list in section 1), all reading `MAX_RACKS` from `src/lib/types/constants.ts:90`; a soft cap would replace them with a warn-once threshold and keep `canAddRack` as the hard stop or delete it.
- Signals already available for a budget: `rackCount` and `totalDeviceCount` on the store (`src/lib/stores/layout.svelte.ts:213-220`), connection count via `layout.connections`, and port counts per device.
- The right place for a load-time notice is per-ingress, not in `loadLayout`: the store ingress has no toast dependency, while `finalizeLayoutLoad` (`src/lib/storage/load-pipeline.ts:44-101`), the share path (`src/App.svelte:234-251`), `openStarter` (`src/lib/stores/starter-templates.svelte.ts:85-101`) and the YAML apply (`src/lib/components/DialogOrchestrator.svelte:302-314`) each already own their toasts.

## Constraints

- Prior-release data is a first-class requirement (`CLAUDE.md`, Development Philosophy). Touching `src/lib/schemas`, `src/lib/utils/yaml.ts`, `src/lib/utils/serialization.ts`, `src/lib/storage/migrate-layout.ts` or `src/lib/storage/adapt-legacy-layout.ts` makes the release gate demand a new upgrade-corpus fixture (`scripts/check-corpus-freshness.sh:11-18`, `:34-42`; corpus at `src/tests/fixtures/upgrade-corpus/`, contract in its `README.md`). Changing `MAX_RACKS` alone does not trip that gate, since `src/lib/types/constants.ts` is not a schema path.
- The corpus asserts no silent leaf loss through `parseLayoutYaml` and through `loadLayout` (`src/tests/upgrade-corpus.test.ts`, `src/tests/upgrade-corpus-loadlayout.test.ts`), so any new positional field must round-trip or be declared in a sidecar allow-list.
- Rail positions stay whole-U integers (`CLAUDE.md` invariant, enforced at `src/lib/schemas/index.ts:990-998`); nothing in this spike touches that, but a 2D change must not reuse `position` for geometry, since `Rack.position` is also the persisted row order that reorder, bay-insert and removal all reindex (`src/lib/utils/rack-row.ts:151-242`).
- Share links cannot express any of it: the minimal format has no rack position (`src/lib/schemas/share.ts:152-190`), so a 2D arrangement is lost on share and racks come back at position 0.
- The 1 MB server layout body limit is hard-coded (`api/src/app.ts:42`, `:899-905`) and mirrored client-side for GET (`src/lib/storage/api.ts:85`); a 100-rack layout with ports and connections is likely to exceed it, and the failure surfaces as a generic sticky "Save failed" (`src/lib/storage/manager.svelte.ts:433-439`).
- Browser-mode quota failure is silent beyond the chip's missing timestamp (`src/lib/storage/browser-workspace.ts:306`, `:322-326`).
- Raising the cap without culling keeps the zoom cliff: #3287 measured zoom p95 of 67.7 ms at 39 racks and 117 ms at 71 racks at 4x throttle, against the 34 ms budget in this issue.
- Lowering `ZOOM_MIN` alone does not fix framing: two copies of the floor exist (`src/lib/stores/canvas.svelte.ts:34`, `src/lib/utils/canvas.ts:95`), and one of them is also the floor for `ensureVisibleTransform`; panzoom's own `minZoom` is set from the store constant at construction (`src/lib/components/Canvas.svelte:312-315`).
- At any zoom below 0.5 the verb bar hides itself (`src/lib/utils/verb-bar-position.ts:59`), so the primary editing affordance is unavailable at whole-layout zoom levels.
- Culling changes observable DOM: `e2e/multi-rack.spec.ts` counts rack fronts, many e2e specs locate devices by test id, and `docs/research/3287-scale-measure.mjs:158` waits for a device count. The measurement harness for this spike needs a different readiness signal before culling lands.
- Every mutation replaces the layout object (`src/lib/stores/layout/mutators.ts:64-79`), so any new per-rack derived state that reads `layoutStore.layout` directly (as `connectionStore.connections` does) multiplies by rack count on every edit.
- Row groups and bayed groups are modelled twice (renderer and `canvas.ts`); any layout change must update both or focus and fit will drift further than they already do.
- Export, thumbnails and the canvas are three independent renderers; a layout or LOD change that only lands in the canvas will silently diverge from exported images.

## Open questions

- What actually dominates zoom cost at 20,000-plus SVG nodes: re-rasterising the frame chrome, the per-device `will-change: filter` (`src/lib/components/RackDevice.svelte:1139`), the per-icon `drop-shadow` (`src/lib/components/CategoryIconSVG.svelte:76`), or the rear-face `saturate`/`brightness` filter (`src/lib/components/RackDevice.svelte:1234-1239`)? Needs a Chrome trace with each disabled in turn; #3287 did not profile zoom.
- What dominates the 355 to 529 ms selection cost: the verb bar's `querySelector` plus forced layout, the `.selected` and `.active` style invalidation over the whole document, `anchorSignal`'s full scan, or the side panel mount? Not established here.
- Does culling help at the zoom levels a 100-rack layout is actually viewed at? When fit-all shows everything at about 0.03 to 0.16 zoom, every rack is on screen and only LOD helps; culling pays off once the user zooms in. A workable design probably needs both, with the tier boundaries measured.
- Is the export dialog's ZIP and multi-page PDF promise (`src/lib/components/ExportDialog.svelte:229-234`) actually reachable? I found no call site for `exportAsZip` or `exportAsMultiPagePDF`. If it is dead, a 100-rack export produces one unusable image and that should be a separate issue.
- What does a Worker do with a 1 MB-plus YAML PUT (js-yaml parse plus the complexity walk, `api/src/routes/layouts.ts:158-175`) under the CPU limit? Not measurable from this repo.
- What is the real localStorage headroom for a 100-rack layout across several open tabs, given each hydrated tab writes a full JSON body (`src/lib/storage/browser-workspace-persist.ts:106-121`)? Quota is browser-specific and untested here.
- Should the share link keep rack order at all? Today every decoded rack has position 0 (`src/lib/utils/serialization.ts:63`), and the renderer and camera model disagree on the tie-break, which will show up as focus landing on the wrong rack. Verify with a multi-rack share link before treating it as a bug.
- Is a rack-count cap the right budget at all, given cost tracks SVG nodes: 100 racks of 12U is about a quarter of the nodes of 100 racks of 48U (derived from `src/lib/components/RackFrame.svelte:154-259`), and ports add more than racks do in a DGX-style layout.
