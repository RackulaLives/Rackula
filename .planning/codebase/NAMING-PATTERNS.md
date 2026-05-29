# Coding Conventions

**Analysis Date:** 2026-02-19

## Naming Patterns

**Files:**

- Component files: PascalCase with `.svelte` extension (`LabelOverlaySVG.svelte`, `EditPanel.svelte`)
- Store files: camelCase with `.svelte.ts` for reactive stores (`layout.svelte.ts`, `canvas.svelte.ts`)
- Utility files: camelCase with `.ts` extension (`position.ts`, `collision.ts`, `debug.ts`)
- Test files: match source file name with `.test.ts` suffix (`layout-store.test.ts`, `device-lookup.test.ts`)
- Type definition files: `index.ts` in type directories (`src/lib/types/index.ts`)

**Functions:**

- camelCase for all functions and methods
- Prefixed names for factory functions: `createTestRack`, `createDeviceType`, `createLayoutStore`
- Prefix names for utility functions: `findDeviceType`, `canPlaceDevice`, `generateId`
- Underscores for constants and option fields from schema: `u_height`, `device_type`, `form_factor`, `is_full_depth`

**Variables:**

- camelCase for all local and instance variables
- Descriptive names emphasizing intent: `activeRackId`, `isDirty`, `deviceCount`, `blockSlots`
- Leading underscore for unused variables from destructuring: `const _unusedVar = value`
- Avoid single-letter variables except in loops: use `device` instead of `d`

**Types:**

- PascalCase for all type and interface names: `Layout`, `Rack`, `PlacedDevice`, `DeviceType`, `Command`
- Suffix with "Command" for command pattern classes: `AddDeviceTypeCommand`, `PlaceDeviceCommand`
- Suffix with "Store" for store instances: `LayoutStore`, `HistoryStore`
- Use `type` keyword for TypeScript type aliases, `interface` for extensible object shapes

**Constants:**

- SCREAMING_SNAKE_CASE for module-level constants: `MAX_RACKS`, `DEFAULT_DEVICE_FACE`, `UNITS_PER_U`
- Grouped in dedicated constant files: `src/lib/types/constants.ts`, `src/lib/constants/layout.ts`

## Code Style

**Formatting:**

- Prettier 3.8.1 with prettier-plugin-svelte
- Default Prettier settings (no custom `.prettierrc` overrides)
- Single quotes are NOT enforced (Prettier uses double by default)
- Trailing commas enabled in all contexts
- Max line length: 80 characters (default Prettier)

**Linting:**

- ESLint 10.0.0 with `@eslint/js`, `typescript-eslint`, `eslint-plugin-svelte`
- TypeScript strict: false (disabled in tsconfig.json, but individual rules enforced via ESLint)
- No unused variables allowed (via `@typescript-eslint/no-unused-vars` with underscore allowlist)
- Unused variables prefixed with `_` are silently allowed: `const _unusedValue = getValue()`

**Key ESLint Rules (Test Files):**

- `testing-library/no-container`: Error - blocks `querySelector` in tests
- `testing-library/no-node-access`: Error - blocks direct DOM node access in tests
- `no-restricted-syntax`: Error - blocks specific anti-patterns:
  - `toHaveLength()` with literal numbers on data arrays (behavioral invariants allowed with eslint-disable-next-line)
  - `toBe()` with hardcoded color values like `#FF0000`
  - `toHaveClass()` assertions
  - Typeof checks for function existence

## Import Organization

**Order:**

1. External packages (node_modules): `import { vi } from "vitest"`
2. Svelte imports: `import { SvelteSet } from "svelte/reactivity"`
3. Type imports: `import type { Layout, Rack } from "$lib/types"`
4. Lib imports (relative): `import { layoutStore } from "$lib/stores/layout.svelte"`
5. Local imports: `import { createTestRack } from "./factories"`

**Path Aliases:**

- `$lib/*` resolves to `src/lib/*` (configured in tsconfig.json)
- Always use alias for library imports, relative paths only for test-local code

**Type-Only Imports:**

- Use `import type { ... }` for all type-only imports (TypeScript 5 feature)
- Never import types and values from same module in separate statements
- Group related types together: `import type { Rack, RackGroup, RackView }`

## Error Handling

**Patterns:**

- Try-catch for localStorage and JSON operations (operations may fail in private browsing)
- Return `false` or `null` for operation failures (place device, move device, lookup)
- Return structured error objects for complex operations: `{ device: Device | undefined, error: string | undefined }`
- Debug logging for state transitions and user actions: `layoutDebug.device("placed %s at U%d", slug, position)`
- No error throwing for user-triggered invalid operations (e.g., invalid device placement)

**Examples from Codebase:**

- `placeDevice(rackId, slug, position)` returns `boolean` - success/failure
- `duplicateDevice(rackId, index)` returns `{ device?: Device, error?: string }`
- `findDeviceType(slug, layoutDevices)` returns `DeviceType | undefined`
- localStorage access wrapped in try-catch at `src/lib/stores/layout.svelte.ts` lines 83-88

## Logging

**Framework:** Debug npm package with namespace-based filtering

**Namespaces:**

- `rackula:layout:state` - state mutations and initialization
- `rackula:layout:device` - device placement and movement
- `rackula:layout:group` - rack group operations
- `rackula:canvas:transform` - pan/zoom transformations
- `rackula:canvas:panzoom` - panzoom lifecycle
- `rackula:canvas:focus` - focus management
- `rackula:dnd:render` - drag-and-drop rendering
- `rackula:cable:validation` - cable validation
- `rackula:app:mobile` - mobile interactions
- `rackula:selection:state` - selection state changes
- `rackula:persistence:api` - API calls
- `rackula:persistence:health` - persistence health checks

**Usage:**

```typescript
import { layoutDebug } from "$lib/utils/debug";
layoutDebug.device("placed device %s at U%d", slug, position);
layoutDebug.state("isDirty=%s", store.isDirty);
```

**Enabling Logs:**

```javascript
// Browser console
localStorage.debug = "rackula:*"; // All logs
localStorage.debug = "rackula:layout:*"; // Layout only
localStorage.debug = "rackula:*,-rackula:canvas:*"; // All except canvas
```

## Comments

**When to Comment:**

- Complex algorithms or collision detection logic
- Non-obvious workarounds for browser bugs (e.g., Safari 18.x foreignObject transform bug at `LabelOverlaySVG.svelte`)
- Historical context for deprecated approaches
- Accessibility considerations in SVG/component code

**JSDoc/TSDoc:**

- Used for public store/utility functions
- Example from `src/tests/factories.ts`:
  ```typescript
  /**
   * Creates a test DeviceType with sensible defaults.
   * Schema v1.0.0: Flat structure with colour, category at top level
   */
  export function createTestDeviceType(...): DeviceType
  ```
- Do NOT use JSDoc for private functions or obvious getter/setter methods
- Do NOT use JSDoc for functions with self-explanatory names and single responsibility

**Comment Format:**

- Single-line comments for brief notes: `// Reset the store before each test`
- Multi-line comments for detailed explanations or workarounds
- Link to issues in comments: `// Safari 18.x fix #420: Avoids foreignObject transform inheritance bug`

## Function Design

**Size:**

- Functions should be small (typically under 30-40 lines)
- Store actions (`placeDevice`, `moveDevice`) may be longer due to state update batching

**Parameters:**

- Named parameters in objects for functions with 3+ parameters
- Example: `placeDevice(rackId, slug, position, face?)` - simple operations use positional
- Example: `{ device?: Device, error?: string }` return for complex results

**Return Values:**

- Boolean for success/failure: `placeDevice()`, `moveDevice()` return `true|false`
- Typed object for multi-value returns: `duplicateDevice()` returns `{ device?, error? }`
- Undefined for not-found: `findDeviceType()` returns `DeviceType | undefined`
- Null for empty/initial state: `store.rack` returns `Rack | null` when no racks exist

**Async Pattern:**

- All localStorage operations wrapped in try-catch (may fail, never throws)
- API calls use debug logging for health tracking
- No async/await in store initialization (synchronous where possible)

## Module Design

**Exports:**

- Svelte stores export getter function: `export function getLayoutStore()`
- Utility modules export functions and types: `export { findDeviceType, canPlaceDevice }`
- Constants exported directly: `export const MAX_RACKS = 10`
- Use named exports (no default exports)

**Barrel Files:**

- `src/lib/stores/commands/index.ts` re-exports all command creators
- `src/lib/types/index.ts` re-exports all type definitions
- Pattern: `export { createAddDeviceTypeCommand } from "./device-type"`

**File Organization:**

- One primary export per file (store file, utility file, component)
- Related constants and helpers in same file
- Type definitions co-located with implementations or in `src/lib/types/`

## Svelte 5 Runes

**State:**

```svelte
<script lang="ts">
  let count = $state(0);
  let items = $state<Item[]>([]);
</script>
```

**Derived:**

```svelte
<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);
  let computed = $derived.by(() => {
    // Complex computation
    return result;
  });
</script>
```

**Effects:**

```svelte
<script lang="ts">
  let store = getLayoutStore();
  $effect(() => {
    // Runs when dependencies change
    console.log(store.isDirty);
  });
</script>
```

**Props:**

```svelte
<script lang="ts">
  interface Props {
    title: string;
    count?: number;
  }
  let { title, count = 0 }: Props = $props();
</script>
```

**Key Points:**

- NEVER use Svelte 4 `writable` stores or `onMount` lifecycle
- ALWAYS use Svelte 5 runes: `$state`, `$derived`, `$effect`, `$props`
- Stores use `.svelte.ts` with `export function getStore()` pattern
- Props destructured with `$props()` rune in component scripts

## Command Pattern

**Structure:**

- Commands implement `Command` interface from `src/lib/stores/commands/types`
- Located in `src/lib/stores/commands/` with one command type per file
- Creator function pattern: `export function createPlaceDeviceCommand(...): Command`
- All commands support undo/redo via history stack

**Implementation Example:**

```typescript
// src/lib/stores/commands/place-device.ts
export function createPlaceDeviceCommand(
  rackId: string,
  slug: string,
  position: number,
): Command {
  return {
    type: "placeDevice",
    execute: (state) => {
      /* mutation logic */
    },
    undo: (state) => {
      /* reverse logic */
    },
  };
}
```

## Svelte Component Props

**Pattern:**

- `interface Props { ... }` defines all props
- Destructure with `$props()` rune
- Optional props use `?:` in interface
- No prop validation (TypeScript provides static checking)

**Example:**

```svelte
<script lang="ts">
  interface Props {
    title: string;
    description?: string;
    onClose: () => void;
  }
  let { title, description, onClose }: Props = $props();
</script>
```

## Type System

**Schema Versioning:**

- Current schema: v1.0.0 (flat structure, `colour` and `category` at top level)
- Legacy schema: v0.2.0 (nested color objects, different structure)
- Types support both for backward compatibility during migrations

**Notable Type Patterns:**

- `DeviceType` vs `PlacedDevice`: DeviceType is the definition, PlacedDevice is instance in rack
- `DeviceFace`: `"both" | "front" | "rear"` - controls placement collisions
- `FormFactor`: `"4-post" | "2-post-fixed"` - rack type
- `DisplayMode`: `"label" | "image"` - rendering mode in UI

---

_Convention analysis: 2026-02-19_
