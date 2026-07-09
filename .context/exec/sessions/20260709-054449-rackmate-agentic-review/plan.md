# RackMate Agentic Review Exec Plan

Session: `20260709-054449-rackmate-agentic-review` Branch: `rackmate-agentic-fit` Target: `main` Merge gate: PR first; human approval required before merge.

## Findings

- RackMate 10-inch defaults are inconsistent: the edit panel pins depth, but schema/default creation can still produce 1000mm racks and direct-new layouts still start as generic 19-inch/24U racks.
- The 2x2 carrier model is only partially row-aware. Drag/drop detects rows, but rendering and child geometry flatten slots into one horizontal row.
- Rack-level 0.5U RackMate accessories are exempt from carrier rules, but the placement validators still only accept whole-U rack positions.
- Synthesized carrier drop previews validate the carrier footprint but render the child footprint, understating the space consumed by RackMate mounts.
- RackMate starter workflow is split between menus and command search; the command palette omits the RackMate starter.
- The RackMate starter template uses local placeholder slugs that duplicate DeskPi brand-pack hardware, creating palette/search drift.
- Palette and drop feedback hide important RackMate planning metadata such as mount-bay requirements, suggested trays, 3D-print placeholders, and clearance notes.
- RackMate-focused E2E, docs, and visual coverage are thin relative to the new workflow.

## Execution Phases

1. Rack profile and creation defaults
   - Centralize RackMate T1 Plus profile values.
   - Make new/default RackMate flows create 8U, 10-inch, 260mm racks.
   - Normalize missing RackMate depth on load without silently shrinking legacy racks.
   - Lock the edit-panel RackMate height path to 8U when safe and make blocked cases explicit.

2. Placement/rendering correctness
   - Add shared row/column slot geometry.
   - Use it for carrier slot overlays and child rendering.
   - Allow valid native 0.5U RackMate accessories on half-U rail positions.
   - Fix synthesized-carrier preview height.

3. RackMate UX and data quality
   - Add command-palette support for the RackMate starter.
   - Surface chassis-bay/mount requirements and suggested mounts in palette/drop feedback.
   - Consolidate RackMate starter slugs onto brand-pack DeskPi slugs where possible.
   - Add or update utility tray data so UCG-Max and small network gear can be planned realistically.

4. Coverage and docs
   - Add targeted unit tests for RackMate defaults, half-U placement, slot geometry, mount recommendations, and starter slug integrity.
   - Add RackMate workflow E2E/smoke coverage where stable.
   - Update user-facing docs/help only where it improves discoverability.

5. Verification and merge gate
   - Run targeted tests during implementation.
   - Run full `check`, `lint`, unit, build, and E2E smoke gates.
   - Push branch and open/update PR.
   - Stop at the final human merge approval gate before merging into `main`.
