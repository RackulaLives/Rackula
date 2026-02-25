# Architecture

**Analysis Date:** 2026-02-19

## Pattern Overview

**Overall:** Multi-layered client-side SPA with centralized state management and command pattern undo/redo

**Key Characteristics:**

- Svelte 5 rune-based reactive state (no Svelte 4 stores)
- Command pattern for all state mutations enabling undo/redo
- Decoupled UI (components) from business logic (stores, utilities)
- Real-time persistence with optional server sync
- Multi-rack support with rack grouping and selection model

## Layers

**Component Layer:**

- Purpose: User interface and interaction handling
- Location: `src/lib/components/`
- Contains: Svelte 5 components (.svelte files) organized by feature (Canvas, DevicePalette, EditPanel, Dialogs, etc.)
- Depends on: Stores (for state), utilities (for calculations), types
- Used by: App.svelte entry point

**State Management Layer (Stores):**

- Purpose: Centralized reactive state using Svelte 5 runes ($state, $derived, $effect)
- Location: `src/lib/stores/`
- Contains:
  - Core stores: `layout.svelte.ts` (master), `history.svelte.ts` (undo/redo), `canvas.svelte.ts` (zoom/pan), `selection.svelte.ts` (UI selection)
  - UI stores: `ui.svelte.ts` (theme), `dialogs.svelte.ts` (dialog states), `toast.svelte.ts`, `dragTooltip.svelte.ts`
  - Command implementations: `commands/` directory with device, rack, rack-group, and device-type command factories
- Depends on: Types, utilities for calculations
- Used by: Components via getter functions

**Data Model Layer (Types & Schemas):**

- Purpose: TypeScript type definitions and Zod validation schemas
- Location: `src/lib/types/` and `src/lib/schemas/`
- Contains: Core types (Layout, Rack, RackGroup, PlacedDevice, DeviceType, Cable), constants (FormFactor, DeviceFace, DisplayMode), validation schemas for import/export
- Depends on: Nothing (foundational layer)
- Used by: All other layers

**Utility/Calculation Layer:**

- Purpose: Pure functions for business logic, calculations, and transformations
- Location: `src/lib/utils/`
- Contains: 56+ utility modules for collision detection, coordinate transforms, device movement, canvas calculations, export, import, persistence, archive management, device lookup
- Key modules:
  - `collision.ts`: Device placement validation
  - `canvas.ts`: Pan/zoom calculations
  - `coordinates.ts`: SVG coordinate transforms
  - `dragdrop.ts`: Drop position calculation
  - `export.ts`: SVG/PDF/PNG export rendering
  - `persistence-api.ts`: Server sync (optional)
  - `archive.ts`: .Rackula.zip format
- Depends on: Types
- Used by: Stores and components

**Data Layer:**

- Purpose: Static application data (read-only)
- Location: `src/lib/data/`
- Contains: Brand packs (device library definitions), starter library, brand icons
- Depends on: Types
- Used by: Layout store for device lookup

**Styling Layer:**

- Purpose: Design system and visual theming
- Location: `src/lib/styles/`
- Contains: CSS custom properties (design tokens), global styles
- Depends on: Nothing (visual layer)
- Used by: Components

## Data Flow

**User Action → Placement:**

1. User drags device from `DevicePalette.svelte` to canvas
2. `Canvas.svelte` dispatches `ondevicedrop` event with position and rack
3. `App.svelte` handler calls `layoutStore.placeDevice(slug, position, ...)`
4. Store creates `createPlaceDeviceCommand()` which:
   - Executes: calls `placeDeviceRaw()` to add device to rack
   - Stores in undo stack
   - Clears redo stack
5. Store mutates `layout` (Svelte rune) triggering reactive updates
6. Components react to layout changes via derived stores
7. Layout automatically persists via `persistence.svelte.ts` effect

**State Updates Flow:**

- User interaction → Component event handler
- Handler calls store action (public API)
- Store creates Command and executes it
- Command mutates raw state (Raw layer functions)
- History captures command for undo/redo
- Layout rune triggers persistence effect
- Components observe layout changes via destructuring runes

**Undo/Redo:**

- Ctrl+Z calls `historyStore.undo()`
- Pops command from undo stack
- Calls `command.undo()` which reverses state mutation
- Pushes to redo stack
- Same reactive flow triggers component updates

## Key Abstractions

**Layout Store:**

- Purpose: Master state container for entire application
- Examples: `src/lib/stores/layout.svelte.ts`
- Pattern: Getter factory function `getLayoutStore()` returns object with state properties and action methods
- State includes: `racks[]`, `rackGroups[]`, `cables[]`, `deviceLibrary[]`, `description`, `metadata`
- Actions: place/move/remove devices, create/delete/update racks, manage rack groups, execute commands

**Command Pattern:**

- Purpose: Encapsulate state mutations for undo/redo
- Examples: `src/lib/stores/commands/device.ts`, `rack.ts`, `device-type.ts`
- Pattern: Each command has `execute()` and `undo()` methods, stores needed data for reversal
- Types: PLACE*DEVICE, MOVE_DEVICE, REMOVE_DEVICE, UPDATE_DEVICE*\*, ADD_RACK, DELETE_RACK, CREATE_RACK_GROUP, etc.

**Canvas State:**

- Purpose: Pan/zoom viewport state independent of content
- Examples: `src/lib/stores/canvas.svelte.ts`
- Pattern: Panzoom library integration with cached zoom level
- Responsibility: Manages panzoom instance, zoom constraints, derived zoom percentage

**Selection Store:**

- Purpose: Track UI selection (which rack/device/group is selected)
- Examples: `src/lib/stores/selection.svelte.ts`
- Pattern: Single selection per type (rackId, deviceId, groupId)
- Responsibility: Enforces one selected item at a time, provides type-checked getters

**Device Collision System:**

- Purpose: Validate device placement without overlaps
- Examples: `src/lib/utils/collision.ts`
- Pattern: URange (bottom/top in internal units), face-aware collision detection, container child exclusion
- Responsibility: Check if position is valid, find valid drop positions, handle container hierarchies

**Coordinate Transform System:**

- Purpose: Convert between SVG coordinates, canvas positions, and U heights
- Examples: `src/lib/utils/coordinates.ts`, `position.ts`
- Pattern: Internal units (6 = 1U), human units (0-42 for U1-U42), pixel positions
- Responsibility: SVG ↔ DOM, unit conversions, screen transforms

## Entry Points

**Application Root:**

- Location: `src/main.ts`
- Triggers: Browser load
- Responsibilities: Initialize analytics, mount App.svelte to #app

**Main Component:**

- Location: `src/App.svelte`
- Triggers: Component mount
- Responsibilities: Layout initialization, store setup, keyboard handler binding, multi-pane layout structure, global dialog management

**Canvas (Render Loop):**

- Location: `src/lib/components/Canvas.svelte`
- Triggers: Selection changes, layout updates
- Responsibilities: SVG rendering, panzoom initialization, drag-drop handling, rack group display

**Device Placement:**

- Location: `src/lib/components/DevicePalette.svelte` (initiates)
- Flow: Drag device → Canvas drop event → `App.svelte` handler → `layoutStore.placeDevice()`
- Responsibilities: Device selection, visual drag preview

**Undo/Redo:**

- Location: `src/lib/stores/history.svelte.ts`
- Triggers: Ctrl+Z (undo), Ctrl+Shift+Z/Ctrl+Y (redo)
- Responsibilities: Maintain undo/redo stacks, enforce max depth (50 commands)

## Error Handling

**Strategy:** Fail-safe with user notification

**Patterns:**

- Device placement: Validates via `canPlaceDevice()` before command execution, shows error toast if invalid
- Import/NetBox: Try-parse with validation schema, show user-facing error messages
- Export: Catches rendering errors, allows download of partially-rendered SVGs
- Persistence: Failed server sync doesn't block local operations, shows offline indicator
- Collision detection: Returns false/empty arrays for invalid positions rather than throwing

## Cross-Cutting Concerns

**Logging:** Uses `debug` npm package with namespaced loggers (`rackula:layout:*`, `rackula:canvas:*`, etc.) controlled via `localStorage.debug`

**Validation:** Zod schemas in `src/lib/schemas/` for import/export data; type-level validation in TypeScript strict mode

**Authentication:** No authentication (client-side only). Optional server persistence via API keys stored locally

**Persistence:** Dual-path system:

- Local: IndexedDB via `localStorage` and periodic saves
- Server: Optional POST to server via `saveLayoutToServer()` if API available
- Format: YAML serialization in `Layout` type structure

**Accessibility:** Uses bits-ui for accessible components (dialog, tabs, accordion), manual ARIA attributes for custom SVG controls

---

_Architecture analysis: 2026-02-19_
