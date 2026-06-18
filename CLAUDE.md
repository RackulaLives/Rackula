# CLAUDE.md — Rackula

**Project:** Rackula — Rack Layout Designer for Homelabbers
**Version:** 26.5.0

---

## Versioning Policy

We use **Calendar Versioning (CalVer)** with the format `YY.M.MICRO`:

- `YY` = 2-digit year (e.g., `26` for 2026)
- `M` = unpadded month (1–12, e.g., `6` for June, not `06`)
- `MICRO` = release counter within the month, starting at 0

**Examples:** `v26.6.0` (first release in June 2026), `v26.6.1` (second release that month),
`v26.7.0` (first release in July 2026, month rollover resets MICRO to 0).

**MICRO rule:**

- Same month as the latest tag → MICRO increments (`v26.6.0` → `v26.6.1`)
- Different month → MICRO resets to 0 (`v26.6.2` → `v26.7.0`)

**CalVer and milestones are decoupled:** the version reflects the ship date, not the plan
date. Multiple milestones may ship in the same month. See the milestone cadence design:
[`docs/superpowers/specs/2026-06-01-milestone-cadence-reframe-design.md`](docs/superpowers/specs/2026-06-01-milestone-cadence-reframe-design.md).

**Dual-artifact policy:**

- The Rackula **app** uses CalVer (`v26.6.0`)
- Any future published packages (e.g., `@rackula/core`) would use **SemVer** independently

**Release Process:**

Use the `/release` skill to create releases with proper changelog entries:

```bash
/release           # Auto-compute next CalVer version
/release 26.7.0    # Explicit version
```

The `/release` skill will:

1. Compute the next version using `scripts/next-version.sh`
2. Gather changes since last release (commits, PRs, issues)
3. Draft a changelog entry in Keep a Changelog format
4. Preview and confirm with you
5. Update CHANGELOG.md, bump version, tag, and push

**Important:** CHANGELOG.md is the source of truth. GitHub releases are auto-generated
from changelog entries. The release workflow will fail if no changelog entry exists.

**Tag format:** Always use `v` prefix (e.g., `v26.6.0`, not `26.6.0`)

**Current milestones:**

- `M01 -- LXC Build & Hardening` (complete)
- `M02 -- LXC Release & Stability` (in progress)
- `M03 -- Data Format & Interop` (next)
- `M04 -- Type Safety, Decomposition & Stability` (planned)

---

## Documentation

Documentation is organized by purpose:

```text
docs/
├── ARCHITECTURE.md          → High-level overview and entry points
├── deployment/              → Deployment-specific docs (auth, hosting)
├── guides/
│   ├── TESTING.md           → Testing patterns and commands
│   └── ACCESSIBILITY.md     → A11y compliance checklist
├── reference/
│   ├── SPEC.md              → Technical overview and design principles
│   ├── BRAND.md             → Design system quick reference
│   └── GITHUB-WORKFLOW.md   → GitHub Issues workflow
├── planning/
│   └── ROADMAP.md           → Version planning
├── plans/                   → Implementation plans (YYYY-MM-DD-kebab-case.md)
├── research/                → Research spikes by issue ({ISSUE}-{type}.md)
├── spikes/                  → Active spike investigations
└── superpowers/
    └── specs/               → Brainstorming design specs (created on first use)
```

**Start here:** `docs/ARCHITECTURE.md` for codebase overview.
**Reference:** `docs/reference/SPEC.md` for technical overview and design principles.

### Design Documents

Project overrides for Superpowers v5 document locations:

| Document Type         | Location                  | Naming Convention              |
| --------------------- | ------------------------- | ------------------------------ |
| Specs (brainstorming) | `docs/superpowers/specs/` | `YYYY-MM-DD-<topic>-design.md` |
| Plans (execution)     | `docs/plans/`             | `YYYY-MM-DD-<feature-name>.md` |
| Research spikes       | `docs/research/`          | `{ISSUE}-{type}.md`            |

Plans use `docs/plans/` (project override — v5 defaults to `docs/superpowers/plans/`).

## GitHub Issues Workflow

GitHub Issues is the source of truth for task tracking. Issue flow is
tracked via the [project board](https://github.com/orgs/RackulaLives/projects/2):
Backlog, Next Up, In Progress, In Review, Done.

**Querying work:**

```bash
# Find next task (issues in active milestone, Next Up status)
gh issue list --milestone "M02 -- LXC Release & Stability" --state open

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
coderabbit --agent --type uncommitted

# Review committed changes on current branch
coderabbit --agent --type committed
```

Always use `--agent` — provides concise, token-efficient output optimized for Claude Code.

### PR Monitoring

```bash
# After creating PR, wait for CodeRabbit
gh pr checks <number> --watch

# View CodeRabbit's review comments
gh pr view <number> --comments
```

**Important:** Never use `gh pr merge` until CodeRabbit has approved the PR.

## Development Philosophy

**Greenfield approach:** Do not use migration or legacy support concepts in this project.
Implement features as if they are the first and only implementation.

**Simplicity first:**

- Avoid over-engineering; only implement what's asked
- Simple solutions over abstractions; three similar lines > premature abstraction
- Delete unused code completely (no `_unused` vars)

**No backwards compatibility hacks:**

- No renaming to `_unusedVar`
- No re-exporting removed types
- No `// removed` comments
- If unused, delete it

**File operations:**

- ALWAYS prefer editing existing files over creating new ones
- NEVER create documentation files unless explicitly requested
- NEVER add comments to code you didn't change

**Writing style (all user-facing text):**

- No em dashes (`—`), en dashes (`–`), or smart quotes. Use plain colons, commas, periods, and hyphens.
- No emoji in feature lists, headings, or documentation.
- No bold emphasis in list items. Bold is for column headers and UI labels only.
- Be succinct. Say what the thing does, not how amazing it is.

## Git Conventions

- Commit message format: `type: description`
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
- Branch naming: `fix/<issue>-desc`, `feat/<issue>-desc`
- Always include `Co-Authored-By` for AI assistance

---

## Autonomous Mode

When given an overnight execution prompt:

**Execution model:** Plan execution uses subagent-driven development. Stopping conditions
below apply to the orchestrating session, not individual subagent turns.

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

### Invariants

- Rail positions are whole-U integers; sub-U devices mount in containers; never reintroduce fractional rail positions. See [SPEC.md, Mounting Model](docs/reference/SPEC.md#mounting-model).

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

**First, decide if tests are needed.** Ask: "What behavior can I test that TypeScript doesn't already verify?"

Skip tests entirely for:

- **Visual-only components** (icons, decorative SVGs, layout wrappers)
- **Thin wrappers** with no logic of their own
- **Components where the only possible test is "renders without throwing"**

If an issue's Acceptance Criteria requests tests for something in this list, the testing
policy overrides the AC. Don't write low-value tests just because an issue asked for them.

**If tests ARE needed**, follow TDD:

1. Write tests FIRST
2. Run tests (should fail)
3. Implement to pass
4. Commit

**What to test (high value):**

These are the ONLY categories worth testing. If your component doesn't fit one of these, it probably doesn't need tests:

- Complex logic (collision detection, coordinate math, state machines)
- User-facing behavior (can user place device? does undo work?)
- Error paths and edge cases
- Integration between components

**What NOT to test (low value):**

- Static data (brand packs, device libraries) — schema validates this
- Hardcoded counts (`expect(devices).toHaveLength(68)`) — breaks on intentional changes
- Properties already validated by Zod schemas
- Simple getters, trivial functions, pass-through code

**The Zero-Change Rule:** Adding a device to a brand pack should require ZERO test file
changes. If tests break, they're testing data, not behavior.

**Trust the Schema:** If `DeviceTypeSchema.parse()` passes, don't re-test individual
fields. One schema validation test covers all devices.

See `docs/guides/TESTING.md` for comprehensive testing guidelines.

---

## Testing Rules (MANDATORY)

_These rules apply when you've decided tests ARE needed (see TDD Protocol above)._

**BEFORE writing any test, ask:** "Would this test break if I made a legitimate code change?"
If yes, **DON'T WRITE IT.**

### NEVER Write Tests That

❌ **Assert exact array lengths on data arrays**

```typescript
// BAD: Breaks when you add a device to brand pack
expect(dellDevices).toHaveLength(68);

// GOOD: Test existence, not count
expect(dellDevices.length).toBeGreaterThan(0);
```

**Exception:** Behavioral invariants (deduplication, pagination) may use exact lengths
with `eslint-disable-next-line` and justification:

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

### ALWAYS Write Tests That

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

**Why these rules exist:** The project had 136 unit test files (46k LOC) causing OOM
crashes and high token usage. We deleted 78 low-value files (57% reduction) to fix this.
ESLint rules prevent re-accumulation by blocking the specific anti-patterns that caused
bloat.

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

**Lockfile issues:** If CI fails with "package.json and package-lock.json are out of
sync", run `npm run refresh-lockfile` to regenerate the lockfile from a clean state.

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
| `Ctrl+H`       | Share                          |
| `Ctrl+D`       | Duplicate selected device/rack |
| `I`            | Toggle display mode            |
| `F`            | Fit all                        |
| `Delete`       | Delete selection               |
| `?`            | Show help                      |
| `Escape`       | Clear selection / close        |
| `↑↓`           | Move device in rack            |

---

## Skill Routing

This section is the cloud-safe restatement of the superpowers bootstrap. In local sessions
a SessionStart hook injects the using-superpowers skill automatically. In claude.ai/code
cloud sessions that hook may not fire, because cloud does not auto-install plugins from
committed settings (a known open issue, anthropics/claude-code#63028). To install the
plugins in cloud, paste the contents of `.claude/cloud-setup.sh` into the environment Setup
script field.
The core rule is restated here, where it is always read.

Core rule: if there is even a small chance a skill applies, invoke it via the Skill tool
before responding, including before asking clarifying questions. Process skills such as
`/superpowers:brainstorming` and `/superpowers:systematic-debugging` come before
implementation skills.

**Before starting any task, check if a skill applies:**

| Task Type                 | Skill                                         | Why                                     |
| ------------------------- | --------------------------------------------- | --------------------------------------- |
| Bug/issue investigation   | `/superpowers:systematic-debugging`           | Prevents guessing, forces evidence      |
| New feature or component  | `/superpowers:brainstorming`                  | Explores requirements before code       |
| Multi-step implementation | `/superpowers:writing-plans`                  | Plans auto-route to subagent execution  |
| Working on GitHub issue   | `/dev-issue <number>`                         | Full workflow with worktree isolation   |
| Research question         | `/research-spike <number>`                    | Structured investigation                |
| Finishing a branch        | `/superpowers:finishing-a-development-branch` | Merge/PR decision flow                  |
| Worktree cleanup needed   | `/worktree-cleanup`                           | List and remove stale worktrees         |
| Debugging with context    | `/debug-with-memory`                          | Memory-assisted systematic debugging    |
| User-facing documentation | `/technical-writing`                          | Enforces verification, style, structure |

**Default rule:** If uncertain, invoke `/superpowers:brainstorming` first.

---

## Repository

| Location    | URL                                              |
| ----------- | ------------------------------------------------ |
| Production  | <https://count.racku.la/>                        |
| Dev/Preview | <https://d.racku.la/>                            |
| Primary     | <https://github.com/RackulaLives/Rackula>        |
| Issues      | <https://github.com/RackulaLives/Rackula/issues> |

## Deployment

Two environments with different deployment triggers:

| Environment | URL            | Trigger        | Infrastructure |
| ----------- | -------------- | -------------- | -------------- |
| **Dev**     | d.racku.la     | Push to `main` | GitHub Pages   |
| **Prod**    | count.racku.la | Git tag `v*`   | VPS (Docker)   |

### Dev Deployment

Automatically deploys on code pushes to `main` (after lint/tests pass):

```bash
git push origin main  # Triggers: lint → test → build → deploy to GitHub Pages
```

The Deploy Dev workflow is path-filtered: it runs only when the push changes app
inputs (`api/**`, `src/**`, `deploy/**`, `assets/**`, `static/**`, `login.html`,
the lockfiles, build configs, `index.html`), and a trailing `!**/*.md` excludes
markdown anywhere. Docs-only pushes (markdown-only, or paths outside that list
such as `.claude/**`, `docs/**`, `.github/**`) do not trigger a deploy.

Do not watch or wait for a dev deploy after a docs-only push: no Deploy Dev run
is queued, so there is nothing to go green. To confirm it was skipped, check that
the Deploy Dev run is absent for the commit:
`gh api "repos/RackulaLives/Rackula/actions/runs?head_sha=$(git rev-parse HEAD)"`.

### Production Deployment

Deploys when a version tag is pushed:

```bash
/release              # Auto-computes next CalVer version, tags, and pushes
```

### Workflow

1. Develop locally (`npm run dev`)
2. Push to `main` → auto-deploys to d.racku.la
3. Test on dev environment
4. Tag release → auto-deploys to count.racku.la
