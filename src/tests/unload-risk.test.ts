import { describe, it, expect } from "vitest";
import {
  shouldWarnBeforeUnload,
  type UnloadRiskState,
} from "$lib/storage/unload-risk";

function riskState(overrides: Partial<UnloadRiskState> = {}): UnloadRiskState {
  return {
    warnOnUnsavedChanges: true,
    sessionSavePending: false,
    serverSavePending: false,
    serverMode: false,
    serverReachable: null,
    isDirty: false,
    ...overrides,
  };
}

describe("shouldWarnBeforeUnload", () => {
  it("returns false when nothing is at risk", () => {
    expect(shouldWarnBeforeUnload(riskState())).toBe(false);
  });

  it("returns false when the user setting is off, even with every risk present", () => {
    expect(
      shouldWarnBeforeUnload(
        riskState({
          warnOnUnsavedChanges: false,
          sessionSavePending: true,
          serverSavePending: true,
          serverMode: true,
          serverReachable: false,
          isDirty: true,
        }),
      ),
    ).toBe(false);
  });

  it("warns while a debounced session save is pending", () => {
    expect(
      shouldWarnBeforeUnload(riskState({ sessionSavePending: true })),
    ).toBe(true);
  });

  it("does not warn on a dirty layout in browser mode (working copy is persisted)", () => {
    expect(shouldWarnBeforeUnload(riskState({ isDirty: true }))).toBe(false);
  });

  it("warns in server mode when dirty and the server is unreachable", () => {
    expect(
      shouldWarnBeforeUnload(
        riskState({ serverMode: true, isDirty: true, serverReachable: false }),
      ),
    ).toBe(true);
  });

  it("warns in server mode when dirty and a save is in flight", () => {
    expect(
      shouldWarnBeforeUnload(
        riskState({
          serverMode: true,
          isDirty: true,
          serverReachable: true,
          serverSavePending: true,
        }),
      ),
    ).toBe(true);
  });

  it("does not warn in server mode when dirty, reachable, and no save in flight", () => {
    expect(
      shouldWarnBeforeUnload(
        riskState({ serverMode: true, isDirty: true, serverReachable: true }),
      ),
    ).toBe(false);
  });

  it("does not warn in server mode when clean, even while unreachable", () => {
    expect(
      shouldWarnBeforeUnload(
        riskState({ serverMode: true, isDirty: false, serverReachable: false }),
      ),
    ).toBe(false);
  });

  it("does not warn on an in-flight save when the layout is clean", () => {
    expect(
      shouldWarnBeforeUnload(
        riskState({
          serverMode: true,
          isDirty: false,
          serverReachable: true,
          serverSavePending: true,
        }),
      ),
    ).toBe(false);
  });

  it("does not warn when API availability is unknown (null) and dirty in server mode", () => {
    // null = health check pending, not confirmed unreachable
    expect(
      shouldWarnBeforeUnload(
        riskState({
          serverMode: true,
          isDirty: true,
          serverReachable: null,
        }),
      ),
    ).toBe(false);
  });
});
