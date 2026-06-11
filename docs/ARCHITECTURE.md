# Rackula Architecture Guide

## Overview

Rackula is a browser-based rack layout designer for homelabbers. It runs client-side with an optional persistence API for self-hosted deployments, making it lightweight, portable, and privacy-friendly.

### Design Principles

- **ADHD-friendly**: Minimal decision points, focused workflows
- **Lightweight**: Static frontend, optional backend for persistence
- **Portable**: Self-contained `.Rackula.zip` archives with embedded images
- **Multi-rack**: Multiple racks per layout with independent configuration
- **Offline-ready**: Full functionality without network access

## Technology Stack

| Component | Technology                                            |
| --------- | ----------------------------------------------------- |
| Framework | Svelte 5 with runes (`$state`, `$derived`, `$effect`) |
| Language  | TypeScript (strict mode)                              |
| Rendering | SVG for rack visualization                            |
| Build     | Vite                                                  |
| Testing   | Vitest + @testing-library/svelte + Playwright         |
| Styling   | CSS custom properties (design tokens)                 |

## Project Structure

```
src/
├── lib/
│   ├── components/     # Svelte components (UI + feature-specific)
│   ├── stores/         # State management (Svelte 5 runes)
│   │   └── commands/   # Command pattern implementations
│   ├── types/          # TypeScript type definitions
│   ├── utils/          # Utility functions
│   ├── data/           # Static data (starter library, brand packs)
│   ├── schemas/        # Zod validation schemas
│   ├── styles/         # Design tokens and global styles
│   └── assets/         # Static assets (images, icons)
├── tests/              # Unit and integration tests
└── App.svelte          # Root component

e2e/                    # Playwright E2E tests
docs/                   # Documentation (you are here)
```

## Entry Points for Common Tasks

### Adding a New Feature

1. Define types in `src/lib/types/`
2. Create store if state needed in `src/lib/stores/`
3. Create component in `src/lib/components/`
4. Add tests in `src/tests/`
5. Update relevant docs if user-facing

### Modifying Device Behavior

| What                | Where                                  |
| ------------------- | -------------------------------------- |
| Device types        | `src/lib/types/device.ts`              |
| Placement logic     | `src/lib/stores/layout.svelte.ts`      |
| Collision detection | `src/lib/utils/collision.ts`           |
| Rendering           | `src/lib/components/RackDevice.svelte` |

### Working with the Canvas

| What                  | Where                              |
| --------------------- | ---------------------------------- |
| Pan/zoom state        | `src/lib/stores/canvas.svelte.ts`  |
| SVG rendering         | `src/lib/components/Canvas.svelte` |
| Coordinate transforms | `src/lib/utils/coordinates.ts`     |

### Export/Import

| What                          | Where                      |
| ----------------------------- | -------------------------- |
| Archive format (.Rackula.zip) | `src/lib/utils/archive.ts` |
| Image export (PNG/JPEG/SVG)   | `src/lib/utils/export.ts`  |
| YAML serialization            | `src/lib/utils/yaml.ts`    |

### Styling and Theming

| What            | Where                         |
| --------------- | ----------------------------- |
| Design tokens   | `src/lib/styles/tokens.css`   |
| Theme switching | `src/lib/stores/ui.svelte.ts` |
| Brand colors    | `docs/reference/BRAND.md`     |

## Key Design Decisions

### Svelte 5 Runes (Not Stores)

All state uses Svelte 5 runes:

- `$state()` for reactive state
- `$derived()` for computed values
- `$effect()` for side effects

**Never use** Svelte 4 stores (`writable`, `readable`, `derived` from `svelte/store`).

```svelte
<!-- Correct -->
let count = $state(0); let doubled = $derived(count * 2);

<!-- Wrong -->
import {writable} from 'svelte/store'; const count = writable(0);
```

### Command Pattern for Undo/Redo

All user actions that modify state go through the command pattern:

- Commands in `src/lib/stores/commands/`
- History stack in `src/lib/stores/history.svelte.ts`
- Enables `Ctrl+Z` / `Ctrl+Shift+Z` undo/redo

### NetBox-Compatible Data Model

Field names follow NetBox conventions (snake_case):

- `u_height` (not `uHeight`)
- `device_type` (not `deviceType`)
- `is_full_depth` (not `isFullDepth`)

This enables future NetBox import/export compatibility.

### Greenfield Development

No legacy support or migration code. Features are implemented as if they're the first and only implementation. This keeps the codebase clean and focused.

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub Repository                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Push to main ─────────────────────────────────────────────│
│         │                                                    │
│         ▼                                                    │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│   │    Lint     │────▶│    Test     │────▶│    Build    │   │
│   └─────────────┘     └─────────────┘     └─────────────┘   │
│                                                  │           │
│                                                  ▼           │
│                                        ┌─────────────────┐   │
│                                        │  GitHub Pages   │   │
│                                        │  dev.racku.la   │   │
│                                        └─────────────────┘   │
│                                                              │
│   Git tag v* ───────────────────────────────────────────────│
│         │                                                    │
│         ▼                                                    │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│   │Docker Build │────▶│  Push to    │────▶│  VPS Pull   │   │
│   │             │     │   ghcr.io   │     │  & Deploy   │   │
│   └─────────────┘     └─────────────┘     └─────────────┘   │
│                                                  │           │
│                                                  ▼           │
│                                        ┌─────────────────┐   │
│                                        │   VPS (Docker)  │   │
│                                        │  app.racku.la   │   │
│                                        └─────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

| Environment | URL          | Trigger        | Use Case         |
| ----------- | ------------ | -------------- | ---------------- |
| Dev         | dev.racku.la | Push to `main` | Preview, testing |
| Prod        | app.racku.la | Git tag `v*`   | Live users       |

### Version Alignment

A single release tag produces three images (default frontend, `:persist`
frontend, and `rackula-api`). Each reports its version at runtime so they can be
verified to match:

- **Frontend** (default and `:persist`): `GET /version.json`
- **API** (`rackula-api`): `GET /api/version`

Both return `{ version, commit, buildTime }`. The git tag is the single source
of truth - injected into the API via the `APP_VERSION` build arg, and read from
`package.json` for the frontend. A `verify-version-alignment` CI job runs every
published image and fails the release if their versions diverge, preventing
mismatched releases (e.g. a stale `:persist` image, as in discussion #1563).

## Documentation Map

| Document                            | Purpose                                  |
| ----------------------------------- | ---------------------------------------- |
| `docs/reference/SPEC.md`            | Technical overview and design principles |
| `docs/reference/BRAND.md`           | Design system quick reference            |
| `docs/reference/GITHUB-WORKFLOW.md` | GitHub Issues workflow                   |
| `docs/guides/TESTING.md`            | Testing patterns and commands            |
| `docs/guides/ACCESSIBILITY.md`      | A11y compliance checklist                |
| `docs/planning/ROADMAP.md`          | Version planning and vision              |

## See Also

- `CLAUDE.md` - Claude Code development instructions
- `CONTRIBUTING.md` - Contribution guidelines
- `docs/reference/SPEC.md` - Technical overview and design principles
