/**
 * Custom Playwright test fixture that neutralizes the File System Access API.
 *
 * browser-fs-access checks 'showOpenFilePicker' in self at module load time.
 * In headless Chromium, the native API exists but hangs (no UI to show).
 * By removing showOpenFilePicker before any page scripts run, the library
 * falls back to anchor downloads which Playwright can intercept.
 *
 * All E2E tests should import { test, expect } from this file instead of
 * directly from @playwright/test.
 */
import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  context: async ({ context }, use) => {
    // browser-fs-access uses `'showOpenFilePicker' in self` (the `in` operator
    // checks property existence, not value). We must delete the property
    // entirely so the check returns false and the library uses anchor downloads.
    await context.addInitScript(
      `delete window.showOpenFilePicker; delete window.showSaveFilePicker; delete window.showDirectoryPicker;`,
    );
    await use(context);
  },
});

export { expect };
