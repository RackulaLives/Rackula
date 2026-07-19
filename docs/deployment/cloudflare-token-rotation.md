# Cloudflare Token Rotation and Revocation Runbook

This is the operational runbook for rotating and revoking the two classes of Cloudflare credentials the Cloudflare migration (epic #1984, milestone M018) uses: Cloudflare API deploy tokens and Cloudflare Access service tokens. Follow it as-is during a scheduled rotation or a suspected compromise. It does not explain how the migration works; see `docs/plans/2026-06-29-cloudflare-migration-plan.md` for that.

## Status: placeholders pending #2675

Issue #2675 has not run yet. No Cloudflare API deploy token exists, and `CLOUDFLARE_ACCOUNT_ID` is not set anywhere. This runbook documents the rotation procedure against the planned inventory so the procedure exists before the tokens do. Wherever a name below is not yet fixed, it is written as an angle-bracket placeholder, for example `<CF_API_TOKEN_NAME_TBD>`.

When #2675 mints the real tokens, it must:

- Replace every `<..._TBD>` placeholder below with the actual GitHub secret name it used.
- Confirm or correct the token scope, storage environment, and whether dev and prod share one account-wide token or hold separate copies of an identically-scoped token (Cloudflare cannot scope a Workers Scripts token to a single Worker, so the two copies would carry the same blast radius either way; see the account-wide risk note below).
- Link this file from the deploy docs #2675 produces.

The Cloudflare Access service token pair (`CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`) already exists and is not a placeholder; its section below is accurate today.

## Account-wide risk: read this before rotating anything

Cloudflare API tokens scoped to Workers Scripts edit cannot be restricted to a single Worker. A token minted to deploy `rackula-dev` can also overwrite `rackula-prod` (see #2031). Treat every Cloudflare API deploy token as prod-grade, regardless of which GitHub Environment holds it or which Worker it is nominally used for. Do not downgrade the rotation cadence or the revocation urgency for a token just because it lives in the `dev` environment.

## Token class 1: Cloudflare API deploy tokens

Used by the deploy workflows to publish the Worker and manage R2 bindings (`wrangler deploy` / `wrangler versions upload` in #2134 and #2029).

### Storage

- Secret names (planned, per the migration plan and #2675's acceptance criteria): `<CF_API_TOKEN_NAME_TBD>` (expected to follow the Wrangler convention `CLOUDFLARE_API_TOKEN`) and `<CF_ACCOUNT_ID_NAME_TBD>` (expected `CLOUDFLARE_ACCOUNT_ID`).
- Stored as GitHub Actions secrets on the `dev` and `prod` GitHub Environments (both already exist in repo settings; `e2e-approval` and `e2e-trusted` also exist but are not deploy-token holders).
- Scope (per #2675 AC): Workers Scripts edit, R2 read/write, account-wide. No narrower scope is available from Cloudflare for this permission set.

### Who can rotate

A GitHub repository admin (Settings > Environments > secrets) acting together with a Cloudflare account member who holds Workers and Access administration permissions in the Cloudflare dashboard. Both access levels are required: GitHub admin to update the secret, Cloudflare account access to mint or revoke the token.

### Rotation cadence

Every 90 days, or immediately on suspected compromise. Put a recurring reminder on the calendar; Cloudflare does not currently enforce expiry on account API tokens, so there is no automatic prompt.

### Rotation procedure

1. In the Cloudflare dashboard, go to My Profile > API Tokens > Create Token. Recreate the same scope as the token being replaced (Workers Scripts edit, R2 read/write, account-wide). Do not reuse the old token's name; append a date suffix so the audit log distinguishes them.
2. Copy the new token value immediately; Cloudflare shows it once.
3. In GitHub, go to Settings > Environments > `dev` (repeat for `prod` if it holds a separate copy) > Secrets, and update `<CF_API_TOKEN_NAME_TBD>` with the new value. Confirm `<CF_ACCOUNT_ID_NAME_TBD>` is still correct; it does not usually need to change.
4. Trigger a `workflow_dispatch` run of `Deploy Dev` (Actions > Deploy Dev > Run workflow) and confirm the `deploy` job succeeds against d.racku.la. For a prod-side rotation, trigger the equivalent verification path once #2029 lands (`deploy-prod.yml` is currently a `workflow_call`-only reusable workflow invoked by the release orchestrator; confirm with a real release promote or with whatever manual dispatch path #2029 adds).
5. Once the new token has verified deploy success, return to the Cloudflare dashboard and revoke the old token (API Tokens > find the old entry > Roll or Delete).
6. Note the rotation date and who performed it somewhere durable (a comment on the tracking issue is sufficient); there is no in-repo rotation log to update.

### Revocation on suspected compromise

1. Revoke the token in the Cloudflare dashboard first (API Tokens > Delete), before touching GitHub. This stops the token from being usable immediately, even if the attacker also has GitHub access.
2. Mint a replacement token following steps 1 to 2 above.
3. Update the GitHub Environment secret(s) following step 3 above.
4. Verify with a `workflow_dispatch` run following step 4 above.
5. Audit the Cloudflare account's audit log (Manage Account > Audit Log) and the GitHub Actions run history for both the `dev` and `prod` environments, covering the window from when compromise is suspected to have started through the revocation. Look for Worker deployments, R2 object writes, or DNS changes that were not initiated by a known workflow run. Flag anything unexplained to the maintainer.
6. If the audit finds unauthorized activity, escalate: rotate the Cloudflare account owner credentials too, since an account-wide Workers Scripts token implies the compromise could extend beyond this one secret.

## Token class 2: Cloudflare Access service tokens

Used by the `smoke-test` job in `deploy-dev.yml` to authenticate through Cloudflare Access, which fronts d.racku.la. This pair exists today; it is not a placeholder.

### Storage

- Secret names: `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`.
- Stored as GitHub Actions secrets on the `dev` GitHub Environment (see `deploy-dev.yml`, the `environment: name: dev` block and the `smoke-test` job's `env:`).
- Prod (`count.racku.la`) is not behind Cloudflare Access today, so there is no prod copy of this pair. If a future issue puts prod behind Access, this section's storage and cadence apply there too; update this file rather than writing a second one.

### Who can rotate

A Cloudflare account member with Access administration permissions (Zero Trust dashboard > Access > Service Auth) to mint or rotate the service token, and a GitHub repository admin to update the secrets.

### Rotation cadence

Every 90 days, matching the API token cadence, or immediately on suspected compromise. Cloudflare Access lets you set an explicit duration on a service token at creation time; if a duration is set, treat its expiry as a forcing function and rotate before it lapses rather than after.

### Rotation procedure

1. In the Cloudflare Zero Trust dashboard, go to Access > Service Auth > Service Tokens. Create a new service token (or use the dashboard's rotate action on the existing token if available at the time; check whether it issues a new Client Secret for the same Client ID with an overlap window, which avoids a hard cutover).
2. Copy the new Client ID and Client Secret.
3. In GitHub, go to Settings > Environments > `dev` > Secrets, and update `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`.
4. Trigger a `workflow_dispatch` run of `Deploy Dev` and confirm the `check-cf-access` job reports the secret available and the `smoke-test` job passes, specifically the curl gate against `https://d.racku.la` and `https://d.racku.la/api/layouts`.
5. Once verified, delete the old service token in the Zero Trust dashboard (or confirm the rotate action already invalidated it).

### Revocation on suspected compromise

1. Delete the service token in the Cloudflare Zero Trust dashboard first, before touching GitHub.
2. Mint a replacement following steps 1 to 2 above.
3. Update the GitHub Environment secrets following step 3 above.
4. Verify with a `workflow_dispatch` run following step 4 above.
5. Audit the Cloudflare Access audit log for authentications using the old Client ID, and the GitHub Actions run history for the `dev` environment, covering the suspected compromise window. A compromised Access service token only grants entry through the Access gate; it does not grant Workers or R2 write access, so the blast radius is narrower than the API deploy token, but still confirm no unexpected requests reached `/api/*`.

## Related

- #2675 provisions the account resources and the real token names; this file's placeholders are pending that issue.
- #2031 documents the account-wide blast radius that motivates treating the dev-scoped token as prod-grade.
- `docs/plans/2026-06-29-cloudflare-migration-plan.md` is the source of truth for the broader migration architecture this runbook supports.
