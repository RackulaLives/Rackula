/**
 * Bundle Budget Evaluation Tests
 *
 * Tests the pure threshold-comparison and diffing logic that backs the
 * performance-budget CI gate (issue #2185). The measurement side (gzip, reading
 * dist/) is I/O and lives in scripts/check-bundle-budget.ts; only the decision
 * logic is tested here because that is where the behaviour lives.
 *
 * The enforced threshold for an entry is baseline + headroom; a measurement
 * breaches only when it exceeds that threshold by more than the tolerance.
 */

import { describe, it, expect } from "vitest";
import {
  evaluateBudget,
  parseBudgetConfig,
  thresholdFor,
} from "$lib/utils/bundle-budget";
import type { BudgetConfig, Measurements } from "$lib/utils/bundle-budget";

// initialJs threshold = 190_000 + 10_000 = 200_000
// initialCss threshold = 24_000 + 6_000 = 30_000
// initialTotal threshold = 214_000 + 16_000 = 230_000
const budget: BudgetConfig = {
  toleranceBytes: 1024,
  baseline: {
    initialJs: 190_000,
    initialCss: 24_000,
    initialTotal: 214_000,
  },
  headroom: {
    initialJs: 10_000,
    initialCss: 6_000,
    initialTotal: 16_000,
  },
};

describe("evaluateBudget", () => {
  it("derives the threshold as baseline plus headroom", () => {
    expect(thresholdFor(budget, "initialJs")).toBe(200_000);
    expect(thresholdFor(budget, "initialCss")).toBe(30_000);
    expect(thresholdFor(budget, "initialTotal")).toBe(230_000);
  });

  it("passes when every measurement is under its threshold", () => {
    const measured: Measurements = {
      initialJs: 150_000,
      initialCss: 24_000,
      initialTotal: 174_000,
    };

    const result = evaluateBudget(measured, budget);

    expect(result.passed).toBe(true);
    expect(result.breaches).toEqual([]);
  });

  it("fails and reports the breaching entry when a measurement exceeds threshold + tolerance", () => {
    const measured: Measurements = {
      initialJs: 250_000, // well over 200_000 + 1024
      initialCss: 24_000,
      initialTotal: 274_000, // also over, but we assert on the JS breach
    };

    const result = evaluateBudget(measured, budget);

    expect(result.passed).toBe(false);
    const jsBreach = result.breaches.find((b) => b.entry === "initialJs");
    expect(jsBreach).toBeDefined();
    expect(jsBreach?.measured).toBe(250_000);
    expect(jsBreach?.threshold).toBe(200_000);
    expect(jsBreach?.overBy).toBe(50_000);
  });

  it("tolerates a measurement that exceeds the threshold but stays within tolerance", () => {
    const measured: Measurements = {
      initialJs: 200_500, // 500 over threshold, within 1024 tolerance
      initialCss: 24_000,
      initialTotal: 224_500,
    };

    const result = evaluateBudget(measured, budget);

    expect(result.passed).toBe(true);
    expect(result.breaches).toEqual([]);
  });

  it("fails once a measurement exceeds the threshold by more than the tolerance", () => {
    const measured: Measurements = {
      initialJs: 201_500, // 1500 over threshold, beyond 1024 tolerance
      initialCss: 24_000,
      initialTotal: 225_500,
    };

    const result = evaluateBudget(measured, budget);

    expect(result.passed).toBe(false);
    expect(result.breaches.map((b) => b.entry)).toContain("initialJs");
  });

  it("reports a row for every budget entry regardless of pass or fail", () => {
    const measured: Measurements = {
      initialJs: 150_000,
      initialCss: 24_000,
      initialTotal: 174_000,
    };

    const result = evaluateBudget(measured, budget);

    expect(result.rows.map((r) => r.entry).sort()).toEqual(
      ["initialCss", "initialJs", "initialTotal"].sort(),
    );
    for (const row of result.rows) {
      expect(row.headroom).toBe(
        row.threshold + budget.toleranceBytes - row.measured,
      );
    }
  });

  it("throws when the measurements are missing a budgeted entry", () => {
    const incomplete = {
      initialJs: 150_000,
      initialCss: 24_000,
      // initialTotal missing
    } as Measurements;

    expect(() => evaluateBudget(incomplete, budget)).toThrow(/initialTotal/);
  });
});

describe("parseBudgetConfig", () => {
  const valid = {
    toleranceBytes: 5120,
    baseline: { initialJs: 329099, initialCss: 23868, initialTotal: 352967 },
    headroom: { initialJs: 30000, initialCss: 8000, initialTotal: 38000 },
  };

  it("returns a typed config when every field is a finite number", () => {
    const config = parseBudgetConfig(valid);
    expect(config.toleranceBytes).toBe(5120);
    expect(thresholdFor(config, "initialJs")).toBe(329099 + 30000);
  });

  it("rejects a non-numeric tolerance so a typo cannot disable breach detection", () => {
    const bad = { ...valid, toleranceBytes: "5120" };
    expect(() => parseBudgetConfig(bad)).toThrow(/toleranceBytes/);
  });

  it("rejects a negative tolerance", () => {
    const bad = { ...valid, toleranceBytes: -1 };
    expect(() => parseBudgetConfig(bad)).toThrow(/toleranceBytes/);
  });

  it("rejects a non-numeric baseline value", () => {
    const bad = {
      ...valid,
      baseline: { ...valid.baseline, initialJs: "329099" },
    };
    expect(() => parseBudgetConfig(bad)).toThrow(/baseline\.initialJs/);
  });

  it("rejects a missing headroom entry", () => {
    const bad = {
      toleranceBytes: 5120,
      baseline: valid.baseline,
      headroom: { initialJs: 30000, initialCss: 8000 }, // initialTotal missing
    };
    expect(() => parseBudgetConfig(bad)).toThrow(/headroom\.initialTotal/);
  });

  it("rejects a non-object budget", () => {
    expect(() => parseBudgetConfig(null)).toThrow();
    expect(() => parseBudgetConfig("nope")).toThrow();
  });
});
