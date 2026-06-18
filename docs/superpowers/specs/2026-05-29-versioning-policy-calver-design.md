---
created: 2026-05-29
issue: 1315
status: decided
---

# Versioning Policy Decision — CalVer for the App, SemVer for Packages

## Context

Rackula currently uses pre-1.0 SemVer (`0.MINOR.PATCH`). Issue [#1315](https://github.com/RackulaLives/Rackula/issues/1315) raised switching to CalVer to remove the friction of deciding minor-vs-patch on every release. The original analysis assumed _"Rackula is an application, no downstream consumers need compatibility signals."_

That premise is now in question: the [#1758 NPM library feasibility spike](../../research/1758-npm-library-feasibility.md) (completed 2026-05-28) recommends eventually publishing **`@rackula/core`** to npm + JSR. A published package on those registries effectively _must_ follow SemVer, because consumer version ranges (`^`/`~`), Dependabot, and JSR tooling all assume it. The library is **still exploratory** (no commitment), so the policy must not foreclose it.

**Goals (confirmed with maintainer):** (1) eliminate the minor-vs-patch decision, and (2) have the version itself convey recency.

## Decision

**Version by artifact, because the version number is a message to a specific reader:**

| Artifact | Audience | Cares about | Scheme | Example |
| --- | --- | --- | --- | --- |
| **Rackula app** (web / Docker / LXC) | end users | recency | **CalVer `YY.M.MICRO`** | `v26.5.0`, `v26.5.1`, `v26.6.0` |
| **`@rackula/core`** (if/when published) | developers | compatibility | **SemVer** | `core/v0.4.0` |

The app and the library are **two different artifacts for two different people**, so giving them two version schemes is not a contradiction — it is the standard monorepo pattern (any project using `changesets`/`release-please` versions a private app separately from its published packages). This is **one static rule**, not a "revisit-when-X" conditional.

### App format: `YY.M.MICRO`

- `YY` = two-digit year (`26`). `M` = month, **unpadded** (`5`, `12`). `MICRO` = release counter within the month.
- **MICRO rule:** same calendar month as the last release → `MICRO++`; new month → `MICRO = 0`. This is fully mechanical — no human judgement on bump type, ever.
- **Month MUST be unpadded.** SemVer forbids leading zeroes in numeric identifiers, so `26.05.0` is _invalid_ semver and breaks tooling; `26.5.0` is valid-semver-_shaped_. Keeping the shape valid is the entire reason this 3-segment format was chosen over the 4-segment `YY.MM.DD.MICRO` originally proposed in #1315.
- Ordering stays monotonic across the migration: `0.10.0 → 26.5.0` only ever increases, so npm/semver comparison and "is this newer?" checks keep working.

## Why not the alternatives

- **Full CalVer `YY.MM.DD.MICRO`** (the #1315 proposal): 4 segments are not valid semver and risk breaking `package.json`/npm/CI even for a private package; also contaminates the future library option. Rejected.
- **Stay SemVer + patch-by-default:** solves goal 1 but not goal 2 (no recency in the number). Rejected as insufficient against the "both equally" goal.
- **Keep one shared version for app + library:** forces a single scheme onto two audiences; this is the actual source of CalVer-vs-SemVer conflict. Avoided by decoupling.

## Consequences

### What changes when implemented

- **`/release` skill** — compute the version from the date + month-counter instead of a semver bump argument.
- **`package.json`** `version` → e.g. `26.5.0`.
- **CI** — the `v*` tag → prod-deploy trigger continues to work (CalVer tags are still `v26.5.0`). A future `@rackula/core` uses a **separate tag namespace** (`core/v*`) so package releases don't trip the app's deploy.
- **`CHANGELOG.md`** — Keep a Changelog format unchanged; headings become `## [26.5.0] - 2026-05-29`.
- **`CLAUDE.md`** — the Versioning Policy section is rewritten for CalVer.

### Knock-on effects

- The **`v1.0.0` milestone name** no longer maps to a version. Milestones should be named by **theme or target month** (e.g. "26.6 — LXC release"), not by semver. This unblocks the milestone-roadmap naming question.
- The **"0.x = unstable API" signal is dropped** — but that signal only matters to code consumers, which the app does not have. No real loss.

### Migration timing

The **decision stands now.** The retooling lands at a clean release boundary; the **LXC release is the designated "first CalVer release"** (`v26.<month>.0`), which is also a natural release-pipeline touch point — satisfying both the "anchor it to a real release" and the "do it when migration is nearly free" considerations from #1315. If the LXC release slips, the next minor-worthy release becomes the anchor instead.

## Resolution of #1315

> **Decided** — Rackula app adopts CalVer `YY.M.MICRO`; SemVer is reserved for any future published packages (`@rackula/core`). Implement at the LXC release boundary. Close #1315 referencing this decision record.
