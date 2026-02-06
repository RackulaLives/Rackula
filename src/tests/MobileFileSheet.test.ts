import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import MobileFileSheet from "$lib/components/MobileFileSheet.svelte";

describe("MobileFileSheet", () => {
  let onLoad: ReturnType<typeof vi.fn>;
  let onSave: ReturnType<typeof vi.fn>;
  let onExport: ReturnType<typeof vi.fn>;
  let onShare: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onLoad = vi.fn();
    onSave = vi.fn();
    onExport = vi.fn();
    onShare = vi.fn();
    onClose = vi.fn();
  });

  function renderSheet() {
    return render(MobileFileSheet, {
      props: {
        onload: onLoad,
        onsave: onSave,
        onexport: onExport,
        onshare: onShare,
        onclose: onClose,
      },
    });
  }

  it("renders the expected file actions", () => {
    renderSheet();

    expect(
      screen.getByRole("button", { name: "Load Layout" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save Layout" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Export Image" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Share Link" }),
    ).toBeInTheDocument();
  });

  it("calls load handler and closes sheet", async () => {
    renderSheet();

    await fireEvent.click(screen.getByRole("button", { name: "Load Layout" }));

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(onExport).not.toHaveBeenCalled();
    expect(onShare).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls save handler and closes sheet", async () => {
    renderSheet();

    await fireEvent.click(screen.getByRole("button", { name: "Save Layout" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onLoad).not.toHaveBeenCalled();
    expect(onExport).not.toHaveBeenCalled();
    expect(onShare).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls export handler and closes sheet", async () => {
    renderSheet();

    await fireEvent.click(screen.getByRole("button", { name: "Export Image" }));

    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onLoad).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(onShare).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls share handler and closes sheet", async () => {
    renderSheet();

    await fireEvent.click(screen.getByRole("button", { name: "Share Link" }));

    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onLoad).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(onExport).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
