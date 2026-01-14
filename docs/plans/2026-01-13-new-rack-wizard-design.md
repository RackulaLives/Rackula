# New Rack Wizard Design

**Date:** 2026-01-13
**Status:** Approved
**Related Issues:** #561 (Figma spike), #575 (SVG icons), #150 (Multi-Rack), #492 (bits-ui), #533 (UI/UX)

---

## Overview

Replace the single-step `NewRackForm.svelte` with a 3-step progressive wizard that supports both column (single rack) and bayed (grouped rack) creation.

## Problem Statement

The current New Rack dialog presents all options at once without guidance. Users have no visual understanding of column vs bayed layouts, and bayed rack group creation requires multiple manual steps.

## Solution

A 3-step wizard with visual layout type selection:

1. **Step 1: Rack Details** - Name and width
2. **Step 2: Layout Type** - Visual card selection (column vs bayed)
3. **Step 3: Dimensions** - Height and bay count (conditional)

---

## User Flow

```
┌─────────────────────────────────────────────────┐
│  New Rack                          Step 1 of 3  │
├─────────────────────────────────────────────────┤
│                                                 │
│  Rack Name                                      │
│  ┌─────────────────────────────────────────┐   │
│  │ Main Server Rack                        │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  Rack Width                                     │
│  ○ 10"   ● 19"   ○ 23"                         │
│                                                 │
├─────────────────────────────────────────────────┤
│  [Cancel]                              [Next →] │
└─────────────────────────────────────────────────┘

         ↓ Next

┌─────────────────────────────────────────────────┐
│  New Rack                          Step 2 of 3  │
├─────────────────────────────────────────────────┤
│                                                 │
│  Layout Type                                    │
│                                                 │
│  ┌─────────────┐      ┌─────────────┐          │
│  │   ┌───┐     │      │ ┌─┐ ┌─┐ ┌─┐│          │
│  │   │───│     │      │ │─│ │─│ │─││          │
│  │   │───│     │      │ │─│ │─│ │─││          │
│  │   │───│     │      │ └─┘ └─┘ └─┘│          │
│  │   └───┘     │      │             │          │
│  │             │      │             │          │
│  │  Column     │      │   Bayed     │          │
│  │  Single     │      │   2-3 racks │          │
│  │  1-42U      │      │   10-24U    │          │
│  └─────────────┘      └─────────────┘          │
│       ↑ selected                               │
│                                                 │
├─────────────────────────────────────────────────┤
│  [← Back]  [Cancel]                    [Next →] │
└─────────────────────────────────────────────────┘

         ↓ Next (Column selected)

┌─────────────────────────────────────────────────┐
│  New Rack                          Step 3 of 3  │
├─────────────────────────────────────────────────┤
│                                                 │
│  Height                                         │
│  ├────────────●───────────────────┤  42U       │
│  1U                              42U           │
│                                                 │
│  □ Custom height (43-100U)                     │
│                                                 │
├─────────────────────────────────────────────────┤
│  [← Back]  [Cancel]              [Create Rack] │
└─────────────────────────────────────────────────┘

         ↓ Next (Bayed selected)

┌─────────────────────────────────────────────────┐
│  New Rack                          Step 3 of 3  │
├─────────────────────────────────────────────────┤
│                                                 │
│  Number of Bays                                 │
│  ┌─────────┐  ┌─────────┐                      │
│  │ 2 Bays  │  │ 3 Bays  │                      │
│  └─────────┘  └─────────┘                      │
│       ↑ selected                               │
│                                                 │
│  Height (per bay)                              │
│  ├──────●─────────────────────────┤  12U      │
│  10U                             24U           │
│                                                 │
├─────────────────────────────────────────────────┤
│  [← Back]  [Cancel]        [Create Bayed Group] │
└─────────────────────────────────────────────────┘
```

---

## Component Architecture

```
src/lib/components/wizard/
├── NewRackWizard.svelte      # Main wizard container
├── WizardStep.svelte         # Step wrapper (number, title, slot)
├── LayoutTypeCard.svelte     # Visual selection card
├── RackPreviewIcon.svelte    # SVG rack icons (issue #575)
└── index.ts                  # Barrel export
```

### NewRackWizard.svelte

Main container managing:

- Step state: `currentStep: 1 | 2 | 3`
- Config state: `{ name, width, layoutType, height, bays }`
- Validation: `canProceed` derived from current step requirements
- Creation: Executes appropriate store actions on complete

### bits-ui Dialog Integration

```svelte
<Dialog.Root bind:open onOpenChange={handleClose}>
  <Dialog.Portal>
    <Dialog.Overlay class="wizard-overlay" />
    <Dialog.Content class="wizard-content">
      <Dialog.Title>New Rack</Dialog.Title>
      <Dialog.Description class="sr-only">
        Create a new rack in {currentStep} of 3 steps
      </Dialog.Description>

      <!-- Step content -->
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

---

## Creation Logic

### Column Path

```typescript
const rack = layoutStore.addRack({
  name: config.name,
  height: config.height,
  width: config.width,
});
// Single rack created, set as active automatically
```

### Bayed Path

```typescript
// 1. Create individual racks
const rackIds: string[] = [];
for (let i = 0; i < config.bays; i++) {
  const rack = layoutStore.addRackRaw({
    name: `Bay ${i + 1}`,
    height: config.height,
    width: config.width,
  });
  rackIds.push(rack.id);
}

// 2. Create group linking them
const group = layoutStore.createRackGroupRaw({
  name: config.name,
  rack_ids: rackIds,
  layout_preset: "bayed",
});

// 3. Wrap in batch command for atomic undo
const batchCommand = createBatchCommand(`Create bayed group "${config.name}"`, [
  ...rackCommands,
  groupCommand,
]);
historyStore.execute(batchCommand);

// 4. Set first bay as active
layoutStore.setActiveRack(rackIds[0]);
```

---

## Constraints & Validation

### Height Ranges

| Layout Type | Min | Max (slider) | Max (custom) |
| ----------- | --- | ------------ | ------------ |
| Column      | 1U  | 42U          | 100U         |
| Bayed       | 10U | 24U          | N/A          |

### Capacity Check

Before showing bayed option, validate:

```typescript
const canCreateBayed = layout.racks.length + 3 <= MAX_RACKS; // 3 = max bays
```

If insufficient capacity, show inline message on bayed card:

> "Requires 2-3 rack slots (N remaining)"

### Bayed Height Constraint

All racks in a bayed group must have equal heights. The wizard enforces this by using a single height input for all bays.

---

## Naming Convention

| Layout | Group Name | Individual Rack Names     |
| ------ | ---------- | ------------------------- |
| Column | N/A        | User input                |
| Bayed  | User input | "Bay 1", "Bay 2", "Bay 3" |

---

## Edge Cases

### MAX_RACKS Limit

- Check before creation: `racks.length + bayCount <= MAX_RACKS`
- Disable bayed option if insufficient capacity

### Atomic Bayed Creation

- Use `createBatchCommand()` to wrap all operations
- Single undo reverts entire bayed group creation

### First Rack (Onboarding)

- When `rackCount === 0`, wizard opens automatically
- No special handling needed - wizard IS the onboarding

### Cancel/Escape

- bits-ui Dialog handles escape key and focus return
- Local state only until Create - no cleanup needed

---

## Migration

1. Create new wizard components
2. Update `App.svelte` to use `NewRackWizard` instead of `NewRackForm`
3. Update `dialogStore` if needed for new dialog identifier
4. Delete `NewRackForm.svelte` after verification

---

## Dependencies

- **#575** - SVG rack icons (must complete first or in parallel)
- **bits-ui** - Already installed, Dialog component available

---

## Test Plan

- [ ] Column creation: name, width, height variants
- [ ] Bayed creation: 2-bay and 3-bay variants
- [ ] Height constraints: slider limits, custom input validation
- [ ] Capacity check: disable bayed when insufficient slots
- [ ] Undo: single undo reverts entire bayed creation
- [ ] Keyboard navigation: tab through steps, escape closes
- [ ] First-rack flow: wizard opens on empty layout

---

## Out of Scope

- Grouping existing racks (bayed is creation-time only)
- Canvas thumbnail view (deferred to #150)
- Color-coded rack types (not implementing)
- 4th review step (simplified to 3 steps)
