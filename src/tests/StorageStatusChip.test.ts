import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import StorageStatusChip from "$lib/components/StorageStatusChip.svelte";

/**
 * The chip is presentational; the only behaviour worth asserting (per the
 * project testing rules) is that its accessible name carries the current
 * storage state, so non-sighted users get the state, not just a colour.
 *
 * A fresh layout store in browser mode has never been exported, so the chip's
 * accessible name reflects the pending "Unsaved changes" state.
 */
describe("StorageStatusChip", () => {
  it("exposes the current storage state in its accessible name", () => {
    render(StorageStatusChip);
    const chip = screen.getByRole("button", { name: /storage status/i });
    expect(chip).toHaveAccessibleName(/unsaved changes/i);
  });
});
