import { describe, it, expect } from "vitest";
import { computeLayoutStatus } from "$lib/storage/durability.svelte";

describe("computeLayoutStatus inline fields", () => {
  it("browser clean: short 'Saved', location shown", () => {
    const r = computeLayoutStatus("idle", 0, "browser", null, 0, true, false);
    expect(r.shortLabel).toBe("Saved");
    expect(r.showLocation).toBe(true);
  });

  it("browser dirty: short 'Unsaved', location shown", () => {
    const r = computeLayoutStatus("idle", 0, "browser", null, 3, false, false);
    expect(r.shortLabel).toBe("Unsaved");
    expect(r.showLocation).toBe(true);
  });

  it("server saved: short 'Saved', location shown", () => {
    const r = computeLayoutStatus("saved", 0, "server", true, 0, true, true);
    expect(r.shortLabel).toBe("Saved");
    expect(r.showLocation).toBe(true);
  });

  it("server checking: short 'Connecting', location shown", () => {
    const r = computeLayoutStatus("idle", 0, "server", null, 0, true, false);
    expect(r.shortLabel).toBe("Connecting");
    expect(r.showLocation).toBe(true);
  });

  it("server never reached: 'Server not found' stands alone", () => {
    const r = computeLayoutStatus("idle", 0, "server", false, 0, true, false);
    expect(r.shortLabel).toBe("Server not found");
    expect(r.showLocation).toBe(false);
  });

  it("server breaker open: 'Server unavailable' stands alone", () => {
    const r = computeLayoutStatus("error", 3, "server", true, 0, true, true);
    expect(r.shortLabel).toBe("Server unavailable");
    expect(r.showLocation).toBe(false);
  });
});
