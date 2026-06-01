# Spike #1850: arm64 support for the LXC release tarball

**Date:** 2026-06-01
**Implementation issue:** #1850
**Related:** community-scripts/ProxmoxVED#1883, held PR branch `feat/add-rackula`
**Detailed external research:** [1850-external.md](./1850-external.md)

## Problem

`build-lxc.yml` runs `bun install --frozen-lockfile --production` once on `ubuntu-latest`
(x86) and tars up `api/node_modules`. The API's only native dependency,
`@node-rs/argon2`, ships per-platform `.node` binaries as `os`/`cpu`-gated
`optionalDependencies`, so the x86 build pulls only `@node-rs/argon2-linux-x64-gnu`. The
tarball therefore crashes on arm64. Docker is unaffected (built per-arch via buildx).

## Key finding (verified against `@node-rs/argon2@2.0.2`, Bun 1.3.x)

The loader (`@node-rs/argon2/index.js`) selects the binary at runtime by probing
`process.platform`/`arch` and a glibc-vs-musl check, then `require()`-ing the matching
`@node-rs/argon2-<platform>` package. **It never checks the `os`/`cpu`/`libc` manifest
fields** (those gate only the installer). So if the arm64-gnu package files are present in
`node_modules`, they load fine on a Debian 13 arm64 host even though the tarball was
assembled on x86. Injection is safe.

## Decision: Pattern A - Bun two-pass injection, single universal tarball

In `build-lxc.yml`, after the normal production install, add the arm64-gnu package using
Bun's native cross-platform flags (added in Bun 1.2.23, present in the workflow's Bun 1.x):

```bash
# Pass 1 (existing): host-arch production deps
cd api
bun install --frozen-lockfile --production

# Pass 2 (new): inject the arm64 glibc binary alongside x64, pinned to the exact
# version resolved for the host (x64) package so it cannot drift.
ARGON2_VER=$(node -p "require('./node_modules/@node-rs/argon2-linux-x64-gnu/package.json').version")
bun add --no-save "@node-rs/argon2-linux-arm64-gnu@${ARGON2_VER}" --cpu=arm64 --os=linux
# Fail the build if either native binary is missing
test -f node_modules/@node-rs/argon2-linux-x64-gnu/argon2.linux-x64-gnu.node
test -f node_modules/@node-rs/argon2-linux-arm64-gnu/argon2.linux-arm64-gnu.node
```

Notes:

- `--no-save` keeps `package.json`/lockfile untouched; `--cpu/--os` avoid the npm
  `EBADPLATFORM` error (no `--force` needed).
- Pin the injected version to the resolved `@node-rs/argon2` version so it never drifts.
  Portable fallback if `bun pm ls` parsing is brittle: download the `.tgz` from the npm
  registry and extract into `node_modules/@node-rs/argon2-linux-arm64-gnu/`.
- Debian 13 is glibc, so `-linux-arm64-gnu` is the correct variant (not `-musl`).

### Why not the alternatives

- **Per-arch matrix tarballs (Pattern B):** two native builds + arch-selected asset at
  install. More CI machinery (matrix/QEMU) and a second asset + selector in build.func for
  one small native dep. Reconsider only if more/larger native deps appear.
- **In-container `bun install` (Pattern C):** abandons the prebuilt/offline model and adds
  an install-time network + toolchain dependency. Against the design intent.

## Scope of the implementation (#1850)

1. `build-lxc.yml`: add the pass-2 injection + presence assertions (above).
2. `ct/rackula.sh`: `var_arm64="${var_arm64:-no}"` -> `yes`.
3. `json/rackula.json`: `"has_arm": false` -> `true`.
4. ProxmoxVED #1883 + held PR: flip arm64 back to supported.
5. Guard: assert the injected version matches the resolved argon2 version (drift-proofing).

## Verification

- **Done (emulation, 2026-06-01):** built the bundle on `docker --platform linux/amd64`
  (host install pulls x64; `bun add --no-save ...-linux-arm64-gnu --cpu=arm64 --os=linux`
  injects arm64), tarred `node_modules`, then extracted and ran it under
  `docker --platform linux/arm64`. `require('@node-rs/argon2')` loaded and
  `hashSync`/`verifySync` executed: `LOADED_ON_ARM64 true $argon2id$v=1`. The inject also
  pulls the arm64-musl variant, so both glibc and musl arm64 are covered. Injection
  commands and the asserted `.node` paths were verified against `@node-rs/argon2@2.0.2`,
  Bun 1.3.10. Audit confirms argon2 is the _only_ native dep (better-auth/hono/js-yaml/zod
  are pure JS).
- **Final sign-off (hardware-gated):** real `curl|bash` install on an arm64 Proxmox/LXC
  host - same gate as #1214. Flip `var_arm64`/`has_arm` only after this passes.

## Dependencies / order

Blocked behind the separate "tarball not publishing on latest release" fix (build-lxc not
triggering on recent releases) for real end-to-end testing, but the workflow change itself
can be written and emulation-verified independently.
