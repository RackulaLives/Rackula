import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Read the CSS files directly
const appCss = readFileSync(join(__dirname, "../app.css"), "utf-8");
const animationsCss = readFileSync(
  join(__dirname, "../lib/styles/animations.css"),
  "utf-8",
);

describe("Animation System", () => {
  describe("Animation Keyframes in app.css", () => {
    it("device-settle keyframe is defined", () => {
      expect(appCss).toContain("@keyframes device-settle");
    });

    it("drawer-slide-in-left keyframe is defined", () => {
      expect(appCss).toContain("@keyframes drawer-slide-in-left");
    });

    it("drawer-slide-in-right keyframe is defined", () => {
      expect(appCss).toContain("@keyframes drawer-slide-in-right");
    });

    it("toast-slide-up keyframe is defined", () => {
      expect(appCss).toContain("@keyframes toast-slide-up");
    });

    it("dialog-fade-in keyframe is defined", () => {
      expect(appCss).toContain("@keyframes dialog-fade-in");
    });

    it("dialog-scale-in keyframe is defined", () => {
      expect(appCss).toContain("@keyframes dialog-scale-in");
    });

    it("selection-pulse keyframe is defined", () => {
      expect(appCss).toContain("@keyframes selection-pulse");
    });

    it("shake keyframe is defined", () => {
      expect(appCss).toContain("@keyframes shake");
    });
  });

  describe("Animation Classes in app.css", () => {
    it("device-just-dropped class is defined with animation", () => {
      expect(appCss).toContain(".device-just-dropped");
      expect(appCss).toMatch(
        /\.device-just-dropped\s*\{[^}]*animation:\s*device-settle/,
      );
    });

    it("drawer-left class is defined with animation", () => {
      expect(appCss).toContain(".drawer-left");
      expect(appCss).toMatch(
        /\.drawer-left\s*\{[^}]*animation:\s*drawer-slide-in-left/,
      );
    });

    it("drawer-right class is defined with animation", () => {
      expect(appCss).toContain(".drawer-right");
      expect(appCss).toMatch(
        /\.drawer-right\s*\{[^}]*animation:\s*drawer-slide-in-right/,
      );
    });

    it("toast-enter class is defined with animation", () => {
      expect(appCss).toContain(".toast-enter");
      expect(appCss).toMatch(
        /\.toast-enter\s*\{[^}]*animation:\s*toast-slide-up/,
      );
    });

    it("error-shake class is defined with animation", () => {
      expect(appCss).toContain(".error-shake");
      expect(appCss).toMatch(/\.error-shake\s*\{[^}]*animation:\s*shake/);
    });

    it("dialog-backdrop class is defined with animation", () => {
      expect(appCss).toContain(".dialog-backdrop");
      expect(appCss).toMatch(
        /\.dialog-backdrop\s*\{[^}]*animation:\s*dialog-fade-in/,
      );
    });

    it("dialog class is defined with animation", () => {
      expect(appCss).toContain(".dialog {");
      expect(appCss).toMatch(/\.dialog\s*\{[^}]*animation:\s*dialog-scale-in/);
    });
  });

  describe("Device Settle Animation Properties", () => {
    it("device-settle animation has scale transform", () => {
      const keyframeMatch = appCss.match(
        /@keyframes device-settle\s*\{[\s\S]*?\n\}/,
      );
      expect(keyframeMatch).not.toBeNull();
      expect(keyframeMatch![0]).toContain("scale");
    });

    it("device-settle animation has opacity transition", () => {
      const keyframeMatch = appCss.match(
        /@keyframes device-settle\s*\{[\s\S]*?\n\}/,
      );
      expect(keyframeMatch).not.toBeNull();
      expect(keyframeMatch![0]).toContain("opacity");
    });

    it("device-just-dropped uses spring easing", () => {
      expect(appCss).toMatch(/\.device-just-dropped\s*\{[^}]*--ease-spring/);
    });
  });

  describe("Animation Uses Design Tokens", () => {
    it("animations use --duration-normal token", () => {
      expect(appCss).toMatch(/animation:.*var\(--duration-normal\)/);
    });

    it("animations use --duration-fast token", () => {
      expect(appCss).toMatch(/animation:.*var\(--duration-fast\)/);
    });

    it("animations use --ease-out token", () => {
      expect(appCss).toMatch(/animation:.*var\(--ease-out\)/);
    });

    it("device-settle animation uses --ease-spring token", () => {
      expect(appCss).toMatch(
        /\.device-just-dropped\s*\{[^}]*var\(--ease-spring\)/,
      );
    });
  });
});

describe("Semantic Animation Token System (animations.css)", () => {
  describe("Duration Tokens", () => {
    it("defines celebration animation tokens", () => {
      expect(animationsCss).toContain("--anim-rainbow:");
      expect(animationsCss).toContain("--anim-party:");
      expect(animationsCss).toContain("--anim-party-duration:");
    });

    it("defines loading animation tokens", () => {
      expect(animationsCss).toContain("--anim-loading:");
      expect(animationsCss).toContain("--anim-shimmer:");
    });

    it("defines feedback animation tokens", () => {
      expect(animationsCss).toContain("--anim-success-glow:");
      expect(animationsCss).toContain("--anim-toast-exit:");
      expect(animationsCss).toContain("--anim-drag-settle:");
    });

    it("uses correct duration values", () => {
      expect(animationsCss).toContain("--anim-rainbow: 6s");
      expect(animationsCss).toContain("--anim-loading: 2s");
      expect(animationsCss).toContain("--anim-shimmer: 2s");
      expect(animationsCss).toContain("--anim-party: 0.5s");
      expect(animationsCss).toContain("--anim-party-duration: 5s");
    });
  });

  describe("Celebration Keyframes", () => {
    it("defines shimmer keyframe", () => {
      expect(animationsCss).toContain("@keyframes shimmer");
      expect(animationsCss).toContain("background-position");
    });

    it("defines breathing animations", () => {
      expect(animationsCss).toContain("@keyframes breathe");
      expect(animationsCss).toContain("@keyframes pulse-scale");
    });

    it("defines success glow keyframe", () => {
      expect(animationsCss).toContain("@keyframes success-glow");
    });

    it("defines toast slide animations", () => {
      expect(animationsCss).toContain("@keyframes slideIn");
      expect(animationsCss).toContain("@keyframes slideOut");
      expect(animationsCss).toContain("translateX");
    });

    it("defines logo slot animations", () => {
      expect(animationsCss).toContain("@keyframes slot-fill");
      expect(animationsCss).toContain("@keyframes slot-pulse");
    });

    it("defines party mode animations", () => {
      expect(animationsCss).toContain("@keyframes wobble");
      expect(animationsCss).toContain("@keyframes rainbow-border");
    });

    it("defines drop zone feedback animations", () => {
      expect(animationsCss).toContain("@keyframes pulse-border");
      expect(animationsCss).toContain("@keyframes flash-invalid");
    });
  });

  describe("Rainbow Border Animation", () => {
    it("cycles through all Dracula accent colours", () => {
      expect(animationsCss).toContain("#bd93f9"); // purple
      expect(animationsCss).toContain("#ff79c6"); // pink
      expect(animationsCss).toContain("#8be9fd"); // cyan
      expect(animationsCss).toContain("#50fa7b"); // green
      expect(animationsCss).toContain("#ffb86c"); // orange
      expect(animationsCss).toContain("#ff5555"); // red
      expect(animationsCss).toContain("#f1fa8c"); // yellow
    });
  });

  describe("Reduced Motion Support", () => {
    it("includes prefers-reduced-motion media query", () => {
      expect(animationsCss).toContain(
        "@media (prefers-reduced-motion: reduce)",
      );
    });

    it("reduces animation duration to near-zero", () => {
      expect(animationsCss).toContain("animation-duration: 0.01ms !important");
    });

    it("reduces transition duration to near-zero", () => {
      expect(animationsCss).toContain("transition-duration: 0.01ms !important");
    });

    it("limits animation iteration count", () => {
      expect(animationsCss).toContain(
        "animation-iteration-count: 1 !important",
      );
    });
  });
});
