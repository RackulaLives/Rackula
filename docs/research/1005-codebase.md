# Issue #1005 — Codebase Analysis: Layout Name Separation

## Summary

The layout naming conflation stems from three design decisions that interact poorly:

1. Dual name fields (`layout.name` + `layout.metadata.name`) with unclear authority
2. Implicit layout naming via first-rack name sync
3. No metadata sync after creation

**Key finding:** The data model already supports separate names. This is a behavioural fix, not a schema change.

---

## 1. Type Definitions

**File:** `src/lib/types/index.ts`

```typescript
// LayoutMetadata (lines 19-28)
export interface LayoutMetadata {
  id: string; // UUID — stable identity
  name: string; // Layout name (set once at creation, never updated)
  schema_version: string;
  description?: string;
}

// Layout interface (line 717)
export interface Layout {
  name: string; // Layout name (mutable, synced with first rack)
  metadata?: LayoutMetadata;
  // ... racks, etc.
}
```

**Two name fields:** `layout.name` is the live, mutable name. `metadata.name` is set once at creation and never updated.

---

## 2. Layout Creation

**File:** `src/lib/utils/serialization.ts` (lines 14-30)

```typescript
export function createLayout(name: string): Layout {
  return {
    name,
    metadata: {
      id: generateId(),
      name, // ← Copied once, never synced again
      schema_version: CURRENT_SCHEMA_VERSION,
    },
    // ...
  };
}
```

Both `layout.name` and `metadata.name` start identical, then diverge.

---

## 3. The Name-Sync Problem (Root Cause)

### addRack() — `src/lib/stores/layout.svelte.ts` (lines 450-454)

```typescript
function addRack(name: string, height: number, width: number) {
  const isFirstRack = layout.racks.length === 0;
  // ... create rack ...
  if (isFirstRack) {
    layout = { ...layout, name }; // ← Overwrites layout name with rack name!
  }
}
```

### addBayedRackGroup() — (lines 541-547)

```typescript
function addBayedRackGroup(groupName: string, bayCount: number, ...) {
  const isFirstRack = layout.racks.length === 0;
  // ... create group ...
  layout = {
    ...layout,
    name: isFirstRack ? groupName : layout.name,  // ← Same pattern
  };
}
```

### updateRackRaw() — (lines 2316-2318)

```typescript
// Sync layout name with first rack name
if (updates.name !== undefined && target.index === 0) {
  layout = { ...layout, name: updates.name };
}
```

### replaceRackRaw() — (lines 2333-2335)

```typescript
// Sync layout name with first rack name
if (target.index === 0) {
  layout = { ...layout, name: newRack.name };
}
```

**Impact:** Every time the first rack's name changes, the layout name changes too. Users never explicitly set a layout name.

---

## 4. YAML Serialization

**File:** `src/lib/utils/yaml.ts`

### Serialize (lines 304-332)

```typescript
export function serializeLayoutToYamlWithMetadata(
  layout: Layout,
  metadata?: LayoutMetadata,
) {
  const meta = metadata ?? {
    id: generateId(),
    name: layout.name, // ← Falls back to layout.name
    schema_version: CURRENT_SCHEMA_VERSION,
  };
  // Writes both name and metadata.name to YAML
}
```

### Deserialize (lines 250-259)

```typescript
// Metadata fallback: constructs metadata if missing from YAML
metadata: {
  id: generateId(),
  name: layout.metadata?.name ?? layout.name,  // ← Prefers metadata.name
  schema_version: CURRENT_SCHEMA_VERSION,
}
```

---

## 5. Archive/Export Filename Generation

### Archive (archive.ts, lines 234-250, 671-681)

```typescript
export function generateArchiveFilename(
  layout: Layout,
  metadata?: LayoutMetadata,
) {
  const layoutMetadata = metadata ?? {
    id: generateId(),
    name: layout.name, // ← Uses current layout.name
  };
  return `${buildFolderName(layoutMetadata.name, layoutMetadata.id)}${ARCHIVE_EXTENSION}`;
}
```

Folder structure: `{Layout Name}-{UUID}/`

### Export (export.ts, lines 1892-1905)

```typescript
export function generateExportFilename(layoutName: string, view?, format?) {
  // Pattern: {layout-name}-{view}-{YYYY-MM-DD}.{ext}
}
```

Uses current `layout.name` passed as parameter.

**Inconsistency:** Archive exports may use stale `metadata.name` if metadata was saved earlier; PNG/SVG exports always use current `layout.name`.

---

## 6. Persistence API

**File:** `src/lib/utils/persistence-api.ts` (lines 88-97)

- Uses **UUID** for all API routing (GET/PUT/DELETE)
- Layout name is display-only metadata
- No name-based lookups
- Name changes don't affect persistence identity

---

## 7. Session Storage

**File:** `src/lib/utils/session-storage.ts` (lines 104-118)

- Stores full `Layout` object (including `layout.name`)
- Uses versioned key with migration support
- Name is preserved exactly as stored — no special handling

---

## 8. UI Name References

| Component | File | Usage |
| --- | --- | --- |
| ShareDialog | ShareDialog.svelte | `layoutName={layoutStore.layout.name}` |
| HelpPanel | HelpPanel.svelte:117-125 | `layoutStore.layout.name \|\| "Untitled"` |
| ExportDialog | ExportDialog.svelte | Shows `layout.name` in UI |
| StartScreen | StartScreen.svelte:121-126 | Lists layouts by `SavedLayoutItem.name` |

---

## 9. Current Flow: New Layout Creation

```
StartScreen → "New Layout" button
  → dialogStore.open('new-rack')
    → NewRackWizard.svelte (2-step: type → details)
      → handleNewRackCreate(data)
        → layoutStore.addRack(data.name, ...)  ← rack name becomes layout name
```

No layout-naming step exists. The wizard only collects rack parameters.

---

## 10. resetAndOpenNewRack()

**File:** `src/lib/utils/persistence-manager.svelte.ts` (line 84)

Called on "Reset Layout" action. Creates a fresh layout with `createLayout("My Layout")` then opens the NewRackWizard. The layout name is immediately overwritten when the user creates their first rack.

---

## 11. Dialog System Patterns

**File:** `src/lib/stores/dialogs.svelte.ts`

```typescript
type DialogId = 'new-rack' | 'edit-rack' | 'export' | 'share' | 'help' | ...
```

- Centralised dialog state management
- `dialogStore.open(id)` / `dialogStore.close()`
- Adding a new dialog type requires: adding to `DialogId`, adding component to `DialogOrchestrator.svelte`

---

## Key Insight: Name Authority Map

| Context | Name Source | Stale Risk |
| --- | --- | --- |
| In-memory display | `layout.name` | No (live) |
| YAML top-level | `layout.name` at serialize time | No |
| YAML metadata | `metadata.name` (from creation) | **Yes** |
| Archive folder | `metadata.name` (from creation or rebuild) | **Possible** |
| Export filename | `layout.name` (passed as param) | No |
| Persistence API | UUID only | N/A |
| Session storage | `layout.name` (stored object) | No |
| Share dialog | `layout.name` | No |

The only place `metadata.name` diverges from `layout.name` is in old saved layouts where the metadata was created before a rack rename.
