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
