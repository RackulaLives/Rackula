import { render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it } from "vitest";
import EditPanelRack from "$lib/components/EditPanelRack.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetSelectionStore } from "$lib/stores/selection.svelte";
import { createTestRack } from "./factories";

describe("EditPanelRack RackMate presets", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetLayoutStore();
    resetSelectionStore();
  });

  it("locks 10-inch racks to the user's 8U RackMate height and 260mm depth presets", () => {
    const rack = createTestRack({ height: 8, width: 10, depth_mm: 260 });

    render(EditPanelRack, {
      props: { selectedRack: rack, selectedGroup: null },
    });

    expect(screen.getByTestId("btn-preset-height-8")).toBeInTheDocument();
    expect(screen.getByTestId("btn-preset-depth-260")).toBeInTheDocument();
    expect(screen.queryByTestId("btn-preset-height-4")).toBeNull();
    expect(screen.queryByTestId("btn-preset-height-12")).toBeNull();
    expect(screen.queryByTestId("btn-preset-height-18")).toBeNull();
    expect(screen.queryByTestId("btn-preset-depth-1000")).toBeNull();
  });

  it("keeps standard rack heights and depths for 19-inch racks", () => {
    const rack = createTestRack({ height: 42, width: 19 });

    render(EditPanelRack, {
      props: { selectedRack: rack, selectedGroup: null },
    });

    expect(screen.getByTestId("btn-preset-height-42")).toBeInTheDocument();
    expect(screen.getByTestId("btn-preset-height-18")).toBeInTheDocument();
    expect(screen.getByTestId("btn-preset-depth-1000")).toBeInTheDocument();
    expect(screen.queryByTestId("btn-preset-height-8")).toBeNull();
    expect(screen.queryByTestId("btn-preset-depth-260")).toBeNull();
  });
});
