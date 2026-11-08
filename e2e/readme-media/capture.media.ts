import { join } from "node:path";
import { test } from "../helpers/base-test";
import { MEDIA_SHOTS } from "./shots";

/**
 * Captures the README media. Not a test suite: this file is named so that the
 * e2e configs do not pick it up. Run it with npm run media:capture.
 */
const OUT = join(process.cwd(), "media-out");

for (const shot of MEDIA_SHOTS) {
  test(shot.name, async ({ page }) => {
    await shot.run(page, OUT);
  });
}
