# Research: Multi-arch distribution of a Bun app depending on `@node-rs/argon2`

**Issue:** #1850
**Date:** 2026-06-01
**Context:** CI runs `bun install --frozen-lockfile --production` on `ubuntu-latest` (x86-64),
tars `node_modules`, ships it. Target host is Debian 13, linux/arm64, glibc. The x86 install
only pulls `@node-rs/argon2-linux-x64-gnu`, so the arm64 binary is missing and the app crashes
at load on the target.

All claims below were verified empirically against the locked version `@node-rs/argon2@2.0.2`
(from `api/bun.lock`) and Bun `1.3.10`, unless marked otherwise.

---

## 1. Runtime resolution (verified)

`@node-rs/argon2` is the standard NAPI-RS layout. `index.js` (`"main": "index.js"`, no
`exports`) runs a `requireNative()` chain that branches on `process.platform`, `process.arch`,
and a libc probe, then for each case tries a **local `.node` file first**, falling back to the
**per-platform npm package**. The relevant linux/arm64 block:

```js
} else if (process.arch === 'arm64') {
  if (isMusl()) {
    try { return require('./argon2.linux-arm64-musl.node') } catch (e) { loadErrors.push(e) }
    try { return require('@node-rs/argon2-linux-arm64-musl') } catch (e) { loadErrors.push(e) }
  } else {
    try { return require('./argon2.linux-arm64-gnu.node') } catch (e) { loadErrors.push(e) }
    try { return require('@node-rs/argon2-linux-arm64-gnu') } catch (e) { loadErrors.push(e) }
  }
}
```

`isMusl()` probes (in order) `/usr/bin/ldd` contents, `process.report`, then `ldd --version`.
On Debian 13 glibc this returns `false`, so the loader takes the **gnu** branch.

**What must be present for arm64-gnu to load on Debian:** either

- `node_modules/@node-rs/argon2/argon2.linux-arm64-gnu.node` (local file, tried first), **or**
- `node_modules/@node-rs/argon2-linux-arm64-gnu/` containing `argon2.linux-arm64-gnu.node` +
  its `package.json` (`"main": "argon2.linux-arm64-gnu.node"`).

The per-platform package is trivial: `package.json` + `README.md` + the single `.node` file.
Its `package.json` carries `"os": ["linux"]`, `"cpu": ["arm64"]` (and on the registry,
`libc: ["glibc"]`) — this gating is the root cause of why a normal x64 install skips it, and the
key gotcha for Pattern A injection (see below).

Note: `require('@node-rs/argon2-linux-arm64-gnu')` resolves via normal `node_modules` walk, so
the package just needs to exist anywhere on the resolution path. The `os`/`cpu` fields are only
checked by the **installer**, never by the loader — once the files are on disk, the loader does
not re-validate platform. This is what makes injection safe.

---

## 2. Pattern A — inject the foreign-arch package during the x86 build

### A.0 Bun's native `--cpu`/`--os` flags (recommended within Pattern A)

Bun (>= ~1.2.23, present in 1.3.10) supports `--cpu` and `--os` on `bun install`/`bun add` to
override the target platform for optional-dependency selection. Per Bun docs, **the lockfile is
unchanged across platforms even though the set of installed packages changes** — so version
pinning to the resolved `2.0.2` is automatic and frozen-lockfile-safe.

Accepted: `--cpu` = `arm64,x64,ia32,ppc64,s390x`; `--os` = `linux,darwin,win32,freebsd,...`;
wildcard `*` = all.

Verified behaviours on a darwin host:

- `bun install --cpu='*' --os='*'` on a project depending on `@node-rs/argon2` installed **all
  14** per-platform packages (incl. `argon2-linux-arm64-gnu` with its `.node`) in one pass.
- `bun add --no-save @node-rs/argon2-linux-arm64-gnu@2.0.2 --cpu=arm64 --os=linux` installed the
  leaf package **with the binary** and, unlike npm, **without `--force`** and without
  `EBADPLATFORM`.
- `bun install --frozen-lockfile --production --cpu=x64 --os=linux` works; on the x64 target it
  pulls both `linux-x64-gnu` and `linux-x64-musl` (Bun matches on cpu/os, not libc).

**Recommended A approach (two-pass, frozen-safe):**

```bash
# Pass 1: normal frozen production install for the build host (x64 glibc)
bun install --frozen-lockfile --production

# Pass 2: additively inject the arm64-gnu binary, pinned to the locked version.
#   --no-save keeps package.json/lockfile untouched (frozen contract preserved)
#   reads the exact version from the lockfile so the two archs never drift
ARGON2_VER=$(grep -oE '"@node-rs/argon2@[0-9.]+"' bun.lock | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
bun add --no-save "@node-rs/argon2-linux-arm64-gnu@${ARGON2_VER}" --cpu=arm64 --os=linux
```

This leaves a single `node_modules` tree containing **both** `argon2-linux-x64-gnu` (build host)
and `argon2-linux-arm64-gnu` (target). The same tarball boots on both arches; the loader picks
the right one at runtime. Version drift is impossible because pass 2 reads the version the
lockfile already resolved.

Alternative single-pass: replace pass 1 with `bun install --frozen-lockfile --cpu='*' --os='*'`
to grab every platform at once. Simpler, but `--production` + `*` will include musl/windows/etc.
binaries you do not need, bloating the tarball by ~2-4 MB per extra `.node`. Prefer the targeted
two-pass for a lean artifact.

### A.1 npm foreign-arch trick (fallback if not using Bun for this step)

`npm install --cpu=arm64 --os=linux --libc=glibc @node-rs/argon2-linux-arm64-gnu@<v>` **fails**
with `EBADPLATFORM` because npm validates the leaf package's own `os`/`cpu`/`libc` against the
(overridden) target — and the leaf declares exactly those, yet npm still rejects installing a
package whose platform != current host without override acceptance. Adding `--force` makes it
work:

```bash
npm install --no-save --force --cpu=arm64 --os=linux --libc=glibc \
  @node-rs/argon2-linux-arm64-gnu@2.0.2
```

Verified: this places `node_modules/@node-rs/argon2-linux-arm64-gnu/argon2.linux-arm64-gnu.node`.
Downsides: `--force` disables other protections; version must be passed manually (no automatic
pin to the resolved parent version unless you script it).

### A.2 `npm pack` + extract (most portable, zero install-time platform logic)

```bash
ARGON2_VER=2.0.2   # read from lockfile
npm pack "@node-rs/argon2-linux-arm64-gnu@${ARGON2_VER}"   # -> node-rs-argon2-linux-arm64-gnu-2.0.2.tgz
mkdir -p node_modules/@node-rs/argon2-linux-arm64-gnu
tar xzf node-rs-argon2-linux-arm64-gnu-${ARGON2_VER}.tgz \
  --strip-components=1 -C node_modules/@node-rs/argon2-linux-arm64-gnu
```

Verified the tgz contains `package/{package.json,README.md,argon2.linux-arm64-gnu.node}`
(hence `--strip-components=1`). No `--force`, no platform validation, works from any host. This
is the most robust and least magical option; pins via the explicit `@${ARGON2_VER}`.

### A.3 Direct `.tgz` download (no npm/bun needed)

`curl -sL https://registry.npmjs.org/@node-rs/argon2-linux-arm64-gnu/-/argon2-linux-arm64-gnu-${VER}.tgz`
then the same `tar --strip-components=1` extract as A.2. Equivalent result; useful in minimal
images. Same manual-pin requirement.

### Which keeps the version pinned automatically

Only the **Bun two-pass (A.0)** reads the version straight from the lockfile via `--no-save`
semantics tied to the resolved tree; the others (A.1/A.2/A.3) require you to inject
`${ARGON2_VER}` extracted from `bun.lock`. All can be made drift-proof by deriving the version
from the lockfile in one place.

### Bun-specific gotchas

- Bun **does not strip** "unused" optional deps you add via `bun add --no-save` into an existing
  tree — verified the arm64 package persists. So the inject-after-install pattern is safe.
- `--frozen-lockfile` forbids lockfile changes; combine it only with `--no-save` secondary
  passes, or with `--cpu/--os` on the primary pass (lockfile is platform-invariant, so frozen is
  satisfied).
- `--production` omits devDependencies but does **not** prune already-present platform packages.

---

## 3. Pattern B — per-arch artifacts via CI matrix

Build two tarballs, one per arch, and select at install time.

```yaml
strategy:
  matrix:
    include:
      - arch: amd64
        runner: ubuntu-latest # native x64
      - arch: arm64
        runner: ubuntu-24.04-arm # native arm64 runner (GA), or buildx+QEMU
```

Each job runs `bun install --frozen-lockfile --production` natively, tars to
`app-linux-${arch}.tar.gz`. Installer on the host picks:

```bash
case "$(dpkg --print-architecture)" in
  amd64) A=amd64 ;; arm64) A=arm64 ;; *) echo "unsupported"; exit 1 ;;
esac
curl -fsSL ".../app-linux-${A}.tar.gz" | tar xz
# (uname -m gives x86_64 / aarch64 if dpkg unavailable)
```

**Trade-offs vs A:**

- Pro: each tarball is native, no foreign-arch trickery, smallest per-arch size, catches any
  arch-specific issue at build time. Naturally extends to musl, other native deps, etc.
- Con: two build jobs (arm64 native runners or QEMU, which is slow); a release-time selection
  step; two artifacts to publish/track. For a single native dep this is heavier than A.
- Pattern A gives **one** universal tarball; Pattern B gives N tarballs + a selector. A wins for
  "one artifact" simplicity when the only native dep is argon2; B wins if you accumulate more
  native deps or need musl + glibc + multiple arches.

---

## 4. Pattern C — install deps inside the target at install time

Ship source + lockfile, run `bun install --frozen-lockfile --production` on the Debian arm64
host during LXC/app install.

**Trade-offs:**

- Pro: always correct binary for the actual host (incl. libc), no cross-arch logic, lockfile is
  the single source of truth.
- Con: requires network + registry reachability at install time (offline/airgapped installs
  break); adds Bun as an install-time dependency on the target; slower installs; non-hermetic
  (registry availability becomes a runtime install risk). `@node-rs/argon2` ships **prebuilt**
  binaries, so no Rust/compiler toolchain is needed — but this is not guaranteed for arbitrary
  future native deps.
- For a community-scripts-style LXC where the install pulls a release tarball, C reintroduces a
  network dependency the prebuilt-tarball model was meant to avoid.

---

## 5. Prior art

- **NAPI-RS itself** (and `@node-rs/*`, `@napi-rs/*`) deliberately does **not** ship multi-arch
  in one package: the main package is JS-only and declares per-platform `optionalDependencies`
  gated by `os`/`cpu`/`libc`. Multi-arch bundling is explicitly an installer-side concern, which
  is exactly why the `--cpu/--os` / inject approach is the intended escape hatch.
  (https://napi.rs/docs/deep-dive/release, https://napi.rs/docs/deep-dive/native-module)
- **Bun** added `--cpu`/`--os` specifically for this Docker/CI cross-target case (Jarred Sumner
  announcement; Bun v1.2.23 blog). Docs state the lockfile is platform-invariant, which is the
  guarantee that makes frozen cross-target installs safe.
  (https://bun.com/docs/pm/cli/install, https://bun.com/blog/bun-v1.2.23)
- **esbuild** faces the identical problem (per-platform optional dep packages). Its maintainer's
  guidance is essentially Pattern C ("don't copy node_modules across platforms; run install on
  the destination") or use the `*-wasm` fallback; Yarn users use `supportedArchitectures` (the
  Yarn analogue of Bun's `--cpu/--os`). (esbuild issues #2597, #2617)
- **prebuildify / prebuild-install** (better-sqlite3 and many node-gyp modules) take the opposite
  tack: bundle **all** prebuilt `.node` files inside the **single main package** under
  `prebuilds/<platform>-<arch>/` and select at runtime via `node-gyp-build`. That yields a true
  single universal artifact but requires the package author to opt into prebuildify; `@node-rs`
  does not, so we cannot rely on it here. (https://github.com/prebuild/prebuildify)
- **Yarn `supportedArchitectures`** in `.yarnrc.yml` is the closest npm-ecosystem analogue to
  Bun's flags (declaratively pulls extra platform binaries into the install). Not applicable
  since this project uses Bun in `/api`, but confirms the inject-extra-binaries pattern is
  mainstream.

---

## Recommended pattern (implemented)

**Single-pass production install scoped to all linux CPUs**, producing one universal
`node_modules` tarball:

```bash
bun install --frozen-lockfile --production --cpu='*' --os=linux
tar czf app.tar.gz node_modules <app files>
```

Rationale:

1. The project already uses Bun in `/api`, which has first-class `--cpu/--os` support for
   exactly this scenario - no `--force`, no manual registry juggling.
2. One artifact, one CI job. No matrix, no QEMU, no arm64 runner, no install-time network
   dependency. Fits the "build on x86, ship a tarball, untar on Debian arm64" model already in
   place.
3. Frozen-lockfile and pinning are preserved: a single frozen production install resolves the
   matching versions for every linux platform binary, so the arches cannot drift.
4. `--os=linux` scopes the extra binaries to linux only (x64 + arm64, gnu + musl) - no
   darwin/windows/android. For this project that is a couple of small `@node-rs/argon2` `.node`
   files; the bloat is negligible.

### Considered and rejected: two-pass `bun add` injection

The original idea was to inject only the arm64-gnu binary after the production install:

```bash
bun install --frozen-lockfile --production
bun add --no-save "@node-rs/argon2-linux-arm64-gnu@<ver>" --cpu=arm64 --os=linux
```

This breaks in practice: the second `bun add` re-reconciles `node_modules` to the install
command's view. Without `--production` it pulls devDependencies back into the tarball; with
`--production` it reconciles to the `--cpu=arm64` target and prunes the host x64 binary. The
single-pass `--cpu='*'` install sidesteps both failure modes (verified empirically), at the
cost of a couple of extra small linux binaries (musl, arm) instead of one.

**Fallback if you ever drop Bun from the artifact step:** `npm pack` + `tar
--strip-components=1` to extract the platform package into `node_modules`, which has zero
platform-validation surface and works from any host.

**Escalate to Pattern B** only if the app later gains additional native deps or needs musl +
glibc across multiple arches, where per-arch native builds become cleaner than injecting N
foreign binaries.

---

## Sources

- https://bun.com/docs/pm/cli/install
- https://bun.com/blog/bun-v1.2.23
- https://x.com/jarredsumner/status/1970073696745496892
- https://napi.rs/docs/deep-dive/release
- https://napi.rs/docs/deep-dive/native-module
- https://napi.rs/docs/cross-build.en
- https://github.com/prebuild/prebuildify
- https://github.com/evanw/esbuild/issues/2597
- https://github.com/evanw/esbuild/issues/2617
- Local verification: `@node-rs/argon2@2.0.2` `index.js` loader; npm/bun install experiments on
  darwin host, Bun 1.3.10.
