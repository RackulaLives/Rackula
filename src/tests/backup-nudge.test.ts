import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  NUDGE_INTERVAL,
  currentNudgeCheckpoint,
  nudgeCheckpointToFire,
  loadLastNudgedCheckpoint,
  saveLastNudgedCheckpoint,
  clearNudgeCheckpoint,
  evaluateBackupNudge,
} from "$lib/utils/backup-nudge";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

describe("currentNudgeCheckpoint", () => {
  it("is 0 below the first change", () => {
    expect(currentNudgeCheckpoint(0, false)).toBe(0);
    expect(currentNudgeCheckpoint(0, true)).toBe(0);
  });

  it("returns a cold-start checkpoint on the first edit when never exported", () => {
    expect(currentNudgeCheckpoint(1, false)).toBe(1);
    expect(currentNudgeCheckpoint(29, false)).toBe(1);
  });

  it("does not cold-start once the layout has been exported", () => {
    expect(currentNudgeCheckpoint(1, true)).toBe(0);
    expect(currentNudgeCheckpoint(29, true)).toBe(0);
  });

  it("returns the highest crossed multiple of the interval", () => {
    expect(currentNudgeCheckpoint(NUDGE_INTERVAL, true)).toBe(NUDGE_INTERVAL);
    expect(currentNudgeCheckpoint(NUDGE_INTERVAL + 5, true)).toBe(
      NUDGE_INTERVAL,
    );
    expect(currentNudgeCheckpoint(NUDGE_INTERVAL * 3, false)).toBe(
      NUDGE_INTERVAL * 3,
    );
  });
});

describe("nudgeCheckpointToFire", () => {
  it("does not fire below the first checkpoint", () => {
    expect(nudgeCheckpointToFire(0, true, 0)).toBeNull();
    expect(nudgeCheckpointToFire(5, true, 0)).toBeNull();
  });

  it("fires the cold-start nudge once for a never-exported layout", () => {
    expect(nudgeCheckpointToFire(1, false, 0)).toBe(1);
    // Already nudged at the cold-start checkpoint: no re-fire while below 30.
    expect(nudgeCheckpointToFire(10, false, 1)).toBeNull();
  });

  it("fires at the first interval", () => {
    expect(nudgeCheckpointToFire(NUDGE_INTERVAL, true, 0)).toBe(NUDGE_INTERVAL);
  });

  it("re-fires only when a new multiple is crossed", () => {
    // Sitting at the interval after being nudged for it: no re-fire.
    expect(
      nudgeCheckpointToFire(NUDGE_INTERVAL + 10, true, NUDGE_INTERVAL),
    ).toBeNull();
    // Crossing the next multiple re-fires.
    expect(
      nudgeCheckpointToFire(NUDGE_INTERVAL * 2, true, NUDGE_INTERVAL),
    ).toBe(NUDGE_INTERVAL * 2);
  });

  it("escalates from the cold-start checkpoint to the first interval", () => {
    expect(nudgeCheckpointToFire(NUDGE_INTERVAL, false, 1)).toBe(
      NUDGE_INTERVAL,
    );
  });
});

describe("nudge checkpoint persistence", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("defaults to 0 when nothing is persisted", () => {
    expect(loadLastNudgedCheckpoint("layout-a")).toBe(0);
  });

  it("round-trips a saved checkpoint", () => {
    saveLastNudgedCheckpoint("layout-a", NUDGE_INTERVAL * 2);
    expect(loadLastNudgedCheckpoint("layout-a")).toBe(NUDGE_INTERVAL * 2);
  });

  it("clears the persisted checkpoint", () => {
    saveLastNudgedCheckpoint("layout-a", NUDGE_INTERVAL);
    clearNudgeCheckpoint("layout-a");
    expect(loadLastNudgedCheckpoint("layout-a")).toBe(0);
  });

  it("keeps checkpoints separate per layout", () => {
    saveLastNudgedCheckpoint("layout-a", NUDGE_INTERVAL * 2);
    saveLastNudgedCheckpoint("layout-b", NUDGE_INTERVAL);
    expect(loadLastNudgedCheckpoint("layout-a")).toBe(NUDGE_INTERVAL * 2);
    expect(loadLastNudgedCheckpoint("layout-b")).toBe(NUDGE_INTERVAL);
    clearNudgeCheckpoint("layout-a");
    expect(loadLastNudgedCheckpoint("layout-a")).toBe(0);
    expect(loadLastNudgedCheckpoint("layout-b")).toBe(NUDGE_INTERVAL);
  });

  it("treats corrupt persisted values as no checkpoint", () => {
    localStorageMock.setItem(
      "Rackula:backup-nudge-threshold:layout-a",
      "not-a-number",
    );
    expect(loadLastNudgedCheckpoint("layout-a")).toBe(0);
  });
});

describe("evaluateBackupNudge", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  const LAYOUT = "layout-a";

  it("fires the cold-start nudge on the first edit when never exported", () => {
    const fire = vi.fn();
    evaluateBackupNudge(LAYOUT, 1, false, fire);
    expect(fire).toHaveBeenCalledWith(1);
    expect(loadLastNudgedCheckpoint(LAYOUT)).toBe(1);
  });

  it("does not re-fire while sitting at the same checkpoint", () => {
    const fire = vi.fn();
    evaluateBackupNudge(LAYOUT, NUDGE_INTERVAL, true, fire);
    fire.mockClear();
    // More edits within the same interval window must not re-fire.
    evaluateBackupNudge(LAYOUT, NUDGE_INTERVAL + 5, true, fire);
    expect(fire).not.toHaveBeenCalled();
  });

  it("re-fires when the next multiple is crossed", () => {
    const fire = vi.fn();
    evaluateBackupNudge(LAYOUT, NUDGE_INTERVAL, true, fire);
    fire.mockClear();
    evaluateBackupNudge(LAYOUT, NUDGE_INTERVAL * 2, true, fire);
    expect(fire).toHaveBeenCalledWith(NUDGE_INTERVAL * 2);
    expect(loadLastNudgedCheckpoint(LAYOUT)).toBe(NUDGE_INTERVAL * 2);
  });

  it("clears the persisted checkpoint when changes reset to 0 on export", () => {
    saveLastNudgedCheckpoint(LAYOUT, NUDGE_INTERVAL);
    const fire = vi.fn();
    evaluateBackupNudge(LAYOUT, 0, true, fire);
    expect(fire).not.toHaveBeenCalled();
    expect(loadLastNudgedCheckpoint(LAYOUT)).toBe(0);
  });

  it("does not re-nag across a reload at the same checkpoint", () => {
    const fire = vi.fn();
    // First session: cross 30 and fire.
    evaluateBackupNudge(LAYOUT, NUDGE_INTERVAL, true, fire);
    expect(fire).toHaveBeenCalledTimes(1);
    fire.mockClear();
    // Simulated reload: persisted checkpoint survives, same change count.
    evaluateBackupNudge(LAYOUT, NUDGE_INTERVAL, true, fire);
    expect(fire).not.toHaveBeenCalled();
  });

  it("does not let one layout's checkpoint suppress another's nudge", () => {
    const fire = vi.fn();
    // Tab A reaches a high checkpoint.
    evaluateBackupNudge("tab-a", NUDGE_INTERVAL * 2, true, fire);
    fire.mockClear();
    // Tab B is a fresh never-exported layout: its cold-start must still fire.
    evaluateBackupNudge("tab-b", 1, false, fire);
    expect(fire).toHaveBeenCalledWith(1);
  });
});
