# Requirements: Rackula v0.9.0

**Defined:** 2026-02-19
**Core Value:** Users can design rack layouts visually in the browser with zero friction — auth/security must not degrade the core design experience.

## v1 Requirements

### Authentication

- [ ] **AUTH-01**: User can authenticate via generic OIDC provider (Authentik, Authelia, Keycloak, etc.) — #1102
- [x] **AUTH-02**: Self-hosters have documentation for authentication setup and hardening — #1107

### Session Management

- [x] **SESS-01**: Session store uses shared TTL-backed storage (replacing in-memory Map) — #1269

### API Hardening

- [ ] **API-01**: Self-hosted API meets security hardening baseline (epic #1274)
- [ ] **API-02**: Brand-pack images have automated manifest integrity checks — #1189

### CI/CD Hardening

- [ ] **CI-01**: Required PR/push validation workflow gates merges — #1278
- [ ] **CI-02**: Deploy-prod trigger and tag/ref guards prevent accidental releases — #1279
- [ ] **CI-03**: Claude workflow trust boundary and permissions are tightened — #1280

### E2E Test Stability

- [ ] **E2E-01**: Workflow/dialog spec selectors are updated to match current UI — #1264
- [ ] **E2E-02**: Device interaction spec selectors are updated to match current UI — #1263
- [ ] **E2E-03**: responsive.spec.ts is rewritten against current toolbar/sidebar UI — #1262
- [ ] **E2E-04**: Save filename assertions updated (.Rackula.zip → {name}-{uuid}.zip) — #1261
- [ ] **E2E-05**: Selectors use data-testid and role-based patterns for reliability — #1228
- [ ] **E2E-06**: All waitForTimeout calls are eliminated in favour of explicit waits — #1224
- [ ] **E2E-07**: False-positive tests are identified and fixed — #1229

### Bug Fixes

- [ ] **BUG-01**: Shared bayed rack URL correctly loads all bays (not just first bay as column rack) — #1207
- [ ] **BUG-02**: Persistence degrades gracefully offline after /api/layouts failures — #1088
- [ ] **BUG-03**: setup.test.ts no longer fails with effect_update_depth_exceeded — #751

### Housekeeping

- [ ] **HK-01**: v0.8.x milestone hygiene and carryover cleanup completed — #1273

## v2 Requirements

### Authentication (deferred)

- **AUTH-03**: User can authenticate with local username/password — #1117
- **AUTH-04**: Authentication events are logged for security monitoring — #1104

### E2E Coverage (deferred)

- **E2E-08**: Undo/redo E2E coverage — #1227
- **E2E-09**: Multi-rack and bayed rack E2E coverage — #1230
- **E2E-10**: Accessibility E2E coverage — #1231
- **E2E-11**: Disabled test triage — #1226

### YAML Editor (deferred to v0.10.0)

- **YAML-01**: In-app YAML viewer — #1175
- **YAML-02**: YAML edit/apply flow with schema validation — #1176
- **YAML-03**: Lazy-load and startup budget guardrails — #1177
- **YAML-04**: Inline YAML diagnostics — #1178

### Mobile (deferred to v0.10.0)

- **MOB-01**: Device library touch optimisation — #1052
- **MOB-02**: Orientation change handling — #1051
- **MOB-03**: Selection feedback improvements — #1050

## Out of Scope

| Feature                        | Reason                                                 |
| ------------------------------ | ------------------------------------------------------ |
| Local auth (username/password) | Deferred to v2 — OIDC covers self-hosted auth needs    |
| Auth event logging             | Deferred to v2 — nice-to-have, not blocking            |
| MFA/2FA                        | OIDC providers handle this upstream                    |
| User management UI             | Admin manages via API/database directly                |
| Social login (Google, GitHub)  | Generic OIDC covers this                               |
| Role-based access control      | All authenticated users have equal access              |
| YAML editor                    | Deferred to v0.10.0 — auth/security is higher priority |
| Mobile enhancements            | Deferred to v0.10.0 — stability before UX polish       |
| New E2E coverage areas         | Deferred — stability fixes first, then new coverage    |

## Traceability

| Requirement | Phase   | Status   |
| ----------- | ------- | -------- |
| SESS-01     | Phase 1 | Complete |
| AUTH-01     | Phase 1 | Partial  |
| AUTH-02     | Phase 1 | Complete |
| API-01      | Phase 2 | Pending  |
| API-02      | Phase 2 | Pending  |
| CI-01       | Phase 3 | Pending  |
| CI-02       | Phase 3 | Pending  |
| CI-03       | Phase 3 | Pending  |
| E2E-01      | Phase 4 | Pending  |
| E2E-02      | Phase 4 | Pending  |
| E2E-03      | Phase 4 | Pending  |
| E2E-04      | Phase 4 | Pending  |
| E2E-05      | Phase 4 | Pending  |
| E2E-06      | Phase 4 | Pending  |
| E2E-07      | Phase 4 | Pending  |
| BUG-01      | Phase 5 | Pending  |
| BUG-02      | Phase 5 | Pending  |
| BUG-03      | Phase 5 | Pending  |
| HK-01       | Phase 6 | Pending  |

**Coverage:**

- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---

_Requirements defined: 2026-02-19_
_Last updated: 2026-02-21 after Phase 1 merged into Phase 2 (renumbered to 6 phases)_
