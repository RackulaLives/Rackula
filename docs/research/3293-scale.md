# Spike #3293: scale measurements at 24, 50 and 100 racks

Question from the issue: measure 24, 50 and 100 racks, reusing the #3287 harness, and find what a 100-rack layout actually costs.

Spike #3287 measured DGX POD layouts up to 71 racks (`docs/research/3287-scale.md`). This run adds exact rack counts, a second workload whose connections actually draw, diagnostic scenarios that separate the cost of the rack frame from the cost of devices, and four prototype builds that test candidate fixes.

## Method

- App: production build (`vite build`) of `origin/main` at 4c627f07, served with `vite preview`. Prototypes are separate builds of the same tree with one patch applied, each served on its own port, so builds can be compared back to back.
- Browser: Playwright 1.63.0 driving Chromium headless shell 153.0.8010.12 at a 1600 x 1000 viewport. Side panels are open, so the canvas viewport is about 960 px wide.
- Machine: Apple M4, 10 cores, 24 GB. Other jobs shared the machine, so treat the numbers as indicative, not as a benchmark.
- CPU: each scenario ran at 1x and at 4x CPU throttling (CDP `Emulation.setCPUThrottlingRate`). 4x approximates a mid-range laptop. Each cell is the median of 3 runs in a fresh browser context with empty storage.
- Load path: File Open (`[data-testid="file-input-load"]`), the only path that keeps ports and connections.
- Scripts: `docs/research/3293-scale-gen.mjs` generates the layouts; `docs/research/3287-scale-measure.mjs` measures them unchanged.
- Unlike the #3287 run, this headless shell's `requestAnimationFrame` is vsync-locked: idle frame intervals sit at 16.7 ms and p95 values land on multiples of it. A p95 of 16.7 ms means the frame budget held.

Two deviations from #3287, both deliberate:

- The 3287 harness detects "loaded" by waiting for one `rack-device` element per placed device. A build that culls off-screen racks never reaches that count, so prototype builds were measured with a second script that uses a fixed 10 s observation window after the file is chosen, and reports time to the first rendered device instead. Baseline numbers were re-measured with that same script wherever a prototype is compared against them.
- Zoom is reported both as a p95 frame interval and as a CDP `Performance.getMetrics` breakdown (script, style, layout) across the 20-step wheel sequence. The breakdown is what identified the cost.

## Scenarios

`docs/research/3293-scale-gen.mjs` writes two profiles plus three diagnostics. All racks are dual view (`show_rear: true`) except `mixed-100-front`.

- pod-N: DGX density, the device model of #3287's su4-2pr. Every 17 racks form one SU: one leaf rack holding 8 QM9700, then 16 compute racks with 2 DGX B200 each. Every rack has an SN2201 out-of-band switch at U48. IB links cross racks, and BMC links end on a 53-port switch, so none of them draw today.
- mixed-N: device-dense 42U racks. Two 24-port switches, 4 2U servers and 18 1U servers per rack. Each server's two NICs go to the two in-rack switches, so every server link is same-rack and per-port, and draws. One uplink per rack crosses to the next rack.
- Diagnostics: `mixed-100-bare` (identical, no connections), `mixed-100-front` (`show_rear: false`) and `empty-100` (100 empty 42U racks).

The 24-port switch is full depth on purpose. A half-depth switch renders only on the front face while its ports are rear-mounted, so no link would anchor and nothing would draw, which is exactly the trap #3287 hit.

| Scenario | Racks | Groups | Devices | Ports | Connections | Same-rack | YAML |
| --- | --- | --- | --- | --- | --- | --- | --- |
| pod-24 | 24 | 2 | 84 | 2,884 | 412 | 60 | 398 KB |
| mixed-24 | 24 | 3 | 576 | 2,736 | 1,103 | 1,080 | 468 KB |
| pod-50 | 50 | 3 | 168 | 5,432 | 870 | 118 | 752 KB |
| mixed-50 | 50 | 5 | 1,200 | 5,700 | 2,299 | 2,250 | 977 KB |
| pod-100 | 100 | 6 | 336 | 10,864 | 1,740 | 236 | 1,500 KB |
| mixed-100 | 100 | 10 | 2,400 | 11,400 | 4,599 | 4,500 | 1,963 KB |
| mixed-100-front | 100 | 10 | 2,400 | 11,400 | 4,599 | 4,500 | 1,964 KB |
| mixed-100-bare | 100 | 10 | 2,400 | 11,400 | 0 | 0 | 1,643 KB |
| empty-100 | 100 | 10 | 0 | 0 | 0 | 0 | 23 KB |

## Baseline results (current main)

Medians of 3 runs, times in ms. Longest task and TBT cover the load window. Select is the time from click to highlight. Zoom, pan and drag give the p95 frame interval during that interaction. 42 runs, no failures, no page errors.

| Scenario | CPU | Load | Settle | Longest task | TBT | Select | SVG nodes | Heap | Drawn | Zoom p95 | Pan p95 | Drag p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pod-24 | 1x | 195 | 258 | 152 | 102 | 71 | 30,794 | 82 MB | 0 of 412 | 16.7 | 16.7 | 16.7 |
| pod-24 | 4x | 792 | 883 | 560 | 646 | 239 | 30,794 | 79 MB | 0 of 412 | 33.4 | 16.7 | 16.7 |
| pod-50 | 1x | 318 | 433 | 262 | 242 | 106 | 57,830 | 117 MB | 0 of 870 | 16.8 | 16.7 | 16.7 |
| pod-50 | 4x | 1,422 | 1,587 | 1,034 | 1,273 | 390 | 57,830 | 122 MB | 0 of 870 | 83.4 | 16.7 | 16.7 |
| pod-100 | 1x | 648 | 808 | 543 | 603 | 187 | 109,958 | 187 MB | 0 of 1,740 | 33.4 | 16.7 | 16.7 |
| pod-100 | 4x | 2,961 | 3,148 | 2,264 | 2,856 | 716 | 109,958 | 190 MB | 0 of 1,740 | 166.7 | 16.7 | 16.7 |
| mixed-24 | 1x | 371 | 463 | 314 | 293 | 113 | 50,893 | 157 MB | 1,080 of 1,103 | 16.8 | 16.7 | 16.7 |
| mixed-24 | 4x | 1,621 | 1,882 | 1,370 | 1,649 | 496 | 50,893 | 161 MB | 1,080 of 1,103 | 100.1 | 16.8 | 16.7 |
| mixed-50 | 1x | 744 | 868 | 641 | 695 | 204 | 99,851 | 280 MB | 2,250 of 2,299 | 33.4 | 16.8 | 16.7 |
| mixed-50 | 4x | 3,028 | 3,414 | 2,603 | 3,197 | 756 | 99,851 | 275 MB | 2,250 of 2,299 | 183.3 | 16.8 | 16.7 |
| mixed-100 | 1x | 1,622 | 1,835 | 1,409 | 1,625 | 338 | 194,001 | 528 MB | 4,500 of 4,599 | 83.3 | 16.8 | 16.7 |
| mixed-100 | 4x | 6,690 | 7,295 | 5,853 | 7,139 | 1,434 | 194,001 | 525 MB | 4,500 of 4,599 | 333.3 | 33.4 | 33.3 |
| mixed-100-bare | 1x | 1,255 | 1,484 | 1,071 | 1,260 | 314 | 180,501 | 469 MB | none in file | 66.7 | 16.7 | 16.7 |
| mixed-100-bare | 4x | 4,971 | 5,578 | 4,195 | 5,428 | 1,303 | 180,501 | 469 MB | none in file | 333.3 | 33.3 | 16.8 |
| mixed-100-front | 1x | 683 | 827 | 601 | 620 | 163 | 71,301 | 264 MB | 0 of 4,599 | 16.8 | 16.8 | 16.7 |
| mixed-100-front | 4x | 2,789 | 3,069 | 2,449 | 2,875 | 565 | 71,301 | 229 MB | 0 of 4,599 | 133.3 | 16.7 | 16.7 |
| empty-100 | 1x | 15 | 123 | 212 | 223 | n/a | 84,164 | 105 MB | 0 | 16.8 | 16.7 | 16.7 |
| empty-100 | 4x | 1,348 | 1,408 | 848 | 1,201 | n/a | 84,164 | 94 MB | 0 | 116.7 | 16.7 | 16.7 |

The budgets #3297 proposes are a longest load task under 500 ms and zoom p95 under 34 ms, both at 4x. On current main, the only scenario here that meets both is pod-24, and it meets them only just (560 ms and 33.4 ms).

## What the baseline shows

Rack count is a poor predictor of cost. mixed-24 (1,370 ms longest task at 4x) is worse than pod-50 (1,034 ms) and close to pod-100's zoom cost, because it renders 576 devices against pod-50's 168. Any cap expressed purely in racks either blocks layouts that would run well or permits layouts that will not.

The rack frame, not the devices, dominates the node count of a sparse layout. 100 empty 42U racks mount 84,164 SVG elements: 391 per rack face, of which 252 are individual rail-hole rects (6 per U), 43 are grid lines, 42 are U-slot rects and 42 are U-number labels. That is 77% of pod-100's total node count before a single device is placed.

The second face roughly triples the cost of a device-dense layout: mixed-100 falls from 194,001 to 71,301 SVG nodes with `show_rear: false`, and its longest task at 4x falls from 5,853 ms to 2,449 ms. Connections that draw cost real time: mixed-100 against mixed-100-bare is 5,853 ms against 4,195 ms at 4x, and 13,500 extra SVG nodes for 4,500 drawn connections.

Pan and drag hold 60 fps at every size, as in #3287, because panzoom only moves a CSS transform. Zoom does not.

## Where zoom time actually goes

A CDP metrics breakdown across the 20-step wheel sequence at 4x, on current main:

| Scenario | SVG nodes | Visible rack faces | Script | Style | Layout | Total task |
| --- | --- | --- | --- | --- | --- | --- |
| pod-24 | 30,794 | 20 | 17 ms | 20 ms | 676 ms | 1,463 ms |
| empty-100 | 84,164 | 20 | 25 ms | 41 ms | 1,891 ms | 3,093 ms |
| pod-100 | 109,958 | 32 | 21 ms | 38 ms | 2,603 ms | 4,407 ms |

Zoom is a layout problem. Script time is negligible, which matches the code: panzoom writes a CSS matrix and no Svelte state depends on the scale. Layout runs over the whole document, not the 20 or so rack faces on screen, so off-screen racks cost on every zoom step.

Normalising by element type points at one culprit: SVG `<text>`. Layout time per rendered `<text>` element is about 0.25 ms per 20 zoom steps in all three scenarios, while other elements barely register. Removing only the U-number labels (8,400 `<text>` elements, prototype B below) cut empty-100's zoom layout from 1,891 ms to 267 ms and pod-100's from 2,603 ms to 616 ms, with every other element untouched. Chrome re-lays-out SVG text at each new scale, and that, not node count in general, is what makes zoom slow.

## Prototype experiments

Four throwaway builds, each measured against the same scenarios. The combined diff is in `docs/research/3293-prototypes.patch`. None of this is shippable as written: the label prototype hides labels unconditionally rather than below a zoom threshold, and the culling prototype uses estimated placeholder sizes.

- A, frame chrome as paths: the per-U rail-hole rects and grid lines in `RackFrame.svelte` collapse into one `<path>` each. Rack face nodes fall from 391 to 98. Screenshots at 3x device scale are pixel-identical to the baseline.
- B, label LOD: A plus U-number labels removed, standing in for hiding them below a zoom threshold.
- C, culling: an `IntersectionObserver` in `RackDualView.svelte` mounts a rack only when its placeholder enters the viewport plus a 400 px margin, and renders a correctly sized empty placeholder otherwise.
- D: A plus B plus C.

Results at 4x, medians of 3 runs, fixed 10 s observation window:

| Build | Scenario | Time to first device | Longest task | Zoom p95 | Zoom layout | Heap | Rack faces mounted |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | pod-100 | 2,506 ms | 2,083 ms | 166.7 ms | 2,088 ms | 176 MB | 200 |
| C (cull) | pod-100 | 610 ms | 450 ms | 16.8 ms | 119 ms | 80 MB | 16 |
| D (all) | pod-100 | 605 ms | 461 ms | 16.8 ms | 40 ms | 98 MB | 16 |
| baseline | mixed-100 | 6,107 ms | 5,317 ms | 333.3 ms | 3,861 ms | 471 MB | 200 |
| C (cull) | mixed-100 | 839 ms | 614 ms | 66.7 ms | 218 ms | 117 MB | 16 |
| D (all) | mixed-100 | 817 ms | 608 ms | 50.0 ms | 134 ms | 114 MB | 16 |

Without culling, on the standard harness at 4x:

| Build | Scenario | Load | Longest task | Zoom p95 | Select | SVG nodes |
| --- | --- | --- | --- | --- | --- | --- |
| baseline | pod-100 | 2,961 ms | 2,264 ms | 166.7 ms | 716 ms | 109,958 |
| A | pod-100 | 1,825 ms | 1,554 ms | 150.0 ms | n/a | 42,958 |
| B | pod-100 | 1,571 ms | 1,408 ms | 33.4 ms | 259 ms | 33,358 |
| baseline | mixed-100 | 6,690 ms | 5,853 ms | 333.3 ms | 1,434 ms | 194,001 |
| A | mixed-100 | 5,582 ms | 4,963 ms | 316.6 ms | n/a | 135,401 |
| B | mixed-100 | 5,233 ms | 4,593 ms | 216.7 ms | 971 ms | 127,001 |
| baseline | empty-100 | 1,348 ms | 848 ms | 116.7 ms | n/a | 84,164 |
| B | empty-100 | 421 ms | 295 ms | 16.7 ms | n/a | 17,164 |

Readings:

- Culling is the single biggest lever, and it is the only one that makes 100 racks feel like 16. It meets the zoom budget outright on pod-100 and brings the longest task to 450 ms, inside the 500 ms budget.
- Cheaper node counts help load but not zoom. Prototype A removes 61% of pod-100's SVG nodes and moves zoom p95 by 10%.
- Hiding text is what fixes zoom without culling. Prototype B hits the zoom budget at pod-100 (33.4 ms) with no culling at all. It matters because at fit-all every rack is on screen, so culling has nothing to cull, and a 100-rack fit-all needs a zoom floor near 0.03 where labels are illegible anyway.
- Stacking A and B on top of culling is nearly free but nearly pointless for load, because only 16 rack faces are mounted either way. It still halves zoom layout time and is what keeps a zoomed-out view cheap.
- `content-visibility: auto` on the row slots is a dead end. Chromium collapses skipped flex items to 0 px in the inline axis regardless of `contain-intrinsic-size` or an explicit width, because a `content-visibility: auto` element always tracks a last remembered size and the slot's was recorded before its children existed. The canvas content width fell from 12,696 px to 2,193 px and racks reflowed. Culling has to be done in the component, not by the browser.

## The remaining cost is the load pipeline, not rendering

With culling on, the longest task no longer tracks rack count or node count. It tracks file size:

| Scenario       | YAML     | Longest task at 4x (culling build) |
| -------------- | -------- | ---------------------------------- |
| pod-24         | 398 KB   | 178 ms                             |
| mixed-24       | 468 KB   | 268 ms                             |
| pod-50         | 752 KB   | 270 ms                             |
| pod-100        | 1,500 KB | 450 ms                             |
| mixed-100-bare | 1,643 KB | 517 ms                             |
| mixed-100      | 1,963 KB | 614 ms                             |

That is about 0.27 ms per KB of YAML at 4x, with a fixed cost of roughly 60 ms. Parse, schema validation and store hydration run in one task. Under that rule, the 500 ms budget corresponds to a file of about 1.6 MB, which a 100-rack DGX POD fits and a 100-rack device-dense hall does not. Hitting the budget at the top of the range needs the load pipeline to yield, not more rendering work.

## Browser storage at this size

Measured on current main, Chromium, default profile:

- Loading mixed-100 autosaves 1,573,823 characters into a single `Rackula:layout:<id>` localStorage key. A probe written immediately afterwards fits 3.52 million more characters before it throws, so the origin ceiling is about 5.09 million characters. Chrome counts 2 bytes per character against a 10,485,760 byte budget, which matches. One 100-rack layout takes roughly 30% of the budget, and three do not fit.
- With localStorage pre-filled to 4 MB, loading mixed-100 renders all 200 rack faces, the UI reports "Saved", and no `Rackula:layout:` key is written at all. After a reload the workspace still lists "Mixed 100 racks" as the active layout, the tab shows its name, and the canvas is empty: 0 racks, 0 devices, no error. The quota failure is silent and the layout is gone.
- `navigator.storage.estimate()` reports a 5 GB quota for the origin, which is the Storage API budget for IndexedDB and the Origin Private File System, not for localStorage. The localStorage ceiling is the binding one today.

An experiment suggested by the external research (`docs/research/3293-external.md`, section 2.1): Blink scales the font used to lay SVG text out by the screen transform, and that path short-circuits when `text-rendering` is `geometricPrecision`. Setting it on every SVG text element cut zoom layout at 4x from 2,603 ms to 1,826 ms on pod-100 and from 1,891 ms to 1,550 ms on empty-100, about 30%. That is real but far short of the 86% that not rendering the text achieves, and Gecko treats `geometricPrecision` as `optimizeLegibility`, so it could make Firefox worse. It is a small additive win, not a substitute for level of detail or culling.

## Reproducing

```bash
node docs/research/3293-scale-gen.mjs /tmp/scale
npm run build
npx vite preview --port 4173 &
BASE=http://localhost:4173/ THROTTLES=1,4 OUT=baseline.json \
  node docs/research/3287-scale-measure.mjs /tmp/scale 3 \
  pod-24 pod-50 pod-100 mixed-24 mixed-50 mixed-100 mixed-100-bare mixed-100-front empty-100
```

The prototype builds come from `git apply docs/research/3293-prototypes.patch` and a separate `vite build --outDir`. Prototype builds cull, so they need the fixed-window script described under Method rather than the device-count wait in `3287-scale-measure.mjs`.
