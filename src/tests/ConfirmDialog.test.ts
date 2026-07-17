/**
 * Regression tests for #2919: a document-level keydown handler ran the
 * destructive confirm on Enter and called preventDefault(), which suppressed
 * native activation of a focused Cancel button. The listener was also
 * attached unconditionally on mount, so DevicePaletteItem (one ConfirmDialog
 * per deletable custom device) accumulated idle document listeners.
 *
 * ConfirmDialog now opens with focus on Cancel (the safe action), not the
 * header close button (#3000), so these tests wait for that target instead.
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

    // ConfirmDialog auto-focuses Cancel (the safe action) on open (#3000);
    // let that settle before pressing Enter so it targets it deterministically.
    const cancelButton = screen.getByTestId("btn-cancel-confirm");
    await waitFor(() => expect(cancelButton).toHaveFocus());

    await user.keyboard("{Enter}");

    expect(oncancel).toHaveBeenCalledTimes(1);
    expect(onconfirm).not.toHaveBeenCalled();
  });

  it("does not confirm when Enter is pressed while the close/X button is focused (#2975)", async () => {
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

    // Let the dialog's own initial focus (now Cancel, #3000) settle first,
    // then explicitly move focus to the close/X button for this scenario.
    const cancelButton = screen.getByTestId("btn-cancel-confirm");
    await waitFor(() => expect(cancelButton).toHaveFocus());
    const closeButton = screen.getByRole("button", { name: "Close dialog" });
    closeButton.focus();
    await waitFor(() => expect(closeButton).toHaveFocus());

    await user.keyboard("{Enter}");

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

    // Open: the listener attaches, so Enter now confirms - once focus is
    // off the auto-focused Cancel button (#3000), matching the "no button
    // focused" fallback path documented on handleKeyDown.
    await rerender({
      open: true,
      title: "Delete Device Type",
      message: "Delete this device?",
      onconfirm,
      oncancel,
    });
    const cancelButton = screen.getByTestId("btn-cancel-confirm");
    await waitFor(() => expect(cancelButton).toHaveFocus());
    cancelButton.blur();
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
