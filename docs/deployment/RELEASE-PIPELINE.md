# Release Pipeline

Rackula releases run through a gated pipeline: stage, gate, then promote. A tagged release is not served to `latest` consumers until it passes validation on its real targets. Implemented in `.github/workflows/release.yml` (issue #1977).

## Why

Previously a tag push published `latest` everywhere (Docker `:latest`, GitHub latest, LXC `fetch_and_deploy latest`, prod) in parallel with no functional gate, and the only smoke test ran after prod was already live. A broken build (v26.6.2 on unprivileged LXC, #1969) reached downstream before anyone noticed. The gated pipeline validates the actual artifacts before anything becomes `latest`.

## Flow

1. Stage (automatic on tag push `v*`)
   - `gh release create <tag> --prerelease`. Prereleases are excluded from `/releases/latest`, so LXC `fetch_and_deploy latest` does not pick them up yet.
   - Build the LXC tarball plus a matching `rackula-lxc-<tag>.tar.gz.sha256` and attach both to the prerelease. The `.sha256` file is `sha256sum -c` compatible (one line: hash, two spaces, bare filename) and is generated from the exact uploaded tarball.
   - Build and push Docker images with immutable tags only: `:X.Y.Z`, `:vX.Y.Z-persist`, and api `:X.Y.Z`. No `:latest`. No prod deploy.
2. Gate (automatic, fail closed)
   - Docker gate (GitHub-hosted): `docker compose up` the `:X.Y.Z` image, check `/` 200, then the persist profile (persist frontend + api sidecar) and check `/api/health` 200.
   - LXC gate (self-hosted `ci-runner` on the non-prod Proxmox host pve-rusty): download both the staged tarball and its `.sha256` from the release, verify integrity with `sha256sum -c` (the post-upload checksum check), then run `scripts/lxc-smoke-test.sh` on a throwaway unprivileged CT. A checksum mismatch fails the gate.
   - Any gate failure stops the run. Nothing is promoted. Downstream `latest` consumers keep the prior good version (automatic rollback, because `latest` is never overwritten until promote).
3. Promote (only if all gates pass, behind the `prod` Environment)
   - A maintainer approves the `prod` Environment (single approval choke point).
   - Docker: retag the gated digest to `:latest` and `:YY.M` (by digest, never a rebuild).
   - GitHub: `gh release edit <tag> --prerelease=false --latest=true`.
   - Prod: deploy the VPS and run the post-deploy smoke test.

## Operator actions

Cutting a release (use the `/release` skill, which computes the CalVer version, updates CHANGELOG.md, tags, and pushes). After the tag is pushed:

1. Watch the run: `gh run watch` or the Actions tab. Stage and gate run automatically.
2. When gates pass, the `prod` Environment requests approval. Review the gate results, then approve to promote. Until you approve, the release stays a prerelease and nothing is live on `latest`.
3. If a gate fails, the release stays a prerelease. Fix forward (new tag) or investigate. The prior `latest` is untouched.

## Consumer fetch path

LXC installs fetch the tarball from the release asset, not from a build artifact. Both `deploy/lxc/community-scripts/install/rackula-install.sh` and the `ct/rackula.sh` update flow call `fetch_and_deploy_gh_release "rackula" "RackulaLives/Rackula" "prebuild" "latest" "/opt/rackula" "rackula-lxc-*.tar.gz"`, which resolves the matching asset on the latest (promoted) GitHub release. Because each release publishes `rackula-lxc-<tag>.tar.gz.sha256` alongside the tarball, the fetch helper can verify the download against the published checksum before deploying.

## The prerelease window

Between the tag push and your approval, the release exists as a public prerelease (visible at `/releases/tag/<tag>`) with the tarball attached, but it is not `latest`. This is the validation window. It is normal for a release to sit here until gates finish and you approve.

## Emergency gate override

`workflow_dispatch` exposes `gate_override`. It skips the gates but deliberately does NOT auto-promote: the release stays a prerelease and the skip is logged. To ship an override release you must still promote it manually after your own verification:

```bash
# after manual verification of the staged :X.Y.Z artifacts.
# Retag by digest (same as the automated promote-docker) so :latest points at the
# exact image you verified, not whatever :X.Y.Z resolves to later.
digest="$(docker buildx imagetools inspect --format '{{.Manifest.Digest}}' ghcr.io/rackulalives/rackula:X.Y.Z)"
docker buildx imagetools create --tag ghcr.io/rackulalives/rackula:latest \
  "ghcr.io/rackulalives/rackula@${digest}"   # repeat for -api and persist
gh release edit vX.Y.Z --prerelease=false --latest=true
```

Prefer fixing forward over overriding.

## Upgrade-gate baseline

The LXC gate can run in upgrade mode (`--mode both --baseline <tarball>`). The baseline must be the last KNOWN-GOOD release, not `latest`. For the bootstrap release v26.6.3 the gate runs deploy-only (`--mode deploy`) because the prior `latest` (v26.6.2) is broken. From v26.6.4 onward, pass the previous good release tarball as the baseline.

## Dependencies

- The `prod` GitHub Environment with a required reviewer (repo settings).
- The self-hosted `ci-runner` (homelab-infra) online, advertising label `pve-rusty`, with `proxmox-smoke.env` and the CT SSH key installed.
- The LXC gate's live run depends on the `lxc-smoke-test.sh` api-driver (#1982).
