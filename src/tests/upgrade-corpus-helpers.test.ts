// src/tests/upgrade-corpus-helpers.test.ts
import { describe, it, expect } from "vitest";
import { findSilentLosses } from "./upgrade-corpus-helpers";

describe("findSilentLosses", () => {
  it("reports a leaf value that disappears and is not on the allow-list", () => {
    const raw = { name: "Lab", note: "keep me" };
    const loaded = { name: "Lab" };
    const losses = findSilentLosses(raw, loaded, []);
    expect(losses).toEqual([{ value: "string:keep me", paths: ["$.note"] }]);
  });

  it("treats a value as preserved when it survives under a restructured path", () => {
    // singular `rack` becomes racks[0]; the id value moves but survives
    const raw = { rack: { id: "rack-a" } };
    const loaded = { racks: [{ id: "rack-a" }] };
    expect(findSilentLosses(raw, loaded, [])).toEqual([]);
  });

  it("allows a declared drop when every source path matches the allow-list", () => {
    const raw = { racks: [{ devices: [{ slot_position: "0" }] }] };
    const loaded = { racks: [{ devices: [{}] }] };
    const allow = [
      { pathPattern: "slot_position$", reason: "consumed by carrier adapter" },
    ];
    expect(findSilentLosses(raw, loaded, allow)).toEqual([]);
  });

  it("flags a partial loss when a repeated value loses occurrences", () => {
    const raw = { a: "x", b: "x" };
    const loaded = { a: "x" };
    expect(findSilentLosses(raw, loaded, [])).toEqual([
      { value: "string:x", paths: ["$.a", "$.b"] },
    ]);
  });

  it("reports a null leaf that is dropped", () => {
    const raw = { a: 1, note: null };
    const loaded = { a: 1 };
    expect(findSilentLosses(raw, loaded, [])).toEqual([
      { value: "null:null", paths: ["$.note"] },
    ]);
  });

  it("treats a surviving null as preserved", () => {
    const raw = { note: null };
    const loaded = { note: null };
    expect(findSilentLosses(raw, loaded, [])).toEqual([]);
  });
});
