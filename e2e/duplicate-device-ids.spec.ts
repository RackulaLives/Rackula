import { test, expect } from "./helpers/base-test";
import fs from "fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { gotoWithRack, clickLoad, locators } from "./helpers";

// Positions in internal units (6 per U): U1=6, U3=18, U5=30
const LAYOUT_YAML = `version: "0.7.6"
name: "Duplicate Device ID Layout"
racks:
  - id: "rack-1"
    name: "Test Rack"
    height: 42
    width: 19
    desc_units: false
    show_rear: true
    form_factor: "4-post-cabinet"
    starting_unit: 1
    position: 0
    devices:
      - id: "dupe-id"
        device_type: "test-server"
        position: 6
        face: "front"
      - id: "dupe-id"
        device_type: "test-switch"
        position: 30
        face: "front"
      - id: "unique-id"
        device_type: "test-server"
        position: 54
        face: "front"
device_types:
  - slug: "test-server"
    u_height: 2
    colour: "#4A7A8A"
    category: "server"
  - slug: "test-switch"
    u_height: 1
    colour: "#7B6BA8"
    category: "network"
settings:
  display_mode: "label"
  show_labels_on_images: false
`;

test.describe("Duplicate Device ID Handling (#1363)", () => {
  let zipPath: string | undefined;
  let tempDir: string | undefined;

  test.beforeAll(async () => {
    // Create a .Rackula.zip fixture with duplicate device IDs
    // Uses the folder structure: {name}-{uuid}/{slug}.rackula.yaml
    const zip = new JSZip();
    const folderName = "Duplicate Device ID Layout-00000000-0000-0000-0000-000000001363";
    zip.file(`${folderName}/duplicate-device-id-layout.rackula.yaml`, LAYOUT_YAML);

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rackula-dup-ids-"));
    zipPath = path.join(tempDir, "duplicate-device-ids-test.Rackula.zip");
    fs.writeFileSync(zipPath, zipBuffer);
  });

  test.afterAll(() => {
    if (zipPath && fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir);
    }
  });

  test.beforeEach(async ({ page }) => {
    await gotoWithRack(page);
  });

  test("loads layout with duplicate device IDs without crashing", async ({
    page,
  }) => {
    await expect(page.locator(locators.rack.container).first()).toBeVisible();

    // Listen for console errors — the Svelte each_key_duplicate error
    // would appear here before the fix
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Load the ZIP fixture with duplicate device IDs
    const fileChooserPromise = page.waitForEvent("filechooser");
    await clickLoad(page);
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(zipPath);

    // Wait for success toast — confirms load completed without crash
    await expect(page.locator(locators.toast.success)).toBeVisible({
      timeout: 10000,
    });

    // All 3 devices should render (the duplicate ID was regenerated, not dropped)
    await expect(page.locator(locators.rack.device).first()).toBeVisible({
      timeout: 5000,
    });
    const devices = await page.locator(locators.rack.device).count();
    expect(devices).toBe(3);

    // No each_key_duplicate errors
    const keyDupeErrors = consoleErrors.filter((e) =>
      e.includes("each_key_duplicate"),
    );
    expect(keyDupeErrors).toEqual([]);
  });
});
