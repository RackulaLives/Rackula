# CodeRabbit Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address all remaining CodeRabbit review findings from PR #864 (persistent storage feature).

**Architecture:** Quick fixes across multiple files—no architectural changes. Each task is independent and can be committed separately.

**Tech Stack:** TypeScript, Bun test framework, YAML, GitHub Actions

---

## Task 1: Fix Test Assertions in filesystem.test.ts

**Files:**

- Modify: `api/src/storage/filesystem.test.ts:115, 127`

**Context:** CodeRabbit recommends using `toHaveLength` matcher instead of `.length.toBe()` for clearer test assertions.

**Step 1: Update first assertion (line 115)**

Find:

```typescript
expect(layouts.length).toBe(1);
```

Replace with:

```typescript
expect(layouts).toHaveLength(1);
```

**Step 2: Update second assertion (line 127)**

Find:

```typescript
expect(layouts.length).toBe(1);
```

Replace with:

```typescript
expect(layouts).toHaveLength(1);
```

**Step 3: Verify tests pass**

Run: `cd api && bun test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add api/src/storage/filesystem.test.ts
git commit -m "test: use toHaveLength matcher in filesystem tests"
```

---

## Task 2: Fix Asset Route in SELF-HOSTING.md Architecture Diagram

**Files:**

- Modify: `docs/guides/SELF-HOSTING.md:83`

**Context:** The architecture diagram shows the wrong endpoint for assets. Should be `PUT /api/assets/:layoutId/:deviceSlug/:face` not `POST /api/assets/:id`.

**Step 1: Update the diagram**

Find (around line 83):

```text
│  │  POST /api/assets/:id  │   │
```

Replace with:

```text
│  │  PUT /api/assets/:id  │   │
```

Note: Keep short form `:id` for diagram fit, but use PUT method.

**Step 2: Commit**

```bash
git add docs/guides/SELF-HOSTING.md
git commit -m "docs: fix asset route method in architecture diagram"
```

---

## Task 3: Add Download Step for docker-compose.persist.yml in README

**Files:**

- Modify: `README.md:69-76`

**Context:** The persistent storage example assumes docker-compose.persist.yml exists, but users cloning may not have it. Add explicit clone step.

**Step 1: Update the Persistent Storage section**

Find:

````markdown
### Persistent Storage (Self-Hosted)

For layouts that persist across sessions:

```bash
mkdir -p data
docker compose -f docker-compose.yml -f docker-compose.persist.yml up -d
```
````

````

Replace with:
```markdown
### Persistent Storage (Self-Hosted)

For layouts that persist across sessions, clone the repo first:

```bash
git clone https://github.com/rackulalives/rackula.git
cd rackula
mkdir -p data
docker compose -f docker-compose.yml -f docker-compose.persist.yml up -d
````

````

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add clone step for persistent storage setup"
````

---

## Task 4: Improve setupStoreWithDevice Helper with Guards

**Files:**

- Modify: `src/tests/factories.ts:335-348`

**Context:** The helper uses non-null assertions that produce obscure failures. Add explicit guards with descriptive errors.

**Step 1: Update the helper**

Find:

```typescript
export function setupStoreWithDevice() {
  const store = getLayoutStore();
  const rack = store.addRack("Test Rack", 42);
  const deviceType = createTestDeviceType({
    slug: "generic-server",
    model: "Generic Server",
    u_height: 2,
    category: "server",
    colour: "#4A90D9",
  });
  store.addDeviceTypeRaw(deviceType);
  store.placeDevice(rack!.id, deviceType.slug, 5);
  return { store, rackId: rack!.id, deviceSlug: deviceType.slug };
}
```

Replace with:

```typescript
export function setupStoreWithDevice() {
  const store = getLayoutStore();
  if (!store) {
    throw new Error("setupStoreWithDevice: getLayoutStore() returned null");
  }

  const rack = store.addRack("Test Rack", 42);
  if (!rack) {
    throw new Error("setupStoreWithDevice: addRack() failed to create rack");
  }

  const deviceType = createTestDeviceType({
    slug: "generic-server",
    model: "Generic Server",
    u_height: 2,
    category: "server",
    colour: "#4A90D9",
  });
  store.addDeviceTypeRaw(deviceType);

  const placed = store.placeDevice(rack.id, deviceType.slug, 5);
  if (!placed) {
    throw new Error(
      `setupStoreWithDevice: placeDevice() failed for rack ${rack.id}, device ${deviceType.slug}`,
    );
  }

  return { store, rackId: rack.id, deviceSlug: deviceType.slug };
}
```

**Step 2: Run tests to verify**

Run: `npm run test:run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/tests/factories.ts
git commit -m "test: add explicit guards to setupStoreWithDevice helper"
```

---

## Task 5: Fix Production Deployment to Include API Service

**Files:**

- Modify: `.github/workflows/deploy-prod.yml:119-123`

**Context:** The deploy step only runs `docker compose` without the persist overlay, so the API service won't be deployed. This is an "outside diff range" comment but is a critical bug.

**Step 1: Update the deploy step**

Find:

```yaml
- name: Deploy to prod
  run: |
    cd /opt/rackula/rackula-app
    docker compose pull
    docker compose up -d
```

Replace with:

```yaml
- name: Deploy to prod
  run: |
    cd /opt/rackula/rackula-app
    docker compose -f docker-compose.yml -f docker-compose.persist.yml pull
    docker compose -f docker-compose.yml -f docker-compose.persist.yml up -d
```

**Step 2: Commit**

```bash
git add .github/workflows/deploy-prod.yml
git commit -m "fix(ci): include persist overlay in production deployment"
```

---

## Task 6: Document Import Flow Persistence Integration (Design Doc Update)

**Files:**

- Modify: `docs/plans/2026-01-20-persistent-storage-design.md` (around line 1724-1756)

**Context:** CodeRabbit notes that the import flow doesn't integrate with persistence—images aren't uploaded after import. This is a design doc improvement, not code change.

**Step 1: Add a note after the import handler**

Find the `handleImportFile` function section (around line 1724) and add a comment block after it explaining the future enhancement:

After line 1756 (after the function), add:

```markdown
**Note: Future Enhancement - Persistence Integration**

The current import flow loads layout and images into memory stores but doesn't automatically sync to the persistence API. For v1, this is acceptable because:

1. Auto-save will trigger after import, persisting the layout
2. Images remain in browser memory until explicitly uploaded via custom device type creation

Future improvements could:

- Upload each image via `uploadAsset()` after import
- Detect name collisions with existing layouts
- Mark layouts as "pending sync" if API is unavailable
```

**Step 2: Commit**

```bash
git add docs/plans/2026-01-20-persistent-storage-design.md
git commit -m "docs: add note about import/persistence integration"
```

---

## Task 7: Document Multi-Tab Behavior (Design Doc Update)

**Files:**

- Modify: `docs/plans/2026-01-20-persistent-storage-design.md` (around line 2134-2164)

**Context:** CodeRabbit suggests adding multi-tab detection. This is a design doc improvement documenting the intentional last-write-wins behavior.

**Step 1: Add a note after the auto-save effect**

Find the auto-save effect section (around line 2130) and add a note about multi-tab behavior:

After the `$effect` block explanation (around line 2180), add:

```markdown
**Note: Multi-Tab Behavior**

The current design uses last-write-wins for multiple tabs. This is intentional for a single-user tool:

1. Adding tab detection adds complexity (BroadcastChannel, storage events)
2. Most users won't have multiple tabs open editing the same layout
3. The "Single-User Design" section in SELF-HOSTING.md documents this

Future improvements could add lightweight detection:

- Generate tabId, write to localStorage key "activeTab"
- Listen to storage events, warn if another tab is editing
- But this is YAGNI for v1
```

**Step 2: Commit**

```bash
git add docs/plans/2026-01-20-persistent-storage-design.md
git commit -m "docs: document multi-tab last-write-wins behavior"
```

---

## Task 8: Fix Markdown Heading Hierarchy in Design Doc

**Files:**

- Modify: `docs/plans/2026-01-20-persistent-storage-design.md:393` (and similar)

**Context:** Bold "**Step N:**" labels should use proper markdown headings for better structure.

**Step 1: Update Step labels to use h4**

This is a larger find-replace. The pattern `**Step N:**` should become `#### Step N:` (without bold).

Run these replacements:

- `**Step 1:**` → `#### Step 1:`
- `**Step 2:**` → `#### Step 2:`
- `**Step 3:**` → `#### Step 3:`
- `**Step 4:**` → `#### Step 4:`
- `**Step 5:**` → `#### Step 5:`
- `**Step 6:**` → `#### Step 6:`

Note: Only apply to the Step N pattern, not to general bold text.

**Step 2: Commit**

```bash
git add docs/plans/2026-01-20-persistent-storage-design.md
git commit -m "docs: use proper heading hierarchy for step labels"
```

---

## Summary

| Task | Description                 | Files                                                |
| ---- | --------------------------- | ---------------------------------------------------- |
| 1    | Fix toHaveLength assertions | `api/src/storage/filesystem.test.ts`                 |
| 2    | Fix asset route in diagram  | `docs/guides/SELF-HOSTING.md`                        |
| 3    | Add clone step in README    | `README.md`                                          |
| 4    | Add guards to test helper   | `src/tests/factories.ts`                             |
| 5    | Fix prod deployment         | `.github/workflows/deploy-prod.yml`                  |
| 6    | Document import/persistence | `docs/plans/2026-01-20-persistent-storage-design.md` |
| 7    | Document multi-tab behavior | `docs/plans/2026-01-20-persistent-storage-design.md` |
| 8    | Fix heading hierarchy       | `docs/plans/2026-01-20-persistent-storage-design.md` |

All tasks are independent and can be executed in any order.
