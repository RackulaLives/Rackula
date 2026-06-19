# Security Triage Automation

The `security-triage.yml` workflow runs Claude Code to triage new findings from CodeQL and Trivy, then either dismisses false positives or opens a draft PR with a suggested fix.

It authenticates with a Claude subscription OAuth token, so it bills against a Pro/Max subscription rather than API credits.

## How It Works

1. CodeQL or Trivy completes a scan on the `main` branch.
2. `security-triage.yml` fires via `workflow_run`.
3. A cheap gate step (`actions/github-script`) polls the Code Scanning API for net-new open alerts from the triggering tool, then sets `has_alerts`. If the scan produced no net-new alerts, the gate returns `false` and every later step (checkout, git config, Claude) is skipped, so no action is invoked and no subscription usage is spent. See [The alert gate](#the-alert-gate).
4. When `has_alerts` is `true`, Claude Code (run by `anthropics/claude-code-action`) reads `.github/prompts/security-triage.md` and follows it.
5. It queries the GitHub Code Scanning API for net-new open alerts from that scan (up to 5 per run), reading the affected code for context.
6. For false positives: it dismisses the alert via the Code Scanning API with an explanation.
7. For real findings: it opens a draft PR on a branch `fix/security-<alert-number>` with the triage reasoning and a suggested or implemented fix, labelled `security` and `automated`.

## The alert gate

The gate keeps the expensive Claude invocation off the critical path of every push. It runs before checkout and:

- Maps the triggering workflow name to the SARIF tool name the Code Scanning API indexes alerts under (`CodeQL` -> `CodeQL`, `Trivy Security Scan` -> `Trivy`).
- Counts open alerts for that tool on `main` whose `created_at` is at or after `run_started_at - 30 minutes`, matching the playbook's net-new definition.
- Polls in steps of roughly 30 seconds up to a total of about 90 seconds (the budget the old fixed `sleep 90` spent), because GitHub turns uploaded SARIF into alerts asynchronously. It polls the whole budget before deciding rather than stopping at the first alert, so a scan's alerts have time to finish landing and Claude is not started against a partially-processed set.
- On a manual `workflow_dispatch` there is no scan start time, so the gate does not wait or time-filter: any currently-open alert for the tool counts (matching the dry-run behaviour of the playbook).
- Fails secure: if the Code Scanning API errors persistently, the gate sets `has_alerts=true` so real findings are never silently skipped.

## The secure-coding skill

The triage call loads the `secure-coding` skill so the analysis and any drafted fix follow secure-coding practice. Headless CI does not auto-install plugins from settings (the marketplace clone races session start, see `anthropics/claude-code#63028`), so the skill is vendored into the repo at `.github/claude-plugins/secure-coding/` and loaded deterministically with `--plugin-dir` via `claude_args`. The triage prompt invokes it as `/secure-coding:secure-coding`. The skill body is the community VibeSec guide (`BehiSecc/VibeSec-Skill`); update `skills/secure-coding/SKILL.md` to refresh it.

## Required Secret: CLAUDE_CODE_OAUTH_TOKEN

This workflow uses a Claude subscription, not API credits. A Pro/Max subscriber generates the token once:

```bash
claude setup-token
```

This prints a long-lived OAuth token (valid ~1 year, inference-scoped). Add it as a repository secret named `CLAUDE_CODE_OAUTH_TOKEN`:

```bash
gh secret set CLAUDE_CODE_OAUTH_TOKEN
```

Then paste the token when prompted.

### Important: do not set ANTHROPIC_API_KEY in this job

Claude Code's auth precedence puts `ANTHROPIC_API_KEY` ahead of `CLAUDE_CODE_OAUTH_TOKEN`. If both are present, the API key wins and usage is billed to the separate API account instead of the subscription. The `security-triage.yml` job deliberately passes only `claude_code_oauth_token` and never `anthropic_api_key`. Keep it that way.

### Token expiry

The token is valid for about one year and does not auto-refresh. When it expires, regenerate with `claude setup-token` and update the secret. Set a calendar reminder.

### Action input compatibility

If your pinned version of `anthropics/claude-code-action` does not expose the `claude_code_oauth_token` input, pass the token as an environment variable on the step instead:

```yaml
- name: Run security triage
  uses: anthropics/claude-code-action@<pin>
  env:
    CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    prompt: ...
```

## Usage Limits

Running Claude Code in CI counts against the subscription's usage limits, the same pool as interactive Claude Code. The playbook caps triage at 5 findings per run to keep usage bounded; a noisy scan logs which findings it skipped, and the next scheduled scan picks them up. If CI triage starts competing with interactive usage, lower the cap in `.github/prompts/security-triage.md` or move this workflow to its own subscription/service account.

## Reviewing Triage Output

Draft PRs created by this workflow are labelled `security` and `automated`:

```bash
gh pr list --label "security,automated" --state open
```

For each draft PR:

1. Read the triage analysis in the PR description.
2. If you agree, finish or accept the fix on the same branch, mark the PR ready, and merge.
3. If you disagree, close the PR with a comment explaining why.

## Tuning

- Triage playbook: `.github/prompts/security-triage.md` - edit to adjust guidance, the per-run cap, or the dismiss/PR rules.
- SARIF processing delay: the alert gate polls the Code Scanning API for up to about 90 seconds to let GitHub turn uploaded SARIF into alerts. If Claude is skipped immediately after a scan that produced results, increase the poll budget in the `Check for net-new Code Scanning alerts` step.
- Vendored skill: `.github/claude-plugins/secure-coding/` holds the skill loaded into the triage call. Update its `skills/secure-coding/SKILL.md` to adjust the secure-coding guidance.

## Testing

Trigger the workflow manually to dry-run it against whatever open alerts currently exist:

```bash
gh workflow run security-triage.yml -f triggering_workflow=CodeQL
```
