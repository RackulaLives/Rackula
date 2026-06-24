import { describe, it, expect } from "vitest";
import { getAppMenuSections } from "$lib/actions/registry";
import { iconForAction } from "$lib/components/icons/action-icons";
import { projectMobileMenuSections } from "$lib/components/mobile/mobile-menu-projection";

/**
 * The mobile menu sheet (#2597) is a touch presentation of the same app-menu
 * projection the desktop dropdown renders (#2596). The contract that matters is
 * that the sheet is registry-driven: it has no hardcoded item set, ordering,
 * labels, or icons of its own. These tests pin that contract so adding or
 * reordering a registry action updates the mobile sheet with zero changes here.
 *
 * They assert the data the sheet binds to (projectMobileMenuSections), not its
 * DOM. The component renders exactly this projection, so the projection IS the
 * sheet's behaviour.
 */
describe("mobile menu sheet projection", () => {
  it("renders exactly the app-menu projection ids for each storage mode", () => {
    for (const mode of ["browser", "server"] as const) {
      const sheetIds = projectMobileMenuSections(mode).flatMap((s) =>
        s.items.map((i) => i.id),
      );
      const registryIds = getAppMenuSections(mode).flatMap((s) =>
        s.items.map((i) => i.id),
      );
      // The sheet never adds, drops, or reorders an item relative to the shared
      // projection; it is a pass-through of getAppMenuSections.
      expect(sheetIds).toEqual(registryIds);
    }
  });

  it("renders sections in the same grouping and order as the projection", () => {
    for (const mode of ["browser", "server"] as const) {
      const sheetGroups = projectMobileMenuSections(mode).map((s) => s.group);
      const registryGroups = getAppMenuSections(mode).map((s) => s.group);
      expect(sheetGroups).toEqual(registryGroups);
    }
  });

  it("carries a visible heading for every section it renders", () => {
    // The sheet is the view that uses the headings #2596 added; a section
    // without one would render a blank title.
    for (const mode of ["browser", "server"] as const) {
      for (const section of projectMobileMenuSections(mode)) {
        expect(
          section.heading,
          `group "${section.group}" has no heading`,
        ).toBeTruthy();
      }
    }
  });

  it("resolves an icon for every item it renders", () => {
    // The sheet draws an icon per row from iconForAction; a missing icon would
    // leave a broken-looking gap. Every projected item must resolve one.
    for (const mode of ["browser", "server"] as const) {
      for (const section of projectMobileMenuSections(mode)) {
        for (const item of section.items) {
          expect(
            iconForAction[item.id],
            `menu item "${item.id}" has no icon`,
          ).toBeDefined();
        }
      }
    }
  });

  it("inherits disabled state from the projection's enabledWhen", () => {
    // Rack-dependent items (share, view-yaml) are disabled when no rack exists.
    // The sheet does not recompute this; it shows the projection's disabled flag.
    const noRacks = {
      hasSelection: false,
      isDeviceSelected: false,
      isRackSelected: false,
      canUndo: false,
      canRedo: false,
      hasRacks: false,
      mode: "browser" as const,
      canMoveDeviceSlot: false,
    };
    const items = projectMobileMenuSections("browser", noRacks).flatMap(
      (s) => s.items,
    );
    expect(items.find((i) => i.id === "share")?.disabled).toBe(true);
    expect(items.find((i) => i.id === "view-yaml")?.disabled).toBe(true);
  });
});
