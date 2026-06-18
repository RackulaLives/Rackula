# Spike #2132 — Rackula API Codebase Inventory: Portability to Cloudflare Workers

## Executive Summary

The rackula-api is a Bun/Hono-based persistence layer tightly coupled to Node.js filesystem APIs and native dependencies. Current architecture requires substantial refactoring to port to Cloudflare Workers: the storage layer is built entirely around `node:fs/promises`, quota enforcement scans the filesystem, and authentication depends on the `@node-rs/argon2` native binding. This document catalogs the current implementation with exact file paths and line citations to guide portability assessment.

---

## 1. Runtime & Environment Access

### Entry Point: `/src/index.ts`

- **Lines 13–20:** Port and data directory read from `process.env`:

  ```typescript
  const portEnv = process.env.RACKULA_API_PORT ?? process.env.PORT ?? "3001";
  // ...
  logger.info(`Data directory: ${process.env.DATA_DIR ?? "./data"}`);
  ```
  - `RACKULA_API_PORT` or `PORT` environment variable (defaults to "3001")
  - `DATA_DIR` environment variable (defaults to "./data")

- **Line 9:** Creates app via `createApp()` (async, awaited)
- **Lines 22–25:** Exports Bun server object with `port` and `fetch` properties:
  ```typescript
  export default {
    port,
    fetch: app.fetch.bind(app),
  };
  ```
  Directly invokes Bun.serve via the default export pattern.

### App Creation: `/src/app.ts`

- **Lines 277–279:** `createApp()` function accepts optional `env: EnvMap = process.env` parameter
  - Allows dependency injection for testing
  - Falls back to `process.env` in production
- **Line 281:** Resolves `securityConfig` via `resolveApiSecurityConfig(env)`
- **Line 286:** Calls `bootstrapLocalCredentials(env)` when `authMode=local`
- **Line 289:** **Mutates env:** `delete env.RACKULA_LOCAL_PASSWORD` (scrubs plaintext password after hashing)

### Environment Variables Summary

| Variable | Source | Default | Usage |
| --- | --- | --- | --- |
| `RACKULA_API_PORT` | index.ts:13 | "3001" | Port binding |
| `PORT` | index.ts:13 | "3001" | Fallback port (legacy) |
| `DATA_DIR` | filesystem.ts:29, index.ts:20 | "./data" | Layout/asset storage root |
| `NODE_ENV` | logger.ts:26, security/config.ts:multiple | undefined | Dev/prod mode detection |
| `LOG_LEVEL` | logger.ts:29 | "info" | Pino logging level |
| `NODE_ENV` | logger.ts:26 | undefined | TTY detection for pretty output |
| `RACKULA_LOCAL_PASSWORD` | local-auth.ts:81 | required (if AUTH_MODE=local) | Plaintext; deleted after hashing |
| `RACKULA_LOCAL_USERNAME` | local-auth.ts:71 | required (if AUTH_MODE=local) | Local auth username |
| `CORS_ORIGIN` | security/config.ts:301 | undefined | Required in production; `*` allowed in dev |
| `AUTH_MODE` | security/config.ts (resolveAuthMode) | "none" | "none", "oidc", or "local" |
| `RACKULA_AUTH_SESSION_COOKIE_SECURE` | security/config.ts | undefined | HTTPS-only cookie flag |
| `RACKULA_API_WRITE_TOKEN` | security middleware | undefined | Bearer token for PUT/DELETE |
| `ALLOW_INSECURE_CORS` | security/config.ts:319 | undefined | Allow wildcard CORS in production |
| `APP_VERSION`, `APP_COMMIT`, `APP_BUILD_TIME` | app.ts:68–72 | from package.json or "" | Build metadata for /version endpoint |

### Hono `c.env` / Worker Bindings

- **Not used.** The codebase does not reference `c.env` (Hono's Worker binding mechanism). All config comes from `process.env`.

### Node-Only APIs Used

#### In Production Code:

- **`node:fs/promises`** (filesystem.ts, assets.ts, quota.ts):
  - `readdir`, `readFile`, `writeFile`, `stat`, `mkdir`, `open`, `rm`, `rename`, `unlink`
  - All layout YAML persistence, snapshot management, asset uploads
- **`node:path`** (filesystem.ts, assets.ts, quota.ts):
  - `join`, `dirname` — folder/file path construction
- **`node:crypto`** (multiple security modules):
  - `createHmac`, `randomUUID`, `timingSafeEqual`, `randomBytes` — session tokens, CSRF, rate limit keying
  - **WebCrypto-compatible** (SubtleCrypto equivalents exist in Workers)
- **`process.env`** (multiple):
  - Direct environment variable reads; **no Hono `c.env` fallback**
- **No `Bun.*` runtime APIs in production code.**
  - Exception: index.ts exports a Bun server object (the default export pattern)

#### In Test Code (non-blocking for Workers port):

- **`node:fs/promises`**: `mkdtemp`, `utimes` in snapshots.test.ts and storage tests
- **`node:os`**: `tmpdir()` in filesystem.test.ts:17
- **`@types/bun`**: Test runner (bun:test)

---

## 2. Auth & Native Dependencies

### Primary Issue: `@node-rs/argon2`

- **Import:** `/src/local-auth.ts:1`
  ```typescript
  import { hash, verify, Algorithm } from "@node-rs/argon2";
  ```
- **Usage:** Lines 42–66
  - `hashPassword()`: Hashes plaintext via Argon2id with 64 MiB memory, 3 time cost, 4 parallelism (OWASP-recommended)
  - `verifyPasswordHash()`: Constant-time verification against stored hash
  - Both are async and called in critical path (local auth bootstrap and login verification)

### Auth Flow & Dependencies

#### Local Auth (AUTH_MODE=local)

1. **Bootstrap** (`app.ts:286`):
   - Calls `bootstrapLocalCredentials(env)` → **calls `hashPassword()` (async)**
   - Stores hash in `securityConfig.localCredentials.passwordHash`
   - Scrubs plaintext password from env (`delete env.RACKULA_LOCAL_PASSWORD`)

2. **Login** (`app.ts:744–748`):
   - POST `/auth/login` handler calls `verifyCredentials(username, password, localCredentials)`
   - `verifyCredentials()` → **calls `verifyPasswordHash()` (async)**
   - Compares hash using `timingSafeEqual` (node:crypto, WebCrypto-compatible)

3. **Transitive dependencies:**
   - `/src/local-auth.ts` is imported by `/src/app.ts` → **bundled when app loads**
   - If any route handler directly imports the auth route (not current), argon2 would be pulled in

#### OIDC Auth

- Uses `better-auth` npm package
- Not directly coupled to argon2
- **Does not use argon2 when AUTH_MODE=oidc**

#### Session Token Signing (all auth modes)

- `/src/security/tokens.ts:1,34–39`: Uses `node:crypto.createHmac` + `randomUUID`
- **WebCrypto-compatible:** SubtleCrypto supports HMAC-SHA256

#### CSRF/Origin Protection

- `/src/security/csrf.ts` (not fully read): Uses `node:crypto.createHash`, `timingSafeEqual`
- `/src/security/origin-policy.ts:17`: Uses `createHash`, `timingSafeEqual`
- **WebCrypto-compatible**

### Security Config Resolution (`/src/security/config.ts`)

- **Lines 1–2:** Imports `createHmac`, `randomBytes` from `node:crypto`
- **Line 62:** Uses `randomBytes()` to generate ephemeral auth log hash key
- **Line 301:** Reads `CORS_ORIGIN` env variable
- **Lines 305–315:** Validates CORS origin; throws in production without explicit origin
- **Returns:** `ApiSecurityConfig` object with all security settings

---

## 3. Storage Module

### Module Structure: `/src/storage/`

#### **filesystem.ts** (450 lines)

**Exports:**

- `ensureDataDir()` — Creates `DATA_DIR` if missing
- `findFolderByUuid(uuid: string)` — Scans DATA_DIR for folder matching UUID suffix
- `listLayouts()` — Lists all layouts (new UUID folders + legacy flat files)
- `getLayout(id: string)` — Reads layout YAML and its `updatedAt` (file mtime, ISO 8601)
- `saveLayout(yamlContent, existingId?, echoedUpdatedAt?)` — Create/update layout with echo-based conflict detection
- `deleteLayout(uuid: string)` — Deletes layout folder and all contents
- `listSnapshots(uuid: string)` — Lists pre-overwrite snapshots for a layout
- `saveSnapshot(uuid: string, yamlContent: string)` — Stores losing local copy before overwrite

**Key Patterns:**

1. **updatedAt derivation (lines 234, 286, 296, 310, 348, 359, 373, 472, 496, 582, 749)**:
   - Derived from `stats.mtime.toISOString()`
   - File system modification time is the source of truth
   - Returned to clients in response headers and JSON bodies

2. **Echo-based conflict detection (lines 697–707):**

   ```typescript
   if (echoedUpdatedAt && existingFolder) {
     const existingYamlFilename = await findYamlInFolder(existingFolder);
     if (existingYamlFilename) {
       const existingYamlPath = join(existingFolder, existingYamlFilename);
       const existingStats = await stat(existingYamlPath);
       if (existingStats.mtime.toISOString() !== echoedUpdatedAt) {
         const existingContent = await readFile(existingYamlPath, "utf-8");
         await writeSnapshot(existingFolder, existingContent);
       }
     }
   }
   ```
   - **Pattern:** Client echoes last-seen `updatedAt` in `X-Rackula-Updated-At` header (or request body)
   - **If mtime differs:** Existing YAML is snapshoted before overwrite ("last write wins")
   - **Never rejects:** Saves always succeed; conflicts are captured as snapshots for recovery

3. **Snapshot storage (lines 168–203):**
   - Location: `{folderPath}/snapshots/{name}~YYYYMMDD-HHMMSS.yaml`
   - Atomic creation via `writeFile(..., { flag: "wx" })` (exclusive create)
   - Suffixes auto-increment on collision: `-1`, `-2`, etc.
   - Automatic pruning: keeps only 5 most recent (MAX_SNAPSHOTS_PER_LAYOUT, line 33)
   - Sorting by mtime, then by snapshot name desc (lines 154–156)

4. **Folder naming:**
   - New format: `{layout.name}-{UUID}` (e.g., "Production-550e8400-e29b-41d4-a716-446655440000")
   - Legacy format: `{slug}.yaml` or `{slug}.yml` (flat file in DATA_DIR)
   - Migration on save: renames folder if layout name changes (lines 710–737)

5. **File descriptor stat ordering (lines 464–475, 745–749):**
   - Opens file, stats, reads content on same descriptor
   - Ensures returned `updatedAt` reflects this write (not concurrent writer's mtime)

#### **quota.ts** (154 lines)

**Exports:**

- `checkLayoutQuota(dataDir: string, maxLayouts: number)` — Counts layouts; allows/denies new creation
- `checkAssetQuota(layoutDir: string, maxAssetsPerLayout: number)` — Counts images per layout

**Quota Enforcement:**

1. **Layout quota (lines 38–84):**
   - Counts UUID-suffixed folders AND legacy `.yaml`/`.yml` files in DATA_DIR
   - `maxLayouts=0` means unlimited
   - Allows write if `layoutCount < maxLayouts`

2. **Asset quota (lines 98–153):**
   - Counts image files (png, jpg, jpeg, webp) in `{layoutDir}/assets/{deviceSlug}/`
   - Only counts direct device subdirectory level
   - `maxAssetsPerLayout=0` means unlimited
   - Allows write if `assetCount < maxAssetsPerLayout`

**Error handling:**

- ENOENT (directory doesn't exist) → allow write, return `allowed: true` (not an enforcement failure)
- Permission errors, I/O failures → rethrow (must not silently disable quota)

#### **assets.ts** (340 lines)

**Exports:**

- `saveAsset(layoutId, deviceSlug, face, data, contentType)` — Upload image (front/rear)
- `getAsset(layoutId, deviceSlug, face)` — Download image
- `deleteAsset(layoutId, deviceSlug, face)` — Delete one image
- `deleteLayoutAssets(layoutId)` — Delete all assets for layout
- `listLayoutAssets(layoutId)` — List all assets with metadata

**Storage Structure:**

- Base: `{DATA_DIR}/{layoutFolder}/assets/{deviceSlug}/{face}.{ext}`
- Example: `data/Production-550e8400/assets/dell_r640/front.png`
- Allowed extensions: `png`, `jpg`, `webp`
- Allowed image types: `image/png`, `image/jpeg`, `image/webp`

**Asset Upload Pattern (lines 152–210):**

1. Validate image type and size (5 MB max)
2. Compute destination path via `buildAssetPath()` (validates layout UUID, device slug, ext)
3. Create device folder with `mkdir(..., { recursive: true })`
4. **Atomic write:** Write to temp file (`{assetPath}.{uuid}.tmp`), then rename
5. Clean up old extension files (migration: `.jpg` → `.png`)
6. On error: clean up temp file

---

## 4. Routes / Contract Surface

### Layout Routes: `/src/routes/layouts.ts`

| Method | Path | Handler | Requires Auth | Write-Token | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/layouts` | `listLayouts()` | ✗ | ✗ | Returns `{ layouts: [...] }` |
| `GET` | `/layouts/:uuid` | `getLayout(uuid)` | ✗ | ✗ | Returns YAML in body; `X-Rackula-Updated-At` header |
| `PUT` | `/layouts/:uuid` | `saveLayout(uuid, echoedUpdatedAt?)` | ✗ | ✓ | Body: YAML; header: `X-Rackula-Updated-At` (echoed); response: `{ id, updatedAt, message, status 200/201 }` |
| `DELETE` | `/layouts/:uuid` | `deleteLayout(uuid)` + `deleteLayoutAssets(uuid)` | ✗ | ✓ | Returns `{ status: "deleted" }` |
| `GET` | `/layouts/:uuid/snapshots` | `listSnapshots(uuid)` | ✗ | ✗ | Returns `{ snapshots: [ { filename, timestamp, size }, ... ] }` |
| `POST` | `/layouts/:uuid/snapshots` | `saveSnapshot(uuid, yamlContent)` | ✗ | ✓ | Body: YAML; response: `{ filename }` |

**All routes also mounted at `/api/layouts` (alias via `app.route()` in app.ts:886).**

**Echo-based Conflict Detection (lines 118–122):**

```typescript
const result = await saveLayout(
  yamlContent,
  uuidResult.data,
  c.req.header(UPDATED_AT_HEADER), // Client echoes this
);
```

- Client sends `X-Rackula-Updated-At` header on PUT
- Mismatch triggers pre-overwrite snapshot (filesystem.ts:697–707)

### Asset Routes: `/src/routes/assets.ts`

| Method | Path | Handler | Requires Auth | Write-Token | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/assets/:layoutId/:deviceSlug/:face` | `getAsset()` | ✗ | ✗ | Returns image binary; `Cache-Control: public, max-age=3600` |
| `PUT` | `/assets/:layoutId/:deviceSlug/:face` | `saveAsset()` | ✗ | ✓ | Body: image binary; validates Content-Type, Content-Length, actual size |
| `DELETE` | `/assets/:layoutId/:deviceSlug/:face` | `deleteAsset()` | ✗ | ✓ | Returns `{ message: "Asset deleted" }` (or 404 if not found) |

**All routes also mounted at `/api/assets` (alias via `app.route()` in app.ts:887).**

**Face parameter:** Restricted to `"front"` or `"rear"` (routes/assets.ts:30–32).

### Non-Data Routes: `/src/app.ts`

| Method | Path | Handler | Public | Notes |
| --- | --- | --- | --- | --- |
| `GET` | `/health` | Returns `HEALTH_RESPONSE` | ✓ | `{ ok: true, status: "ok", service: "rackula-persistence-api", version: 1 }` |
| `GET` | `/version` | `resolveVersionInfo()` | ✓ | `{ version, commit, buildTime }` — unauthenticated (see AUTH_PUBLIC_PATHS) |
| `GET` | `/auth/login` | OIDC or local form | ✓ | Routes also at `/api/auth/login` |
| `GET` | `/auth/callback` | OIDC callback handler | ✓ | Routes also at `/api/auth/callback` |
| `GET` | `/auth/check` | Verify session | ✓ | Returns 204 (valid) or 401 (invalid); routes also at `/api/auth/check` |
| `POST` | `/auth/logout` | Invalidate session | ✓ | Returns 204; routes also at `/api/auth/logout` |
| `POST` | `/auth/login` | Local auth login (username/password) | ✓ | JSON body: `{ username, password }`; response `{ ok: true }` or error |

**Health & version endpoints:** Explicitly public (not gated by auth middleware) — seen in AUTH_PUBLIC_PATHS pattern.

### Middleware Order (app.ts:318–875)

1. **Line 318:** Hono logger
2. **Lines 320–327:** CORS (origin, methods, headers, exposed headers)
3. **Lines 331–346:** Rate limiting (if enabled)
4. **Lines 400–411:** Auth gate (if authEnabled)
5. **Lines 413–421:** CSRF protection
6. **Lines 426–433:** Origin policy
7. **Lines 810–824:** Write-auth token validation + admin authorization (on `/layouts/*`, `/assets/*`, `/api/layouts/*`, `/api/assets/*`)
8. **Lines 845–860:** Body size limits (assets: 5 MB, layouts: 1 MB)
9. **Lines 866–875:** Storage quota enforcement

---

## 5. CORS & Config

### CORS Setup: `/src/app.ts:320–327`

```typescript
cors({
  origin: securityConfig.corsOrigin,
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", UPDATED_AT_HEADER],
  exposeHeaders: [UPDATED_AT_HEADER],
}),
```

- Uses Hono's `cors()` middleware
- `origin` is resolved from `CORS_ORIGIN` environment variable
- Special header `X-Rackula-Updated-At` is explicitly allowed and exposed

### CORS_ORIGIN Validation: `/src/security/config.ts:301–320`

```typescript
const configuredOrigin = env.CORS_ORIGIN?.trim();
let corsOrigin: string | string[];
if (!configuredOrigin) {
  corsOrigin = "*";
} else {
  corsOrigin = parseCorsOrigins(configuredOrigin);
}

if (isProduction && !hasWildcardOrigin(corsOrigin) && !allowInsecureCors) {
  // Allow specific origins
} else if (
  isProduction &&
  hasWildcardOrigin(corsOrigin) &&
  !allowInsecureCors
) {
  throw new Error(
    "Refusing to start in production without CORS_ORIGIN. Set CORS_ORIGIN=https://your-domain.com (or ALLOW_INSECURE_CORS=true to explicitly allow wildcard CORS).",
  );
}
```

**Rules:**

- **Development:** Defaults to `*` (wildcard) if CORS_ORIGIN not set
- **Production without ALLOW_INSECURE_CORS=true:**
  - **REQUIRED:** Explicit `CORS_ORIGIN` (or comma-separated list)
  - **Rejects wildcard `*`** unless explicitly opt-in via `ALLOW_INSECURE_CORS=true`
- **Auth-enabled mode:** Requires explicit origins (wildcard not allowed even with ALLOW_INSECURE_CORS) — lines 402–407

---

## 6. Test Harness (Current)

### Test Runner: **Bun Test**

- **Package.json scripts (lines 12):** `"test": "bun test"`
- **Test discovery:** `*.test.ts` files in `/src` and subdirectories
- **Framework:** `bun:test` (built-in Bun testing, similar to Jest API)

### Test Files & Coverage

- **`snapshots.test.ts`** (pre-overwrite conflict detection)
  - Tests echo-based `X-Rackula-Updated-At` header matching
  - Snapshot listing, pruning, and invisibility to quota
  - Integration with app via `createApp()`
  - Temp directory setup via `mkdtemp()`, cleanup with `rm()`

- **`filesystem.test.ts`** (layout storage layer)
  - YAML read/write, UUID-based folder discovery
  - Legacy flat-file migration
  - Asset folder co-location

- **`quota.test.ts`** (layout and asset quota checking)
  - Layout counting (UUID folders + legacy files)
  - Asset image counting per layout
  - Error handling (ENOENT vs I/O errors)

- **`security.test.ts`** (comprehensive security)
  - Config resolution (CORS_ORIGIN, AUTH_MODE, etc.)
  - Auth gate middleware
  - CSRF protection
  - Rate limiting
  - Session token signing/verification
  - Auth gate on layout and asset routes

- **`local-auth.test.ts`** (argon2 password hashing)
  - Password hash/verify with Argon2id
  - Login rate limiting

- **`security-hardening.test.ts`** (security edge cases)
  - Various attack vectors (CSRF, origin spoofing, etc.)

- **`deploy-config.test.ts`** (env config parsing)
  - Validates config resolution in various environments

### Test Execution

```bash
bun test
```

- Runs all `*.test.ts` files
- Uses `describe()`, `it()`, `expect()` API
- Async/await support
- Temp directory cleanup in `afterEach()` hooks

### Key Test Patterns

- **Temp directory per test:** `mkdtemp(join(tmpdir(), "rackula-...-test-"))` (snapshots.test.ts:36)
- **Env isolation:** Save/restore `process.env` in beforeEach/afterEach
- **App creation with test config:** `createApp(buildEnv({ overrides }))`
- **HTTP request via Hono:** `app.request(path, { method, headers, body })`

---

## 7. Pino Logging

### Configuration: `/src/logger.ts`

```typescript
const usePrettyOutput =
  process.env.NODE_ENV !== "production" && Boolean(process.stdout.isTTY);

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(usePrettyOutput
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, ignore: "pid,hostname" },
        },
      }
    : {}),
});
```

**Rules:**

1. **Pretty output transport (pino-pretty):**
   - **Enabled if:** `NODE_ENV !== "production"` AND `process.stdout.isTTY`
   - **Disabled if:** Production OR non-interactive (CI, systemd, Docker)
   - Options: colorize, ignore pid/hostname

2. **Log level:**
   - Controlled by `LOG_LEVEL` env var (defaults to "info")
   - Debug tracing is opt-in (not emitted in production by default)

3. **Output format:**
   - **Development + TTY:** Pretty printed (via pino-pretty worker thread)
   - **Everywhere else:** Structured JSON to stdout (no worker thread)

### Pino Dependency

- **Package.json:** `pino: ^10.3.1`
- **Dev dependency:** `pino-pretty: ^13.1.3` (devDependency, not in production)
- **Workers compatibility:** pino-pretty uses a worker thread (Node.js feature); not available in Workers
- **Fallback:** Structured JSON mode (no transport) is Workers-compatible

### Transports

- **No file transports:** Logs to stdout only
- **No external sinks:** No integration with external logging services

---

## Portability Risk Summary

| Concern | Current Implementation | Workers-Compatible? | Notes & Blockers |
| --- | --- | --- | --- |
| **File I/O** | All fs via `node:fs/promises` | ✗ **BLOCKER** | Storage layer entirely filesystem-dependent (layouts, assets, snapshots, quota counting). Requires external storage (R2, D1, KV, Durable Objects). |
| **Path manipulation** | `node:path.join()`, `node:path.dirname()` | ✓ Partial | Use string manipulation or minimal polyfill; low complexity. |
| **Environment access** | `process.env` reads only | ✓ Medium lift | Switch to `c.env` (Hono Workers bindings). Requires conditional code paths for runtime detection. |
| **Native dependencies** | `@node-rs/argon2` | ✗ **BLOCKER** | Argon2 native binding incompatible with Workers. Require server-side hashing (post-login) OR switch to WebCrypto-based algorithm (scrypt, PBKDF2). |
| **Crypto operations** | `node:crypto` HMAC, randomUUID, timingSafeEqual | ✓ Full | All operations have WebCrypto equivalents (SubtleCrypto). No code changes needed. |
| **Filesystem stat (mtime)** | File modification time for `updatedAt` | ✗ **BLOCKER** | Echo-based conflict detection **requires** a source of truth for `updatedAt`. Workers storage backends (KV, D1) must expose a timestamp field or app must manage it separately. |
| **Atomic file operations** | `writeFile(..., { flag: "wx" })` for exclusive create | ✗ **BLOCKER** | Snapshot collision avoidance relies on atomic EEXIST detection. Must be reimplemented with transactional DB writes or KV compare-and-set. |
| **Logging** | Pino with optional pino-pretty transport | ✓ Partial | Pino works; pino-pretty (worker thread) must be disabled in Workers. JSON mode only. |
| **Test runner** | Bun Test | ✗ **BLOCKER** | Bun Test not available in Workers environment. Tests require migration to Vitest or Jest. |
| **Process ports** | `process.env.RACKULA_API_PORT` binding | ✓ Partial | Workers don't bind ports; only `fetch` handler. Config still exists but unused. |
| **Folder rename (migration)** | `node:fs.rename()` on folder path change | ✗ **BLOCKER** | Layout renaming cannot atomically move folder in external storage. Requires delete + recreate or app-level metadata tracking. |
| **Snapshot pruning** | Scans `readdir()`, sorts by mtime, deletes oldest | ✗ **BLOCKER** | External storage backends don't expose mtime for traversal. Requires DB-backed manifest of snapshots + deletion logic. |
| **Quota enforcement** | Scans filesystem for directory/file counts | ✗ **BLOCKER** | Dynamic quota counting on every write is incompatible with serverless. Must pre-compute or use database rowcount queries. |
| **Session invalidation** | In-memory cache (`sessions.ts`) | ✗ **BLOCKER** | Logout tokens stored in Node process memory; lost on restart. Workers have no persistent process memory. Requires distributed session store (KV, D1). |

---

## Key Technical Debt for Workers Migration

### 1. **Storage Backend Architecture**

- **Current:** Local filesystem only (`DATA_DIR`/`node:fs/promises`)
- **Required for Workers:**
  - **Option A:** Cloudflare R2 (object storage for layouts/assets) + D1 (SQLite for metadata: updatedAt, snapshots manifest, quota accounting)
  - **Option B:** D1 only (BLOB columns for layout YAML, asset images; slower for large images)
  - **Option C:** Durable Objects (state machine per layout; new architecture)

### 2. **Timestamp Source of Truth**

- **Current:** `stat.mtime.toISOString()` from filesystem
- **Required:** Explicit timestamp field in database or R2 object metadata
- **Challenge:** Multiple replica writes or concurrent clients; must establish write-win ordering

### 3. **Password Hashing Migration**

- **Current:** `@node-rs/argon2` (Argon2id, 64 MiB cost)
- **Options:**
  - **Option A:** Server-side: Move hashing to a server-side service (e.g., Auth0, Firebase Auth); API validates session tokens, not passwords
  - **Option B:** Client-side: Pre-hash in browser via WASM (argon2-wasm npm package); API accepts hash, no password verification
  - **Option C:** Degrade to PBKDF2 or scrypt via WebCrypto (lower security, acceptable if combined with rate limiting)

### 4. **Atomic Snapshot Collision Avoidance**

- **Current:** `writeFile(..., { flag: "wx" })` (exclusive create) + counter suffix retry logic
- **Required:** Transactional DB write or KV conditional put
- **Trade-off:** Suffix collision rate becomes acceptable risk if DB has millisecond precision timestamp

### 5. **Session Invalidation State**

- **Current:** In-memory cache in `security/sessions.ts`
- **Required:** Distributed session store (KV with TTL, or D1 with cleanup job)

### 6. **Auth Bootstrap (Local Mode)**

- **Current:** Synchronous `process.env` read + async `hashPassword()` during `createApp()`
- **Challenge:** Argon2 hashing incompatible with Workers; must pre-hash credentials or use a server-side service

---

## File Inventory: Storage Module

```
api/src/storage/
├── assets.ts          (340 lines) — Device image upload/download
├── assets.test.ts     — Asset route tests
├── filesystem.ts      (780+ lines) — Layout YAML CRUD + snapshots
├── filesystem.test.ts — Filesystem storage tests
├── quota.ts           (154 lines) — Per-user quota enforcement
└── quota.test.ts      — Quota validation tests
```

---

## File Inventory: Security Module

```
api/src/security/
├── config.ts          — Env resolution (CORS, auth modes, session config)
├── config.test.ts     — Config parsing tests
├── tokens.ts          — Session token signing/verification (HMAC-SHA256)
├── middleware.ts      — Auth gate, CSRF protection
├── middleware.test.ts
├── csrf.ts            — CSRF token validation
├── origin-policy.ts   — Origin checking on mutating requests
├── origin-policy.test.ts
├── rate-limit.ts      — In-memory rate limiting
├── rate-limit.test.ts
├── rate-limit-middleware.ts — Rate limit middleware integration
├── rate-limit-middleware.test.ts
├── sessions.ts        — In-memory logout token cache
├── types.ts           — Security type definitions
├── storage-quota-middleware.ts — Quota enforcement middleware
├── storage-quota-middleware.test.ts
├── request-utils.ts   — Request header parsing
└── index.ts           — Public exports
```

---

## Entry Point Code Flow

```
index.ts (Bun)
  └─> createApp() [app.ts]
      ├─> resolveApiSecurityConfig(env) [security/config.ts]
      ├─> bootstrapLocalCredentials(env) [if AUTH_MODE=local]
      │   └─> hashPassword() [local-auth.ts → @node-rs/argon2]
      ├─> createAuth(secret, env) [auth/config.ts → better-auth]
      ├─> Mount middleware:
      │   ├─> honoLogger()
      │   ├─> cors(securityConfig.corsOrigin)
      │   ├─> createRateLimitMiddleware()
      │   ├─> createAuthGateMiddleware() [if authEnabled]
      │   ├─> createCsrfProtectionMiddleware()
      │   ├─> createOriginPolicyMiddleware()
      │   └─> createStorageQuotaMiddleware()
      ├─> Mount routes:
      │   ├─> /health, /version (public)
      │   ├─> /auth/* (auth endpoints)
      │   ├─> /layouts/* → layouts.ts
      │   │   └─> saveLayout() [filesystem.ts]
      │   │       ├─> getLayout()
      │   │       ├─> saveSnapshot() [if echo mismatch]
      │   │       └─> stat() [for mtime → updatedAt]
      │   └─> /assets/* → assets.ts
      │       └─> saveAsset() [assets.ts]
      │           └─> writeFile() atomic + rename()
      └─> return app (Hono instance)

(Bun exports)
  └─> { port, fetch: app.fetch.bind(app) }
```

---

## Next Steps for Spike Execution

1. **Establish storage backend prototype** — Test R2 + D1 for layout/asset/snapshot data model
2. **Design timestamp mechanism** — Determine updatedAt source and concurrency conflict resolution
3. **Evaluate auth migration path** — Server-side hashing vs. client pre-hash vs. WebCrypto downgrade
4. **Prototype session store** — KV-backed logout token cache with TTL
5. **Audit rate limiting** — Ensure in-memory rate limiter can be reimplemented with shared state (KV or Durable Objects)
6. **Plan test migration** — Vitest + MSW for mocking Cloudflare APIs
