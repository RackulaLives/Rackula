/**
 * Helpers for the axe-core accessibility scan suite (axe.spec.ts, issue #2099).
 *
 * A guard rail: each scan runs axe-core against a rendered surface and fails the
 * test on any violation under the WCAG 2.2 AA rule set. It complements the
 * behavioural checks in accessibility.spec.ts (keyboard paths, focus trapping,
 * landmarks) rather than replacing them: axe catches the static, machine-
 * detectable failures (contrast, names, roles, attributes) across whole
 * surfaces, while the behavioural suite covers what axe cannot observe.
 *
 * Adding a scan when a new surface lands: open the surface in a test, then call
 * `expectNoA11yViolations(page, locator)` scoped to it. See the documented
 * pattern in docs/guides/TESTING.md.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * axe rule tags that map to WCAG 2.2 Level AA. axe groups rules by the standard
 * they enforce; scanning with exactly these tags fails CI on AA-level issues
 * without flagging AAA rules (which the project does not commit to) or best-
 * practice heuristics (which are advisory, not conformance failures).
 */
export const WCAG_22_AA_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22a",
  "wcag22aa",
] as const;

/**
 * Build an axe scanner pinned to the WCAG 2.2 AA rule set. Callers add
 * `.include(...)` / `.exclude(...)` / `.disableRules(...)` before `.analyze()`.
 */
export function axeBuilder(page: Page): AxeBuilder {
  return new AxeBuilder({ page }).withTags([...WCAG_22_AA_TAGS]);
}

/**
 * Rules baselined as known, pre-existing violations. Each entry MUST cite a
 * tracking issue so the debt is visible and time-bound, not silently ignored.
 *
 * Keep this list empty unless a surface genuinely cannot pass yet. A baseline is
 * a deferral, not a fix: prefer fixing the violation. When you add an entry, the
 * scan stops failing on that rule everywhere, so scope it as narrowly as
 * possible and remove it as soon as the linked issue closes.
 *
 * @example
 *   // export const BASELINED_RULES = {
 *   //   "color-contrast": "https://github.com/RackulaLives/Rackula/issues/NNNN",
 *   // } as const;
 */
export const BASELINED_RULES: Record<string, string> = {
  // Pre-existing violations found when the guard rail was first wired (#2099).
  // A baselined rule is disabled for ALL scans, so the guard rail still fails on
  // any non-baselined rule but will NOT catch a fresh violation of a baselined
  // rule (even on a new surface). That is the accepted cost of the baseline:
  // narrow the list, and remove each entry as soon as its issue closes so the
  // rule is enforced again everywhere.
  "aria-required-parent": "https://github.com/RackulaLives/Rackula/issues/2253",
  "aria-required-children":
    "https://github.com/RackulaLives/Rackula/issues/2254",
  "nested-interactive": "https://github.com/RackulaLives/Rackula/issues/2255",
  "color-contrast": "https://github.com/RackulaLives/Rackula/issues/2256",
};

/**
 * Run an axe scan on `selector` (a whole page or a single surface) and assert it
 * has no WCAG 2.2 AA violations. Baselined rules (see BASELINED_RULES) are
 * disabled so the guard rail enforces "no new violations" while known debt is
 * tracked separately.
 *
 * @param page     The Playwright page.
 * @param selector Optional CSS selector to scope the scan to one surface (a
 *   dialog, the sidebar). Omit to scan the full page. Scoping keeps a
 *   per-surface failure from masking the rest and makes the report point at the
 *   right component. axe's `.include()` takes a CSS selector, not a Playwright
 *   Locator, so pass the selector string (e.g. a `[data-testid="..."]` from the
 *   `locators` registry).
 */
export async function expectNoA11yViolations(
  page: Page,
  selector?: string,
): Promise<void> {
  let builder = axeBuilder(page);

  if (selector) {
    builder = builder.include(selector);
  }

  const baselined = Object.keys(BASELINED_RULES);
  if (baselined.length > 0) {
    builder = builder.disableRules(baselined);
  }

  const results = await builder.analyze();

  // Surface a readable summary in the failure message: which rule, how many
  // nodes, and a link to the axe rule docs. The raw results object is large and
  // unhelpful when a test fails in CI.
  const summary = results.violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.helpUrl,
    nodes: v.nodes.length,
    targets: v.nodes.flatMap((n) => n.target),
  }));

  expect(
    results.violations,
    `axe found ${results.violations.length} WCAG 2.2 AA violation(s):\n${JSON.stringify(summary, null, 2)}`,
  ).toEqual([]);
}
