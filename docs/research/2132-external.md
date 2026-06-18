# Spike #2132 — External Research (Cloudflare storage + Workers portability)

Research date: 2026-06-12. All figures verified against official Cloudflare documentation (developers.cloudflare.com) unless otherwise noted. Where a number could not be confirmed from an official source, this is flagged explicitly.

Confidence legend: **High** = stated on an official Cloudflare docs/limits/pricing page; **Medium** = official changelog/blog or strong corroboration; **Low** = community/third-party only, treat as directional.

---

## A. Workers Platform (free tier + nodejs_compat)

### Free-plan request and compute limits

- **Requests/day (free):** 100,000 / day, reset at midnight UTC. Exceeding it returns Error 1027. Source: <https://developers.cloudflare.com/workers/platform/limits/> — **High**
- **CPU time per invocation (free):** 10 ms per request. Average Worker uses ~2.2 ms/request. Source: <https://developers.cloudflare.com/workers/platform/limits/> — **High**
- **CPU time per invocation (paid / Standard):** up to 5 minutes (300,000 ms), configurable via the `cpu_ms` limit in Wrangler (max 300,000). Source: <https://developers.cloudflare.com/workers/platform/limits/> and <https://developers.cloudflare.com/workers/wrangler/configuration/> — **High**
- **Memory:** 128 MB per isolate (same on free and paid). Source: <https://developers.cloudflare.com/workers/platform/limits/> — **High**
- **Duration:** No hard wall-clock limit for HTTP-triggered Workers (runs as long as the client stays connected); Cron / Durable Object alarms / Queue consumers cap at 15 minutes wall time. Note this is wall time, not CPU time — the 10 ms CPU budget still applies on free. Source: <https://developers.cloudflare.com/workers/platform/limits/> — **High**

### Subrequest limits

- **Free plan:** 50 _external_ subrequests per invocation, plus up to 1,000 subrequests to Cloudflare services (KV, R2, D1, DO, etc.) per invocation.
- **Paid plan:** 10,000 by default, configurable up to 10,000,000 via the `subrequests` limit. Source (changelog, 2026-02-11): <https://developers.cloudflare.com/changelog/post/2026-02-11-subrequests-limit/> and <https://developers.cloudflare.com/workers/wrangler/configuration/> — **High**

> Relevance for rackula-api: an autosave that writes layout + snapshot + reads a quota row is a handful of _Cloudflare-service_ subrequests (counts against the 1,000 budget, not the 50 external budget). No concern at this scale.

### `nodejs_compat` — Node API support as of 2026

With `nodejs_compat` enabled (compatibility date 2024-09-23 or later), the following are natively supported by the Workers runtime:

| Node API | Status | Notes |
| --- | --- | --- |
| `node:crypto` | Supported | Backed by BoringSSL. |
| `Buffer` | Supported |  |
| `node:path` | Supported |  |
| `node:stream` | Supported |  |
| `node:fs` | Supported, **but virtual + non-persistent** | See below. |

Source: <https://developers.cloudflare.com/workers/runtime-apis/nodejs/> — **High**

**`node:fs` is NOT a usable storage backend.** As of compatibility date `2025-09-01`+ (or `nodejs_compat` + `enable_nodejs_fs_module`), `node:fs` exposes a _virtual_ file system:

- The bundle directory (`/bundle`) is **read-only** — it contains the Worker's own modules, for reading config/templates only.
- `/tmp` is writable but **"not persistent and unique to each request"** — files written in one request are not visible in subsequent or concurrent requests.
- `fs.glob*` and `fs.watch*` are not implemented.

Source: <https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/> and changelog <https://developers.cloudflare.com/changelog/post/2025-08-15-nodejs-fs/> — **High**

> Implication: a filesystem driver written against `node:fs` will compile on Workers but cannot persist anything. The CF driver MUST target a real storage binding (R2/D1/KV/DO). `node:fs` is only viable for the **Bun/local** driver.

### Hono dual entry: Bun + Workers from one codebase

Yes — idiomatic and well supported. The application body (`const app = new Hono()`

- routes) is identical across runtimes; only the export shape differs:

```ts
// app.ts — shared, runtime-agnostic
import { Hono } from "hono";
export const app = new Hono();
// ... routes ...

// worker.ts — Cloudflare Workers entry
import { app } from "./app";
export default app; // Hono apps expose .fetch; CF calls it
// (equivalently: export default { fetch: app.fetch })

// server.ts — Bun entry
import { app } from "./app";
export default { port: 3000, fetch: app.fetch };
// or simply `export default app` under Bun
```

Hono explicitly markets "one codebase, any runtime" (Node, Bun, Deno, Workers, Lambda); only the import + final `export default` vary. Sources: <https://hono.dev/docs/getting-started/cloudflare-workers>, <https://hono.dev/docs/getting-started/bun> — **High**

The practical friction is not the entry shape but **bindings**: on Workers, KV/R2/ D1/DO arrive on `env` (`c.env.MY_BUCKET`); under Bun they don't exist. This is the real argument for putting storage behind a driver interface and selecting the driver per runtime, rather than sprinkling `c.env` access through handlers.

---

## B. Workers KV

### Free-tier limits

| Metric | Free-tier limit | Source | Confidence |
| --- | --- | --- | --- |
| Reads / day | 100,000 | limits page | High |
| Writes / day (to different keys) | 1,000 | limits page | High |
| Deletes / day | (not separately documented; counts within write/op limits) | limits page | Medium |
| Lists / day | (not separately documented) | limits page | Medium |
| Per-key write rate | 1 write / second / key | limits page | High |
| Storage (account & per namespace) | 1 GB | limits page | High |
| Max value size | 25 MiB | limits page | High |
| Max key size | 512 bytes | limits page | High |
| Max key metadata | 1,024 bytes | limits page | High |
| Namespaces / account | 1,000 (free and paid) | changelog | High |

Sources: <https://developers.cloudflare.com/kv/platform/limits/>; namespaces from <https://developers.cloudflare.com/changelog/post/2025-01-27-kv-increased-namespaces-limits/>

> The 1,000 writes/day free cap is the headline blocker for rackula-api. Autosave double-writes (layout + snapshot) burn 2 writes per save. ~500 saves/ day across all users exhausts the free write budget. KV's free write ceiling is too low for a frequent-autosave workload even before the consistency problem.

### Consistency model (critical for the echo model)

KV is **eventually consistent**, and this disqualifies it for the echo/ compare-then-write design:

- "KV achieves high performance by being eventually-consistent."
- At the location where the write happens, the change is _usually_ immediately visible — but this is **"not guaranteed and ... not advised to rely on."**
- In other global locations, **"changes may take up to 60 seconds or more to be visible"** as cached copies time out.
- No atomic operations; "KV is not ideal for applications where you need ... atomic operations or where values must be read and written in a single transaction." Cloudflare points such use cases to Durable Objects.

Source: <https://developers.cloudflare.com/kv/concepts/how-kv-works/> — **High**

> Verdict for the echo model: **KV cannot provide the read-after-write guarantee the compare-then-write needs.** A read of stored `updatedAt` could return a value up to 60s+ stale, so the server would mis-decide whether to snapshot. Rule KV out as the primary store for layouts.

---

## C. D1

### Free-tier limits

| Metric | Free-tier limit | Source | Confidence |
| --- | --- | --- | --- |
| Rows read / day | 5 million / day | pricing page | High |
| Rows written / day | 100,000 / day | pricing page | High |
| Storage (total, account) | 5 GB | pricing + limits | High |
| Max database size | 500 MB | limits page | High |
| Databases / account | 10 | limits page | High |
| Queries per Worker invocation | 50 | limits page | High |
| Time Travel (point-in-time restore) | 7 days | limits page | High |

Sources: <https://developers.cloudflare.com/d1/platform/pricing/> and <https://developers.cloudflare.com/d1/platform/limits/>

> Capacity check for rackula-api: 100,000 row writes/day is generous. An autosave that writes 1 layout row + 1 snapshot row + bumps a quota count is ~3 row writes/save -> ~33,000 saves/day on free. Comfortable headroom vs KV's 1,000.

### Consistency

- **Single-primary architecture.** "All write queries are still forwarded to the primary database instance." Read replicas are async copies that serve reads.
- **Reads against the primary are current** (the primary holds all committed changes). Read-after-write is consistent **when reads go to the primary**.
- **The hazard is read replicas**: a write to the primary followed by a read that is routed to a not-yet-updated replica returns stale data.
- **Sessions API gives sequential consistency / "read-my-own-writes"**: within a session, "if you write to the database, all subsequent reads will see the write," enforced via bookmarks (the replica waits until at least as up-to-date as the bookmark).

Source: <https://developers.cloudflare.com/d1/best-practices/read-replication/> — **High**; read replication public beta announced 2025-04-10 (<https://developers.cloudflare.com/changelog/post/2025-04-10-d1-read-replication-beta/>)

> For the echo model: D1 gives read-after-write consistency provided you either (a) don't enable read replication, or (b) use the Sessions API with a bookmark. Read replication is **opt-in**, so a default D1 database with no replicas is single-node and read-after-write consistent. That satisfies the echo requirement without DO-level serialization, though D1 does not by itself serialize concurrent writers to the same layout (see note below).

**GA status:** Could not find an explicit "GA" statement on the D1 limits or pricing pages as of 2026-06-12. D1 has been generally available since April 2024 (announced at Cloudflare Developer Week 2024); read _replication_ is in public beta. Flagging the GA wording as **unconfirmed from the pages fetched** — treat core D1 as GA, read replication as beta. — **Medium**

### Suitability for layout YAML + snapshots + quota

Good fit:

- Layout YAML stored as a `TEXT` blob column (max row size 2 MB — see limits page; rack-layout YAML is far smaller). Source: <https://developers.cloudflare.com/d1/platform/limits/> — **High**
- Up-to-5 snapshots per layout = snapshot rows keyed by `(layout_id, n)`; trimming to 5 is a simple `DELETE ... ORDER BY created_at` or modulo slot.
- Quota count = an integer column / counter row, read+written transactionally in the same SQL statement (D1 supports SQL transactions / batches).
- One SQL query can do compare-then-write atomically: `UPDATE layouts SET yaml=?, updated_at=? WHERE id=? AND updated_at=?` returns affected-rows, letting you detect the echo mismatch _without a separate read_.

---

## D. R2

### Free-tier limits

| Metric | Free-tier limit | Source | Confidence |
| --- | --- | --- | --- |
| Storage | 10 GB-month / month | pricing page | High |
| Class A ops (writes/lists: PUT, POST, LIST, etc.) | 1 million / month | pricing page | High |
| Class B ops (reads: GET, HEAD) | 10 million / month | pricing page | High |
| Egress | Free | pricing page | High |
| Max object size | 5 TiB (effectively 4.995 TiB) | limits page | High |
| Max objects per bucket | Unlimited | limits page | High |
| Max custom metadata / object | 8,192 bytes | limits page | High |

Sources: <https://developers.cloudflare.com/r2/pricing/> and <https://developers.cloudflare.com/r2/platform/limits/>

> Capacity check: Class A (writes) at 1M/month is the binding constraint. Autosave double-write (layout PUT + snapshot PUT) = 2 Class A ops/save -> ~500,000 saves/month on free. Far more headroom than KV; egress being free is a real win for read-heavy load patterns.

### Consistency

R2 provides **strong global read-after-write consistency**:

- After a PUT, "readers will immediately see the latest object globally" (PUT then GET is strongly consistent).
- List-after-write is also strongly consistent: a list "will list all objects at that point in time."
- **Caveat:** consistency is relaxed only when accessing via a **custom domain with caching enabled** (cache TTL governs visibility). This does **not** affect Worker binding access or the S3 API — "The cache does not affect access via Worker API bindings or the S3 API."

Source: <https://developers.cloudflare.com/r2/reference/consistency/> — **High**

> For the echo model: R2 binding access is strongly consistent, so a read of the stored object's `updatedAt` (from custom metadata) immediately after a write is correct. This satisfies the echo read-after-write requirement.

### Conditional writes (directly useful for the echo/compare-then-write model)

The R2 Workers binding supports conditional operations via an `R2Conditional` (`onlyIf`) passed to `get()` and `put()`:

- `etagMatches` / `etagDoesNotMatch` (If-Match / If-None-Match semantics)
- `uploadedBefore` / `uploadedAfter` (time-based)
- Alternatively a `Headers` object with standard conditional headers (all RFC 7232 conditional headers except `If-Range`).
- If a `put()` condition fails, it returns `null` (not an `R2Object`) — a clean signal for "someone else wrote since you last read."

Source: <https://developers.cloudflare.com/r2/api/workers/workers-api-reference/> — **High**

Metadata for storing `updatedAt`:

- `customMetadata` (`Record<string, string>`) — user-defined key/value, ideal for `updatedAt`.
- `httpMetadata` (`R2HTTPMetadata`) — standard HTTP headers.

Source: <https://developers.cloudflare.com/r2/api/workers/workers-api-reference/> — **High**

> Echo-model fit: PUT with `onlyIf: { etagMatches: <last-seen-etag> }` implements compare-then-write optimistically. On mismatch, `put()` returns `null`; the handler then reads current object -> snapshots it -> retries the write. This mirrors the echo model (never hard-reject) without needing a Durable Object, **as long as** the etag/updatedAt comparison is the only serialization needed. Caveat: R2 conditional PUT is optimistic, not a lock; two concurrent writers can both read the same etag and one's conditional PUT fails — exactly the desired behaviour (loser snapshots and retries). It does not by itself _serialize_ concurrent writers in submission order.

---

## E. Durable Objects (per-layout serialization)

### Free-plan availability

- **Durable Objects are available on the Workers Free plan** (free tier launched 2025-04-07). Source: <https://developers.cloudflare.com/changelog/post/2025-04-07-durable-objects-free-tier/> — **High**
- **Only the SQLite-backed storage backend is available on free.** The key-value DO storage backend is Paid-plan only. Source: <https://developers.cloudflare.com/durable-objects/platform/pricing/> — **High**

### Free-tier limits

| Metric                    | Free-tier limit   | Source          | Confidence |
| ------------------------- | ----------------- | --------------- | ---------- |
| Requests / day            | 100,000 / day     | DO pricing page | High       |
| Compute duration / day    | 13,000 GB-s / day | DO pricing page | High       |
| SQLite rows read / day    | 5 million / day   | DO pricing page | High       |
| SQLite rows written / day | 100,000 / day     | DO pricing page | High       |
| SQLite stored data        | 5 GB (total)      | DO pricing page | High       |

Source: <https://developers.cloudflare.com/durable-objects/platform/pricing/>

Note: SQLite _storage_ billing for DOs began January 2026 (target 2026-01-07), but **Workers Free plan users are not charged** for storage; compute (requests + duration) has always been metered. Source: <https://developers.cloudflare.com/changelog/post/2025-12-12-durable-objects-sqlite-storage-billing/> — **High**

### Pattern: one DO per layout id

Idiomatic, yes. The canonical pattern is to derive a DO instance from the layout id (`env.LAYOUT_DO.idFromName(layoutId)`), so all compare-then-write traffic for a given layout routes to a single object. A DO is single-threaded and processes requests serially, giving you true per-layout write serialization (not just optimistic concurrency). It can also hold the layout + snapshots in its own embedded SQLite, eliminating a separate store.

Cloudflare itself recommends DOs for exactly this ("atomic operations ... read and written in a single transaction") in the KV docs. Source: <https://developers.cloudflare.com/kv/concepts/how-kv-works/> — **High**

### Cost/complexity tradeoff for a solo maintainer

- **Pro:** strongest guarantee — strict per-layout serialization, plus colocated storage, plus alarms for snapshot trimming.
- **Con:** highest conceptual + operational overhead. DOs add a class definition, a migration entry in `wrangler.jsonc`, the `idFromName`/stub routing dance, and a programming model (RPC/fetch into the object) that does NOT exist under Bun — so the Bun/local driver and the DO driver diverge significantly, weakening the "one contract, two runtimes" goal.
- **Assessment:** For a small autosave app, **D1 single-node or R2 conditional PUT already deliver read-after-write consistency**, which is the hard requirement. Strict submission-order serialization is a _nice-to-have_ the echo model can live without (the model is "snapshot-then-write, never reject", which optimistic conditional writes satisfy). Recommend treating DO-per-layout as a later optimization if real write contention shows up, not a v1 requirement.

---

## F. Password Hashing on Workers (argon2 replacement)

**`@node-rs/argon2` will not run on Workers.** It ships a native `.node` addon (Rust compiled to a Node native binary); Workers run JS/WASM only and do not load native Node addons. Source: <https://github.com/cloudflare/workerd/discussions/1905> — **Medium** (community/maintainer discussion; corroborated by the WASM-only architecture in <https://developers.cloudflare.com/workers/runtime-apis/webassembly/>)

Viable replacements:

| Option | How | Bundle | CPU cost | Security | Verdict |
| --- | --- | --- | --- | --- | --- |
| **argon2id via WASM (`hash-wasm`, CF-adapted)** | Rust Argon2 compiled to WASM | ~12 kB gzipped | Tunable; low-memory params (~16 KiB, 4 iters, p=2) measured ~6-9 ms p50-p99 on Workers | Memory-hard (best class) but only if params are strong; the cited low-mem params are weaker than typical server argon2 | **Recommended** if free-tier CPU budget can be respected; preferred for new Workers password auth |
| **WebCrypto PBKDF2** | `crypto.subtle.deriveBits`, SHA-256 | 0 (built-in) | ~100 ms CPU at 100k iterations (community-reported) | OWASP-acceptable at high iteration counts, but not memory-hard | Simplest, zero-dep, but ~100 ms blows the **10 ms free CPU limit** |
| **Rust/WASM Argon2 in a separate Worker via Service Binding** | dedicated hashing Worker | n/a | ~100 ms CPU in that Worker | Strong (full argon2id params) | Most robust, most complex; overkill for solo maintainer |
| **Pure-JS argon2/scrypt (noble, Lucia)** | JS only | small | ~2,000 ms (scrypt) to ~14,000 ms (argon2id) CPU | Strong algorithm, unusable runtime | **Reject** — exceeds even paid CPU comfort |

Sources:

- hash-wasm Argon2 bundle ~12 kB gzipped + CF-Workers measured CPU figures: <https://github.com/Daninet/hash-wasm/discussions/56>, <https://github.com/7Hazard/cf-hash-wasm> — **Low/Medium** (third-party benchmarks, not official; verify by measuring in our own Worker)
- PBKDF2 ~100 ms CPU / 10 ms free limit collision, and JS argon2/scrypt CPU figures: <https://mli.puffinsystems.com/blog/lucia-auth-cloudflare-argon2>, <https://tjenwellens.eu/blog/password-hashing-on-cloudflare-pages/> — **Low**

**Key CPU-budget concern.** The free plan's 10 ms CPU/request limit is brutal for password hashing. Memory-hard argon2 with _server-grade_ parameters easily exceeds it. The cited ~6-9 ms WASM figures used **deliberately weak** params (16 KiB memory). Realistically, password hashing on rackula-api should run on a **paid Worker** (5-minute CPU ceiling) OR accept weakened-but-tuned argon2id params on free and document the tradeoff. **Flag:** these CPU numbers are third-party and parameter-dependent — measure with our chosen params before committing. — **Low**

> Recommendation: target `hash-wasm` argon2id (WASM, ~12 kB) as the Workers replacement for `@node-rs/argon2`. Store the full PHC parameter string with each hash so parameters can evolve. Plan for paid-tier CPU if strong params are required; PBKDF2 is the only zero-dep fallback but is not memory-hard and still risks the free CPU limit.

---

## G. Logging on Workers

### Does pino run on Workers?

pino's default (Node) transport relies on Node internals (worker threads, sonic- boom file descriptors) that don't fit the Workers model. The practical path used by the community is **`pino/browser`** with a custom `write` that emits JSON to `console.log`:

```ts
import pino from "pino/browser";
const log = pino({ browser: { write: (o) => console.log(JSON.stringify(o)) } });
```

This works but you lose pino's transport/redaction pipeline; you're effectively using pino as a thin JSON shaper over `console.log`. Source (pino issue on Workers usage): <https://github.com/pinojs/pino/issues/2035> — **Low/Medium** (community)

### Idiomatic Workers logging

Cloudflare's idiom is **structured JSON via `console.log`**, captured by **Workers Logs**:

- Logging a JSON object (`console.log({ key: value })`) causes Workers Logs to **automatically extract and index the fields**, enabling field-based filtering.
- **Workers Logs is on both Free and Paid plans.**
- **Free tier:** 200,000 log events / day, 3 days retention. Source: <https://developers.cloudflare.com/workers/observability/logs/workers-logs/> — **High**
- For longer retention / export to external sinks, use **Logpush** (push logs to R2/S3/HTTP endpoints) — generally a paid feature for Workers Logpush.

> Recommendation: drop the pino dependency on the Workers path and log structured JSON with `console.log({...})`, letting Workers Logs index it. Keep pino on the Bun/local path if desired, or unify on a tiny logger interface (one `log(obj)` function) so the driver layer doesn't care which runtime it's in. This keeps the "one contract" goal intact and avoids shimming pino transports into workerd.

---

## H. Contract Test Harness

### Can one shared spec run under both `bun test`/vitest (FS driver) and the Workers runtime (CF driver)?

Yes, with the standard 2026 setup, but they run under **two different runners/ configs**, not one process:

- **Workers side:** `@cloudflare/vitest-pool-workers` runs Vitest tests **inside workerd** (via modern Miniflare), giving tests real access to Workers runtime APIs and bindings (KV/R2/D1/DO). Helpers come from `cloudflare:test` (e.g. `env`, `SELF`) and `cloudflare:workers`.
  - Requires **Vitest 4.1+**.
  - Miniflare config is overridable via the `miniflare` key in the vitest config. Sources: <https://developers.cloudflare.com/workers/testing/vitest-integration/>, <https://developers.cloudflare.com/workers/testing/vitest-integration/configuration/>, <https://www.npmjs.com/package/@cloudflare/vitest-pool-workers> — **High**
- **FS/Bun side:** the same `*.contract.test.ts` spec file can run under plain Vitest (Node) or `bun test`, exercising the filesystem driver.

### Recommended pattern

Write the contract spec against the **driver interface**, injecting the driver via a factory/fixture, not against `c.env` directly:

```ts
// storage.contract.ts — shared, imported by both runners
export function runStorageContract(makeDriver: () => StorageDriver) {
  describe("storage contract", () => {
    it("read-after-write returns latest updatedAt", async () => { ... });
    it("echo mismatch snapshots before write", async () => { ... });
    // ...
  });
}

// fs.contract.test.ts (runs under bun test / node vitest)
runStorageContract(() => new FsDriver(tmpDir));

// cf.contract.test.ts (runs under vitest-pool-workers / workerd)
import { env } from "cloudflare:test";
runStorageContract(() => new R2Driver(env.LAYOUTS)); // or D1Driver(env.DB)
```

### Friction to expect (2026)

- **Two configs, two commands.** The Workers pool needs its own `vitest.config` (project) with `poolOptions.workers`; the FS spec runs under the default Node/Bun runner. You can't put both in a single pool run; use Vitest _projects_ (workspaces) or two npm scripts.
- **`bun test` vs Vitest divergence.** The project currently uses `bun test`. `vitest-pool-workers` is a **Vitest** pool — it does not plug into `bun test`. Either (a) run the FS contract under Vitest too (so one spec import works in both Vitest projects), or (b) keep `bun test` for FS and accept that the CF contract runs under a separate Vitest invocation. Option (a) is cleaner for a single shared spec file. — **Medium** (inference from runner architecture; the shared- spec-across-both-runners pattern is not documented verbatim by Cloudflare)
- **Version coupling.** Known 2026 init failures with specific Vitest 4.1.x + Miniflare 4.x combos; pin versions. Source: <https://github.com/cloudflare/workers-sdk/issues/13581> — **Medium**
- **`cloudflare:test` imports** only resolve inside the Workers pool — guard them so the FS runner never imports that module (keep them in `cf.contract.test.ts`, not in the shared spec).

> Recommendation: standardize the contract spec on **Vitest** (not `bun test`) so a single spec file can be driven by both a Node/FS Vitest project and a `vitest-pool-workers` project. Keep `bun test` only for non-contract unit tests if desired, but the cross-runtime contract suite should be Vitest-based.

---

## Free-Tier Numbers Table

| Resource | Metric | Free-tier limit | Source URL | Confidence |
| --- | --- | --- | --- | --- |
| Workers | Requests / day | 100,000 / day | https://developers.cloudflare.com/workers/platform/limits/ | High |
| Workers | CPU time / request (free) | 10 ms | https://developers.cloudflare.com/workers/platform/limits/ | High |
| Workers | CPU time / request (paid) | up to 5 min (300,000 ms) | https://developers.cloudflare.com/workers/platform/limits/ | High |
| Workers | Memory / isolate | 128 MB | https://developers.cloudflare.com/workers/platform/limits/ | High |
| Workers | Subrequests (free) | 50 external + 1,000 to CF services | https://developers.cloudflare.com/changelog/post/2026-02-11-subrequests-limit/ | High |
| KV | Reads / day | 100,000 | https://developers.cloudflare.com/kv/platform/limits/ | High |
| KV | Writes / day | 1,000 | https://developers.cloudflare.com/kv/platform/limits/ | High |
| KV | Per-key write rate | 1 / sec / key | https://developers.cloudflare.com/kv/platform/limits/ | High |
| KV | Storage | 1 GB | https://developers.cloudflare.com/kv/platform/limits/ | High |
| KV | Max value size | 25 MiB | https://developers.cloudflare.com/kv/platform/limits/ | High |
| KV | Max key size | 512 bytes | https://developers.cloudflare.com/kv/platform/limits/ | High |
| KV | Max metadata | 1,024 bytes | https://developers.cloudflare.com/kv/platform/limits/ | High |
| D1 | Rows read / day | 5 million | https://developers.cloudflare.com/d1/platform/pricing/ | High |
| D1 | Rows written / day | 100,000 | https://developers.cloudflare.com/d1/platform/pricing/ | High |
| D1 | Storage (account) | 5 GB | https://developers.cloudflare.com/d1/platform/limits/ | High |
| D1 | Max DB size | 500 MB | https://developers.cloudflare.com/d1/platform/limits/ | High |
| D1 | Databases / account | 10 | https://developers.cloudflare.com/d1/platform/limits/ | High |
| R2 | Storage | 10 GB-month / month | https://developers.cloudflare.com/r2/pricing/ | High |
| R2 | Class A ops (writes) / month | 1 million | https://developers.cloudflare.com/r2/pricing/ | High |
| R2 | Class B ops (reads) / month | 10 million | https://developers.cloudflare.com/r2/pricing/ | High |
| R2 | Egress | Free | https://developers.cloudflare.com/r2/pricing/ | High |
| R2 | Max custom metadata / object | 8,192 bytes | https://developers.cloudflare.com/r2/platform/limits/ | High |
| Durable Objects | Available on free? | Yes (SQLite backend only) | https://developers.cloudflare.com/durable-objects/platform/pricing/ | High |
| Durable Objects | Requests / day | 100,000 | https://developers.cloudflare.com/durable-objects/platform/pricing/ | High |
| Durable Objects | Compute / day | 13,000 GB-s | https://developers.cloudflare.com/durable-objects/platform/pricing/ | High |
| Durable Objects | SQLite rows written / day | 100,000 | https://developers.cloudflare.com/durable-objects/platform/pricing/ | High |
| Durable Objects | SQLite storage | 5 GB | https://developers.cloudflare.com/durable-objects/platform/pricing/ | High |
| Workers Logs | Events / day (free) | 200,000 | https://developers.cloudflare.com/workers/observability/logs/workers-logs/ | High |
| Workers Logs | Retention (free) | 3 days | https://developers.cloudflare.com/workers/observability/logs/workers-logs/ | High |

---

## Consistency Comparison Table

| Store | Read-after-write | Write serialization | Conditional writes | Echo-model fit |
| --- | --- | --- | --- | --- |
| **KV** | Eventually consistent — write may be invisible up to 60s+ in other locations; even same-location immediacy is "not guaranteed". <https://developers.cloudflare.com/kv/concepts/how-kv-works/> | None (no atomic ops/transactions); per-key cap 1 write/sec. | No native compare-and-set; only optimistic-on-metadata at best. | **Poor — disqualified.** Stale reads break compare-then-write. |
| **D1** | Consistent against the **primary**; single-primary architecture. Read replicas (opt-in) can be stale unless Sessions API + bookmark used. <https://developers.cloudflare.com/d1/best-practices/read-replication/> | SQL transactions/batches; conditional UPDATE (`WHERE updated_at=?`) detects mismatch atomically. Not a distributed lock, but single-primary ordering. | Via SQL: `UPDATE ... WHERE id=? AND updated_at=?` returns affected rows = optimistic compare-and-set. | **Strong.** Read-after-write holds (no replicas, or Sessions API); echo logic is one SQL statement. |
| **R2** | **Strong global read-after-write** for PUT then GET via bindings/S3 API (cache only relaxes it on cached custom domains). <https://developers.cloudflare.com/r2/reference/consistency/> | Optimistic only — conditional PUT, no lock/ordering across concurrent writers. | Yes — `onlyIf` etagMatches/etagDoesNotMatch/uploadedBefore/uploadedAfter (If-Match/If-None-Match); failed PUT returns null. <https://developers.cloudflare.com/r2/api/workers/workers-api-reference/> | **Strong.** Strongly consistent read + native conditional PUT map directly onto echo (loser snapshots + retries). |
| **Durable Object** (for reference) | Strongly consistent (single-threaded, serialized). KV docs recommend DO for atomic read-write. | **True serialization** — one DO per layout id processes requests serially. | Implement any compare logic in-object; transactional SQLite. | **Strongest**, but highest complexity and diverges most from the Bun driver. |

---

## Bottom line for the architecture decision

1. **KV is out** for the layout store: 1,000 writes/day free cap + eventual consistency both break the autosave + echo-model requirements.
2. **R2 and D1 both satisfy** the hard requirement (strong read-after-write):
   - **R2**: strong consistency + native conditional PUT (`onlyIf` etag) + free egress + custom metadata for `updatedAt`. Cleanest match to "compare-then- write, snapshot on mismatch, never reject." Best free-tier write headroom for this workload.
   - **D1**: strong on a single-node DB; echo check collapses to one conditional SQL `UPDATE`; natural home for snapshot rows + quota counter. Slightly richer for querying/listing user layouts.
3. **Durable Objects** give true serialization but add the most complexity and diverge hardest from the Bun driver; recommend deferring unless real write contention appears.
4. **Portability:** `node:fs` is virtual + non-persistent on Workers, so the FS driver is local/Bun-only and the CF driver must bind R2/D1/DO. Hono dual-entry is clean; the real seam is the storage driver interface, which also keeps the contract test suite runnable on both sides (standardize it on Vitest, not `bun test`).
5. **Auxiliary swaps for the Workers target:** replace `@node-rs/argon2` (native addon, won't bundle) with `hash-wasm` argon2id (WASM, ~12 kB) — but measure CPU against the 10 ms free limit and plan for paid CPU if strong params are needed; replace pino's Node transport with structured `console.log` JSON captured by Workers Logs (free: 200k events/day, 3-day retention).

### Items flagged as not fully verified

- D1 explicit "GA" wording: not found on the fetched limits/pricing pages; core D1 is GA since 2024, read replication is public beta (2025-04-10). — **Medium**
- Password-hashing CPU figures (hash-wasm ~6-9 ms, PBKDF2 ~100 ms, JS argon2/scrypt thousands of ms): third-party benchmarks, parameter-dependent. Must be re-measured with our chosen argon2id params before relying on them. — **Low**
- KV per-day **delete/list** counts and pino-on-Workers specifics: not separately documented on official pages; treat as Medium/Low.
- The "single shared spec file across both runners" pattern is an inference from the runner architecture; Cloudflare does not document it verbatim. — **Medium**
