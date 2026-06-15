import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getTabId,
  readWriterTabId,
  detectForeignLayoutWrite,
  createTwinTabGuard,
  layoutBodyStorageKey,
  WRITER_TAB_ID_FIELD,
} from "$lib/storage/twin-tab-guard";

// Build a foreign-write body the way saveLayoutBody does: the writer tab id is a
// sibling of the layout payload, keyed by the single-sourced field name.
function stampBodyWrite(serialized: string, writerTabId: string): string {
  const parsed = JSON.parse(serialized) as Record<string, unknown>;
  return JSON.stringify({ ...parsed, [WRITER_TAB_ID_FIELD]: writerTabId });
}

describe("getTabId", () => {
  it("returns a stable non-empty id for the lifetime of the tab", () => {
    const first = getTabId();
    const second = getTabId();
    expect(first.length).toBeGreaterThan(0);
    expect(second).toBe(first);
  });
});

describe("stampBodyWrite / readWriterTabId", () => {
  it("stamps this tab's id into the serialized body so peers can attribute the write", () => {
    const serialized = stampBodyWrite('{"layout":{"name":"x"}}', "tab-123");
    expect(readWriterTabId(serialized)).toBe("tab-123");
  });

  it("returns null for a body with no writer stamp", () => {
    expect(readWriterTabId('{"layout":{"name":"x"}}')).toBeNull();
  });

  it("returns null for malformed JSON rather than throwing", () => {
    expect(readWriterTabId("not json")).toBeNull();
    expect(readWriterTabId(null)).toBeNull();
  });
});

describe("detectForeignLayoutWrite", () => {
  const key = layoutBodyStorageKey("layout-a");

  it("flags a write whose writer id differs from this tab", () => {
    const newValue = stampBodyWrite('{"layout":{}}', "other-tab");
    const result = detectForeignLayoutWrite(
      { key, newValue },
      "this-tab",
    );
    expect(result).toEqual({ foreign: true, layoutId: "layout-a" });
  });

  it("ignores this tab's own echoed write", () => {
    const newValue = stampBodyWrite('{"layout":{}}', "this-tab");
    const result = detectForeignLayoutWrite(
      { key, newValue },
      "this-tab",
    );
    expect(result.foreign).toBe(false);
  });

  it("ignores storage events for keys outside the layout-body family", () => {
    const result = detectForeignLayoutWrite(
      { key: "Rackula:workspace", newValue: stampBodyWrite("{}", "other") },
      "this-tab",
    );
    expect(result.foreign).toBe(false);
  });

  it("ignores a removal (null newValue) which is not a competing write", () => {
    const result = detectForeignLayoutWrite(
      { key, newValue: null },
      "this-tab",
    );
    expect(result.foreign).toBe(false);
  });

  it("treats a foreign write with no parseable writer id as foreign (cannot prove it is ours)", () => {
    const result = detectForeignLayoutWrite(
      { key, newValue: '{"layout":{}}' },
      "this-tab",
    );
    expect(result).toEqual({ foreign: true, layoutId: "layout-a" });
  });
});

describe("createTwinTabGuard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("pauses the layout a foreign write targeted and reports it as paused", () => {
    const guard = createTwinTabGuard({ tabId: "this-tab" });
    expect(guard.isPaused("layout-a")).toBe(false);

    guard.handleStorageEvent({
      key: layoutBodyStorageKey("layout-a"),
      newValue: stampBodyWrite('{"layout":{}}', "other-tab"),
    });

    expect(guard.isPaused("layout-a")).toBe(true);
  });

  it("leaves other layouts editable when one layout is paused (per-layout, not per-workspace)", () => {
    const guard = createTwinTabGuard({ tabId: "this-tab" });
    guard.handleStorageEvent({
      key: layoutBodyStorageKey("layout-a"),
      newValue: stampBodyWrite('{"layout":{}}', "other-tab"),
    });

    expect(guard.isPaused("layout-a")).toBe(true);
    expect(guard.isPaused("layout-b")).toBe(false);
  });

  it("does not pause on this tab's own echoed write", () => {
    const guard = createTwinTabGuard({ tabId: "this-tab" });
    guard.handleStorageEvent({
      key: layoutBodyStorageKey("layout-a"),
      newValue: stampBodyWrite('{"layout":{}}', "this-tab"),
    });
    expect(guard.isPaused("layout-a")).toBe(false);
  });

  it("notifies once per layout when a foreign write first pauses it", () => {
    const onForeignWrite = vi.fn();
    const guard = createTwinTabGuard({ tabId: "this-tab", onForeignWrite });
    const event = {
      key: layoutBodyStorageKey("layout-a"),
      newValue: stampBodyWrite('{"layout":{}}', "other-tab"),
    };

    guard.handleStorageEvent(event);
    guard.handleStorageEvent(event);

    expect(onForeignWrite).toHaveBeenCalledTimes(1);
    expect(onForeignWrite).toHaveBeenCalledWith("layout-a");
  });

  it("stays paused until reset (manual Reload is the documented recovery)", () => {
    const guard = createTwinTabGuard({ tabId: "this-tab" });
    guard.handleStorageEvent({
      key: layoutBodyStorageKey("layout-a"),
      newValue: stampBodyWrite('{"layout":{}}', "other-tab"),
    });
    // A subsequent own-write does not clear the pause; only a reset does.
    guard.handleStorageEvent({
      key: layoutBodyStorageKey("layout-a"),
      newValue: stampBodyWrite('{"layout":{}}', "this-tab"),
    });
    expect(guard.isPaused("layout-a")).toBe(true);
  });
});

describe("createTwinTabGuard.withLayoutLock (Web Locks where available)", () => {
  it("runs the write through navigator.locks when available, keyed per layout", async () => {
    const request = vi.fn(
      async (
        _name: string,
        _opts: { ifAvailable?: boolean },
        cb: (lock: object | null) => unknown,
      ) => cb({}),
    );
    const guard = createTwinTabGuard({
      tabId: "this-tab",
      locks: { request } as unknown as LockManager,
    });

    const write = vi.fn(() => true);
    const result = await guard.withLayoutLock("layout-a", write);

    expect(result).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "rackula:layout:layout-a",
      { ifAvailable: true },
      expect.any(Function),
    );
  });

  it("still runs the write when Web Locks are unavailable (tab-id fallback)", async () => {
    const guard = createTwinTabGuard({ tabId: "this-tab", locks: undefined });
    const write = vi.fn(() => true);
    const result = await guard.withLayoutLock("layout-a", write);
    expect(result).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("runs the write when the lock is held by a peer (ifAvailable yields null lock)", async () => {
    // ifAvailable: a held lock invokes the callback with null rather than
    // blocking. The write must still proceed; the tab-id stamp is what prevents
    // silent ping-pong, the lock only serialises where it can be taken.
    const request = vi.fn(
      async (
        _name: string,
        _opts: { ifAvailable?: boolean },
        cb: (lock: object | null) => unknown,
      ) => cb(null),
    );
    const guard = createTwinTabGuard({
      tabId: "this-tab",
      locks: { request } as unknown as LockManager,
    });
    const write = vi.fn(() => true);
    const result = await guard.withLayoutLock("layout-a", write);
    expect(result).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
