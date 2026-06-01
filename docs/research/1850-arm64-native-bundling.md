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

## Decision: single production install targeting all linux CPUs

In `build-lxc.yml`, change the one install command to materialise every linux variant of
the optional native deps in a single production install, using Bun's cross-platform flags
(added in Bun 1.2.23, present in the workflow's Bun 1.x):

```bash
cd api
bun install --frozen-lockfile --production --cpu='*' --os=linux
# Fail the build if either native binary is missing
test -f node_modules/@node-rs/argon2-linux-x64-gnu/argon2.linux-x64-gnu.node
test -f node_modules/@node-rs/argon2-linux-arm64-gnu/argon2.linux-arm64-gnu.node
```

Notes:

- `--cpu='*' --os=linux` installs all linux platform binaries (x64 + arm64, gnu and musl)
  for every optional dep, scoped to linux only (no darwin/win32). For argon2 that is the
  only native dep, so the extra files are a couple of small `.node` binaries.
- `--production` keeps devDependencies out of the bundled `node_modules`.
- No version-pinning logic needed: the lockfile already pins `@node-rs/argon2` and its
  platform sub-packages, so frozen-install resolves the matching versions for every arch.
- Debian 13 is glibc, so `-linux-arm64-gnu` is the variant that loads on the target;
  the musl variant ships too but is unused there (and covers Alpine-based hosts for free).

### Why this over the earlier two-pass `bun add` idea

A second `bun add --no-save --cpu=arm64` after a `--production` install re-reconciles the
tree: without `--production` it leaks devDependencies into the tarball, and with
`--production` it prunes the host's x64 binary (reconciles to the command's arm64 target).
The single `--cpu='*'` install sidesteps both failure modes - verified empirically.

### Why not the alternatives

- **Per-arch matrix tarballs (Pattern B):** two native builds + arch-selected asset at
  install. More CI machinery (matrix/QEMU) and a second asset + selector in build.func for
  one small native dep. Reconsider only if more/larger native deps appear.
- **In-container `bun install` (Pattern C):** abandons the prebuilt/offline model and adds
  an install-time network + toolchain dependency. Against the design intent.

## Scope of the implementation (#1850)

1. `build-lxc.yml`: change the install to `--cpu='*' --os=linux` + presence assertions.
2. `ct/rackula.sh`: `var_arm64="${var_arm64:-no}"` -> `yes`.
3. `json/rackula.json`: `"has_arm": false` -> `true`.
4. ProxmoxVED #1883 + held PR: flip arm64 back to supported.

## Verification

- **Done (emulation, 2026-06-01):** built the bundle on `docker --platform linux/amd64`
  with `bun install --frozen-lockfile --production --cpu='*' --os=linux`, tarred
  `node_modules`, then extracted and ran it under `docker --platform linux/arm64`.
  `require('@node-rs/argon2')` loaded and `hashSync`/`verifySync` executed:
  `ARM64_RUN true`. Confirmed no devDependencies leaked into the bundle, and both x64-gnu
  and arm64-gnu `.node` binaries are present. Verified against `@node-rs/argon2@2.0.2`,
  Bun 1.3.10. Audit confirms argon2 is the _only_ native dep (better-auth/hono/js-yaml/zod
  are pure JS).
- **Final sign-off (hardware-gated):** real `curl|bash` install on an arm64 Proxmox/LXC
  host - same gate as #1214. Flip `var_arm64`/`has_arm` only after this passes.

## Dependencies / order

Blocked behind the separate "tarball not publishing on latest release" fix (build-lxc not
triggering on recent releases) for real end-to-end testing, but the workflow change itself
can be written and emulation-verified independently.
