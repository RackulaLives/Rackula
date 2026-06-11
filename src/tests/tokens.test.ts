import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Design Token System", () => {
  let tokensCSS: string;

  beforeAll(() => {
    // Read the tokens.css file content directly
    const tokensPath = resolve(__dirname, "../lib/styles/tokens.css");
    tokensCSS = readFileSync(tokensPath, "utf-8");
  });

  describe("Primitives - Spacing", () => {
    it("defines spacing scale from --space-0 to --space-12", () => {
      const spacings = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12];
      spacings.forEach((n) => {
        expect(tokensCSS).toContain(`--space-${n}:`);
      });
    });

    it("defines half-step spacing token for 6px gap", () => {
      expect(tokensCSS).toContain("--space-1-5:");
    });
  });

  describe("Primitives - Colors", () => {
    it("defines neutral color palette", () => {
      const neutrals = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
      neutrals.forEach((n) => {
        expect(tokensCSS).toContain(`--neutral-${n}:`);
      });
    });

    it("defines blue (primary) accent", () => {
      expect(tokensCSS).toContain("--blue-500:");
    });

    it("defines semantic color palette (red, green, amber)", () => {
      expect(tokensCSS).toContain("--red-500:");
      expect(tokensCSS).toContain("--green-500:");
      expect(tokensCSS).toContain("--amber-500:");
    });
  });

  describe("Primitives - Dracula Colors", () => {
    it("defines Dracula background tokens", () => {
      // Background scale (dark to light)
      expect(tokensCSS).toContain("--dracula-bg-darkest:");
      expect(tokensCSS).toContain("--dracula-bg-darker:");
      expect(tokensCSS).toContain("--dracula-bg:");
      expect(tokensCSS).toContain("--dracula-bg-light:");
      expect(tokensCSS).toContain("--dracula-bg-lighter:");
      expect(tokensCSS).toContain("--dracula-selection:");
    });

    it("defines Dracula text tokens", () => {
      expect(tokensCSS).toContain("--dracula-foreground:");
      expect(tokensCSS).toContain("--dracula-comment:");
    });

    it("defines Dracula accent tokens", () => {
      expect(tokensCSS).toContain("--dracula-purple:");
      expect(tokensCSS).toContain("--dracula-pink:");
      expect(tokensCSS).toContain("--dracula-cyan:");
      expect(tokensCSS).toContain("--dracula-green:");
      expect(tokensCSS).toContain("--dracula-orange:");
      expect(tokensCSS).toContain("--dracula-red:");
      expect(tokensCSS).toContain("--dracula-yellow:");
    });

    it("defines correct Dracula hex values", () => {
      // Verify exact official Dracula palette values (lowercase per prettier)
      expect(tokensCSS).toContain("#282a36"); // bg
      expect(tokensCSS).toContain("#f8f8f2"); // foreground
      expect(tokensCSS).toContain("#44475a"); // selection
      expect(tokensCSS).toContain("#6272a4"); // comment
      expect(tokensCSS).toContain("#bd93f9"); // purple
      expect(tokensCSS).toContain("#ff79c6"); // pink
      expect(tokensCSS).toContain("#8be9fd"); // cyan
      expect(tokensCSS).toContain("#50fa7b"); // green
      expect(tokensCSS).toContain("#ffb86c"); // orange
      expect(tokensCSS).toContain("#ff5555"); // red
      expect(tokensCSS).toContain("#f1fa8c"); // yellow
    });
  });

  describe("Primitives - Alucard Colors (Light Mode)", () => {
    it("defines Alucard background tokens in light mode section", () => {
      // Alucard backgrounds are defined in the [data-theme='light'] section
      expect(tokensCSS).toContain("--alucard-bg-darkest:");
      expect(tokensCSS).toContain("--alucard-bg-darker:");
      expect(tokensCSS).toContain("--alucard-bg:");
      expect(tokensCSS).toContain("--alucard-bg-light:");
      expect(tokensCSS).toContain("--alucard-bg-lighter:");
      expect(tokensCSS).toContain("--alucard-selection:");
    });

    it("defines Alucard text tokens", () => {
      expect(tokensCSS).toContain("--alucard-foreground:");
      expect(tokensCSS).toContain("--alucard-comment:");
    });

    it("defines Alucard accent tokens", () => {
      expect(tokensCSS).toContain("--alucard-purple:");
      expect(tokensCSS).toContain("--alucard-pink:");
      expect(tokensCSS).toContain("--alucard-cyan:");
      expect(tokensCSS).toContain("--alucard-green:");
      expect(tokensCSS).toContain("--alucard-orange:");
      expect(tokensCSS).toContain("--alucard-red:");
      expect(tokensCSS).toContain("--alucard-yellow:");
    });

    it("defines correct Alucard hex values", () => {
      // Verify key Alucard palette values (lowercase per prettier)
      expect(tokensCSS).toContain("#fffbeb"); // bg (warm cream)
      expect(tokensCSS).toContain("#1f1f1f"); // foreground
      expect(tokensCSS).toContain("#644ac9"); // purple (darkened)
      expect(tokensCSS).toContain("#036a96"); // cyan (darkened)
      expect(tokensCSS).toContain("#14710a"); // green (darkened)
      expect(tokensCSS).toContain("#cb3a2a"); // red (darkened)
    });
  });

  describe("Primitives - Typography", () => {
    it("defines font size scale", () => {
      const sizes = ["2xs", "xs", "sm", "base", "md", "lg", "xl", "2xl"];
      sizes.forEach((size) => {
        expect(tokensCSS).toContain(`--font-size-${size}:`);
      });
    });

    it("defines font weight scale", () => {
      const weights = ["normal", "medium", "semibold", "bold"];
      weights.forEach((weight) => {
        expect(tokensCSS).toContain(`--font-weight-${weight}:`);
      });
    });
  });

  describe("Primitives - Borders and Shadows", () => {
    it("defines border radius scale", () => {
      const radii = ["sm", "md", "lg", "full"];
      radii.forEach((r) => {
        expect(tokensCSS).toContain(`--radius-${r}:`);
      });
    });

    it("defines shadow scale", () => {
      const shadows = ["sm", "md", "lg"];
      shadows.forEach((s) => {
        expect(tokensCSS).toContain(`--shadow-${s}:`);
      });
    });
  });

  describe("Primitives - Timing", () => {
    it("defines duration tokens", () => {
      const durations = ["fast", "normal", "slow"];
      durations.forEach((d) => {
        expect(tokensCSS).toContain(`--duration-${d}:`);
      });
    });

    it("defines easing tokens", () => {
      const easings = ["out", "in-out", "spring"];
      easings.forEach((e) => {
        expect(tokensCSS).toContain(`--ease-${e}:`);
      });
    });
  });

  describe("Semantic Tokens", () => {
    it("defines background tokens", () => {
      expect(tokensCSS).toContain("--colour-bg:");
      expect(tokensCSS).toContain("--colour-surface:");
    });

    it("defines text tokens", () => {
      expect(tokensCSS).toContain("--colour-text:");
      expect(tokensCSS).toContain("--colour-text-muted:");
    });

    it("defines border tokens", () => {
      expect(tokensCSS).toContain("--colour-border:");
    });

    it("defines interactive tokens", () => {
      expect(tokensCSS).toContain("--colour-selection:");
      expect(tokensCSS).toContain("--colour-focus-ring:");
    });

    it("defines drag and drop tokens", () => {
      expect(tokensCSS).toContain("--colour-dnd-valid:");
      expect(tokensCSS).toContain("--colour-dnd-invalid:");
    });
  });

  describe("Component Tokens", () => {
    it("defines rack tokens", () => {
      expect(tokensCSS).toContain("--rack-width:");
      expect(tokensCSS).toContain("--rack-u-height:");
    });

    it("defines toolbar tokens", () => {
      expect(tokensCSS).toContain("--toolbar-height:");
    });

    it("defines drawer tokens", () => {
      expect(tokensCSS).toContain("--drawer-width:");
    });
  });

  describe("Theme Support", () => {
    it("has dark theme defaults in :root using Dracula primitives", () => {
      // Dark theme is the default in :root, using Dracula primitives
      expect(tokensCSS).toContain(":root {");
      expect(tokensCSS).toContain("--colour-bg: var(--dracula-bg)");
      expect(tokensCSS).toContain("--colour-text: var(--dracula-foreground)");
      // Selection uses pink (not purple) to avoid conflict with network device colour
      // CSS may have multi-line var() declarations, so check parts separately
      expect(tokensCSS).toMatch(
        /--colour-selection:\s*var\(\s*--dracula-pink\s*\)/,
      );
    });

    it("has light theme overrides using Alucard primitives", () => {
      expect(tokensCSS).toMatch(/\[data-theme="light"\]/);
      // Verify light theme defines Alucard primitives
      expect(tokensCSS).toContain('[data-theme="light"]');
      expect(tokensCSS).toContain("--alucard-bg:");
      expect(tokensCSS).toContain("--alucard-foreground:");
    });
  });
});
