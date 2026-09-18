# Cloudflare Token Rotation and Revocation Runbook

This is the operational runbook for rotating and revoking the two classes of Cloudflare credentials the Cloudflare migration (epic #1984, milestone M018) uses: Cloudflare API deploy tokens and Cloudflare Access service tokens. Follow it as-is during a scheduled rotation or a suspected compromise. It does not explain how the migration works; see `docs/plans/2026-06-29-cloudflare-migration-plan.md` for that.

## Status

The prod surface is live (#2029). Account: `GarethLand`, id `f8606884a913456ec07bf4ccbf136abc`. Zone `racku.la`, id `ecc485cd0dd1c5fe05e803f83632d721`. Worker `rackula-prod`, `workers.dev` subdomain `gvns`.

The dev surface is live (#2134). Worker `rackula-dev` (config `api/wrangler.jsonc`), R2 bucket `rackula-layouts-dev`. Dev shares the prod deploy token rather than holding its own copy: Cloudflare cannot scope a Workers Scripts token to a single Worker, so a separate token would carry the same blast radius (see the account-wide risk note below). If a dev deploy ever needs a scope this token lacks, mint a separate dev token rather than widening this one.

The Cloudflare Access service token pair (`CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`) already exists; its section below is accurate today.

## Account-wide risk: read this before rotating anything

Cloudflare API tokens scoped to Workers Scripts edit cannot be restricted to a single Worker. A token minted to deploy `rackula-dev` can also overwrite `rackula-prod` (see #2031). Treat every Cloudflare API deploy token as prod-grade, regardless of whether it is stored as a repository secret or scoped to a specific GitHub Environment, and regardless of which Worker it is nominally used for. Do not downgrade the rotation cadence or the revocation urgency for a token just because a copy of it is scoped to `dev`.

## Token class 1: Cloudflare API deploy tokens

Used by the deploy workflows to publish the Workers. `deploy-prod.yml` and `deploy-dev.yml` each run `wrangler versions upload`, `versions deploy` and `triggers deploy`. `rollback-prod.yml` runs `versions deploy` only, so the Workers Routes scope in the table below is exercised by the two deploy workflows.

### Storage

- Secret names: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, following the Wrangler convention so no extra env plumbing is needed. `deploy-prod.yml`, `rollback-prod.yml` and `deploy-dev.yml` read both.
- Storage tier: repository-level GitHub Actions secrets, matching how `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` are stored. Environment-scoped secrets were considered and not used: `deploy-prod.yml` deliberately carries no `environment:` binding, because `promote-gate` in `release.yml` already binds the protected `prod` environment and a second binding would prompt the same reviewer twice in one run. The approval gate is therefore upstream of the token, not around it.
- Minimum scope for the deploy token, shared by prod and dev (three permissions, verified against both deploy paths):

  | Scope | Permission | Needed for |
  | --- | --- | --- |
  | Account | Workers Scripts: **Edit** | `versions upload` / `versions deploy`, including static-asset upload |
  | Zone (`racku.la` only) | Workers Routes: **Edit** | `triggers deploy` maintaining the `count.racku.la/*` and `d.racku.la/*` routes |
  | Zone (`racku.la` only) | Zone: **Read** | resolving `zone_name: "racku.la"` to a zone id |

  Deliberately not granted, versus the set Cloudflare's Workers Builds template auto-generates: R2 Storage and KV Storage (not needed even for the dev Worker's R2 binding: `deploy-dev.yml` uploaded and promoted `rackula-dev` with this token on 2026-09-17. The Worker reaches R2 through its binding at runtime, not through the token), Account Settings: Read (only needed to resolve the account when it is not supplied, and `CLOUDFLARE_ACCOUNT_ID` is passed explicitly), and User Details / Memberships: Read (used by `wrangler whoami`, not by deploys).

  No DNS permission is required. The Custom Domain attach path would have needed DNS: Edit, but `count.racku.la` is bound with a Workers route instead, so the token never touches DNS records.

### Who can rotate

A GitHub repository admin (Settings > Secrets and variables > Actions, covering both repository secrets and any Environment secrets) acting together with a Cloudflare account member who holds Workers and Access administration permissions in the Cloudflare dashboard. Both access levels are required: GitHub admin to update the secret, Cloudflare account access to mint or revoke the token.

### Rotation cadence

Every 90 days, or immediately on suspected compromise. Cloudflare account API tokens support an optional expiry (TTL) set at creation; if no expiry is configured the token stays valid indefinitely and Cloudflare will not prompt you to rotate it. Put a recurring reminder on the calendar for the 90-day cadence regardless, and consider setting an explicit expiry when minting the token so an unrotated token fails closed instead of staying valid forever.

### Rotation procedure

1. In the Cloudflare dashboard, go to My Profile > API Tokens > Create Token. Recreate the same scope as the token being replaced (see the scope table above; for prod that is Workers Scripts: Edit, plus Workers Routes: Edit and Zone: Read on `racku.la`). Do not reuse the old token's name; append a date suffix so the audit log distinguishes them.
2. Copy the new token value immediately; Cloudflare shows it once.
3. Update `CLOUDFLARE_API_TOKEN` with the new value everywhere it is stored: check Settings > Secrets and variables > Actions for a repository secret, and check Settings > Environments > `dev` and > `prod` for environment secrets, and update every copy you find. Do not stop at the first one; a copy left on the old value is a copy still trusting a token you are about to revoke. Confirm `CLOUDFLARE_ACCOUNT_ID` is still correct in each location; it does not usually need to change.
4. Trigger a `workflow_dispatch` run of `Deploy Dev` (Actions > Deploy Dev > Run workflow) and confirm the `deploy` job succeeds. It uploads, promotes and applies triggers with the token, so a green run exercises every scope in the table. Prod uses the same token, so this also verifies the prod path without cutting a release.
5. Once the new token has verified deploy success, return to the Cloudflare dashboard and revoke the old token (API Tokens > find the old entry > Roll or Delete).
6. Note the rotation date and who performed it somewhere durable (a comment on the tracking issue is sufficient); there is no in-repo rotation log to update.

### Revocation on suspected compromise

1. Revoke the token in the Cloudflare dashboard first (API Tokens > Delete), before touching GitHub. This stops the token from being usable immediately, even if the attacker also has GitHub access.
2. Mint a replacement token following steps 1 to 2 above.
3. Update every copy of the secret following step 3 above; do not skip a location because it seems unlikely to be compromised.
4. Verify with a `workflow_dispatch` run following step 4 above.
5. Audit the Cloudflare account's audit log (Manage Account > Audit Log) and the GitHub Actions run history for both the `dev` and `prod` environments, covering the window from when compromise is suspected to have started through the revocation. Look for Worker deployments, R2 object writes, or DNS changes that were not initiated by a known workflow run. Flag anything unexplained to the maintainer.
6. If the audit finds unauthorized activity, escalate: rotate the Cloudflare account owner credentials too, since an account-wide Workers Scripts token implies the compromise could extend beyond this one secret.

## Token class 2: Cloudflare Access service tokens

Used by the browser smoke in `deploy-dev.yml` and the dev leg of `soak-smoke.yml` to authenticate through Cloudflare Access, which fronts d.racku.la.

### Storage

- Secret names: `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`.
- Stored as repository-level GitHub Actions secrets (Settings > Secrets and variables > Actions > Repository secrets), not scoped to a GitHub Environment. Verified via `gh secret list --env dev` and `--env prod`, both empty. `soak-smoke.yml` reads `secrets.CF_ACCESS_CLIENT_ID` / `secrets.CF_ACCESS_CLIENT_SECRET` without an `environment:` binding, which only works because they are repository secrets.
- Prod (`count.racku.la`) is not behind Cloudflare Access today, so there is no prod copy of this pair. If a future issue puts prod behind Access, this section's storage and cadence apply there too; update this file rather than writing a second one.

### Who can rotate

A Cloudflare account member with Access administration permissions (Zero Trust dashboard > Access controls > Service credentials) to mint or rotate the service token, and a GitHub repository admin to update the secrets.

### Rotation cadence

Every 90 days, matching the API token cadence, or immediately on suspected compromise. Cloudflare Access lets you set an explicit duration on a service token at creation time; if a duration is set, treat its expiry as a forcing function and rotate before it lapses rather than after.

### Rotation procedure

1. In the Cloudflare Zero Trust dashboard, go to Access controls > Service credentials > Service Tokens. Create a new service token (or use the dashboard's rotate action on the existing token if available at the time; check whether it issues a new Client Secret for the same Client ID with an overlap window, which avoids a hard cutover).
2. Copy the new Client ID and Client Secret.
3. In GitHub, go to Settings > Secrets and variables > Actions > Repository secrets, and update `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`.
4. Trigger a `workflow_dispatch` run of `Soak Smoke` and confirm the dev leg passes, including the `/api/layouts` check through Access.
5. Once verified, delete the old service token in the Zero Trust dashboard (or confirm the rotate action already invalidated it).

### Revocation on suspected compromise

1. Delete the service token in the Cloudflare Zero Trust dashboard first, before touching GitHub.
2. Mint a replacement following steps 1 to 2 above.
3. Update the GitHub secrets following step 3 above.
4. Verify with a `workflow_dispatch` run following step 4 above.
5. Audit the Cloudflare Access audit log for authentications using the old Client ID, and the GitHub Actions run history for the `dev` environment, covering the suspected compromise window. A compromised Access service token only grants entry through the Access gate; it does not grant Workers or R2 write access, so the blast radius is narrower than the API deploy token, but still confirm no unexpected requests reached `/api/*`.

## Related

- #2675 provisions the account resources and the real token names; this file's placeholders are pending that issue.
- #2031 documents the account-wide blast radius that motivates treating the dev-scoped token as prod-grade.
- `docs/plans/2026-06-29-cloudflare-migration-plan.md` is the source of truth for the broader migration architecture this runbook supports.
