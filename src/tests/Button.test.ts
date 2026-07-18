/**
 * Regression test for #3008: dialog CTAs across the app previously painted
 * destructive actions with the raw bright --colour-error token instead of
 * the dedicated muted --colour-button-destructive token (BRAND.md forbids
 * neon accents as button fills). The shared Button component is now the
 * single place that declares CTA colours, so this asserts the token
 * reference by name, not a resolved colour value, following the pattern
 * already used by src/tests/reducedMotion.test.ts for CSS-level assertions.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const buttonSource = readFileSync(
  join(__dirname, "../lib/components/ui/Button.svelte"),
  "utf-8",
);

describe("Button destructive variant token usage", () => {
  it("references the dedicated --colour-button-destructive token, not a raw error token", () => {
    const destructiveRule = buttonSource.match(/\.btn-destructive\s*{[^}]*}/);
    expect(destructiveRule).not.toBeNull();
    expect(destructiveRule![0]).toContain("var(--colour-button-destructive)");
    expect(destructiveRule![0]).not.toMatch(/--colour-error\b/);
  });

  it("references the dedicated --colour-button-primary token, not a raw selection token", () => {
    const primaryRule = buttonSource.match(/\.btn-primary\s*{[^}]*}/);
    expect(primaryRule).not.toBeNull();
    expect(primaryRule![0]).toContain("var(--colour-button-primary)");
    expect(primaryRule![0]).not.toMatch(/--colour-selection\b/);
  });
});
