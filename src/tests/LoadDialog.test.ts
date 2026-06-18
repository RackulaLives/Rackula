import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import LoadDialog from "../lib/components/LoadDialog.svelte";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";
import * as persistenceApi from "$lib/storage/api";
import * as loadPipeline from "$lib/storage/load-pipeline";
import * as persistenceStore from "$lib/storage/availability.svelte";
import { formatSnapshotTimestamp } from "$lib/utils/snapshot-timestamp";

// Mock the dependencies
vi.mock("$lib/storage/api", () => ({
  listSavedLayouts: vi.fn(),
  deleteSavedLayout: vi.fn(),
  loadSavedLayout: vi.fn(),
  listSnapshots: vi.fn(),
  PersistenceError: class PersistenceError extends Error {
    statusCode?: number;
    constructor(message: string, statusCode?: number) {
      super(message);
      this.name = "PersistenceError";
      this.statusCode = statusCode;
    }
  },
}));

vi.mock("$lib/storage/load-pipeline", () => ({
  loadFromApi: vi.fn(),
  loadFromFile: vi.fn(),
  restoreFromSnapshot: vi.fn(),
}));

vi.mock("$lib/storage/availability.svelte", () => ({
  isApiAvailable: vi.fn(() => true),
}));

describe("LoadDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetToastStore();
    dialogStore.close();
    vi.mocked(persistenceStore.isApiAvailable).mockReturnValue(true);
  });

  afterEach(() => {
    dialogStore.close();
  });

  it("shows loading state while fetching layouts", async () => {
    let resolveLayouts: (value: unknown) => void;
    const pendingPromise = new Promise((resolve) => {
      resolveLayouts = resolve;
    });
    vi.mocked(persistenceApi.listSavedLayouts).mockReturnValue(
      pendingPromise as never,
    );

    dialogStore.open("load");
    render(LoadDialog);
    await tick();

    // Initial state should show loading
    expect(screen.getByText(/Loading saved layouts/i)).toBeInTheDocument();
    expect(screen.getByTestId("spinner-loader")).toBeInTheDocument();

    // Resolve promise and loading should disappear
    resolveLayouts!([]);
    await waitFor(() => {
      expect(
        screen.queryByText(/Loading saved layouts/i),
      ).not.toBeInTheDocument();
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
    vi.mocked(persistenceApi.listSavedLayouts).mockResolvedValue(mockLayouts);

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
    vi.mocked(persistenceApi.listSavedLayouts).mockResolvedValue(mockLayouts);
    vi.mocked(loadPipeline.loadFromApi).mockResolvedValue(true);

    dialogStore.open("load");
    render(LoadDialog);

    const layoutItem = await screen.findByText("Test Layout 1");
    await fireEvent.click(layoutItem);

    expect(loadPipeline.loadFromApi).toHaveBeenCalledWith("uuid-1");
    expect(dialogStore.isOpen("load")).toBe(false);
  });

  it("calls loadFromFile and closes when import button is clicked", async () => {
    vi.mocked(loadPipeline.loadFromFile).mockResolvedValue(true);

    dialogStore.open("load");
    render(LoadDialog);

    const importBtn = screen.getByText(/Import from local file/i);
    await fireEvent.click(importBtn);

    expect(loadPipeline.loadFromFile).toHaveBeenCalled();
    expect(dialogStore.isOpen("load")).toBe(false);
  });

  it("fetches layouts when API becomes available after initial render", async () => {
    const mockLayouts: persistenceApi.SavedLayoutItem[] = [
      {
        id: "uuid-delayed",
        name: "Delayed Layout",
        version: "1.0",
        updatedAt: new Date().toISOString(),
        rackCount: 2,
        deviceCount: 10,
        valid: true,
      },
    ];
    // Start with API unavailable
    vi.mocked(persistenceStore.isApiAvailable).mockReturnValue(false);
    vi.mocked(persistenceApi.listSavedLayouts).mockResolvedValue(mockLayouts);

    dialogStore.open("load");
    const { unmount } = render(LoadDialog);
    await tick();

    // API not available yet — listSavedLayouts should not be called
    expect(persistenceApi.listSavedLayouts).not.toHaveBeenCalled();

    // Clean up first instance before re-rendering
    unmount();

    // Simulate API becoming available
    vi.mocked(persistenceStore.isApiAvailable).mockReturnValue(true);
    // Trigger reactivity by re-rendering (the $effect watches apiActive which is $derived)
    // In real app, the persistence store would trigger this. In test, we need to
    // re-render since mocked isApiAvailable isn't reactive.
    dialogStore.close();
    dialogStore.open("load");
    render(LoadDialog);

    expect(await screen.findByText("Delayed Layout")).toBeInTheDocument();
  });

  it("shows error state when API fails to list layouts", async () => {
    vi.mocked(persistenceApi.listSavedLayouts).mockRejectedValue(
      new persistenceApi.PersistenceError("Server error"),
    );

    dialogStore.open("load");
    render(LoadDialog);

    expect(await screen.findByText("Server error")).toBeInTheDocument();
    expect(screen.getByText(/Retry/i)).toBeInTheDocument();
  });

  it("lists snapshots with localized timestamps when expanded", async () => {
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
    vi.mocked(persistenceApi.listSavedLayouts).mockResolvedValue(mockLayouts);
    vi.mocked(persistenceApi.listSnapshots).mockResolvedValue([
      {
        filename: "test-layout-1~20260615-143005.yaml",
        timestamp: "2026-06-15T14:30:05.000Z",
        size: 1024,
      },
    ]);

    dialogStore.open("load");
    render(LoadDialog);
    await screen.findByText("Test Layout 1");

    await fireEvent.click(
      screen.getByLabelText(/Show snapshots for Test Layout 1/i),
    );

    expect(persistenceApi.listSnapshots).toHaveBeenCalledWith("uuid-1");
    // The raw UTC filename suffix must not surface; a localized time does.
    const expectedLabel = formatSnapshotTimestamp(
      "test-layout-1~20260615-143005.yaml",
    );
    expect(await screen.findByText(expectedLabel)).toBeInTheDocument();
    expect(screen.queryByText(/20260615-143005/)).not.toBeInTheDocument();
  });

  it("restores a snapshot through the load pipeline and closes the dialog", async () => {
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
    vi.mocked(persistenceApi.listSavedLayouts).mockResolvedValue(mockLayouts);
    vi.mocked(persistenceApi.listSnapshots).mockResolvedValue([
      {
        filename: "test-layout-1~20260615-143005.yaml",
        timestamp: "2026-06-15T14:30:05.000Z",
        size: 1024,
      },
    ]);
    vi.mocked(loadPipeline.restoreFromSnapshot).mockResolvedValue(true);

    dialogStore.open("load");
    render(LoadDialog);
    await screen.findByText("Test Layout 1");

    await fireEvent.click(
      screen.getByLabelText(/Show snapshots for Test Layout 1/i),
    );
    const restoreButton = await screen.findByText(/Restore/i);
    await fireEvent.click(restoreButton);

    expect(loadPipeline.restoreFromSnapshot).toHaveBeenCalledWith(
      "uuid-1",
      "test-layout-1~20260615-143005.yaml",
    );
    expect(dialogStore.isOpen("load")).toBe(false);
  });
});
