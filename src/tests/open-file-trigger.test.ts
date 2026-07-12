import { describe, it, expect, vi, afterEach } from "vitest";
import {
  runOpenFileFlow,
  registerOpenFileTrigger,
} from "$lib/actions/open-file-trigger";
import * as layoutStoreModule from "$lib/stores/layout.svelte";

// runOpenFileFlow reads changesSinceExport off the live layout store (#2987
// fix-round finding 2: the guard owns this check so every caller is safe).
// Wrap the real store and override only that field, so the mock stays a
// complete, type-sound LayoutStore. Mirrors the equivalent helper in
// dispatch.test.ts for new-layout.
function stubChangesSinceExport(value: number) {
  const real = layoutStoreModule.getLayoutStore();
  const stub = new Proxy(real, {
    get(target, prop) {
      if (prop === "changesSinceExport") return value;
      return Reflect.get(target, prop, target);
    },
  });
  vi.spyOn(layoutStoreModule, "getLayoutStore").mockReturnValue(stub);
}

describe("open-file-trigger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Leave no dangling registration between tests: register then
    // immediately run the returned cleanup, which nulls the module-level
    // trigger since it is still the active one.
    registerOpenFileTrigger(() => {})();
  });

  it("runs loadAction(false) immediately when there are no unexported changes", () => {
    stubChangesSinceExport(0);
    const trigger = vi.fn();
    const unregister = registerOpenFileTrigger(trigger);
    const loadAction = vi.fn();
    try {
      runOpenFileFlow(loadAction);
      expect(loadAction).toHaveBeenCalledWith(false);
      expect(trigger).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it("defers to the registered trigger, with loadAction not yet run, when there are unexported changes", () => {
    stubChangesSinceExport(2);
    const trigger = vi.fn();
    const unregister = registerOpenFileTrigger(trigger);
    const loadAction = vi.fn();
    try {
      runOpenFileFlow(loadAction);
      expect(trigger).toHaveBeenCalledWith(loadAction);
      expect(loadAction).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it("is a no-op when dirty and no trigger has been registered", () => {
    stubChangesSinceExport(1);
    const loadAction = vi.fn();
    expect(() => runOpenFileFlow(loadAction)).not.toThrow();
    expect(loadAction).not.toHaveBeenCalled();
  });

  it("an unregister call only clears the trigger if it is still the active one", () => {
    stubChangesSinceExport(1);
    const first = vi.fn();
    const unregisterFirst = registerOpenFileTrigger(first);
    const second = vi.fn();
    registerOpenFileTrigger(second);

    // A stale cleanup from an earlier registration must not clobber the
    // currently active trigger (mirrors restore-file-trigger's contract).
    unregisterFirst();

    const loadAction = vi.fn();
    runOpenFileFlow(loadAction);
    expect(second).toHaveBeenCalledWith(loadAction);
    expect(first).not.toHaveBeenCalled();
  });
});
