# 1/3 RU Positioning System Design

**Date:** 2026-01-14
**Discussion:** [#631](https://github.com/RackulaLives/Rackula/discussions/631)
**Status:** Approved

## Problem

Standard server racks have 3 mounting holes per rack unit. The current 1/2U fine-movement increment (Shift+Arrow) is physically impossible on most racks. Users need 1/3U positioning to align devices with actual hole positions.

## Solution: 1/6U Internal Units

Store positions internally as multiples of 1/6U (the LCM of 1/2 and 1/3). This supports both 1/2U devices (brush strips, cable management) and 1/3U hole alignment without floating-point precision issues.

### Position Mapping

| Human Position | Internal Units |
| -------------- | -------------- |
| U1 (bottom)    | 6              |
| U1 + 1/6       | 7              |
| U1 + 1/3       | 8              |
| U1 + 1/2       | 9              |
| U1 + 2/3       | 10             |
| U1 + 5/6       | 11             |
| U2             | 12             |
| U42            | 252            |

### Conversion Helpers

```typescript
const UNITS_PER_U = 6;

function toInternalUnits(humanU: number): number {
  return Math.round(humanU * UNITS_PER_U);
}

function toHumanUnits(internal: number): number {
  return internal / UNITS_PER_U;
}

function formatPosition(internal: number): string {
  const wholeU = Math.floor(internal / UNITS_PER_U);
  const fraction = internal % UNITS_PER_U;

  const fractionMap: Record<number, string> = {
    0: "",
    1: "⅙",
    2: "⅓",
    3: "½",
    4: "⅔",
    5: "⅚",
  };

  return `U${wholeU}${fractionMap[fraction]}`;
}
```

## Keyboard Movement

### Phase 1 (This Release)

| Shortcut      | Movement | Internal Units |
| ------------- | -------- | -------------- |
| Arrow Up/Down | 1U       | 6              |
| Shift + Arrow | 1/3U     | 2              |

### Phase 2 (Nerd Mode)

| Shortcut           | Movement | Internal Units |
| ------------------ | -------- | -------------- |
| Ctrl+Shift + Arrow | 1/6U     | 1              |

Gated behind a "Precision Mode" setting toggle. When enabled, also shows exact fractions in device inspector.

## Migration

### File Format

Schema version bumps from `1.0.0` to `1.1.0`. The `position` field semantics change:

- Old: `position: 1` = U1, `position: 1.5` = U1½
- New: `position: 6` = U1, `position: 9` = U1½

### Auto-Migration on Load

```typescript
function migratePosition(oldPosition: number): number {
  // Old format: positions 1-100 range
  // New format: positions 6-600 range
  if (oldPosition < 6) {
    return Math.round(oldPosition * UNITS_PER_U);
  }
  return oldPosition;
}
```

Detection uses version check (prefer) or heuristic fallback (position < 6).

### Backward Compatibility

- **Old Rackula loading new files:** Positions appear 6x higher (graceful degradation)
- **New Rackula loading old files:** Auto-converts seamlessly

## UI Display

Affected locations:

1. Device inspector panel (position field) - shows U1⅓ format
2. Rack U-number labels - remain whole numbers only
3. Device hover tooltip - if showing position
4. CSV export - position column uses human format

## Implementation Issues

1. **Core Position System** - Conversion helpers, type docs, schema bump (Medium)
2. **Migration Layer** - Auto-convert on load (Small)
3. **Keyboard Movement** - Change Shift+Arrow to 1/3U (Small)
4. **UI Position Formatting** - formatPosition() helper, update displays (Small)
5. **Nerd Mode Settings** - Precision toggle, 1/6U movement (Medium, Phase 2)

## Future Considerations

Per-rack hole pattern setting (2 or 3 holes/U) could be added if users request it. The 1/6U internal system supports both patterns cleanly.
