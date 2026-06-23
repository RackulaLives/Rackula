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

// Regression test for #2570: each rack row is a focusable div whose onkeydown
// preventDefaults Space and activates the row on Enter/Space. The row contains
// a nested delete <button>. Because keydown bubbles, pressing Space while the
// delete button was focused used to reach the row handler, which suppressed the
// button's native activation and selected the row instead. Both row variants
// are affected: grouped (handleGroupClick) and ungrouped (handleRackClick). The
// handlers now guard on `e.target === e.currentTarget`, so a bubbled keydown
// from the delete button no longer triggers row selection or preventDefault.

// Both row variants render the same guarded handler, so cover both.
const rowVariants = [
  {
    label: "ungrouped row (handleRackClick)",
    setup: () => {
      getLayoutStore().addRack("Edge", 42);
    },
    deleteButtonName: /Delete Edge/,
  },
  {
    label: "grouped row (handleGroupClick)",
    setup: () => {
      getLayoutStore().addBayedRackGroup("Touring", 2, 42);
    },
    deleteButtonName: /Delete Touring/,
  },
];

describe("RackList delete button keydown (#2570)", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetLayoutStore();
    resetSelectionStore();
    resetToastStore();
  });

  for (const variant of rowVariants) {
    describe(variant.label, () => {
      it("does not select the row when Space bubbles from the delete button", async () => {
        variant.setup();
        const selection = getSelectionStore();
        render(RackList);

        const deleteButton = screen.getByRole("button", {
          name: variant.deleteButtonName,
        });

        // Space dispatched at the delete button bubbles to the row's keydown.
        await fireEvent.keyDown(deleteButton, { key: " ", code: "Space" });

        // The row handler must ignore the bubbled event: no row selection.
        expect(selection.isRackSelected).toBe(false);
      });

      it("does not preventDefault Space on the delete button, so native activation survives", () => {
        variant.setup();
        render(RackList);

        const deleteButton = screen.getByRole("button", {
          name: variant.deleteButtonName,
        });

        // The bug: the row handler called e.preventDefault() on the bubbled
        // Space, which suppresses the button's native click activation. The
        // guard must let the event through untouched so the browser still
        // activates the button. happy-dom does not synthesize the native
        // click from a keydown, so this asserts the precondition for native
        // activation (the event reaches the button uncancelled); the click
        // test below covers the resulting delete flow.
        const spaceEvent = new KeyboardEvent("keydown", {
          key: " ",
          code: "Space",
          bubbles: true,
          cancelable: true,
        });
        deleteButton.dispatchEvent(spaceEvent);

        expect(spaceEvent.defaultPrevented).toBe(false);
      });

      it("opens the delete confirmation when the delete button is activated", async () => {
        variant.setup();
        render(RackList);

        const deleteButton = screen.getByRole("button", {
          name: variant.deleteButtonName,
        });

        await fireEvent.click(deleteButton);

        // The confirmation dialog's confirm button proves delete was initiated
        // and the row handler did not intercept the action.
        expect(
          screen.getByRole("button", { name: /^Delete$/ }),
        ).toBeInTheDocument();
      });
    });
  }
});
