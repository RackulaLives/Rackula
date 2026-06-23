import { describe, expect, it, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/svelte";
import RackList from "$lib/components/RackList.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";

// Regression test for #2570: the rack row's keydown handler used to swallow
// Space while the nested delete button was focused, suppressing the button's
// native activation and selecting the row instead. The row handler now guards
// on `e.target === e.currentTarget`, so a bubbled keydown from the delete
// button no longer triggers row selection or preventDefault.
describe("RackList delete button keydown (#2570)", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetLayoutStore();
    resetSelectionStore();
    resetToastStore();
  });

  it("does not select the row when Space bubbles from the delete button", async () => {
    const layout = getLayoutStore();
    layout.addRack("Edge", 42);

    const selection = getSelectionStore();
    render(RackList);

    const deleteButton = screen.getByRole("button", { name: /Delete Edge/ });

    // Space dispatched at the delete button bubbles to the row's keydown.
    await fireEvent.keyDown(deleteButton, { key: " ", code: "Space" });

    // The row handler must ignore the bubbled event: no row selection.
    expect(selection.isRackSelected).toBe(false);
  });

  it("does not preventDefault Space on the delete button, so native activation survives", async () => {
    const layout = getLayoutStore();
    layout.addRack("Edge", 42);

    render(RackList);

    const deleteButton = screen.getByRole("button", { name: /Delete Edge/ });

    // The bug: the row handler called e.preventDefault() on the bubbled Space,
    // which suppresses the button's native click activation. The guard must let
    // the event through untouched so the browser still activates the button.
    const spaceEvent = new KeyboardEvent("keydown", {
      key: " ",
      code: "Space",
      bubbles: true,
      cancelable: true,
    });
    deleteButton.dispatchEvent(spaceEvent);

    expect(spaceEvent.defaultPrevented).toBe(false);
  });

  it("opens the delete confirmation when the delete button is clicked", async () => {
    const layout = getLayoutStore();
    layout.addRack("Edge", 42);

    render(RackList);

    const deleteButton = screen.getByRole("button", { name: /Delete Edge/ });

    await fireEvent.click(deleteButton);

    // The confirmation dialog's confirm button proves delete was initiated and
    // the row handler did not intercept the action.
    expect(
      screen.getByRole("button", { name: /^Delete$/ }),
    ).toBeInTheDocument();
  });
});
