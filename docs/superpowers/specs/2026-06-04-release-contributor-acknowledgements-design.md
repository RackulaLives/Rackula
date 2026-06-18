# Design: Auto-Acknowledge Contributors Per Release

**Issue:** #1876 **Date:** 2026-06-04 **Status:** Approved

## Problem

`ACKNOWLEDGEMENTS.md` has a manually-maintained all-contributors table. New contributors are only credited if someone remembers to edit it. As external contributions grow post-LXC release, manual upkeep will lag and contributors will be missed.

## Solution

Add a step to the `/release` skill that extracts contributors from merged PRs between release tags and appends per-release acknowledgement blocks to `ACKNOWLEDGEMENTS.md`.

## Architecture

### New: `scripts/contributors.sh`

A standalone shell script, consistent with the existing `scripts/next-version.sh`.

**Interface:**

```bash
scripts/contributors.sh <prev_tag> <new_version> [--dry-run]
```

- `prev_tag`: The previous release tag (e.g., `v26.5.0`)
- `new_version`: The new release version without `v` prefix (e.g., `26.6.0`)
- `--dry-run`: Output the contributor block to stdout without modifying `ACKNOWLEDGEMENTS.md`

**Extraction logic:**

1. Get the date of `prev_tag` via `git log -1 --format=%aI <prev_tag>`
2. Query merged PRs: `gh pr list --state merged --search "merged:>=<date>" --json number,title,author,labels`
3. Filter out excluded authors (bots and maintainer)
4. Deduplicate by author (one line per contributor, even with multiple PRs)
5. Format each contributor as: `- @author: description (#123)`

**Exclusion list** (variable at top of script for easy editing):

```bash
EXCLUDED_AUTHORS="dependabot[bot] app/dependabot coderabbitai[bot] ggfevans"
```

The maintainer (`ggfevans`) is excluded because they appear in every release and are already credited in the all-contributors table.

**Idempotency:** Before inserting, check if `### vX.Y.Z` heading already exists in `ACKNOWLEDGEMENTS.md`. If found, print "Contributor block for vX.Y.Z already exists" and exit 0.

**Output format** (markdown block):

```markdown
### v26.6.0

- @Daishi1938: Bug reports (#1834)
- @mondychan: Code contributions (#1840)
- @troyfontaine: Code contributions (#1842)
```

**Insertion point:** After the `<!-- ALL-CONTRIBUTORS-LIST:END -->` marker and the following blank line. New releases are prepended (latest version at the top, like a changelog).

**Description derivation:** For contributors with a single PR, use the PR title (lowercase first letter after the colon). For contributors with multiple PRs in the same release, group them as one line with a concise summary and multiple PR links, e.g., `- @mondychan: fix rack selection and add port types (#1840, #1842)`. The `/release` skill presents the draft for user review, so manual adjustment is always possible.

**Writing style:** No em dashes, no emoji. PR references use `(#123)` format.

### Modified: `.claude/commands/release.md`

**Phase 2 addition:** After drafting the changelog entry, call `scripts/contributors.sh $LAST_TAG $NEW_VERSION` to generate the contributor block. Present it alongside the changelog draft for user review.

**Phase 4 addition:** New step 4d (after SECURITY.md update): Update ACKNOWLEDGEMENTS.md with the contributor block. The release commit message changes to: `"docs: update changelog, acknowledgements, and security policy for v$NEW_VERSION"`.

**Error handling:** If `contributors.sh` fails (e.g., `gh` not authenticated), warn but do NOT abort the release. The contributor block is optional; it can be added manually later. If `ACKNOWLEDGEMENTS.md` is not found, skip the step entirely.

### Modified: `ACKNOWLEDGEMENTS.md`

New section `## Contributions by Release` inserted between `## Contributors` and `## AI Development`:

```markdown
## Contributors

<!-- ALL-CONTRIBUTORS-LIST:START -->

... existing table ...

<!-- ALL-CONTRIBUTORS-LIST:END -->

## Contributions by Release

Contributors who made merged pull requests in each release. For the full contributors table, see above.

### v26.6.0

- @Daishi1938: Bug reports (#1834)
- @mondychan: Code contributions (#1840)
- @troyfontaine: Code contributions (#1842)

## AI Development

...
```

The all-contributors table is left intact and untouched.

## Testing

Lightweight shell testing via `scripts/test-contributors.sh`:

1. Given a known tag range (`v26.5.0..v26.6.0`), the script outputs the expected set of contributors (excluding bots/maintainer)
2. Running the script twice for the same version produces no duplicate entry (idempotency)
3. The `--dry-run` flag outputs the block to stdout without modifying `ACKNOWLEDGEMENTS.md`

This is consistent with `next-version.sh` which also has no formal test suite but is validated by the release workflow.

## Acceptance Criteria Mapping

| Criterion | How it's met |
| --- | --- |
| Identify contributors with merged PRs since previous tag | `gh pr list --state merged --search "merged:>=<date>"` |
| Append per-release notes to ACKNOWLEDGEMENTS.md | `scripts/contributors.sh` inserts formatted block |
| Dedupe: no duplicate maintainer entries, exclude bots | `EXCLUDED_AUTHORS` filter in script |
| Idempotent: re-running does not duplicate entries | Check for existing `### vX.Y.Z` heading before inserting |
| ACKNOWLEDGEMENTS.md update is part of the release | `/release` skill step 4d |
| Writing style rules respected | PR title derivation, no em dashes/emoji |

## Out of Scope

- Updating the all-contributors table (that stays manual)
- GitHub Action integration (release.yml not modified)
- Per-contribution-type categorization (just "description: PR title")
- Commit-based detection (PR-based only)
