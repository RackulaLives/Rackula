/**
 * Regression tests for #2919: a document-level keydown handler ran the
 * destructive confirm on Enter and called preventDefault(), which suppressed
 * native activation of a focused Cancel button. The listener was also
 * attached unconditionally on mount, so DevicePaletteItem (one ConfirmDialog
 * per deletable custom device) accumulated idle document listeners.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import ConfirmDialog from "../lib/components/ConfirmDialog.svelte";

describe("ConfirmDialog keyboard behaviour", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cancels rather than confirms when Enter is pressed while Cancel is focused", async () => {
    const user = userEvent.setup();
    const onconfirm = vi.fn();
    const oncancel = vi.fn();

    render(ConfirmDialog, {
      props: {
        open: true,
        title: "Delete Device Type",
        message: 'Delete "Test Device"? This will remove it from your library.',
        onconfirm,
        oncancel,
      },
    });

    // Let the dialog's own initial focus management settle (it auto-focuses
    // the close button) before taking over focus manually, so our explicit
    // .focus() below doesn't lose a race with it.
    const closeButton = screen.getByRole("button", { name: "Close dialog" });
    await waitFor(() => expect(closeButton).toHaveFocus());

    const cancelButton = screen.getByTestId("btn-cancel-confirm");
    cancelButton.focus();
    await user.keyboard("{Enter}");

    expect(oncancel).toHaveBeenCalledTimes(1);
    expect(onconfirm).not.toHaveBeenCalled();
  });

  it("does not react to Enter while closed, and stops reacting once closed again", async () => {
    const onconfirm = vi.fn();
    const oncancel = vi.fn();

    const { rerender } = render(ConfirmDialog, {
      props: {
        open: false,
        title: "Delete Device Type",
        message: "Delete this device?",
        onconfirm,
        oncancel,
      },
    });

    // Closed: no listener should be attached, so Enter is a no-op.
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onconfirm).not.toHaveBeenCalled();
    expect(oncancel).not.toHaveBeenCalled();

    // Open: the listener attaches, so Enter now confirms.
    await rerender({
      open: true,
      title: "Delete Device Type",
      message: "Delete this device?",
      onconfirm,
      oncancel,
    });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onconfirm).toHaveBeenCalledTimes(1);

    // Closed again: the listener detaches, so a further Enter is a no-op.
    await rerender({
      open: false,
      title: "Delete Device Type",
      message: "Delete this device?",
      onconfirm,
      oncancel,
    });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onconfirm).toHaveBeenCalledTimes(1);
  });
});
