# Gated Release Pipeline Implementation Plan (Rackula #1977)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax. Read `CLAUDE.md` (CI/release conventions, writing style) before editing.

**Goal:** Replace the current "tag push publishes `latest` everywhere with no functional gate" release flow with **stage -> gate -> promote (fail closed)**: a tagged release is staged as a prerelease + immutable Docker tags, validated on real targets (Docker compose health + LXC smoke test on a non-prod Proxmox), and only then promoted (by digest) to `:latest` / GitHub latest / prod, behind a human-approval Environment.

**Architecture:** `release.yml` becomes the single tag-triggered orchestrator. It stages (`gh release create --prerelease`, LXC tarball attached, Docker `:vX.Y.Z` immutable only), gates (compose health on GH-hosted; `scripts/lxc-smoke-test.sh` on the `pve-rusty` self-hosted runner against a throwaway unprivileged CT), then promotes only if all gates pass. `deploy-prod.yml` loses its independent `v*` trigger and becomes a reusable deploy+smoke workflow invoked by the promote stage. A new `build-images.yml` reusable workflow builds+pushes immutable Docker tags.

**Tech Stack:** GitHub Actions, Docker buildx/imagetools, `gh` CLI, Proxmox REST API + SSH (via the homelab `ci-runner`).

**Companion plan:** homelab-infra `docs/superpowers/plans/2026-06-07-ci-runner-vm.md` (provides the runner, the scoped Proxmox token `proxmox-smoke.env`, and the CT SSH key). **That plan must land and the runner be online before the LXC gate can run.**

---

## Out-of-band prerequisites (human, before promote can run)

1. **GitHub `prod` Environment** with a **required reviewer** (you). Create at <https://github.com/RackulaLives/Rackula/settings/environments>. The promote-gate job targets it; gates run automatically, the prod flip waits for approval. (Can be created via API: `gh api -X PUT repos/RackulaLives/Rackula/environments/prod` then add a reviewer — reviewer add is easiest in the UI.)
2. **`ci-runner` online** (companion plan) advertising label `pve-rusty`, with `proxmox-smoke.env`
   - CT SSH key installed.

---

## Design constraints (secure-coding + devil's-advocate, from the issue)

- **Least privilege per job.** Stage jobs: only asset-upload / packages:write for immutable tags. Gate jobs: **no publish creds** (packages: read, contents: read). Promote jobs: the only ones with packages:write + contents:write + prod access, isolated behind the `prod` Environment.
- **Test exactly what ships.** Promote retags the **gated digest** (`buildx imagetools create`), never rebuilds between gate and promote.
- **Untrusted-checkout.** Orchestrator triggers only on maintainer **tag push** / `workflow_dispatch`, never `pull_request`; it only ever checks out the validated CalVer tag. The `pve-rusty` runner is fork-PR-unreachable (repo fork-PR approval = all_external_contributors; no pull_request trigger). All actions pinned by SHA (match existing pins).
- **Fail closed.** Any gate failure = no promote = `latest` unchanged = downstream keeps last-good (automatic rollback, since `latest` is never overwritten until promote).
- **Upgrade baseline = last KNOWN-GOOD, not `latest`.** For v26.6.3, `latest` is the broken v26.6.2, so v26.6.3 runs a **deploy-only** LXC gate; from the next release, upgrade-gate with `--baseline <last-good tarball>`.
- **Override keeps prerelease.** Any emergency gate-skip must NOT auto-promote; the release stays prerelease and the skip is logged loudly. Re-examine the `skip_tests` escape hatch.
- **Promote atomicity.** Most-consumed surface flips last (order: GitHub latest -> Docker :latest -> prod, or per analysis); steps idempotent; partial failure leaves it effectively prerelease.

---

## File Structure

- Modify: `.github/workflows/release.yml` -> orchestrator (stage/gate/promote jobs).
- Create: `.github/workflows/build-images.yml` -> reusable; build+push immutable Docker tags (`:vX.Y.Z`, `:vX.Y.Z-persist`, api `:vX.Y.Z`) + scan + verify-version-alignment; outputs digests.
- Modify: `.github/workflows/deploy-prod.yml` -> remove `push: tags`; convert to `workflow_call` deploy+smoke only (drop build/scan jobs, now in build-images.yml).
- Modify: `.github/workflows/build-lxc.yml` -> confirm prerelease compatibility (publish job's isDraft check already allows prerelease; add no-op note only if needed).
- Create: `.github/workflows/_docker-gate.yml` (optional reusable) OR inline compose gate in release.yml. (Plan uses an inline job to keep the gate close to the orchestrator.)
- Modify: `scripts/lxc-smoke-test.sh` -> API-lifecycle + ssh-into-CT mode (consumes `proxmox-smoke.env`); keep the existing pct path for local dev behind a flag.
- Create: `scripts/lxc-smoke-test-api.sh` IF the refactor is cleaner as a sibling (decide in Task 5).
- Modify: `docs/deployment/` release runbook + note the prerelease->promote window.
- Modify: `CHANGELOG.md` (v26.6.3 — see Task 9, the separate release exercise).

---

## Task 1: Extract immutable Docker build into `build-images.yml`

Move the three build jobs out of deploy-prod.yml into a reusable workflow that pushes **only immutable** tags (`:vX.Y.Z`, `:vX.Y.Z-persist`, api `:vX.Y.Z`) — NO `:latest`, NO `:year_month`. Output the image digests for promote-by-digest.

**Files:** Create `.github/workflows/build-images.yml`.

- [ ] **Step 1: Author `build-images.yml`** with `on: workflow_call` inputs `tag`, `version`, `year_month`; jobs `build-frontend`, `build-persist`, `build-api`, `verify-version-alignment`, `scan-images`. Copy the existing steps from deploy-prod.yml verbatim BUT change each `docker/metadata-action` `tags:` to emit only `type=raw,value=${{ inputs.version }}` (and `v${version}-persist` for persist). Remove all `type=raw,value=latest` and `year_month` lines. Add per-job `outputs` capturing the pushed digest from `build-push-action` (`steps.build.outputs.digest`). Permissions: `contents: read`, `packages: write`. `scan-images` scans the `:vX.Y.Z` tags (not latest).

- [ ] **Step 2: Validate YAML**

```bash
cd .worktree/Rackula-issue-1977
npx --yes @action-validator/cli .github/workflows/build-images.yml 2>&1 || \
  python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/build-images.yml')); print('yaml ok')"
```

Expected: parses; no `latest` tag present (`grep -c 'value=latest' .github/workflows/build-images.yml` -> 0).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build-images.yml
git commit -m "ci: reusable build-images workflow (immutable docker tags only)"
```

---

## Task 2: Convert `deploy-prod.yml` to a reusable deploy+smoke workflow

Strip the independent `v*` trigger and the build/scan jobs (now in build-images.yml). Keep `deploy` (self-hosted vps) + `smoke-test`. Make it `workflow_call` with inputs `tag`, `version`.

**Files:** Modify `.github/workflows/deploy-prod.yml`.

- [ ] **Step 1:** Replace `on:` with:

```yaml
on:
  workflow_call:
    inputs:
      tag: { required: true, type: string }
      version: { required: true, type: string }
```

- [ ] **Step 2:** Delete jobs `build-and-deploy`, `build-persist`, `build-api`, `verify-version-alignment`, `scan-images` (moved to build-images.yml). Keep `deploy` and `smoke-test`; change their `needs:`/inputs to read `inputs.tag` / `inputs.version` instead of the `validate` job. Keep `notify-failure` OR move it to the orchestrator (Task 3 decides; plan keeps a thin failure-notify in the orchestrator).

- [ ] **Step 3:** Validate YAML + confirm no `push:` trigger remains.

```bash
grep -A3 '^on:' .github/workflows/deploy-prod.yml   # must show workflow_call, not push/tags
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy-prod.yml
git commit -m "ci: deploy-prod becomes reusable deploy+smoke (no independent tag trigger)"
```

---

## Task 3: Rewrite `release.yml` as the stage -> gate -> promote orchestrator

Single entry on tag push. Jobs (with `needs:` ordering for fail-closed):

```
validate
 ├─ stage-release   (gh release create --prerelease; changelog notes)
 ├─ stage-docker    (uses build-images.yml)            ─┐
 └─ stage-lxc       (needs stage-release; uses build-lxc.yml -> attaches tarball to prerelease)
gate-docker  (needs stage-docker)   compose health, packages:read
gate-lxc     (needs stage-lxc)      runs-on [self-hosted, pve-rusty], smoke test, no creds
promote-gate (needs [gate-docker, gate-lxc]) environment: prod  ← single approval choke
promote-docker (needs promote-gate) retag digests -> :latest + :year_month (packages:write)
promote-github (needs [promote-gate, promote-docker]) gh release edit --prerelease=false --latest=true
promote-prod   (needs [promote-gate, promote-docker]) uses deploy-prod.yml (vps deploy + smoke)
notify-failure (always, on failure/cancel)
```

**Files:** Modify `.github/workflows/release.yml`.

- [ ] **Step 1: `on:` + top-level**

```yaml
on:
  push:
    tags: ["v*"]
  workflow_dispatch:
    inputs:
      tag:
        {
          description: "Tag to (re)run pipeline for",
          required: true,
          type: string,
        }
      gate_override:
        description: "EMERGENCY: skip gates. Release STAYS prerelease (no auto-promote)."
        type: boolean
        default: false
permissions:
  contents: read
concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false
```

- [ ] **Step 2: `validate` job** — reuse deploy-prod's tag/CalVer validation (single-line guard, newline/CR reject, `^v[0-9]+\.[0-9]+\.[0-9]+$`), output `tag`, `version`, `year_month`.

- [ ] **Step 3: `stage-release` job** (contents: write) — validate changelog entry exists + extract notes (move the existing awk/sed steps here), then:

```yaml
      - name: Create prerelease (staging; excluded from /releases/latest)
        env: { GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}, TAG: ${{ needs.validate.outputs.tag }}, NOTES: ${{ steps.changelog.outputs.notes }} }
        run: gh release create "$TAG" --title "$TAG" --notes "$NOTES" --prerelease
```

- [ ] **Step 4: `stage-docker` job** — `uses: ./.github/workflows/build-images.yml` with `tag/version/year_month` from validate; permissions `contents: read, packages: write`. Expose its digest outputs at the orchestrator level (`outputs:` passthrough) for promote-docker.

- [ ] **Step 5: `stage-lxc` job** — `needs: [validate, stage-release]`, `uses: ./.github/workflows/build-lxc.yml` with `version: needs.validate.outputs.tag`, permissions `contents: write` (attaches tarball to the prerelease).

- [ ] **Step 6: `gate-docker` job** (`needs: stage-docker`, permissions `contents: read, packages: read`). Pull `:vX.Y.Z`, `compose up`, health-check. Skipped when `gate_override`.

```yaml
    if: ${{ !inputs.gate_override }}
    steps:
      - uses: actions/checkout@<pinned> { with: { ref: ${{ needs.validate.outputs.tag }}, sparse-checkout: 'docker-compose.yml\ndeploy/docker-compose.persist.yml' } }
      - name: Compose health gate
        env: { RACKULA_IMAGE: ghcr.io/rackulalives/rackula:${{ needs.validate.outputs.version }} }
        run: |
          docker compose -f docker-compose.yml up -d
          for i in $(seq 1 30); do curl -sf http://localhost:8080/ && break || sleep 3; done
          curl -sf http://localhost:8080/ >/dev/null
          # persistence round-trip against the persist image + /api/health
          # (compose profile or a second `docker run` of :vX.Y.Z-persist; assert /api/health 200)
```

- [ ] **Step 7: `gate-lxc` job** (`runs-on: [self-hosted, pve-rusty]`, permissions `contents: read`). Download the prerelease tarball asset, run the smoke test (deploy-only for the bootstrap; both+baseline thereafter).

```yaml
    if: ${{ !inputs.gate_override }}
    steps:
      - uses: actions/checkout@<pinned> { with: { ref: ${{ needs.validate.outputs.tag }}, sparse-checkout: 'scripts/lxc-smoke-test.sh' } }
      - name: Download staged tarball
        env: { GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}, TAG: ${{ needs.validate.outputs.tag }} }
        run: gh release download "$TAG" --repo "$GITHUB_REPOSITORY" --pattern 'rackula-lxc-*.tar.gz' --dir .
      - name: LXC smoke gate (deploy-only bootstrap for v26.6.3)
        run: |
          set -a; . /opt/github-runner/proxmox-smoke.env; set +a
          bash scripts/lxc-smoke-test.sh --tarball rackula-lxc-*.tar.gz --mode deploy
          # From the next release onward, switch to:
          #   --mode both --baseline <last-good tarball downloaded from prior release>
```

- [ ] **Step 8: `promote-gate` job** (`needs: [gate-docker, gate-lxc]`, `environment: prod`). The single approval choke point. Asserts gates passed (or, if `gate_override`, FAILS so promotion cannot proceed — override leaves the prerelease as-is).

```yaml
if: ${{ always() && needs.gate-docker.result == 'success' && needs.gate-lxc.result == 'success' && !inputs.gate_override }}
environment: prod
runs-on: ubuntu-latest
steps:
  - run: echo "Gates green; awaiting maintainer approval to promote ${{ needs.validate.outputs.tag }}."
```

- [ ] **Step 9: `promote-docker`** (`needs: [validate, stage-docker, promote-gate]`, packages: write). Retag the gated **digests** to `:latest` + `:year_month` via imagetools (no rebuild). Idempotent.

```yaml
- name: Promote by digest
  run: |
    for img in rackula rackula-api; do
      digest="${{ needs.stage-docker.outputs[...] }}"   # the :vX.Y.Z digest for this image
      docker buildx imagetools create \
        --tag ghcr.io/rackulalives/$img:latest \
        --tag ghcr.io/rackulalives/$img:${{ needs.validate.outputs.year_month }} \
        ghcr.io/rackulalives/$img@$digest
    done
    # persist image -> :persist similarly
```

- [ ] **Step 10: `promote-github`** (`needs: [validate, promote-gate, promote-docker]`, contents: write):

```yaml
      - run: gh release edit "${{ needs.validate.outputs.tag }}" --prerelease=false --latest=true
        env: { GH_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
```

- [ ] **Step 11: `promote-prod`** (`needs: [validate, promote-gate, promote-docker]`): `uses: ./.github/workflows/deploy-prod.yml` with tag/version.

- [ ] **Step 12: `notify-failure`** — move the existing alert-issue logic from deploy-prod.yml here (lists failed jobs, opens/updates a `ci-alert` issue).

- [ ] **Step 13: Validate the whole workflow graph**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('ok')"
grep -c 'name: prod' .github/workflows/release.yml   # exactly the promote choke
```

- [ ] **Step 14: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: release.yml stage->gate->promote orchestrator (#1977)"
```

---

## Task 4: Confirm `build-lxc.yml` works with a prerelease

`build-lxc.yml`'s publish job rejects **drafts** but allows non-draft (prerelease is non-draft). No change expected.

- [ ] **Step 1:** Re-read the publish job's `IS_DRAFT` guard; confirm prerelease passes (isDraft=false). Add a one-line comment noting prereleases are intended. Commit only if changed.

---

## Task 5: Refactor `lxc-smoke-test.sh` to API-lifecycle + ssh-into-CT

> **Split out to issue #1982** (own branch/PR). This section is the design reference; execute it under #1982, not inside the #1977 PR. #1977's `gate-lxc` job depends on #1982 landing for live validation, but the #1977 workflow code can merge first (the gate calls the script by name).

The runner VM has no `pct`. Replace `pct`/`pvesh`/`pveam` with Proxmox REST API calls for CT lifecycle, and `pct exec`/`pct push` with `ssh root@<ct-ip>` / `scp`. Consume `proxmox-smoke.env` (`PROXMOX_VE_ENDPOINT/TOKEN_ID/TOKEN_SECRET/NODE`, `RACKULA_CI_POOL`, `RACKULA_CT_STORAGE`, `RACKULA_CT_TEMPLATE`, `RACKULA_CT_ID_BASE`, `RACKULA_CT_SSH_KEY`).

**Files:** Modify `scripts/lxc-smoke-test.sh` (gate API path) — keep the existing local pct path behind `--driver pct|api` (default `pct` for local dev; the gate passes `--driver api`).

- [ ] **Step 1: Write failing test (shellcheck + dry-run contract).** Add a `--dry-run` that, in `api` driver, prints the API calls it WOULD make and exits 0, so we can assert the contract without a host.

```bash
shellcheck scripts/lxc-smoke-test.sh
RACKULA_CT_ID_BASE=9000 bash scripts/lxc-smoke-test.sh --driver api --tarball /tmp/x.tar.gz --mode deploy --dry-run
```

Expected: lists "POST /nodes/$NODE/lxc (vmid in 9000+ range, pool ci-smoke, ssh-public-keys ...)", "status/start", "ssh root@<ip> install", "DELETE". No nextid call.

- [ ] **Step 2: Implement the API helpers.** `_api()` wrapper (curl + token header + `--insecure` when `PROXMOX_VE_INSECURE`); `ct_alloc_id()` picks a free id at/above `RACKULA_CT_ID_BASE` by listing `/pool/ci-smoke` members (NOT `/cluster/nextid` — token lacks that priv); `ct_create()` (`POST /nodes/$NODE/lxc` with `ostemplate`, `storage`, `cores`, `memory`, `net0`, `unprivileged=1`, `features=nesting=1` as the existing test, `ssh-public-keys` from `RACKULA_CT_SSH_KEY.pub`); `ct_start()`, `ct_ip()` (poll `GET .../interfaces` or DHCP lease), `ct_ssh()` (`ssh -i $RACKULA_CT_SSH_KEY -o StrictHostKeyChecking=accept-new root@$ip`), `ct_destroy()` (`DELETE`). Replace `pct exec` -> `ct_ssh`, `pct push` -> `scp -i`.

- [ ] **Step 3: Keep the EXIT-trap teardown** (the prior fix: `CREATED_CTID` set in the parent shell, not a subshell) and the `rackula-smoke-` sentinel hostname guard.

- [ ] **Step 4: Run shellcheck + dry-run; commit.**

```bash
shellcheck scripts/lxc-smoke-test.sh && echo lint-ok
git add scripts/lxc-smoke-test.sh
git commit -m "feat(lxc): api-driver smoke test (ssh-into-CT) for the release gate (#1977)"
```

- [ ] **Step 5: LIVE validation against `ci-runner`.** Once the companion infra plan is live, trigger `gate-lxc` via a `workflow_dispatch` on a test prerelease tag (or run the script directly on the runner). Expected: SMOKE TEST PASSED, CT auto-destroyed, nothing left in `ci-smoke` pool.

---

## Task 6: Release runbook + `/release` awareness

**Files:** Modify `docs/deployment/` runbook (or create `docs/deployment/RELEASE-PIPELINE.md`), note the prerelease->promote window and the approval step. Update the `release` skill's notes if it asserts "tag push = live" anywhere.

- [ ] **Step 1:** Document: tag push -> prerelease + gates -> approve `prod` -> promote. Document the emergency `gate_override` (stays prerelease) and how to manually promote a release that was overridden after a manual check.
- [ ] **Step 2: Commit.**

---

## Task 7: Open the PR (after `/code-review`)

- [ ] **Step 1:** Run `/code-review` on the branch diff; address findings.
- [ ] **Step 2:** `gh pr create` referencing #1977; body summarises stage/gate/promote, the security posture, and the v26.6.3 deploy-only bootstrap. Wait for CodeRabbit (per CLAUDE.md); do not merge until approved.

---

## Task 8 (separate, AFTER merge): exercise the gate — cut v26.6.3 (#1969)

This is the first real run of the pipeline and resolves #1969. Tracked in its own checklist so it isn't done before the pipeline exists.

- [ ] CHANGELOG.md: add `## [26.6.3]` entry highlighting the unprivileged-LXC install fix (#1961) that v26.6.2 shipped broken (#1969).
- [ ] Use `/release` to compute/confirm v26.6.3 and tag.
- [ ] Tag push -> pipeline stages prerelease + runs gates. LXC gate is **deploy-only** (baseline v26.6.2 is broken). Confirm gate-lxc would have caught #1969 (it deploys on an unprivileged CT).
- [ ] Approve the `prod` Environment -> promote. Verify `:latest`, GH latest, prod all on v26.6.3; LXC `fetch_and_deploy latest` now serves v26.6.3.
- [ ] Close #1969 with the promoted release; from v26.6.4 onward switch gate-lxc to `--mode both --baseline <v26.6.3 tarball>`.

---

## Self-Review notes

- Spec coverage vs #1977 AC: fail-closed (gate fail -> no latest) ✓; atomic promote-by-digest ✓; LXC gate runs `lxc-smoke-test.sh` on non-prod Proxmox and would catch #1969 ✓ (Task 8); runbook + release-skill awareness ✓ (Task 6).
- Devil's advocate: baseline=last-good (Task 7/8) ✓; override stays prerelease (Task 3 Step 8, promote-gate `!gate_override`) ✓; promote order + idempotency (Task 3 Steps 9-11) ✓.
- Placeholders to resolve at execution: the exact `stage-docker` digest output wiring (build-push-action `outputs.digest` -> orchestrator `outputs` -> promote-docker); the compose persistence round-trip specifics; whether to keep `notify-failure` in deploy-prod or only the orchestrator (plan: orchestrator only).
- Hard dependency: companion infra plan (runner + `proxmox-smoke.env` + CT key) must be live before Task 5 Step 5 and Task 8.
