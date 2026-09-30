/**
 * Canvas LOD tier and effects (#3428)
 *
 * Canvas.svelte installs panzoom from an $effect. Changing the zoom must not
 * make that effect re-run, or each tier change rebuilds panzoom at zoom 1,
 * which flips the tier back and loops forever on a zoomed-out canvas.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { flushSync } from "svelte";
import { getCanvasStore, resetCanvasStore } from "$lib/stores/canvas.svelte";
import { createMockPanzoom } from "./mocks/panzoom";

describe("canvas LOD tier inside effects", () => {
  beforeEach(() => {
    resetCanvasStore();
  });

  it("does not re-run the effect that installs panzoom when the tier changes", () => {
    const store = getCanvasStore();
    const panzoom = createMockPanzoom(1);
    let runs = 0;

    const cleanup = $effect.root(() => {
      $effect(() => {
        runs++;
        store.setPanzoomInstance(panzoom);
      });
    });
    flushSync();

    panzoom.zoomAbs(0, 0, 0.3);
    flushSync();

    expect(store.lodTier).toBe("reduced");
    expect(runs).toBe(1);
    cleanup();
  });
});
