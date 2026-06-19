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
  it("exposes the current storage state in its accessible name", () => {
    render(StorageStatusChip);
    const chip = screen.getByTestId("storage-status-chip");
    expect(chip).toHaveAccessibleName(/storage status: unsaved changes/i);
  });
});
