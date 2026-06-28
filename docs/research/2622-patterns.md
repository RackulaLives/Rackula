# Spike #2622: Patterns Analysis — Accurate Depth Model and Visualization

Source: synthesis of `2622-codebase.md` (current categorical model) and `2622-external.md` (NetBox / rackbuilder / standards research), 2026-06-26. This doc drives the schema-design decision and the issue decomposition for moving device depth from categorical half/full to accurate physical millimetres.

## Key Insights

**1. NetBox stops at categorical depth by deliberate design, and that choice does not bind Rackula.** NetBox models device depth as a single boolean `is_full_depth` and explicitly closed the per-device depth request (#14176) as "not planned." Its only depth number, rack `mounting_depth` (mm), is informational and never validated against any device. So the dominant DCIM has consciously decided depth magnitude is out of scope. Rackula should diverge for two grounded reasons:

- **The milestone headline case is inexpressible in NetBox's model.** "A device longer than the full depth of the rack" requires a device magnitude and a rack magnitude to compare. `is_full_depth` is a direction flag with no length, so it can never _exceed_ anything. The headline feature is structurally impossible without `depth_mm`.
- **Rackula already has the harder half of the model that rackbuilder lacks.** rackbuilder.io validates one device `depth_mm` against one rack `depth_mm` from a single front-anchored scalar; it cannot represent a rear-mounted device growing _frontward_ meeting a front-mounted device growing _rearward_. Rackula's `face` field already encodes mount direction, so `depth_mm` + `face` yields a genuine two-sided middle-collision that neither NetBox (no magnitude) nor rackbuilder (no rear anchor) can express. That two-sided collision is the differentiator.

**2. Face is already a mount datum; depth is additive, not a replacement (the load-bearing reframe).** The authoritative collision field is `PlacedDevice.face` ("front" | "rear" | "both"); `is_full_depth` only sets the _default_ face. `face` therefore already tells us _where a device is anchored and which way it grows_: front devices grow rearward from the front rail, rear devices grow frontward from the rear rail, "both" spans. A naive port of rackbuilder would add a redundant "mounting offset" field. Rackula does not need one — it adds a scalar `depth_mm` (a length) on top of the direction it already stores. Every depth computation reads `face` for direction and `depth_mm` for magnitude. The categorical model is the magnitude-unknown degenerate case of the mm model, which is why migration is safe.

**3. Unit asymmetry (depth continuous, width enum-inches) is principled, not sloppy.** `depth_mm` is the first continuous physical measurement in a model where width is an enum (`10 | 19 | 21 | 23`). This asymmetry is correct and should be kept deliberately: EIA-310-D / IEC 60297 standardize rack _width_, the rack unit, and hole spacing, but explicitly **not depth** (verified, external doc Section 3). Width is genuinely a four-value enum because only those flange widths exist; depth is genuinely a free scalar because it is vendor-defined and rail-adjustable with no canonical value per rack class. Store width as an enum, depth as `mm`. Do not "fix" the asymmetry by making either match the other.

**4. Categorical -> mm is lossy on magnitude but lossless on direction.** You cannot reconstruct 678 mm from "full," but `face` survives intact. This single fact dictates the migration policy (Fork A): synthesize nothing for user data, because any synthesized magnitude risks flipping a previously-valid saved layout into a false "exceeds depth" warning, and prior-release load is a tested first-class invariant.

## Data model design

### Device type (`DeviceTypeSchema`, `schemas/index.ts:472`)

```ts
depth_mm: z.number().positive().optional(); // chassis in-rack projection, measured from the mount rail plane rearward
```

- Optional. `undefined` = depth unknown (the migrated / un-authored state). Keep `is_full_depth` as-is; it continues to set the default `face`. `depth_mm` and `is_full_depth` are orthogonal: direction vs magnitude.
- **Front-overhang field: not needed in v1.** Bezels, handles, and front-projecting trim sit _in front of_ the front rail and never contend for rail-to-rail space, so they cannot cause the collisions this spike targets. Define `depth_mm` as the dimension that consumes mounting depth (rail plane rearward), seeded from chassis depth without bezel (external doc gives both figures for the R740: use 678.8, not 715.5). A `front_overhang_mm` can be added later for door-clearance polish; it is YAGNI for the headline case. Do not add it now.

### Rack (`schemas/index.ts:645`)

```ts
mounting_depth_mm: z.number().positive().optional(); // usable rail-to-rail depth — the collision datum
outer_depth_mm: z.number().positive().optional(); // outer cabinet depth — visual/cabinet-shell only, never used for collision
mount_type: z.enum(["4-post", "2-post", "open-frame", "wall"]).optional(); // keys hard vs advisory enforcement
```

- **`mounting_depth_mm` is the single authoritative depth datum**, mapped 1:1 to NetBox `mounting_depth`: "Maximum depth of a mounted device... for four-post racks, the distance between the front and rear rails." This is what `depth_mm` is checked against.
- **`outer_depth_mm` maps to NetBox `outer_depth`** and is informational only — it draws the cabinet shell around the rails in the depth view. Never derive `mounting_depth_mm` from it automatically (door/PDU/clearance delta is 100-250 mm and install-specific, external doc Section 3); if only outer is known, prompt for mounting depth rather than computing it.
- Deliberately do **not** replicate NetBox's `outer_unit` dual mm/in storage — that inconsistency is the subject of NetBox's own open bugs #20942/#21178. One canonical unit (mm), optional display-only conversion (Fork B).

### How depth composes with `face`

Define occupancy as an interval along the depth axis, origin at the front rail, `usable = rack.mounting_depth_mm`:

| `face` | front_extent (from front rail) | rear_extent (from rear rail) | interval |
| --- | --- | --- | --- |
| `front` | `depth_mm` | 0 | `[0, depth_mm]` |
| `rear` | 0 | `depth_mm` | `[usable - depth_mm, usable]` |
| `both` | `usable` | `usable` | `[0, usable]` (full span; `depth_mm` informational + drives exceeds-depth badge) |

`face=both` keeps its current "blocks everything" semantics by occupying the whole span regardless of `depth_mm`. This is what makes the mm model a strict superset of today's categorical model: existing full-depth devices stay full-span blockers, existing half-depth front/rear devices stay non-colliding _until_ a real magnitude says otherwise.

### Composition through carriers

Carrier-first mounting is preserved: collision is computed only on **rail-mounted entities** (full-width integer-U devices and carriers). A carrier carries its own `depth_mm` (tray depth) and is the entity checked against `mounting_depth_mm`. A child device's `depth_mm` is checked only against its _carrier's_ depth (does it fit the tray — a soft, local check), never directly against the rack. This keeps rail positions whole-U integers and means the rack-level middle-collision logic never has to reason about sub-U children.

## The three forks

### Fork A — migration default-magnitude policy

| Option | Mechanism | Tradeoff |
| --- | --- | --- |
| A1. Per-category default table | Map each device to "Typical" mm (external doc figures table) by inferred category | Realistic seeds, but requires classification and **risks false warnings**: a synthesized 700 mm "typical server" placed in a previously-valid shallow rack would newly fail the exceeds-depth check on data the user never entered. Violates the tested upgrade invariant. |
| A2. Conservative single value = `usable` | Synthesize `depth_mm = rack.mounting_depth_mm` so nothing newly fails | Guarantees no overflow, but is a lie about magnitude that pollutes the signature view and the middle-collision math (every device looks full-depth). |
| A3. Null / unset, fit-check suppressed | Migrate `depth_mm` as `undefined`; suppress exceeds-depth and middle-collision whenever magnitude is unknown | Zero false warnings by construction (you cannot fail a check that does not run); direction preserved via `face`, so categorical collision is byte-identical to today. No magnitude delivered for legacy data until the user fills it. |

**Recommendation: A3 (null on migration), plus seed magnitudes only where it is authoring, not migrating.**

- **User data**: migrate to `depth_mm: undefined`. Synthesize nothing. This is the only option that satisfies the tested prior-release-load invariant — a previously-valid layout must load with zero new warnings, and the upgrade corpus will assert exactly that.
- **Starter library** (`starterLibrary.ts`): author real `depth_mm` values from external doc Section 2 (e.g. `1u-server` ~700, `1u-switch` ~280, `1u-fiber-patch-panel` ~45, PDUs as side-channel). This is new authored data, not migrated user data, so realistic values are safe and desirable.
- **Per-category table**: use it as authoring guidance and behind an explicit, non-destructive "estimate depths" affordance that fills _only_ nulls on user request — never auto-applied. The user opts into the guess.

### Fork B — rack depth datum + unit policy

| Datum option | Maps to | Use |
| --- | --- | --- |
| B1. `mounting_depth_mm` (rail-to-rail usable) | NetBox `mounting_depth` | The collision constraint. Authoritative. |
| B2. `outer_depth_mm` (outer cabinet) | NetBox `outer_depth` | Visual cabinet shell only. Needs an install-specific clearance subtraction to become usable, so not directly checkable. |
| B3. Both, derive mounting from outer | — | Convenient but the delta is 100-250 mm and install-specific; auto-derivation manufactures fake precision. |

**Recommendation: B1 as the authoritative collision datum, B2 optional for visualization, never B3's auto-derivation.** `mounting_depth_mm` is what `depth_mm` is compared against, matching NetBox semantics exactly. `outer_depth_mm` is optional decoration for the depth view.

**Unit policy:**

- **mm canonical for every depth field** (device and rack). Single stored unit.
- **Width stays enum-inches** (`10 | 19 | 21 | 23`) — principled per Key Insight 3 (width is standardized, depth is not).
- **Imperial: display-only, never stored.** Offer an optional read-only mm->inch render in the inspector/ruler; do not store inches and do not add a per-field unit selector. This sidesteps NetBox's own dual-unit bug class.

**Recommended `mounting_depth_mm` presets** (from external doc cabinet ladder, Section 3):

| Preset                  | mounting_depth_mm |
| ----------------------- | ----------------- |
| Mini-rack (10")         | 200               |
| Wall / shallow          | 300               |
| Comms / half-depth      | 450               |
| Standard server cabinet | 800               |
| Deep server cabinet     | 1000              |
| Open frame (4-post)     | 1016              |
| Custom                  | numeric entry     |

### Fork C — signature visualization

**Candidate 1 — front-elevation at-a-glance cue (extend `blocked-slots.ts:34` hatching).** Always-on, lives in the existing front view; reuses the established opposite-face hatch vocabulary, adds an exceeds-depth badge. Shows occupancy/overflow, not magnitude.

```
Front face            Rear face
+------------------+  +------------------+
| 1U server        |  |//////////////////|   // hatch = rear blocked by front depth
| deep UPS    [!]  |  |//////////////////|   [!] = exceeds rack depth
+------------------+  +------------------+
```

**Candidate 2 — side depth-profile ruler (rackbuilder precedent).** A side view with a depth axis; each device is a horizontal bar from its rail. Shows magnitude vs rack depth well, but is front-anchored single-sided — it is exactly rackbuilder's model and cannot show front+rear meeting.

```
        0mm    300    600    900   (mounting_depth = 800)
        |------|------|------|----:----
U10 srv [#####################]        678  ok
U9  ups [##############################]>   900  EXCEEDS
U8  pdu [##] 44  ok
        front rail               rear rail
```

**Candidate 3 — top-down per-U plan section.** For a U (or scrollable per-U strip), a horizontal cross-section: front device grows from the top edge, rear device grows from the bottom edge, with the remaining centre gap (or overlap) drawn between them.

```
U10  front |==front 600==>          <==rear 350==| rear
            [ server         ] gap  [   switch   ]
            |<-------- usable 800mm -------->|

U7   front |==front 500==>===rear 400===| rear
            [ shelf       ][!OVERLAP 100!][ ups ]   // two-sided middle collision
```

**Recommendation: signature view = Candidate 3 (top-down per-U plan section); always-on cue = Candidate 1.**

- Candidate 3 is the **only** view that renders Rackula's differentiator — two devices growing toward the centre and the remaining centre gap/overlap. It is the visual proof of the two-sided collision that NetBox and rackbuilder cannot express. The depth axis from Candidate 2 (the ruler) is absorbed into Candidate 3's horizontal scale, so the side-profile's one virtue is kept without a second view.
- Candidate 1 is the always-on cue because it costs almost nothing (extends existing hatching) and surfaces the depth signal in the default front elevation without making the user open the signature view.
- Constraints: dark "coffin" tokens for the new section; respect reduced-motion (no animated growth/scrub on the depth axis); visible focus on the per-U selector; the overlap band and `[!]` badge must not rely on colour alone (use hatch + label, consistent with existing accessibility floor).

## Collision and validation rule

Extend `collision.ts:95` (`doFacesCollide`). Current behaviour: `both` collides with everything; same face collides; opposite faces (front/rear) never collide. Keep all three; refine only the opposite-face branch and add a per-device exceeds check.

**Middle-collision (pairwise, same U-span, opposite faces):** let `usable = rack.mounting_depth_mm`, `d_front` / `d_rear` the two devices' `depth_mm`.

```
if (usable == null || d_front == null || d_rear == null)
    -> fall back to current behaviour: opposite faces DO NOT collide, NO new warning
else
    -> collide  iff  d_front + d_rear > usable        // they meet/overlap in the middle
```

**Exceeds-depth (single device, independent of any pair):**

```
if (device.depth_mm != null && rack.mounting_depth_mm != null && device.depth_mm > rack.mounting_depth_mm)
    -> "exceeds depth" warning on that device     // the milestone headline case
```

`face=both` is treated as full-span `[0, usable]` and keeps its current "collides with everything" semantics unchanged.

**Unknown-depth behaviour:** any time `mounting_depth_mm` or a participating `depth_mm` is unknown, the system **falls back to today's categorical face collision and raises no depth warning**. This is the gate that makes Fork A (null migration) safe: legacy layouts run the exact old logic.

**Hard block vs soft warning, keyed by mounting type** (external doc Section 5; NetBox `mounting_depth` is rail-to-rail "for four-post racks"):

| `mount_type` | Depth semantics | Enforcement |
| --- | --- | --- |
| `4-post`, `open-frame` | Real rail-to-rail constraint | Hard (blocking severity) once `mount_type` and both magnitudes are known |
| `wall` | Tight, wall behind | Hard, small depth |
| `2-post` | Cantilever, no rear rail; depth limited by tipping, not the rack | Advisory (soft) only, never blocks |
| unset | Unknown | Advisory (soft) |

**Shipping recommendation:** default everything to **advisory (soft, non-blocking)** in the first release, even on 4-post, and escalate to hard-block only once `mount_type` is an explicit, user-set field. Rationale: a prior layout that newly overflows after the user enters real depths must still be loadable and editable; a hard block on legacy-derived data would regress the backward-compat invariant. Hard enforcement is a later, opt-in refinement keyed by `mount_type`.

## Recommended phased plan

The milestone's headline case ("a device longer than the full depth of the rack") is delivered in **Phase 2**, before any new view. The signature visualization (Phase 3) is the leapfrog, not the headline.

### Phase 1 — Data foundation (schema + migration + corpus)

- Add `depth_mm?` to `DeviceTypeSchema`; add `mounting_depth_mm?`, `outer_depth_mm?`, `mount_type?` to the rack schema (Zod 4).
- Migration: existing device types and saved layouts -> `depth_mm` stays `undefined`; `face` untouched. Synthesize no magnitude (Fork A3).
- Upgrade-corpus fixture (`src/tests/fixtures/upgrade-corpus/`): a prior-release layout with half/full devices that loads clean, depths unknown, **zero new warnings** — the regression guard for the whole spike.
- Seed `starterLibrary.ts` device types with real `depth_mm` from external doc Section 2.
- Plumb rack-depth presets (Fork B table) into the schema/defaults. No UI warnings yet.
- Dependencies: none. Gates Phases 2 and 3.

### Phase 2 — Headline value (inspector field + front cue + exceeds-depth warning)

- Inspector: editable device `depth_mm`; editable rack `mounting_depth_mm` with presets + optional display-only inch readout.
- Front-elevation always-on cue (Candidate 1): extend `blocked-slots.ts` hatching + `[!]` exceeds-depth badge.
- Exceeds-depth validation: single device `depth_mm > mounting_depth_mm` -> advisory warning. **This is the milestone headline case.**
- Severity advisory/soft; suppressed whenever a magnitude is unknown.
- Dependencies: Phase 1. **Delivers the milestone headline with no new view.**

### Phase 3 — Leapfrog (mm middle-collision + signature view)

- `collision.ts`: implement the two-sided middle-collision rule (`d_front + d_rear > usable`) — the differentiator competitors cannot express.
- Signature top-down per-U depth-profile view (Candidate 3): front/rear growth toward centre, centre gap/overlap band, coffin tokens, reduced-motion, visible focus.
- `mount_type` -> hard/advisory enforcement keying (Section 4); opt-in hard-block for 4-post/open-frame/wall.
- Dependencies: Phase 2 (depth fields populated and the warning vocabulary established).

### Issue-decomposition notes

- Keep the schema additions (Phase 1) as one slice so migration + corpus fixture land together; never merge a schema change without its upgrade-corpus fixture.
- Phase 2's three pieces (inspector field, front cue, exceeds warning) can be parallel children once Phase 1 lands.
- Phase 3's collision rule and signature view are separable: the mm collision can ship and be asserted via unit tests on `collision.ts` before the view exists; the view is the visual layer on top.
