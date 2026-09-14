# Spike #3287: scale check

Question from the issue: build a one-SU layout (32 DGX plus fabric and management racks), then record load time and pan/zoom responsiveness.

## Method

- App: production build (`npm run build`, then `vite preview`) of main at 466c49a1 (v26.8.0).
- Browser: Playwright 1.63.0 driving Chromium headless shell 151.0.7922.34 at a 1600 x 1000 viewport.
- Machine: Apple M4, 10 cores, 24 GB. Other jobs shared the machine, so treat the numbers as indicative, not as a benchmark.
- CPU: each scenario ran at 1x and at 4x CPU throttling (CDP `Emulation.setCPUThrottlingRate`). 4x approximates a mid-range laptop. Each cell is the median of 3 runs in a fresh browser context with empty storage.
- Load path: File Open (`[data-testid="file-input-load"]`). It is the only path that keeps ports and connections (see `3287-codebase.md` section 11). Starter templates go through the same `parseLayoutYaml` plus a fetch, so their parse and render cost is the same.
- Load: time from `setInputFiles` until the DOM holds at least one `rack-device` per placed device. Settle: time until that count stays unchanged for 1 s.
- Main-thread cost:
  - CDP `Performance.getMetrics` TaskDuration delta across the load window.
  - Long tasks from a `longtask` PerformanceObserver.
  - TBT, the sum of (long task minus 50 ms).
- Select: time from clicking a visible device until `.selected` appears.
- Zoom: 20 wheel events at the canvas centre (10 in, 10 out), 50 ms apart.
- Pan: 20 Shift+wheel events, the app's horizontal pan.
- Drag: a 40-step drag on the canvas background.
- Frame timing:
  - Frame intervals were sampled with `requestAnimationFrame` during each interaction.
  - Headless shell rAF is not locked to vsync (idle runs near 240 fps), so absolute fps means little.
  - A p95 interval near 16.7 ms means the frame budget held. Frames over 50 ms count as visible jank.
- Scripts:
  - `docs/research/3287-scale-gen.mjs` generates the layouts.
  - `docs/research/3287-scale-measure.mjs` measures them.

## Scenarios

| Scenario | Racks | Row groups | Devices | Ports | Connections | YAML |
| --- | --- | --- | --- | --- | --- | --- |
| basepod-4: BasePOD 4-node, 2 DGX per rack | 4 | 3 | 21 | 555 | 91 | 94 KB |
| basepod-8: BasePOD 8-node, 2 DGX per rack | 6 | 3 | 27 | 713 | 145 | 118 KB |
| su1-bare: 1 SU, 4 DGX per rack, no connections | 12 | 4 | 71 | 2,133 | 0 | 292 KB |
| su1: 1 SU, 4 DGX per rack | 12 | 4 | 71 | 2,133 | 741 | 343 KB |
| su1-2pr: 1 SU, 2 DGX per rack | 20 | 4 | 79 | 2,557 | 749 | 397 KB |
| su4: 4 SU (128 DGX), 4 DGX per rack | 39 | 7 | 249 | 7,667 | 2,887 | 1.2 MB |
| su4-2pr: 4 SU (128 DGX), 2 DGX per rack | 71 | 7 | 282 | 9,428 | 2,920 | 1.4 MB |

Model:

- Racks are 48U, 19-inch, 1200 mm deep cabinets. Every rack has an SN2201 out-of-band switch at U48, with each device's BMC or mgmt port wired to it.
- Devices and their ports:
  - DGX B200: 10U, 8 NDR compute ports, 4 BlueField-3 ports and a BMC.
  - QM9700: 64 NDR ports.
  - SN4600C: 64 QSFP28 ports.
  - SN2201: 48 RJ45 and 4 QSFP28 ports.
- Management racks hold 5 control-plane nodes, 2 UFM hosts, the in-band and storage Ethernet switches, and an OOB core. Storage appliances are 2U.
- SuperPOD fabric: rail-optimised, with 8 leaves per SU and 4 spines per SU. Each leaf has 32 uplinks.
- BasePOD fabric: 2 QM9700s, with DGX compute ports alternating between them.
- Interface types are stand-ins, because the enum has no OSFP, QSFP112 or InfiniBand values: `400gbase-x-qsfpdd` for NDR and `200gbase-x-qsfp56` for QSFP112.
- Each NDR port is one connection, so 8 per DGX. A Rackula connection joins exactly one port to one port, so a twin-port OSFP splitter cable cannot be drawn as a single run.
- Rack density:
  - su1, su1-bare and su4 put 4 DGX B200 in a rack (57.2 kW). The SuperPOD B200 RA reserves that density for specialised sites.
  - The RA's standard is 2 per rack (28.6 kW), which gives 16 compute racks per SU with no switches in them. The 4 SU reference build has 69 racks (`3287-external.md` section 3).
  - su1-2pr is therefore the RA-faithful one-SU case, and su4-2pr (below) approximates the 4 SU reference build.
- Everything outside the compute racks is synthetic: one leaf rack per SU, plus pooled spine, management and storage racks. Real elevations are in `3287-spike.md` section 3.

## Results

- Values are medians of 3 runs, with times in ms.
- Longest task and TBT cover the load window only.
- Select is the time from click to highlight.
- Frame columns give the p95 frame interval during each interaction, with the worst frame in brackets. 16.7 ms is 60 fps.

| Scenario | CPU | Load | Settle | Longest task | TBT | Select | SVG nodes | JS heap | Connections drawn | Zoom p95 (max) | Shift-pan p95 (max) | Drag p95 (max) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| basepod-4 | 1x | 56 | 108 | 0 | 0 | 57 | 10,036 | 67 MB | 0 of 91 | 17.4 (17.6) | 17.3 (17.7) | 16.7 (17.6) |
| basepod-4 | 4x | 218 | 293 | 151 | 115 | 113 | 10,036 | 67 MB | 0 of 91 | 17.6 (17.7) | 17.5 (17.7) | 17.4 (17.7) |
| basepod-8 | 1x | 68 | 114 | 0 | 0 | 50 | 12,096 | 73 MB | 0 of 145 | 17.2 (17.5) | 17.0 (17.6) | 16.7 (17.6) |
| basepod-8 | 4x | 302 | 357 | 178 | 156 | 138 | 12,096 | 72 MB | 0 of 145 | 17.5 (17.7) | 17.4 (17.7) | 17.4 (17.7) |
| su1-bare | 1x | 111 | 165 | 85 | 35 | 67 | 19,470 | 70 MB | none in file | 17.1 (17.7) | 17.4 (17.7) | 16.7 (17.4) |
| su1-bare | 4x | 451 | 568 | 345 | 371 | 174 | 19,470 | 70 MB | none in file | 32.9 (33.9) | 17.4 (17.7) | 17.3 (17.7) |
| su1 | 1x | 125 | 186 | 95 | 45 | 69 | 19,470 | 72 MB | 0 of 741 | 17.4 (17.6) | 17.4 (17.7) | 16.7 (17.6) |
| su1 | 4x | 487 | 597 | 374 | 397 | 179 | 19,470 | 72 MB | 0 of 741 | 17.6 (34.0) | 17.5 (17.6) | 17.4 (17.7) |
| su1-2pr | 1x | 150 | 228 | 119 | 69 | 75 | 26,702 | 79 MB | 0 of 749 | 17.4 (17.7) | 17.3 (17.7) | 16.7 (17.6) |
| su1-2pr | 4x | 616 | 754 | 488 | 544 | 216 | 26,702 | 78 MB | 0 of 749 | 34.2 (34.3) | 17.5 (17.7) | 17.2 (17.7) |
| su4 | 1x | 354 | 466 | 302 | 275 | 109 | 51,684 | 145 MB | 0 of 2,887 | 16.9 (17.5) | 17.2 (33.3) | 16.7 (17.6) |
| su4 | 4x | 1,378 | 1,613 | 1,174 | 1,370 | 355 | 51,684 | 143 MB | 0 of 2,887 | 67.7 (84.1) | 17.5 (17.7) | 17.4 (17.7) |
| su4-2pr | 1x | 529 | 677 | 434 | 470 | 141 | 80,642 | 159 MB | 0 of 2,920 | 17.2 (33.4) | 17.2 (17.7) | 16.7 (17.6) |
| su4-2pr | 4x | 2,238 | 2,359 | 1,719 | 2,172 | 529 | 80,642 | 158 MB | 0 of 2,920 | 117.0 (133.3) | 17.5 (17.7) | 17.4 (17.7) |

No run recorded a page error. At 4x, 18 zoom frames took longer than 50 ms in both su4 and su4-2pr. No other cell had any.

## Findings

- Loading:
  - Every layout loaded through File Open with "Layout loaded successfully" and autosaved to browser storage, including the 12-, 20-, 39- and 71-rack files.
  - `MAX_RACKS = 10` gates only the add paths, not load (`3287-codebase.md` section 5).
- One SU is usable today.
  - At RA density (su1-2pr, 20 racks) it loads in 150 ms and settles by 230 ms at 1x. Pan, drag and zoom hold 60 fps.
  - At 4x, load takes about 0.6 s with a 488 ms long task, selection takes about 220 ms, and zoom falls to about 30 fps.
  - The denser 12-rack variants are a little faster: 125 ms at 1x and 0.5 s at 4x.
- Pan is cheap at every size. Panzoom only moves a CSS transform, so Shift-pan and background drag hold about 17 ms frames even for 4 SU at 4x.
- Load and zoom cost track SVG node count: 10,036 for 4 racks, 19,470 for 12, 26,702 for 20, 51,684 for 39 and 80,642 for 71.
  - At 4x, zoom slows to 30 fps from about 20,000 SVG nodes. It drops to about 15 fps at 51,684 (p95 68 ms) and about 8 fps at 80,642 (p95 117 ms).
  - Zoom was not profiled. Pan, which only translates, stays smooth, so re-rasterising the SVG at each scale step is the likely cost.
- 4 SU is where performance work is needed.
  - At RA density (su4-2pr: 71 racks, against 69 in the reference build), load takes 0.5 s at 1x and 2.2 s at 4x.
  - At 4x that includes a 1.7 s main-thread freeze. Zoom runs at about 8 fps, and selection takes more than 0.5 s.
  - The heap is 159 MB.
- Connections:
  - No connection rendered in any scenario, from 0 of 91 up to 0 of 2,887.
  - Every fabric link either ends on a switch with more than 24 ports, which puts it in grouped mode with no port anchors, or crosses racks. A pre-wired POD therefore shows no cabling at all.
  - The connection data adds about 15 ms at 1x and 35 ms at 4x to load (su1 against su1-bare), and it survives in the file.
  - Its render cost is untested, because nothing draws.
- Framing:
  - Fit-all lands at 45% for basepod-4, 31% for basepod-8, and at the 25% floor for every SU layout.
  - At 1600 px wide, one SU does not fit: the row is cut off after SU1 R5. Screenshots were taken during the runs but are not committed.
- Selection takes 50 to 75 ms at 1x up to one SU. At 4x it passes 100 ms from basepod-4 upward and reaches 355 ms at 4 SU.

## Flags before shipping

1. Pre-wired fabric renders nothing. Connections need dense-port anchors (#356) and cross-rack drawing (#272) first. Re-run this check once they draw.
   - `ConnectionLayer` iterates the full connection list for each rack face. For su4 that is 39 racks x 2 faces x 2,887, about 225,000 iterations per recompute.
2. The 25% zoom floor cannot frame one SU. Lower `minZoom` or add zoom-to-group before shipping any SU layout.
3. Don't ship a 4 SU template until off-screen racks are culled or virtualised; there is none today (`3287-codebase.md` section 11). BasePOD and 1 SU templates are fine without it.
4. Starter fetch cost: one SU is 292 to 397 KB of YAML (397 KB at RA density), and every starter is fetched on the first open of the "+" menu. A POD starter needs lazy per-template fetch first.
