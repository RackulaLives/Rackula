/**
 * Dialog/toast coordination tests (#3004/R27a)
 *
 * A toast left over from a prior action must never linger and cover a
 * newly opened dialog's controls (observed: a "Device duplicated" toast
 * covered the Remove confirm dialog's Cancel button on mobile). Opening a
 * dialog dismisses whatever toasts are currently on screen; toasts fired by
 * actions taken inside an already-open dialog (e.g. "Link copied") are a
 * separate, later showToast call and are unaffected by this.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";

describe("dialog open dismisses lingering toasts", () => {
  beforeEach(() => {
    resetToastStore();
    dialogStore.close();
  });

  it("clears an info toast (e.g. a first-run notice) when a dialog opens", () => {
    const toastStore = getToastStore();
    const message =
      "Layouts are saved only in this browser. Export a file to keep a copy.";
    toastStore.showToast(message, "info");
    expect(toastStore.toasts.some((t) => t.message === message)).toBe(true);

    dialogStore.open("export");

    expect(toastStore.toasts).toEqual([]);
  });

  it("clears a success toast so it cannot cover a confirm dialog's Cancel button", () => {
    const toastStore = getToastStore();
    toastStore.showToast("Device duplicated", "success");
    expect(
      toastStore.toasts.some((t) => t.message === "Device duplicated"),
    ).toBe(true);

    dialogStore.open("confirmDelete");

    expect(toastStore.toasts).toEqual([]);
  });

  it("does not dismiss a toast fired after the dialog is already open", () => {
    const toastStore = getToastStore();
    dialogStore.open("share");
    expect(toastStore.toasts).toEqual([]);

    // Simulates an in-dialog action (e.g. ShareDialog's "Link copied").
    toastStore.showToast("Link copied to clipboard", "success", 3000);

    expect(
      toastStore.toasts.some((t) => t.message === "Link copied to clipboard"),
    ).toBe(true);
  });

  it("clears toasts when switching directly from one dialog to another", () => {
    const toastStore = getToastStore();
    dialogStore.open("export");
    toastStore.showToast("Export failed", "error");
    expect(toastStore.toasts.some((t) => t.message === "Export failed")).toBe(
      true,
    );

    dialogStore.open("share");

    expect(toastStore.toasts).toEqual([]);
  });

  it("leaves toasts alone when no dialog opens", () => {
    const toastStore = getToastStore();
    toastStore.showToast("Rack duplicated", "success");
    expect(toastStore.toasts.some((t) => t.message === "Rack duplicated")).toBe(
      true,
    );
    // A no-op state read, not a dialog open.
    expect(dialogStore.isOpen("export")).toBe(false);
    expect(toastStore.toasts.some((t) => t.message === "Rack duplicated")).toBe(
      true,
    );
  });
});

/**
 * Sheet/toast coordination tests (#3030)
 *
 * Extends the dialog-open clear above to mobile bottom-nav sheets
 * (Layouts/Racks/Devices/View, deviceDetails): a toast left over from a
 * prior action must not linger and cover a nav sheet's controls either.
 * Unlike a dialog, a sheet can reopen with a different ID or device index
 * while already open (nav tab switches, selecting another device), so the
 * clear only fires on the closed-to-open transition, not on every one of
 * those. An isUndoAffordance toast is also exempt, since sheets open far
 * more often than dialogs and an unclicked, still-valid Undo must survive.
 */
describe("sheet open dismisses lingering toasts", () => {
  beforeEach(() => {
    resetToastStore();
    dialogStore.close();
    dialogStore.closeSheet();
  });

  it("clears a plain toast on the closed-to-open transition", () => {
    const toastStore = getToastStore();
    toastStore.showToast("Device duplicated", "success");
    expect(
      toastStore.toasts.some((t) => t.message === "Device duplicated"),
    ).toBe(true);

    dialogStore.openSheet("racks");

    expect(toastStore.toasts).toEqual([]);
  });

  it("does not clear an undo-affordance toast on the closed-to-open transition", () => {
    const toastStore = getToastStore();
    toastStore.showUndoToast("Removed switch", () => {});
    expect(toastStore.toasts.some((t) => t.isUndoAffordance)).toBe(true);

    dialogStore.openSheet("deviceDetails", 0);

    expect(toastStore.toasts.some((t) => t.isUndoAffordance)).toBe(true);
  });

  it("does not clear toasts on a redundant openSheet call while already open", () => {
    const toastStore = getToastStore();
    dialogStore.openSheet("deviceDetails", 0);
    toastStore.showToast("Device duplicated", "success");
    expect(
      toastStore.toasts.some((t) => t.message === "Device duplicated"),
    ).toBe(true);

    // Selecting a different device re-fires openSheet for the same sheet.
    dialogStore.openSheet("deviceDetails", 1);

    expect(
      toastStore.toasts.some((t) => t.message === "Device duplicated"),
    ).toBe(true);
  });

  it("does not clear toasts when switching directly from one open sheet to another", () => {
    const toastStore = getToastStore();
    dialogStore.openSheet("racks");
    toastStore.showToast("Rack duplicated", "success");
    expect(toastStore.toasts.some((t) => t.message === "Rack duplicated")).toBe(
      true,
    );

    dialogStore.openSheet("layouts");

    expect(toastStore.toasts.some((t) => t.message === "Rack duplicated")).toBe(
      true,
    );
  });
});
