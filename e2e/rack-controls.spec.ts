/**
 * Rack controls: verb bar reorder + bay gating and bay creation/extension
 * (#2822 verb bar, #2823 bay affordance gating).
 *
 * These drive the deterministic click/keyboard paths only. The right-edge drag
 * grip is deliberately not exercised here: drag-based E2E is flaky in this repo,
 * and the verb bar is the stable equivalent of every gesture the grip performs.
 *
 * Selectors are role/name based (getByRole with the accessible label) so they
 * survive row reordering and DOM restructuring. Bay affordances are enabled by
 * default (enableBayedRacks defaults to on), so no setup toggling is needed.
 */
import { test, expect } from "./helpers/base-test";
import type { Page } from "@playwright/test";
import {
  gotoWithRack,
  createRackDirect,
  createTestLayout,
  SMALL_RACK_SHARE,
  locators,
} from "./helpers";

/** The floating verb bar for a rack or bay-group selection. */
function rackActions(page: Page) {
  return page.getByRole("toolbar", { name: "Rack actions" });
}

/** A bay group renders as role="group" with an "N bays" accessible name. */
function bayGroup(page: Page) {
  return page.getByRole("group", { name: /bays/ });
}

/** The front-row rack SVG of each bay member (one per bay). */
function bayMembers(page: Page) {
  return bayGroup(page).locator(locators.bayGroup.frontMemberSvg);
}

/**
 * Select a standalone rack (by name when given, else the first one) via its
 * canvas click target and wait for its verb bar to appear.
 */
async function selectStandaloneRack(page: Page, name?: string): Promise<void> {
  const rack = name
    ? page.locator(locators.rackView.dualView).filter({
        has: page.locator(locators.rackView.dualViewName, { hasText: name }),
      })
    : page.locator(locators.rackView.dualView).first();
  await rack.locator(locators.rackView.frontSvg).click();
  await expect(rackActions(page)).toBeVisible();
}

/** Select a bay group via one of its members and wait for its verb bar. */
async function selectBayGroup(page: Page): Promise<void> {
  await bayMembers(page).first().click();
  await expect(rackActions(page)).toBeVisible();
}

test.describe("Rack reorder via the verb bar (#2822)", () => {
  test("Move rack right swaps the selected rack past its neighbour", async ({
    page,
  }) => {
    // Two standalone racks in a known left-to-right order: "Small Rack" then the
    // freshly created "Bravo".
    await gotoWithRack(page, SMALL_RACK_SHARE);
    await createRackDirect(page, { name: "Bravo" });
    await expect(page.locator(locators.rackView.dualViewName)).toHaveText([
      "Small Rack",
      "Bravo",
    ]);

    // Select the left rack and move it right through the verb bar chevron.
    await selectStandaloneRack(page, "Small Rack");
    await page.getByRole("button", { name: "Move rack right" }).click();

    // The row order flips: identity, not index internals, proves the reorder.
    await expect(page.locator(locators.rackView.dualViewName)).toHaveText([
      "Bravo",
      "Small Rack",
    ]);
  });
});

test.describe("Bay verb gating by selection state (#2823)", () => {
  test("empty standalone rack offers the Bay rack verb", async ({ page }) => {
    await gotoWithRack(page, SMALL_RACK_SHARE);
    await selectStandaloneRack(page);
    await expect(page.getByRole("button", { name: "Bay rack" })).toBeVisible();
  });

  test("populated standalone rack does not offer the Bay rack verb", async ({
    page,
  }) => {
    // A compact rack with one device pre-placed keeps the whole rack on screen
    // so the verb bar renders; baying must still be withheld.
    await gotoWithRack(
      page,
      createTestLayout({
        rackName: "Filled Rack",
        rackHeight: 12,
        devices: [{ type: "srv", position: 1, face: "front" }],
        customTypes: [
          { slug: "srv", height: 1, colour: "#4A90A4", category: "s" },
        ],
      }),
    );
    await selectStandaloneRack(page);

    // The verb bar is up (other rack verbs are present), but no bay verb.
    await expect(rackActions(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Bay rack" })).toHaveCount(0);
  });

  test("bay group offers the Bay rack verb", async ({ page }) => {
    await gotoWithRack(page, SMALL_RACK_SHARE);
    await selectStandaloneRack(page);
    await page.getByRole("button", { name: "Bay rack" }).click();
    await expect(bayGroup(page)).toBeVisible();

    await selectBayGroup(page);
    await expect(page.getByRole("button", { name: "Bay rack" })).toBeVisible();
  });
});

test.describe("Bay creation and extension via the verb bar (#2823)", () => {
  test("baying an empty standalone rack forms a two-bay group with empty members", async ({
    page,
  }) => {
    await gotoWithRack(page, SMALL_RACK_SHARE);
    await selectStandaloneRack(page);
    await page.getByRole("button", { name: "Bay rack" }).click();

    // A bay group with two members now exists; the standalone view is gone and
    // both members are empty.
    await expect(bayGroup(page)).toBeVisible();
    await expect(bayMembers(page)).toHaveCount(2);
    await expect(page.locator(locators.rackView.dualView)).toHaveCount(0);
    await expect(page.locator(locators.rack.device)).toHaveCount(0);
  });

  test("extending a bay group via the verb adds an empty member at group height", async ({
    page,
  }) => {
    // The verb-driven extension path end-to-end: baying a group again grows it
    // by one empty member and holds the equal-height invariant. That the new
    // member stays empty and at group height even when existing members are
    // populated is locked at the store level in baying-store.test.ts (placement
    // into a bayed member has no stable UI path to drive here).
    await gotoWithRack(page, SMALL_RACK_SHARE);

    // Bay the empty rack into a two-member group.
    await selectStandaloneRack(page);
    await page.getByRole("button", { name: "Bay rack" }).click();
    await expect(bayMembers(page)).toHaveCount(2);

    // Extend the group through the verb bar.
    await selectBayGroup(page);
    await page.getByRole("button", { name: "Bay rack" }).click();
    await expect(bayMembers(page)).toHaveCount(3);

    // Every member is empty: extension creates a new bay, it never copies gear.
    await expect(page.locator(locators.rack.device)).toHaveCount(0);

    // Equal-height invariant, observed: every rendered member is the same height.
    const heights = await bayMembers(page).evaluateAll((svgs) =>
      svgs.map((svg) => svg.getBoundingClientRect().height),
    );
    for (const height of heights) {
      expect(Math.abs(height - heights[0]!)).toBeLessThanOrEqual(2);
    }
  });
});
