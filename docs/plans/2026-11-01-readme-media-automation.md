# README Media Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every release refreshes the README hero GIF and still through an auto-merging bot PR, with no maintainer action.

**Architecture:** A Playwright capture run produces frames and a still from a production build. Two shell scripts encode the GIF and decide whether anything visibly changed. A two-job workflow, dispatched after release, captures with no write token and publishes with a PAT in a job that runs no app code.

**Tech Stack:** Playwright, ffmpeg, GitHub Actions, bats, bash.

**Spec:** `docs/superpowers/specs/2026-11-01-readme-media-automation-design.md`

## Global Constraints

- Hero is a GIF: 1000px wide, 12 fps, 6 to 8 seconds, 2 MB budget.
- Generated media lives in `assets/readme/`: `hero.gif` and `rack.png`.
- SSIM below `0.995` on either image means changed.
- Commits need a DCO sign-off (`git commit -s`), format `type: description`, with `Co-Authored-By`.
- No em dashes, en dashes or smart quotes in user-facing text. Do not hard-wrap markdown.
- Workflow actions are pinned by SHA. Copy pins from existing workflows.
- The capture job holds no write token. The publish job runs no code from the repo.
- Nothing in `release.yml` may depend on the media workflow's result.
- Run prettier with the main checkout's binary before committing. Worktrees have no local `node_modules` until `npm ci`.

## Review Focus

- A device is renamed or removed from a brand pack: capture fails on the slug lookup, no PR, alert issue opens. Pinned in Task 1 and Task 4.
- A placed device has no loadable image: capture fails rather than publishing a flat label. Pinned in Task 1.
- The hero exceeds 2 MB: encode fails, no PR. Pinned in Task 2.
- The PAT is missing or expired: publish fails loudly and alerts, unlike autoformat's quiet skip. Pinned in Task 3.
- Two releases land close together: the second run cancels the first and updates the same PR. Pinned in Task 3.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/components/DevicePaletteItem.svelte` | Add a `data-device-slug` attribute |
| `e2e/playwright.media.config.ts` | Capture config, excluded from all test runs |
| `e2e/readme-media/shots.ts` | Shot list and rack contents |
| `e2e/readme-media/recorder.ts` | Frame recorder and fake cursor |
| `e2e/readme-media/capture.spec.ts` | Runs the shots and sanity checks |
| `scripts/encode-hero.sh` | Frames to GIF, enforces the budget |
| `scripts/media-changed.sh` | Compares two media directories |
| `scripts/readme-media.bats` | Tests for both scripts |
| `.github/workflows/update-readme-media.yml` | Capture, publish, alert |
| `.github/workflows/release.yml` | Dispatches the media workflow |
| `README.md`, `docs/guides/TESTING.md` | Point at generated media, explain it |

Delivery is two PRs, because GitHub can only dispatch a workflow that exists on `main`. PR 1 is Tasks 1 to 4. PR 2 is Task 6. Task 5 runs between them and has no code.

---

### Task 1: Capture harness

**Files:**

- Modify: `src/lib/components/DevicePaletteItem.svelte:326`, `package.json`, `.gitignore`
- Create: `e2e/playwright.media.config.ts`, `e2e/readme-media/shots.ts`, `e2e/readme-media/recorder.ts`, `e2e/readme-media/capture.spec.ts`

**Interfaces:**

- Produces: `npm run media:capture`, which writes `media-out/frames/f%04d.png` and `media-out/rack.png`.

Capture decisions, which replace the spike's screencast:

- One `page.screenshot()` per unique frame, held for N output frames by copying the file. This gives constant frame size, no timing jitter and no ffmpeg duration handling.
- Viewport 1120x700, `deviceScaleFactor: 2`, `reducedMotion: "reduce"`, Desktop Chrome.
- Rack: set height to 8 in the Edit panel, then collapse the right panel and press `f` to fit. Five devices fill it exactly. If the field rejects 8, use the `12U` preset with UPS at U1 and accept the gap.
- Use the app's own `DragTooltip`, not a fake ghost. It sat at (0,0) in the spike only because `dragstart` had no coordinates. Pass `clientX` and `clientY` on `dragstart`, and dispatch `dragover` where the document capture listener sees it.
- Keep a fake cursor: an injected fixed-position SVG arrow, added with `page.evaluate`.
- Click `Dismiss hint` before recording, because `.onboarding-hint` shows on an empty rack.
- Press `Escape` after each drop so the selection outline does not sit on the rack.
- Trigger the flip by clicking the `Toggle display mode` button, with the cursor visibly on it.

- [ ] **Step 1: Add `data-device-slug={device.slug}` to the palette item at `DevicePaletteItem.svelte:326`**

No test: this is a pass-through attribute.

- [ ] **Step 2: Create `e2e/readme-media/shots.ts`**

```ts
// bottomU: a drop anchors the device's bottom U.
export const RACK_DEVICES = [
  { slug: "ubiquiti-unifi-dream-machine-pro", search: "udm pro", bottomU: 8 },
  {
    slug: "ubiquiti-unifi-switch-48-pro-poe-gen2",
    search: "usw pro 48 poe",
    bottomU: 7,
  },
  { slug: "ubiquiti-unas-pro", search: "unas pro", bottomU: 5 },
  { slug: "dell-poweredge-r730xd", search: "r730xd", bottomU: 3 },
  { slug: "apc-smt1500rmi2uc", search: "smt1500", bottomU: 1 },
];
```

Export `interface MediaShot { name: string; run(page: Page, out: string): Promise<void> }` and `MEDIA_SHOTS: MediaShot[]` with `hero` and `rack`. Adding a docs shot means adding one entry here.

- [ ] **Step 3: Create `e2e/readme-media/recorder.ts`**

Export `class FrameRecorder { constructor(page: Page, dir: string); snap(holdFrames?: number): Promise<void>; moveCursor(to: Point, frames: number, onStep?: (p: Point) => Promise<void>): Promise<void> }`. `snap` uses `animations: "disabled"`, `caret: "hide"`, and numbers files continuously.

Timeline at 12 fps: intro 6 frames, each device 10 frames, cursor to toggle 6 frames, flip then hold 28 frames. Total 90 frames, 7.5 seconds.

- [ ] **Step 4: Create `e2e/playwright.media.config.ts`**

Match `readme-media/capture.spec.ts`. Reuse the `webServer` block from `e2e/playwright.visual.config.ts`, with `retries: 0` and `timeout: 180_000`. Add `"media:capture": "playwright test --config e2e/playwright.media.config.ts"` to `package.json`. Add `media-out/` to `.gitignore`. Confirm the default `e2e/playwright.config.ts` does not pick up the new folder, and exclude it if it does.

- [ ] **Step 5: Write `e2e/readme-media/capture.spec.ts` with sanity checks as the test**

```ts
for (const d of RACK_DEVICES) {
  const front = page.locator(
    `[data-testid="rack-front"] [data-device-id="${d.slug}"]`,
  );
  await expect(front).toHaveAttribute(
    "aria-label",
    new RegExp(`at U${d.bottomU}$`),
  );
  expect(await imagesLoaded(page, d.slug)).toBeGreaterThan(0);
}
```

`imagesLoaded` runs in the page: for each `image` element under that `data-device-id`, fetch `href.baseVal`, pass the blob to `createImageBitmap`, and count those with non-zero width. A palette lookup by `data-device-slug` that finds nothing must throw, naming the slug. This covers two Review Focus lines.

- [ ] **Step 6: Run it**

Run: `npm run media:capture`, then `ls media-out/frames | wc -l` Expected: PASS, 90 frames, all 2240x1400, and `media-out/rack.png` exists.

- [ ] **Step 7: Prove the failure path**

Change one slug to `does-not-exist` and rerun. Expected: FAIL naming the slug. Revert it.

- [ ] **Step 8: Review the output by eye, then commit**

Read a contact sheet of `media-out/frames`. Check for no hint, no selection outline, the tooltip following the cursor, and real images after the flip.

```bash
git add src/lib/components/DevicePaletteItem.svelte package.json .gitignore e2e/playwright.media.config.ts e2e/readme-media
git commit -s -m "feat: add README media capture harness"
```

### Task 2: Encode and compare scripts

**Files:**

- Create: `scripts/encode-hero.sh`, `scripts/media-changed.sh`, `scripts/readme-media.bats`

**Interfaces:**

- Consumes: `media-out/frames/f%04d.png` from Task 1.
- Produces: `scripts/encode-hero.sh <frames-dir> <out.gif>`, exit 1 over budget. `scripts/media-changed.sh <old-dir> <new-dir>`, printing `changed=true` or `changed=false`, exit 0 either way, non-zero only on a tool error.

- [ ] **Step 1: Write failing bats tests**

Generate fixtures with ffmpeg's `color` and `testsrc` sources, following the setup style in `scripts/next-version.bats`.

- `encode-hero: writes a 1000px wide GIF with every frame`: assert width 1000 and the read frame count equals the input count.
- `encode-hero: fails over budget`: set `HERO_MAX_BYTES=100`, assert non-zero exit and output naming the budget.
- `media-changed: identical media is unchanged`: assert `changed=false`.
- `media-changed: a different still is changed`: assert `changed=true`.
- `media-changed: a different final GIF frame is changed`: assert `changed=true`.
- `media-changed: missing baseline is changed`: empty old dir, assert `changed=true`.

- [ ] **Step 2: Run to verify they fail**

Run: `bats scripts/readme-media.bats` Expected: FAIL, scripts not found.

- [ ] **Step 3: Implement `scripts/encode-hero.sh`**

Scale to 1000px with lanczos into a temp directory first, then run a two-input palette pass: `palettegen=max_colors=128:stats_mode=diff`, `paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, at 12 fps with `-loop 0`. `HERO_MAX_BYTES` defaults to `2000000`.

- [ ] **Step 4: Implement `scripts/media-changed.sh`**

Compare `rack.png` directly, and `hero.gif` by last frame (`-sseof -0.2` to a PNG). Read `All:` from ffmpeg's `ssim` filter. Scale the new image to the old one's size first, so a size change compares rather than errors.

- [ ] **Step 5: Run to verify they pass**

Run: `bats scripts/readme-media.bats` Expected: 6 tests, 0 failures.

- [ ] **Step 6: Run against real frames and commit**

Run: `scripts/encode-hero.sh media-out/frames media-out/hero.gif`, then `ls -l media-out/hero.gif` Expected: under 2 MB. If over, lower `max_colors` before touching anything else.

```bash
git add scripts/encode-hero.sh scripts/media-changed.sh scripts/readme-media.bats
git commit -s -m "feat: add hero encode and media change detection scripts"
```

### Task 3: Media workflow

**Files:**

- Create: `.github/workflows/update-readme-media.yml`

**Interfaces:**

- Consumes: `npm run media:capture` and both scripts.
- Produces: `workflow_dispatch` with a string input `tag`, optional. Empty resolves to the latest release through `gh release view --json tagName`.

Top level: `permissions: {}` and `concurrency: { group: update-readme-media, cancel-in-progress: true }`.

- [ ] **Step 1: Write the `capture` job**

`permissions: contents: read`. Check out the tag with `persist-credentials: false`, plus a second checkout of `main` into `baseline/`. Copy node, npm and Playwright cache steps from `update-visual-snapshots.yml`. Install ffmpeg with apt. Run capture and encode, copy `rack.png` and `hero.gif` to `media-final/`, and run `media-changed.sh baseline/assets/readme media-final`. Expose `changed` as a job output. Upload `media-final/` as artifact `readme-media`, retention 7 days.

- [ ] **Step 2: Write the `publish` job**

`needs: capture`, `if: needs.capture.outputs.changed == 'true'`, `permissions: {}`. No `actions/checkout`. All git and `gh` calls use `secrets.AUTOFORMAT_PAT`.

1. Fail with a clear message if the PAT is empty. Do not skip.
2. Download the artifact. Reject it unless it holds exactly `hero.gif` and `rack.png`, `hero.gif` is under 2 MB, `rack.png` is under 4 MB, and `file` reports GIF and PNG.
3. Shallow clone `main`, as `autoformat.yml`'s push job does. Branch `bot/readme-media`, copy into `assets/readme/`, commit with `-s` as `chore: refresh README media for <tag>`, and force-push that branch only.
4. If no open PR exists from that branch, `gh pr create`. Then `gh pr merge --auto --squash`.

- [ ] **Step 3: Write the `alert` job**

`needs: [capture, publish]`, `if: ${{ failure() }}`, `permissions: issues: write`. Open or update an issue titled `CI Alert: README media capture failed` with the run URL. Copy the find-or-create approach from `notify-failure` in `release.yml`.

- [ ] **Step 4: Lint and commit**

Run: `actionlint .github/workflows/update-readme-media.yml`, or `npx yaml-lint` if actionlint is not installed. Expected: no errors. Say which tool ran.

```bash
git add .github/workflows/update-readme-media.yml
git commit -s -m "feat: add README media workflow"
```

### Task 4: Release hook and PR 1

**Files:**

- Modify: `.github/workflows/release.yml` (after `promote-github`, near line 515)

**Interfaces:**

- Consumes: the `tag` input from Task 3.

- [ ] **Step 1: Add a `refresh-readme-media` job**

`needs: [validate, promote-github]`, `permissions: actions: write`, following `rescan-main`:

```yaml
run: gh workflow run update-readme-media.yml --ref main -f tag="$TAG"
```

Do not add it to `notify-failure`'s `needs`, and add no job that depends on it.

- [ ] **Step 2: Check the release graph**

Run: `grep -n 'refresh-readme-media' .github/workflows/release.yml` Expected: only the job's own definition.

- [ ] **Step 3: Commit, push and open PR 1**

Run `npm run lint`, `npm run check` and `npm run format:check`, then:

```bash
git add .github/workflows/release.yml
git commit -s -m "feat: refresh README media after each release"
```

Follow the project PR workflow. Wait for CodeRabbit and CodeAnt before merging.

### Task 5: Prove the bot path (no code)

Requires the maintainer to have added Pull requests write to `AUTOFORMAT_PAT`, and PR 1 merged. Stop and ask if the PAT scope is not done.

- [ ] **Step 1: Run against main**

Run: `gh workflow run update-readme-media.yml --ref main -f tag=main` Expected: a PR from `bot/readme-media` adding `assets/readme/`, `validate` and `docker images` run, and it auto-merges.

- [ ] **Step 2: Check the no-change path**

Run the same command again after the merge. Expected: `publish` is skipped and no PR opens.

- [ ] **Step 3: Check the failure path**

Push a throwaway branch with one slug broken in `shots.ts`, then run `gh workflow run update-readme-media.yml --ref main -f tag=<branch>`. Expected: `capture` fails, no PR, and a `CI Alert` issue opens. Close the issue and delete the branch.

- [ ] **Step 4: Check the race**

Dispatch twice in quick succession. Expected: the first run is cancelled.

### Task 6: Switch the README (PR 2)

**Files:**

- Modify: `README.md:25,29`, `docs/guides/TESTING.md`
- Delete: `assets/Rackula-hero-drac.gif`, `assets/screenshot-dracs-rack.png`, `static/screenshot-dracs-rack.png`

- [ ] **Step 1: Point the README at the new files**

Use `assets/readme/hero.gif` and `assets/readme/rack.png`. Set both widths to `800`. Update the hero alt text to describe the rack.

- [ ] **Step 2: Delete the old files**

Run: `grep -rn 'Rackula-hero-drac\|screenshot-dracs-rack' --include='*' . | grep -v -E 'node_modules|docs/(plans|superpowers|research)|CHANGELOG'` Expected: nothing after the deletions.

- [ ] **Step 3: Add a short section to `docs/guides/TESTING.md`**

Say that `assets/readme/` is generated, is refreshed after each release, must not be edited by hand, and that `npm run media:capture` runs it locally. Name `e2e/readme-media/shots.ts` as where to add a shot.

- [ ] **Step 4: Commit and open PR 2**

```bash
git add -A README.md docs/guides/TESTING.md assets static
git commit -s -m "docs: use generated media in README"
```

Follow the project PR workflow.
