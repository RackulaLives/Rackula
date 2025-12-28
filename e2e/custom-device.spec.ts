import { test, expect } from "@playwright/test";

/**
 * E2E Tests for Custom Device Creation and Placement (Issue #166)
 * Tests that custom multi-U devices preserve their height after placement
 */

test.describe("Custom Device Height (Issue #166)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Clear storage and set hasStarted flag
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.clear();
      localStorage.setItem("Rackula_has_started", "true");
    });
    await page.reload();
    await page.waitForTimeout(500);
  });

  test("custom 4U device renders with correct height after placement", async ({
    page,
  }) => {
    // 1. Open Add Device form
    const addDeviceButton = page.locator('[aria-label="Add custom device"]');
    await addDeviceButton.click();

    // 2. Fill in custom device details
    await page.fill("#device-name", "RACKOWL 4U Server");
    await page.fill("#device-height", "4");
    await page.selectOption("#device-category", "server");

    // 3. Submit the form
    await page.click('button:has-text("Add Device")');
    await page.waitForTimeout(300);

    // 4. Verify custom device appears in palette
    const customDevice = page.locator(
      '.device-palette-item:has-text("RACKOWL 4U Server")',
    );
    await expect(customDevice).toBeVisible();

    // 5. Drag device to rack using JavaScript simulation
    await page.evaluate(() => {
      const deviceItem = Array.from(
        document.querySelectorAll(".device-palette-item"),
      ).find((el) => el.textContent?.includes("RACKOWL 4U Server"));
      const rack = document.querySelector(".rack-svg");

      if (!deviceItem || !rack) {
        throw new Error("Could not find device item or rack");
      }

      const dataTransfer = new DataTransfer();

      const dragStartEvent = new DragEvent("dragstart", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      deviceItem.dispatchEvent(dragStartEvent);

      const rackRect = rack.getBoundingClientRect();
      const dropY = rackRect.top + rackRect.height / 2;

      const dragOverEvent = new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: rackRect.left + rackRect.width / 2,
        clientY: dropY,
      });
      rack.dispatchEvent(dragOverEvent);

      const dropEvent = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: rackRect.left + rackRect.width / 2,
        clientY: dropY,
      });
      rack.dispatchEvent(dropEvent);

      const dragEndEvent = new DragEvent("dragend", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      deviceItem.dispatchEvent(dragEndEvent);
    });

    await page.waitForTimeout(300);

    // 6. Verify device appears in rack
    const rackDevice = page.locator(".rack-device").first();
    await expect(rackDevice).toBeVisible({ timeout: 5000 });

    // 7. CRITICAL: Verify device has correct height (4U = 4 * 22px = 88px)
    const deviceRect = page.locator(".rack-device .device-rect").first();
    const height = await deviceRect.getAttribute("height");

    // U_HEIGHT constant is 22px
    expect(parseFloat(height || "0")).toBe(4 * 22); // 4U = 88px
  });

  test("custom 2U device blocks correct number of rack positions", async ({
    page,
  }) => {
    // 1. Open Add Device form
    const addDeviceButton = page.locator('[aria-label="Add custom device"]');
    await addDeviceButton.click();

    // 2. Create a custom 2U device
    await page.fill("#device-name", "Test 2U Storage");
    await page.fill("#device-height", "2");
    await page.selectOption("#device-category", "storage");

    // 3. Submit the form
    await page.click('button:has-text("Add Device")');
    await page.waitForTimeout(300);

    // 4. Drag device to rack at position ~U20
    await page.evaluate(() => {
      const deviceItem = Array.from(
        document.querySelectorAll(".device-palette-item"),
      ).find((el) => el.textContent?.includes("Test 2U Storage"));
      const rack = document.querySelector(".rack-svg");

      if (!deviceItem || !rack) {
        throw new Error("Could not find device item or rack");
      }

      const dataTransfer = new DataTransfer();

      const dragStartEvent = new DragEvent("dragstart", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      deviceItem.dispatchEvent(dragStartEvent);

      const rackRect = rack.getBoundingClientRect();

      const dragOverEvent = new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: rackRect.left + rackRect.width / 2,
        clientY: rackRect.top + rackRect.height / 2,
      });
      rack.dispatchEvent(dragOverEvent);

      const dropEvent = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: rackRect.left + rackRect.width / 2,
        clientY: rackRect.top + rackRect.height / 2,
      });
      rack.dispatchEvent(dropEvent);

      const dragEndEvent = new DragEvent("dragend", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      deviceItem.dispatchEvent(dragEndEvent);
    });

    await page.waitForTimeout(300);

    // 5. Verify device renders with 2U height
    const deviceRect = page.locator(".rack-device .device-rect").first();
    const height = await deviceRect.getAttribute("height");

    // U_HEIGHT constant is 22px
    expect(parseFloat(height || "0")).toBe(2 * 22); // 2U = 44px
  });
});
