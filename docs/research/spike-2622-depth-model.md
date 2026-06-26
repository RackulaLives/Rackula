# Spike #2622: Accurate Depth Model and Visualization

Date: 2026-06-26. Milestone: M021. Parent epic: none (milestone-level spike).
Status: research complete; three forks settled by maintainer 2026-06-26 (null-on-migration, usable rail-to-rail mm, top-down per-U signature view); ready for issue decomposition.

Detail docs: [`2622-codebase.md`](2622-codebase.md) (current model), [`2622-external.md`](2622-external.md) (NetBox / standards / device data), [`2622-patterns.md`](2622-patterns.md) (options and recommendations).

---

## Executive Summary

M021 moves device depth from categorical (half/full) to accurate millimetres, so Rackula can answer the four questions a user makes with real gear in hand: does this device fit this cabinet, will cabling fit behind it, do front- and rear-mounted devices collide in the middle, and can the door close. The milestone's headline case is "a device longer than the full depth of the rack."

The research produced one load-bearing reframe and one premise challenge that together make the work smaller and sharper than a naive port of the competitor:

1. Reframe: Rackula's `PlacedDevice.face` ("front" | "rear" | "both") is already a mount datum. Front devices grow rearward from the front rail, rear devices grow frontward from the rear rail, "both" spans. So depth is an additive scalar (`depth_mm`) on top of a direction the model already stores, not a new positioning subsystem. The categorical model is the magnitude-unknown degenerate case of the mm model, which is what makes migration safe.

2. Premise challenge (NetBox): NetBox, the dominant DCIM, deliberately models device depth as a boolean only and closed the per-device-depth request as "not planned." Its single depth number (rack `mounting_depth`, mm) is informational and never validated. So adding device mm depth must be justified, not assumed. It is justified, on two grounds: the headline case is structurally inexpressible with a boolean (a direction flag has no length to exceed anything), and Rackula's `face` lets `depth_mm` produce a genuine two-sided middle-collision that neither NetBox (no magnitude) nor rackbuilder.io (single front-anchored scalar) can express. That two-sided collision is the differentiator.

Recommended sequencing delivers the milestone headline in Phase 2, before any new view. The signature depth visualization is Phase 3: the leapfrog, not the headline.

## Why millimetres despite NetBox

| Tool | Device depth | Rack depth | Validates fit? | Two-sided (front+rear) collision? |
| --- | --- | --- | --- | --- |
| NetBox | `is_full_depth` boolean only | `mounting_depth` mm (informational) | No | No (no magnitude) |
| rackbuilder.io | `depth_mm` (single, front-anchored) | `depth_mm` (single) | Yes (exceeds-depth) | No (no rear anchor) |
| Rackula (proposed) | `depth_mm` + existing `face` direction | `mounting_depth_mm` | Yes | Yes (the differentiator) |

EIA-310-D / IEC 60297 standardize rack width, the rack unit, and hole spacing, but explicitly not depth. Depth is vendor-defined and rail-adjustable. So rack depth must be a free numeric field with presets, and the unit asymmetry (depth continuous mm, width a `10|19|21|23` enum) is principled, not sloppy.

## Proposed data model

Device type (`DeviceTypeSchema`, `schemas/index.ts:472`):

```ts
depth_mm: z.number().positive().optional()   // in-rack projection from the mount rail plane rearward
```

`depth_mm` (magnitude) and `is_full_depth` (default-face direction) are orthogonal and both kept. No `front_overhang_mm` in v1 (bezels and handles sit in front of the rail and never contend for rail-to-rail space; YAGNI for the headline case).

Rack (`schemas/index.ts:645`):

```ts
mounting_depth_mm: z.number().positive().optional()  // usable rail-to-rail; the collision datum (NetBox mounting_depth)
outer_depth_mm:    z.number().positive().optional()  // outer cabinet shell; visual only, never collision (NetBox outer_depth)
mount_type:        z.enum(["4-post","2-post","open-frame","wall"]).optional()  // keys hard vs advisory enforcement
```

Occupancy as a depth interval, origin at the front rail, `usable = mounting_depth_mm`:

| `face` | interval |
| --- | --- |
| `front` | `[0, depth_mm]` |
| `rear` | `[usable - depth_mm, usable]` |
| `both` | `[0, usable]` (full span; keeps current "blocks everything" semantics) |

Carrier-first is preserved: rack-level collision runs only on rail-mounted entities (full-width integer-U devices and carriers). A carrier carries its own `depth_mm`; a child's depth is checked against its carrier (does it fit the tray), never directly against the rack. Rail positions stay whole-U integers.

## The three forks (recommendations; pending sign-off)

### Fork A: migration default-magnitude policy

Recommendation: null on migration. Existing device types and saved layouts migrate to `depth_mm: undefined`; the fit-check and middle-collision are suppressed whenever a magnitude is unknown, so a previously-valid layout loads with zero new warnings (the tested prior-release-load invariant). Seed real `depth_mm` only in the starter library (authoring, not migrating). Offer a non-destructive, opt-in "estimate depths" affordance that fills only nulls on request, using the per-category table; never auto-applied.

Rejected: per-category auto-fill (risks flipping valid layouts into false warnings) and conservative `= usable` (lies about magnitude, pollutes the view and the collision math).

### Fork B: rack depth datum + unit policy

Recommendation: `mounting_depth_mm` (usable rail-to-rail) is the sole authoritative collision datum, matching NetBox semantics; `outer_depth_mm` is optional and visual-only; never auto-derive usable from outer (the delta is 100-250 mm and install-specific). mm canonical for all depth; width stays the inches enum; imperial is display-only, never stored (sidesteps NetBox's own dual-unit bug class). Presets: 200 (mini-rack 10"), 300 (wall/shallow), 450 (comms/half-depth), 800 (standard server), 1000 (deep server), 1016 (open frame), plus custom.

### Fork C: signature visualization

Recommendation: signature view is a top-down per-U plan section (front device grows from one edge, rear from the other, with the centre gap or overlap drawn between them) because it is the only view that renders the two-sided collision. The always-on cue is the front-elevation hatch (extending `blocked-slots.ts:34`) plus an exceeds-depth `[!]` badge, so the depth signal shows in the default front view without opening anything. The side-profile ruler (rackbuilder's model) is single-sided and is absorbed into the top-down view's horizontal scale, so it is not built separately. New section uses coffin tokens, respects reduced-motion, keeps visible focus, and never encodes overflow by colour alone.

## Collision and validation rule

Extend `collision.ts:95` (`doFacesCollide`). Keep all current behaviour (`both` collides with everything; same face collides); refine only the opposite-face branch and add a per-device exceeds-check. `usable = rack.mounting_depth_mm`:

```
middle-collision (opposite faces, same U-span):
  if (usable == null || d_front == null || d_rear == null)  -> no collision, no warning (categorical fallback)
  else                                                      -> collide iff d_front + d_rear > usable

exceeds-depth (single device):
  if (depth_mm != null && usable != null && depth_mm > usable) -> "exceeds depth" warning   // headline case
```

Unknown-depth always falls back to today's categorical face collision with no new warning. This is the gate that makes null migration (Fork A) safe. Severity defaults to advisory/soft for the first release even on 4-post, escalating to hard-block only once `mount_type` is an explicit user-set field (a hard block on legacy-derived data would regress backward compatibility). Enforcement keying: 4-post / open-frame / wall = hard once known; 2-post = advisory only (cantilever, depth limited by tipping not the rack); unset = advisory.

## Recommended phased plan

Phase 1, data foundation: add the schema fields (Zod 4); migrate `depth_mm` to `undefined` with `face` untouched; add an upgrade-corpus fixture (a prior-release half/full layout that loads clean with zero new warnings, the regression guard for the whole spike); seed `starterLibrary.ts` with real depths; plumb the rack-depth presets. No UI warnings yet. Gates Phases 2 and 3.

Phase 2, headline value: inspector fields for device `depth_mm` and rack `mounting_depth_mm` (with presets and optional inch readout); the always-on front cue; the exceeds-depth advisory warning. Delivers the milestone headline case with no new view.

Phase 3, leapfrog: the two-sided middle-collision in `collision.ts` (unit-testable before any UI); the signature top-down per-U depth view; `mount_type`-keyed hard/advisory enforcement. The collision rule and the view are separable slices.

Decomposition notes: keep the schema additions plus migration plus corpus fixture as one slice (never merge a schema change without its fixture); Phase 2's three pieces are parallelisable once Phase 1 lands; Phase 3's collision rule ships and is asserted independently of the view.

## Decisions (settled 2026-06-26)

- Fork A: null on migration. Existing data migrates to `depth_mm: undefined`; seed magnitudes only in the starter library; opt-in non-destructive "estimate depths" fills nulls on request.
- Fork B: `mounting_depth_mm` (usable rail-to-rail) is the sole collision datum; `outer_depth_mm` optional/visual; mm canonical, width stays the inches enum, imperial display-only; presets 200/300/450/800/1000/1016 + custom.
- Fork C: signature view is the top-down per-U plan section; the always-on cue is the extended front-elevation hatch plus an exceeds-depth `[!]` badge.

Issue decomposition below follows from these.
