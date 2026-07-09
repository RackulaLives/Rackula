import { render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it } from "vitest";
import EditPanelRack from "$lib/components/EditPanelRack.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetSelectionStore } from "$lib/stores/selection.svelte";
import { createTestRack } from "./factories";

describe("EditPanelRack height presets", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetLayoutStore();
    resetSelectionStore();
  });

  it("shows mini-rack heights, including 8U, for 10-inch racks", () => {
    const rack = createTestRack({ height: 8, width: 10 });

    render(EditPanelRack, {
      props: { selectedRack: rack, selectedGroup: null },
    });

    expect(screen.getByTestId("btn-preset-height-8")).toBeInTheDocument();
    expect(screen.getByTestId("btn-preset-height-4")).toBeInTheDocument();
    expect(screen.queryByTestId("btn-preset-height-18")).toBeNull();
  });

  it("keeps standard rack heights for 19-inch racks", () => {
    const rack = createTestRack({ height: 42, width: 19 });

    render(EditPanelRack, {
      props: { selectedRack: rack, selectedGroup: null },
    });

    expect(screen.getByTestId("btn-preset-height-42")).toBeInTheDocument();
    expect(screen.getByTestId("btn-preset-height-18")).toBeInTheDocument();
    expect(screen.queryByTestId("btn-preset-height-8")).toBeNull();
  });
});
