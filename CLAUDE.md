# CLAUDE.md — Rackula

**Project:** Rackula — Rack Layout Designer for Homelabbers
**Version:** 0.6.16

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

### CodeRabbit CLI (Local Review)

Run local review before pushing to catch issues early:

```bash
# Review uncommitted changes (token-efficient output for AI)
coderabbit --prompt-only --type uncommitted

# Review committed changes on current branch
coderabbit --prompt-only --type committed
```

Always use `--prompt-only` — provides concise, token-efficient output optimized for Claude Code.

### PR Monitoring

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

### bits-ui Components

When implementing bits-ui components:

- Fetch docs: `WebFetch https://bits-ui.com/docs/components/{name}/llms.txt`
- Available: dialog, tabs, accordion, tooltip, popover, select, combobox
- Validate with Svelte MCP: `svelte-autofixer` tool
- Follow existing wrapper patterns in `src/lib/components/ui/`

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

---

## Testing Rules (MANDATORY)

**BEFORE writing any test, ask:** "Would this test break if I made a legitimate code change?"
If yes, **DON'T WRITE IT.**

### NEVER Write Tests That:

❌ **Assert exact array lengths on data arrays**

```typescript
// BAD: Breaks when you add a device to brand pack
expect(dellDevices).toHaveLength(68);

// GOOD: Test existence, not count
expect(dellDevices.length).toBeGreaterThan(0);
```

**Exception:** Behavioral invariants (deduplication, pagination) may use exact lengths with `eslint-disable-next-line` and justification:

```typescript
// GOOD: Behavioral invariant with justification
// eslint-disable-next-line no-restricted-syntax -- deduplication should leave exactly 2 unique devices
expect(deduplicateDevices([device1, device1, device2])).toHaveLength(2);
```

❌ **Assert hardcoded color values**

```typescript
// BAD: Breaks on design token changes
expect(element).toHaveStyle("color: #4A7A8A");
expect(color).toBe("#FFFFFF");
```

❌ **Check if a function exists**

```typescript
// BAD: Zero value, TypeScript already does this
expect(typeof placeholderDeviceType).toBe("function");
```

❌ **Assert CSS class names**

```typescript
// BAD: Breaks on refactoring, tests implementation details
expect(button).toHaveClass("primary");
```

❌ **Test that a component renders**

```typescript
// BAD: If it compiles in TypeScript, it renders
expect(container.querySelector(".rack")).toBeInTheDocument();
```

❌ **Test component structure/DOM queries**

```typescript
// BAD: Fragile, tests implementation not behavior
const header = container.querySelector(".panel-header");
expect(header).toHaveTextContent("Settings");
```

❌ **Duplicate schema validation**

```typescript
// BAD: DeviceTypeSchema already validates this
expect(device.slug).toBeDefined();
expect(typeof device.u_height).toBe("number");
```

### ALWAYS Write Tests That:

✅ **Test user-visible behavior**

```typescript
// GOOD: Tests what user experiences
it("user can place a device in rack", () => {
  store.placeDevice("server-slug", 10);
  expect(store.rack.devices).toContain(
    expect.objectContaining({ slug: "server-slug" }),
  );
});
```

✅ **Test core algorithms and edge cases**

```typescript
// GOOD: Complex logic with many edge cases
it("detects collision when devices overlap", () => {
  // ... collision detection test
});
```

✅ **Use factories from src/tests/factories.ts**

```typescript
// GOOD: Shared, maintainable test data
import { createTestDeviceType, createTestRack } from "./factories";
const device = createTestDeviceType({ u_height: 2 });
```

✅ **Follow patterns in KEEP tests**

```typescript
// GOOD: Store tests, core algorithms, E2E tests
// Check src/tests/*-store.test.ts for examples
```

### Enforcement

**ESLint hard-blocks:**

- `querySelector()` / DOM node access in tests
- `toHaveClass()` assertions
- `toHaveLength(literal)` exact length assertions
- Hardcoded color assertions

These rules are enforced by ESLint on every commit and will fail the build if violated.

**Why these rules exist:** The project had 136 unit test files (46k LOC) causing OOM crashes and high token usage. We deleted 78 low-value files (57% reduction) to fix this. ESLint rules prevent re-accumulation by blocking the specific anti-patterns that caused bloat.

---

### Commands

```bash
npm run dev          # Dev server
npm run test         # Unit tests (watch)
npm run test:run     # Unit tests (CI)
npm run test:e2e     # Playwright E2E
npm run build        # Production build
npm run lint         # ESLint check
npm run refresh-lockfile  # Regenerate package-lock.json from scratch
```

**Lockfile issues:** If CI fails with "package.json and package-lock.json are out of sync", run `npm run refresh-lockfile` to regenerate the lockfile from a clean state.

### Debug Logging

Uses the `debug` npm package with namespace filtering.

**Enable in browser console:**

```javascript
localStorage.debug = "rackula:*"; // All logs
localStorage.debug = "rackula:layout:*"; // Layout module only
localStorage.debug = "rackula:*,-rackula:canvas:*"; // All except canvas
```

**Namespaces:**

| Namespace                  | Purpose               |
| -------------------------- | --------------------- |
| `rackula:layout:state`     | Layout store state    |
| `rackula:layout:device`    | Device placement/move |
| `rackula:canvas:transform` | Pan/zoom calculations |
| `rackula:canvas:panzoom`   | Panzoom lifecycle     |
| `rackula:cable:validation` | Cable validation      |
| `rackula:app:mobile`       | Mobile interactions   |

**Usage:**

```typescript
import { layoutDebug } from "$lib/utils/debug";
layoutDebug.device("placed device %s at U%d", slug, position);
```

### Keyboard Shortcuts

| Key            | Action                         |
| -------------- | ------------------------------ |
| `Ctrl+Z`       | Undo                           |
| `Ctrl+Shift+Z` | Redo                           |
| `Ctrl+Y`       | Redo (alternative)             |
| `Ctrl+S`       | Save layout                    |
| `Ctrl+O`       | Load layout                    |
| `Ctrl+E`       | Export                         |
| `Ctrl+D`       | Duplicate selected device/rack |
| `I`            | Toggle display mode            |
| `F`            | Fit all                        |
| `Delete`       | Delete selection               |
| `?`            | Show help                      |
| `Escape`       | Clear selection / close        |
| `↑↓`           | Move device in rack            |

---

## Skill Routing

**Before starting any task, check if a skill applies:**

| Task Type                 | Skill                                          | Why                                   |
| ------------------------- | ---------------------------------------------- | ------------------------------------- |
| Bug/issue investigation   | `/superpowers:systematic-debugging`            | Prevents guessing, forces evidence    |
| New feature or component  | `/superpowers:brainstorming`                   | Explores requirements before code     |
| Multi-step implementation | `/superpowers:writing-plans` then `/dev-issue` | Plan first, execute with discipline   |
| Working on GitHub issue   | `/dev-issue <number>`                          | Full workflow with worktree isolation |
| Research question         | `/research-spike <number>`                     | Structured investigation              |
| Finishing a branch        | `/superpowers:finishing-a-development-branch`  | Merge/PR decision flow                |
| Worktree cleanup needed   | `/worktree-cleanup`                            | List and remove stale worktrees       |
| Debugging with context    | `/debug-with-memory`                           | Memory-assisted systematic debugging  |

**Default rule:** If uncertain, invoke `/superpowers:brainstorming` first.

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
