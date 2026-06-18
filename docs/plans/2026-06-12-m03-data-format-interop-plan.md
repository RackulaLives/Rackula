# M03 -- Data Format & Interop Execution Plan

> For agentic workers: execute one task per session via /dev-issue <number>. The GitHub issue body is the source of truth (each carries an Alignment audit 2026-06-12 section with binding ACs). Do not start a task whose listed blockers are open. Follow repo TDD policy (CLAUDE.md): tests only where behaviour warrants them.

**Goal**

Ship the schema versioning and compatibility policy, replace fractional rail positioning with the carrier-first sub-U model, publish a versioned JSON Schema for external YAML validation, and land the NetBox format adapter. The keystone order is binding: #1113 (policy) -> #2158 (schema bump) -> #571 (publish) -> #1209 (adapters). Closing epic #570 is the milestone close-out.

**Position in sequence**

M03 runs after M02 (LXC Release & Stability) and M04 (Type Safety, Decomposition & Stability), and before M14 (UX shell) and M16 (keyboard pass). M15 (storage) runs in parallel and does not gate M03. The working sequence is M02 -> M04 -> M03 -> M14 -> M16.

**Cross-milestone gates in**

- M02 shipped the narrow #2152 patch on the existing slot machinery (restore half-U stacking). #2158 deletes that machinery; the patch must already be on main before the epic implementation starts.
- M04 #2146 landed an interim no-op guard for arrow-key nudge of contained devices in src/lib/utils/device-movement.ts (findNextValidPosition). #2158 owns the end state and replaces that guard.
- M04 #1419/#1420 E2E selector infrastructure lands before M03; the E2E portions of #1114 lean on it.
- #617 (images in YAML) moved to M15 for data-safety reasons; nothing in M03 waits on it. #618 is closed.

**Cross-milestone gates out**

- M14 #2075 (device verb bar half-width slot control) is blocked on #2158's slot-model decision; all M14 placement and drag work sequences after this milestone.
- M14 #2095 (templates) becomes a CI-validated consumer of the schema artifact published by #571.
- M08 #820 (share-link shortener) consumes the policy from #2186. M08 #2181 (git-sync regression coverage, split from #1114) waits on #627 in M08.
- M10 takes GeoJSON export, trimmed out of #1209.
- #2164 (drive-bay spike, unmilestoned) is sequenced after #2158's design freeze.
- #1208 (Initiative: Ecosystem Interoperability) moved to Backlog; #1209 proceeds in M03 without it.

## Stage 1: Policy and spec

Tasks in this stage are parallel-safe. #1113 cannot close until #2186's findings are folded into its compatibility matrix, but both spikes can start immediately.

### Task: #1113 spike: Define YAML schema versioning and compatibility policy

- Blockers: none (close-out incorporates #2186's findings; do not close before #2186 reports).
- Why this position: the policy is the keystone; every later task (#2158 bump, #571 publish, #1209 adapters) depends on it. The recorded "this before format work" dependency was violated once already (#619 closed while this sat open); do not repeat that with #2158.
- Scope: write the versioning contract for the Rackula YAML schema: version field strategy and location, compatibility matrix for older/current/newer schema versions, breaking vs non-breaking rubric with examples, and migration/deprecation expectations. Audit AC: enumerate ALL read surfaces the policy governs: file load, share-link payloads (src/lib/utils/share.ts plus the M08 shortener #820), server GET, snapshot restore (#2042), and the localStorage working copy (src/lib/storage/working-copy.ts has its own unvalidated read path). Audit AC: define the compatibility or rejection policy for pre-bump snapshots and old shared URLs after #2158's schema bump. Create follow-up issues for any required runtime checks or migrations.
- Key files: src/lib/schemas/index.ts (schema_version field, line ~753), src/lib/utils/yaml.ts (serialization, schema_version default "1.0"), src/lib/utils/share.ts, src/lib/schemas/share.ts, src/lib/storage/working-copy.ts, src/lib/stores/layout/persistence.ts. Research output per convention: docs/research/1113-{type}.md; policy doc in docs/reference/.
- Verify: policy doc committed and linked from #570, #571, #2158; ls docs/research/1113-\*.md; gh issue list -R RackulaLives/Rackula --search "1113" confirms follow-up issues exist if runtime work is required; npm run lint passes if any code stubs land.
- [ ] Done when: policy doc is in docs and linked from format-related issues, all five read surfaces are enumerated with defined behaviour, the pre-bump snapshot and share-link policy is written, and follow-up implementation issues exist.

### Task: #2186 spike: share-link schema versioning and shortened-link compatibility

- Blockers: none.
- Why this position: share-URL payloads are a schema read surface with no compatibility policy, and the answer feeds both #1113's compatibility matrix and M08 #820's design. It must conclude before #2158's share-link format revision.
- Scope: decide whether pre-bump share links open via the #2158 import adapter, show a versioned error, or expire. Decide whether the share payload carries a schema version field today, which is cheap to add before #2158 revises the share-link format. Deliver findings as input to #1113 and to #820's design.
- Key files: src/lib/utils/share.ts (Ctrl+H share payload encode/decode), src/lib/schemas/share.ts (share payload schema). Research output: docs/research/2186-spike.md.
- Verify: research doc committed; finding recorded on #1113 (comment or doc link) and on #820; if a version field is added to the payload now, npm run test:run covers the encode/decode change.
- [ ] Done when: the pre-bump share-link policy is decided and recorded as input to #1113's matrix and #820's design, and the version-field-today decision is made.

### Task: #2158 Epic: Carrier-first sub-U devices (whole-U rails, containers for fractional gear)

Design-spec PR only in this stage; implementation is Stage 2.

- Blockers: none.
- Why this position: the audit's first action for the epic is to open and merge the design-spec PR. The spec exists only on branch feat/2158-carrier-first-sub-u-design; the epic body cites its path as if it were on main. Merging it is the epic gate for Stage 2.
- Scope: open a PR from feat/2158-carrier-first-sub-u-design carrying docs/superpowers/specs/2026-06-12-carrier-first-sub-u-design.md, review it against the epic's approved decisions, and merge. The spec stays frozen as the decision record and is not updated during implementation.
- Key files: docs/superpowers/specs/2026-06-12-carrier-first-sub-u-design.md (on branch feat/2158-carrier-first-sub-u-design, not yet on main).
- Verify: gh pr checks <pr> green; after merge, ls docs/superpowers/specs/2026-06-12-carrier-first-sub-u-design.md succeeds on main.
- [ ] Done when: the design-spec PR is merged to main and the spec path cited in the epic body resolves.

## Stage 2: Carrier-first implementation

Stage 1 must be complete: the policy from #1113 governs the schema bump, #2186 governs the share-link revision, and the merged spec is the decision record.

### Task: #2158 Epic: Carrier-first sub-U devices (whole-U rails, containers for fractional gear)

Implementation. This is an epic; expect multiple PRs, each with its #2165 docs item attached.

- Blockers: #1113, #2186, design-spec PR merged (Stage 1).
- Why this position: the schema bump must follow the versioning policy, and #571 cannot publish until the bump lands or the first public schema ships immediately broken.
- Scope: enforce the core rule (sub-U placement requires container_id and slot_id; rail positions are whole-U integers) in the Zod schema, store actions, and drag-and-drop targeting with carrier synthesis. Delete the fractional rail machinery: fraction glyphs in formatPosition, 1/3-step fine movement, fractional rail collision math, PlacedDevice.slot_position and the pair recovery logic (source of #1248 and #1602); slot_width survives only as a size descriptor. Bump the schema version and revise the share-link format per #1113/#2186; ship the import-time adapter that snaps fractional positions and synthesizes carriers for legacy layouts and share links (read-path only). Lifecycle: cascade delete with undo restoring the subtree, deep duplication, child-to-rack drag synthesis, arrow-key rules (containers move whole-U with children; children move between cells within their container only, replacing the #2146 interim guard). Library: K-79 branded 2x2 container, generic 1U 2x2 carrier, AV joining tray.
- Key files: src/lib/schemas/index.ts (slot_position line ~582, pair recovery ~879), src/lib/utils/position.ts (formatPosition fraction glyphs), src/lib/utils/collision.ts, src/lib/utils/device-movement.ts (#2146 guard in findNextValidPosition), src/lib/utils/dragdrop.ts, src/lib/utils/rack-drop-coordinator.ts, src/lib/stores/layout/device-actions.ts, src/lib/stores/layout/recorded-device-actions.ts, src/lib/utils/share.ts, src/lib/utils/netbox-import.ts.
- Verify: npm run test:run covers the epic's test requirements (sub-U rail placement rejected; carrier synthesis on palette drop; one child per cell; cascade delete then undo; deep duplicate; import adapter snap-and-synthesize); grep -rn slot_position src/lib returns no hits after the deletion PR; npm run lint and npm run build green; npm run test:e2e for placement flows.
- [ ] Done when: all epic scope checkboxes are complete, the slot_position pathway is deleted, the schema version is bumped with the import adapter in place, and the share-link format revision follows the #2186 decision.

### Task: #2131 fix: canPlaceInContainer skips sibling collision checks for global-only sibling types

- Blockers: none.
- Why this position: a correctness gap in the container machinery #2158 builds on; fixing it before or alongside the epic keeps the new placement paths honest. Reachable only via loaded layouts with unembedded device types.
- Scope: in src/lib/utils/collision.ts (~line 527 inside canPlaceInContainer, declared at line 474), sibling child types are resolved via deviceLibrary.find over layout.device_types; types resolvable only from the starter library or brand packs are silently skipped, so overlapping children can be accepted. Resolve sibling types through the same global lookup path (findDeviceType) used elsewhere, or fail closed when a sibling type cannot be resolved.
- Key files: src/lib/utils/collision.ts (canPlaceInContainer, line ~474), src/lib/utils/device-lookup.ts (findDeviceType).
- Verify: npm run test:run with a new test loading a layout whose child types are not embedded and asserting the overlap is rejected; npm run lint green.
- [ ] Done when: sibling collision checks no longer skip unresolvable types (global lookup or fail-closed) and a regression test covers the loaded-layout path.

### Task: #2165 docs: carrier-first sub-U documentation

- Blockers: #2158 design-spec PR merged; each item lands with its corresponding #2158 implementation PR, not before.
- Why this position: docs ship in lockstep with the epic's PRs so claims stay true; the issue exists so the writing work has its own home and review.
- Scope: SPEC.md mounting-model section (rails register at whole-U boundaries per EIA-310; carriers register to rails) with rationale; ARCHITECTURE.md position and internal-units update linking to SPEC.md; CLAUDE.md Quick Reference invariant (rail positions are whole-U integers, never reintroduce fractional rail positions); CHANGELOG entry via /release at ship time stating legacy layouts and share links load with carriers synthesized automatically; in-app drag hint routed through /technical-writing. The design spec stays frozen and is not edited. The field-mapping item (carrier to device_bays) waits for #1209 in Stage 4.
- Key files: docs/reference/SPEC.md, docs/ARCHITECTURE.md, CLAUDE.md, CHANGELOG.md, docs/superpowers/specs/2026-06-12-carrier-first-sub-u-design.md (frozen, read-only).
- Verify: npm run lint green; manual review that each docs claim matches merged behaviour; gh pr view on each carrying PR shows the docs item included.
- [ ] Done when: all checklist items except the #1209 field-mapping section have shipped with their implementation PRs; the final item closes with Stage 4.

## Stage 3: Publish and coverage

Requires the #2158 schema bump on main.

### Task: #571 feat: Publish JSON Schema for YAML validation

- Blockers: #1113, #2158.
- Why this position: audit sequencing is explicit: publish AFTER #2158's schema bump, or the first public schema ships immediately broken. The stale in-progress label was removed; no schema/ directory, dependency, or branch exists yet, so this is greenfield.
- Scope: generate JSON Schema from the Zod schemas in src/lib/schemas/index.ts (zod-to-json-schema or similar), publish versioned files at a stable raw GitHub URL, and integrate generation into the build with a CI sync check. Audit AC: schema version naming follows #1113's policy and is decoupled from app CalVer; refresh the stale pre-CalVer examples in the issue body (schema/v0.6.json; no schema/ directory exists in the repo, the issue creates it). Documentation minimum: canonical schema URL, one YAML sample showing $schema usage, VS Code + yaml-language-server setup notes, and known validation limitations (refine/cross-field rules are not expressible). Templates (#2095, M14) become CI-validated consumers of this artifact.
- Key files: src/lib/schemas/index.ts (source Zod schemas), package.json (build integration); new schema/ output directory (does not exist yet, created by this issue).
- Verify: npm run build emits the schema artifact; CI check fails when Zod and the published schema drift; manual check that VS Code with yaml-language-server validates a sample Rackula YAML against the published URL; npm run test:run green.
- [ ] Done when: a versioned JSON Schema generated from Zod is published at a stable URL, editor validation works, naming follows #1113's policy, and the documentation minimum is in place.

### Task: #1114 chore: Add regression coverage for YAML and git sync workflows

- Blockers: #2158 (fixtures must cover the post-bump format and exercise the import adapter).
- Why this position: audit re-scope keeps only the YAML round-trip and legacy ZIP load half here (the YAML default shipped in PR #1754); the git-sync half is #2181 in M08. This is the remaining precondition gating #620.
- Scope: automated coverage for YAML save plus reload round-trip of representative layouts, and for loading legacy ZIP files with compatibility behaviour preserved. Include pre-bump fixtures so the #2158 import adapter path stays covered. E2E portions lean on the M04 #1419/#1420 selector infrastructure already on main. Document the coverage in docs/guides/TESTING.md. No live external dependencies.
- Key files: src/lib/utils/yaml.ts, src/lib/utils/zip.ts, src/lib/utils/archive.ts, src/lib/utils/serialization.ts, src/tests/factories.ts, docs/guides/TESTING.md.
- Verify: npm run test:run green with the new round-trip and legacy ZIP suites; npm run test:e2e green for the user-visible YAML flows; tests run in CI.
- [ ] Done when: YAML round-trip and legacy ZIP regression suites pass in CI and are documented in the testing guide; the git-sync ACs are explicitly out (tracked in #2181).

### Task: #620 chore: Optimize JSZip loading for legacy ZIP support

- Blockers: #1114.
- Why this position: removal of the single-layout ZIP save path is only safe once #1114's legacy ZIP regression coverage exists to prove the read path still works. Absorbed epic #1119.
- Scope: audit-corrected AC: delete only the single-layout ZIP save path; retain createFolderArchive/getJSZip because export-all (#2045, M14) builds on downloadArchive and export.ts dynamically imports ZIP creation for multi-rack PNG export, a live write consumer. Verify JSZip is lazy-loaded only when a ZIP file is detected and measure bundle impact (JSZip must not be in the initial bundle). Legacy ZIP read is kept indefinitely.
- Key files: src/lib/utils/zip.ts (getJSZip consumer), src/lib/utils/archive.ts (getJSZip line ~49, createFolderArchive line ~238), src/lib/utils/export.ts, src/lib/utils/file.ts.
- Verify: npm run build, then inspect the output chunks to confirm JSZip is absent from the initial bundle (e.g. grep the dist manifest for jszip); npm run test:run green including #1114's legacy ZIP suite; manual load of a legacy .rackula ZIP still works.
- [ ] Done when: the single-layout ZIP save path is gone, createFolderArchive/getJSZip remain for multi-file artifacts, JSZip stays out of the initial bundle, and legacy ZIP load still passes regression coverage.

## Stage 4: Adapters and close-out

### Task: #1209 Epic: Format Adapters & External Schema Bridge

- Blockers: #571, #1113 (in that order, per the audit).
- Why this position: adapters prove the published schema works as an integration surface; they need the stability contract (#1113) and the published artifact (#571) first, and the NetBox mapping coordinates with #2158's carrier model (carrier maps to parent device with device_bays; children map to subdevice_role child).
- Scope: audit trim: NetBox YAML round-trip plus field-mapping documentation only. GeoJSON export moved to M10 (duplicates epic #1210 use case 2). CSV is not re-planned: #273 closed completed 2026-06-08 and already shipped the connection/cable list export. Deliver NetBox-compatible YAML export aligned with the netbox-community/devicetype-library format, the enhanced import already scoped in #2158 (fractional snap-and-synthesize, subdevice children), and the field mapping guide covering Rackula to NetBox correspondence including the carrier to device_bays section (closes the last #2165 item).
- Key files: src/lib/utils/netbox-import.ts, src/lib/utils/netbox-import.test.ts, src/lib/utils/export.ts, src/lib/schemas/index.ts; new field-mapping doc under docs/reference/.
- Verify: npm run test:run green including at least one round-trip test (export from Rackula, import into the external format, verify data integrity); manual check that an exported device type file matches devicetype-library conventions; npm run lint and build green.
- [ ] Done when: NetBox YAML export round-trips with verified data integrity and the field mapping guide is published; GeoJSON and CSV remain out of scope.

### Task: #570 Epic: Developer-Friendly Data Format

Close-out only; no implementation.

- Blockers: #1113, #2158, #571, #1114, #620.
- Why this position: audit re-scope: the epic's ACs no longer include the git-sync MVP (all git-sync issues #627/#628/#629 live in M08, plus #2181), and #617 (images in YAML) moved to M15. The epic closes with M03.
- Scope: verify the audit close conditions: schema versioning policy (#1113), schema bump (#2158), published schema (#571), the YAML half of #1114, and #620 are done. Confirm remaining open questions are resolved or moved into tracked follow-up issues (M08: #627/#628/#629/#2181/#820; M15: #617; Backlog: #794/#795 device type ecosystem research per the epic checklist). Close the epic with a comment linking the delivered artifacts.
- Key files: none (GitHub close-out).
- Verify: gh issue view 1113 571 620 1114 2158 -R RackulaLives/Rackula each shows CLOSED; gh issue close 570 -R RackulaLives/Rackula --comment with delivery summary.
- [ ] Done when: all five audit close conditions are closed and epic #570 is closed with the re-scoped ACs satisfied.

## Verification

Milestone close-out checklist:

- [ ] All M03 issues closed: #570, #571, #620, #1113, #1114, #1209, #2131, #2158, #2165, #2186 (gh issue list -R RackulaLives/Rackula --milestone "M03 -- Data Format & Interop" --state open returns nothing).
- [ ] Epic #570 closed against the re-scoped audit conditions (no git-sync ACs).
- [ ] grep -rn slot_position src/lib returns no hits; rail positions are whole-U integers everywhere.
- [ ] Smoke: load a pre-bump fixture layout; the import adapter snaps fractional positions and synthesizes carriers without data loss.
- [ ] Smoke: open a pre-bump share link; behaviour matches the #2186 policy decision (adapt, versioned error, or expire).
- [ ] Smoke: validate an exported YAML layout in VS Code with yaml-language-server against the published schema URL.
- [ ] Smoke: legacy .rackula ZIP load works; JSZip absent from the initial bundle.
- [ ] npm run test:run, npm run lint, npm run build, npm run test:e2e all green on main.
- [ ] Gates out honoured: #2075 (M14) unblocked note posted, #2095 schema-consumer follow-up visible, #820/#2181 (M08) reference the M03 outcomes, GeoJSON tracked in M10.
