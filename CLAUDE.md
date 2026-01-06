# CLAUDE.md — Rackula

**Project:** Rackula — Rack Layout Designer for Homelabbers
**Version:** 0.5.0

---

## Versioning Policy

We follow [Cargo semver](https://doc.rust-lang.org/cargo/reference/semver.html) conventions:

**Pre-1.0 semantics (current):**

- `0.MINOR.patch` — minor version acts like major (breaking changes allowed)
- `0.minor.PATCH` — bug fixes and small improvements only
- Pre-1.0 means "API unstable, in active development"

**When to bump versions:**

| Change Type        | Version Bump | Example                                                    |
| ------------------ | ------------ | ---------------------------------------------------------- |
| Feature milestone  | `0.X.0`      | New major capability (e.g., multi-rack, new export format) |
| Bug fixes / polish | `0.x.Y`      | Only when releasing to users, not every commit             |
| Breaking changes   | `0.X.0`      | Format changes, removed features                           |

**Workflow:**

- **Don't tag every commit** — accumulate changes on `main`
- **Tag releases** when there's a coherent set of changes worth announcing
- **Use pre-release tags** for development checkpoints: `v0.5.0-alpha.1`, `v0.5.0-beta.1`
- **Batch related fixes** into single patch releases

**Release Process:**

Use the `/release` skill to create releases with proper changelog entries:

```bash
/release patch   # Bug fixes: 0.5.8 → 0.5.9
/release minor   # Features: 0.5.9 → 0.6.0
/release major   # Breaking: 0.6.0 → 1.0.0
/release 1.0.0   # Explicit version
```

The `/release` skill will:

1. Gather changes since last release (commits, PRs, issues)
2. Draft a changelog entry in Keep a Changelog format
3. Preview and confirm with you
4. Update CHANGELOG.md, bump version, tag, and push

**Important:** CHANGELOG.md is the source of truth. GitHub releases are auto-generated from changelog entries. The release workflow will fail if no changelog entry exists.

**Tag format:** Always use `v` prefix (e.g., `v0.5.8`, not `0.5.8`)

**Current milestones:**

- `0.5.x` — Unified type system, NetBox-compatible data model
- `1.0.0` — Production-ready, stable API

---

## Recent Changes

### v0.5.0 (Current)

**v0.5.0** — Type system consolidation

- Unified on storage types only (`DeviceType`, `PlacedDevice` with `device_type`)
- Removed deprecated UI types (`Device`, `UIPlacedDevice` with `libraryId`)
- Removed adapter layer and deprecated store functions
- NetBox-compatible field naming (snake_case: `u_height`, `device_type`, `form_factor`)
- Cleaned up legacy comments throughout codebase
- Updated documentation (SPEC.md, ROADMAP.md)

### v0.4.10

**v0.4.10** — View reset on rack resize, toolbar polish

- Auto-reset view when resizing rack height in EditPanel
- View now centers on rack after height changes (preset buttons or numeric input)
- Toolbar brand click only opens hamburger menu when in hamburger mode (< 1024px)
- Brand area styled as button with border only in hamburger mode

### v0.4.9

**v0.4.9** — Airflow visualization

- Edge stripe + arrow airflow indicators (4 types: passive, front-to-rear, rear-to-front, side-to-rear)
- Conflict detection with orange border highlighting
- Toggle with 'A' key or toolbar button
- Airflow indicators in image/PDF exports
- Fixed multi-device selection bug

### v0.4.x

**v0.4.8** — Toolbar drawer fix, z-index tokens

- Moved toolbar drawer to right side (was overlapping device library)
- Added z-index design tokens (`--z-sidebar`, `--z-drawer`, `--z-modal`, `--z-toast`)

**v0.4.6–v0.4.7** — Load/save fixes

- Reset view to center rack after loading layout
- Fixed u_height schema to allow 0.5U devices

**v0.4.3–v0.4.5** — PDF export, toolbar polish

- PDF export (US Letter, auto orientation)
- Hamburger menu for narrow viewports
- File picker browser compatibility fixes

**v0.4.1–v0.4.2** — Design token audit, responsive toolbar

- Replaced hardcoded CSS with design tokens
- Added responsive hamburger menu

### v0.4.0 (BREAKING)

- Removed v0.1/v0.2 legacy format support — only `.Rackula.zip` (YAML) format
- Code cleanup: removed dead code, unused tokens, redundant dependencies

### v0.3.x Features

- Undo/Redo with Ctrl+Z / Ctrl+Shift+Z
- YAML folder-based `.Rackula.zip` archive format
- 11 device categories, device images (front/rear)
- Label/image display mode toggle
- 10" and 19" rack width options
- Bundled export with metadata
- Single-rack mode, Zod schema validation

## Documentation

Documentation is organized by purpose:

```
docs/
├── ARCHITECTURE.md          → High-level overview and entry points
├── guides/
│   ├── TESTING.md           → Testing patterns and commands
│   └── ACCESSIBILITY.md     → A11y compliance checklist
├── reference/
│   ├── SPEC.md              → Technical specification (authoritative)
│   ├── BRAND.md             → Design system quick reference
│   └── GITHUB-WORKFLOW.md   → GitHub Issues workflow
└── planning/
    └── ROADMAP.md           → Version planning
```

**Start here:** `docs/ARCHITECTURE.md` for codebase overview.
**Reference:** `docs/reference/SPEC.md` for complete technical specification.

## GitHub Issues Workflow

GitHub Issues is the source of truth for task tracking.

**Querying work:**

```bash
# Find next task
gh issue list --label ready --milestone v0.6.0 --state open

# Get issue details
gh issue view <number>
```

**After completing an issue:**

```bash
gh issue close <number> --comment "Implemented in <commit-hash>"
```

**Issue structure provides:**

- Acceptance Criteria → Requirements checklist
- Technical Notes → Implementation guidance
- Test Requirements → TDD test cases

See `docs/reference/GITHUB-WORKFLOW.md` for full workflow documentation.

## CodeRabbit Integration

CodeRabbit provides AI code review on every PR. **Claude Code must wait for CodeRabbit approval before merging.**

### PR Workflow

1. Create PR with `gh pr create`
2. **Wait for CodeRabbit review** (7-30 min) — check with `gh pr checks <number>`
3. If CodeRabbit requests changes:
   - Read the CodeRabbit comments
   - Address each issue in follow-up commits
   - Push changes and wait for re-review
4. Only merge after CodeRabbit approves

### CodeRabbit CLI (Optional Local Review)

For pre-push review of uncommitted changes:

```bash
# Install CLI (one-time)
curl -fsSL https://cli.coderabbit.ai/install.sh | sh
coderabbit auth login

# Run local review before pushing
coderabbit --prompt-only --type uncommitted
```

### Commands for Claude Code

When implementing features that will be reviewed:

```bash
# After creating PR, wait for CodeRabbit
gh pr checks <number> --watch

# View CodeRabbit's review comments
gh pr view <number> --comments
```

**Important:** Never use `gh pr merge` until CodeRabbit has approved the PR.

## Development Philosophy

**Greenfield approach:** Do not use migration or legacy support concepts in this project. Implement features as if they are the first and only implementation.

---

## Autonomous Mode

When given an overnight execution prompt:

- You have explicit permission to work without pausing between prompts
- Do NOT ask for review or confirmation mid-session
- Do NOT pause to summarise progress until complete
- Continue until: all prompts done, test failure after 2 attempts, or genuine ambiguity requiring human decision
- I will review asynchronously via git commits and session-report.md

**Stopping conditions (ONLY these):**

1. All prompts in current `prompt_plan.md` marked complete
2. Test failure you cannot resolve after 2 attempts
3. Ambiguity that genuinely requires human input (document in `blockers.md`)

If none of those conditions are met, proceed immediately to the next prompt.

---

## Quick Reference

### Tech Stack

- Svelte 5 with runes (`$state`, `$derived`, `$effect`)
- TypeScript strict mode
- Vitest + @testing-library/svelte + Playwright
- CSS custom properties (design tokens in `src/lib/styles/tokens.css`)
- SVG rendering

### Svelte 5 Runes (Required)

```svelte
<!-- ✅ CORRECT -->
<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>

<!-- ❌ WRONG: Svelte 4 stores -->
<script lang="ts">
  import { writable } from 'svelte/store';
</script>
```

### TDD Protocol

1. Write tests FIRST
2. Run tests (should fail)
3. Implement to pass
4. Commit

**What to test (high value):**

- Complex logic (collision detection, coordinate math, state machines)
- User-facing behavior (can user place device? does undo work?)
- Error paths and edge cases
- Integration between components

**What NOT to test (low value):**

- Static data (brand packs, device libraries) — schema validates this
- Hardcoded counts (`expect(devices).toHaveLength(68)`) — breaks on intentional changes
- Properties already validated by Zod schemas
- Simple getters, trivial functions, pass-through code

**The Zero-Change Rule:** Adding a device to a brand pack should require ZERO test file changes. If tests break, they're testing data, not behavior.

**Trust the Schema:** If `DeviceTypeSchema.parse()` passes, don't re-test individual fields. One schema validation test covers all devices.

See `docs/guides/TESTING.md` for comprehensive testing guidelines.

### Commands

```bash
npm run dev          # Dev server
npm run test         # Unit tests (watch)
npm run test:run     # Unit tests (CI)
npm run test:e2e     # Playwright E2E
npm run build        # Production build
npm run lint         # ESLint check
```

### Keyboard Shortcuts

| Key            | Action                  |
| -------------- | ----------------------- |
| `Ctrl+Z`       | Undo                    |
| `Ctrl+Shift+Z` | Redo                    |
| `Ctrl+Y`       | Redo (alternative)      |
| `Ctrl+S`       | Save layout             |
| `Ctrl+O`       | Load layout             |
| `Ctrl+E`       | Export                  |
| `I`            | Toggle display mode     |
| `F`            | Fit all                 |
| `Delete`       | Delete selection        |
| `?`            | Show help               |
| `Escape`       | Clear selection / close |
| `↑↓`           | Move device in rack     |

---

## Repository

| Location    | URL                                            |
| ----------- | ---------------------------------------------- |
| Production  | https://count.racku.la/                        |
| Dev/Preview | https://d.racku.la/                            |
| Primary     | https://github.com/RackulaLives/Rackula        |
| Issues      | https://github.com/RackulaLives/Rackula/issues |

## Deployment

Two environments with different deployment triggers:

| Environment | URL            | Trigger        | Infrastructure |
| ----------- | -------------- | -------------- | -------------- |
| **Dev**     | d.racku.la     | Push to `main` | GitHub Pages   |
| **Prod**    | count.racku.la | Git tag `v*`   | VPS (Docker)   |

### Dev Deployment

Automatically deploys on every push to `main` (after lint/tests pass):

```bash
git push origin main  # Triggers: lint → test → build → deploy to GitHub Pages
```

### Production Deployment

Deploys when a version tag is pushed:

```bash
npm version patch     # Creates v0.5.9 tag
git push && git push --tags  # Triggers: Docker build → push to ghcr.io → VPS pulls and runs
```

### Workflow

1. Develop locally (`npm run dev`)
2. Push to `main` → auto-deploys to d.racku.la
3. Test on dev environment
4. Tag release → auto-deploys to count.racku.la

**Analytics:** Umami (self-hosted at `t.racku.la`) - privacy-focused, no cookies. Separate website IDs for dev and prod environments. Configure via `VITE_UMAMI_*` env vars. Analytics utility at `src/lib/utils/analytics.ts`.
