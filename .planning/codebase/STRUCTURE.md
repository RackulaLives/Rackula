# Codebase Structure

**Analysis Date:** 2026-02-19

## Directory Layout

```
project-root/
├── src/
│   ├── main.ts                 # Entry point: Initialize analytics, mount App.svelte
│   ├── App.svelte              # Root component: Layout, stores, keyboard handlers
│   ├── app.css                 # Global styles (imported by main.ts)
│   ├── app.d.ts                # Vite type definitions
│   ├── vite-env.d.ts           # Vite environment types
│   │
│   ├── lib/
│   │   ├── components/         # Svelte UI components
│   │   │   ├── Canvas.svelte                 # Main rack rendering, panzoom
│   │   │   ├── Rack.svelte                   # Single rack with device rendering
│   │   │   ├── RackDevice.svelte             # Device inside rack
│   │   │   ├── RackDualView.svelte           # Front/rear rack pair
│   │   │   ├── BayedRackView.svelte          # Multi-rack group layout
│   │   │   ├── DevicePalette.svelte          # Device library drag source
│   │   │   ├── EditPanel.svelte              # Right sidebar: device/rack properties
│   │   │   ├── Toolbar.svelte                # Top toolbar: menu, undo/redo, zoom
│   │   │   ├── SidebarTabs.svelte            # Left sidebar tabs: Devices, Racks, Cables
│   │   │   ├── RackList.svelte               # Rack selection and management
│   │   │   ├── ui/                           # bits-ui wrapped components
│   │   │   │   ├── Dialog/
│   │   │   │   ├── Tabs/
│   │   │   │   ├── Accordion/
│   │   │   │   └── ContextMenu/
│   │   │   ├── mobile/                       # Mobile-specific components
│   │   │   │   ├── MobileBottomNav.svelte    # Bottom navigation sheet
│   │   │   │   ├── MobileViewSheet.svelte    # View mode selector
│   │   │   │   ├── MobileHistoryControls.svelte
│   │   │   │   └── RackIndicator.svelte
│   │   │   ├── wizard/                       # Multi-step dialogs
│   │   │   │   ├── NewRackWizard.svelte      # Create new rack flow
│   │   │   │   └── AddDeviceForm.svelte
│   │   │   ├── icons/                        # Custom icon components
│   │   │   ├── Dialogs (10+):
│   │   │   │   ├── ExportDialog.svelte       # Export to PNG/PDF/SVG
│   │   │   │   ├── ShareDialog.svelte        # Generate share URL
│   │   │   │   ├── ImportFromNetBoxDialog.svelte
│   │   │   │   ├── ConfirmDialog.svelte
│   │   │   │   ├── CleanupDialog.svelte
│   │   │   │   └── ...
│   │   │   └── Tooltips:
│   │   │       ├── PortTooltip.svelte        # Port info on hover
│   │   │       └── DragTooltip.svelte        # Drag preview
│   │   │
│   │   ├── stores/                           # Svelte 5 rune-based state
│   │   │   ├── layout.svelte.ts              # Master state: racks, devices, groups
│   │   │   ├── history.svelte.ts             # Undo/redo stack (max 50)
│   │   │   ├── canvas.svelte.ts              # Panzoom and zoom level
│   │   │   ├── selection.svelte.ts           # Current selection (rack/device/group)
│   │   │   ├── ui.svelte.ts                  # Theme, display mode, sidebar state
│   │   │   ├── dialogs.svelte.ts             # Dialog open/close states
│   │   │   ├── cables.svelte.ts              # Cable drawing state
│   │   │   ├── persistence.svelte.ts         # Server sync and API availability
│   │   │   ├── images.svelte.ts              # Custom device images cache
│   │   │   ├── toast.svelte.ts               # Toast notification queue
│   │   │   ├── dragTooltip.svelte.ts         # Drag preview tooltip state
│   │   │   ├── portTooltip.svelte.ts         # Port hover tooltip
│   │   │   ├── placement.svelte.ts           # Mobile tap-to-place state
│   │   │   ├── layout-helpers.ts             # Device type creation utilities
│   │   │   └── commands/                     # Command pattern implementations
│   │   │       ├── types.ts                  # Command interface
│   │   │       ├── device.ts                 # Place/move/remove device
│   │   │       ├── device-type.ts            # Add/update/delete device types
│   │   │       ├── rack.ts                   # Create/delete/update rack
│   │   │       ├── rack-group.ts             # Create/update/delete rack group
│   │   │       └── index.ts                  # Re-export all commands
│   │   │
│   │   ├── types/                            # TypeScript type definitions
│   │   │   ├── index.ts                      # Core types (Layout, Rack, Device, Cable)
│   │   │   ├── constants.ts                  # Type enums (FormFactor, DeviceCategory)
│   │   │   └── images.ts                     # Image handling types
│   │   │
│   │   ├── schemas/                          # Zod validation schemas
│   │   │   ├── index.ts                      # Main schemas
│   │   │   └── share.ts                      # Share URL encoding schema
│   │   │
│   │   ├── utils/                            # Pure utility functions (56+ modules)
│   │   │   ├── collision.ts                  # Device placement validation
│   │   │   ├── coordinates.ts                # SVG coordinate transforms
│   │   │   ├── canvas.ts                     # Pan/zoom viewport calculations
│   │   │   ├── dragdrop.ts                   # Drop position logic
│   │   │   ├── device-movement.ts            # Move device calculations
│   │   │   ├── device-lookup.ts              # Find device by slug
│   │   │   ├── device.ts                     # Device ID generation
│   │   │   ├── export.ts                     # SVG/PDF/PNG export rendering (64KB)
│   │   │   ├── import.ts                     # Device library import
│   │   │   ├── netbox-import.ts              # NetBox API import
│   │   │   ├── archive.ts                    # .Rackula.zip packaging
│   │   │   ├── persistence-api.ts            # Server sync operations
│   │   │   ├── session-storage.ts            # IndexedDB operations
│   │   │   ├── share.ts                      # URL encoding/decoding
│   │   │   ├── qrcode.ts                     # QR code generation
│   │   │   ├── position.ts                   # Unit conversions (U ↔ pixels)
│   │   │   ├── analytics.ts                  # Umami analytics tracking
│   │   │   ├── debug.ts                      # Debug logging setup
│   │   │   ├── context-menu.ts               # Right-click menu dispatch
│   │   │   ├── gestures.ts                   # Mobile swipe detection
│   │   │   ├── viewport.svelte.ts            # Window resize observer
│   │   │   ├── keyboard-viewport.ts          # Mobile keyboard handling
│   │   │   ├── haptics.ts                    # Mobile haptic feedback
│   │   │   ├── theme.ts                      # Dark/light theme
│   │   │   ├── file.ts                       # File picker and download
│   │   │   └── ... (40+ more)
│   │   │
│   │   ├── data/                             # Static application data
│   │   │   ├── brandPacks/                   # Device library definitions
│   │   │   │   ├── dell.ts                   # Dell devices
│   │   │   │   ├── hpe.ts                    # HPE devices
│   │   │   │   └── ... (30+ brand packs)
│   │   │   └── starterLibrary.ts             # Initial device set
│   │   │
│   │   ├── assets/                           # Static files
│   │   │   └── device-images/                # Device brand images
│   │   │       ├── dell/
│   │   │       ├── hpe/
│   │   │       └── ... (30+ brands)
│   │   │
│   │   ├── constants/                        # Application constants
│   │   │   └── layout.ts                     # Rack rendering dimensions (U_HEIGHT_PX, etc.)
│   │   │
│   │   ├── styles/                           # Design system
│   │   │   ├── tokens.css                    # CSS custom properties (colors, spacing)
│   │   │   └── globals.css                   # Global styles
│   │   │
│   │   └── i18n/                             # Internationalization
│   │       ├── paraglide/                    # Paraglide i18n setup
│   │       └── messages/                     # Message catalogs (per language)
│   │
│   ├── routes/                               # SvelteKit route handlers (if used)
│   │   └── (empty in current version)
│   │
│   └── tests/                                # Unit and integration tests
│       ├── *-store.test.ts                   # Store tests (layout, history, selection)
│       ├── *-utils.test.ts                   # Utility function tests
│       ├── factories.ts                      # Test data factories
│       └── ... (test files mirror src structure)
│
├── e2e/                                      # Playwright E2E tests
│   ├── fixtures/                             # E2E test helpers
│   ├── tests/                                # E2E test files
│   └── *.config.ts                           # Playwright config variants
│
├── docs/                                     # User and developer documentation
│   ├── ARCHITECTURE.md                       # Architecture overview
│   ├── guides/
│   │   ├── TESTING.md                        # Testing patterns
│   │   └── ACCESSIBILITY.md                  # A11y checklist
│   ├── reference/
│   │   ├── SPEC.md                           # Complete technical spec
│   │   ├── BRAND.md                          # Design system
│   │   └── GITHUB-WORKFLOW.md                # Issues workflow
│   └── planning/
│       └── ROADMAP.md                        # Version roadmap
│
├── scripts/                                  # Build and utility scripts
│   ├── generate-bundled-images.ts
│   ├── process-images.ts
│   ├── update-contributors.ts
│   └── check-compose-persist-parity.sh
│
├── deploy/                                   # Deployment configuration
│   └── (Docker config for production VPS)
│
├── static/                                   # SvelteKit static assets
│
├── dist/                                     # Build output (generated)
│
├── .github/                                  # GitHub Actions workflows
│   └── workflows/                            # CI/CD pipelines
│
├── .planning/                                # Planning documents (GSD)
│   └── codebase/                             # Architecture docs (this location)
│
├── tsconfig.json                             # TypeScript configuration
├── vite.config.ts                            # Vite build configuration
├── vitest.config.ts                          # Vitest testing configuration
├── playwright.config.ts                      # Playwright E2E configuration
├── eslint.config.js                          # ESLint linting rules
├── .prettierrc                                # Prettier formatting config
├── package.json                              # Dependencies and scripts
└── CLAUDE.md                                 # Project instructions
```

## Directory Purposes

**src/lib/components/**

- Purpose: All Svelte UI components
- Contains: Feature components (Canvas, DevicePalette), container components (App layout), dialog components, mobile adaptations
- Key files: Canvas.svelte (5KB, main rendering), EditPanel.svelte (rack/device editor), DevicePalette.svelte (device library)

**src/lib/stores/**

- Purpose: Centralized state using Svelte 5 runes
- Contains: Store getter functions, rune-based state, derived values, command pattern actions
- Key files: layout.svelte.ts (1KB getter + state hooks), history.svelte.ts (undo/redo), canvas.svelte.ts (zoom state)

**src/lib/utils/**

- Purpose: Pure functions and business logic isolated from UI
- Contains: Math calculations, coordinate transforms, validation, I/O operations
- Key files: collision.ts (placement validation), export.ts (SVG rendering, largest utility), canvas.ts (viewport math)

**src/lib/types/**

- Purpose: TypeScript type definitions (foundational)
- Contains: Core domain types (Layout, Rack, PlacedDevice), enums (FormFactor, DeviceCategory)
- Key files: index.ts (main types), constants.ts (enum values)

**src/lib/data/**

- Purpose: Static read-only application data
- Contains: Device library (brand packs with 30+ manufacturers), starter devices
- Key files: brandPacks/\*.ts (device definitions), starterLibrary.ts (initial setup)

**src/lib/assets/device-images/**

- Purpose: Device brand images (PNG)
- Contains: 30+ brand subdirectories with device images
- Key files: Organized by manufacturer (dell/, hpe/, cisco/, etc.)

**src/lib/styles/**

- Purpose: Design system and theming
- Contains: CSS custom properties for colors, spacing, typography
- Key files: tokens.css (design tokens, imported globally)

**src/tests/**

- Purpose: Unit and integration tests
- Contains: Store tests (_-store.test.ts), utility tests (_-utils.test.ts), test factories
- Pattern: Co-located with source (test files mirror src structure)

**e2e/**

- Purpose: End-to-end browser automation tests
- Contains: Playwright test files, fixtures, configuration variants
- Key files: tests/ directory with feature-based test files

**docs/**

- Purpose: All documentation
- Contains: Architecture guide, API reference, design system, testing guide
- Key files: ARCHITECTURE.md (you are here), SPEC.md (technical specification)

**deploy/**

- Purpose: Production deployment infrastructure
- Contains: Docker configuration, VPS setup
- Key files: Dockerfile (if containerized)

## Key File Locations

**Entry Points:**

- `src/main.ts`: Application bootstrap (analytics init, mount)
- `src/App.svelte`: Root component (layout, store init, keyboard handlers)
- `src/lib/components/Canvas.svelte`: Main render loop (SVG, panzoom)

**Configuration:**

- `vite.config.ts`: Build configuration
- `vitest.config.ts`: Test runner setup
- `tsconfig.json`: TypeScript strict mode settings
- `eslint.config.js`: Linting rules
- `.prettierrc`: Code formatting

**Core Logic:**

- `src/lib/stores/layout.svelte.ts`: Master state container
- `src/lib/utils/collision.ts`: Device placement validation
- `src/lib/utils/export.ts`: SVG/PDF export rendering

**Testing:**

- `src/tests/factories.ts`: Test data creation
- `e2e/tests/`: E2E test files
- `vitest.config.ts`: Unit test configuration

## Naming Conventions

**Files:**

- Components: PascalCase.svelte (e.g., `Canvas.svelte`, `DevicePalette.svelte`)
- Utilities: kebab-case.ts (e.g., `collision.ts`, `device-lookup.ts`)
- Stores: kebab-case.svelte.ts (e.g., `layout.svelte.ts`, `canvas.svelte.ts`)
- Tests: Match source + `.test.ts` suffix (e.g., `collision.test.ts`)

**Directories:**

- Component directories: PascalCase for feature groups (e.g., `ui/`, `mobile/`, `wizard/`)
- Utility directories: kebab-case (e.g., `src/lib/utils/`)
- Data directories: camelCase (e.g., `brandPacks/`)

## Where to Add New Code

**New Feature:**

- Primary code: Feature component in `src/lib/components/`
- State management: New getter function in `src/lib/stores/` (if state needed)
- Utilities: Pure functions in `src/lib/utils/` (if calculations/validation)
- Types: Add to `src/lib/types/index.ts` (if new domain type)
- Tests: `src/tests/[feature].test.ts`

**New Component/Module:**

- Pure presentational: `src/lib/components/[Feature].svelte`
- Feature with state: Add store getter to `src/lib/stores/`, import in component
- Reusable utility: `src/lib/utils/[kebab-case].ts` + corresponding test

**Utilities:**

- Shared helpers: `src/lib/utils/` (always pure functions)
- Layout calculations: `src/lib/utils/canvas.ts` or new `src/lib/utils/[feature].ts`
- Constants: `src/lib/constants/layout.ts` (layout rendering) or types/constants.ts (enums)

**New Dialog:**

- Dialog component: `src/lib/components/[Feature]Dialog.svelte`
- State: Add to `src/lib/stores/dialogs.svelte.ts` for open/close flag
- Styling: Use bits-ui Dialog wrapper from `src/lib/components/ui/Dialog/`

**Device Library Extension:**

- New device brand: Add file to `src/lib/data/brandPacks/[brand].ts` following pattern of existing brands
- Device images: Add PNGs to `src/lib/assets/device-images/[brand]/`
- Brand pack export: Update `src/lib/data/brandPacks/index.ts` to re-export

**Tests:**

- Unit test: `src/tests/[module].test.ts` using Vitest + @testing-library/svelte
- E2E test: `e2e/tests/[feature].spec.ts` using Playwright

## Special Directories

**src/lib/stores/commands/:**

- Purpose: Command pattern implementations for undo/redo
- Generated: Yes (factory functions for each command type)
- Committed: Yes
- Pattern: Each command has `execute()` and `undo()` methods

**src/lib/data/brandPacks/:**

- Purpose: Device library data (YAML serialized)
- Generated: No (manually curated)
- Committed: Yes
- Pattern: One file per brand, exports array of DeviceType objects

**src/lib/assets/device-images/:**

- Purpose: Device brand images for rack visualization
- Generated: Partially (resized by `process-images.ts`)
- Committed: Yes (processed images)
- Pattern: Brand subdirectories with PNG files

**dist/:**

- Purpose: Build output (compiled app)
- Generated: Yes (`npm run build`)
- Committed: No (in .gitignore)
- Cleanup: Safe to delete

**e2e/tests/:**

- Purpose: End-to-end Playwright tests
- Generated: No (manually written)
- Committed: Yes
- Pattern: Feature-based test files, config variants for dev/smoke/full

---

_Structure analysis: 2026-02-19_
