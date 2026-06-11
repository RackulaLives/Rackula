# Storage Abuse Guardrails — Design Spec

**Issue:** #1780
**Epic:** #1274 (Self-hosted API hardening baseline)
**Date:** 2026-06-02
**Status:** Draft

## Problem

The Rackula API has no storage guardrails. An unauthenticated user (or misconfigured client) can create unlimited layouts and upload unlimited assets, filling the disk. The threat model (TM-003) explicitly identifies this gap.

Rate limiting (30 writes/min/IP) prevents request flooding but does not constrain total storage volume. Body size limits (5MB per asset, 1MB per layout YAML) cap individual request size but allow unlimited request count.

## Scope

Add storage quota enforcement with safe defaults and operator controls. No automatic cleanup or retention policy — the quota cap IS the guardrail.

## Amendment: Pre-Overwrite Snapshots (2026-06-10, spike #2019)

The no-retention stance above is scoped to user layouts: the API never deletes or expires layouts a user created. Spike #2019 (epic #2017) adds one deliberate exception: automatic pre-overwrite snapshots.

Status: planned behavior, not yet live. Tracked in issue #2040; implementation in PR #2066.

- Before a PUT overwrites an existing layout's YAML content, the API compares the request's echoed `X-Rackula-Updated-At` header against the stored copy's `updatedAt`. On mismatch (a concurrent-modification conflict, not every PUT) the existing YAML is copied to `{layout-folder}/snapshots/` before the overwrite; the write itself always proceeds (last-write-wins, never rejected). An absent header means a plain overwrite with no snapshot. At most 5 snapshots are kept per layout, pruning the oldest. Snapshots are system artifacts (YAML only, fixed bound), so the prune preserves the spirit of this spec: a hard cap, not a background cleanup job over user data.
- `{layout-folder}/snapshots/` is outside the `RACKULA_MAX_LAYOUTS` quota scan by construction: `checkLayoutQuota()` counts DATA_DIR root entries only, and snapshots live inside a layout folder. The directory is also excluded from `findYamlInFolder()`. A future quota refactor must not start counting snapshot files.
- The new `POST /layouts/:uuid/snapshots` endpoint lets the client upload a losing local working copy as a snapshot before discarding it (the client-side half of last-write-wins conflict handling). The client sends the layout YAML in the request body; the server checks it parses as YAML and writes it to the snapshots folder, rotating out the oldest if the per-layout bound of 5 is reached. It sits behind the same writeAuth, body-limit, and write-tier rate-limit middleware as `PUT /layouts/:uuid`. Responses: 201 with the snapshot filename, 400 for an invalid UUID, empty body, or unparseable YAML, 404 if the layout does not exist, 413 if the body limit is exceeded. A companion `GET /layouts/:uuid/snapshots` lists a layout's snapshots.

  ```text
  POST /layouts/3f2a.../snapshots   (body: layout YAML)
  201 { "filename": "my-rack~20260610-142233.yaml", "message": "Snapshot saved" }
  ```

- The create-versus-update quota skip is unaffected.

## Threat Model

**Primary threat:** Unauthenticated flood — an attacker or misconfigured client spamming layout creates/uploads to fill the disk, especially when `RACKULA_AUTH_MODE=none`.

**Secondary threat:** Legitimate user accidentally creating many layouts via automated scripts.

## Design Decisions

| Decision         | Choice                                      | Rationale                                                                         |
| ---------------- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| Approach         | Guardrails module + middleware              | Follows existing rate-limiter pattern. Separate concerns.                         |
| Quota dimensions | Layout count + per-layout asset count       | Fast to check (directory counts, no disk-size scan). Effective against flood.     |
| Retention policy | None (quota-only)                           | No data loss risk. When limit is hit, operator must delete old layouts.           |
| Caching          | No cache (filesystem is truth)              | Homelab scale (10-100 layouts) makes sub-ms scan acceptable. No cache drift risk. |
| Unlimited mode   | `0` = no limit                              | Preserves backward compatibility. Operators can opt out.                          |
| Error handling   | 429/507 + descriptive message + log warning | Operators monitoring logs see when quotas are approached.                         |

## Configuration

New environment variables, resolved in `security/config.ts`:

| Env Var                         | Default | Range            | Description                                 |
| ------------------------------- | ------- | ---------------- | ------------------------------------------- |
| `RACKULA_MAX_LAYOUTS`           | `100`   | `0` or `1-10000` | Maximum number of layouts. `0` = unlimited. |
| `RACKULA_MAX_ASSETS_PER_LAYOUT` | `50`    | `0` or `1-1000`  | Maximum assets per layout. `0` = unlimited. |

**Bounds:** Values are validated as positive integers or zero. Values exceeding max bounds are clamped. Invalid values fall back to defaults.

**Naming convention:** Follows existing `RACKULA_RATE_LIMIT_*` and `RACKULA_AUTH_*` patterns.

## Quota Module: `storage/quota.ts`

### Types

```typescript
interface QuotaCheckResult {
  allowed: boolean;
  current: number;
  max: number;
}
```

### Functions

```typescript
checkLayoutQuota(dataDir: string, maxLayouts: number): Promise<QuotaCheckResult>
checkAssetQuota(layoutAssetsDir: string, maxAssetsPerLayout: number): Promise<QuotaCheckResult>
```

### Implementation Details

**`checkLayoutQuota`:**

1. If `maxLayouts === 0`, return `{ allowed: true, current: 0, max: 0 }` immediately.
2. Call `readdir(dataDir)`.
3. Count entries that match UUID-suffixed directory pattern OR end in `.yaml`/`.yml` (legacy flat files).
4. Compare count against `maxLayouts`.
5. Return result with `current` count and `max` limit.

**`checkAssetQuota`:**

1. If `maxAssetsPerLayout === 0`, return `{ allowed: true, current: 0, max: 0 }` immediately.
2. If layout's `assets/` directory does not exist, `current = 0`.
3. Otherwise, recursively count files in `assets/` (not directories).
4. Compare count against `maxAssetsPerLayout`.
5. Return result with `current` count and `max` limit.

### Logging

Uses the `debug` package with namespace `rackula:quota`:

```
rackula:quota:check — Layout quota check: 42/100
rackula:quota:exceeded — Layout quota exceeded: 100/100
rackula:quota:exceeded — Asset quota exceeded for layout abc123: 50/50
```

## Middleware: `security/storage-quota-middleware.ts`

### Middleware Placement

Inserted into the existing Hono middleware chain in `app.ts`, after auth/CSRF/origin-policy but before route handlers:

```
logger → CORS → rate-limit → auth-gate → CSRF → origin-policy → write-auth → admin-auth → body-limits → storage-quota → routes
```

### Enforcement Points

| Route                                 | Method       | Quota Check                       |
| ------------------------------------- | ------------ | --------------------------------- |
| `/layouts/:uuid`                      | PUT (create) | Layout count quota                |
| `/layouts/:uuid`                      | PUT (update) | Skip — UUID already exists        |
| `/assets/:layoutId/:deviceSlug/:face` | PUT          | Asset count quota for that layout |
| All other routes                      | —            | No quota check                    |

### Create vs Update Detection

For layout routes, the middleware checks whether the layout UUID already exists:

- If `findFolderByUuid(uuid)` returns a folder → update, skip quota check.
- If not found → create, enforce quota check.

This ensures renaming or updating an existing layout never fails due to quota.

### Error Responses

**Layout quota exceeded** (HTTP 429):

```json
{
  "error": "Storage quota exceeded",
  "message": "Layout limit reached (100/100). Delete existing layouts to create new ones.",
  "current": 100,
  "max": 100
}
```

**Asset quota exceeded** (HTTP 507 Insufficient Storage):

```json
{
  "error": "Storage quota exceeded",
  "message": "Asset limit reached for this layout (50/50). Remove existing assets to add new ones.",
  "current": 50,
  "max": 50
}
```

**Response headers:**

- `Retry-After: 0` — signals that retry is possible after cleanup (not time-based).

### Logging on Quota Exceeded

When a quota is exceeded, the middleware logs a warning:

```typescript
quotaDebug("layout quota exceeded: %d/%d", current, max);
quotaDebug("asset quota exceeded for layout %s: %d/%d", layoutId, current, max);
```

## Edge Cases

### Race Condition on Concurrent Creates

Two concurrent requests could both pass the quota check and both create layouts, exceeding the limit by 1. This is an acceptable race condition for self-hosted homelab use (single user, low concurrency). Documented as a known limitation. Adding file locks would introduce complexity not justified by the threat model.

### Legacy Flat-File Layouts

`checkLayoutQuota()` counts both UUID-suffixed directories and legacy `.yaml/.yml` flat files in DATA_DIR. This ensures the limit covers all stored layouts regardless of format.

### Asset Replacement

When an existing asset is replaced (same device slug and face, different format), the atomic write pattern already handles this. The old file is cleaned up. Asset count stays the same — no quota impact.

### Missing Assets Directory

If a layout has no `assets/` directory, `checkAssetQuota()` returns `current: 0`. First asset upload always succeeds (within limits).

### Layout Rename

Renaming changes the folder name but not the UUID. The quota check is UUID-based. No quota impact.

### Unlimited Mode

When `max === 0`, both check functions return `{ allowed: true }` immediately with no filesystem scan. This preserves backward compatibility and lets operators opt out entirely.

### Auto-Migration During Quota Check

A legacy layout could be auto-migrated to folder format between the quota check and layout creation, changing the count. This is functionally identical to the race condition — extremely unlikely and acceptable for homelab use.

## Changes Required

### New Files

| File                                                | Purpose                               |
| --------------------------------------------------- | ------------------------------------- |
| `api/src/storage/quota.ts`                          | Quota check functions                 |
| `api/src/storage/quota.test.ts`                     | Tests for quota module                |
| `api/src/security/storage-quota-middleware.ts`      | Hono middleware for quota enforcement |
| `api/src/security/storage-quota-middleware.test.ts` | Tests for quota middleware            |

### Modified Files

| File                              | Changes                                                          |
| --------------------------------- | ---------------------------------------------------------------- |
| `api/src/security/config.ts`      | Add `maxLayouts` and `maxAssetsPerLayout` to config resolution   |
| `api/src/security/types.ts`       | Add `maxLayouts` and `maxAssetsPerLayout` to `ApiSecurityConfig` |
| `api/src/security/index.ts`       | Export new middleware                                            |
| `api/src/app.ts`                  | Register storage quota middleware in the chain                   |
| `api/.env.example`                | Document new env vars                                            |
| `docs/deployment/SELF-HOSTING.md` | Document quota configuration                                     |

### No Changes

| Area                             | Why                                                                     |
| -------------------------------- | ----------------------------------------------------------------------- |
| `api/src/storage/filesystem.ts`  | Quota enforcement happens at middleware level, not in storage functions |
| `api/src/storage/assets.ts`      | Same — middleware handles quota, storage functions unchanged            |
| `api/src/security/rate-limit.ts` | Existing rate limiter remains unchanged; quota is a separate concern    |
| Dockerfile                       | No changes needed — env vars are sufficient                             |

## Test Plan

### Unit Tests: `quota.test.ts`

1. **checkLayoutQuota** — returns allowed when under limit
2. **checkLayoutQuota** — returns denied when at limit
3. **checkLayoutQuota** — returns allowed when max is 0 (unlimited)
4. **checkLayoutQuota** — counts both UUID directories and legacy flat files
5. **checkLayoutQuota** — returns current: 0 when data directory is empty
6. **checkAssetQuota** — returns allowed when under limit
7. **checkAssetQuota** — returns denied when at limit
8. **checkAssetQuota** — returns allowed when max is 0 (unlimited)
9. **checkAssetQuota** — returns current: 0 when assets directory does not exist
10. **checkAssetQuota** — counts files recursively, not directories

### Unit Tests: `storage-quota-middleware.test.ts`

1. **Layout create** — returns 429 when layout quota exceeded
2. **Layout update** — skips quota check when layout UUID exists
3. **Asset upload** — returns 507 when asset quota exceeded
4. **Asset upload** — allows upload when under quota
5. **Unlimited mode** — both checks pass immediately when max is 0
6. **Error response format** — includes error, message, current, max fields
7. **Logging** — emits debug log on quota exceeded

### Integration Considerations

- Full integration test through `createApp()` with quota env vars set
- Verify 429/507 responses have correct headers and body
- Verify quota is enforced alongside existing rate limiting and auth

## Operational Documentation

### Self-Hosting Guide Update

Add section on storage quota configuration:

```env
# Storage quotas (0 = unlimited)
RACKULA_MAX_LAYOUTS=100          # Maximum number of layouts
RACKULA_MAX_ASSETS_PER_LAYOUT=50 # Maximum assets per layout
```

### Log Monitoring

Operators should monitor for `rackula:quota:exceeded` log entries to understand when limits are being reached and adjust accordingly.

### Disk Space

Quota limits count layouts and assets, not disk size. Operators should also monitor disk space on the `/data` volume independently (e.g., via Docker health checks or monitoring agents).
