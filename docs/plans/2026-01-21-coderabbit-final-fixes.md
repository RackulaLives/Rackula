# CodeRabbit Final Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address remaining CodeRabbit findings with pragmatic KISS approach—fix real issues, skip over-engineering.

**Architecture:** Quick targeted fixes. No architectural changes. Each task is independent.

**Tech Stack:** TypeScript, Bun, Docker, Hono

---

## Triage: What to Fix vs Skip

| Finding                             | Decision | Rationale                                                 |
| ----------------------------------- | -------- | --------------------------------------------------------- |
| `.gitignore` redundant `.env.local` | **Fix**  | 1-line cleanup                                            |
| Duplicate debug logs in canvas      | **Skip** | Debug logs are intentional, verbose is fine for debugging |
| `setupStoreWithDevice` flexibility  | **Skip** | Just added guards, YAGNI on parameterization              |
| Extract API test helpers            | **Skip** | API tests run with Bun separately, no sharing needed      |
| `bun:test` vs `vitest`              | **Skip** | API runs on Bun, uses Bun's test runner intentionally     |
| Pin Dockerfile Bun version          | **Fix**  | Reproducibility matters                                   |
| More `.gitignore` patterns          | **Skip** | Current patterns are sufficient                           |
| Healthcheck wget --spider           | **Fix**  | Real issue - HEAD vs GET                                  |
| DRY workflow steps                  | **Skip** | Over-engineering, duplication is fine for clarity         |
| `$(pwd)` in docs                    | **Skip** | Works in bash/zsh which 99% use                           |
| README clone URL casing             | **Fix**  | Easy correctness fix                                      |
| Docker API not reachable            | **Skip** | False positive - nginx proxies /api/\*                    |
| Lockfile copy glob                  | **Fix**  | Real issue - fails without lockfile                       |
| Content-Length check                | **Fix**  | Security - prevent OOM                                    |
| `app.fetch` binding                 | **Fix**  | Real bug in some runtimes                                 |
| Grep verification in docs           | **Fix**  | Replace with better check                                 |
| CORS missing POST                   | **Fix**  | Asset uploads might need POST (future-proofing)           |

**Tasks to implement: 8 fixes**

---

## Task 1: Fix Redundant .gitignore Pattern

**Files:**

- Modify: `api/.gitignore:7`

**Step 1: Remove redundant line**

The pattern `.env.*` already matches `.env.local`, so line 7 is redundant.

Find and remove line 7:

```
.env.local
```

Result should be:

```
node_modules/
*.log

# Environment files (may contain secrets)
.env
.env.*

# Build artifacts
dist/
coverage/

# OS artifacts
.DS_Store
```

**Step 2: Commit**

```bash
git add api/.gitignore
git commit -m "chore: remove redundant .env.local from gitignore"
```

---

## Task 2: Pin Dockerfile Bun Version

**Files:**

- Modify: `api/Dockerfile:3`

**Step 1: Pin to specific version**

Find:

```dockerfile
FROM oven/bun:1-alpine AS base
```

Replace with:

```dockerfile
FROM oven/bun:1.1.45-alpine AS base
```

Note: 1.1.45 is current stable. Check https://hub.docker.com/r/oven/bun/tags for latest if needed.

**Step 2: Commit**

```bash
git add api/Dockerfile
git commit -m "chore: pin Bun Docker image to 1.1.45 for reproducibility"
```

---

## Task 3: Fix Healthcheck to Use GET Instead of HEAD

**Files:**

- Modify: `api/Dockerfile:40`

**Context:** `wget --spider` sends HEAD request, but `/health` only handles GET. Remove `--spider` and discard body with `-O /dev/null`.

**Step 1: Update healthcheck**

Find:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:3001/health || exit 1
```

Replace with:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3001/health || exit 1
```

Note: Also changed `localhost` to `127.0.0.1` per project convention.

**Step 2: Commit**

```bash
git add api/Dockerfile
git commit -m "fix: use GET request for Docker healthcheck"
```

---

## Task 4: Fix Lockfile Copy Pattern

**Files:**

- Modify: `api/Dockerfile:8`

**Context:** The glob `bun.lockb*` is meant to be optional, but `--frozen-lockfile` requires it. Make lockfile required.

**Step 1: Update COPY to require lockfile**

Find:

```dockerfile
COPY package.json bun.lockb* ./
```

Replace with:

```dockerfile
COPY package.json bun.lockb ./
```

**Step 2: Verify bun.lockb exists**

Run: `ls -la api/bun.lockb`

If missing, generate it:

```bash
cd api && bun install
```

**Step 3: Commit**

```bash
git add api/Dockerfile api/bun.lockb
git commit -m "fix: require bun.lockb for reproducible Docker builds"
```

---

## Task 5: Add Content-Length Check Before Reading Body

**Files:**

- Modify: `api/src/routes/assets.ts:76-77`

**Context:** Reading entire body into memory without checking size can OOM. Check Content-Length header first.

**Step 1: Add size check before arrayBuffer()**

Find (around line 76):

```typescript
  try {
    const data = await c.req.arrayBuffer();
```

Replace with:

```typescript
  // Check Content-Length before reading body (5MB limit)
  const contentLength = c.req.header("Content-Length");
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > 5 * 1024 * 1024) {
      return c.json({ error: "File too large. Maximum size is 5MB" }, 413);
    }
  }

  try {
    const data = await c.req.arrayBuffer();
```

**Step 2: Verify API still works**

Run: `cd api && bun test`

**Step 3: Commit**

```bash
git add api/src/routes/assets.ts
git commit -m "fix: check Content-Length before reading body to prevent OOM"
```

---

## Task 6: Bind app.fetch to Preserve Context

**Files:**

- Modify: `api/src/index.ts:51`

**Context:** In some Bun/runtime contexts, `app.fetch` loses its `this` binding. Bind it explicitly.

**Step 1: Update export**

Find:

```typescript
export default {
  port,
  fetch: app.fetch,
};
```

Replace with:

```typescript
export default {
  port,
  fetch: app.fetch.bind(app),
};
```

**Step 2: Verify API still works**

Run: `cd api && bun test`

**Step 3: Commit**

```bash
git add api/src/index.ts
git commit -m "fix: bind app.fetch to preserve context in Bun runtime"
```

---

## Task 7: Add CORS POST Method

**Files:**

- Modify: `api/src/index.ts:20`

**Context:** Current CORS config missing POST. While not used now, it's a common method and costs nothing to allow.

**Step 1: Add POST to allowMethods**

Find:

```typescript
    allowMethods: ["GET", "PUT", "DELETE", "OPTIONS"],
```

Replace with:

```typescript
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
```

**Step 2: Commit**

```bash
git add api/src/index.ts
git commit -m "chore: add POST to CORS allowed methods"
```

---

## Task 8: Fix README Clone URL Casing

**Files:**

- Modify: `README.md` (Persistent Storage section)

**Step 1: Fix repository URL casing**

Find:

```bash
git clone https://github.com/rackulalives/rackula.git
```

Replace with:

```bash
git clone https://github.com/RackulaLives/Rackula.git
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: fix repository URL casing in README"
```

---

## Task 9: Improve SELF-HOSTING.md Persistence Verification

**Files:**

- Modify: `docs/guides/SELF-HOSTING.md:469-473`

**Context:** Grepping minified JS for "PERSIST" is unreliable. Replace with checking network requests.

**Step 1: Update verification instructions**

Find:

````markdown
**Verify using correct image:**

```bash
# Check if persistence is enabled in the build
docker run --rm ghcr.io/rackulalives/rackula:persist \
  grep -r "PERSIST" /usr/share/nginx/html/
```
````

````

Replace with:
```markdown
**Verify persistence is working:**

1. Open browser DevTools (F12) → Network tab
2. Create or modify a layout
3. Look for `PUT /api/layouts/*` requests
4. If you see these requests, persistence is enabled
5. If no API calls appear, the image was built without `VITE_PERSIST_ENABLED=true`
````

**Step 2: Commit**

```bash
git add docs/guides/SELF-HOSTING.md
git commit -m "docs: improve persistence verification instructions"
```

---

## Summary

| Task | Description                      | Files                         |
| ---- | -------------------------------- | ----------------------------- |
| 1    | Remove redundant .gitignore line | `api/.gitignore`              |
| 2    | Pin Bun Docker version           | `api/Dockerfile`              |
| 3    | Fix healthcheck GET vs HEAD      | `api/Dockerfile`              |
| 4    | Require lockfile in Docker       | `api/Dockerfile`              |
| 5    | Add Content-Length check         | `api/src/routes/assets.ts`    |
| 6    | Bind app.fetch context           | `api/src/index.ts`            |
| 7    | Add POST to CORS                 | `api/src/index.ts`            |
| 8    | Fix README URL casing            | `README.md`                   |
| 9    | Improve persistence verification | `docs/guides/SELF-HOSTING.md` |

All tasks are independent. Tasks 2-4 can be combined into single Dockerfile commit.
