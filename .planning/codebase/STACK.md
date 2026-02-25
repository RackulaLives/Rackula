# Technology Stack

**Analysis Date:** 2026-02-19

## Languages

**Primary:**

- TypeScript 5.9.3 - Full frontend application with strict type checking
- JavaScript - Build scripts and configuration

**Secondary:**

- YAML - Layout serialization and interchange format (via js-yaml)
- Markdown - Documentation and embedded help text (via marked)

## Runtime

**Environment:**

- Node.js 22 (Alpine) - Build environment in Docker
- Browser (ESNext target) - Runtime execution via Vite

**Package Manager:**

- npm 11 - Primary frontend dependency management
- Bun >=1.0.0 - API sidecar runtime (in `/Users/gvns/code/projects/Rackula/Rackula/api/`)
- Lockfile: `package-lock.json` present for frontend

## Frameworks

**Core:**

- Svelte 5.51.3 - Component framework with runes (`$state`, `$derived`, `$effect`)
- Vite 7.2.2 - Build tool and dev server
- bits-ui 2.15.7 - Headless UI component library (dialog, tabs, accordion, tooltip, popover, select, combobox)

**API/Backend:**

- Hono 4.11.4 - Lightweight web framework (API sidecar at `api/src/`)
- Zod 4.3.6 - Schema validation (shared between frontend and API)

**Testing:**

- Vitest 4.0.17 - Unit test runner with happy-dom environment
- Playwright 1.58.2 - E2E testing framework (3 configs: main, dev, smoke)
- @testing-library/svelte 5.2.6 - Svelte component testing
- @testing-library/user-event 14.6.1 - User interaction simulation

**Build/Dev:**

- @sveltejs/vite-plugin-svelte 6.2.1 - Svelte integration for Vite
- ESLint 10.0.0 - Code linting
- Prettier 3.8.1 - Code formatting
- TypeScript ESLint 8.56.0 - TypeScript linting
- Husky 9.1.7 - Git hooks for pre-commit checks
- lint-staged 16.1.0 - Run linters only on staged files

## Key Dependencies

**Critical:**

- zod 4.3.6 - Runtime type validation (layouts, devices, API contracts)
- js-yaml 4.1.1 - YAML serialization for layout persistence
- jszip 3.10.1 - ZIP archive creation/extraction for layout exports
- jspdf 4.1.0 - PDF generation (dynamically imported to reduce initial bundle)
- panzoom 9.4.3 - Canvas pan/zoom interactions
- qrcode 1.5.4 - QR code generation for layout sharing
- marked 17.0.3 - Markdown parsing for help panels
- pako 2.1.0 - Compression utilities for layout sharing

**UI/Graphics:**

- @lucide/svelte 0.574.0 - Icon library (SVG-based)
- simple-icons 16.9.0 - Brand icon set
- vaul-svelte 1.0.0-next.7 - Drawer/sheet component primitives
- paneforge 1.0.2 - Resizable panel layout system
- debug 4.4.3 - Namespace-based debug logging

**Utilities:**

- nanoid 5.1.6 - Unique ID generation for layouts and devices
- fuse.js 7.1.0 - Fuzzy search for device library
- sharp 0.34.5 - Image processing (bundled image generation script only)

**Mutation Testing:**

- @stryker-mutator/core 9.5.1 - Mutation testing framework
- @stryker-mutator/vitest-runner 9.5.1 - Vitest integration for mutation tests

## Configuration

**Environment:**

- Build-time configuration via `import.meta.env.VITE_*`
- Runtime configuration via Docker environment variables

**Build:**

- `vite.config.ts` - Main build configuration with bundle splitting and git metadata
- `vitest.config.ts` - Test runner configuration with happy-dom environment
- `svelte.config.js` - Svelte v5 runes compiler options
- `tsconfig.json` - TypeScript strict mode disabled (`"strict": false`) with ESNext target
- `eslint.config.js` - ESLint v9 flat config with Svelte and testing-library plugins
- `prettier.config.js` - Code formatter (enforced via husky pre-commit)
- `playwright.config.ts` + `playwright.dev.config.ts` + `playwright.smoke.config.ts` - Three E2E test configurations

## Platform Requirements

**Development:**

- Node.js 22+
- npm 11+
- Modern browser with ES2020+ support
- For API work: Bun 1.0.0+ (in `/Users/gvns/code/projects/Rackula/Rackula/api/`)

**Production:**

- Docker container (nginxinc/nginx-unprivileged:alpine as runtime)
- Multi-stage build: Node 22 Alpine for build → nginx Alpine for runtime
- API sidecar: Separate container running Bun (ghcr.io/rackulalives/rackula-api:latest)
- Total container memory: ~144MB (frontend 128MB + API 16MB)

---

_Stack analysis: 2026-02-19_
