# Spike #2132: rackula-api on Workers, portability and storage backend

Date: 2026-06-12 Parent epic: #1985 (move dev d.racku.la full stack to Cloudflare Workers) Feeds: #2133 (Workers entry + CF storage driver), #2134 (dev cutover) Supporting research: `docs/research/2132-codebase.md`, `docs/research/2132-external.md`

---

## Executive summary

rackula-api can run on Cloudflare Workers behind one storage-driver seam without forking the application. The hard requirement is the echo model's read-after-write consistency for layout writes. That single requirement rules out Workers KV as the layout store and points to R2 as the cleanest backend.

Decisions:

1. Storage backend: R2 is the single Workers store for layouts, snapshots, and layout quota. D1 and Durable Objects are not used in v1. KV is needed only as a fallback for in-memory state (session blocklist, rate-limit) if a self-contained app auth mode runs without Cloudflare Access; under the recommended Access posture no KV namespace is required.
2. Concurrency: the echo compare-then-write is made safe with R2's native conditional PUT (`onlyIf: { etagMatches }`), optimistic concurrency, no Durable Object. DO-per-layout is deferred unless real write contention appears.
3. updatedAt: becomes an app-managed ISO 8601 string stored in R2 `customMetadata`, replacing filesystem `stat.mtime`. The wire contract (`X-Rackula-Updated-At`) is unchanged.
4. Driver seam: dependency injection, not entry-level dynamic import. The Workers entry never imports the native or filesystem modules, so `@node-rs/argon2` and `node:fs` stay out of the Workers bundle by construction.
5. Password hashing: swap `@node-rs/argon2` for hash-wasm argon2id on the Workers path. CPU must be measured against the 10 ms free-tier limit; the dev Worker may need the paid plan to keep server-grade parameters.
6. Logging: structured `console.log` JSON on Workers, captured by Workers Logs. pino stays on the Bun path. Both sit behind a one-method logger interface.
7. CORS: set `CORS_ORIGIN=https://d.racku.la`. The dev Worker serves the SPA and the API from one origin, so CORS is effectively a no-op, and the production guard that refuses a wildcard is left untouched.
8. Tests: standardize the storage contract spec on Vitest. One shared spec runs under a Node project (filesystem driver) and a `@cloudflare/vitest-pool-workers` project (R2 driver).

Scope boundaries confirmed: the Workers driver covers layouts CRUD, snapshots, and layout quota only. Assets routes and legacy flat-file migration stay filesystem-only for self-host. Production (count.racku.la) stays Bun/container; the dev Worker is the proving ground for the one-contract-two-runtimes model.

---

## The hard requirement: the echo model

The layout PUT path uses an echo model (`api/src/storage/filesystem.ts:697-707`). The client sends its last-seen `updatedAt` in `X-Rackula-Updated-At`. The server reads the stored `updatedAt`, and if it differs, snapshots the existing version before overwriting. It never rejects a write. Recovery is by snapshot, not by 409.

This needs read-after-write consistency: the read of stored `updatedAt` immediately before the write must reflect the last committed write. If that read can be stale, the server mis-decides whether to snapshot, and concurrent saves silently lose data without a snapshot. Today `updatedAt` is the filesystem `mtime`, which is trivially consistent on a single host. Any Workers backend has to preserve that guarantee.

Autosave makes writes frequent and each save can double-write (layout plus snapshot), so write-throughput limits and per-key write caps also matter.

---

## Storage backend decision

### Criteria

| Criterion | Why it matters |
| --- | --- |
| Read-after-write consistency | Echo model reads stored updatedAt then writes; stale reads lose data |
| Free-tier write headroom | Autosave double-writes; needs to survive a frequent-save workload |
| Per-layout write serialization | Compare-then-write is a read-modify-write; concurrent writers race |
| updatedAt as stored metadata | mtime goes away; the backend must hold an explicit timestamp |
| Distance from the filesystem driver | Solo maintainer: thinner seam means one mental model, shared contract tests |

### Scoring

| Backend | Read-after-write | Free write headroom | Conditional write | Distance from FS driver | Verdict |
| --- | --- | --- | --- | --- | --- |
| KV | Eventual, up to 60s+ stale | 1,000 writes/day | None (no atomic ops) | Close (blob) | Rejected |
| D1 | Strong on single-node primary | 100,000 row-writes/day | SQL `WHERE updated_at=?` | Far (rows, schema, migrations) | Viable, not chosen |
| R2 | Strong global read-after-write | 1M Class A/month | Native `onlyIf` etag | Closest (object = file) | Chosen |
| Durable Objects | Strong, serialized | 100,000 row-writes/day | In-object | Farthest (no Bun equivalent) | Deferred |

Sources for every figure: `docs/research/2132-external.md` (each cited to developers.cloudflare.com, verified 2026-06-12).

### Why R2

R2 mirrors the current filesystem blob-per-file model almost one to one. A layout is an object, a snapshot is an object under a prefix, the display name lives in metadata instead of the folder name. The filesystem driver already thinks in files at paths; R2 thinks in objects at keys. That makes the driver seam the thinnest of the four options, which is the dominant factor for a solo maintainer and for keeping the contract test suite meaningful across both runtimes.

R2 also satisfies the hard requirement directly:

- Strong global read-after-write through Worker bindings (the cache caveat applies only to cached custom domains, not binding access).
- Native conditional PUT via `onlyIf: { etagMatches }`, which is exactly the compare-then-write primitive the echo model needs, and which also replaces the filesystem `wx` exclusive-create atomicity trick.
- `customMetadata` (8,192 bytes per object) holds the app-managed `updatedAt`.
- Free egress and 1M Class A writes per month, far more headroom than KV.

### Why not D1, and why not R2 plus D1

D1 works (strong on a single-node database, echo collapses to one conditional `UPDATE ... WHERE updated_at=?`). It is rejected because its relational strengths go unused here: the contract is blob CRUD plus list plus snapshots plus a simple count. R2 `list` with a prefix covers listing and counting. Choosing D1 would mean modeling a filesystem as rows for no functional gain, and it diverges further from the Bun filesystem driver (schema, migrations, YAML-as-TEXT).

R2 plus D1 (blobs in R2, metadata in D1) is rejected for a sharper reason: it reintroduces the consistency problem we are trying to remove. A single layout write would have to update two stores with no cross-store transaction, so a crash between the R2 PUT and the D1 row update leaves them disagreeing about `updatedAt`. One store means no cross-store consistency to manage. Keep it to one store.

### Concurrency: optimistic, not locked

The echo compare-then-write is a read-modify-write and races under concurrent writers. R2 conditional PUT makes the final write atomic against concurrent modification: capture the object's etag during the read, then `put(key, body, { onlyIf: { etagMatches: readEtag } })`. If another writer committed in between, the PUT returns `null`; the handler re-reads, snapshots the now-current version, and retries. That is precisely the echo model's "never reject, snapshot the loser, retry" behaviour, achieved with optimistic concurrency and no Durable Object.

The client-facing token stays `updatedAt` (the ISO string in `X-Rackula-Updated-At`); the etag is used only inside the driver for the conditional PUT, so the wire contract does not change.

Durable-Object-per-layout would give true submission-order serialization, but it adds a class definition, a wrangler migration, the stub-routing model, and a programming model with no Bun equivalent, weakening the one-contract goal. For a small autosave app where optimistic concurrency already prevents silent loss, that complexity is not justified in v1. Defer it to a fast-follow only if contention is observed.

### Key scheme (resolves the folder-rename blocker)

The filesystem driver renames the layout folder when the layout name changes (`{name}-{uuid}`), and R2 has no rename. Resolve this by keying R2 objects on the UUID only and storing the display name in the YAML and in `customMetadata`:

```
layouts/{uuid}/layout.yaml                 (object; customMetadata.updatedAt, name)
layouts/{uuid}/snapshots/{timestamp}.yaml  (objects; list + delete-oldest to prune 5)
```

The routes are already keyed by `:uuid`, so the contract surface is unchanged and the rename blocker disappears.

---

## Auxiliary state: depends on the auth posture

The codebase inventory surfaced two pieces of state that live in Node process memory today and would be lost on every Worker isolate:

- Session-invalidation blocklist (`api/src/security/sessions.ts`): logout tokens.
- Rate-limit counters (`api/src/security/rate-limit.ts`).

How much this matters depends entirely on the auth posture (see the authentication section). Under the recommended dev posture (Cloudflare Access as the edge gate, `AUTH_MODE=none`):

- There are no app-level sessions to invalidate. The session blocklist is moot.
- Rate limiting stays per-isolate and accepted-degraded, because Cloudflare Access is the real abuse boundary in front of the Worker. This matches the decision already in #2134 and needs no extra binding.

So under the recommended posture, no KV namespace is required at all. KV becomes relevant only if a self-contained app auth mode (`local` or `oidc`) is run without Access in front; in that case the session blocklist and rate-limit counters move to KV, where eventual consistency is fine (a logout that takes a few seconds to propagate is acceptable) and the 1,000 writes/day cap is not a concern at this volume.

The general rule still holds: split storage by consistency requirement. Layouts need strong read-after-write, so R2. Anything that tolerates eventual consistency (and is actually needed) goes to KV, never to R2 or a Durable Object.

---

## Driver seam and entry-point strategy

The issue framed the mechanism choice as injection versus entry-level dynamic import. Use dependency injection.

Extract small interfaces and inject the implementation at the entry point:

- `StorageDriver`: layouts CRUD, snapshots, layout-quota count. Bun entry constructs the filesystem driver; Workers entry constructs the R2 driver from `env`.
- `PasswordHasher`: `hash`, `verify`. Bun entry injects the `@node-rs/argon2` hasher; Workers entry injects the hash-wasm hasher.
- `Logger`: one `log(obj)` method. Bun injects pino; Workers injects console JSON.
- `SessionStore` and `RateLimiter`: in-memory on Bun; KV-backed on Workers.

Routes receive the driver through the Hono context or a closure and never import `node:fs` or read `c.env` directly. Because the Workers entry never imports the filesystem or native-addon modules, `node:fs` and `@node-rs/argon2` never enter the Workers bundle. This is cleaner than entry-level dynamic import, which is a workaround for static-import bundling and leaves conditional-import seams in the code.

Hono dual-entry is idiomatic: the app body is identical, only the export shape differs (`export default app` style for both Bun and Workers; bindings arrive on `c.env` only on Workers, which is exactly why the storage access goes behind the driver).

---

## Password hashing on Workers

`@node-rs/argon2` ships a native `.node` addon and will not bundle on Workers. The chosen replacement is hash-wasm argon2id (WASM, about 12 kB gzipped), injected only on the Workers path. Store the full PHC parameter string with each hash so parameters can evolve.

Caveat to carry into #2133: the free plan's 10 ms CPU-per-request limit is hostile to memory-hard hashing at server-grade parameters. The third-party benchmarks in the external research used deliberately weak parameters to fit. Before committing, measure hash-wasm argon2id with our intended parameters inside a real Worker. If strong parameters exceed the free CPU budget, the dev Worker runs on the paid plan (5-minute CPU ceiling). PBKDF2 via WebCrypto is the only zero-dependency fallback but is not memory-hard and still risks the free CPU limit; treat it as a last resort.

Note: dev auth mode is often `none`, in which case hashing is not on the hot path at all. The hasher seam still matters so the Workers bundle never pulls in the native addon.

---

## Logging on Workers

pino's Node transport (worker threads, file descriptors) does not fit Workers. On the Workers path, log structured JSON with `console.log({ ... })`, which Workers Logs indexes by field automatically (free tier: 200,000 events/day, 3-day retention). Keep pino on the Bun path. Both sit behind the one-method logger interface so the route and driver code does not know which runtime it is in.

---

## CORS posture

The dev Worker serves the SPA static assets and the API from the same origin (d.racku.la), so same-origin fetches do not exercise CORS. Set `CORS_ORIGIN=https://d.racku.la` anyway: it satisfies the config guard, and it is correct for any cross-origin preview URL. Leave the production guard that refuses to start on a wildcard untouched; this spike does not weaken it.

---

## Test harness

Standardize the storage contract on Vitest. Write the contract once against the `StorageDriver` interface and drive it from two Vitest projects:

```ts
// storage-contract.ts  (shared, imported by both projects)
export function runStorageContract(makeDriver: () => StorageDriver) {
  describe("storage contract", () => {
    it("read-after-write returns the latest updatedAt", async () => {
      /* ... */
    });
    it("echo mismatch snapshots before write", async () => {
      /* ... */
    });
    it("prunes snapshots to five", async () => {
      /* ... */
    });
    it("layout quota counts existing layouts", async () => {
      /* ... */
    });
  });
}

// fs.contract.test.ts        (Node project)
runStorageContract(() => new FsDriver(tmpDir));

// cf.contract.test.ts        (vitest-pool-workers project)
import { env } from "cloudflare:test";
runStorageContract(() => new R2Driver(env.LAYOUTS));
```

Notes for #2133:

- Migrate the storage tests from `bun test` to Vitest so one spec file runs under both projects. `@cloudflare/vitest-pool-workers` is a Vitest pool and does not plug into `bun test`. Other non-contract unit tests can stay on `bun test` if desired.
- Requires Vitest 4.1+; pin the Vitest and vitest-pool-workers versions together (there are known init failures with specific 4.1.x plus Miniflare combos).
- Keep `cloudflare:test` imports inside `cf.contract.test.ts` only; they do not resolve in the Node project.

---

## Free-tier capacity check

| Resource | Free limit | Workload | Headroom |
| --- | --- | --- | --- |
| Workers requests | 100,000/day | dev traffic | Ample |
| R2 Class A (writes) | 1,000,000/month | 2 ops/save -> ~500,000 saves/month | Ample |
| R2 Class B (reads) | 10,000,000/month | reads on load | Ample |
| R2 storage | 10 GB | YAML blobs are tiny | Ample |
| KV writes | 1,000/day | only if app auth without Access (else unused) | Fine (low volume) |
| Workers CPU (free) | 10 ms/request | argon2id hashing | At risk: measure, maybe paid |

The only free-tier pressure point is CPU for password hashing. Everything else has wide headroom at dev scale.

---

## Portability blockers and resolutions

| Blocker (from codebase inventory) | Resolution |
| --- | --- |
| All storage via `node:fs/promises` | R2 driver behind StorageDriver; fs driver stays Bun-only |
| `@node-rs/argon2` native addon | hash-wasm argon2id injected on Workers path; native never imported there |
| `updatedAt` from `stat.mtime` | app-managed ISO string in R2 customMetadata |
| `writeFile({flag:"wx"})` atomicity | R2 conditional PUT (`onlyIf` etag) |
| Folder rename on name change | key R2 objects by UUID; name is metadata, no rename |
| Snapshot pruning by mtime scan | R2 list with prefix; sort by uploaded; delete oldest beyond 5 |
| Quota by filesystem scan | R2 list with prefix and count |
| In-memory session blocklist | Moot under Access + AUTH_MODE=none; KV with TTL only if app auth runs without Access |
| In-memory rate limiter | Per-isolate accepted-degraded (Access is the abuse boundary, per #2134); KV only if app auth runs without Access |
| pino-pretty worker thread | console.log JSON on Workers; pino on Bun |
| `bun test` not in Workers | Vitest contract spec, two projects |
| `node:crypto` HMAC, randomUUID | already WebCrypto-compatible, no change |
| `node:path` | WebCompat or trivial string joins |

---

## What feeds the implementation issues

#2133 (Workers entry + CF storage driver) should adopt:

- Extract `StorageDriver` (layouts CRUD, snapshots, layout quota) and inject it.
- Implement `R2Driver` keyed by UUID, updatedAt in customMetadata, conditional PUT for the echo write.
- Extract `PasswordHasher`; inject `@node-rs/argon2` on Bun, hash-wasm argon2id on Workers; measure CPU against the 10 ms free limit, plan for paid if needed.
- Extract `Logger`; pino on Bun, console JSON on Workers.
- Leave session blocklist and rate-limit as-is under the recommended Access posture (no app sessions; rate-limit accepted-degraded per #2134). Put them behind interfaces with KV implementations only if a self-contained app auth mode without Access is needed.
- Migrate the storage contract tests to Vitest; add a vitest-pool-workers project.
- Keep assets routes and legacy flat-file migration filesystem-only (out of the Workers driver).

#2134 (dev cutover) should adopt:

- `CORS_ORIGIN=https://d.racku.la`; one Worker serves SPA assets plus API (same origin).
- Provision R2 bucket binding and KV namespace bindings in `wrangler.jsonc`.
- Decide the dev auth mode (likely `none`); if `local`, the hash-wasm CPU caveat applies.

Coordinate with #2067 (the only open issue editing the layout PUT path) so the echo logic moves behind the StorageDriver cleanly rather than being edited twice.

---

## Authentication in front of the storage (bonus)

First, an important framing: R2 has no public endpoint in this design. The bucket is reachable only through the Worker's binding (`env.LAYOUTS`), not over the internet, so "authentication in front of the storage" really means authentication in front of the Worker. The Worker is the only door to the bucket. There is no second perimeter to secure as long as no public r2.dev or custom domain is attached to the bucket.

That leaves three layers, which compose:

### Layer 1: edge gate (who can reach the Worker at all)

Recommended for dev: Cloudflare Access (Zero Trust) in front of the dev Worker. Access authenticates the user at Cloudflare's edge (Google SSO, GitHub, one-time PIN) and injects a signed JWT in the `Cf-Access-Jwt-Assertion` header. The Worker validates it against the team's public keys:

```ts
import { jwtVerify, createRemoteJWKSet } from "jose"; // Workers-compatible
const JWKS = createRemoteJWKSet(
  new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`),
);
const token = request.headers.get("cf-access-jwt-assertion");
const { payload } = await jwtVerify(token, JWKS, {
  issuer: env.TEAM_DOMAIN,
  audience: env.POLICY_AUD, // the Access application AUD tag
});
// payload.email / payload.sub identify the user
```

Source: developers.cloudflare.com one-click Access for Workers (2025-10-03 changelog) and the secure-MCP-servers guide, verified 2026-06-12.

Why this is the right default for dev:

- It eliminates password hashing on Workers entirely, which removes the one genuine free-tier pain point (argon2id versus the 10 ms CPU limit). No `@node-rs/argon2`, no hash-wasm, no PHC parameter tuning.
- SSO with no password storage, which suits a small trusted audience (maintainer plus testers). The free Zero Trust plan covers a small team; verify the current seat allotment before relying on it.
- The app's own `AUTH_MODE` can then be `none`, and the Worker simply trusts and reads the verified Access identity.

### Layer 2: app auth mode (when there is no edge gate)

The existing `AUTH_MODE` values still map onto Workers, in order of fit:

- `none` plus Cloudflare Access: recommended for dev. Auth is delegated to the edge.
- `local` (username/password): self-contained gate with no edge dependency. Requires the hash-wasm argon2id hasher and the CPU caveat from the password-hashing section. Use only if a self-hosted-style password gate is needed without Access.
- `oidc` (better-auth): better-auth needs a database adapter and server-side session storage. On Workers that pulls in a D1 or KV adapter, reintroducing a store this spike deliberately avoided for layouts. For dev SSO, prefer Cloudflare Access over app-level OIDC. Keep `oidc` for the Bun self-host path if it is wanted there.

The session signing itself is already portable: HMAC-signed cookies use `node:crypto`, which has a WebCrypto equivalent, so the cookie model needs no change. Only the session-invalidation blocklist and rate-limit counters move to KV (see the consistency split section).

### Layer 3: mutation gate (defense in depth, unchanged)

Keep `RACKULA_API_WRITE_TOKEN` as a Worker secret (`wrangler secret put`), bound on `env`. It gates PUT and DELETE on layouts independently of the identity layer, so a read-only viewer cannot mutate even if it reaches the Worker. CSRF and origin-policy middleware run unchanged.

### Per-user data isolation (forward-looking)

Today the storage is single-tenant: one shared namespace, layouts not isolated per user. That parity is fine for the dev cutover. If the future true-API epic wants per-user isolation, derive the tenant from the verified identity (the Access JWT `sub` or the session subject) and prefix R2 keys with it:

```
users/{sub}/layouts/{uuid}/layout.yaml
```

The key scheme chosen above (`layouts/{uuid}/...`) is a clean prefix-extension away from this, so no rework is needed to add isolation later. Note this only as a seam; it is out of scope for #2133 and #2134.

### Recommendation

For the dev Worker: Cloudflare Access as the edge gate, `AUTH_MODE=none` in the app, the write-token secret for mutations, CSRF and origin-policy unchanged, and KV for the session blocklist and rate-limit state. This is the least code, removes the argon2-on- Workers problem, and is free at dev scale. Keep `local` and `oidc` as documented fallbacks, and keep the Bun self-host path on `@node-rs/argon2` for users who run their own instance without Cloudflare in front.

---

## Items flagged as not fully verified

- D1 explicit GA wording was not found on the fetched pages; core D1 is GA since 2024, read replication is public beta. Does not affect the decision (D1 not chosen).
- Password-hashing CPU figures are third-party and parameter-dependent. Must be re-measured with our argon2id parameters in a real Worker before relying on them.
- The single-shared-spec-across-both-runners pattern is inferred from runner architecture, not documented verbatim by Cloudflare. Validate during #2133.
- KV per-day delete and list counts are not separately documented; low risk at dev volume.

---

## Recommendation

Proceed with #2133 on this basis: one StorageDriver seam, R2 as the single strong- consistency store for layouts and snapshots and quota, KV for the eventual-consistency auxiliary state, dependency injection for the storage driver, password hasher, logger, session store, and rate limiter, hash-wasm argon2id on Workers with a CPU measurement gate, and a Vitest contract suite that runs against both the filesystem and R2 drivers. This keeps production on Bun, makes the dev Worker the proving ground for the one-contract-two-runtimes model, and changes no wire contract.
