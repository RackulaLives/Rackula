# Rackula v0.9.0

## What This Is

Rackula is a rack layout designer for homelabbers — a browser-based SPA that lets users visually design server rack layouts with drag-and-drop device placement, multi-rack support, bayed racks, cable management, and export/share capabilities. This milestone (v0.9.0) focuses on hardening the self-hosted deployment with authentication, securing CI/CD pipelines, stabilising the E2E test suite, and fixing outstanding bugs.

## Core Value

Users can design rack layouts visually in the browser with zero friction — authentication and security hardening must not degrade the core design experience.

## Requirements

### Validated

- ✓ Visual rack layout design with drag-and-drop — existing
- ✓ Multi-rack and bayed rack support — existing
- ✓ Device library with brand packs (Dell, Ubiquiti, etc.) — existing
- ✓ Undo/redo via command pattern — existing
- ✓ Export to PNG/SVG/PDF — existing
- ✓ Share via URL — existing
- ✓ Save/load layouts (local + server persistence) — existing
- ✓ Cable management and port system — existing
- ✓ Mobile-responsive touch interactions — existing
- ✓ Annotation fields on racks — existing
- ✓ Custom device creation and image upload — existing
- ✓ Cookie-based session auth with CSRF protection — v0.8.1
- ✓ Rate limiting and brute-force protection — v0.8.1

### Active

- [ ] Local authentication mode (username/password) — #1117
- [ ] Generic OIDC authentication integration — #1102
- [ ] Authentication event logging — #1104
- [ ] Auth setup and hardening documentation — #1107
- [ ] Session store migration (in-memory → shared TTL-backed) — #1269
- [ ] API hardening baseline (epic #1274)
- [ ] CI/CD hardening (PR validation workflow, deploy-prod guards) — #1278, #1279, #1280
- [ ] E2E test suite stabilisation (epic #1222 + 10 child issues)
- [ ] Brand-pack image manifest integrity checks — #1189
- [ ] Bug: shared bayed rack URL loads only first bay — #1207
- [ ] Bug: setup.test.ts effect_update_depth_exceeded — #751
- [ ] Bug: persistence should degrade offline after API failures — #1088
- [ ] v0.8.x milestone hygiene and carryover cleanup — #1273

### Out of Scope

- YAML editor (in-app viewer/editor) — deferred to v0.10.0 (epic #1174, #1175-#1178)
- Mobile enhancements (orientation handling, selection feedback, device library touch) — deferred to v0.10.0 (#1050-#1052)
- Share dialog keyboard/screen-reader audit — deferred to v0.10.0 (#1133)
- Export preview responsive sizing — deferred to v0.10.0 (#1132)
- Export preview aspect-ratio fallback — deferred to v0.10.0 (#1131)
- QR generation performance review — deferred to v0.10.0 (#1130)
- Keyboard viewport input type coverage — deferred to v0.10.0 (#1115)
- Touch listener precedence/options audit — v0.9.0 (#1091) but low priority

## Context

- Rackula is at v0.7.6 with active development toward v0.9.0
- Self-hosted API runs on Bun with Hono framework, deployed via Docker on VPS
- Auth system was introduced in v0.8.1 with cookie-based sessions and CSRF
- E2E test suite has significant selector rot from UI changes — many specs need updating
- The project uses Svelte 5 with runes, TypeScript strict mode, Vitest + Playwright
- Existing codebase map at `.planning/codebase/` documents architecture, stack, conventions, and concerns

## Constraints

- **Tech stack**: Svelte 5, TypeScript, Bun/Hono API — no framework changes
- **Deployment**: GitHub Pages (dev) + VPS Docker (prod) — no infrastructure migration
- **Security**: OIDC must be generic (not provider-specific), local auth must work without external dependencies
- **Testing**: ESLint enforces anti-fragile test rules — no DOM queries, no hardcoded lengths, no colour assertions in tests
- **Compatibility**: NetBox-compatible data model must be preserved

## Key Decisions

| Decision                                       | Rationale                                              | Outcome   |
| ---------------------------------------------- | ------------------------------------------------------ | --------- |
| Defer YAML editor to v0.10.0                   | Auth/security is higher priority for self-hosted users | — Pending |
| Defer mobile enhancements to v0.10.0           | Stability before UX polish                             | — Pending |
| Generic OIDC over provider-specific OAuth      | Flexibility for self-hosters with any IdP              | — Pending |
| Shared TTL-backed session store over in-memory | Multi-instance deployment support                      | — Pending |

---

_Last updated: 2026-02-19 after initialization_
