# Rackula Technical Specification

**Version:** 0.6.0-draft
**Updated:** 2025-12-12
**Status:** Active

---

## 1. Overview

### 1.1 Purpose

Rackula is a lightweight, FOSS, web-based rack layout designer for homelabbers to plan optimal equipment arrangement before physical mounting.

### 1.2 Core Problem

"I have a rack and a pile of gear — I need to figure out the optimal arrangement before I start mounting."

### 1.3 Target User

Homelabbers planning rack layouts. Desktop browser users for creation/editing, mobile for viewing.

### 1.4 Design Principles

- **ADHD-friendly** — Minimal decision points, visual clarity
- **Lightweight** — Static frontend, no backend required
- **Portable** — Layouts saved as self-contained `.Rackula.zip` archives
- **Multi-rack** — Support multiple racks per layout (v0.6.0)
- **Single-level nesting** — Containers hold devices but cannot be nested
- **FOSS** — MIT licensed

### 1.5 Links

| Resource   | URL                                     |
| ---------- | --------------------------------------- |
| Live Demo  | https://app.racku.la/                   |
| Repository | https://github.com/RackulaLives/Rackula |

---

## 2. Technical Stack

| Component   | Technology                                        |
| ----------- | ------------------------------------------------- |
| Framework   | Svelte 5 (runes: `$state`, `$derived`, `$effect`) |
| Language    | TypeScript (strict mode)                          |
| Rendering   | SVG                                               |
| Pan/Zoom    | panzoom                                           |
| Persistence | File download/upload (.Rackula.zip)               |
| Data Format | YAML (js-yaml)                                    |
| Validation  | Zod                                               |
| Styling     | CSS custom properties (design tokens)             |
| Analytics   | Umami (self-hosted, privacy-focused)              |
| Testing     | Vitest + @testing-library/svelte + Playwright     |
| Build       | Vite                                              |

### 2.1 Dependencies

**Production:**

- `js-yaml` ^4.1 — YAML serialization
- `jspdf` ^3.0 — PDF export
- `jszip` ^3.10 — ZIP archive handling
- `panzoom` ^9.4 — Canvas pan/zoom
- `zod` ^4.1 — Schema validation

**Development:**

- `svelte` ^5.43
- `typescript` ^5.9
- `vite` ^7.2
- `vitest` ^3.2
- `playwright` ^1.56
- `@types/umami-browser` ^2.18 — Umami TypeScript definitions

---

## 3. Data Model

> **Reference:** For complete schema documentation including all fields, validation rules, and YAML examples, see [SCHEMA.md](./SCHEMA.md).

### 3.1 Type Definitions

```typescript
// View types
type RackView = "front" | "rear";
type DeviceFace = "front" | "rear" | "both";
type DisplayMode = "label" | "image" | "image-label";

// Device categories (12 types)
type DeviceCategory =
  | "server"
  | "network"
  | "patch-panel"
  | "power"
  | "storage"
  | "kvm"
  | "av-media"
  | "cooling"
  | "shelf"
  | "blank"
  | "cable-management"
  | "other";

// Airflow directions (7 types, NetBox-compatible)
type Airflow =
  | "passive"
  | "front-to-rear"
  | "rear-to-front"
  | "left-to-right"
  | "right-to-left"
  | "side-to-rear"
  | "mixed";

// Rack form factors (NetBox-compatible)
type FormFactor =
  | "2-post"
  | "4-post"
  | "4-post-cabinet"
  | "wall-mount"
  | "open-frame";

// Weight units (NetBox-compatible)
type WeightUnit = "kg" | "lb";

// Slot positions for half-width devices (v0.5.0)
type SlotPosition = "left" | "right" | "full";
type SlotWidth = 1 | 2; // 1 = half-width, 2 = full-width (default)
```

### 3.2 DeviceType (Library Item)

**Schema v1.0.0:** Flat structure with `colour` and `category` at top level.

```typescript
interface DeviceType {
  // Core Identity
  slug: string; // Unique identifier (e.g., 'dell-r650')
  manufacturer?: string;
  model?: string; // Display name
  part_number?: string;

  // Physical Properties
  u_height: number; // 0.5-42U (supports half-U)
  is_full_depth?: boolean; // Default: true
  is_powered?: boolean;
  weight?: number;
  weight_unit?: WeightUnit;
  airflow?: Airflow;

  // Image Flags
  front_image?: boolean;
  rear_image?: boolean;

  // Rackula Fields (flat, not nested)
  colour: string; // Hex (#RRGGBB)
  category: DeviceCategory;
  tags?: string[];

  // Extension Fields
  notes?: string;
  serial_number?: string;
  asset_tag?: string;
  links?: DeviceLink[];
  custom_fields?: Record<string, unknown>;

  // Component Arrays (schema-only, future features)
  interfaces?: Interface[];
  power_ports?: PowerPort[];
  power_outlets?: PowerOutlet[];
  device_bays?: DeviceBay[];
  inventory_items?: InventoryItem[];

  // Power Device Properties
  va_rating?: number; // VA capacity (e.g., 1500, 3000)

  // Half-Width Support (v0.5.0)
  slot_width?: SlotWidth; // 1 = half-width, 2 = full-width (default)

  // Container Capability (v0.6.0)
  slots?: Slot[]; // Presence indicates this is a container
}
```

> **Container Identification:** A DeviceType with `slots.length > 0` is a container. No separate boolean flag is needed.

### 3.X Slot (Container Bay Definition)

```typescript
/**
 * Slot definition for container devices
 * A DeviceType with slots[] is a container that can hold child devices
 */
interface Slot {
  id: string; // Unique within this DeviceType (e.g., "bay-1")
  name?: string; // Display label (e.g., "Left Bay")
  position: {
    row: number; // 0-indexed from bottom of container
    col: number; // 0-indexed from left
  };
  width_fraction?: number; // 0.5 = half-width (default: 1.0)
  height_units?: number; // Slot height in U (default: 1)
  accepts?: DeviceCategory[]; // Empty = accepts all categories
}
```

### 3.3 PlacedDevice (Instance in Rack)

```typescript
interface PlacedDevice {
  id: string; // UUID for stable reference
  device_type: string; // Reference to DeviceType.slug
  position: number; // Bottom U position (1-indexed for rack-level)
  // OR relative position (0-indexed for container children)
  face: DeviceFace;
  name?: string; // Custom instance name
  notes?: string;
  custom_fields?: Record<string, unknown>;

  // Half-Width Support (v0.5.0)
  slot_position?: SlotPosition; // 'left' | 'right' | 'full' (default: 'full')

  // Container Child (v0.6.0)
  container_id?: string; // UUID of parent PlacedDevice (if nested)
  slot_id?: string; // Which slot in parent (Slot.id)
}
```

**Note:** The `id` field is a UUID generated on device placement using `crypto.randomUUID()`. It provides a stable identifier for placement-level image overrides that survives device reordering.

> **Position Semantics:** For rack-level devices, `position` is 1-indexed U position. For container children, `position` is relative to container (0-indexed from bottom).

### 3.4 Rack

```typescript
interface Rack {
  id: string; // Unique identifier (nanoid, 21 chars)
  name: string;
  height: number; // 1-100U (common: 12, 18, 24, 42)
  width: 10 | 19 | 23; // Rack width in inches
  position: number; // Order index (for multi-rack layouts)
  devices: PlacedDevice[];
  form_factor: FormFactor; // Default: '4-post-cabinet'
  desc_units: boolean; // U1 at top if true (default: false)
  starting_unit: number; // Default: 1
  show_rear?: boolean; // Show rear view (default: true)
  notes?: string;
}
```

**Note:** The `id` field is generated by `nanoid()` when a rack is created via `createRack()` or `layoutStore.addRack()`. This provides stable identification for multi-rack selection and undo/redo operations.

### 3.5 Layout

```typescript
interface Layout {
  version: string; // Schema version (e.g., "1.0.0")
  name: string;
  created: string; // ISO 8601
  modified: string; // ISO 8601
  settings: LayoutSettings;
  device_types: DeviceType[]; // Device type library
  racks: Rack[]; // Multiple racks (v0.6.0)
}

interface LayoutSettings {
  theme: "dark" | "light";
  view?: RackView;
  displayMode?: DisplayMode;
  showLabelsOnImages?: boolean;
}
```

### 3.6 Constraints

| Constraint              | Value           |
| ----------------------- | --------------- |
| Min device height       | 0.5U            |
| Max device height       | 42U             |
| Min rack height         | 1U              |
| Max rack height         | 100U            |
| Allowed rack widths     | 10", 19"        |
| Max racks per layout    | ∞ (no limit)    |
| Max container nesting   | 1 level         |
| Max image size          | 5MB             |
| Supported image formats | PNG, JPEG, WebP |

### 3.7 Collision Detection

Two devices collide if **all** conditions are true:

1. Their U ranges overlap (`position` to `position + u_height - 1`)
2. Their faces collide (see rules below)
3. Their slot positions overlap (left/right/full)

**Face Collision Rules (Face-Authoritative Model):**

The `face` property is the single source of truth for collision detection:

| Face A | Face B | Collision? |
| ------ | ------ | ---------- |
| both   | any    | YES        |
| front  | front  | YES        |
| rear   | rear   | YES        |
| front  | rear   | NO         |

**Key Principle:** If a device's `face` is explicitly set to `front` or `rear`, it only blocks that face - regardless of the device type's `is_full_depth` property.

**Role of `is_full_depth`:**

- Determines the DEFAULT face when placing a device
- Full-depth devices (`is_full_depth: true` or not specified) default to `face: "both"`
- Half-depth devices (`is_full_depth: false`) default to `face: "front"`
- Users can override face via EditPanel; the override takes precedence for collision detection

**Half-Depth Devices in Starter Library:**

| Category         | Devices                                  |
| ---------------- | ---------------------------------------- |
| Blank            | 0.5U Blank, 1U Blank, 2U Blank           |
| Shelf            | 1U Shelf, 2U Shelf                       |
| Patch Panel      | 24-Port Patch Panel, 48-Port Patch Panel |
| Cable Management | 1U Brush Panel, 1U Cable Management      |

This allows placing a rear device at the same U position as a front device (useful for blanks, cable management, and when explicitly configuring device faces).

**Interaction Consistency:**

Both drag-and-drop and keyboard movement use face-aware validation:

| Operation      | Validation Parameters              |
| -------------- | ---------------------------------- |
| Drag-and-drop  | Target face from `faceFilter` prop |
| Keyboard (↑/↓) | Face from `placedDevice.face`      |

The `getDropFeedback()` function passes `targetFace` to `canPlaceDevice()`, ensuring drag-and-drop preview feedback (valid/blocked) matches actual placement behavior.

#### Container-Aware Collision (v0.6.0)

Collision detection is hierarchical:

**Rack-Level Collision:**

- Container devices collide with other rack-level devices (normal rules)
- Child devices (those with `container_id` set) are INVISIBLE to rack-level collision

**Container-Level Collision:**

- Children only collide with siblings in the SAME container
- Child position is relative (0 = bottom of container)
- Child must fit within container's u_height

| Device A            | Device B            | Collision Check          |
| ------------------- | ------------------- | ------------------------ |
| Rack-level          | Rack-level          | Normal U/face/slot rules |
| Rack-level          | Child               | Never collide            |
| Child (container X) | Child (container X) | Check within container   |
| Child (container X) | Child (container Y) | Never collide            |

**Face Inheritance:**

Children inherit their parent container's face for rendering purposes. The container's face is authoritative.

---

## 4. File Format

### 4.1 Archive Structure

Extension: `.Rackula.zip`

```
my-rack.Rackula.zip
└── my-rack/
    ├── my-rack.yaml           # Layout data
    └── assets/
        ├── device-types/      # Device type default images
        │   └── [device-slug]/
        │       ├── front.webp
        │       └── rear.webp
        └── placements/        # Placement override images (optional)
            └── [placement-id]/
                ├── front.webp
                └── rear.webp
```

**Image Storage:**

- `device-types/` — Images uploaded when creating device types (shared by all instances)
- `placements/` — Per-placement image overrides (keyed by PlacedDevice.id)
- Bundled images are not stored in archives (loaded from app assets)

### 4.2 YAML Schema

```yaml
version: "0.1.0"
name: "My Homelab Rack"
rack:
  name: "Primary Rack"
  height: 42
  width: 19
  position: 0
  view: "front"
  desc_units: false
  form_factor: "4-post-cabinet"
  starting_unit: 1
  devices:
    - id: "550e8400-e29b-41d4-a716-446655440000"
      device_type: "dell-r650"
      position: 40
      face: "front"
      name: "Web Server 1"
device_types:
  - slug: "dell-r650"
    u_height: 1
    manufacturer: "Dell"
    model: "PowerEdge R650"
    is_full_depth: true
    airflow: "front-to-rear"
    Rackula:
      colour: "#4A90D9"
      category: "server"
settings:
  display_mode: "label"
  show_labels_on_images: false
```

---

## 5. Component Architecture

### 5.1 Core Components

| Component             | Purpose                         |
| --------------------- | ------------------------------- |
| `Canvas.svelte`       | Main viewport with panzoom      |
| `Rack.svelte`         | SVG rack visualization          |
| `RackDevice.svelte`   | Device rendering with selection |
| `RackDualView.svelte` | Front/rear side-by-side view    |

### 5.2 UI Panels

| Component              | Purpose                                          |
| ---------------------- | ------------------------------------------------ |
| `Toolbar.svelte`       | Top action bar                                   |
| `Sidebar.svelte`       | Fixed left device library                        |
| `DevicePalette.svelte` | Device list with collapsible sections and search |
| `EditPanel.svelte`     | Property editor (right)                          |
| `HelpPanel.svelte`     | Keyboard shortcuts                               |

**DevicePalette Sections:**

- Collapsible sections for Generic, Ubiquiti, Mikrotik (see Section 11.6)
- Global search spans all sections
- Section headers show device counts

### DevicePalette Sidebar Architecture

The DevicePalette uses an **exclusive accordion** pattern (radio-style) for brand sections:

- Only one section can be expanded at a time
- Clicking a section header closes any currently open section
- Eliminates scroll/visibility issues with long device lists
- Matches typical homelab workflow (single brand ecosystem focus)

**Component Stack:**

- Bits UI Accordion with `type="single"` for collapse behaviour
- svelte-dnd-action for drag-and-drop (v0.9.59+ for Svelte 5 compatibility)
- CSS Grid animation (`grid-template-rows: 0fr → 1fr`) for smooth transitions

**Search Enhancement:**

- Global search input above accordion for cross-brand device discovery
- Filters all sections simultaneously, expanding matching sections
- Keyboard shortcut (Ctrl+K / Cmd+K) for power users

**Accessibility Requirements:**

- Tab/Shift+Tab: Navigate between section headers
- Enter/Space: Expand/collapse current section
- Arrow Up/Down: Move between headers
- ARIA: `aria-expanded`, `aria-controls`, `role="region"`

**svelte-dnd-action Configuration:**

- Each section's content area is the dnd-zone element
- Use `onconsider`/`onfinalize` (Svelte 5 syntax, not `on:consider`)
- Set `flipDurationMs: 200` for smooth reorder animation
- Set `type: 'device-palette'` to scope drag operations
- Avoid Svelte transitions on draggable items (use `animate:flip` instead)

### 5.3 Forms & Dialogs

| Component              | Purpose                           |
| ---------------------- | --------------------------------- |
| `AddDeviceForm.svelte` | Create device in library          |
| `NewRackForm.svelte`   | Create/edit rack                  |
| `ExportDialog.svelte`  | Export configuration              |
| `ConfirmDialog.svelte` | Confirmation prompts              |
| `ImageUpload.svelte`   | Device image upload               |
| `WelcomeScreen.svelte` | First-load empty state background |

### 5.4 Utilities

| Component                 | Purpose                    |
| ------------------------- | -------------------------- |
| `KeyboardHandler.svelte`  | Global shortcut dispatcher |
| `ToastContainer.svelte`   | Notifications              |
| `CategoryIcon.svelte`     | Category icons             |
| `AirflowIndicator.svelte` | Airflow visualization      |

---

## 6. State Management

All state uses Svelte 5 runes (`$state`, `$derived`, `$effect`).

### 6.1 Layout Store

```typescript
// State
layout: Layout
isDirty: boolean
hasStarted: boolean
activeRackId: string | null  // Currently selected rack for operations

// Derived
rack: Rack | null           // Active rack (convenience accessor)
activeRack: Rack | null     // Same as rack (explicit naming)
device_types: DeviceType[]
rackCount: number           // Number of racks in layout

// Rack Management
addRack(name, height, ...): Rack | null  // Returns created rack with generated id
updateRack(rackId, updates): void
deleteRack(rackId): void
getRackById(rackId): Rack | undefined
setActiveRack(rackId): void

// Device Type Management
addDeviceType(), updateDeviceType(), deleteDeviceType()

// Device Placement (non-recorded)
placeDevice(rackId, slug, position, face?): void
moveDevice(rackId, deviceIndex, newPosition): void
removeDevice(rackId, deviceIndex): void

// Recorded Operations (with undo/redo support)
// All recorded functions require rackId as first parameter
placeDeviceRecorded(rackId, slug, position): void
moveDeviceRecorded(rackId, deviceIndex, newPosition): void
removeDeviceRecorded(rackId, deviceIndex): void
updateDeviceFaceRecorded(rackId, deviceIndex, newFace): void
updateRackRecorded(rackId, updates): void
clearRackRecorded(rackId): void

// History
undo(), redo(), reset()
```

**Multi-Rack Design:**

- Each rack has a unique `id` generated by `nanoid()` (21 characters)
- `activeRackId` tracks which rack is currently selected for operations
- When `addRack()` is called, the new rack becomes the active rack
- `rack` property returns the active rack for backward compatibility
- Recorded operations require explicit `rackId` to ensure undo/redo targets the correct rack

### 6.2 UI Store

```typescript
// State
theme: "dark" | "light";
displayMode: "label" | "image";
showLabelsOnImages: boolean;
airflowMode: boolean;

// Methods
toggleTheme();
toggleDisplayMode();
toggleAirflowMode();
```

### 6.3 Selection Store

```typescript
// State
selectedId: string | null;          // Unique identifier for selection
selectedType: 'rack' | 'device' | null;
selectedRackId: string | null;      // Which rack contains the selection
selectedDeviceIndex: number | null; // Index of placed device in rack.devices array

// Methods
selectRack(rackId: string): void;
selectDevice(rackId: string, deviceIndex: number, deviceTypeSlug: string): void;
clearSelection(): void;
```

**Important:** Device selection uses `deviceIndex` (position in rack's device array), NOT `device_type`. Multiple placed devices can share the same `device_type` (same device type), but each has a unique index. Selection must target a single placed device instance.

### 6.4 History Store

```typescript
// State
undoStack: Command[]
redoStack: Command[]
MAX_HISTORY_DEPTH = 50

// Derived
canUndo, canRedo
undoDescription, redoDescription

// Methods
execute(), undo(), redo(), clear()
```

### 6.5 Canvas Store

```typescript
// State
panzoomInstance: PanzoomObject | null;
currentZoom: number(0.25 - 2.0);

// Methods
(zoomIn(), zoomOut(), fitAll(), resetZoom());
```

### 6.6 Auto-Reset View Behavior

The view automatically resets (calls `fitAll()`) to center the rack when:

| Trigger            | Description                             |
| ------------------ | --------------------------------------- |
| Layout load        | After loading a `.Rackula.zip` file     |
| New rack creation  | After creating a new rack via the form  |
| Rack height change | After resizing rack height in EditPanel |

This ensures the rack is always visible and centered after significant layout changes.

### 6.7 Toolbar Responsive Behavior

The toolbar adapts to viewport width with two distinct modes:

| Mode      | Viewport | Behavior                                    |
| --------- | -------- | ------------------------------------------- |
| Full      | ≥ 1024px | All action buttons visible in toolbar       |
| Hamburger | < 1024px | Buttons hidden, accessed via hamburger menu |

**Hamburger Mode Behavior:**

- The brand area (logo + text) becomes clickable to open the drawer menu
- Visual styling indicates interactivity (button-like border/outline)
- The hamburger icon (☰) appears next to the brand
- No action buttons visible except theme toggle (far right)
- Drawer slides in from right with all action items

**Full Mode Behavior:**

- Brand area is NOT clickable (no drawer interaction)
- All action buttons visible in toolbar
- No hamburger icon visible
- Standard toolbar layout

### 6.8 Mobile View Experience

**Overview:**

View-only mobile experience for phones (<1024px viewport) enabling users to view rack layouts on mobile via shareable links. Desktop experience is preserved for tablets (≥1024px).

**Viewport Breakpoint:**

| Viewport | Experience | Layout                    |
| -------- | ---------- | ------------------------- |
| < 1024px | Mobile     | View-only, simplified UI  |
| ≥ 1024px | Desktop    | Full editing capabilities |

**Mobile Specifications:**

| Requirement    | Value/Behavior                                                     |
| -------------- | ------------------------------------------------------------------ |
| Minimum width  | 375px (iPhone 12 mini)                                             |
| Orientation    | Portrait-first (landscape acceptable)                              |
| Data access    | Shareable URL links (`?layout=` parameter)                         |
| Auto-zoom      | Device selected → zoom to device<br>No selection → fit entire rack |
| Device details | Long-press (500ms) → bottom sheet                                  |
| Gestures       | Long-press, swipe-to-dismiss                                       |
| Panning        | Disabled (auto-zoom only)                                          |

**Available Controls (Mobile):**

- Front/rear view toggle
- Display mode toggle (labels/images)
- Hamburger menu (about, help, theme)

**Hidden Controls (Mobile):**

- Device library panel
- Edit panel
- Zoom controls (auto-zoom replaces manual)
- Undo/redo
- Save/load
- Export
- Airflow toggle

**Mobile Layout:**

- Full-height viewport (`100dvh`)
- Simplified toolbar at top
- Canvas fills remaining space
- Bottom sheet for device details
- No sidebars

**Touch Interactions:**

| Gesture                   | Action                             |
| ------------------------- | ---------------------------------- |
| Long-press device (500ms) | Select device + show details sheet |
| Tap bottom sheet backdrop | Dismiss sheet                      |
| Swipe down on sheet       | Dismiss sheet                      |
| Tap device (short)        | No action (prevents conflicts)     |

**Bottom Sheet Content:**

When device is long-pressed, shows:

- Device name (or model if no custom name)
- Height (e.g., "2U")
- Category with icon
- Position (e.g., "U12-U13, Front")
- Manufacturer (if available)

**Out of Scope (Mobile v1):**

- Creating/editing layouts
- PWA/offline support
- Pinch-to-zoom gestures
- File picker
- Export functionality

**Implementation:** See issue #85 and mobile view implementation plan.

### 6.9 Session Persistence (localStorage)

**Overview:**

Automatic session persistence using localStorage enables users to resume work after page reloads without explicitly saving. Particularly valuable for mobile users who may reload the page.

**Storage Key:** `Rackula:autosave`

**Auto-Save Behavior:**

- Layout changes trigger debounced save to localStorage (1000ms delay)
- Only saves when `layoutStore.hasRack` is true
- Transparent — no user interaction required

**Auto-Restore Priority (on mount):**

| Priority | Source                | Behavior                                   |
| -------- | --------------------- | ------------------------------------------ |
| 1        | Share link (`?l=...`) | Highest priority, skips autosave check     |
| 2        | localStorage autosave | Restores if present, marks layout as dirty |
| 3        | Empty state           | Shows NewRackForm dialog if no rack        |

**Auto-Clear Behavior:**

Autosaved session is cleared on:

- Explicit Save (`Ctrl+S` or File → Save)
- Explicit Load (`Ctrl+O` or File → Load)
- New Rack creation (after user confirms replace)

**Error Handling:**

- `QuotaExceededError` logged to console, app continues normally
- Invalid JSON on restore is logged and ignored (shows NewRackForm)
- Storage errors never break the application

**Implementation:**

```typescript
// src/lib/utils/session-storage.ts
export function saveSession(layout: Layout): boolean;
export function loadSession(): Layout | null;
export function clearSession(): void;
```

**Use Case:**

User creates a rack layout on mobile via share link, makes modifications, then accidentally closes the tab. When they reopen the app, their modifications are preserved via localStorage.

### 6.10 First-Load Experience

When `rackCount === 0` (no rack exists), the app guides users to create their first rack:

| State                  | UI Behavior                                          |
| ---------------------- | ---------------------------------------------------- |
| Initial load (no rack) | WelcomeScreen visible + NewRackForm auto-opens       |
| Dialog dismissed       | WelcomeScreen remains visible (clickable to re-open) |
| Rack created           | Normal view with rack displayed                      |

**WelcomeScreen Component:**

- Displays ghostly 42U rack silhouette as background (opacity 0.15)
- Clickable to trigger `handleNewRack()` (opens NewRackForm)
- Visible behind NewRackForm dialog when auto-opened

**Auto-Open Behavior:**

- NewRackForm automatically opens whenever `rackCount === 0`
- Triggers on: first load, after layout reset, after clearing localStorage
- User can dismiss dialog and return to WelcomeScreen
- Clicking WelcomeScreen re-opens NewRackForm

**Implementation:**

```typescript
// App.svelte - Auto-open new rack dialog on mount
onMount(() => {
  if (layoutStore.rackCount === 0) {
    newRackFormOpen = true;
  }
});
```

---

## 7. Keyboard Shortcuts

| Shortcut                  | Action                                              |
| ------------------------- | --------------------------------------------------- |
| `Escape`                  | Clear selection / close panels                      |
| `Ctrl+Z`                  | Undo                                                |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo                                                |
| `Delete` / `Backspace`    | Delete selected                                     |
| `↑` / `↓`                 | Move device in rack (increment = device `u_height`) |
| `F`                       | Fit all (reset view)                                |
| `I`                       | Toggle display mode                                 |
| `A`                       | Toggle airflow mode                                 |
| `Ctrl+S`                  | Save layout                                         |
| `Ctrl+O`                  | Load layout                                         |
| `Ctrl+E`                  | Export dialog                                       |
| `?`                       | Help panel                                          |

---

## 8. Export Formats

### 8.1 Image Export

| Format | Features                |
| ------ | ----------------------- |
| PNG    | Transparency support    |
| JPEG   | Smaller file size       |
| SVG    | Vector, scalable        |
| PDF    | Print-ready, multi-page |

### 8.2 Data Export

| Format | Features                              |
| ------ | ------------------------------------- |
| CSV    | Spreadsheet-compatible inventory list |

**CSV Columns:**

| Column       | Description                     |
| ------------ | ------------------------------- |
| Position     | U position in rack (1-indexed)  |
| Name         | Custom instance name (or empty) |
| Model        | Device type model/display name  |
| Manufacturer | Manufacturer name (or empty)    |
| U_Height     | Device height in rack units     |
| Category     | Device category                 |
| Face         | Mounting face (front/rear/both) |

**Example CSV output:**

```csv
Position,Name,Model,Manufacturer,U_Height,Category,Face
42,Web Server 1,PowerEdge R650,Dell,1,server,front
40,Core Switch,USW-Pro-48-PoE,Ubiquiti,1,network,front
38,,1U Blank,,1,blank,front
```

### 8.3 Export Options

```typescript
interface ExportOptions {
  format: "png" | "jpeg" | "svg" | "pdf" | "csv";
  scope: "all" | "selected";
  background: "dark" | "light" | "transparent";
  exportView: "front" | "rear" | "both";
  displayMode: "label" | "image";
  airflowMode: boolean;
  includeNames: boolean;
  includeLegend: boolean;
}
```

### 8.4 File Naming Convention

Exported files use a consistent naming pattern:

```
{layout-name}-{view}-{YYYY-MM-DD}.{ext}
```

| Component   | Description           | Example                 |
| ----------- | --------------------- | ----------------------- |
| layout-name | Slugified layout name | `my-homelab`            |
| view        | Export view           | `front`, `rear`, `both` |
| YYYY-MM-DD  | Export date           | `2025-12-12`            |
| ext         | File extension        | `png`, `pdf`, `csv`     |

**Examples:**

- `my-homelab-front-2025-12-12.png`
- `my-homelab-both-2025-12-12.pdf`
- `my-homelab-2025-12-12.csv` (CSV has no view)

### 8.5 Export Dialog

The export dialog includes:

| Feature               | Description                                      |
| --------------------- | ------------------------------------------------ |
| Format selector       | Dropdown for PNG/JPEG/SVG/PDF/CSV                |
| Options panel         | Format-specific options (background, view, etc.) |
| **Thumbnail preview** | Small preview of export output before download   |
| Export button         | Triggers download with generated filename        |

### 8.6 Export Quality Requirements

Image exports must meet these quality standards:

| Requirement          | Specification                                                   |
| -------------------- | --------------------------------------------------------------- |
| **Margins**          | Consistent padding around rack (min 20px)                       |
| **Dual-view layout** | Front and rear views side-by-side with equal spacing            |
| **Borders/lines**    | Crisp rack rails and device borders, no anti-aliasing artifacts |
| **Text rendering**   | Sharp labels, correct font sizing, proper alignment             |
| **Canvas match**     | Export output must match on-screen canvas appearance            |

---

## 9. Design Tokens

> **Note:** For the comprehensive Design System specification including colour palettes, typography, and component patterns, see **Section 19: Design System**.

### 9.1 Token Layers

1. **Primitives** — Raw values (Dracula/Alucard colours, spacing)
2. **Semantic** — Purpose-based (bg, text, border)
3. **Component** — Component-specific (rack, toolbar)

### 9.2 Key Tokens

```css
/* Spacing (4px base) */
--space-0: 0;
--space-1: 0.25rem; /* 4px */
--space-2: 0.5rem; /* 8px */
--space-3: 0.75rem; /* 12px */
--space-4: 1rem; /* 16px */
--space-6: 1.5rem; /* 24px */
--space-8: 2rem; /* 32px */

/* Typography */
--font-size-2xs: 0.625rem; /* 10px */
--font-size-xs: 0.6875rem; /* 11px */
--font-size-sm: 0.8125rem; /* 13px */
--font-size-base: 0.875rem; /* 14px */
--font-size-md: 1rem; /* 16px */
--font-size-lg: 1.125rem; /* 18px */

/* Rack (stays dark in both themes) */
--rack-u-height: 17.78px;
--rack-width: 482.6px;
--rack-rail-width: 30px;

/* Component sizes */
--toolbar-height: 56px;
--sidebar-width: 280px;
--drawer-width: 320px;

/* Z-Index Layers */
--z-sidebar: 10;
--z-drawer-backdrop: 99;
--z-drawer: 100;
--z-modal: 200;
--z-toast: 300;

/* Airflow colors */
--colour-airflow-intake: var(--blue-400);
--colour-airflow-exhaust: var(--red-400);
--colour-airflow-passive: var(--neutral-400);
--colour-airflow-conflict: var(--amber-500);
```

### 9.3 Theme System

- Default: Dark theme
- Light theme via `[data-theme="light"]` selector
- Rack colors intentionally stay dark in both themes

---

## 10. Category Colors & Icons

Each device category has an assigned color from the Dracula palette and icon from [Lucide](https://lucide.dev). See Section 19.3.3 for full rationale and light mode (Alucard) variants.

**Active Categories** (vibrant Dracula accents):

| Category   | Color  | Dark Hex  | Light Hex | Lucide Icon  |
| ---------- | ------ | --------- | --------- | ------------ |
| `server`   | Cyan   | `#8BE9FD` | `#036A96` | `server`     |
| `network`  | Purple | `#BD93F9` | `#644AC9` | `network`    |
| `storage`  | Green  | `#50FA7B` | `#14710A` | `hard-drive` |
| `power`    | Red    | `#FF5555` | `#CB3A2A` | `zap`        |
| `kvm`      | Orange | `#FFB86C` | `#A34D14` | `monitor`    |
| `av-media` | Pink   | `#FF79C6` | `#A3144D` | `speaker`    |
| `cooling`  | Yellow | `#F1FA8C` | `#846E15` | `fan`        |

**Passive Categories** (neutral comment colors):

| Category           | Color     | Dark Hex  | Light Hex | Lucide Icon            |
| ------------------ | --------- | --------- | --------- | ---------------------- |
| `shelf`            | Comment   | `#6272A4` | `#6C664B` | `align-end-horizontal` |
| `blank`            | Selection | `#44475A` | `#CFCFDE` | `circle-off`           |
| `cable-management` | Comment   | `#6272A4` | `#6C664B` | `cable`                |
| `patch-panel`      | Comment   | `#6272A4` | `#6C664B` | `ethernet-port`        |
| `other`            | Comment   | `#6272A4` | `#6C664B` | `circle-help`          |

---

## 11. Starter Library

### 11.1 Overview

The starter library provides 26 pre-defined generic device types for common homelab equipment. These are automatically populated in new layouts, giving users immediate access to typical rack-mountable gear without needing to create custom device types.

**Design Principles:**

- **Generic naming** — Device types use descriptive names (e.g., "1U Server", "24-Port Switch"), not branded product names
- **Representative images** — Bundled images show recognizable gear (e.g., Dell R630 image for "1U Server") for visual familiarity
- **Category-based coloring** — Each device type inherits its color from its category
- **Extensible** — Users can add custom device types alongside starter library entries

### 11.2 Device Types (26 items)

| Category             | Device Types                                       | Half-Depth? |
| -------------------- | -------------------------------------------------- | ----------- |
| **Server**           | 1U Server, 2U Server, 4U Server                    | No          |
| **Network**          | 24-Port Switch, 48-Port Switch, 1U Router/Firewall | No          |
| **Patch Panel**      | 24-Port Patch Panel, 48-Port Patch Panel           | Yes         |
| **Storage**          | 1U Storage, 2U Storage, 4U Storage                 | No          |
| **Power**            | 1U PDU, 2U UPS, 4U UPS                             | No          |
| **KVM**              | 1U KVM, 1U Console Drawer                          | No          |
| **AV/Media**         | 1U Receiver, 2U Amplifier                          | No          |
| **Cooling**          | 1U Fan Panel                                       | No          |
| **Blank**            | 0.5U Blank, 1U Blank, 2U Blank                     | Yes         |
| **Shelf**            | 1U Shelf, 2U Shelf                                 | Yes         |
| **Cable Management** | 1U Brush Panel, 1U Cable Management                | Yes         |

> **Note:** Half-depth devices (`is_full_depth: false`) can share the same U position with other half-depth devices on the opposite face. See Section 3.7 for collision rules.

### 11.3 Implementation

The starter library is defined in `src/lib/data/starterLibrary.ts`:

```typescript
interface StarterDeviceSpec {
  name: string;
  u_height: number;
  category: DeviceCategory;
  is_full_depth?: boolean; // Default: true; false for half-depth devices
}

const STARTER_DEVICES: StarterDeviceSpec[] = [
  { name: "1U Server", u_height: 1, category: "server" },
  { name: "24-Port Switch", u_height: 1, category: "network" },
  { name: "1U Blank", u_height: 1, category: "blank", is_full_depth: false },
  // ... etc
];

export function getStarterLibrary(): DeviceType[] {
  return STARTER_DEVICES.map((spec) => ({
    slug: slugify(spec.name),
    u_height: spec.u_height,
    model: spec.name,
    is_full_depth: spec.is_full_depth, // undefined = true default
    Rackula: {
      colour: CATEGORY_COLOURS[spec.category],
      category: spec.category,
    },
  }));
}
```

### 11.4 Slug Generation

Device slugs are generated from names using the `slugify()` utility:

| Name                | Generated Slug        |
| ------------------- | --------------------- |
| 1U Server           | `1u-server`           |
| 24-Port Switch      | `24-port-switch`      |
| 1U Router/Firewall  | `1u-router-firewall`  |
| 0.5U Blank          | `0-5u-blank`          |
| 1U Cable Management | `1u-cable-management` |

### 11.5 Bundled Images

Active devices (~6 of 26) have pre-bundled WebP images for immediate visual representation in image display mode. Images are sourced from the NetBox Device Type Library (CC0 licensed) and processed to 400px max width.

| Category | Devices with Bundled Images     |
| -------- | ------------------------------- |
| Server   | 1U Server, 2U Server, 4U Server |
| Network  | 48-Port Switch                  |
| Storage  | 2U Storage, 4U Storage          |

Passive/generic items display as category-colored rectangles (no bundled images):

- Blanks, Shelves, Patch Panels, Cable Management, PDU, Fan Panel, 1U KVM, AV/Media

See Section 16 for full Device Image System documentation.

### 11.6 Brand Starter Packs

In addition to the generic starter library, brand-specific device packs provide curated collections of popular manufacturer equipment.

#### 11.6.1 Organization

Brand packs are organized as an **exclusive accordion** (radio-style) in the device palette:

| Section  | Default State | Contents                |
| -------- | ------------- | ----------------------- |
| Generic  | Expanded      | 26 generic device types |
| Ubiquiti | Collapsed     | 10 Ubiquiti devices     |
| Mikrotik | Collapsed     | 5 Mikrotik devices      |

**Behavior:**

- Each section header shows device count: "Ubiquiti (10)"
- Click section header to expand it (closes any other open section)
- **Only one section can be open at a time** (exclusive/radio behavior)
- Search spans ALL sections (including collapsed)
- Search results auto-expand first matching section

#### 11.6.2 Brand Pack Data Model

Brand pack devices use the standard `DeviceType` interface with:

- `manufacturer` field populated (e.g., "Ubiquiti", "Mikrotik")
- `model` field contains product name (e.g., "USW-Pro-24-PoE")
- `slug` generated from model name (e.g., "usw-pro-24-poe")
- Category and properties assigned per device

#### 11.6.3 Ubiquiti Starter Pack

| Device          | Category  | U-Height | Full Depth | Airflow       |
| --------------- | --------- | -------- | ---------- | ------------- |
| USW-Pro-24      | `network` | 1U       | Yes        | side-to-rear  |
| USW-Pro-48      | `network` | 1U       | Yes        | side-to-rear  |
| USW-Pro-24-PoE  | `network` | 1U       | Yes        | side-to-rear  |
| USW-Pro-48-PoE  | `network` | 1U       | Yes        | side-to-rear  |
| USW-Aggregation | `network` | 1U       | Yes        | side-to-rear  |
| UDM-Pro         | `network` | 1U       | Yes        | front-to-rear |
| UDM-SE          | `network` | 1U       | Yes        | front-to-rear |
| UNVR            | `storage` | 1U       | Yes        | front-to-rear |
| UNVR-Pro        | `storage` | 2U       | Yes        | front-to-rear |
| USP-PDU-Pro     | `power`   | 1U       | No         | passive       |

> **Note:** Additional devices may be added during implementation. Cloud Key Gen2+ excluded (not rack-mountable without kit).

#### 11.6.4 Mikrotik Starter Pack

| Device             | Category  | U-Height | Full Depth | Airflow       |
| ------------------ | --------- | -------- | ---------- | ------------- |
| CRS326-24G-2S+     | `network` | 1U       | Yes        | side-to-rear  |
| CRS328-24P-4S+     | `network` | 1U       | Yes        | side-to-rear  |
| CRS309-1G-8S+      | `network` | 1U       | Yes        | side-to-rear  |
| CCR2004-1G-12S+2XS | `network` | 1U       | Yes        | front-to-rear |
| RB5009UG+S+IN      | `network` | 1U       | Yes        | front-to-rear |

> **Note:** Additional netPower series devices may be added during implementation.

#### 11.6.5 Bundling

Brand packs are **bundled with the application**:

- Device definitions included in app bundle
- Images (best-effort from NetBox library) included as WebP
- No network requests required — fully offline capable
- Fallback to category-colored rectangles for missing images

### 11.7 Device Type Storage Architecture

Device types are organized into three sources with distinct storage behaviours:

#### 11.7.1 Sources

| Source                  | Count  | Storage               | Persistence                 |
| ----------------------- | ------ | --------------------- | --------------------------- |
| **Starter Library**     | 26     | Runtime constant      | Never saved to YAML         |
| **Brand Packs**         | ~15+   | Runtime constant      | Imported on first placement |
| **Layout Device Types** | varies | `layout.device_types` | Saved to YAML               |

#### 11.7.2 Storage Rules

1. **`layout.device_types` only contains placed devices** — Device types are added to the layout when first placed in the rack
2. **Starter library and brand packs are runtime constants** — Always available, never stored in YAML exports
3. **YAML exports are minimal** — Only device types actually placed in rack are serialized
4. **Auto-import on placement** — When placing a device from starter library or brand pack, its definition is copied to `layout.device_types`

#### 11.7.3 Placement Flow

```
User drags device from palette
        ↓
1. Check layout.device_types for slug
        ↓ (not found)
2. Check starter library for slug
        ↓ (not found)
3. Check brand packs for slug
        ↓ (found in any)
4. Copy device type to layout.device_types
        ↓
5. Place device in rack
```

#### 11.7.4 DevicePalette Display

The palette merges all sources for display:

```typescript
// Display priority (user sees all available devices)
allGenericDevices = [
  ...starterLibrary.filter((d) => !placedSlugs.has(d.slug)), // Starter (not yet placed)
  ...layoutDeviceTypes.filter((d) => starterSlugs.has(d.slug)), // Placed starter devices
  ...layoutDeviceTypes.filter((d) => !starterSlugs.has(d.slug)), // Custom devices
];
```

**Benefits:**

- Smaller YAML files (no redundant starter library)
- Starter library never "lost" on load (always available as constant)
- Share links work naturally (minimal device_types)
- Clear separation between reference data and user data

---

## 12. Commands

### 12.1 Development

```bash
npm run dev          # Dev server (localhost:5173)
npm run build        # Production build
npm run preview      # Preview build
```

### 12.2 Testing

```bash
npm run test         # Unit tests (watch)
npm run test:run     # Unit tests (CI)
npm run test:e2e     # E2E tests (Playwright)
```

### 12.3 Quality

```bash
npm run lint         # ESLint
npm run format       # Prettier
npm run check        # Svelte type check
```

---

## 13. Deployment

### 13.1 Environments

| Environment | URL          | Trigger        | Platform     |
| ----------- | ------------ | -------------- | ------------ |
| Dev         | dev.racku.la | Push to `main` | GitHub Pages |
| Production  | app.racku.la | Git tag `v*`   | VPS (Docker) |

### 13.2 Security Headers

Production (nginx) includes these security headers:

| Header                  | Value         |
| ----------------------- | ------------- |
| X-Frame-Options         | SAMEORIGIN    |
| X-Content-Type-Options  | nosniff       |
| X-XSS-Protection        | 1; mode=block |
| Content-Security-Policy | See below     |

**CSP Policy:**

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://t.racku.la https://static.cloudflareinsights.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self' https://t.racku.la https://static.cloudflareinsights.com;
frame-ancestors 'self';
```

Notes:

- `'unsafe-inline'` for styles required for Svelte scoped styles
- `'unsafe-inline'` for scripts required for Cloudflare Web Analytics
- Analytics domains whitelisted: Umami (t.racku.la) and Cloudflare Web Analytics
- `data:` and `blob:` for images support export previews and device images
- GitHub Pages (dev) does not support custom headers

See [#102](https://github.com/RackulaLives/Rackula/issues/102) for security research.

---

## 14. Version History

| Version | Changes                                                                       |
| ------- | ----------------------------------------------------------------------------- |
| 0.6.0   | Brand starter packs, export UX overhaul, CSV export, power device properties  |
| 0.5.8   | Umami analytics integration with TypeScript support and custom event tracking |
| 0.5.0   | Type system consolidation, legacy comments cleanup                            |
| 0.4.9   | Airflow visualization, selection bug fix                                      |
| 0.4.8   | Design token audit, CSS cleanup                                               |
| 0.4.0   | Breaking: removed legacy format support                                       |
| 0.3.x   | Undo/redo, YAML archive, device images                                        |
| 0.2.x   | Single-rack mode, fixed sidebar                                               |
| 0.1.x   | Initial release                                                               |

---

## 15. Airflow Visualization (v0.4.9)

Visual overlay for device airflow direction, helping identify thermal conflicts.

### 15.1 Airflow Types

| Type            | Description                         | Visual                      |
| --------------- | ----------------------------------- | --------------------------- |
| `passive`       | No active cooling (panels, shelves) | Gray hollow circle          |
| `front-to-rear` | Standard server airflow             | Blue stripe front, red rear |
| `rear-to-front` | Reverse airflow (some network gear) | Red stripe front, blue rear |
| `side-to-rear`  | Side intake (switches)              | Blue stripe front, red rear |

### 15.2 Visual Design

- **Edge stripe** — 4px colored stripe on device edge (left=front view, right=rear view)
- **Arrow indicator** — Small animated chevron next to stripe showing direction
- **Colors** — Blue (#60a5fa) = intake, Red (#f87171) = exhaust, Gray (#9ca3af) = passive
- **Conflict border** — Orange (#f59e0b) border on devices with airflow conflicts

### 15.3 Conflict Detection

Conflicts detected when exhaust of one device feeds intake of adjacent device:

- Front-to-rear device above rear-to-front device
- Rear-to-front device above front-to-rear device

### 15.4 UI Integration

- **Toggle** — `A` key or toolbar button toggles airflow visualization
- **Export** — Airflow indicators included in image/PDF exports when enabled
- **EditPanel** — Dropdown to change device airflow type
- **AddDeviceForm** — Dropdown to set airflow on new devices

---

## 16. Device Image System

### 16.1 Overview

Two-level image storage system with device type defaults and placement-level overrides.

### 16.2 Image Sources

| Source                    | Storage Location                | Purpose                   |
| ------------------------- | ------------------------------- | ------------------------- |
| Bundled                   | `src/lib/assets/device-images/` | Starter library defaults  |
| User upload (device type) | In-memory → archive             | Custom device type images |
| User upload (placement)   | In-memory → archive             | Per-placement overrides   |

### 16.3 Image Lookup Priority

When rendering a device, images are resolved in this order:

1. **Placement override** — Custom image for this specific placed device (keyed by `PlacedDevice.id`)
2. **Device type default** — Image uploaded when creating/editing the device type (keyed by `DeviceType.slug`)
3. **Bundled default** — Pre-bundled image for starter library devices (keyed by slug)
4. **No image** — Falls back to category-colored rectangle

### 16.4 Image Processing

User-uploaded images are auto-processed for consistency:

| Processing Step | Details                                             |
| --------------- | --------------------------------------------------- |
| Resize          | Max 400px width (preserves aspect ratio)            |
| Format          | Convert to WebP                                     |
| Purpose         | Keeps archives lean, consistent with bundled images |

Images under 400px width are not resized. Processing happens client-side using canvas API.

### 16.5 Bundled Images

~15 active devices from the starter library have pre-bundled WebP images:

| Category | Devices with Images                                               |
| -------- | ----------------------------------------------------------------- |
| Server   | 1U Server, 2U Server, 4U Server                                   |
| Network  | 8-Port Switch, 24-Port Switch, 48-Port Switch, 1U Router/Firewall |
| Storage  | 1U Storage, 2U Storage, 4U Storage                                |
| Power    | 2U UPS, 4U UPS                                                    |
| KVM      | 1U Console Drawer                                                 |

Passive/generic items remain as category-colored rectangles:

- Blanks (0.5U, 1U, 2U)
- Shelves (1U, 2U)
- Patch panels, Cable management, PDU, Fan Panel, Receiver, Amplifier

### 16.6 Image Store Architecture

```typescript
// Two separate stores for different image levels
const deviceTypeImages = new SvelteMap<string, DeviceImageData>(); // key: slug
const placementImages = new SvelteMap<string, DeviceImageData>(); // key: placement id

// Combined lookup with fallback
function getImageForPlacement(
  slug: string,
  placementId: string,
  face: "front" | "rear",
): ImageData | undefined {
  // 1. Check placement override
  const override = placementImages.get(placementId)?.[face];
  if (override) return override;

  // 2. Fall back to device type default
  const typeDefault = deviceTypeImages.get(slug)?.[face];
  if (typeDefault) return typeDefault;

  // 3. Check bundled images (loaded at app init)
  // (already in deviceTypeImages from loadBundledImages())

  return undefined; // Colored rectangle fallback
}
```

### 16.7 EditPanel Image Override UI

When a device is selected, EditPanel shows:

| State                     | UI                                               |
| ------------------------- | ------------------------------------------------ |
| Using device type default | "Using default image" label                      |
| Has placement override    | "Custom image" label + "Reset to default" button |
| No image available        | Image upload prompt                              |

Users can upload a custom image for the specific placement, which overrides the device type default for that instance only.

---

## 17. Out of Scope

Features that will NOT be implemented:

- ~~Multiple racks per project~~ (implemented v0.6.0)
- Nested containers (container within container)
- Quarter-width devices
- Irregular layouts (foam cutouts, non-grid arrangements)
- Pre-built enclosure library (users create their own container types)
- Backend/database
- User accounts
- Native mobile apps
- Internet Explorer support

## 18. Debug Logging

### 18.1 Overview

Rackula includes a debug logging system for troubleshooting device placement, movement, and collision detection. Logs are only emitted in development mode.

### 18.2 Log Format Standard

All console messages use the format: `[Rackula:category] message`

| Category         | Prefix                   | Purpose                           |
| ---------------- | ------------------------ | --------------------------------- |
| Info             | `[Rackula]`              | Startup and general info messages |
| Debug            | `[Rackula:debug]`        | Verbose debug (panzoom, etc.)     |
| Device Placement | `[Rackula:device:place]` | Device placement operations       |
| Device Movement  | `[Rackula:device:move]`  | Device movement within rack       |
| Collision        | `[Rackula:collision]`    | Collision detection results       |

### 18.3 Placement Logs

Logged when `placeDeviceRecorded()` is called:

```
[Rackula:device:place] slug={slug} pos={position} face={effectiveFace}
  deviceType: {name} is_full_depth={is_full_depth}
  passed face={face} → effective face={effectiveFace}
  result: {success|collision|not_found}
```

### 18.4 Movement Logs

Logged when `moveDeviceRecorded()` is called:

```
[Rackula:device:move] idx={index} from={oldPosition} to={newPosition}
  device: {name} face={face}
  result: {success|collision|out_of_bounds}
```

### 18.5 Implementation

Debug logging uses a centralized logger utility:

```typescript
// src/lib/utils/debug.ts
const PREFIX = "Rackula";

export const debug = {
  log(...args: unknown[]) {
    if (isDebugEnabled()) {
      console.log(`[${PREFIX}:debug]`, ...args);
    }
  },

  info(...args: unknown[]) {
    if (isDebugEnabled()) {
      console.log(`[${PREFIX}]`, ...args);
    }
  },

  devicePlace(data: PlaceLogData) {
    if (isDebugEnabled()) {
      console.log(`[${PREFIX}:device:place]`, formatPlaceLog(data));
    }
  },
  // ... other category methods
};
```

### 18.6 Enabling/Disabling

- **Development mode**: Logs automatically enabled via `import.meta.env.DEV`
- **Production mode**: Logs stripped at build time (no runtime overhead)
- **Test mode**: Logs can be mocked/suppressed in test setup
- **Manual toggle**: `window.enableRackulaDebug()` / `window.disableRackulaDebug()`

---

## 19. Design System

### 19.1 Overview

Rackula's visual identity is rooted in the **Dracula colour scheme** (dark mode) and **Alucard** (light mode). The design communicates technical precision, clarity, and the organised planning that homelabbers aspire to.

**Design Philosophy:**

- Tom Geismar's approach — strip to pure geometry, timeless, works at any size
- Three-layer token architecture: primitives → semantic → component
- WCAG AA compliance as a hard requirement
- British spelling for CSS variables: `--colour-*`

**Theme Behavior:**

- Dark theme (Dracula) is the default
- Light theme (Alucard) activated via `[data-theme="light"]` attribute
- Rack elements intentionally stay dark in both themes (dark racks on light canvas)
- System preference respected via `prefers-color-scheme` media query fallback

### 19.2 Brand Identity

**Logo Mark:**

A sharp-cornered rectangle containing three equal-height horizontal slots as negative space. Represents a server rack front view.

| Property               | Value               | Notes                         |
| ---------------------- | ------------------- | ----------------------------- |
| ViewBox                | `0 0 32 32`         | Square container              |
| Frame                  | `x:6 y:4 w:20 h:24` | Subtly taller than wide       |
| Corner radius          | `0`                 | Sharp corners (Geismar style) |
| Slots                  | 3 equal-height      | Represents organised devices  |
| Primary colour (dark)  | `#BD93F9`           | Dracula purple                |
| Primary colour (light) | `#644AC9`           | Alucard purple                |

**Logo Usage:**

| Variant              | Use Case                               | Colour           |
| -------------------- | -------------------------------------- | ---------------- |
| Solid purple (dark)  | Favicon, titlebar on dark backgrounds  | `#BD93F9`        |
| Solid purple (light) | Favicon, titlebar on light backgrounds | `#644AC9`        |
| Gradient (dark)      | Marketing, hero sections, 64px+        | Dracula gradient |
| Gradient (light)     | Marketing on light backgrounds         | Alucard gradient |

**Clear Space:** Minimum 25% of mark width on all sides.

### 19.3 Colour System

#### 19.3.1 Dracula Theme (Dark) — Primitives

```css
:root {
  /* Backgrounds */
  --dracula-bg-darkest: #191a21; /* Deepest background */
  --dracula-bg-darker: #21222c; /* Page background */
  --dracula-bg: #282a36; /* Card/panel background */
  --dracula-bg-light: #343746; /* Elevated surfaces */
  --dracula-bg-lighter: #424450; /* Hover states */
  --dracula-selection: #44475a; /* Selection highlight */

  /* Text */
  --dracula-foreground: #f8f8f2; /* Primary text */
  --dracula-comment: #6272a4; /* Muted/secondary text */

  /* Accent Colours */
  --dracula-purple: #bd93f9; /* Primary brand, links */
  --dracula-pink: #ff79c6; /* Secondary accent */
  --dracula-cyan: #8be9fd; /* Interactive elements, CTAs */
  --dracula-green: #50fa7b; /* Success, valid states */
  --dracula-orange: #ffb86c; /* Warnings */
  --dracula-red: #ff5555; /* Errors, destructive */
  --dracula-yellow: #f1fa8c; /* Highlights, caution */
}
```

#### 19.3.2 Alucard Theme (Light) — Primitives

```css
:root[data-theme="light"] {
  /* Backgrounds — warm cream tones */
  --alucard-bg-darkest: #bcbab3; /* Deepest (inverted from dark) */
  --alucard-bg-darker: #ceccc0; /* Page background */
  --alucard-bg: #fffbeb; /* Card/panel background — main */
  --alucard-bg-light: #dedccf; /* Elevated surfaces */
  --alucard-bg-lighter: #ece9df; /* Hover states */
  --alucard-selection: #cfcfde; /* Selection highlight */
  --alucard-floating: #efeddc; /* Floating interactive elements */

  /* Text */
  --alucard-foreground: #1f1f1f; /* Primary text — near black */
  --alucard-comment: #6c664b; /* Muted/secondary text — warm grey */

  /* Accent Colours — darker for light background contrast */
  --alucard-purple: #644ac9; /* Primary brand, links */
  --alucard-pink: #a3144d; /* Secondary accent */
  --alucard-cyan: #036a96; /* Interactive elements, CTAs */
  --alucard-green: #14710a; /* Success, valid states */
  --alucard-orange: #a34d14; /* Warnings */
  --alucard-red: #cb3a2a; /* Errors, destructive */
  --alucard-yellow: #846e15; /* Highlights, caution */
}
```

#### 19.3.3 Category Colour Mapping

Device categories use a hybrid mapping: active infrastructure uses vibrant Dracula accents, passive items use neutral comment colours.

| Category           | Type    | Dracula Hex           | Alucard Hex | Rationale              |
| ------------------ | ------- | --------------------- | ----------- | ---------------------- |
| `server`           | Active  | `#8BE9FD` (cyan)      | `#036A96`   | Core infrastructure    |
| `network`          | Active  | `#BD93F9` (purple)    | `#644AC9`   | Primary accent         |
| `storage`          | Active  | `#50FA7B` (green)     | `#14710A`   | Data/growth            |
| `power`            | Active  | `#FF5555` (red)       | `#CB3A2A`   | Critical/energy        |
| `kvm`              | Active  | `#FFB86C` (orange)    | `#A34D14`   | Control/interactive    |
| `av-media`         | Active  | `#FF79C6` (pink)      | `#A3144D`   | Media/entertainment    |
| `cooling`          | Active  | `#F1FA8C` (yellow)    | `#846E15`   | Distinct from server   |
| `shelf`            | Passive | `#6272A4` (comment)   | `#6C664B`   | Reduced visual noise   |
| `blank`            | Passive | `#44475A` (selection) | `#CFCFDE`   | Fades into background  |
| `cable-management` | Passive | `#6272A4` (comment)   | `#6C664B`   | Utility item           |
| `patch-panel`      | Passive | `#6272A4` (comment)   | `#6C664B`   | Passive infrastructure |
| `other`            | Passive | `#6272A4` (comment)   | `#6C664B`   | Generic fallback       |

**Design Rationale:** Active equipment (servers, networking, storage, power) uses vibrant Dracula accents for visual prominence. Passive items (shelves, blanks, cable management) use neutral comment colours to reduce visual noise and draw attention to active equipment.

#### 19.3.4 Semantic Colour Tokens

Semantic tokens map primitives to UI purposes:

```css
:root {
  /* Brand */
  --colour-brand-primary: var(--dracula-purple);
  --colour-brand-secondary: var(--dracula-pink);
  --colour-brand-accent: var(--dracula-cyan);

  /* Backgrounds */
  --colour-bg: var(--dracula-bg);
  --colour-bg-darker: var(--dracula-bg-darker);
  --colour-surface: var(--dracula-bg-light);
  --colour-surface-hover: var(--dracula-bg-lighter);

  /* Text */
  --colour-text: var(--dracula-foreground);
  --colour-text-muted: var(--dracula-comment);

  /* Interactive */
  --colour-interactive: var(--dracula-cyan);
  --colour-interactive-hover: var(--dracula-purple);
  --colour-link: var(--dracula-cyan);
  --colour-link-hover: var(--dracula-purple);
  --colour-selection: var(--dracula-selection);
  --colour-focus-ring: var(--dracula-purple);

  /* Feedback */
  --colour-success: var(--dracula-green);
  --colour-warning: var(--dracula-orange);
  --colour-error: var(--dracula-red);
  --colour-info: var(--dracula-cyan);

  /* Borders */
  --colour-border: var(--dracula-selection);
  --colour-border-hover: var(--dracula-comment);
  --colour-border-focus: var(--dracula-purple);
  --colour-border-error: var(--dracula-red);
}
```

Light mode overrides these semantic tokens to use Alucard primitives.

#### 19.3.5 Airflow Colours

See Section 15.2 for airflow visualisation colours. Summary:

| Airflow  | Dark Mode               | Light Mode | Purpose                  |
| -------- | ----------------------- | ---------- | ------------------------ |
| Intake   | `#60a5fa` (blue-400)    | `#036A96`  | Air entering device      |
| Exhaust  | `#f87171` (red-400)     | `#CB3A2A`  | Hot air exiting          |
| Passive  | `#9ca3af` (neutral-400) | `#6C664B`  | No active cooling        |
| Conflict | `#f59e0b` (amber-500)   | `#A34D14`  | Thermal conflict warning |

### 19.4 Typography

#### 19.4.1 Font Stack

```css
:root {
  /* Monospace — code, UI chrome, headings */
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Consolas, monospace;

  /* Sans — body text, descriptions */
  --font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif;
}
```

#### 19.4.2 Type Scale

```css
:root {
  --text-xs: 0.75rem; /* 12px — captions, labels */
  --text-sm: 0.875rem; /* 14px — secondary text */
  --text-base: 1rem; /* 16px — body */
  --text-lg: 1.125rem; /* 18px — lead text */
  --text-xl: 1.25rem; /* 20px — section headers */
  --text-2xl: 1.5rem; /* 24px — page headers */
  --text-3xl: 2rem; /* 32px — hero text */
  --text-4xl: 3rem; /* 48px — marketing hero */
}
```

#### 19.4.3 Font Weights

```css
:root {
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
}
```

#### 19.4.4 Usage Guidelines

| Element         | Font | Weight | Size          |
| --------------- | ---- | ------ | ------------- |
| Hero title      | Mono | 600    | `--text-4xl`  |
| Page heading    | Mono | 600    | `--text-2xl`  |
| Section heading | Mono | 500    | `--text-lg`   |
| Body text       | Sans | 400    | `--text-base` |
| UI labels       | Mono | 500    | `--text-sm`   |
| Code/values     | Mono | 400    | `--text-sm`   |
| Captions        | Sans | 400    | `--text-xs`   |

### 19.5 Spacing & Layout

Base unit: 4px. All spacing derives from this unit.

```css
:root {
  --space-unit: 0.25rem; /* 4px base unit */

  --space-1: calc(var(--space-unit) * 1); /* 4px */
  --space-2: calc(var(--space-unit) * 2); /* 8px */
  --space-3: calc(var(--space-unit) * 3); /* 12px */
  --space-4: calc(var(--space-unit) * 4); /* 16px */
  --space-5: calc(var(--space-unit) * 5); /* 20px */
  --space-6: calc(var(--space-unit) * 6); /* 24px */
  --space-8: calc(var(--space-unit) * 8); /* 32px */
  --space-10: calc(var(--space-unit) * 10); /* 40px */
  --space-12: calc(var(--space-unit) * 12); /* 48px */
  --space-16: calc(var(--space-unit) * 16); /* 64px */
}
```

**Semantic Spacing:**

```css
:root {
  /* Component internal padding */
  --padding-xs: var(--space-1);
  --padding-sm: var(--space-2);
  --padding-md: var(--space-4);
  --padding-lg: var(--space-6);
  --padding-xl: var(--space-8);

  /* Gaps between elements */
  --gap-xs: var(--space-1);
  --gap-sm: var(--space-2);
  --gap-md: var(--space-4);
  --gap-lg: var(--space-6);
  --gap-xl: var(--space-8);

  /* Section margins */
  --section-gap: var(--space-12);
  --page-margin: var(--space-6);
}
```

### 19.6 Borders & Radius

#### 19.6.1 Border Widths

```css
:root {
  --border-thin: 1px;
  --border-medium: 2px;
  --border-thick: 3px;
}
```

#### 19.6.2 Border Radii

```css
:root {
  --radius-none: 0;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-full: 9999px;
}
```

| Element       | Radius                  |
| ------------- | ----------------------- |
| Logo mark     | `--radius-none` (sharp) |
| Buttons       | `--radius-md`           |
| Cards/panels  | `--radius-md`           |
| Input fields  | `--radius-md`           |
| Pills/tags    | `--radius-full`         |
| Modal dialogs | `--radius-lg`           |

### 19.7 Shadows & Glow Effects

#### 19.7.1 Box Shadows

```css
:root {
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.3);
  --shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.4);
}

:root[data-theme="light"] {
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
  --shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.12);
}
```

#### 19.7.2 Glow Effects (Dracula Style)

```css
:root {
  /* Cyan glow for interactive elements */
  --glow-sm: 0 0 12px rgba(139, 233, 253, 0.3);
  --glow-md: 0 0 20px rgba(139, 233, 253, 0.3);
  --glow-lg: 0 0 30px rgba(139, 233, 253, 0.3);

  /* Purple glow for focus/selection */
  --glow-purple-sm: 0 0 12px rgba(189, 147, 249, 0.3);
  --glow-purple-md: 0 0 20px rgba(189, 147, 249, 0.3);
  --glow-purple-lg: 0 0 30px rgba(189, 147, 249, 0.3);

  /* Green glow for success states */
  --glow-green-sm: 0 0 12px rgba(80, 250, 123, 0.3);
}

:root[data-theme="light"] {
  /* Softer glows for light backgrounds */
  --glow-sm: 0 0 8px rgba(3, 106, 150, 0.2);
  --glow-md: 0 0 16px rgba(3, 106, 150, 0.2);
  --glow-lg: 0 0 24px rgba(3, 106, 150, 0.2);

  --glow-purple-sm: 0 0 8px rgba(100, 74, 201, 0.2);
  --glow-purple-md: 0 0 16px rgba(100, 74, 201, 0.2);
  --glow-purple-lg: 0 0 24px rgba(100, 74, 201, 0.2);

  --glow-green-sm: 0 0 8px rgba(20, 113, 10, 0.2);
}
```

#### 19.7.3 Focus Ring

```css
:root {
  --focus-ring: 0 0 0 2px var(--colour-bg), 0 0 0 4px var(--colour-focus-ring);
}
```

### 19.8 Motion & Animation

#### 19.8.1 Timing

```css
:root {
  --duration-fast: 150ms;
  --duration-normal: 200ms;
  --duration-slow: 300ms;
  --duration-slower: 500ms;

  --ease-default: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
}
```

#### 19.8.2 Standard Transitions

```css
:root {
  --transition-colours:
    color var(--duration-fast) var(--ease-default),
    background-color var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default);

  --transition-transform: transform var(--duration-normal) var(--ease-default);

  --transition-all: all var(--duration-normal) var(--ease-default);
}
```

#### 19.8.3 Logo Animations

```css
/* Slot pulse — use for loading states */
@keyframes slot-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

/* Slot reveal — use for building/progress */
@keyframes slot-reveal {
  0% {
    width: 0;
  }
  100% {
    width: 12px;
  }
}
```

#### 19.8.4 Semantic Animation Tokens

For complex, celebratory, or loading animations:

```css
:root {
  --anim-rainbow: 6s; /* Rainbow wave celebration */
  --anim-loading: 2s; /* Slot reveal loading cycle */
  --anim-shimmer: 2s; /* Light sweep effect */
  --anim-party: 0.5s; /* Party mode colour cycle */
  --anim-party-duration: 5s; /* Total party mode time */
}
```

#### 19.8.5 Export Feedback UX

Animations provide visual feedback during async export operations:

| State             | Animation    | Location       | Behaviour                                    |
| ----------------- | ------------ | -------------- | -------------------------------------------- |
| Exporting         | LogoLoader   | Export dialog  | Logo with slot reveal animation (2s cycle)   |
| Preview rendering | Shimmer      | Export preview | Light sweep overlay while rendering          |
| Export complete   | Rainbow Wave | LogoLockup     | 3s celebration with Dracula gradient cycling |
| Save/Load success | Rainbow Wave | LogoLockup     | Same celebration as export                   |

**LogoLoader Component:**

- Displays logo mark with animated slot fills
- Slots fill sequentially with stagger: 0s, 0.3s, 0.6s
- Optional message text below logo
- Purple colour scheme matching brand

**Shimmer Effect:**

- CSS-based light sweep overlay
- Gradient: `transparent → rgba(255,255,255,0.1) → transparent`
- Background-size: 200%, animates position
- Respects `prefers-reduced-motion`

#### 19.8.6 Success Toast Feedback

Success toasts include visual enhancements:

| Element       | Effect                     | Duration |
| ------------- | -------------------------- | -------- |
| Success toast | Green glow pulse on appear | 0.5s     |
| Toast exit    | Slide out animation        | 0.3s     |

```css
@keyframes success-glow {
  0% {
    box-shadow: 0 0 0 0 rgba(80, 250, 123, 0.4);
  }
  100% {
    box-shadow: 0 0 0 8px transparent;
  }
}

@keyframes slideOut {
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}
```

#### 19.8.7 Interactive Drag Feedback

Visual feedback during device drag-and-drop operations:

| State             | Effect         | Details                                                 |
| ----------------- | -------------- | ------------------------------------------------------- |
| Device pickup     | Scale + shadow | `scale(1.02)`, `drop-shadow(0 4px 8px rgba(0,0,0,0.3))` |
| Valid drop zone   | Green pulse    | Zone border pulses with success colour                  |
| Invalid drop zone | Red flash      | Brief red border flash                                  |
| Drop settle       | Ease return    | `ease-out` transition back to `scale(1)`                |

```css
.device-rect.dragging {
  transform: scale(1.02);
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
  transition: transform 0.1s ease-out;
}
```

#### 19.8.8 Party Mode Easter Egg

Hidden feature activated by Konami code (↑↑↓↓←→←→BA):

| Property    | Value                                     |
| ----------- | ----------------------------------------- |
| Trigger     | Konami code sequence                      |
| Scope       | Toolbar logo + rack frames                |
| Duration    | 5 seconds, auto-disable                   |
| Logo effect | Fast rainbow cycle (0.5s) + subtle wobble |
| Rack effect | Rainbow border cycling                    |
| Toast       | "Party Mode!" (info type)                 |

**Implementation:**

```typescript
const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "KeyB",
  "KeyA",
];
```

**Accessibility:**

- Respects `prefers-reduced-motion: reduce`
- Explicit activation only (no auto-trigger)
- 5-second timeout prevents seizure risk
- Not announced to screen readers (decorative)

### 19.9 Focus States & Accessibility

#### 19.9.1 Focus Indicators

All interactive elements must have visible focus indicators:

```css
:focus-visible {
  outline: 2px solid var(--colour-focus-ring);
  outline-offset: 2px;
  box-shadow: var(--glow-purple-sm);
}
```

#### 19.9.2 Keyboard Navigation

- Tab/Shift+Tab: Navigate between interactive elements
- Enter/Space: Activate buttons and links
- Arrow keys: Navigate within components (accordions, lists)
- Escape: Close modals, clear selection

#### 19.9.3 Reduced Motion

Respect user preference for reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 19.10 Component Token Mappings

| Component          | Background             | Border             | Text            |
| ------------------ | ---------------------- | ------------------ | --------------- |
| Toolbar            | `--colour-surface`     | `--colour-border`  | `--colour-text` |
| Sidebar            | `--colour-surface`     | `--colour-border`  | `--colour-text` |
| Dialog             | `--colour-bg`          | `--colour-border`  | `--colour-text` |
| Input              | `--colour-surface`     | `--colour-border`  | `--colour-text` |
| Button (primary)   | `--colour-interactive` | transparent        | `--colour-bg`   |
| Button (secondary) | `--colour-surface`     | `--colour-border`  | `--colour-text` |
| Toast (success)    | `--colour-surface`     | `--colour-success` | `--colour-text` |
| Toast (error)      | `--colour-surface`     | `--colour-error`   | `--colour-text` |

**Note:** Rack elements use dedicated rack tokens that stay dark in both themes:

```css
--rack-bg: var(--neutral-900);
--rack-rail: var(--neutral-700);
--rack-interior: var(--neutral-800);
--rack-text: var(--neutral-400);
```

### 19.11 WCAG Compliance Requirements

All colour combinations must meet WCAG 2.1 AA standards:

| Requirement   | Ratio   | Applies To                       |
| ------------- | ------- | -------------------------------- |
| Normal text   | ≥ 4.5:1 | Body text, labels                |
| Large text    | ≥ 3:1   | Headings 18px+, bold 14px+       |
| UI components | ≥ 3:1   | Borders, icons, focus indicators |
| Decorative    | N/A     | Non-essential visual elements    |

**Required Contrast Verification:**

| Combination              | Dark Mode              | Light Mode             | Required |
| ------------------------ | ---------------------- | ---------------------- | -------- |
| Text on background       | `#F8F8F2` on `#282A36` | `#1F1F1F` on `#FFFBEB` | ≥ 4.5:1  |
| Muted text on background | `#6272A4` on `#282A36` | `#6C664B` on `#FFFBEB` | ≥ 4.5:1  |
| Link on background       | `#8BE9FD` on `#282A36` | `#036A96` on `#FFFBEB` | ≥ 4.5:1  |
| Focus ring               | `#BD93F9` on any       | `#644AC9` on any       | ≥ 3:1    |
| Error text               | `#FF5555` on `#282A36` | `#CB3A2A` on `#FFFBEB` | ≥ 4.5:1  |

### 19.12 Font Bundling Strategy

Self-hosted fonts for performance and privacy:

**Location:** `/static/fonts/`

**Files:**

- `JetBrainsMono-Regular.woff2` (400)
- `JetBrainsMono-Medium.woff2` (500)
- `JetBrainsMono-SemiBold.woff2` (600)
- `JetBrainsMono-Bold.woff2` (700)
- `Inter-Regular.woff2` (400)
- `Inter-Medium.woff2` (500)
- `Inter-SemiBold.woff2` (600)
- `Inter-Bold.woff2` (700)

**Font Loading:**

```css
@font-face {
  font-family: "JetBrains Mono";
  src: url("/fonts/JetBrainsMono-Regular.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Inter";
  src: url("/fonts/Inter-Regular.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
/* ... additional weights */
```

**Performance Notes:**

- `font-display: swap` prevents FOIT (flash of invisible text)
- woff2 format for modern browser support
- Subset fonts if needed for CJK or extended Latin

---

## 20. Analytics

### 20.1 Overview

Privacy-focused analytics using [Umami](https://umami.is/), a self-hosted, cookieless analytics platform. Analytics track feature adoption and usage patterns without collecting personal data.

### 20.2 Configuration

Analytics are configured via Vite environment variables:

| Variable                | Purpose                         | Default |
| ----------------------- | ------------------------------- | ------- |
| `VITE_UMAMI_ENABLED`    | Enable/disable analytics        | `false` |
| `VITE_UMAMI_SCRIPT_URL` | Umami script URL                | (empty) |
| `VITE_UMAMI_WEBSITE_ID` | Website ID from Umami dashboard | (empty) |

**Build-time constants** (injected via `vite.config.ts`):

- `__UMAMI_ENABLED__` — Boolean flag
- `__UMAMI_SCRIPT_URL__` — Script URL string
- `__UMAMI_WEBSITE_ID__` — Website ID string

### 20.3 Implementation

**Core module:** `src/lib/utils/analytics.ts`

```typescript
// Initialize on app startup (main.ts)
import { initAnalytics } from "$lib/utils/analytics";
initAnalytics();

// Track events from components
import { analytics } from "$lib/utils/analytics";
analytics.trackSave(deviceCount);
analytics.trackExportPDF("both");
```

**Script injection:** `index.html` dynamically injects the Umami script when enabled, emitting `umami:loaded` custom event on load.

**TypeScript support:** `@types/umami-browser` package provides type definitions.

### 20.4 Events Tracked

| Event                  | Properties       | Trigger                    |
| ---------------------- | ---------------- | -------------------------- |
| `file:save`            | `device_count`   | Successful layout save     |
| `file:load`            | `device_count`   | Successful layout load     |
| `export:image`         | `format`, `view` | PNG/JPEG/SVG export        |
| `export:pdf`           | `view`           | PDF export                 |
| `export:csv`           | —                | CSV export                 |
| `device:create_custom` | `category`       | Custom device type created |
| `feature:display_mode` | `mode`           | Display mode toggled       |
| `feature:airflow_view` | `enabled`        | Airflow view toggled       |
| `keyboard:shortcut`    | `shortcut`       | Keyboard shortcut used     |

### 20.5 Session Properties

Session properties are set via `umami.identify()` on script load:

| Property                  | Values                           | Purpose                    |
| ------------------------- | -------------------------------- | -------------------------- |
| `app_version`             | Semantic version (e.g., `0.5.7`) | Feature adoption tracking  |
| `screen_category`         | `mobile`, `tablet`, `desktop`    | Responsive design insights |
| `color_scheme_preference` | `dark`, `light`, `no-preference` | Theme preference analysis  |

### 20.6 Privacy Compliance

| Requirement         | Implementation                                   |
| ------------------- | ------------------------------------------------ |
| No cookies          | Umami is cookieless by design                    |
| No personal data    | No user IDs, emails, or names collected          |
| Disabled by default | Requires `VITE_UMAMI_ENABLED=true`               |
| Dev-safe            | Auto-disabled on localhost/127.0.0.1             |
| Fail-safe           | Analytics errors never break the application     |
| GDPR/CCPA compliant | No consent banner required (no tracking cookies) |

### 20.7 Production Deployment

The hosted app at `app.racku.la` uses a self-hosted Umami instance at `t.racku.la`. Both dev and prod environments share the same Umami instance with separate website IDs.

---

_This specification is the technical source of truth for Rackula._
