/**
 * Helpers for the visual-regression suite (visual-regression.spec.ts).
 *
 * The goal is a deterministic screenshot every run: pin the theme via
 * localStorage before the app boots, clear any persisted layouts so the canvas
 * empty state renders, wait for the self-hosted fonts to finish loading, and let
 * the network settle before the shot.
 */
import type { Locator, Page } from "@playwright/test";
import { locators } from "./locators";

export type Theme = "dark" | "light";

/** Fixed viewport so layout and framing are stable across runs. */
export const VISUAL_VIEWPORT = { width: 1280, height: 720 } as const;

/**
 * Locators for on-screen regions whose text changes between builds or over
 * time (the app version string, "last saved" timestamps). Pass these to
 * toHaveScreenshot() as masks so they never trip the diff. A selector that
 * matches nothing in a given state simply masks nothing.
 */
export function dynamicMasks(page: Page): Locator[] {
  return [
    page.locator(locators.dynamic.version), // app version string in the app menu
    page.locator(locators.dynamic.layoutMeta), // "last saved" timestamps in layout lists
  ];
}

/**
 * Navigate to the app with a pinned theme and a clean storage slate, then wait
 * until it is visually settled (shell rendered, fonts loaded, network idle).
 *
 * @param path Relative URL. "/" for the empty-state canvas, "/?l=<share>" for a rack.
 */
export async function gotoVisual(
  page: Page,
  path: string,
  options: { theme?: Theme } = {},
): Promise<void> {
  const theme = options.theme ?? "dark";

  await page.addInitScript((t) => {
    try {
      localStorage.clear();
      localStorage.setItem("Rackula_theme", t);
    } catch {
      // Storage may be unavailable; the app falls back to its default theme.
    }
  }, theme);

  await page.setViewportSize(VISUAL_VIEWPORT);
  await page.goto(path);

  // Shell rendered: either the canvas empty state or a loaded rack.
  const ready = path.includes("?l=")
    ? page.locator(locators.rack.container).first()
    : page.locator(locators.welcomeScreen.root);
  await ready.waitFor({ state: "visible" });

  await settle(page);
  await neutralizeToasts(page);
}

/** Wait for fonts to finish loading and the network to go quiet. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");
}

/**
 * Hide the toast container so time-based toasts (e.g. "Shared layout loaded")
 * never land in a screenshot. The container is position: fixed and rendered
 * once, so hiding it does not reflow the page and also suppresses any later
 * toast (its children inherit the hidden container). Done over CDP via
 * evaluate, so it is not subject to the page's CSP.
 */
export async function neutralizeToasts(page: Page): Promise<void> {
  await page.evaluate(() => {
    const container = document.querySelector<HTMLElement>(".toast-container");
    if (container) {
      container.style.display = "none";
    }
  });
}
