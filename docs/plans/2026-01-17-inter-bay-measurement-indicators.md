# Inter-Bay Measurement Indicators

**Date:** 2026-01-17
**Status:** Approved

## Problem

The measurement indicator (U-labels) for bayed racks is positioned incorrectly. Currently, U-labels appear on the outer edges of the rack group (left side of FRONT row, right side of REAR row). This doesn't make sense visually—measurements should appear **between** adjacent bays where users need to reference U positions across bay boundaries.

## Solution

Move U-labels from outer flanks to inter-bay positions:

**Current layout (FRONT):**

```
[U-labels] [Bay 1] [Bay 2] [Bay 3]
```

**New layout (FRONT):**

```
[Bay 1] [U-labels] [Bay 2] [U-labels] [Bay 3]
```

**New layout (REAR):**

```
[Bay 3] [U-labels] [Bay 2] [U-labels] [Bay 1]
```

## Implementation

### File: `src/lib/components/BayedRackView.svelte`

1. **Remove outer U-labels columns** (lines ~256-258 for front, ~374-376 for rear)

2. **Add conditional U-labels inside the each loop:**

```svelte
<!-- FRONT row -->
{#each racks as rack, i (rack.id)}
  <!-- existing bay container code -->
  {#if i < racks.length - 1}
    <div class="u-labels-column">
      <ULabels {uLabels} {uColumnHeight} railWidth={RAIL_WIDTH} />
    </div>
  {/if}
{/each}

<!-- REAR row (reversed) -->
{#each reversedRacks as rack, reversedIndex (rack.id)}
  {#if reversedIndex > 0}
    <div class="u-labels-column">
      <ULabels {uLabels} {uColumnHeight} railWidth={RAIL_WIDTH} />
    </div>
  {/if}
  <!-- existing bay container code -->
{/each}
```

## Edge Cases

| Scenario   | Behavior                                         |
| ---------- | ------------------------------------------------ |
| 1-bay rack | No U-labels rendered (no "between" space exists) |
| 2-bay rack | 1 U-labels column between Bay 1 and Bay 2        |
| 3-bay rack | 2 U-labels columns (between 1-2, between 2-3)    |
| N-bay rack | N-1 U-labels columns                             |

## No Changes Required

- `ULabels.svelte` — reused as-is
- `Rack.svelte` — already has `hideULabels={true}` in bayed context
- Data model / types — no schema changes

## Testing

Visual/layout change only. Per project TDD policy, no unit tests needed. Manual verification with 2-bay and 3-bay racks.

## Related

- Follow-up issue: Remove rack group UX (add/remove rack from group)
