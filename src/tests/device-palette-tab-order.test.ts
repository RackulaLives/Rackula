/**
 * Device palette tab order (#2998): collapsed brand accordions must not leave
 * hundreds of invisible rows in the tab order, and an expanded list's rows
 * must use roving tabindex so the whole list is a single outer Tab stop.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import TestDevicePalette from "./helpers/TestDevicePalette.svelte";
import { resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";

describe("device palette tab order", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetUIStore();
    resetToastStore();
  });

  it("collapsed brand accordion content is inert and reachable once expanded", async () => {
    const user = userEvent.setup();
    render(TestDevicePalette);

    const content = screen.getByTestId("accordion-content-zima");
    // hidden: true bypasses testing-library's own default accessibility
    // filtering (which already excludes this row via bits-ui's `hidden`
    // attribute) so the test can grab the row and prove *this* fix -- the
    // `inert` attribute -- independently blocks focus.
    const row = screen.getByRole("listitem", {
      name: /zimaboard/i,
      hidden: true,
    });

    // Collapsed by default: content is inert, so focus cannot land on its row
    // even when asked to directly (matches happy-dom/browser inert semantics).
    // Focus a known control first so a no-op focus() attempt is provably
    // blocked, rather than trivially "not focused" because nothing moved yet.
    const searchInput = screen.getByTestId("search-devices");
    searchInput.focus();
    expect(searchInput).toHaveFocus();
    expect(content).toHaveAttribute("inert");
    row.focus();
    expect(row).not.toHaveFocus();
    expect(searchInput).toHaveFocus();

    // Expand the section: inert clears and the row becomes focusable.
    await user.click(screen.getByRole("button", { name: /^Zima/ }));
    expect(content).not.toHaveAttribute("inert");
    row.focus();
    expect(row).toHaveFocus();

    // Collapse again: inert (and the focus block) returns.
    await user.click(screen.getByRole("button", { name: /^Zima/ }));
    expect(content).toHaveAttribute("inert");
  });

  it("roving tabindex keeps exactly one row tabbable, and ArrowDown moves it", async () => {
    const user = userEvent.setup();
    render(TestDevicePalette);

    await user.click(screen.getByRole("button", { name: /^AC Infinity/ }));
    const content = screen.getByTestId("accordion-content-ac-infinity");
    const rows = within(content).getAllByRole("listitem");
    expect(rows.length).toBeGreaterThan(1);

    const tabbable = () =>
      rows.filter((row) => row.getAttribute("tabindex") === "0");

    // eslint-disable-next-line no-restricted-syntax -- roving tabindex invariant: exactly one row is ever in the tab order
    expect(tabbable()).toHaveLength(1);
    expect(tabbable()[0]).toBe(rows[0]);

    rows[0]?.focus();
    await user.keyboard("{ArrowDown}");

    // eslint-disable-next-line no-restricted-syntax -- roving tabindex invariant: exactly one row is ever in the tab order
    expect(tabbable()).toHaveLength(1);
    expect(tabbable()[0]).toBe(rows[1]);
    expect(rows[1]).toHaveFocus();
  });

  it("roving tabindex keeps exactly one row tabbable, and ArrowUp moves it", async () => {
    const user = userEvent.setup();
    render(TestDevicePalette);

    await user.click(screen.getByRole("button", { name: /^AC Infinity/ }));
    const content = screen.getByTestId("accordion-content-ac-infinity");
    const rows = within(content).getAllByRole("listitem");
    expect(rows.length).toBeGreaterThan(1);

    const tabbable = () =>
      rows.filter((row) => row.getAttribute("tabindex") === "0");

    rows[1]?.focus();
    // eslint-disable-next-line no-restricted-syntax -- roving tabindex invariant: exactly one row is ever in the tab order
    expect(tabbable()).toHaveLength(1);
    expect(tabbable()[0]).toBe(rows[1]);

    await user.keyboard("{ArrowUp}");

    // eslint-disable-next-line no-restricted-syntax -- roving tabindex invariant: exactly one row is ever in the tab order
    expect(tabbable()).toHaveLength(1);
    expect(tabbable()[0]).toBe(rows[0]);
    expect(rows[0]).toHaveFocus();
  });

  it("roving tabindex keeps exactly one row tabbable, and Home moves it to the first row", async () => {
    const user = userEvent.setup();
    render(TestDevicePalette);

    await user.click(screen.getByRole("button", { name: /^AC Infinity/ }));
    const content = screen.getByTestId("accordion-content-ac-infinity");
    const rows = within(content).getAllByRole("listitem");
    expect(rows.length).toBeGreaterThan(1);

    const tabbable = () =>
      rows.filter((row) => row.getAttribute("tabindex") === "0");

    const lastRow = rows[rows.length - 1];
    lastRow?.focus();
    // eslint-disable-next-line no-restricted-syntax -- roving tabindex invariant: exactly one row is ever in the tab order
    expect(tabbable()).toHaveLength(1);
    expect(tabbable()[0]).toBe(lastRow);

    await user.keyboard("{Home}");

    // eslint-disable-next-line no-restricted-syntax -- roving tabindex invariant: exactly one row is ever in the tab order
    expect(tabbable()).toHaveLength(1);
    expect(tabbable()[0]).toBe(rows[0]);
    expect(rows[0]).toHaveFocus();
  });

  it("roving tabindex keeps exactly one row tabbable, and End moves it to the last row", async () => {
    const user = userEvent.setup();
    render(TestDevicePalette);

    await user.click(screen.getByRole("button", { name: /^AC Infinity/ }));
    const content = screen.getByTestId("accordion-content-ac-infinity");
    const rows = within(content).getAllByRole("listitem");
    expect(rows.length).toBeGreaterThan(1);

    const tabbable = () =>
      rows.filter((row) => row.getAttribute("tabindex") === "0");

    rows[0]?.focus();
    // eslint-disable-next-line no-restricted-syntax -- roving tabindex invariant: exactly one row is ever in the tab order
    expect(tabbable()).toHaveLength(1);
    expect(tabbable()[0]).toBe(rows[0]);

    await user.keyboard("{End}");

    const lastRow = rows[rows.length - 1];
    // eslint-disable-next-line no-restricted-syntax -- roving tabindex invariant: exactly one row is ever in the tab order
    expect(tabbable()).toHaveLength(1);
    expect(tabbable()[0]).toBe(lastRow);
    expect(lastRow).toHaveFocus();
  });
});
