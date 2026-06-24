# Storage server opt-in: surfacing and adopting an available API

Date: 2026-06-22 Status: Approved design, ready for plan Related: #2036, #2037, #2051 (the change that introduced this behaviour), spike #2019 (storage data-safety model), #2063 (browser-mode misconfiguration probe)

## Problem

The dev environment runs the full Docker stack (web plus `rackula-api`) on the self-hosted VPS, deployed by `deploy-dev.yml` with `docker compose --profile persist up -d`. The API container is up and `/api/layouts` answers (the post-deploy smoke test curls it). Yet the frontend saves layouts to the browser, not the API. The deployed API is running and unused.

### Root cause, with evidence

Storage mode is declarative, not probed. `getStorageMode()` in `src/lib/storage/availability.svelte.ts` reads `window.__RACKULA_CONFIG__.storage` once at page load and returns `"server"` only on an exact `"server"` match, defaulting to `"browser"` otherwise. The Docker entrypoint (`deploy/docker-entrypoint-wrapper.sh`) writes that config from the `RACKULA_STORAGE_MODE` env var, defaulting to `browser` when the var is unset. The static build default (`static/config.js`) is also `browser`.

The dev deploy never sets the var. The generated `.env` in `deploy-dev.yml` sets the port, images, container names, CORS origin, and insecure-CORS flag, but not `RACKULA_STORAGE_MODE`. Confirmed: `git log -S RACKULA_STORAGE_MODE -- .github/workflows/deploy-dev.yml` returns nothing; it was never there. So the entrypoint has defaulted dev to browser mode the whole time.

### When the behaviour changed

The auto-detection the user expected ("use the API when it is reachable") existed and was deliberately removed. Commit `e6dc2a15` (PR #2051, "feat: runtime storage mode config injection", issues #2036 and #2037), part of the M015 storage data-safety epic, replaced the old `hasEverConnectedToApi` probe-and-guess with the declarative config value above. The spike #2019 rationale for removing it, verbatim:

> only explicit mode lets the app honestly say "server unreachable, changes held in this browser" instead of quietly becoming a different product.

The concern is data location integrity: a homelabber must always know whether their layouts live on the server or only in this browser, so the app must not silently flip between the two based on a probe.

### Contributing cause

`docs/ARCHITECTURE.md` and `docs/reference/SPEC.md` still describe dev as "GitHub Pages, static-only," which is stale. Dev is a Docker web-plus-API deploy on the self-hosted VPS. Anyone wiring up the storage-mode env var would have read those docs, concluded dev is static and needs no server config, and moved on. The doc drift is part of why the gap went unnoticed.

## Goals

- Restore the dev environment to server mode (the actual reported fix).
- Make "API reachable but the app is in browser mode" impossible to miss, and correctable in one click, so this class of misconfiguration never silently wastes a running API again.
- Preserve the M015 data-safety guarantee: the app never silently relocates where a user's data lives, and always names what moves before it moves.

## Non-goals

- Automatic mode switching with no user action. The opt-in is always an explicit click.
- Merging or de-duplicating uploaded layouts against existing server layouts. Uploads land as new server layouts.
- Cross-device or cross-browser synchronisation of the client override.
- Allowing a client override to downgrade a deployment that explicitly declares server mode. Config remains the source of truth for declaring server mode.

## Design

The work splits into two parts that ship independently.

### Part A: restore dev and fix the docs (the reported fix)

Add `RACKULA_STORAGE_MODE=server` to the generated `.env` in `deploy-dev.yml`, so dev matches prod's intended explicit setup. Update `docs/ARCHITECTURE.md` and `docs/reference/SPEC.md` to describe dev as a Docker web-plus-API deploy on the self-hosted VPS running in server mode, replacing the stale "GitHub Pages, static-only" description.

This is a config omission, not a UX problem. It does not depend on Part B and should ship first.

### Part B: loud opt-in when a server is reachable in browser mode

#### Trigger

Reuse the existing detection signal. `probeServerForBrowserHint()` in `availability.svelte.ts` already runs at startup in browser mode and sets `serverReachableInBrowser` when the hardened `/api/health` endpoint answers (#2063). Today that signal only feeds a passive chip popover. Escalate it: when `getStorageMode() === "browser"` and `serverReachableInBrowser` is true, surface the opt-in.

#### Placement

The storage chip is the app's existing "where does my data live" affordance, so it carries the truth. On detection the chip enters an attention state ("Browser, server available"), and a single persistent, dismissible inline banner appears near it on first detection. The banner does not auto-time out. After it is dismissed, the offer remains available from the chip, so the prompt is loud once but never naggy.

Rejected alternatives: a modal on load (too aggressive, interrupts the common fresh-load case where nothing has been made yet) and a toast (ephemeral and auto-dismissing, which reproduces today's easy-to-miss failure mode).

#### The switch action: bring my work with me

On click:

1. If no browser layouts exist (the common fresh dev load), switch straight to server mode.
2. If browser layouts exist, show a confirm step that names exactly what moves: "These N layouts will be uploaded to the server as new layouts: [names]. Your browser copies stay until you remove them." The upload is a copy, never a move. No local data is deleted.
3. Upload each browser layout body to the server, reporting per-layout success or failure. Layouts that fail to upload stay local and are named in the result.
4. Set the client mode override and reload the page. On reboot the app comes up in server mode showing the uploaded layouts. A reload, rather than a mid-session reactive mode flip, keeps the transition clean and avoids half-switched state.

#### Mode precedence

The client override can only upgrade browser to server, never the reverse. `getStorageMode()` resolves in this order:

| Config value | Override | Server reachable | Resolved mode | Notes |
| --- | --- | --- | --- | --- |
| `server` | (any) | (any) | server | Config wins. Override ignored. Never offer to leave. |
| `browser` | `server` | yes | server | User opted in. |
| `browser` | `server` | no | browser, degraded notice | Tell the user the server they opted into is unreachable; offer to clear the override. |
| `browser` | none | (any) | browser | Default. |

A reverse "switch back to browser mode" action appears only when the current mode came from the override (config is `browser`), never when config declared server mode. Clearing the override reloads back into browser mode.

The override is stored in localStorage (for example `Rackula:storage-mode-override`) so it survives reload within this browser, and it is revalidated on every load against actual server reachability per the table above. This keeps the app honest: an opted-in server that later goes away produces a visible "server unreachable" state, not a silent fall back to stale browser copies.

#### Data-safety guarantees

- The switch never deletes browser-local data. Uploads are copies.
- The prompt always names what will move before it moves.
- The app never silently relocates where data lives. The only behaviour change versus today is that the browser-to-server upgrade is one click instead of an env-var edit, and only ever as an explicit opt-in.
- The prompt also surfaces the permanent fix for admins ("set `RACKULA_STORAGE_MODE=server` to make this the deployment default"), so the underlying config gets corrected, not just the session.

## Architecture notes

- `getStorageMode()` gains the precedence resolver above. The override is a reactive source so existing consumers re-evaluate, but the switch itself completes via reload, so no mid-session reactive mode flip is required across the app.
- The upload-then-switch handler reads the browser workspace index (`Rackula:workspace`) and the per-layout bodies (`Rackula:layout:<id>`), POSTs each to the server layout API, sets the override, and reloads.
- The server-mode startup path (`initializePersistence()` plus the existing health check, empty-list first run, and server-down continuity from the working copy) runs unchanged on the post-switch reload. No new startup branch is needed.
- The autosave effects in `manager.svelte.ts` (effects 1 to 3) already guard on `getStorageMode()` and `isApiAvailable()` and need no change beyond the resolver.

## Testing

Test the logic with real edge cases; do not test rendering.

- The precedence resolver: all four rows of the table, including the degraded-notice case.
- The upload-then-switch handler: all layouts succeed, partial failure (some stay local), and the no-layouts fast path.

The banner and chip attention state are visual and do not earn unit tests, per the project TDD policy.

## Implementation decomposition (for subagent execution)

The plan should fan out into these units. Part A is fully independent and can run in parallel with the rest. Within Part B, the resolver is the foundation the others build on.

- Unit A1: `deploy-dev.yml` env var plus `ARCHITECTURE.md` and `SPEC.md` doc fixes. Independent, ships first.
- Unit B1 (foundation): mode precedence resolver and override storage in `availability.svelte.ts`, including the reachability revalidation. Provides the override API the others consume.
- Unit B2: upload-then-switch handler (read browser workspace, upload to server, set override, reload). Depends on B1.
- Unit B3: banner, chip attention state, and the reverse "switch back to browser mode" action. Depends on B1 signals.
- Unit B4: tests for the resolver (B1) and the switch handler (B2).

Sequencing: A1 in parallel throughout. B1 before B2 and B3. B4 after B1 and B2.

## Open questions

None blocking. Name-collision handling on upload (suffix versus server-assigned id) is an implementation detail to settle in the plan; the default is to let the server assign ids and keep client names as-is.
