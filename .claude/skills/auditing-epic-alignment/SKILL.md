---
name: auditing-epic-alignment
description: Use when an epic or milestone may have drifted from reality - checklist items that could be stale, issues possibly in the wrong milestone, a "gated on #X" blocker that may already be resolved, parenting that exists only as body text, an epic that may have grown to cover several concerns, or whenever you are about to trust an epic body for a scoping decision.
---

# Auditing Epic Alignment

Reference card. An epic body is a claim about reality, not reality itself; the longer it lives, the more its checklist, milestones, and "gated on #X" notes drift from actual issue states. Audit against live data, then split or re-scope.

The one subtle move: verify blockers at the ARTIFACT level, not the issue state. "Gated on #X" is not settled by #X being open or closed. Check the deliverable: is the PR merged to the default branch, does the file or schema already contain the change, are the docs live? Anything in draft or review does not unblock. (A year-old "blocked by #X" was once false because the schema file already carried the change and #X's generator was closed; that one check re-scoped a milestone.) A checklist item with no linked issue is an unverifiable claim, not a fact.

GitHub-specific (sub-issues API, milestones). For Jira/GitLab/Linear, adapt the live pull and skip native sub-issue wiring; the taxonomy still applies.

## Drift Types

| Drift | How to detect | Fix |
| --- | --- | --- |
| Stale checkbox | child state != body checkbox | correct the body |
| Misfiled issue | child milestone != epic's | relocate or re-note |
| False blocker | claimed dep already met at the artifact level | remove the dep, document why |
| Unmapped claim | checklist item with no linked issue | flag; link, downgrade, or delete |
| Text-only parenting | `sub_issues` returns empty | wire native links |
| Phantom phase | work with no issue and no near-term owner | demote to one gated note; do not pre-create issues |
| Conflated scope | one epic, two audiences or data models | split when independently deliverable; keep-with-cross-link when one is a subset or dependency of the other; close when superseded |

## Skill Routing

Load the matching skill to judge whether the epic's acceptance criteria and non-goals are complete and current. You are auditing alignment, not writing the work.

| Audited scope | Skill |
| --- | --- |
| auth, tokens, data ingress, serialization | /secure-coding |
| UI, components, accessibility | /frontend-design:frontend-design |
| splitting or re-phasing scope | /superpowers:brainstorming |
| before any tracker mutation | /superpowers:devils-advocate |
| audit unmasks untracked work | /gh-create |
| restructure spans many moves | /superpowers:writing-plans, then /orchestrate-issues |

## Execution (order matters)

1. Create or rename the destination (milestone, new epic) FIRST, so re-scope edits never reference a dangling target. Capture the new epic number.
2. Relocate children (`gh issue edit --milestone`).
3. Wire native sub-issues: `gh api -X POST repos/OWNER/REPO/issues/PARENT/sub_issues -F sub_issue_id=CHILD_ID`. `sub_issue_id` is the numeric database `.id` (`gh api .../issues/N -q .id`), NOT the issue number. The POST returns the parent, so a repeated parent id in the output is success. A child already parented elsewhere is rejected; resolve that first.
4. Edit the epic and parent bodies last, referencing the now-existing targets.
5. Repoint initiatives or siblings that named the moved work, then verify both trees (`.../sub_issues` and the milestone listing) before reporting done.
6. Present the changes as structured options and get approval before mutating. The human owns scope forks (which milestone, whether to split); offer tradeoffs, do not pre-decide them.

Maturity: reference card, intentionally light. Pressure-testing (see TESTING.md) found a capable model already verifies live and knows these mechanics, so this carries the non-obvious reference points and the routing, not a discipline apparatus.
