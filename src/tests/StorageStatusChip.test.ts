import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import StorageStatusChip from "$lib/components/StorageStatusChip.svelte";

/**
 * The chip is a status-only indicator (#2446); its former dropdown actions moved
 * to the app menu. The only behaviour worth asserting (per the project testing
 * rules) is that its accessible name carries the current storage state, so
 * non-sighted users get the state, not just a colour (#2064).
 *
 * A fresh layout store in browser mode has never been exported, so the chip's
 * accessible name reflects the pending "Unsaved changes" state.
 */
describe("StorageStatusChip", () => {
  it("exposes the current storage state and location in its accessible name", () => {
    render(StorageStatusChip);
    const chip = screen.getByTestId("storage-status-chip");
    expect(chip).toHaveAccessibleName(
      /storage status: unsaved changes, browser/i,
    );
  });

  it("trigger exposes aria-haspopup and aria-expanded for the popover", () => {
    // bits-ui Popover renders the trigger with aria-haspopup and aria-expanded,
    // confirming the popover integration is wired correctly in happy-dom.
    render(StorageStatusChip);
    const chip = screen.getByTestId("storage-status-chip");
    expect(chip).toHaveAttribute("aria-haspopup");
    expect(chip).toHaveAttribute("aria-expanded");
  });
});
