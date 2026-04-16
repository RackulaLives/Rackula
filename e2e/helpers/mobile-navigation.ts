import { expect, type Page } from "@playwright/test";

export async function openDeviceLibraryFromBottomNav(page: Page) {
  const devicesTab = page.getByRole("button", { name: "Devices" });
  await expect(devicesTab).toBeVisible();
  // Use .click() instead of .tap() — dev config runs Desktop Chrome without hasTouch
  await devicesTab.click();
}
