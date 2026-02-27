import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import LoadDialog from "../lib/components/LoadDialog.svelte";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";
import * as persistenceApi from "$lib/utils/persistence-api";
import * as loadPipeline from "$lib/utils/load-pipeline";
import * as persistenceStore from "$lib/stores/persistence.svelte";

// Mock the dependencies
vi.mock("$lib/utils/persistence-api", () => ({
  listSavedLayouts: vi.fn(),
  deleteSavedLayout: vi.fn(),
  loadSavedLayout: vi.fn(),
  PersistenceError: class PersistenceError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "PersistenceError";
    }
  },
}));

vi.mock("$lib/utils/load-pipeline", () => ({
  loadFromApi: vi.fn(),
  loadFromFile: vi.fn(),
}));

vi.mock("$lib/stores/persistence.svelte", () => ({
  isApiAvailable: vi.fn(() => true),
}));

describe("LoadDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetToastStore();
    dialogStore.close();
    (persistenceStore.isApiAvailable as vi.Mock).mockReturnValue(true);
  });

  afterEach(() => {
    dialogStore.close();
  });

  it("shows loading state while fetching layouts", async () => {
    let resolveLayouts: (value: unknown) => void;
    const pendingPromise = new Promise((resolve) => {
      resolveLayouts = resolve;
    });
    (persistenceApi.listSavedLayouts as vi.Mock).mockReturnValue(pendingPromise);

    dialogStore.open("load");
    render(LoadDialog);
    await tick();

    // Initial state should show loading
    expect(screen.getByText(/Loading saved layouts/i)).toBeInTheDocument();
    expect(screen.getByTestId("spinner-loader")).toBeInTheDocument();

    // Resolve promise and loading should disappear
    resolveLayouts!([]);
    await waitFor(() => {
      expect(screen.queryByText(/Loading saved layouts/i)).not.toBeInTheDocument();
    });
  });

  it("lists saved layouts from the API when available", async () => {
    const mockLayouts: persistenceApi.SavedLayoutItem[] = [
      {
        id: "uuid-1",
        name: "Test Layout 1",
        version: "1.0",
        updatedAt: new Date().toISOString(),
        rackCount: 1,
        deviceCount: 5,
        valid: true,
      },
    ];
    (persistenceApi.listSavedLayouts as vi.Mock).mockResolvedValue(mockLayouts);

    dialogStore.open("load");
    render(LoadDialog);

    expect(await screen.findByText("Test Layout 1")).toBeInTheDocument();
    expect(screen.getByText(/1 rack, 5 devices/i)).toBeInTheDocument();
  });

  it("calls loadFromApi and closes when a layout is clicked", async () => {
    const mockLayouts: persistenceApi.SavedLayoutItem[] = [
      {
        id: "uuid-1",
        name: "Test Layout 1",
        version: "1.0",
        updatedAt: new Date().toISOString(),
        rackCount: 1,
        deviceCount: 5,
        valid: true,
      },
    ];
    (persistenceApi.listSavedLayouts as vi.Mock).mockResolvedValue(mockLayouts);
    (loadPipeline.loadFromApi as vi.Mock).mockResolvedValue(true);

    dialogStore.open("load");
    render(LoadDialog);

    const layoutItem = await screen.findByText("Test Layout 1");
    await fireEvent.click(layoutItem);

    expect(loadPipeline.loadFromApi).toHaveBeenCalledWith("uuid-1");
    expect(dialogStore.isOpen("load")).toBe(false);
  });

  it("calls loadFromFile and closes when import button is clicked", async () => {
    (loadPipeline.loadFromFile as vi.Mock).mockResolvedValue(true);

    dialogStore.open("load");
    render(LoadDialog);

    const importBtn = screen.getByText(/Import from local file/i);
    await fireEvent.click(importBtn);

    expect(loadPipeline.loadFromFile).toHaveBeenCalled();
    expect(dialogStore.isOpen("load")).toBe(false);
  });

  it("shows error state when API fails to list layouts", async () => {
    (persistenceApi.listSavedLayouts as vi.Mock).mockRejectedValue(
      new persistenceApi.PersistenceError("Server error"),
    );

    dialogStore.open("load");
    render(LoadDialog);

    expect(await screen.findByText("Server error")).toBeInTheDocument();
    expect(screen.getByText(/Retry/i)).toBeInTheDocument();
  });
});
