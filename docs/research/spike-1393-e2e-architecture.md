# Spike #1393: E2E Testing Architecture — Summary

**Date:** 2026-03-08
**Issue:** [#1393](https://github.com/RackulaLives/Rackula/issues/1393)
**Research docs:** `1393-codebase.md`, `1393-external.md`, `1393-patterns.md`

---

## Executive Summary

Rackula's E2E test suite (23 spec files, ~3,875 LOC) has a solid foundation — stateless share-link fixtures, good test isolation, well-organised functional helpers — but suffers from **selector fragility**. ~75% of selectors use CSS class names, making tests brittle to any CSS refactoring. Only ~15% use stable semantic patterns (data-testid, getByRole). Of 34 existing `data-testid` attributes in components, only 6 are used in tests. Critical UI regions (rack canvas, device elements, drawers, context menus) lack test IDs entirely.

11 tests are disabled: 3 due to file chooser unreliability, 4 due to unimplemented UI features, 3 awaiting UX redesign (#903), and 1 due to complex multi-rack navigation.

The recommended path forward is an **incremental migration** from CSS class selectors to a hybrid `getByRole()` + `getByTestId()` strategy, starting with a `locators.ts` centralisation file and prioritising the 3 most-used helper modules.

## Key Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| POM or functional helpers? | **Keep functional helpers** | Single-page app; current pattern is right fit |
| Primary selector strategy? | **Hybrid: getByRole() + getByTestId()** | Role selectors for interactive elements test a11y; testids for SVG/structural |
| data-testid naming? | **kebab-case, `{scope}-{element}-{qualifier}`** | Matches project conventions |
| Fixture approach? | **Keep share-link, add factory builder** | Current system is excellent; factory adds flexibility |
| Migration approach? | **Incremental (4 phases)** | Low risk, immediate value |
| Strip testids in prod? | **No** | Near-zero cost, aids debugging |

## Research Outputs

- **[1393-codebase.md](./1393-codebase.md)** — Full catalogue of 23 spec files, 34 data-testid attributes, 7 helper modules, selector statistics, 11 disabled tests
- **[1393-external.md](./1393-external.md)** — Playwright best practices, POM vs functional helpers analysis, fixture strategies, Svelte E2E patterns, migration strategies
- **[1393-patterns.md](./1393-patterns.md)** — Trade-off analysis and recommended patterns for selectors, helpers, fixtures, and migration path
- **[Design doc](../plans/2026-03-08-e2e-architecture-design.md)** — Implementation plan with phased migration

## Relationship to Existing Issues

| Issue | Status | Relationship |
|-------|--------|-------------|
| #1228 | Open | Selector reliability — directly addressed by this spike's migration plan |
| #1226 | Open | Disabled test triage — root causes identified, fix strategies proposed |
| #1264 | Open | Workflow/dialog selectors — covered by Phase 2 testid additions |
| #1262 | Open | Responsive rewrite — independent, benefits from stable selectors |
| #1224 | Closed | waitForTimeout elimination — confirmed only 1 justified instance remains |
| #1263 | Closed | Device interaction selectors — addressed by device-actions.ts migration |
