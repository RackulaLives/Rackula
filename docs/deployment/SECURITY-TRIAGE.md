# Security Triage Automation

The `security-triage.yml` workflow runs Claude Code to triage new findings from CodeQL and Trivy, then either dismisses false positives or opens a draft PR with a suggested fix.

It authenticates with a Claude subscription OAuth token, so it bills against a Pro/Max subscription rather than API credits.

## How It Works

1. CodeQL or Trivy completes a scan on the `main` branch.
2. `security-triage.yml` fires via `workflow_run`.
3. Claude Code (run by `anthropics/claude-code-action`) reads `.github/prompts/security-triage.md` and follows it.
4. It queries the GitHub Code Scanning API for net-new open alerts from that scan (up to 5 per run), reading the affected code for context.
5. For false positives: it dismisses the alert via the Code Scanning API with an explanation.
6. For real findings: it opens a draft PR on a branch `fix/security-<alert-number>` with the triage reasoning and a suggested or implemented fix, labelled `security` and `automated`.

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
- SARIF processing delay: the `sleep 90` step in the workflow gives GitHub time to turn uploaded SARIF into Code Scanning alerts. Increase it if Claude reports zero findings immediately after a scan that produced results.

## Testing

Trigger the workflow manually to dry-run it against whatever open alerts currently exist:

```bash
gh workflow run security-triage.yml -f triggering_workflow=CodeQL
```
