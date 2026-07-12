/**
 * Behavioural tests for the shared Dialog wrapper's initial-focus rule
 * (#3000). Autofocus was inconsistent per dialog (close button by default,
 * or an accidental first-tabbable field for Share) with no documented rule.
 * The `type` prop now drives a single, centralised rule: "confirm" dialogs
 * focus the safe/cancel action, "form" dialogs focus the first field, and
 * "info" dialogs keep bits-ui's own default (first tabbable element).
 */
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/svelte";
import TestDialogFocus from "./helpers/TestDialogFocus.svelte";

describe("Dialog initial focus by declared type", () => {
  it("focuses the safe/cancel action for a confirm-type dialog, not the header close button", async () => {
    render(TestDialogFocus, { props: { open: true, type: "confirm" } });

    const safeAction = screen.getByTestId("safe-action");
    await waitFor(() => expect(safeAction).toHaveFocus());

    const closeButton = screen.getByRole("button", { name: "Close dialog" });
    expect(closeButton).not.toHaveFocus();
  });

  it("focuses the first field for a form-type dialog, ahead of the close button and other buttons", async () => {
    render(TestDialogFocus, { props: { open: true, type: "form" } });

    const firstField = screen.getByTestId("first-field");
    await waitFor(() => expect(firstField).toHaveFocus());

    const closeButton = screen.getByRole("button", { name: "Close dialog" });
    expect(closeButton).not.toHaveFocus();
  });

  it("leaves the default first-tabbable focus (the header close button) for an info-type dialog", async () => {
    render(TestDialogFocus, { props: { open: true, type: "info" } });

    const closeButton = screen.getByRole("button", { name: "Close dialog" });
    await waitFor(() => expect(closeButton).toHaveFocus());
  });

  it("defaults to info-type behaviour when no type prop is passed", async () => {
    render(TestDialogFocus, { props: { open: true } });

    const closeButton = screen.getByRole("button", { name: "Close dialog" });
    await waitFor(() => expect(closeButton).toHaveFocus());
  });
});
