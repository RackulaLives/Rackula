# Simplify Bayed Rack UX - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove rack group management UX and treat bayed racks as atomic units with editable bay count.

**Architecture:** Delete RackGroupPanel, modify RackList to show bayed racks as single entries, add bay count editing to RackEditSheet.

**Tech Stack:** Svelte 5, TypeScript, existing layout store

---

## Task 1: Delete RackGroupPanel and Remove from RackList

**Files:**

- Delete: `src/lib/components/RackGroupPanel.svelte`
- Modify: `src/lib/components/RackList.svelte`

**Step 1: Remove RackGroupPanel import and usage from RackList**

In `src/lib/components/RackList.svelte`, remove:

```svelte
// Line 11 - remove this import import RackGroupPanel from
"./RackGroupPanel.svelte"; // Line 78 - remove this component usage
<RackGroupPanel />
```

**Step 2: Run lint to verify no broken imports**

```bash
npm run lint
```

Expected: PASS (no errors about missing component)

**Step 3: Delete RackGroupPanel.svelte**

```bash
rm src/lib/components/RackGroupPanel.svelte
```

**Step 4: Run build to verify**

```bash
npm run build
```

Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove RackGroupPanel component

Bayed racks will be shown as single entries in RackList instead
of having a separate group management panel."
```

---

## Task 2: Add Helper Functions to Layout Store

**Files:**

- Modify: `src/lib/stores/layout.svelte.ts`

**Step 1: Add addBayToGroup function**

Add after `removeRackFromGroup` function (around line 827):

```typescript
/**
 * Add a new empty bay to a bayed rack group
 * Creates a new rack with matching height and adds to group
 * @param groupId - Group ID
 * @returns The new rack ID or error
 */
function addBayToGroup(groupId: string): { rackId?: string; error?: string } {
  const group = getRackGroupById(groupId);
  if (!group) {
    return { error: "Group not found" };
  }

  if (group.layout_preset !== "bayed") {
    return { error: "Can only add bays to bayed rack groups" };
  }

  // Get height from existing rack in group
  const existingRack = layout.racks.find((r) => r.id === group.rack_ids[0]);
  if (!existingRack) {
    return { error: "Group has no existing racks" };
  }

  // Check capacity
  if (layout.racks.length >= MAX_RACKS) {
    return { error: "Maximum rack limit reached" };
  }

  // Create new rack with matching height
  const newRackId = crypto.randomUUID();
  const bayNumber = group.rack_ids.length + 1;
  const newRack: Rack = {
    id: newRackId,
    name: `Bay ${bayNumber}`,
    height: existingRack.height,
    width: existingRack.width,
    devices: [],
  };

  // Add rack to layout
  layout.racks.push(newRack);

  // Add to group
  const result = addRackToGroup(groupId, newRackId);
  if (result.error) {
    // Rollback rack creation
    layout.racks = layout.racks.filter((r) => r.id !== newRackId);
    return { error: result.error };
  }

  return { rackId: newRackId };
}

/**
 * Remove the last bay from a bayed rack group
 * @param groupId - Group ID
 * @returns Error if bay has devices or group would have < 2 bays
 */
function removeBayFromGroup(groupId: string): { error?: string } {
  const group = getRackGroupById(groupId);
  if (!group) {
    return { error: "Group not found" };
  }

  if (group.rack_ids.length <= 2) {
    return { error: "Bayed racks must have at least 2 bays" };
  }

  // Get the last rack
  const lastRackId = group.rack_ids[group.rack_ids.length - 1];
  const lastRack = layout.racks.find((r) => r.id === lastRackId);

  if (lastRack && lastRack.devices.length > 0) {
    return {
      error: `Bay ${group.rack_ids.length} contains ${lastRack.devices.length} device(s). Remove them first.`,
    };
  }

  // Remove from group
  removeRackFromGroup(groupId, lastRackId);

  // Delete the rack
  layout.racks = layout.racks.filter((r) => r.id !== lastRackId);

  return {};
}
```

**Step 2: Export new functions**

Find the return statement (around line 200-220) and add:

```typescript
addBayToGroup,
removeBayFromGroup,
```

**Step 3: Run lint and tests**

```bash
npm run lint && npm run test:run
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/stores/layout.svelte.ts
git commit -m "feat: add addBayToGroup and removeBayFromGroup store functions"
```

---

## Task 3: Modify RackList to Show Bayed Racks as Single Entries

**Files:**

- Modify: `src/lib/components/RackList.svelte`

**Step 1: Add derived state for grouped vs ungrouped racks**

After `const canAddRack` (line 29), add:

```typescript
const rackGroups = $derived(layoutStore.rack_groups);

// Get set of rack IDs that belong to groups
const groupedRackIds = $derived(new Set(rackGroups.flatMap((g) => g.rack_ids)));

// Ungrouped racks only
const ungroupedRacks = $derived(racks.filter((r) => !groupedRackIds.has(r.id)));

// Get total device count for a bayed rack group
function getGroupDeviceCount(group: { rack_ids: string[] }): number {
  return group.rack_ids.reduce((sum, rackId) => {
    const rack = layoutStore.getRackById(rackId);
    return sum + (rack?.devices.length ?? 0);
  }, 0);
}

// Get the first rack in a group (for height info)
function getGroupFirstRack(group: { rack_ids: string[] }) {
  return layoutStore.getRackById(group.rack_ids[0]);
}
```

**Step 2: Add group selection handler**

After `handleRackClick` function, add:

```typescript
function handleGroupClick(groupId: string) {
  const group = rackGroups.find((g) => g.id === groupId);
  if (group && group.rack_ids.length > 0) {
    // Select the first rack in the group to make the whole group active
    layoutStore.setActiveRack(group.rack_ids[0]);
    selectionStore.selectRack(group.rack_ids[0]);
  }
}
```

**Step 3: Add group delete handler**

After the new `handleGroupClick` function, add:

```typescript
function handleGroupDeleteClick(
  event: MouseEvent,
  group: { id: string; name?: string; rack_ids: string[] },
) {
  event.stopPropagation();
  // Check for devices in any bay
  const deviceCount = getGroupDeviceCount(group);
  rackToDelete = {
    id: group.id,
    name: group.name ?? "Bayed Rack",
    isGroup: true,
    deviceCount,
  };
  deleteConfirmOpen = true;
}
```

**Step 4: Update rackToDelete type**

Change line 25:

```typescript
let rackToDelete = $state<{
  id: string;
  name: string;
  isGroup?: boolean;
  deviceCount?: number;
} | null>(null);
```

**Step 5: Update confirmDelete to handle groups**

Replace the `confirmDelete` function:

```typescript
function confirmDelete() {
  if (rackToDelete) {
    if (rackToDelete.isGroup) {
      // Delete all racks in the group, then the group
      const group = rackGroups.find((g) => g.id === rackToDelete!.id);
      if (group) {
        // Delete racks first
        for (const rackId of group.rack_ids) {
          layoutStore.deleteRack(rackId);
        }
        // Group auto-deletes when last rack removed
      }
      toastStore.showToast(
        `Deleted "${rackToDelete.name}"${rackToDelete.deviceCount ? ` (${rackToDelete.deviceCount} devices removed)` : ""}`,
        "info",
      );
    } else {
      const deviceCount =
        layoutStore.getRackById(rackToDelete.id)?.devices.length ?? 0;
      layoutStore.deleteRack(rackToDelete.id);
      toastStore.showToast(
        `Deleted "${rackToDelete.name}"${deviceCount > 0 ? ` (${deviceCount} devices removed)` : ""}`,
        "info",
      );
    }
    selectionStore.clearSelection();
  }
  deleteConfirmOpen = false;
  rackToDelete = null;
}
```

**Step 6: Update getDeleteMessage**

Replace the `getDeleteMessage` function:

```typescript
function getDeleteMessage(): string {
  if (!rackToDelete) return "";
  if (rackToDelete.isGroup) {
    const count = rackToDelete.deviceCount ?? 0;
    if (count > 0) {
      return `Delete "${rackToDelete.name}"? This will remove ${count} device${count === 1 ? "" : "s"} across all bays.`;
    }
    return `Delete "${rackToDelete.name}"? All bays will be removed.`;
  }
  const deviceCount =
    layoutStore.getRackById(rackToDelete.id)?.devices.length ?? 0;
  if (deviceCount > 0) {
    return `Delete "${rackToDelete.name}"? This will remove ${deviceCount} device${deviceCount === 1 ? "" : "s"}.`;
  }
  return `Delete "${rackToDelete.name}"? This rack is empty.`;
}
```

**Step 7: Update template to show bayed racks as single entries**

Replace the rack-items div content (lines 86-131):

```svelte
<div class="rack-items" role="listbox" aria-label="Rack list">
  <!-- Bayed rack groups as single entries -->
  {#each rackGroups as group (group.id)}
    {@const firstRack = getGroupFirstRack(group)}
    {@const isActive = group.rack_ids.includes(activeRackId ?? "")}
    {@const deviceCount = getGroupDeviceCount(group)}
    {@const bayCount = group.rack_ids.length}
    <div
      class="rack-item"
      class:active={isActive}
      onclick={() => handleGroupClick(group.id)}
      onkeydown={(e) =>
        (e.key === "Enter" || e.key === " ") && handleGroupClick(group.id)}
      role="option"
      aria-selected={isActive}
      tabindex="0"
      data-testid="rack-item-group-{group.id}"
    >
      <span class="rack-indicator" aria-hidden="true">
        {isActive ? "●" : "○"}
      </span>
      <span class="rack-info">
        <span class="rack-name">{group.name ?? "Bayed Rack"}</span>
        <span class="rack-meta"
          >{firstRack?.height ?? "?"}U · {bayCount}-bay · {deviceCount} device{deviceCount !==
          1
            ? "s"
            : ""}</span
        >
      </span>
      <button
        type="button"
        class="rack-delete"
        onclick={(e) => handleGroupDeleteClick(e, group)}
        aria-label="Delete {group.name ?? 'bayed rack'}"
        title="Delete bayed rack"
      >
        ✕
      </button>
    </div>
  {/each}

  <!-- Ungrouped racks -->
  {#each ungroupedRacks as rack (rack.id)}
    {@const isActive = rack.id === activeRackId}
    {@const deviceCount = rack.devices.length}
    <div
      class="rack-item"
      class:active={isActive}
      onclick={() => handleRackClick(rack.id)}
      onkeydown={(e) =>
        (e.key === "Enter" || e.key === " ") && handleRackClick(rack.id)}
      role="option"
      aria-selected={isActive}
      tabindex="0"
      data-testid="rack-item-{rack.id}"
    >
      <span class="rack-indicator" aria-hidden="true">
        {isActive ? "●" : "○"}
      </span>
      <span class="rack-info">
        <span class="rack-name">{rack.name}</span>
        <span class="rack-meta"
          >{rack.height}U · {deviceCount} device{deviceCount !== 1
            ? "s"
            : ""}</span
        >
      </span>
      <button
        type="button"
        class="rack-delete"
        onclick={(e) => handleDeleteClick(e, { id: rack.id, name: rack.name })}
        aria-label="Delete {rack.name}"
        title="Delete rack"
      >
        ✕
      </button>
    </div>
  {/each}

  {#if rackGroups.length === 0 && ungroupedRacks.length === 0}
    <div class="empty-state">
      <p class="empty-message">No racks yet</p>
      <p class="empty-hint">Create your first rack to get started</p>
    </div>
  {/if}
</div>
```

**Step 8: Update rack count display**

Change line 81-83:

```svelte
<span class="rack-count">
  {rackGroups.length + ungroupedRacks.length} rack{rackGroups.length +
    ungroupedRacks.length !==
  1
    ? "s"
    : ""}
</span>
```

**Step 9: Run lint and build**

```bash
npm run lint && npm run build
```

Expected: PASS

**Step 10: Commit**

```bash
git add src/lib/components/RackList.svelte
git commit -m "feat: show bayed racks as single entries in rack list

- Bayed racks appear as 'Name (N-bay)' entries
- Clicking selects entire bayed rack
- Delete removes all bays
- Ungrouped racks shown separately below"
```

---

## Task 4: Add Bay Count Editing to RackEditSheet

**Files:**

- Modify: `src/lib/components/RackEditSheet.svelte`

**Step 1: Add group detection and bay count state**

After the existing state declarations (around line 35), add:

```typescript
// Check if this rack is part of a bayed group
const rackGroup = $derived(layoutStore.getRackGroupForRack(rack.id));
const isBayedRack = $derived(rackGroup?.layout_preset === "bayed");
const bayCount = $derived(rackGroup?.rack_ids.length ?? 1);

// State for bay count changes
let bayCountError = $state<string | null>(null);
```

**Step 2: Add bay count change handler**

After `handlePresetClick` function, add:

```typescript
// Handle bay count change
function handleBayCountChange(newCount: number) {
  if (!rackGroup) return;

  bayCountError = null;

  if (newCount < 2) {
    bayCountError = "Bayed racks must have at least 2 bays";
    return;
  }

  const currentCount = rackGroup.rack_ids.length;

  if (newCount > currentCount) {
    // Adding bays
    for (let i = currentCount; i < newCount; i++) {
      const result = layoutStore.addBayToGroup(rackGroup.id);
      if (result.error) {
        bayCountError = result.error;
        return;
      }
    }
  } else if (newCount < currentCount) {
    // Removing bays (from the end)
    for (let i = currentCount; i > newCount; i--) {
      const result = layoutStore.removeBayFromGroup(rackGroup.id);
      if (result.error) {
        bayCountError = result.error;
        return;
      }
    }
  }
}
```

**Step 3: Add bay count UI section**

After the Rack Height form-group (around line 172), add:

```svelte
<!-- Bay Count (only for bayed racks) -->
{#if isBayedRack}
  <div class="form-group">
    <label for="bay-count-mobile">Bay Count</label>
    <div class="bay-count-controls">
      <button
        type="button"
        class="bay-btn"
        onclick={() => handleBayCountChange(bayCount - 1)}
        disabled={bayCount <= 2}
        aria-label="Remove bay"
      >
        −
      </button>
      <span class="bay-count-display">{bayCount}</span>
      <button
        type="button"
        class="bay-btn"
        onclick={() => handleBayCountChange(bayCount + 1)}
        aria-label="Add bay"
      >
        +
      </button>
    </div>
    {#if bayCountError}
      <p class="helper-text error">{bayCountError}</p>
    {/if}
  </div>
{/if}
```

**Step 4: Add CSS for bay count controls**

Add to the style section:

```css
.bay-count-controls {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.bay-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--touch-target-min);
  height: var(--touch-target-min);
  font-size: var(--font-size-xl);
  font-weight: 500;
  color: var(--colour-text);
  background: var(--colour-surface-secondary);
  border: 1px solid var(--colour-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s ease;
}

.bay-btn:hover:not(:disabled) {
  background: var(--colour-surface-hover);
  border-color: var(--colour-selection);
}

.bay-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bay-btn:focus-visible {
  outline: 2px solid var(--colour-focus-ring);
  outline-offset: 2px;
}

.bay-count-display {
  font-size: var(--font-size-xl);
  font-weight: 600;
  min-width: 2ch;
  text-align: center;
}
```

**Step 5: Run lint and build**

```bash
npm run lint && npm run build
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/components/RackEditSheet.svelte
git commit -m "feat: add bay count editing for bayed racks

- Shows bay count +/- controls for bayed racks
- Validates minimum 2 bays
- Shows error if removing bay with devices"
```

---

## Task 5: Verify and Test

**Step 1: Start dev server**

```bash
npm run dev
```

**Step 2: Manual verification checklist**

- [ ] RackGroupPanel no longer appears in sidebar
- [ ] Bayed rack shows as single entry (e.g., "Bayoncé · 12U · 2-bay · 0 devices")
- [ ] Clicking bayed rack in sidebar selects entire rack on canvas
- [ ] Delete bayed rack removes all bays
- [ ] Edit bayed rack shows bay count +/- controls
- [ ] Can increase bay count (adds empty bay)
- [ ] Cannot decrease below 2 bays
- [ ] Cannot remove bay with devices (shows error)

**Step 3: Run full test suite**

```bash
npm run test:run
```

Expected: PASS

**Step 4: Final commit**

```bash
git add -A
git commit -m "test: verify bayed rack UX simplification"
```

---

## Summary

| Task | Description                  | Files                                           |
| ---- | ---------------------------- | ----------------------------------------------- |
| 1    | Delete RackGroupPanel        | RackGroupPanel.svelte (delete), RackList.svelte |
| 2    | Add store functions          | layout.svelte.ts                                |
| 3    | Show bayed as single entries | RackList.svelte                                 |
| 4    | Bay count editing            | RackEditSheet.svelte                            |
| 5    | Verification                 | Manual + test suite                             |
