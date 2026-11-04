# README media automation design

Date: 2026-11-01. Status: awaiting approval.

## Intent

The README's images go stale because updating them by hand never gets done. The hero GIF shows a toolbar that no longer exists, and the screenshot shows fractional-U controls that contradict the whole-U rail model. The maintainer wants these images to stay current with no manual work.

The hero has one job: a homelabber landing on the README sees that they can get their own rack, with real gear, in seconds.

## Goals

- Every release refreshes the README hero and still without maintainer action.
- The hero is a short loop: drop gear into a rack, flip to real product images.
- The still replaces `assets/screenshot-dracs-rack.png` with the current UI.
- A broken capture never blocks a release and never changes the README.
- Adding a docs screenshot later means adding one entry to a shot list.

## Non-goals

- Docs and release-note screenshots. The structure allows them; this work does not add them.
- The OG card (`static/og-image.png`), which is a static brand image.
- Mobile captures.
- Replacing or changing the visual regression suite.

## Anti-goals

- A PR every release when nothing visibly changed.
- A long tour. Each extra step is another place for the script to break, which brings the upkeep back.
- A failure mode that needs the maintainer to fix something during a release.
- A broken or half-empty image reaching the README.

## Constraints

- GitHub READMEs do not play video stored in the repo, so the hero is an image format.
- `main` needs a PR with `validate` and `docker images` passing. No review is required.
- The repo setting that lets Actions create PRs is off (`can_approve_pull_request_reviews: false`), and PRs from `GITHUB_TOKEN` would not trigger checks anyway. The PR must be opened with a personal access token. `import-netbox.yml` passes `GITHUB_TOKEN` to its PR step, so do not copy its token.
- `AUTOFORMAT_PAT` is a fine-grained token, documented with Contents write. It needs Pull requests write added for this workflow.
- An image PR is not docs-only under `test.yml`'s `is_docs` filter, because `assets/*` is not listed. `validate` and `docker images` run in full on it.
- Repo auto-merge is enabled. `E2E_SELF_HOSTED` leaves PRs UNSTABLE if set while no runner is online, which blocks `--auto`.
- PR commits need a DCO sign-off.
- `update-visual-snapshots.yml` deliberately holds no write credentials. Keep the write token out of any job that runs app code, following the two-job split in `autoformat.yml`.
- Prod is assets-only. The workflow builds the app itself; it does not add anything to `rackula-prod`.
- `assets/**` is a Deploy Dev input, so a merged image PR triggers a harmless dev deploy.

## Approaches

| Approach | Trade-off | Outcome |
| --- | --- | --- |
| A. Workflow after release opens an images PR | One more workflow with write access; images land just after the tag | Chosen by the maintainer. Removes them from the loop, and a failure cannot touch a release |
| B. Capture locally inside `/release` | No new credentials and images ship in the release commit, but it slows every release, needs a working local Playwright, and breaks at the worst time | Rejected |
| C. Scheduled capture against count.racku.la | Needs the same PR plumbing as A, and images lag releases | Dropped before the choice |

## Decided by the maintainer

- README first, structured so docs can be added later.
- Hero story: place real devices in a rack, then flip to real images. A spike GIF of this was reviewed and accepted.
- Approach A: a workflow PR after each release.

## Design

### Spike result

The accepted spike: 1000px wide, 12 fps, 9.9 seconds, 0.76 MB, flip at 4.7 seconds. The current hero is 500px, 24.5 seconds and 1.4 MB. The spike scripts were throwaway and are not in the repo.

Recorded in the spike: UDM-Pro at U12, USW-Pro-48-PoE at U11, UNAS Pro at U9, PowerEdge R730xd at U7, SMT1500RMI2UC at U1, on a 12U rack, 1120x700 viewport, right panel collapsed.

### Parts

1. Shot list: a small typed module listing each output, with its path, viewport and capture steps. The README entries are `hero` and `rack`. Docs entries get added here later.
2. Capture script: Playwright against a local production build, with its own config under `e2e/`, separate from the visual suite so it does not run with tests. It reuses `e2e/helpers` where they fit. Available as an npm script so it can run locally on demand.
3. Sanity checks, run before any image is accepted:
   - every expected device is placed at its expected U
   - every device image has loaded, front and rear where expected
   - the hero stays under the size budget of 2 MB
4. Workflow `update-readme-media.yml`, triggered by `workflow_dispatch` only, with a `tag` input that defaults to the latest release tag. One concurrency group per workflow, cancel-in-progress, so two quick releases cannot race on the PR branch.
   - An unprivileged job, with no write token, checks out the tag, builds, captures, and runs the change comparison. It uploads the images and a `changed` flag as an artifact.
   - A privileged job runs no app code. It treats the artifact as untrusted and validates it as `autoformat.yml` does, with a path allowlist and a size cap. It commits the images on a branch from `main` and opens or updates a single PR from that fixed branch.
5. Release hook: a job in `release.yml` dispatches the workflow on `main` with the release tag, following the `rescan-main` pattern, after `promote-github` succeeds. It must not be a dependency of any promote job, and it is not added to `notify-failure`'s `needs`, because the dispatch is fire and forget.
6. README: point at the new files, with `assets/readme/` as the home for generated media. Add a note in the docs saying these files are generated.
7. Cleanup: delete `assets/Rackula-hero-drac.gif`, `assets/screenshot-dracs-rack.png` and the unreferenced `static/screenshot-dracs-rack.png`.

### Avoiding no-op PRs

GIF bytes differ on every run because of timing jitter, so a byte comparison would open a PR every release. Change detection compares the final hero frame and the still against the versions committed on `main` with a pixel tolerance, the same idea as the visual suite's `maxDiffPixelRatio`. If neither changed visibly, no PR is opened. The comparison runs in the unprivileged job, so the privileged job needs no image tooling.

### Merging

The PR auto-merges with `gh pr merge --auto --squash` once required checks pass, as Dependabot PRs do. This is the builder's default per the calls below.

### Failure behaviour

A capture or sanity failure fails the workflow run, opens no PR, and leaves current images in place. The release is unaffected because the dispatch happens after promotion and nothing depends on the result.

A bot-dispatched run has no person attached, so a failure email cannot be relied on. A failure job opens or updates a `CI Alert` issue, following `notify-failure` in `release.yml`. A missing PAT is a failure, not the quiet skip `autoformat.yml` uses, so the alert still fires.

A PR that cannot go green stays open and visible, the current images stay in place, and the next run updates the same PR. No timeout is needed.

### Capturing the tag, not main

Images must match what users actually run, and `main` may hold unreleased UI. The workflow captures from the tag using that tag's own capture script, then opens the PR against `main`. Because generated files are only images, this cannot conflict with code on `main`.

The first tag containing the capture script is the first one the release hook can capture. Before that, use the manual run against a tag or ref that has it.

### First images

GitHub can only dispatch a workflow that already exists on `main`, so the first images cannot come from a run on the implementation branch. PR 1 ships the capture, scripts and workflow. A manual run against `main` then opens the first bot PR, which adds `assets/readme/` and proves the bot path. PR 2 switches the README and deletes the old files, so the comparison has a Linux baseline before the README depends on it.

### Device images

Device images are bundled at build time (`src/lib/data/bundledImages.ts`, `src/lib/assets/device-images/`), so capture needs no network access to an image host. The spike's devices still need mapping to stable slugs. `ubiquiti-unas-pro`, `dell-poweredge-r730xd` and `apc-smt1500rmi2uc` have front and rear images on disk. UDM-Pro and USW-Pro-48-PoE rendered in the spike, but their files were not traced, so check them. A fresh session opens a default rack, so no first-run flow needs handling.

### Known capture pitfalls from the spike

- A rack with no devices shows `.onboarding-hint`, not a toast. Dismiss it with its button before recording. `.toast-container` does not cover it.
- Headless capture has no pointer. The spike injected a fake cursor and drag ghost. The ghost needs checking: one frame showed a stray label near the top left, source unconfirmed.
- Chromium's screencast sends 1x frames during motion and 2x frames when still. A size change mid-sequence resets ffmpeg's `palettegen`, which silently drops every frame before the change. Normalise frame size first, or use a capture method with a constant size.
- ffmpeg's concat demuxer dropped frames with very short durations. Resampling to a fixed frame-rate grid avoids this.
- Search can return several entries for one model, and only some carry images. Choose devices by a stable identifier, not the first name match. The spike's first picks came back with no image.
- A drop anchors a device's bottom U, so a 2U device aimed at U10 occupies U10 and U11.
- The Homebrew ffmpeg has no `libwebp_anim`. WebP was not tested on GitHub, so ship GIF.
- Native HTML5 drag needs synthetic `DragEvent`s, as in `dragDeviceToRack`.

### Hero polish to carry into the real capture

- Clear the rack selection outline during the build.
- Aim for 6 to 8 seconds. Dropping one device gets most of the way.
- Fill or close the empty mid-rack gap.

## Calls made by the author, not the maintainer

- Auto-merge with no human review, given the sanity checks. The alternative is a PR that waits for a glance.
- Trigger after `promote-github`, so images land only for a release that really went out.
- GIF over WebP, at 1000px wide, with a 2 MB budget.
- Rack name stays the default "Racky McRackface".
- Pixel-tolerance change detection over byte comparison.
- `AUTOFORMAT_PAT` is reused, with Pull requests write added, rather than adding a second token to rotate. The maintainer makes this scope change once; a builder cannot.
- Capture from the release tag, not `main`.
- Failure alert through a `CI Alert` issue, not email.
- First images come from the first bot PR, then a second PR switches the README.

## Verification

The bot PR path has not been tested. Prove it with a manual run before relying on it: confirm the PR opens, checks run, and auto-merge fires. Test the no-change path with a second run, which must open no PR. Test the failure path with a forced sanity failure, which must open an alert issue.

## Left to the builder

- Capture method, as long as output is sharp and frame sizes are constant.
- Exact shot list schema and file layout under `e2e/`.
- Pixel tolerance value.
- Which PR action or commands to use, as long as the commit is signed off.
- Runner and ffmpeg provisioning.
- Device list, as long as it stays mixed-brand homelab gear with images.
