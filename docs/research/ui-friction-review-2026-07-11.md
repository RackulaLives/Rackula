# UI friction and consistency review

Date: 2026-07-11 to 2026-07-12. Target: main branch at 0ad1cd0b (dev build v26.6.6), browser storage mode, vite dev server. Viewports: desktop 1440x900 and mobile 390x844 (touch emulation). Method: eight journey reviews driven against the live app with Playwright (first-run, device library, device operations, multi-rack, cabling, save/load/export/share, keyboard-only, error and empty states) plus a source-level consistency sweep, followed by an adversarial verification pass that re-reproduced the highest-impact findings from scratch and corrected several severities. Screenshots and raw findings live in the review job archive (not committed); code evidence is cited as file:line against 0ad1cd0b.

Review only: this document proposes changes but makes none. Severity scale: blocker (cannot complete the task or loses data), major (completes with real confusion, wasted steps, or silent failure), minor (noticeable rough edge), polish (cosmetic). Effort scale: quick win, small, medium, large.

Raw finding IDs (J1-F1, C-F3, etc.) are preserved for traceability to the underlying journey evidence. Verified findings note their verification result.

## Executive summary: top 10 by impact

1. Saving to YAML is broken in Chromium-based browsers that expose `showSaveFilePicker`; verified in Google Chrome (headed and headless) and Playwright Chromium. Ctrl+S and the palette save/export-backup commands fail with a raw `showSaveFilePicker` exception because the blob MIME carries `;charset=utf-8`, which the File System Access API rejects. Reproduced in real Google Chrome, headed and headless. The fix is one line. (R1, blocker, quick win)
2. Loading a layout file silently swaps out the current layout. No prompt fires even with unexported changes, undo does not restore it, and the success toast hides the swap. The old layout survives only as a closed row in the Layouts library, which two independent reviewers failed to discover. New layout guards the same situation with a confirm; open does not. (R2, major, small)
3. Opening a share link does the same silent replacement. A user mid-edit who clicks a shared URL gets their layout swapped with no warning and no visible recovery path. (R3, major, medium)
4. Placing a device onto an occupied slot fails with no visible feedback, and the same click selects the occupying device and opens its editor while the "Placing" banner stays armed. The app enters a contradictory dual state that reads as broken. (R7, major, small)
5. On mobile there is no visible way to leave placement mode. The Cancel button renders at x=406 on a 390px viewport, fully off screen. The only touch exit is to place the device somewhere. (R8, major, small)
6. Removing a device is guarded on three affordances and instant-and-silent on two others, and the verb drifts between Delete and Remove mid-flow. The confirm dialog protects nothing while taxing one path. (R10, major, medium)
7. Keyboard navigation hits a wall: the device palette contributes 873 tab stops, 706 of them hidden inside collapsed accordions (about 353 device rows plus their pin buttons) where the focus ring paints nothing. Forward Tab never reaches the canvas. (R14, major, small for the accordion fix)
8. There is no reliable keyboard path to place a device. The visible "Add device" row is mouse-only by design, and the fallback search bridge only appears when a query matches zero commands, which common words never do. (R15, major, medium)
9. Every new rack is named "Racky McRackface" with no numbering, so delete confirms, the active-rack toast, and mobile switch dots become ambiguous; and after duplicating a rack the sidebar highlights the copy while the canvas and edit panel stay on the original, two current-rack indicators pointing at different racks. (R18 and R19, majors, small each)
10. Failed imports dump raw js-yaml code frames and Zod paths into user-facing toasts, including raw bytes of the failed file, while the share-link path already has clean human error copy that could be reused. (R4, major, small)

Also notable: the file-backup action is named Save, Export layout, and Export a file across surfaces and has no palette entry at all in browser mode, while the palette label promises a .zip and delivers a .yaml (R5); and on mobile the first-run toast stack covers roughly 60% of the screen (R26).

The two positive headlines: markup injection probes pass everywhere (device, rack, and layout names render as inert text in SVG, panels, tabs, and previews), and undo/redo round-trips every device operation cleanly with descriptive toasts.

## Theme 1: saving, loading, and data safety

### R1 YAML save fails on Chromium with a raw API error (blocker, quick win)

- IDs: J7-F6, J8-F3. Verified: V1 confirmed in real Chrome, headed and headless; the charset parameter is the sole cause.
- Surface: desktop, Ctrl+S / Cmd+S, palette "Export layout (.zip)" and server-mode Save As. Journey: keyboard pass step 3, error states step 6.
- Observed: the toast reads "Failed to execute 'showSaveFilePicker' on 'Window': Invalid type: text/yaml;charset=utf-8". `downloadYamlFile` builds the blob as `text/yaml;charset=utf-8` (src/lib/utils/archive.ts:274); browser-fs-access forwards `blob.type` as a `showSaveFilePicker` accept key, and Chromium rejects parameterised MIME types. Browsers without the API (Firefox, Safari) fall back to anchor download and work, which is why one journey reviewer initially saw it succeed.
- Friction: the primary save path fails outright on the majority browser engine, and the message is a developer exception, not language a user can act on.
- Suggestion: build the blob as plain `text/yaml` (or pass a clean mimeTypes array to fileSave). Audit the same pattern at src/lib/components/LayoutYamlPanel.svelte:219. Wrap residual save failures in a plain-language toast. Worth confirming when this regressed and considering a hotfix release ahead of the rest of this report.

### R2 Opening a layout file silently replaces the current layout (major, small)

- IDs: J8-F2, J6-F4. Verified: V1 confirmed the no-prompt asymmetry and that undo cannot restore; severity moderated from blocker because the outgoing layout is retained in the workspace library.
- Surface: both, Ctrl+O and palette "Open layout". Journey: error states step 2, save/load step 2.
- Observed: with unexported changes present, loading a file replaces the active layout with no confirmation (src/lib/storage/load-pipeline.ts:179-203). "New layout" routes the identical situation through the confirmReplace guard (src/lib/actions/dispatch.ts:177-183). Ctrl+Z after the load does not bring the old layout back, and the toast says "Layout loaded successfully". The previous layout still exists as a closed row in the Layouts library, but the reviewer who tested recovery concluded the work was destroyed, and neither reviewer discovered the retained row, which is the discoverability problem in miniature.
- Friction: error prevention. Two sibling replace-what-I-am-working-on actions behave differently, and the one that guards is the one users fear less. The success toast actively masks what happened.
- Suggestion: preferred, open imported files as a new workspace layout entry (the "+" flow already models this), leaving the current layout open. Alternatively gate the load through the same confirmReplace dialog. Either way, make the replaced layout's survival visible (for example a toast line "Previous layout moved to Layouts").

### R3 Share links silently replace the open layout (major, medium)

- IDs: J6-F3. Verified: V1 confirmed the silent replace; "unrecoverable" was refuted, the original reopens from a closed Layouts row.
- Surface: both, `?l=` URL entry. Journey: save/load step 4.
- Observed: navigating to a share URL in a context with unexported local work loads the shared layout with no prompt (the share handler at src/App.svelte:233-247 returns before workspace restore). The prior layout survives only as a closed Layouts-library row; nothing tells the user this. The #2608 conflict-prompt machinery exists but is gated to a later priority and server mode, so it never fires here.
- Friction: a plausible mainline flow (click a friend's link while mid-edit) swaps your work with zero acknowledgement. Recovery exists but is invisible.
- Suggestion: when the current layout has unexported changes, confirm before loading a share link (reuse confirmReplace with an "Export first" option), or open shared layouts as a new entry, and surface the recovery path in the toast.

### R4 Import errors leak parser and schema internals (major, small)

- IDs: J8-F1, with J8-F4 and J8-F5 as the supporting pair. Journey: error states steps 1 and 7.
- Observed: binary junk renamed .yaml produces a js-yaml code frame that paints raw file bytes into the toast; a non-layout YAML produces a comma-joined raw Zod issue list naming `device_types`, `settings`; a corrupt field produces `Invalid layout: racks.0.devices.0.position: Invalid input: expected number, received string` (error text surfaced verbatim from src/lib/storage/load-pipeline.ts:196-201 via src/lib/utils/yaml.ts:337-357). On mobile the dump wraps to about 8 lines. Meanwhile the share-link decode path already ships curated messages ("Could not decode share link", "Layout format is invalid or outdated"), so the same user intent gets clean copy through one door and internals through the other (J8-F4). Where schema limits carry good custom messages ("Height cannot exceed 100U") they are buried behind the Zod path prefix (J8-F5).
- Friction: copy quality and the security-adjacent smell of leaking internals. A homelabber who hand-edits YAML gets a Zod path instead of "a device position must be a number".
- Suggestion: map the three failure classes (not YAML, not a layout, specific field invalid) to plain-language toasts, keep raw detail in the console, strip the dotted-path prefix when a custom message exists, and consolidate file-import and share-link error copy into one helper. Positive to preserve: failed imports are non-destructive today.

### R5 One backup action, three names, wrong file extension in the palette (major, quick win)

- IDs: J6-F1, J6-F2. Journey: save/load steps 1 and 5.
- Observed: Ctrl+S toasts "Saved racky-mcrackface.rackula.yaml"; the palette's only equivalent is "Export layout (.zip)" because the save and save-as registry entries are server-mode only (src/lib/actions/registry.ts:505-516, 384-392); onboarding toasts call it "Export to a file to keep a copy" (src/App.svelte:169) and "Export a file to keep a copy" (src/lib/utils/backup-nudge.ts:32). The "(.zip)" labelled command actually downloads a single .yaml (dispatch chain to downloadYamlFile, src/lib/utils/archive.ts:265-282); only "Export all layouts (.zip)" produces a real ZIP.
- Friction: a user who saves with Ctrl+S cannot find that action in the app's single command surface, and the command they do find promises a file type it does not produce.
- Suggestion: pick one verb for the file-backup action across toast, palette, and onboarding, expose it in the palette in browser mode, and correct the extension in the label ("Export layout (.yaml)").

### R6 to R9 collected minors for this theme

- R6a "Unsaved" vocabulary contradiction (minor, quick win). IDs: J1-F1, J1-F9, J6-F5. The chip reads "Unsaved changes" on a fresh first run before any user action (`changesSinceExport` starts at 1), after a perfectly safe reload, and one line above its own popover saying "Auto-saved just now". "Unsaved" here means "not exported", which either alarms careful users or trains everyone to ignore the signal. Suggestion: start the starter rack as a clean baseline and rename the chip state to "Not exported" (the popover already models the correct two-axis story).
- R6b Export and Share dialogs diverge (minor, small). IDs: J6-F7, corroborated by C-F4 pattern. Export has a header X, Share has none; Share's dismiss says "Cancel" though nothing is cancellable; default focus lands on the X in Export but the URL input in Share; button radii differ. Suggestion: one dialog spec (close affordance, dismiss label, focus target), see also R31.
- R6c Saved filename comes from the placeholder layout name (polish, small). ID: J6-F8. Renaming the rack does not change the exported `racky-mcrackface...` filename because filenames derive from the layout name, which has no visible field near the rack name. Suggestion: default the layout name from the first rack name or surface the layout-name field.
- R6d Share URL computed eagerly on every load (polish, quick win). ID: J8 console observation. `ShareDialog` reactively encodes a share URL on page load and logs "Share link encode failed: Layout must have at least one rack" on every fresh load. Suggestion: compute the URL only while the dialog is open and treat zero racks as "nothing to share" without throwing.

## Theme 2: device placement

### R7 Occupied-slot placement fails silently and opens the wrong editor (major, small)

- IDs: J2-F1. Verified: V2 confirmed the symptoms on desktop; root cause refined, the missing toast is the early return at src/lib/utils/rack-interaction-handlers.ts:235-237 (hapticError only, invisible on desktop), while the select-and-open-editor comes from the ordinary device click handler running on the same gesture. An assertive screen-reader announcement does fire, so sighted users are the ones left in the dark.
- Surface: both, click/tap-to-place. Journey: library step 5.
- Observed: armed with a device, clicking an occupied slot places nothing, shows no toast (the drag path shows "Can't place device here", src/lib/components/RackCanvasView.svelte:519-522), keeps the "Placing" banner armed, selects the occupying device, and opens its edit panel.
- Friction: the most common placement mistake produces a contradictory dual state, still placing X while suddenly editing Y, with zero visible explanation.
- Suggestion: surface the same "Can't place device here" toast (with the reason) in the invalid branch, and suppress the select-through while placement mode is armed.

### R8 Mobile placement mode has no visible exit (major, small)

- IDs: J2-F2. Verified: V2 confirmed, canvas is 520px wide on the 390px viewport, Cancel sits at x=406 fully off screen, no horizontal scroll, and tapping the banner, the canvas, or reopening the sheet does not cancel.
- Surface: mobile. Journey: library steps 3 to 5.
- Observed: the "Placing" banner overflows the viewport and its Cancel button is unreachable; Escape works but has no touch equivalent. The only touch exit is to complete a placement, or to trip R7.
- Friction: a sticky mode with no reachable off switch on the touch-first surface.
- Suggestion: constrain the banner to the viewport with Cancel pinned inside, or move Cancel to a fixed position; verify at 390px.

### R9 collected minors for placement

- R9a Click-to-place preview does not track the mouse (minor, medium). ID: J2-F3. The green ghost stays pinned at the seeded keyboard cursor (U1) while the actual click places at the pointer, so the only visible preview actively misleads pointer users. Suggestion: let the ghost follow the pointer as the drag path's drop preview already does.
- R9b No visible confirmation on placement, sticky mode illegible (minor, medium). ID: J1-F5. Placement fires only a screen-reader announcement; the banner reads identically before and after, and the edit panel stays on rack properties. Suggestion: select the placed device (or toast briefly) and make the banner say "click to add another, Esc to stop".
- R9c Full rack gives no visible no-room cue on the keyboard path (minor, small). ID: J8-F6. The drag path toasts "No room for this device here" (src/lib/utils/rack-drop-handlers.ts:158); keyboard placement mode announces it only via aria-live while highlighting the full rack like a valid target. Suggestion: show the same visible cue in placement mode.
- R9d Invalid drop reverts silently (polish, small). IDs: J4-F9, J3 corroboration. Dropping a device on empty canvas snaps back with no signal. Suggestion: a brief snap-back animation or hint distinct from success.
- R9e Auto-carrier label reads as a glitch (polish, small). ID: J2-F8. A placed half-width device renders "Mini PC , 2 Column" with a dangling comma for the empty column. Suggestion: reformat the carrier descriptor.

## Theme 3: destructive actions

### R10 Device removal is guarded on three paths and silent on two (major, medium)

- IDs: C-F1 (code sweep) and J3-F6 (live), found independently.
- Surface: both, five affordances. Journey: device ops step 5.
- Observed: Delete key, verb-bar trash, and the mobile sheet Remove all open the "Remove Device" confirm (src/lib/utils/dialog-actions.ts:43, DialogOrchestrator.svelte:790); the desktop context-menu Delete (src/lib/utils/rack-context-actions.ts:115-117) and the edit panel's "Remove from Rack" (src/lib/components/EditPanelActions.svelte:34) remove immediately with no dialog and no toast. The silent paths are undoable, but nothing on screen says so. The context menu even displays "Del" as its shortcut hint while behaving differently from the Delete key.
- Friction: how protected the user is depends on which affordance they happen to reach for, and the confirm dialog is not actually protecting the device while adding a wasted step to the guarded paths.
- Suggestion: one policy for placement removal. Given removal is trivially undoable, the cleanest is no confirm anywhere plus a "Removed Server" toast with an Undo button on every path. Whichever way, make all five affordances identical.

### R11 The removal verb drifts between Delete and Remove (minor, quick win)

- IDs: C-F2, J7-F7.
- Observed: context menu "Delete", palette "Delete selected", edit panel "Remove from Rack", dialog titled "Remove Device" with a "Remove" button. EditPanelActions' own comments reserve Remove for placements and Delete for library types; the palette and context menu break that convention.
- Suggestion: standardise placement removal on Remove everywhere and keep Delete for library-type deletion, matching the documented in-code convention.

### R12 Rack deletion notes (minor, quick win)

- IDs: V1 item 4 adjudication of a J4/J7 contradiction, plus J4 positive observations.
- Observed: standalone rack deletion always confirms (good) and undo restores the rack with its devices. Two rough edges: the confirm's "All devices in this rack will be removed" is static text shown even for empty racks, and the genuinely unguarded path is deleting an empty rack that is a member of a bayed group via the context menu (count-independent). With duplicate default names the dialog also cannot say which rack dies (see R18).
- Suggestion: make the warning device-aware ("3 devices will be removed" or omit when empty), and route the bayed-empty-member context delete through the same confirm or an undo toast.

## Theme 4: command palette completeness

### R13 The single command surface is missing its most basic commands (major, small)

- IDs: J4-F1, J7-F4 (found independently), plus the browser-mode Save gap from R5.
- Observed: the palette has no New rack / Add rack command; searching "rack" returns Previous/Next rack (disabled with one rack), New layout, and exports (src/lib/actions/registry.ts has no create-rack id). Adding a rack is only reachable via the Racks sidebar button or canvas right-click. In browser mode there is likewise no save command (R5).
- Friction: the settled decision makes the palette the single command surface; a user who trusts that and types Ctrl+K to add a rack or save finds nothing. These findings reinforce the decision rather than challenge it: the palette has not caught up to its role.
- Suggestion: register New rack (dispatching handleNewRack) and a browser-mode backup command; audit the registry against every sidebar/context-menu action for other gaps.

### R14 The palette tab-stop wall blocks keyboard navigation (major, small for the biggest fix)

- IDs: J7-F1, J7-F2. Verified: V2 counted 873 palette tab stops of which 706 are focusable-but-invisible stops inside collapsed accordions (`grid-template-rows: 0fr` with `overflow: hidden` content that keeps `tabindex="0"`); 45 forward Tabs never reached the canvas.
- Surface: desktop. Journey: keyboard pass step 1.
- Observed: every visible focus stop has a clear ring (good), but collapsed brand accordions keep all device rows and their per-row Pin buttons in the tab order while painting nothing, so focus vanishes for hundreds of presses (WCAG 2.4.3, 2.4.7). The canvas and edit panel sit after the palette in forward tab order.
- Suggestion: remove collapsed accordion content from the tab order (inert or hidden), then give the device list a roving tabindex so the palette is one stop with arrow-key navigation, and add a skip-to-canvas link. The accordion fix alone removes about 80% of the wall.

### R15 There is no dependable keyboard path to place a device (major, medium)

- IDs: J7-F3, J7-F12.
- Observed: the "Add device..." lead row is deliberately inert on Enter with an empty query (the #2777 decision-8 browsing mode) and disappears once you type; the only typed route is the no-command-match bridge, which renders only when a query fuzzy-matches zero commands, and the fuzzy matcher is loose enough that "server", "switch", and "device" all match commands and hide it ("xserve" matched "Export all layouts" and Enter fired a ZIP export). The sidebar device rows are focusable but Enter/Space do nothing (`role="listitem"` with `tabindex="0"`).
- Friction: the app's core action is effectively mouse-only; the working keyboard path depends on guessing a query that avoids colliding with command names.
- Suggestion: keep decision 8 for ordinary commands, but make the Add-device row keyboard-armable and persistent in the search branch, or always show the device bridge alongside command matches. Make sidebar rows either operable (Enter arms placement, `role="button"`) or non-focusable.

### R16 collected minors for the palette

- R16a Focus falls to body after every palette action (minor, small). ID: J7-F5. Suggestion: restore focus to the command pill or the acted-on object.
- R16b Dead command: "Toggle device sidebar" / plain d (minor, small). ID: J7-F8. It flips `leftDrawerOpen`, which no component reads. Suggestion: wire it to the real collapse mechanism or delete the command and shortcut.
- R16c Cmd+H collides with macOS Hide (minor, quick win). ID: J7-F9, code-inferred (headless cannot reproduce OS interception). Suggestion: drop the Cmd+H binding, keep Ctrl+H.
- R16d The ? help dialog lists no keyboard shortcuts (minor, small). ID: J7-F11. It shows three mouse gestures; the shortcut set is discoverable only by reading palette rows. Suggestion: generate a shortcuts section in the help dialog from the registry so it cannot drift.

## Theme 5: screen reader and touch accessibility

### R17 collected screen-reader correctness fixes (all minor, mostly quick wins)

- R17a Announced U-positions are impossible numbers (minor, small). ID: J1-F11. Verified: V2 confirmed, a device at U17 is described as "U102" because src/lib/components/Canvas.svelte:372 formats raw rail position (displayed U times 6); an unused `formatPosition()` helper already exists. It is an `aria-describedby` description region rather than aria-live, which does not change the fix. Suggestion: use the display transform and add a test asserting announced U equals rendered U.
- R17b Renames never reach assistive tech (minor, quick win). ID: J3-F2. The rack device aria-label is built from `device.model ?? device.slug` (src/lib/components/RackDevice.svelte:141, 346) and ignores the placement's custom name, so three renamed servers all announce "Server". Suggestion: use the same name precedence as the visible label.
- R17c Dialog autofocus is inconsistent and lands on the X (minor, small). ID: J7-F10, resolving the code sweep's open question. Help, Export, Settings, and the Remove confirm focus the header close button; Share focuses its URL input. Confirms should focus the safe action (Cancel), forms their first field. Suggestion: standardise in the Dialog wrapper.
- R17d Sub-44px touch targets on mobile (minor, small). ID: J1-F12. Storage pill 139x28, bay handle 16x40, toast dismiss 24x24, in-toast Export 64x28, segmented display controls about 27px tall, against the project's own 44px bar in docs/guides/ACCESSIBILITY.md. Suggestion: expand hit areas, visual size can stay.

## Theme 6: multi-rack model

### R18 Identical default rack names cascade into ambiguity (major, small)

- IDs: J4-F2. Verified: V2 confirmed, including the ambiguous delete confirm.
- Observed: handleNewRack always names racks "Racky McRackface" (src/lib/utils/dialog-actions.ts:17, 34) with no numbering. Downstream: the delete confirm cannot say which rack dies, the cycle toast "Active: Racky McRackface" is useless, and both mobile switch dots carry the identical aria-label "Switch to Racky McRackface".
- Suggestion: auto-number ("Rack 1", "Rack 2", or "Racky McRackface 2") at creation when the name is taken. This is not a re-litigation of direct-create; the issue is only that direct-create hard-codes one identical name.

### R19 After duplicating a rack, two current-rack indicators disagree (major, small)

- IDs: J4-F3. Verified: V2 confirmed and root-caused, duplicateRack sets `activeRackId` to the copy but never updates the selection store; the sidebar keys off active (src/lib/components/RackList.svelte:290-326) while the canvas outline, edit panel, and delete target key off selected.
- Observed: pressing Delete at that moment targets the original while the sidebar highlights the copy; combined with R18's identical names this is how the wrong rack gets destroyed.
- Suggestion: after duplicate, point selection and active at the same rack (selecting the new copy matches user intent), and drive both indicators from one concept.

### R20 collected minors for multi-rack

- R20a Duplicated rack lands off screen with no re-fit (minor, small). ID: J4-F5. The copy is appended beyond the right viewport edge and silently becomes active while invisible. Suggestion: place adjacent to the source and fit it into view, as handleNewRack already does.
- R20b Rack name commits on blur while sibling fields are live (minor, small). ID: J4-F4. Height, width, depth, and numbering apply on click; the name updates nothing until blur/Enter. Suggestion: live-echo the title or add a saved affordance, and see R27e.
- R20c No overview aid as rack count grows (minor, medium). ID: J4-F6. Three racks render six columns (front+rear) and fit-all lands at 50% zoom; no minimap exists. Suggestion: consider fit-to-front bias, a per-canvas hide-rear, or lean on the sidebar as the overview.
- R20d Mobile fit-to-screen clips the rear view and title (minor, medium). ID: J4-F7. Fit fits height only; the front+rear pair overflows 390px. Suggestion: fit width on mobile or page front/rear separately.
- R20e Fit naming and active-accent drift (minor, quick win). ID: J4-F8. "Fit all" (desktop) vs "Fit to screen" (mobile); active rack is pink on desktop, a cyan dot on mobile. Suggestion: one label, one accent.
- R20f Duplicated devices are not name-differentiated (polish, quick win). ID: J3-F9. The copy is also "Server" although the undo history already says "Place Server (Copy)". Suggestion: apply the existing "(Copy)" suffix to the placed name.

## Theme 7: feedback, toasts, and edit panels

### R26 Mobile first-run toast pile buries the app (major, small)

- IDs: J1-F10, J1-F2, J6-F6.
- Observed: first load stacks a dev-build toast plus two near-duplicate storage warnings ("Layouts are saved in this browser. Export to a file to keep a copy." from src/App.svelte:169 and "This layout lives only in this browser. Export a file to keep a copy." from src/lib/utils/backup-nudge.ts:32); on mobile the cards cover roughly 60% of the viewport and float above any sheet opened in the first ten seconds, including the Export and Share sheets they partially cover.
- Suggestion: one first-run storage notice with one phrasing; on mobile a single compact toast or banner; suppress info toasts while a sheet or dialog is open.

### R27 collected toast and feedback minors

- R27a Toasts render above modal dialogs and can cover Cancel (minor, small). ID: J3-F8. z-toast 300 sits above z-modal 200 by design, and a lingering "Device duplicated" toast covered the Remove confirm's Cancel on mobile, nudging toward the destructive action. Suggestion: dismiss or drop toasts below modals when one opens.
- R27b Rapid undo stacks five toasts over the canvas (minor, small). ID: J3-F7. Suggestion: collapse consecutive undo/redo toasts into one updating toast or cap the stack.
- R27c First-run toasts occlude the rack's lower slots and the seeded placement cursor, and the persistent drag hint hides behind the verb bar (minor, small). ID: J1-F4. Suggestion: anchor the hint stack clear of the canvas and verb bar.
- R27d Empty-canvas click does not deselect (minor, small). ID: J3-F1. Escape works; clicking empty canvas leaves selection intact, against desktop convention. Suggestion: clear selection on empty-canvas click.
- R27e One edit panel, three confirmation models (minor, small). ID: J3-F3. Colour applies live silently, name commits on blur silently, IP/Notes flash a saved check (src/lib/components/EditPanelMetadata.svelte:88-211). Suggestion: one confirmation model for placement fields, aligned with R20b.
- R27f Escape with the colour picker open clears the whole selection (polish, small). ID: J3-F5. Suggestion: let the popover consume the first Escape.
- R27g Colour picker offers brights that fail label contrast (minor, small). ID: J3-F4. The swatch row offers raw Dracula accents; picking Red renders white-on-#FF5555, under AA, which BRAND.md explicitly forbids as text background. Suggestion: preset the muted device palette instead, keep hex entry for power users.

## Theme 8: device library and first-run copy

- R28a Empty search results dead-end (minor, small). IDs: J2-F4, J8-F7. "No devices match your search" offers no clear-search or create-custom tie-in even though Add custom device sits nearby. Suggestion: add "Clear search" and "Create custom device named <query>" to the empty state.
- R28b Desktop sidebar truncates device names (minor, medium). ID: J2-F5. Two "Blade Server (..." rows are indistinguishable at 320px while the same names render fully on mobile. Suggestion: give names more width or a second line.
- R28c Mobile Devices tab uses a photo icon (minor, quick win). ID: J2-F6. `IconImageBold` at src/lib/components/mobile/MobileBottomNav.svelte:99 reads as media, not devices, and matches nothing on desktop. Suggestion: use a hardware glyph consistent with the desktop tab.
- R28d Three names for one surface (polish, quick win). IDs: J1-F13, J1-F3. Devices (tabs), Device Library (mobile sheet title), items (onboarding hint). Suggestion: pick one.
- R28e The most prominent create control makes layouts, not racks (minor, quick win). ID: J1-F6. The "+" starter menu is clean, but a newcomer thinking "add another rack" gets a whole new layout tab. Suggestion: tooltip "New layout (new tab)" and keep add-rack equally discoverable.
- R28f Empty rack copy describes absence (polish, quick win). ID: J1-F7. "No front-facing or full-depth devices" vs the exemplary empty-canvas state ("This layout has no racks yet." + Add a rack). Suggestion: invite the first device instead.
- R28g Wheel-zoom hijacks scroll with no cue (polish, small). ID: J1-F8. Two-finger scroll over the canvas zooms with no modifier. Suggestion: optional modifier or a first-run micro-hint; current model is defensible.
- R28h A-Z mode leads with cryptic model numbers (polish, medium). ID: J2-F7. 748 items opening at "5PX1500iRT". Suggestion: a jump index or de-prioritising leading digits; explicit power-user mode, low priority.
- R28i Mobile palette rows show a drag grip where the interaction is tap (polish, quick win). ID: J2-F9. Suggestion: hide the grip on touch surfaces.

## Theme 9: dialog, button, and token consistency (code-level)

- R31a Dialog CTAs split across two colour systems (minor, medium). ID: C-F3. Dedicated muted `--colour-button-primary` / `--colour-button-destructive` tokens exist (tokens.css:227-235) but most dialogs paint CTAs with raw bright `--colour-selection` / `--colour-error` (ConfirmDialog.svelte:135,144 and six others); only three components use the intended tokens. Thirteen components each re-declare their own `.btn-*` styles, so drift is structural. BRAND.md forbids neon accents as button fills. Suggestion: a shared button component (or global .btn) routed through the CTA tokens.
- R31b Sibling confirm dialogs diverge (minor, small). ID: C-F4. ConfirmDialog vs ConfirmReplaceDialog differ on type tokens, showClose, and Enter-to-confirm (one has a document-level Enter handler, the other none). Suggestion: fold them into one confirm component with one spec.
- R31c ExportDialog reimplements Escape the primitive already owns (minor, quick win). ID: C-F5. A window-level keydown listener duplicates the Dialog primitive's Escape handling; sole outlier. Suggestion: delete it.
- R31d Font-size and colour literals bypass tokens in a cluster (polish, small). ID: C-F6. LoadDialog hardcodes all ten of its sizes; DeviceDetails, ConfirmReplaceDialog, Toast, and a ShareDialog hex `#644ac9` join it, while 54 components use tokens. Suggestion: swap literals for tokens in the named files.
- R31e "New Layout" vs "New layout" casing drift (polish, quick win). ID: C-F7. LayoutsLibrary title-cases what the tabs and palette sentence-case; "New Rack" is consistently title-cased everywhere. Suggestion: pick the palette's casing.

## Theme 10: cabling is a data layer without a UI

- R32 Cabling has no user-facing entry point (major in journey terms, roadmap context, effort large and scoped to epic #1928). ID: J5-F1. A complete cable model, store CRUD, validateCable, and undo integration exist, but `getCableStore()` (src/lib/stores/cables.svelte.ts:170) has zero component callers, nothing renders cables, and Rack.svelte:535 never supplies `onPortClick`, so port clicks are no-ops. The palette, edit panel, view tab, verb bar, and context menu contain no cable verb. This matches the planned connectivity epic (#1928, M005/M006), so it is an unshipped feature surfacing in a UI review rather than a defect; nothing in the UI hints at cabling today, so users are not misled. Suggestion: when the epic lands, the natural wiring is port-click to start a pending connection plus a palette command and a cable inspector.
- R32a No stock device declares interfaces (minor, small). ID: J5-F2. Even "Switch (24-Port)" renders zero ports because only NetBox import populates `interfaces` (src/lib/utils/netbox-import.ts:519), so the shipped port-indicator feature is invisible with stock content and there is nothing to cable. Suggestion: add interfaces to the port-bearing starter devices; useful independent of the epic.
- R32b Future vocabulary collision (polish, no action now). ID: J5-F3. "Cable Management" (device category) vs a future cable/connection feature.

## What works well

Recorded so improvements do not regress them: security probes pass everywhere (markup in device, rack, and layout names renders inert in SVG, panels, tabs, thumbnails, and export previews; garbage share links fail cleanly; no uncaught console errors across all error-state runs); failed imports never mutate state; undo/redo covers every device operation and round-trips perfectly with descriptive toasts; rack deletion confirms and restores fully on undo; the first run avoids a blank dead-end (auto-created starter rack, palette open, exemplary empty-canvas state); the starter template menu is clean; search relevance and typo tolerance are strong; keyboard placement, once reached, is precise (per-U ghost movement that skips occupied slots); dialogs trap focus and close on Escape; aria-live placement and toast announcements are well built; mobile holds together at 390px with full device-operation capability and comfortable 48px sheet targets; the export dialog (preview, filename preview, loader, success toast) is the strongest dialog in the app; cross-rack drag has clear feedback; the storage chip popover honestly separates autosave from export.

## Settled decisions

No finding argues to reverse a settled decision. The palette-as-single-command-surface findings (R13, R15, R5) all point the same direction: complete the palette rather than add surfaces. Mobile view-first is not contradicted; mobile turned out fully edit-capable, and its worst finding (R8) is a layout bug, not a strategy problem. The starter menu is praised by the first-run review. One in-code decision is touched: #2777 decision 8 (palette Enter inert while browsing) is respected by R15's suggestion, which keeps browsing-mode inertness for commands while making the explicit Add-device affordance keyboard-armable.

## Quick wins table

| Ref | Fix | Files |
| --- | --- | --- |
| R1 | Drop `;charset=utf-8` from the save blob MIME | src/lib/utils/archive.ts:274, LayoutYamlPanel.svelte:219 |
| R5 | Relabel "Export layout (.zip)" to (.yaml); one verb for backup | src/lib/actions/registry.ts |
| R6a | Chip label "Not exported"; start starter rack clean | storage chip, workspace init |
| R11 | Standardise Remove vs Delete per the in-code convention | DeviceContextMenu, registry, DialogOrchestrator |
| R16c | Drop the Cmd+H share binding | src/lib/actions/registry.ts:414-425 |
| R17b | Announce the placement's custom name | src/lib/components/RackDevice.svelte:141,346 |
| R20e | One fit label, one active accent | CanvasViewControls, MobileViewSheet |
| R20f | Name duplicates "(Copy)" | duplicate handler |
| R28c | Replace the mobile Devices photo icon | MobileBottomNav.svelte:99 |
| R28d | One name for the device surface | tabs, sheet title, onboarding hint |
| R31c | Delete ExportDialog's redundant Escape listener | ExportDialog.svelte:336-382 |
| R31e | Sentence-case "New layout" in LayoutsLibrary | LayoutsLibrary.svelte:336,347 |

## Candidate issue breakdown

Grouped into waves by shared files so they can run through /orchestrate-issues without conflicts. Severity-ordered within waves. Wave 1 is a hotfix candidate independent of everything else.

Wave 1 (hotfix candidate, no shared files with other waves):

1. Fix Chromium YAML save failure: clean MIME type, audit LayoutYamlPanel, plain-language save-error fallback (R1). Files: archive.ts, LayoutYamlPanel.svelte, manager.svelte.ts.

Wave 2 (replace-flow guards, shares load-pipeline/dispatch/App.svelte):

2. Guard or re-route file open when unexported changes exist; make the retained layout visible (R2). Files: load-pipeline.ts, dispatch.ts.
3. Guard share-link entry the same way; surface the recovery path (R3). Files: App.svelte, share handling.

Wave 3 (import error copy, shares yaml.ts/load-pipeline.ts with wave 2, run after):

4. Human-readable import errors, one error-copy helper shared with the share path, strip Zod prefixes (R4). Files: yaml.ts, load-pipeline.ts.

Wave 4 (placement interaction, shares rack-interaction-handlers/RackCanvasView):

5. Visible feedback for occupied-slot and no-room placement; suppress select-through while armed (R7, R9c). Files: rack-interaction-handlers.ts, RackCanvasView.svelte.
6. Mobile placement banner fits the viewport with Cancel reachable (R8). Files: placement banner component.
7. Pointer-tracking placement preview and post-placement confirmation (R9a, R9b). Files: RackCanvasView.svelte, placement state.

Wave 5 (destructive-action policy, shares dispatch/dialog-actions/EditPanelActions/context actions):

8. One removal policy across all five affordances, undo toast on silent paths, one verb (R10, R11). Files: dispatch.ts, dialog-actions.ts, EditPanelActions.svelte, rack-context-actions.ts, DeviceContextMenu.svelte, DialogOrchestrator.svelte.
9. Device-aware rack-delete warning; guard bayed-empty context delete (R12). Files: rack-actions.ts, DialogOrchestrator.svelte.

Wave 6 (palette registry, shares registry.ts/dispatch.ts):

10. Add New rack and browser-mode save commands; remove or wire the dead toggle-sidebar command; drop Cmd+H (R13, R16b, R16c). Files: registry.ts, dispatch.ts.
11. Keyboard path to device placement: armable Add-device row, persistent device bridge, operable or non-focusable sidebar rows (R15). Files: CommandPalette.svelte, DevicePaletteItem.svelte.
12. Focus restoration after palette actions (R16a). Files: CommandPalette.svelte.

Wave 7 (a11y pack, shares palette/canvas/rack components):

13. Remove collapsed accordion content from the tab order; roving tabindex for the device list; skip-to-canvas link (R14). Files: device palette accordion components.
14. Screen-reader correctness: displayed U in descriptions, custom-name precedence in aria-labels (R17a, R17b). Files: Canvas.svelte, RackDevice.svelte.
15. Dialog autofocus standard and a keyboard-shortcuts section in help (R17c, R16d). Files: Dialog.svelte, HelpPanel.svelte.
16. Mobile touch-target pass to the documented 44px bar (R17d). Files: storage chip, toast, bay handle, segmented controls.

Wave 8 (rack lifecycle, shares dialog-actions/rack store):

17. Auto-number default rack names (R18). Files: dialog-actions.ts.
18. Sync selection and active after duplicate; fit the copy into view (R19, R20a). Files: rack store duplicate handler.

Wave 9 (toast system, shares toast/App.svelte/backup-nudge):

19. Single first-run notice; mobile toast compaction; toasts below modals; collapse undo stacks; keep hints clear of the verb bar (R26, R27a, R27b, R27c). Files: Toast system, App.svelte, backup-nudge.ts, tokens (z-order).

Wave 10 (edit-panel consistency, shares EditPanel components):

20. One confirmation model for placement fields; live rack-name echo; popover-scoped Escape; muted colour presets (R27e, R20b, R27f, R27g). Files: EditPanelMetadata.svelte, EditPanelRack.svelte, colour picker.
21. Empty-canvas click clears selection (R27d). Files: canvas interaction handlers.

Wave 11 (copy and visual polish batch, wide but mechanical):

22. Terminology and empty-state sweep: device-surface naming, items wording, empty search and empty rack actions, casing, chip vocabulary, fit label, filename source (R28a, R28d, R28e, R28f, R31e, R6a remainder, R20e, R6c). Files: scattered strings.
23. Shared button component and confirm-dialog unification on the CTA tokens (R31a, R31b, R31d, R6b). Files: 13 dialog components, new ui/Button.

Independent (roadmap):

24. Add interfaces to port-bearing starter devices so port indicators render with stock content (R32a). Files: starterLibrary.ts. The rest of cabling belongs to epic #1928.

## Limitations

Native HTML5 drag-and-drop could not be fully exercised by Playwright (placement was verified through click/tap/keyboard paths; the drag path's occupied-slot toast is code-confirmed only). Mobile pinch-zoom was not exercised. Cmd+H OS interception is inferred from macOS behaviour, not reproduced (headless has no window manager). Real-OS save dialogs were out of automated reach; the R1 failure was nonetheless reproduced in real headed Chrome. The J4 reviewer only partially exercised the #2961 undo-restores-active-rack path.
