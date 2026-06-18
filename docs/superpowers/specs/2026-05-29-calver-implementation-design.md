---
created: 2026-05-29
issue: epic
status: approved
depends-on: 1315
---

# CalVer Implementation Design — YY.M.MICRO Migration

## Context

Issue #1315 decided that the Rackula app adopts CalVer `YY.M.MICRO` (e.g., `v26.6.0`), while reserving SemVer for any future published packages (`@rackula/core`). The decision record (`docs/superpowers/specs/2026-05-29-versioning-policy-calver-design.md`) is merged. This spec covers the implementation: what changes, in what order, and how to verify it.

**Why now?** The LXC release is the designated anchor point. The current SemVer pipeline requires a minor-vs-patch decision on every release; CalVer eliminates that friction.

## Key Decisions (Confirmed)

| Decision | Choice | Rationale |
| --- | --- | --- |
| CalVer format | `YY.M.MICRO` (e.g., `v26.6.0`) | Valid-semver-shaped, 3-segment, unpadded month |
| First CalVer release | LXC milestone | Natural pipeline touch-point |
| Docker rolling tags | `YY.M` (e.g., `26.6`) + `latest` | Same pattern as current `major.minor` |
| Migration thresholds | Leave `0.7.0` as-is | Any CalVer > `0.7.0`, no code changes needed |
| `api/package.json` | Track same version as root | Unify for simplicity |
| Implementation approach | Staged prep + single cutover | Validate CI before committing to CalVer |

## What Changes

### Must Change (Preparation Phase — backward-compatible)

1. **New: `scripts/next-version.sh`** — computes next CalVer version from date + existing tags
2. **Rewrite: `.claude/commands/release.md`** — replace SemVer bump logic with CalVer computation
3. **Update: `.github/workflows/deploy-prod.yml`** — accept CalVer tags, Docker `YY.M` rolling tags
4. **Update: `.github/workflows/release.yml`** — update comments/docs (functional: format-agnostic)
5. **Rewrite: `CLAUDE.md` versioning policy section** — replace Cargo SemVer with CalVer YY.M.MICRO

### Must Change (Cutover Phase — at LXC release)

6. **Update: `package.json` + `api/package.json`** — version fields to first CalVer (e.g., `26.6.0`)
7. **Update: `CHANGELOG.md`** — add first CalVer heading
8. **Update: `SECURITY.md`** — version table format
9. **Git tag** — create and push `v26.6.0` (or whatever month the LXC release lands)

### Must Change (Post-Cutover)

10. **Rename GitHub milestones** — theme-based names instead of SemVer

### Does NOT Need Changes

- `compareVersions()` and `0.7.0` thresholds — CalVer is 3-segment numeric, `26.6.0 > 0.7.0`
- `vite.config.ts` — reads `pkg.version`, format-agnostic
- `api/src/app.ts` — reads `APP_VERSION` env var, format-agnostic
- `verify-version-alignment.sh` — accepts any version string
- `build-lxc.yml` — uses version string in tarball name directly
- `version.json` runtime endpoint — format-agnostic
- `src/lib/version.ts`, `src/lib/types/index.ts` — `VERSION` is a string, format-agnostic
- `src/lib/schemas/share.ts` — `v` field is a string, format-agnostic

## Issue Breakdown

### Issue 1: Create CalVer version utility script

**What:** Create `scripts/next-version.sh` that computes the next CalVer version.

**Why:** Both the `/release` skill and CI workflows need to compute `YY.M.MICRO` from the current date and existing git tags. A single script prevents drift between them.

**Requirements:**

- Read the most recent `v*` git tag
- If current YY.M matches the tag's YY.M: `MICRO = tag.MICRO + 1`
- If current YY.M is different: `MICRO = 0`
- Output the computed version (e.g., `26.6.0`)
- Support `--dry-run` flag for testing without side effects
- Support `--tag` flag to also create and push the git tag
- Validate that the computed version doesn't already exist as a tag
- Exit non-zero on any error (no tag found, invalid format, duplicate tag)

**Acceptance criteria:**

- `scripts/next-version.sh` exists and is executable
- `scripts/next-version.sh --dry-run` outputs the correct next version without side effects
- Works correctly when the most recent tag is SemVer (during prep phase) and CalVer (after cutover)
- Works correctly for month rollovers (e.g., June → July resets MICRO to 0)
- Testable via `bats` or manual invocation

**Files:** `scripts/next-version.sh` (new)

---

### Issue 2: Rewrite `/release` skill for CalVer computation

**What:** Replace SemVer bump logic in `.claude/commands/release.md` with CalVer computation.

**Why:** The release skill currently accepts `patch`/`minor`/`major` and does SemVer arithmetic. CalVer eliminates bump types — version is computed from date + tag counter.

**Requirements:**

- Remove `patch`/`minor`/`major` arguments
- Accept no argument (auto-compute via `scripts/next-version.sh`) or an explicit version string
- Phase 1 (gather), Phase 2 (draft), Phase 3 (confirm) remain unchanged
- Phase 4 now calls `scripts/next-version.sh` for version computation
- Phase 4 still runs `npm version $NEW_VERSION --no-git-tag-version`
- Update output format to show `0.10.1 → 26.6.0` style transitions
- Update error messages to remove SemVer terminology
- Update SECURITY.md format to CalVer

**Acceptance criteria:**

- `/release` (no argument) computes the next CalVer version
- `/release 26.7.0` uses the explicit version
- `npm version` still works (CalVer `26.6.0` is valid semver for npm)
- SECURITY.md updated to CalVer format

**Files:** `.claude/commands/release.md`

---

### Issue 3: Update `deploy-prod.yml` for CalVer tag format

**What:** Update the production deployment workflow to handle CalVer tags and Docker tags.

**Why:** The current workflow validates strict SemVer (`^v[0-9]+\.[0-9]+\.[0-9]+$`) and uses `type=semver` Docker metadata patterns. CalVer `v26.6.0` technically matches this regex (it's still 3 numeric segments), but the semantics of `major.minor` change to `YY.M`, and the Docker metadata action's `type=semver` pattern needs review.

**Requirements:**

- Update the validate job's regex comment to clarify it accepts CalVer (the pattern `^v[0-9]+\.[0-9]+\.[0-9]+$` already matches `v26.6.0`)
- Replace `type=semver,pattern={{version}}` with `type=raw,value=${{ needs.validate.outputs.version }}` for all three images (frontend, persist, API)
- Replace `type=semver,pattern={{major}}.{{minor}}` with a `YY.M` rolling tag derived from the validated version
- Add `year_month` output to the validate job (extracted from version: `26.6.0` → `26.6`)
- Use `year_month` for Docker rolling tags instead of `major_minor`
- Update `major_minor` references to `year_month` throughout
- Update persist image tagging pattern from `v{{version}}-persist` to `v{version}-persist` (raw)
- Keep `latest` tag on all images
- Verify-version-alignment job stays format-agnostic (no changes needed)

**Acceptance criteria:**

- A `v26.6.0` tag passes validation
- Docker images get tagged: `26.6.0`, `26.6`, `latest`
- Persist image gets tagged: `v26.6.0-persist`, `persist`
- API image gets tagged: `26.6.0`, `26.6`, `latest`
- Existing SemVer tags (`v0.10.1`) still pass validation (during prep phase)
- Smoke test verifies the live frontend version matches the CalVer tag

**Files:** `.github/workflows/deploy-prod.yml`

---

### Issue 4: Update `release.yml` for CalVer

**What:** Minor documentation updates to the release creation workflow.

**Why:** The changelog validation is format-agnostic (just greps for `## [VERSION]`), but comments reference "semver".

**Requirements:**

- Update comments that reference "semver" to reference "CalVer" or "version"
- No functional changes to the workflow logic needed

**Acceptance criteria:**

- Comments accurately reflect CalVer versioning
- No functional regression in changelog validation or GitHub release creation

**Files:** `.github/workflows/release.yml`

---

### Issue 5: Rewrite `CLAUDE.md` versioning policy section

**What:** Replace the Cargo SemVer policy (lines 8–59) with the CalVer `YY.M.MICRO` policy.

**Why:** CLAUDE.md is the AI assistant's primary reference for project conventions. It currently describes SemVer bump types and Cargo conventions that are no longer accurate.

**Requirements:**

- Replace the "Versioning Policy" section with CalVer `YY.M.MICRO` format rules
- Document the format: `YY` = 2-digit year, `M` = unpadded month, `MICRO` = release counter
- Document the MICRO rule: same month → MICRO++, new month → MICRO 0
- Document dual-artifact policy: app = CalVer, `@rackula/core` = SemVer
- Remove references to `patch`/`minor`/`major` bump types
- Update the release command reference to `/release` (no argument) or `/release 26.7.0`
- Update the milestone section to reference theme-based names instead of SemVer targets
- Keep the tag format (`v` prefix) documentation

**Acceptance criteria:**

- CLAUDE.md versioning policy accurately describes CalVer
- No references to SemVer bump types remain in the versioning section
- `/release` command documentation matches the updated skill

**Files:** `CLAUDE.md`

---

### Issue 6: Execute CalVer cutover

**What:** The single commit that switches from SemVer to CalVer.

**Why:** All preparation is done; this is the point of no return. Anchored to the LXC release.

**Requirements:**

- Change `package.json` version from `0.10.1` to the first CalVer version (e.g., `26.6.0`)
- Change `api/package.json` version to match
- Add a CalVer heading to `CHANGELOG.md` (e.g., `## [26.6.0] - 2026-06-XX`)
- Update `CHANGELOG.md` header from "Semantic Versioning" to "Calendar Versioning"
- Update `SECURITY.md` version table to CalVer format
- Commit as `v26.6.0`
- Create git tag `v26.6.0`
- Push to main and push the tag

**Acceptance criteria:**

- `package.json` and `api/package.json` both have the same CalVer version
- CHANGELOG.md has a `## [YY.M.MICRO] - YYYY-MM-DD` entry
- SECURITY.md shows the new CalVer version as supported
- Git tag `vYY.M.MICRO` exists on the cutover commit
- CI pipeline passes with the CalVer tag

**Files:** `package.json`, `api/package.json`, `CHANGELOG.md`, `SECURITY.md`

---

### Issue 7: Rename GitHub milestones to theme-based names

**What:** Rename GitHub milestones from SemVer names to theme-based names with CalVer ranges.

**Why:** Under CalVer, a milestone named `v1.0.0` no longer maps to a version. Milestones should reflect theme and target date instead.

**Requirements:**

- Rename existing milestones (e.g., `v1.0.0` → `M1 — LXC Build & Hardening, v26.6.x`)
- Create new milestones with CalVer range format (`v26.7.x`, `v26.8.x`, etc.)
- Update ROADMAP.md milestone references if needed
- Close or migrate any issues in old milestones

**Acceptance criteria:**

- No SemVer-named milestones remain on GitHub
- All milestones have theme-based names with CalVer ranges

**Files:** GitHub (milestones), `.planning/ROADMAP.md`

## Migration Safety

### Monotonic ordering

The transition `0.10.1 → 26.6.0` only ever increases. `compareVersions("26.6.0", "0.7.0")` returns `1` (greater), so all existing migration thresholds work correctly. No data migration needed.

### Docker tag safety

CalVer tags (`26.6.0`, `26.6`, `latest`) don't collide with existing SemVer tags (`0.10.1`, `0.10`, `latest`). The `latest` tag will be overwritten as expected on the first CalVer release.

### CI validation

The regex `^v[0-9]+\.[0-9]+\.[0-9]+$` already matches `v26.6.0`. No regex change is strictly required, but the error message should reference "CalVer" instead of "semver".

### Rollback

If the CalVer tag causes unexpected CI failures:

1. Delete the CalVer tag and release from GitHub
2. Revert the cutover commit
3. Re-tag with a SemVer `v0.10.2` fix release
4. The prep changes are backward-compatible and don't need reverting

## Verification Plan

### Phase 1 Verification (Preparation)

1. **`scripts/next-version.sh`**: Run with `--dry-run` on current repo. Should compute a valid CalVer version based on current date and existing tags.
2. **`/release` skill**: Dry-run with no argument. Should propose the correct CalVer version.
3. **`deploy-prod.yml`**: Push a test tag (or use `workflow_dispatch`) to validate the regex and Docker tag generation with a CalVer-format tag.
4. **`CLAUDE.md`**: Review the versioning policy section for accuracy.

### Phase 2 Verification (Cutover)

1. **`package.json`**: `node -p "require('./package.json').version"` returns `26.6.0` (or similar).
2. **`api/package.json`**: Same version.
3. **CHANGELOG.md**: `grep -q "^## \[26.6.0\]" CHANGELOG.md` passes.
4. **Git tag**: `git tag -l 'v26.*'` shows the tag.
5. **CI pipeline**: The `release.yml` and `deploy-prod.yml` workflows both pass.
6. **Live version**: `curl https://count.racku.la/version.json | jq .version` returns the CalVer.
