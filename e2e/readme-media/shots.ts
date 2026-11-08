import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { locators } from "../helpers/locators";
import { neutralizeToasts } from "../helpers/visual";
import { FrameRecorder, type Point } from "./recorder";

/**
 * The README media shot list. To add a shot, add an entry to MEDIA_SHOTS.
 * Output is written under media-out/ and published to assets/readme/.
 */

export interface MediaShot {
  name: string;
  run(page: Page, out: string): Promise<void>;
}

// bottomU: a drop anchors the device's bottom U. Five devices fill an 8U rack.
// rearImage: the device is full depth, so its image also shows in the rear view.
export const RACK_DEVICES: {
  slug: string;
  search: string;
  bottomU: number;
  rearImage?: boolean;
}[] = [
  { slug: "ubiquiti-unifi-dream-machine-pro", search: "udm pro", bottomU: 8 },
  {
    slug: "ubiquiti-unifi-switch-48-pro-poe-gen2",
    search: "usw pro 48 poe",
    bottomU: 7,
  },
  { slug: "ubiquiti-unas-pro", search: "unas pro", bottomU: 5 },
  {
    slug: "dell-poweredge-r730xd",
    search: "r730xd",
    bottomU: 3,
    rearImage: true,
  },
  {
    slug: "apc-smt1500rmi2uc",
    search: "smt1500rmi2uc",
    bottomU: 1,
    rearImage: true,
  },
];

const RACK_HEIGHT = "8";
const FRONT_SVG = '[data-testid="rack-front"] .rack-svg';
const DT_KEY = "__mediaDataTransfer";
// DevicePalette debounces search by 150ms.
const SEARCH_SETTLE_MS = 200;

// Frames at 12 fps. One device takes 1 + 2 + 2 + 4 + 1 = 10 frames.
const FRAMES = {
  intro: 6,
  toSearch: 1,
  toRow: 2,
  drag: 4,
  toToggle: 6,
  hold: 28,
};

/** Fire a drag event at a point, on whatever is under it or a given target. */
async function fireDrag(
  page: Page,
  type: "dragover" | "drop",
  point: Point,
): Promise<void> {
  await page.evaluate(
    ({ type, point, key }) => {
      const target = document.elementFromPoint(point.x, point.y);
      target?.dispatchEvent(
        new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          dataTransfer: (window as unknown as Record<string, DataTransfer>)[
            key
          ],
          clientX: point.x,
          clientY: point.y,
        }),
      );
    },
    { type, point, key: DT_KEY },
  );
}

async function fireFromRow(
  page: Page,
  selector: string,
  type: "dragstart" | "dragend",
  point: Point,
): Promise<void> {
  await page.evaluate(
    ({ selector, type, point, key }) => {
      const store = window as unknown as Record<string, DataTransfer>;
      if (type === "dragstart") store[key] = new DataTransfer();
      document.querySelector(selector)?.dispatchEvent(
        new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          dataTransfer: store[key],
          clientX: point.x,
          clientY: point.y,
        }),
      );
    },
    { selector, type, point, key: DT_KEY },
  );
}

async function slotCentre(page: Page, u: number): Promise<Point> {
  const slots = page.locator(`${FRONT_SVG} rect.u-slot`);
  const count = await slots.count();
  const box = await slots.nth(count - u).boundingBox();
  if (!box) throw new Error(`No slot found for U${u}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function openEmptyRack(page: Page): Promise<void> {
  await page.goto("/");
  await page
    .locator(locators.rack.container)
    .first()
    .waitFor({ state: "visible" });
  await page.evaluate(() => document.fonts.ready);
  await neutralizeToasts(page);
  await page.getByRole("button", { name: "Dismiss hint" }).click();

  const height = page.getByLabel("Height", { exact: true });
  await height.fill(RACK_HEIGHT);
  await height.press("Tab");
  await page
    .getByRole("button", { name: /collapse/i })
    .last()
    .click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Fit all" }).dispatchEvent("click");
  await page.getByRole("button", { name: "Zoom in" }).dispatchEvent("click");
  await page.waitForLoadState("networkidle");
}

async function dragIntoRack(
  page: Page,
  recorder: FrameRecorder,
  device: (typeof RACK_DEVICES)[number],
): Promise<void> {
  const search = page.getByTestId("search-devices");
  const searchBox = await search.boundingBox();
  if (!searchBox) throw new Error("Device search is not visible");
  await recorder.moveCursor(
    { x: searchBox.x + 120, y: searchBox.y + searchBox.height / 2 },
    FRAMES.toSearch,
  );

  await search.fill(device.search.slice(0, 3));
  await recorder.snap();
  await search.fill(device.search);
  await page.waitForTimeout(SEARCH_SETTLE_MS);

  const selector = `[data-testid="device-palette-item"][data-device-slug="${device.slug}"]`;
  const row = page.locator(selector);
  await row
    .waitFor({ state: "visible", timeout: 5_000 })
    .catch(() =>
      Promise.reject(new Error(`Device not in palette: ${device.slug}`)),
    );
  await recorder.snap();

  const rowBox = await row.boundingBox();
  if (!rowBox) throw new Error(`Device row has no box: ${device.slug}`);
  const grab = { x: rowBox.x + 70, y: rowBox.y + rowBox.height / 2 };
  await recorder.moveCursor(grab, FRAMES.toRow);

  const target = await slotCentre(page, device.bottomU);
  await fireFromRow(page, selector, "dragstart", grab);
  await recorder.moveCursor(target, FRAMES.drag, (point) =>
    fireDrag(page, "dragover", point),
  );
  await fireDrag(page, "dragover", target);
  await fireDrag(page, "drop", target);
  await fireFromRow(page, selector, "dragend", target);
  await page.keyboard.press("Escape");
  await search.fill("");
  await search.blur();
  await page.waitForTimeout(SEARCH_SETTLE_MS);
  await recorder.snap();
}

/** Fail the capture if the rack is not what the images claim to show. */
async function assertPlaced(page: Page): Promise<void> {
  for (const device of RACK_DEVICES) {
    const placed = page.locator(
      `[data-testid="rack-front"] [data-device-id="${device.slug}"]`,
    );
    await expect(placed).toHaveAttribute(
      "aria-label",
      new RegExp(`at U${device.bottomU}\\b`),
    );
  }
}

/** True when a device shows an image on this rack face and it all decodes. */
function imageDecoded(
  page: Page,
  face: string,
  slug: string,
): Promise<boolean> {
  return page.evaluate(
    async ({ face, slug }) => {
      const images = document.querySelectorAll<SVGImageElement>(
        `[data-testid="rack-${face}"] [data-device-id="${slug}"] image`,
      );
      if (images.length === 0) return false;
      try {
        await Promise.all([...images].map((image) => image.decode()));
        return true;
      } catch {
        return false;
      }
    },
    { face, slug },
  );
}

async function assertImages(page: Page): Promise<void> {
  for (const device of RACK_DEVICES) {
    const faces = device.rearImage ? ["front", "rear"] : ["front"];
    for (const face of faces) {
      await expect
        .poll(() => imageDecoded(page, face, device.slug), {
          message: `No ${face} image for ${device.slug}`,
        })
        .toBe(true);
    }
  }
}

async function buildRack(page: Page, recorder: FrameRecorder): Promise<void> {
  await openEmptyRack(page);
  await recorder.installCursor();
  await recorder.snap(FRAMES.intro);

  for (const device of RACK_DEVICES) {
    await dragIntoRack(page, recorder, device);
  }
  await assertPlaced(page);

  const toggle = page.getByRole("button", { name: "Toggle display mode" });
  const toggleBox = await toggle.boundingBox();
  if (!toggleBox) throw new Error("Display mode toggle is not visible");
  await recorder.moveCursor(
    {
      x: toggleBox.x + toggleBox.width / 2,
      y: toggleBox.y + toggleBox.height / 2,
    },
    FRAMES.toToggle,
  );
  // dispatchEvent, so a real hover cannot leave a tooltip in the frame.
  await toggle.dispatchEvent("click");

  await assertImages(page);
}

export const MEDIA_SHOTS: MediaShot[] = [
  {
    name: "hero",
    async run(page, out) {
      const recorder = new FrameRecorder(page, join(out, "frames"));
      await buildRack(page, recorder);
      await recorder.snap(FRAMES.hold);
    },
  },
  {
    name: "rack",
    async run(page, out) {
      await buildRack(page, new FrameRecorder(page, null));
      await page.screenshot({
        path: join(out, "rack.png"),
        animations: "disabled",
        caret: "hide",
      });
    },
  },
];
