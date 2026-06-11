# Rackula Technical Overview

**Version:** 26.5.0
**Updated:** 2026-06-11
**Status:** Active

---

## 1. Overview

### Purpose

Rackula is a lightweight, FOSS, web-based rack layout designer for homelabbers to plan optimal equipment arrangement before physical mounting.

### Core Problem

"I have a rack and a pile of gear — I need to figure out the optimal arrangement before I start mounting."

### Target User

Homelabbers planning rack layouts. Desktop browser users for creation/editing, mobile for viewing.

### Design Principles

- **ADHD-friendly** — Minimal decision points, visual clarity
- **Lightweight** — Runs entirely in the browser; optional backend for persistence
- **Portable** — Layouts saved as self-contained `.Rackula.zip` archives
- **Multi-rack** — Support multiple racks per layout
- **Single-level nesting** — Containers hold devices but cannot be nested
- **FOSS** — MIT licensed

### Links

| Resource   | URL                                     |
| ---------- | --------------------------------------- |
| Production | https://count.racku.la/                 |
| Dev        | https://d.racku.la/                     |
| Repository | https://github.com/RackulaLives/Rackula |

---

## 2. Deployment Modes

Rackula supports two deployment modes:

| Mode        | Backend  | Persistence            | Use Case                   |
| ----------- | -------- | ---------------------- | -------------------------- |
| **Static**  | None     | File download/upload   | GitHub Pages, simple hosts |
| **Persist** | Hono/Bun | API server (save/load) | Self-hosted Docker         |

In static mode, Rackula is a pure client-side SPA with no network dependencies. In persist mode, an optional API server provides layout storage, authentication, and multi-device sync.

See `CLAUDE.md` for deployment environments and CI/CD details.

---

## 3. Tech Stack

| Component   | Technology                                        |
| ----------- | ------------------------------------------------- |
| Framework   | Svelte 5 (runes: `$state`, `$derived`, `$effect`) |
| Language    | TypeScript (strict mode)                          |
| Rendering   | SVG                                               |
| Pan/Zoom    | panzoom                                           |
| Persistence | File download/upload (.Rackula.zip)               |
| API Server  | Hono on Bun (optional, for persist mode)          |
| Data Format | YAML (js-yaml)                                    |
| Validation  | Zod                                               |
| Styling     | CSS custom properties (design tokens)             |
| Testing     | Vitest + @testing-library/svelte + Playwright     |
| Build       | Vite                                              |

---

## 4. Data Model

> **Reference:** For complete schema documentation including all fields, validation rules, and YAML examples, see [SCHEMA.md](./SCHEMA.md).

### Constraints

| Constraint              | Value           |
| ----------------------- | --------------- |
| Min device height       | 0.5U            |
| Max device height       | 42U             |
| Min rack height         | 1U              |
| Max rack height         | 100U            |
| Allowed rack widths     | 10", 19"        |
| Max racks per layout    | No limit        |
| Max container nesting   | 1 level         |
| Max image size          | 5MB             |
| Supported image formats | PNG, JPEG, WebP |

### Collision Detection

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

**Key Principle:** If a device's `face` is explicitly set to `front` or `rear`, it only blocks that face — regardless of the device type's `is_full_depth` property.

**Role of `is_full_depth`:**

- Determines the DEFAULT face when placing a device
- Full-depth devices (`is_full_depth: true` or not specified) default to `face: "both"`
- Half-depth devices (`is_full_depth: false`) default to `face: "front"`
- Users can override face via EditPanel; the override takes precedence for collision detection

**Interface Position Constraints:**

Half-depth device types (`is_full_depth: false`) have a single physical face. Their interface
templates cannot have mixed `position` values — all explicitly positioned interfaces must use
the same face (`front` or `rear`). Unpositioned interfaces default to `front`. This constraint
is enforced by `DeviceTypeSchema`.

**Interaction Consistency:**

Both drag-and-drop and keyboard movement use face-aware validation:

| Operation      | Validation Parameters              |
| -------------- | ---------------------------------- |
| Drag-and-drop  | Target face from `faceFilter` prop |
| Keyboard (↑/↓) | Face from `placedDevice.face`      |

### Container-Aware Collision

Collision detection is hierarchical:

- **Rack-level:** Container devices collide with other rack-level devices using normal rules. Child devices (those with `container_id`) are invisible to rack-level collision.
- **Container-level:** Children only collide with siblings in the same container. Child position is relative (0 = bottom of container). Children must fit within the container's `u_height`.

| Device A            | Device B            | Collision Check          |
| ------------------- | ------------------- | ------------------------ |
| Rack-level          | Rack-level          | Normal U/face/slot rules |
| Rack-level          | Child               | Never collide            |
| Child (container X) | Child (container X) | Check within container   |
| Child (container X) | Child (container Y) | Never collide            |

Children inherit their parent container's face for rendering purposes.

---

## 5. File Format

### Archive Structure

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

- `device-types/` — Images uploaded when creating device types (shared by all instances)
- `placements/` — Per-placement image overrides (keyed by `PlacedDevice.id`)
- Bundled images are not stored in archives (loaded from app assets)

---

## See Also

| Document                              | Purpose                            |
| ------------------------------------- | ---------------------------------- |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | Codebase overview and entry points |
| [SCHEMA.md](./SCHEMA.md)              | Complete data schema reference     |
| [BRAND.md](./BRAND.md)                | Design system and brand colours    |
| [CLAUDE.md](../../CLAUDE.md)          | Development workflow and commands  |
| [CHANGELOG.md](../../CHANGELOG.md)    | Version history                    |
