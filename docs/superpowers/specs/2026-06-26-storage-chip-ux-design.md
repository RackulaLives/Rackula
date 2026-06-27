# Storage chip UX redesign

Date: 2026-06-26 Status: design (awaiting plan) Topic: surface storage location and last-save facts on the workspace storage chip

## Summary

The storage status chip currently shows only a save state (one of "Saved", "Unsaved changes", "Saving", "Offline", "Server not found"). Two pieces of designed intent never shipped: the storage location word (#2446 wanted "Saved . Server" / "Unsaved . Browser"), and the last-save / last-export facts that #2035 reserved a popover for. This design completes both: a two-tone inline chip that always shows state and location, plus a hover/tap details popover carrying honest, mode-aware timestamps. No save or export mechanics change.

## Problem

- The chip computes the storage mode but never renders it. A user cannot tell at a glance whether their work lands in this browser only or on the server. For server deployments and for the misconfiguration cases in #2063, that distinction is exactly what the chip exists to make honest.
- There is no surface for "when was my work last saved". The underlying timestamps already exist (`savedAt` working-copy write, server `updatedAt`) but are used only internally for conflict detection.
- The chip is a passive `role="status"` div with no details affordance, so there is nowhere to put facts without widening the inline footprint.

## Goals

- Always show storage location (Browser or Server) inline, paired with the save state.
- Reveal last-save facts on demand without cluttering the toolbar or jittering with a live-ticking clock.
- Keep the chip honest: never imply durability the storage mode does not provide.
- Preserve the accessibility guarantees from #2064 (never colour-only, accessible name includes state, debounced live-region announcement).

## Non-goals

- No new actions on the chip. Export and restore actions stay in the file menu (#2446 decision stands).
- No change to save, autosave, or export mechanics.
- No new toasts (#2063 messaging decision stands; facts are popover-only).
- No inline relative-time that ticks. Relative time lives inside the popover only.

## Background

Current implementation, confirmed by code:

- `src/lib/components/StorageStatusChip.svelte`: passive `role="status"` div, renders an icon (check / clock / warning) plus a single state label. Inline extras are the server-reachable hint banner and an override "switch back to browser mode" button.
- `src/lib/storage/durability.svelte.ts`: `computeLayoutStatus` derives the chip state from layout state, persistence state, and API reachability. This is the single chip data source.
- `src/lib/storage/availability.svelte.ts`: `getStorageMode()` resolves browser vs server once at startup from `window.__RACKULA_CONFIG__.storage` plus a local opt-in override.
- `src/lib/stores/layout.svelte.ts`: holds `isDirty`, `changesSinceExport`, `hasEverExported`; `markDirty()` increments the counter, `markExported()` zeroes it and sets `hasEverExported`.
- Working-copy session blob carries `savedAt` (ISO 8601) for the localStorage autosave; the persistence manager echoes server `updatedAt`. Neither is surfaced to the user.

Prior intent: #2035 (chip with states plus a facts/actions popover), #2034 (`changesSinceExport` counter), #2446 (status-only chip showing save state and storage target, actions moved to file menu), #2063 (surface storage-mode misconfiguration in the popover), #2064 (accessibility requirements).

## Design

### Inline chip (always visible)

Format: `[icon] [State] . [Location]`.

- State word carries the status colour (green success, amber warning, red error).
- The separator dot and the location word use `--colour-text-muted`. Only the part that carries meaning is coloured, so colour stays semantic and the eye lands on state first, location second.
- Icons stay distinct line glyphs (check, clock, warning triangle) so state is encoded without colour (WCAG 1.4.1). No bare colour-only dot.

De-duplication rule: self-describing error states ("Server not found", "Server unavailable") stand alone with no `. Server` suffix. Normal states ("Saved", "Unsaved", "Saving", "Connecting") take the location suffix.

The #2063 attention treatment (browser mode, server reachable) keeps its amber border and 10 percent amber background wash on the inline chip, and adds the explanatory hint line to the popover footer.

### State and copy reference

| Mode | Condition | Icon | Inline text |
| --- | --- | --- | --- |
| Browser | `changesSinceExport === 0 && hasEverExported` | check | Saved . Browser |
| Browser | otherwise | clock | Unsaved . Browser |
| Server | `saveStatus === "saved"` | check | Saved . Server |
| Server | `saveStatus === "saving"` | clock | Saving . Server |
| Server | `apiAvailable === null` (not yet checked) | clock | Connecting . Server |
| Server | reached then lost (`apiEverReached && !apiAvailable`) | warning | Offline . Server |
| Server | never reached (`!apiEverReached && !apiAvailable`) | warning | Server not found |
| Server | circuit breaker open (3+ failures) | warning | Server unavailable |

Inline shortening: the full phrase "Unsaved changes" shortens to "Unsaved" inline to fit the location suffix; the popover headline keeps the full phrase. "Checking connection" shortens to "Connecting".

### Details popover (hover / tap)

Facts only. No actions. Content is mode-aware.

Browser mode:

```text
[icon] [State headline]
----------------------------
Auto-saved        10s ago      (working-copy savedAt; omit line if never autosaved)
Last exported     3 days ago   (lastExportedAt; "Never exported" when null)
N changes since last export    (changesSinceExport, only when > 0)
Stored in this browser only
[server-reachable hint, only when a server answers /api/health]
```

Server mode:

```text
[icon] [State headline]
----------------------------
Last saved        2m ago       (server updatedAt)
Stored on the server
[recovery hint, only in not-found / offline / unavailable states]
```

Degraded server states reframe the time line to carry the risk, for example a headline of "Offline" with "Last reached server 8 minutes ago" and a note that the most recent edits are not yet saved. This is the case where time-since-save drives a decision.

Relative-time strings (for example "just now", "10 seconds ago", "2 minutes ago", "3 days ago") are computed when the popover opens and refreshed by a timer only while it is open. No timer runs while the popover is closed.

### Data model

One new field. Everything else already exists.

- Add `lastExportedAt: string | null` to `layout.svelte.ts`. Set it to the current ISO timestamp inside the existing `markExported()`. Persist it in the browser multi-tab workspace library (`LibraryEntry` in `browser-workspace.ts`), alongside `changesSinceExport`, restored on workspace load; server mode does not display it. Default `null` (never exported).

The popover is a new read-only view derived from `getLayoutDurability()`, which already aggregates layout state, persistence state, and reachability. No new data plumbing beyond the one timestamp.

### Interaction and accessibility

- The chip becomes a `<button>` rather than a passive `role="status"` div. Its accessible name still includes the current state.
- Reveal is hybrid: a bits-ui Popover is the base (tap, click, Enter, Space; persistent; dismiss with Escape or click-away). On fine-pointer devices, add hover-open with a short hover-intent delay and hover-out close. Coarse-pointer (touch) uses tap only. Hover is an enhancement; all facts are reachable by keyboard and tap, never hover-only.
- Keep the existing settled-state live-region announcement, debounced about 500ms, so save churn does not spam assistive tech (#2064).
- Mobile touch target is at least 44 by 44 px (the #2100 standard) even though the visual pill is 28 px tall.
- Validate the component with the Svelte MCP `svelte-autofixer` and follow the existing `src/lib/components/ui/` wrapper patterns for the bits-ui Popover.

### Visual

- Chip: keep the borderless 28 px pill. Because it is now interactive, add a subtle background wash on hover and focus and a token-based focus ring, signalling it can be opened.
- Hierarchy: state word at full weight in its status colour; separator and location muted.
- Popover: Dracula surface from existing tokens, about 248 px wide, caption-size type, timestamps laid out as a tight two-column definition list with right-aligned tabular-numeric values, one hairline divider under the headline, the "Stored in ..." footer most muted. In browser mode the "Last exported" value renders in the warning colour while there are unexported changes, to flag backup drift.
- Motion: popover fade and scale about 120 ms, gated by `prefers-reduced-motion`. The "Saving" state keeps the calm clock icon rather than an animated spinner, to avoid motion noise.

## Default decisions

These were raised during brainstorming and resolved as defaults; flag any during spec review to change.

- Export-age warning colour: the "Last exported" value renders amber whenever there are unexported changes (`changesSinceExport > 0`), not on a time threshold. Simpler and tied to actual drift rather than wall-clock age.
- State label wording: "Connecting . Server" (shortened from "Checking connection") and inline "Unsaved" (full "Unsaved changes" in the popover headline).
- "Saving" icon: the calm clock, no animated spinner.

## Testing

Follow the project testing policy: test behaviour, not data or DOM structure. Candidate behavioural tests:

- `lastExportedAt` is set by `markExported()`, persisted in and restored from the session blob, and reset on load, matching the existing `changesSinceExport` lifecycle.
- The chip's accessible name includes both the state and, where applicable, the location, across browser and server states (extend the existing `StorageStatusChip.test.ts` accessible-name assertions; assert on text content, not classes or nodes).
- Mode-aware popover copy: browser mode shows both autosave and last-export lines (with "Never exported" when null); server mode shows the single last-saved line; degraded server states surface the reframed "last reached" line.
- The relative-time refresh timer runs only while the popover is open and is torn down on close.

No exact-length, colour-value, class-name, or render-only assertions (ESLint enforces this).

## Risks and devil's-advocate notes

- Browser-mode honesty: the autosave timestamp is always recent and is not a durable backup. The popover labels it "Auto-saved (working copy in this browser)" and pairs it with "Last exported", so a recent autosave never reads as "you are backed up". This is the core honesty guard.
- Server happy-path time is low-value on its own; it earns its place mainly in degraded states. The design keeps it one click away rather than inline, and reframes it under failure headlines.
- Hybrid hover plus tap has the most edge cases (hover intent, pointer-type detection, focus management). Building on a real Popover rather than a tooltip keeps the tap and keyboard paths correct; hover is layered on as an enhancement.
- Re-introducing an interactive surface must not regress #2446: the popover carries facts only, never actions.

## References

- Issues: #2035 (chip), #2034 (change counter), #2446 (status-only redesign), #2063 (misconfiguration), #2064 (accessibility).
- Spike and plan: `docs/research/spike-2019-storage-model-data-safety.md`, `docs/plans/2026-06-12-m015-storage-data-safety-plan.md`.
- Code: `src/lib/components/StorageStatusChip.svelte`, `src/lib/storage/durability.svelte.ts`, `src/lib/storage/availability.svelte.ts`, `src/lib/stores/layout.svelte.ts`, working-copy and persistence-manager modules, `src/lib/styles/tokens.css`, `src/lib/components/Toolbar.svelte`.
