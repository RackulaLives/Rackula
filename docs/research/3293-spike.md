# Spike #3293: layouts of about 100 racks

Date: 2026-09-19 Issue: #3293 Prompted by: #3350 (thanks @Plangloi) Related: #3287, #3295, #3297, #272

Supporting documents:

- `docs/research/3293-scale.md`: measurements at 24, 50 and 100 racks, plus five prototype builds.
- `docs/research/3293-codebase.md`: where the cap, the canvas, the render path and the storage limits live.
- `docs/research/3293-external.md`: how other tools present hundreds of racks, and the browser limits that bind.
- `docs/research/3293-prototypes.patch`: the throwaway diffs behind the prototype numbers.
- `docs/research/3293-scale-gen.mjs`: the layout generator.

## Executive summary

100 racks is achievable, and the work is not a bigger number. Raising `MAX_RACKS` to 10,000 as #3350 proposed would let a user build a layout that takes 6.7 s to open and zooms at 3 fps.

What the measurements say:

- Rack count is a poor predictor of cost. 24 device-dense racks are slower than 50 sparse ones. A cap counted in racks alone is the wrong instrument.
- The canvas cost is dominated by things that have nothing to do with how many devices a user placed: the rack frame emits 391 SVG elements per rack face, 252 of them individual rail-hole rects, so 100 empty racks already mount 84,164 elements.
- Zoom is a layout problem, not a script problem, and SVG `<text>` is what makes it expensive. Script time during a zoom is 21 ms while layout is 2,603 ms, and removing only the U-number labels cuts that layout time by 86%.
- Viewport culling is the single biggest lever. A prototype that mounts a rack only when it scrolls into view took pod-100 from a 2,083 ms longest task and 167 ms zoom p95 to 450 ms and 16.8 ms, with the heap down from 176 MB to 80 MB.
- Once culling is on, the remaining cost is the load pipeline, and it tracks file size at about 0.27 ms per KB at 4x. The 500 ms budget corresponds to a file of roughly 1.6 MB.
- The limits that break first at this size are not the canvas. The server save cap is 1 MB against files of 1.5 to 2.0 MB; a full layout cannot fit in a share URL; a 100-rack PNG would be 104,000 px wide, which no browser can produce; and localStorage silently loses the layout when it fills.

Recommended shape, in order:

1. Now, without waiting for the rendering work: raise the cap to 24, enforced on creation only, bundled with the frame-chrome fix that costs nothing. This unblocks #3295.
2. Next: culling, level of detail, and a load pipeline that yields. These are what make 100 racks real, and they are measurable against the #3297 budgets.
3. With those in: raise the cap to 100, add a soft warning tier above it rather than a second wall, and lower the zoom floor so 100 racks can actually be framed.
4. Independently, and urgently: the silent localStorage data loss.

## 1. Cap model

Recommendation: keep a hard cap on racks, enforced only on creation, and pair it with a soft, named warning about layout size. Do not build a composite complexity score.

Why a rack cap at all, given that rack count predicts cost poorly: because it is the number the user is asking about, it is the only one they control directly when clicking "Add rack", and every alternative we measured is worse as a gate. What a rack cap cannot do is promise performance, so it should be documented as a tested ceiling, not a safety limit.

Why not a composite budget over racks, devices, ports and connections: GitHub and Notion both run several independently named budgets, each with its own message, while a single opaque score gives a user nothing to delete (`3293-external.md` section 3.4). Rackula's honest second axis is layout size in bytes, because that is what actually breaks the server save, browser storage and the share link, and it is one number we can show.

Specifics:

- Raise `MAX_RACKS` from 10 to 24 now, then to 100 once culling and level of detail ship. 24 is the largest count that meets the #3297 budgets on current main at sparse density (560 ms longest task, 33.4 ms zoom p95), and it becomes comfortable with the frame-chrome fix alone (433 ms). 100 is the tested ceiling with culling on.
- Enforce on creation paths only, and disable the surface instead of toasting after the click. Today the cap is read in seven store checks plus one UI check, no surface is ever disabled, and it always surfaces as a post-click toast (`3293-codebase.md` section 1).
- Never enforce on load. That is already the behaviour, and it matches every product surveyed: zero of ten block opening an over-budget document (`3293-external.md` section 3.1). Keep read, edit, delete and export working; only "add more" stops.
- Tell the user where they stand when a loaded file is over the ceiling, once, non-modally, naming the number. Figma's Recovery Mode and Notion's "you won't be able to add new rows" are the models.
- Add a size warning tied to the real limits rather than to a guess: warn when a layout's serialised size approaches the server save cap, since that is the first hard failure a server-mode user hits.

## 2. Layout and navigation

Recommendation: keep the flat `rack_groups` axis, wrap groups into stacked rows, lower the zoom floor, and add a way to find a rack. Do not add a hierarchy of halls and pods.

One row does not survive this size. 100 dual-view racks is about 50,400 px wide. Fitting that into a 1600 px viewport needs a zoom of about 0.032, and the floor is 0.25 in two places (`canvas.svelte.ts:34` and `canvas.ts:95`). Even a 10 by 10 grid needs about 0.083, so the floor has to drop whatever shape we choose.

On the data model: NetBox removed rack groups in 2.11 and brought them back in 4.6 explicitly as "a lightweight secondary axis of rack organization (e.g. by row or aisle)", flat and non-hierarchical (`3293-external.md` section 1.2). Rackula already has exactly that in `RackGroup`. The gap is presentation, not schema: groups render inline in the same single row. Wrapping each group onto its own row is additive, needs no new required fields, and `Rack`/`RackGroup` passthrough plus `appendUnknownKeys` means an optional row or order field round-trips through prior releases (`3293-codebase.md`, Constraints).

Fit-all is the other half of the problem. It is called after load, share, starter open, new rack, duplicate, every placement and most dialog closes, and at 100 racks each of those snaps the camera to the floor and top-left, throwing away where the user was. That needs to stop being automatic at scale.

Nobody renders 100 elevations at once. NetBox paginates elevations at 50 into a horizontally scrolling strip, RackTables wraps cached per-rack thumbnails at 12 per line, openDCIM scopes to a row, and Device42 and Sunbird require an explicit selection (`3293-external.md` section 1). Rackula's equivalent of "drill in" already exists as focus-rack; what is missing is the way to get to a rack you cannot see:

- Rack search in the command palette, which already exists as a surface and today only searches the device library for placement.
- Make `[` and `]` move the camera. They currently cycle array order, select, and toast the name without moving the view.
- Search and camera-move in the rack list, which today has neither.
- No minimap is needed if the zoom floor drops and level of detail makes the zoomed-out view cheap: fit-all then is the overview.

## 3. Render performance

Recommendation: cull, then apply level of detail, then make the load pipeline yield. Re-scope #3297 to cover culling and level of detail together, because neither alone covers both the load and the zoomed-out case.

Measured effect at 4x on pod-100 (100 racks, 336 devices), from `3293-scale.md`:

| Build | Longest task | Zoom p95 | Heap | Rack faces mounted |
| --- | --- | --- | --- | --- |
| current main | 2,083 ms | 166.7 ms | 176 MB | 200 |
| culling | 450 ms | 16.8 ms | 80 MB | 16 |
| culling plus chrome plus label LOD | 461 ms | 16.8 ms | 98 MB | 16 |

The order matters and the reasons differ:

- Culling is what makes a 100-rack layout behave like a 16-rack one at normal zoom. It is the only change that reduces mount cost, heap and zoom cost together.
- Level of detail is what saves the zoomed-out view, where culling has nothing to cull because every rack is on screen. Hiding U-number labels alone hits the zoom budget on pod-100 with no culling at all (33.4 ms). Quantise zoom into a few tiers with hysteresis rather than reacting continuously, and consider exposing fidelity as a user control as NetBox does.
- Frame chrome as paths or patterns is a cheap, independent 61% cut in node count with pixel-identical output. Use `<pattern>`, not `<use>`: a pattern is a paint server painted per tile, while `<use>` clones the subtree and creates layout objects per instance (`3293-external.md` section 2.4).
- The load pipeline is the residual. With culling on, the longest task tracks YAML size at about 0.27 ms per KB at 4x, so a 2 MB layout stays over budget until parse, validation and hydration stop running in one task.

Implementation cautions, all from the research rather than from taste:

- Cull by hiding rather than unmounting where you can. tldraw keeps culled shapes in the DOM with `display: none`; React Flow's unmount-style culling defaults to off, "adds an overhead" and re-initialises on reappearance. The trade-off is real though: hiding does not avoid the initial mount cost, which is most of what the prototype's 2,506 ms to 610 ms time-to-first-device win came from. A mount-on-demand path with correctly sized placeholders is what we measured, so treat the accessibility tree as part of the work, not an afterthought.
- Budget for accessibility. Every rack is a listitem, every device a button, every port focusable. `display: none` removes elements from the accessibility tree and virtualised content breaks screen reader buffers. A roving tabindex over racks, with ports reachable only inside the focused rack, is the standard answer.
- Do not use the culled set to answer geometric questions. The camera model in `canvas.ts` already disagrees with the renderer about ordering and about row-group chrome; culling would give a third opinion.
- `content-visibility: auto` is a dead end here, measured, not assumed: Chromium collapses skipped flex items to 0 px in the inline axis whatever intrinsic size is set, and the canvas reflowed. The CSS working group has not resolved whether containment applies to SVG children at all.
- `text-rendering: geometricPrecision` gives about 30% of the zoom layout cost back on its own, because Blink's scaled-font path short-circuits on that value. It is additive, not a substitute, and Gecko treats the value as `optimizeLegibility`, so it must be measured in Firefox before shipping.

Two adjacent costs turned up that are not about rack count and should be fixed on their own merits:

- `ConnectionLayer` scans every connection for every rack face, and because every mutation replaces the whole layout object, that scan re-runs in all 200 faces on any edit anywhere. Index connections by rack face.
- Selection costs 716 ms at 100 racks mostly because the verb bar runs a rAF loop doing an attribute `querySelector` over the whole canvas subtree plus `getBoundingClientRect`, forcing layout on an 80,000 node SVG.

## 4. Data and file limits

None of these are Cloudflare's limits. They are ours, and each fails in a way the user cannot diagnose.

- Server save: layout PUT and GET are hard-capped at 1 MB, against 1.5 to 2.0 MB for 100 racks, and the failure surfaces as a generic sticky "Save failed". Cloudflare's own body limit is 100 MB even on Free, and R2 objects go to 5 TiB. Raise the cap and report the real reason.
- Browser storage: one 100-rack layout autosaves 1,573,823 characters into a single localStorage key. Chrome charges 2 bytes per character against a 10,485,760 byte budget, so the origin ceiling is about 5.09 million characters and three such layouts do not fit. Measured failure mode: with storage nearly full, the layout renders, the UI says "Saved", no layout key is written, and after a reload the workspace still lists the layout while the canvas is empty with no error. That is silent data loss and it does not need 100 racks to happen. IndexedDB or the Origin Private File System with `navigator.storage.persist()` is the right home; Safari additionally deletes script-writable storage after seven days without interaction.
- Share links: a full layout cannot travel in a URL at this size. Even at 20:1 compression plus base64, 2 MB lands near 133 KB, against a 16 KB Cloudflare URL limit and a 2,953 byte QR ceiling. Today share links stay small only because they drop ports, connections and every rack's position, which at 100 racks means a shared link is silently not the layout the sender saw. A server-stored short id is the only design that scales; until then the lossiness needs to be visible.
- Export: a 100-rack PNG would rasterise about 104,000 px wide. Chrome caps a side at 65,535 and area at 268 million px, Firefox at 32,767 per side before version 149, and Safari lower still. `toDataURL` returns the string `"data:,"` and `toBlob` returns null rather than throwing, which is exactly the "Failed to create blob" path. 1,444 inches is also 7.2x the PDF page limit jsPDF clamps to. Default to per-rack or paged output above some rack count; `exportAsZip` and `exportAsMultiPagePDF` already exist in the codebase with no call site, while the dialog promises ZIP for 4 or more racks.
- NetBox import: not a concern today. There is no rack or inventory importer; in-app NetBox import produces a single device type. Large NetBox-derived layouts can only arrive as Rackula YAML through File Open, which is uncapped.
- Schema: no new required field is needed for any of this. Row or grid placement can be optional and additive, but touching `src/lib/schemas` trips the corpus-freshness release gate, so a schema change needs a new upgrade-corpus fixture in the same PR.

## 5. Decision on the interim cap bump

The original proposal in this issue was 24 racks plus a lower zoom floor. Verdict: ship the 24, change the rest.

- Ship 24 now. It is the largest count that meets both #3297 budgets on current main at sparse density, it unblocks #3295 (one SU, about 18 racks), and it answers the real request in #3350 without pretending the canvas is ready for 100.
- Bundle the frame-chrome fix with it. It is a contained change to `RackFrame.svelte`, it is pixel-identical, and it takes pod-24's longest task from 560 ms to 433 ms, which puts the interim cap inside budget rather than on its edge.
- Do not lower the zoom floor as part of that bump. At 24 racks fit-all lands above the floor anyway; the floor only has to move for the 100-rack case, and it should move together with whatever row layout ships, so the two are tested as one.
- Be explicit that 24 is interim. The path to 100 is culling plus level of detail plus a load pipeline that yields, all measurable against the budgets in `3293-scale.md`.

## 6. What to file

Fifteen follow-ups, grouped by what they unblock. #3297 is re-scoped rather than duplicated.

Interim, independent, ships now:

- #3364 frame chrome as paths or patterns.
- #3365 raise `MAX_RACKS` to 24, enforce on creation, disable the surface instead of toasting.

The 100-rack path:

- #3366 viewport culling. Replaces the original scope of #3297.
- #3367 zoom level-of-detail tiers.
- #3368 yield in the load pipeline.
- #3369 lower the zoom floor, de-duplicate the constant, stop fit-all discarding the camera.
- #3370 wrap groups into stacked rows.
- #3371 find a rack: palette search, camera-moving `[` and `]`, rack list search.
- #3372 raise the cap to 100 with a soft size warning, gated on #3366, #3367 and #3368.

Adjacent performance, worth doing on their own merits:

- #3373 index connections by rack face.
- #3374 verb bar selection cost.

Limits that fail badly at this size:

- #3375 silent localStorage quota data loss. A bug at any size, and the highest priority here.
- #3376 raise the 1 MB server layout cap and report the real error.
- #3377 paged or per-rack export above a rack threshold.
- #3378 share links silently drop ports, connections and rack positions.
