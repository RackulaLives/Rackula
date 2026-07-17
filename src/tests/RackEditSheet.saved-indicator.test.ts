/**
 * Issue #3005 (fix round 1): RackEditSheet (mobile) is documented as
 * "Feature parity with EditPanel's rack editing section", but its Name field
 * still committed silently on every blur (no no-op guard, no Saved
 * affordance) while EditPanelRack (desktop) already got both in round 0.
 * This applies the same treatment here: a no-op blur writes nothing and
 * shows nothing; a real rename commits once and flashes the shared Saved
 * indicator.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
// RackEditSheet's Saved indicator renders a Tooltip (#3005), which needs the
// Tooltip.Provider context App.svelte supplies in the real app.
import RackEditSheet from "./helpers/TestRackEditSheet.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { getHistoryStore, resetHistoryStore } from "$lib/stores/history.svelte";
import { resetSelectionStore } from "$lib/stores/selection.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";

describe("RackEditSheet Name field save affordance (#3005 fix round 1)", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetLayoutStore();
    resetSelectionStore();
    resetToastStore();
  });

  it("a no-op blur writes nothing and shows no Saved indicator", async () => {
    const layoutStore = getLayoutStore();
    const historyStore = getHistoryStore();
    const rack = layoutStore.addRack("Test Rack", 42)!;
    const baseline = historyStore.historyLength;

    render(RackEditSheet, { props: { rack } });

    const input = screen.getByLabelText("Name");
    await fireEvent.blur(input);

    expect(historyStore.historyLength).toBe(baseline);
    expect(
      screen.queryByTestId("saved-indicator-rack-name"),
    ).not.toBeInTheDocument();
  });

  it("a real rename commits once on blur and flashes the Saved indicator", async () => {
    const layoutStore = getLayoutStore();
    const historyStore = getHistoryStore();
    const rack = layoutStore.addRack("Test Rack", 42)!;
    const baseline = historyStore.historyLength;

    render(RackEditSheet, { props: { rack } });

    const input = screen.getByLabelText("Name");
    await fireEvent.input(input, { target: { value: "Renamed Rack" } });
    await fireEvent.blur(input);

    expect(historyStore.historyLength).toBe(baseline + 1);
    expect(layoutStore.rack?.name).toBe("Renamed Rack");

    await waitFor(() => {
      expect(
        screen.getByTestId("saved-indicator-rack-name"),
      ).toBeInTheDocument();
    });
  });

  // Fix round 2 (#3005): the Saved-flash flag was component-global $state,
  // not tied to the rack being edited. RackEditSheet stays mounted while its
  // `rack` prop is swapped for a different selection, so saving a rename and
  // switching to a different rack within the 2-second flash window showed
  // the checkmark next to a rack that was never saved.
  it("clears the Saved indicator when switching to a different rack within the flash window", async () => {
    const layoutStore = getLayoutStore();
    const rackA = layoutStore.addRack("Rack A", 42)!;
    const rackB = layoutStore.addRack("Rack B", 42)!;

    const { rerender } = render(RackEditSheet, { props: { rack: rackA } });

    const input = screen.getByLabelText("Name");
    await fireEvent.input(input, { target: { value: "Renamed A" } });
    await fireEvent.blur(input);

    await waitFor(() => {
      expect(
        screen.getByTestId("saved-indicator-rack-name"),
      ).toBeInTheDocument();
    });

    // Switch the rack prop to rack B, which was never saved, within the
    // 2-second flash window.
    await rerender({ rack: rackB });

    await waitFor(() => {
      expect(
        screen.queryByTestId("saved-indicator-rack-name"),
      ).not.toBeInTheDocument();
    });
  });
});
