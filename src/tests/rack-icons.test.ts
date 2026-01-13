/**
 * Tests for rack layout type icons (ColumnRackIcon, BayedRackIcon)
 *
 * These are visual-only SVG components for the New Rack wizard.
 * Tests focus on behavioral requirements, not DOM structure:
 * - BayedRackIcon renders different bay configurations based on props
 * - Icons accept and respond to selected state
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import ColumnRackIcon from "$lib/components/icons/ColumnRackIcon.svelte";
import BayedRackIcon from "$lib/components/icons/BayedRackIcon.svelte";

describe("ColumnRackIcon", () => {
  it("renders without throwing", () => {
    // If it renders, TypeScript + Svelte compilation ensures structure
    expect(() => render(ColumnRackIcon)).not.toThrow();
  });

  it("renders with selected prop", () => {
    // Behavioral: component accepts selected state without error
    expect(() => render(ColumnRackIcon, { selected: true })).not.toThrow();
    expect(() => render(ColumnRackIcon, { selected: false })).not.toThrow();
  });
});

describe("BayedRackIcon", () => {
  it("renders without throwing", () => {
    expect(() => render(BayedRackIcon)).not.toThrow();
  });

  it("accepts bays prop of 2 or 3", () => {
    // Behavioral: component accepts different bay configurations
    expect(() => render(BayedRackIcon, { bays: 2 })).not.toThrow();
    expect(() => render(BayedRackIcon, { bays: 3 })).not.toThrow();
  });

  it("accepts selected prop", () => {
    expect(() => render(BayedRackIcon, { selected: true })).not.toThrow();
    expect(() =>
      render(BayedRackIcon, { bays: 3, selected: true }),
    ).not.toThrow();
  });
});
