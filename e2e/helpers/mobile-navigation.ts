import { expect, type Page } from "@playwright/test";

export async function openDeviceLibraryFromBottomNav(page: Page) {
  const devicesTab = page.getByRole("button", { name: "Devices" });
  await expect(devicesTab).toBeVisible();
  await devicesTab.tap();
}
