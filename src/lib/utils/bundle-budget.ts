/**
 * Bundle budget evaluation (issue #2185).
 *
 * Pure threshold-comparison logic for the performance-budget CI gate. It takes
 * measured gzipped sizes of the initial-load graph and a committed budget, and
 * decides whether the build is within budget. Kept free of I/O so it is unit
 * testable; the measurement side (reading dist/, gzip) lives in
 * scripts/check-bundle-budget.ts.
 *
 * The gate watches the M14 shell (epic #2017): the side panel, tab strip,
 * dialog system, and command/app menus add UI surface, and this budget keeps
 * the initial-load bundle from regressing as those slices land.
 *
 * The threshold for an entry is baseline + headroom. The baseline is the raw
 * measured size of the current build (rewritten with --update); headroom is the
 * deliberate slack the shell is allowed to grow into. A separate tolerance
 * absorbs minifier and dependency noise so the gate fails on real regressions,
 * not rounding.
 */

/** The budgeted dimensions of the initial-load graph, in gzipped bytes. */
export interface Measurements {
  /** Entry JS plus all modulepreloaded JS chunks. */
  initialJs: number;
  /** Stylesheets linked from the entry HTML. */
  initialCss: number;
  /** initialJs + initialCss. */
  initialTotal: number;
}

export type BudgetEntry = keyof Measurements;

export interface BudgetConfig {
  /**
   * Slack added to every threshold before a measurement counts as a breach.
   * Absorbs the few-byte noise of minifier and dependency churn.
   */
  toleranceBytes: number;
  /** Raw measured size of the recorded baseline build, per entry. */
  baseline: Record<BudgetEntry, number>;
  /** Deliberate room each entry is allowed to grow over its baseline. */
  headroom: Record<BudgetEntry, number>;
}

export interface BudgetRow {
  entry: BudgetEntry;
  measured: number;
  baseline: number;
  threshold: number;
  /** threshold + tolerance - measured. Negative means over budget. */
  headroom: number;
  breached: boolean;
}

export interface BudgetBreach {
  entry: BudgetEntry;
  measured: number;
  threshold: number;
  /** How far the measurement is over the bare threshold (ignoring tolerance). */
  overBy: number;
}

export interface BudgetResult {
  passed: boolean;
  rows: BudgetRow[];
  breaches: BudgetBreach[];
}

const ENTRIES: BudgetEntry[] = ["initialJs", "initialCss", "initialTotal"];

/** The enforced threshold for an entry: its baseline plus its headroom. */
export function thresholdFor(budget: BudgetConfig, entry: BudgetEntry): number {
  return budget.baseline[entry] + budget.headroom[entry];
}

/**
 * Compare measured sizes against the budget. A measurement breaches only when
 * it exceeds its threshold (baseline + headroom) by more than the tolerance.
 */
export function evaluateBudget(
  measured: Measurements,
  budget: BudgetConfig,
): BudgetResult {
  const rows: BudgetRow[] = [];
  const breaches: BudgetBreach[] = [];

  for (const entry of ENTRIES) {
    const value = measured[entry];
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new Error(
        `Missing or invalid measurement for budgeted entry "${entry}"`,
      );
    }

    const threshold = thresholdFor(budget, entry);
    const limit = threshold + budget.toleranceBytes;
    const breached = value > limit;

    rows.push({
      entry,
      measured: value,
      baseline: budget.baseline[entry],
      threshold,
      headroom: limit - value,
      breached,
    });

    if (breached) {
      breaches.push({
        entry,
        measured: value,
        threshold,
        overBy: value - threshold,
      });
    }
  }

  return {
    passed: breaches.length === 0,
    rows,
    breaches,
  };
}
