/**
 * Regression test for CodeAnt finding (PR #3017, comment 3566106209):
 * DevicePaletteItem's roving-key handler only called preventDefault /
 * stopPropagation when focus actually moved to another row. The boundary
 * no-ops that nextRovingIndex's own wrap-around math produces -- Home
 * pressed while already on the first row, End pressed while already on the
 * last row, and any mapped key in a single-item list (e.g. a lone pinned
 * device, or a search/category section down to one result) -- returned
 * early without cancelling the event, so the key bubbled past the palette
 * to window-level shortcuts. With a device selected in the rack, that lets
 * e.g. ArrowUp on a single-item palette section also trigger the global
 * "move selected device" shortcut, even though keyboard focus never left
 * the palette.
 *
 * Verified against src/lib/utils/roving-index.ts's own confirmed no-op
 * cases (see roving-index.test.ts): nextRovingIndex(0, "Home", N) === 0,
 * nextRovingIndex(N-1, "End", N) === N-1, and nextRovingIndex(0, key, 1)
 * === 0 for every mapped key.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, within, cleanup } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import TestDevicePaletteItem from "./helpers/TestDevicePaletteItem.svelte";
import { createTestDeviceType } from "./factories";

const DEVICE_NAME = "roving-boundary-device";

/** Builds a `[role="list"]` container -- matching DevicePalette's
 * per-section list -- with the real DevicePaletteItem row mounted directly
 * inside it via Svelte's `target` mount option, plus plain stand-in
 * `[role="listitem"]` siblings so the roving index math sees a real list
 * length. Only the row under test needs to be the full component; the
 * siblings just need to exist for `querySelectorAll` inside the component. */
function buildList({
  before = 0,
  after = 0,
}: {
  before?: number;
  after?: number;
} = {}): HTMLElement {
  const list = document.createElement("div");
  list.setAttribute("role", "list");
  document.body.appendChild(list);

  for (let i = 0; i < before; i++) {
    const sibling = document.createElement("div");
    sibling.setAttribute("role", "listitem");
    sibling.tabIndex = -1;
    list.appendChild(sibling);
  }

  render(TestDevicePaletteItem, {
    target: list,
    props: { device: createTestDeviceType({ model: DEVICE_NAME }) },
  });

  for (let i = 0; i < after; i++) {
    const sibling = document.createElement("div");
    sibling.setAttribute("role", "listitem");
    sibling.tabIndex = -1;
    list.appendChild(sibling);
  }

  return list;
}

describe("DevicePaletteItem roving key boundary handling", () => {
  const globalKeydown = vi.fn();

  afterEach(() => {
    window.removeEventListener("keydown", globalKeydown);
    globalKeydown.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("does not leak ArrowUp to a global handler on the sole row of a single-item list", async () => {
    const user = userEvent.setup();
    const list = buildList();
    const row = within(list).getByRole("listitem", {
      name: new RegExp(DEVICE_NAME),
    });
    window.addEventListener("keydown", globalKeydown);

    row.focus();
    await user.keyboard("{ArrowUp}");

    expect(globalKeydown).not.toHaveBeenCalled();
  });

  it("does not leak Home to a global handler when already on the first row", async () => {
    const user = userEvent.setup();
    const list = buildList({ after: 2 });
    const row = within(list).getByRole("listitem", {
      name: new RegExp(DEVICE_NAME),
    });
    window.addEventListener("keydown", globalKeydown);

    row.focus();
    await user.keyboard("{Home}");

    expect(globalKeydown).not.toHaveBeenCalled();
  });

  it("does not leak End to a global handler when already on the last row", async () => {
    const user = userEvent.setup();
    const list = buildList({ before: 2 });
    const row = within(list).getByRole("listitem", {
      name: new RegExp(DEVICE_NAME),
    });
    window.addEventListener("keydown", globalKeydown);

    row.focus();
    await user.keyboard("{End}");

    expect(globalKeydown).not.toHaveBeenCalled();
  });
});
