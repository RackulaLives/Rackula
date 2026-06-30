import { test, expect } from "./helpers/base-test";
import { gotoWithRack, locators } from "./helpers";

/**
 * #2698: A-Z (flat) mode must fill the device-library panel height instead of
 * capping the single windowed section at VIRTUAL_VIEWPORT_MAX (480px), which
 * left a large blank gap above the "Add custom device" footer. Grouped views
 * (Brand/Category) must keep that per-section cap so no one section stretches
 * the palette unbounded.
 *
 * These are layout assertions, so they run in a real browser (jsdom has no
 * layout engine). A tall viewport makes the pre-fix dead space unambiguous.
 */
test.describe("Device palette A-Z fill (#2698)", () => {
  test.use({ viewport: { width: 1280, height: 1200 } });

  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(!!isMobile, "Desktop sidebar layout only");
    await gotoWithRack(page);
    await page.getByTestId("sidebar-tab-devices").click();
    await expect(page.locator(locators.device.palette)).toBeVisible();
  });

  test("A-Z list fills the panel with no dead space above the footer", async ({
    page,
  }) => {
    const palette = page.locator(locators.device.palette);
    await palette.getByRole("button", { name: "A-Z" }).click();
    await expect(palette.getByRole("button", { name: "A-Z" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const deviceList = palette.locator(locators.device.list);
    const footer = palette.locator(locators.device.paletteFooter);
    const virtualSection = palette.locator(locators.device.virtualSection);
    await expect(virtualSection).toBeVisible();

    const listBox = await deviceList.boundingBox();
    const footerBox = await footer.boundingBox();
    const sectionBox = await virtualSection.boundingBox();
    if (!listBox || !footerBox || !sectionBox) {
      throw new Error("expected palette layout boxes to be measurable");
    }

    // The windowed list fills most of the available height. On a 1200px-tall
    // viewport the old fixed 480px cap filled well under half.
    expect(sectionBox.height / listBox.height).toBeGreaterThan(0.7);

    // No large blank area between the bottom of the list and the footer.
    const deadSpace = footerBox.y - (sectionBox.y + sectionBox.height);
    expect(deadSpace).toBeLessThan(80);

    // The list still virtualizes: it scrolls within itself (content overflows
    // the filled viewport) and renders only a windowed slice of the 747
    // devices, not every row. This also guards the flex height chain - if the
    // section's fill height failed to resolve, nothing would overflow.
    const virtualList = palette.locator(locators.device.virtualList);
    const scroll = await virtualList.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight + 100);

    const renderedRows = await virtualList
      .locator(locators.device.paletteItem)
      .count();
    expect(renderedRows).toBeGreaterThan(0);
    expect(renderedRows).toBeLessThan(100);
  });

  test("non-virtualized A-Z search results render without overflow", async ({
    page,
  }) => {
    const palette = page.locator(locators.device.palette);
    await palette.getByRole("button", { name: "A-Z" }).click();

    // A narrow query drops the flat list below VIRTUALIZE_THRESHOLD, so it
    // renders as plain DOM (no .virtual-section) - the branch this fill change
    // explicitly preserves. fill-flat must not engage and clip the short list.
    await page.getByTestId("search-devices").fill("raspberry");

    const virtualSection = palette.locator(locators.device.virtualSection);
    await expect.poll(async () => virtualSection.count()).toBe(0);

    const items = palette.locator(locators.device.paletteItem);
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    // Every matched row is visible (not clipped by a zero-height fill box).
    for (let i = 0; i < count; i++) {
      await expect(items.nth(i)).toBeVisible();
    }
    // Footer stays in place and the short list does not overflow the panel.
    await expect(palette.locator(locators.device.paletteFooter)).toBeVisible();
    const listOverflows = await palette
      .locator(locators.device.list)
      .evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(listOverflows).toBe(false);
  });

  test("collapsing the A-Z section shrinks it back to its header", async ({
    page,
  }) => {
    const palette = page.locator(locators.device.palette);
    await palette.getByRole("button", { name: "A-Z" }).click();

    const item = palette.locator(locators.device.accordionItem).first();
    const openBox = await item.boundingBox();
    if (!openBox) {
      throw new Error("expected the open A-Z section to be measurable");
    }
    // Open and filling, the section holds most of the panel.
    expect(openBox.height).toBeGreaterThan(400);

    // Collapse the sole "All Devices" section.
    await palette.getByRole("button", { name: /All Devices/ }).click();

    // The fill grow is gated on [data-state="open"], so a collapsed section
    // shrinks back to roughly its header height instead of holding the panel.
    await expect
      .poll(async () => {
        const b = await item.boundingBox();
        return b ? b.height : Infinity;
      })
      .toBeLessThan(120);
  });

  test("Category mode keeps per-section windowing capped (no unbounded fill)", async ({
    page,
  }) => {
    const palette = page.locator(locators.device.palette);
    await palette.getByRole("button", { name: "Category" }).click();
    await expect(
      palette.getByRole("button", { name: "Category" }),
    ).toHaveAttribute("aria-pressed", "true");

    // The default-expanded Server category has >100 devices, so it windows.
    // The expanded section is the only visible one (others are collapsed).
    const visibleSection = palette
      .locator(locators.device.virtualSection)
      .filter({ visible: true })
      .first();
    await expect(visibleSection).toBeVisible();

    const box = await visibleSection.boundingBox();
    if (!box) {
      throw new Error("expected the expanded section box to be measurable");
    }
    // A grouped section stays near the VIRTUAL_VIEWPORT_MAX (480px) cap rather
    // than stretching to fill the tall panel.
    expect(box.height).toBeLessThanOrEqual(520);
  });
});

/**
 * Regression for the fill chain: a long pinned-favourites strip must not starve
 * the A-Z library to zero height. Seeds many favourites on a short panel, where
 * an uncapped pinned strip would otherwise consume the whole list area.
 */
test.describe("Device palette A-Z fill with pinned favourites (#2698)", () => {
  test.use({ viewport: { width: 1280, height: 700 } });

  // Starter-library generics; always present and 19"-compatible, so they all
  // resolve as pinned devices.
  const MANY_FAVOURITES = [
    "1u-server",
    "2u-server",
    "3u-server",
    "4u-server",
    "1u-router-firewall",
    "2u-router-firewall",
    "24-port-switch",
    "48-port-switch",
    "1u-storage",
    "2u-storage",
    "3u-storage",
    "4u-storage",
    "1u-pdu",
    "2u-pdu",
    "2u-ups",
    "4u-ups",
    "1u-fiber-patch-panel",
    "24-port-patch-panel",
    "48-port-patch-panel",
    "1u-console-drawer",
  ];

  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(!!isMobile, "Desktop sidebar layout only");
    await page.addInitScript((slugs) => {
      localStorage.setItem("Rackula-device-favourites", JSON.stringify(slugs));
    }, MANY_FAVOURITES);
    await gotoWithRack(page);
    await page.getByTestId("sidebar-tab-devices").click();
    await expect(page.locator(locators.device.palette)).toBeVisible();
  });

  test("A-Z library stays usable; the pinned strip cannot starve it to zero", async ({
    page,
  }) => {
    const palette = page.locator(locators.device.palette);
    await palette.getByRole("button", { name: "A-Z" }).click();
    await expect(palette.getByRole("button", { name: "A-Z" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // The pinned strip is plain DOM (20 < virtualize threshold), so the only
    // windowed section is the A-Z library.
    const librarySection = palette
      .locator(locators.device.virtualSection)
      .filter({ visible: true })
      .first();
    await expect(librarySection).toBeVisible();

    const box = await librarySection.boundingBox();
    if (!box) {
      throw new Error("expected the A-Z library section to be measurable");
    }
    // Pre-fix the section collapsed to ~0 here; it must keep a usable height.
    expect(box.height).toBeGreaterThan(120);
  });
});
