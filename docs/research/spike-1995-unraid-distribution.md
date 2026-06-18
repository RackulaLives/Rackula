# Spike #1995: Unraid distribution architecture (Community App vs Plugin)

**Date:** 2026-06-08 **Milestone:** M02 -- LXC Release & Stability **Feeds:** #1317 (Submit Rackula as Unraid Community App) **Status:** Complete

Research files:

- `docs/research/1995-codebase.md` - Rackula container/deploy/auth ground truth
- `docs/research/1995-external.md` - Unraid CA workflow, XML schema, multi-container patterns
- `docs/research/1995-patterns.md` - synthesis with secure-coding and devils-advocate lenses, full XML skeletons

---

## Executive summary

Distribute Rackula on Unraid as **Community Applications (CA) Docker templates**, using a **two-template** model: a `rackula` frontend template (always installed) plus an optional `rackula-api` template for server-side persistence and auth. A native Unraid Plugin (`.plg`) is rejected: it grants a web-facing app full host access, must survive every Unraid OS upgrade, and carries a higher moderation bar for zero packaging benefit on an app that already ships as a container.

The technical work is small (author two XML templates that wrap the existing images, unchanged). The real costs are a handful of Unraid-specific footguns the templates must defend against, plus standing human/process commitments (a forum support thread, a template repo) that #1317 currently under-scopes.

**One hard prerequisite surfaced:** CA submission requires an Unraid forum support thread, which needs a forum account in good standing. The research did not establish that RackulaLives has one. This must be resolved before submission and is tracked as a separate workstream below.

---

## Why CA Docker template, not Plugin

| Model | Fit for Rackula |
| --- | --- |
| CA Docker template | Correct. Rackula already ships container images with healthchecks and OCI labels. CA wraps them in a one-click install with no app changes. |
| Plugin (`.plg`) | Wrong. Full host filesystem access for a web app, must track Unraid OS releases, higher trust bar, Unraid-only, re-implements install/upgrade the container runtime already provides. Official Unraid guidance: use containers whenever you can; reserve plugins for OS-level integration Rackula does not need. |

CA installs exactly one container per template (no Compose/stack primitive). That single rule is the pivot for everything below.

## Why two templates, not one

Rackula's API is genuinely optional. The frontend image runs standalone with `RACKULA_AUTH_MODE=none` and no volume; the SPA persists layouts in the browser. The Bun API adds server-side storage, cross-device sync, and login. Because CA is one-container-per-template, an optional second container maps to a second optional template. This matches the proven ecosystem pattern for frontend-plus-backend apps (Homelabarr, KitchenOwl-split).

Alternatives considered and rejected:

- One combined fat image: requires a net-new image running nginx and Bun under a process supervisor. Doubles build/patch/CVE surface and bakes in the API for users who do not want it. Contradicts the project's simplicity-first philosophy. No such image exists today.
- Frontend-only template plus compose docs: viable hybrid fallback (see workstreams), but leaves point-and-click Unraid users with no in-Apps way to add persistence.

The common case stays trivial: install `rackula`, accept defaults, open the WebUI. One container, zero secrets, one click. The second template only appears for users who deliberately want persistence or auth.

Full annotated XML skeletons for both templates are in `1995-patterns.md`.

---

## Security findings (must shape the templates)

These come from the secure-coding lens and are the difference between a safe listing and a footgun.

1. Default `RACKULA_AUTH_MODE=none` is acceptable for Unraid's trusted-LAN model, but the frontend Overview and support thread must state plainly: safe on a trusted LAN, do not expose to the internet without enabling auth. `none` means anonymous read AND write to the API.
2. Mask all secrets. Unraid stores template values as plaintext XML on the flash drive and shows them in the Edit Container UI. `RACKULA_AUTH_SESSION_SECRET`, `RACKULA_LOCAL_PASSWORD`, and the write tokens get `Mask="true"`.
3. No baked default for the session secret, password, or write token. A shipped default secret would let anyone forge a valid HS256 session cookie against every default install. Leave `Default=""` and document `openssl rand -base64 48`. The API already refuses to start with auth enabled and no secret; the template must not paper over that.
4. Reverse proxy: default `RACKULA_TRUST_PROXY=false`. Document the failure mode where auth-enabled over plain HTTP with trust-proxy off produces a silent login loop (Secure cookies the browser will not return). Behind SWAG/NPM/Traefik with HTTPS, set it true.
5. `/data` permission mismatch: the API runs as UID 1001; Unraid appdata is conventionally nobody:users (99:100). #1317 must pick one fix: document a one-time `chown` (zero-code, ships now) or add PUID/PGID support to the API image (new code, nicer UX). The frontend is stateless and unaffected.
6. Pin image tags (not `:latest`) in the templates so the Apps-tab update prompt is meaningful, and set `<Privileged>false</Privileged>` on both.

## Devils-advocate findings (real-world friction)

- The two-template split will generate some "my layouts don't save" support traffic. Mitigate with naming (`rackula` / `rackula-api`), explicit Overview text, and `<Requires>` text. It is a documentation discipline, not a technical guarantee. Note the failure is narrower than total data loss: the frontend still persists in the browser; what is missing is server-side and cross-device storage.
- Container-name DNS between `rackula` and `rackula-api` is not guaranteed on Unraid's stock `bridge` network (works on user-defined networks). #1317 must verify this on real Unraid; if it fails, the docs need a "create a user-defined Docker network" step. Do not assume the happy path.
- OIDC on a LAN box is a dropdown footgun and its env surface is under-documented. Keep the `none|local|oidc` dropdown but steer users to none/local in the Description; treat OIDC-on-Unraid docs as out of scope for the first listing.
- Maintenance is a standing human cost: a forum thread someone must answer, a template repo to keep in tag-sync, and CA's delisting policy for unmaintained apps. Name an owner or scope down.

---

## What this means for #1317

### Implementation (belongs in #1317)

1. Author `rackula.xml` and `rackula-api.xml` per the skeletons in `1995-patterns.md`.
2. Mask all secrets; no baked defaults for secret/password/write-token.
3. Pin image tags; wire template tag bumps into the release process.
4. `<Privileged>false</Privileged>` on both; `/data` as a required rw path defaulting to `/mnt/user/appdata/rackula`.
5. Defaults `RACKULA_AUTH_MODE=none` and `RACKULA_TRUST_PROXY=false`, each with caveat Descriptions.
6. Guardrail Overview/Description text (LAN-only default, no internet without auth, proxy guidance, API writes as UID 1001).
7. Decide and implement the `/data` permissions story: documented one-time chown or PUID/PGID support.
8. Verify on real Unraid: container-name resolution on the default bridge; add a user-defined-network step to docs if it fails.
9. Confirm a square HTTPS PNG icon exists at a stable raw-GitHub path; add one if not.

### Resolved by this spike

- Distribution model: CA, two templates, no plugin.
- CA workflow: self-hosted template repo, forum thread, submission form, one-container-per-template rule, masked-variable mechanics, icon/proxy/cookie behaviour.
- GitHub account-quality screen: likely met (real org, real history); confirm, do not assume.

### Separate workstreams (not #1317 implementation)

- Create and maintain `RackulaLives/unraid-templates` (hosts the XML, self-referenced via `<TemplateURL>`, tag-synced each release).
- Create the Unraid forum support thread and assign an owner. Standing commitment; CA can delist unmaintained apps. This is the gating prerequisite, not a code task.
- CA submission and moderation cycle (days to weeks, human-gated). Gate on repo, thread, and icon being ready.
- Optional hybrid fallback: if no one can own the forum thread, list only the frontend template in CA and document `docker-compose.persist.yml` for persistence. Hold as the escape hatch.

---

## Sourcing caveat

The rendered `docs.unraid.net` pages are JavaScript-hydrated and returned empty to direct fetch, so some official-docs claims in `1995-external.md` are cited via the indexed search summary of the same canonical URLs rather than a direct page body. The CA forum schema thread and the Selfhosters templating guide provided directly-quotable detail for the XML schema. The forum-account prerequisite and stock-bridge DNS behaviour should be confirmed during #1317 implementation, not taken as settled.
