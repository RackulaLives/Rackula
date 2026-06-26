import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import StorageDetailsPopover from "$lib/components/StorageDetailsPopover.svelte";

const NOW = Date.parse("2026-06-26T12:00:00.000Z");

describe("StorageDetailsPopover", () => {
  it("browser mode shows both timestamps and 'Never exported' when null", () => {
    render(StorageDetailsPopover, {
      mode: "browser",
      headline: "Unsaved changes",
      icon: "pending",
      changesSinceExport: 3,
      lastExportedAt: null,
      autosaveAt: "2026-06-26T11:59:50.000Z",
      serverSavedAt: null,
      nowMs: NOW,
    });
    expect(screen.getByText(/auto-saved/i)).toBeInTheDocument();
    expect(screen.getByText(/never exported/i)).toBeInTheDocument();
    expect(screen.getByText(/stored in this browser only/i)).toBeInTheDocument();
  });

  it("browser mode formats a real export time", () => {
    render(StorageDetailsPopover, {
      mode: "browser",
      headline: "Saved",
      icon: "saved",
      changesSinceExport: 0,
      lastExportedAt: "2026-06-23T12:00:00.000Z",
      autosaveAt: "2026-06-26T11:59:50.000Z",
      serverSavedAt: null,
      nowMs: NOW,
    });
    expect(screen.getByText(/last exported/i)).toBeInTheDocument();
    expect(screen.getByText(/3 days ago/i)).toBeInTheDocument();
  });

  it("server mode shows the last server save and storage location", () => {
    render(StorageDetailsPopover, {
      mode: "server",
      headline: "Saved",
      icon: "saved",
      changesSinceExport: 0,
      lastExportedAt: null,
      autosaveAt: null,
      serverSavedAt: "2026-06-26T11:58:00.000Z",
      nowMs: NOW,
    });
    expect(screen.getByText(/last saved/i)).toBeInTheDocument();
    expect(screen.getByText(/2 minutes ago/i)).toBeInTheDocument();
    expect(screen.getByText(/stored on the server/i)).toBeInTheDocument();
  });

  it("server mode error reframes the time as last reached", () => {
    render(StorageDetailsPopover, {
      mode: "server",
      headline: "Offline",
      icon: "error",
      changesSinceExport: 0,
      lastExportedAt: null,
      autosaveAt: null,
      serverSavedAt: "2026-06-26T11:52:00.000Z",
      nowMs: NOW,
    });
    expect(screen.getByText(/last reached server/i)).toBeInTheDocument();
  });
});
