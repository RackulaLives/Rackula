import { describe, it, expect } from "vitest";
import {
  layoutPreviewKey,
  createLayoutPreviewCache,
} from "$lib/components/layout-preview-cache";
import {
  createTestLayout,
  createTestRack,
  createTestDevice,
  createTestDeviceType,
} from "./factories";

describe("layoutPreviewKey", () => {
  it("is stable for the same render-affecting content", () => {
    const a = createTestLayout({
      racks: [createTestRack({ devices: [createTestDevice({ id: "d1" })] })],
    });
    const b = createTestLayout({
      racks: [createTestRack({ devices: [createTestDevice({ id: "d1" })] })],
    });

    expect(layoutPreviewKey(a)).toBe(layoutPreviewKey(b));
  });

  it("changes when a device is placed", () => {
    const before = createTestLayout({
      racks: [createTestRack({ devices: [] })],
    });
    const after = createTestLayout({
      racks: [createTestRack({ devices: [createTestDevice({ id: "d1" })] })],
    });

    expect(layoutPreviewKey(before)).not.toBe(layoutPreviewKey(after));
  });

  it("changes when a device moves to a new position", () => {
    const before = createTestLayout({
      racks: [
        createTestRack({ devices: [createTestDevice({ id: "d1", position: 1 })] }),
      ],
    });
    const after = createTestLayout({
      racks: [
        createTestRack({ devices: [createTestDevice({ id: "d1", position: 5 })] }),
      ],
    });

    expect(layoutPreviewKey(before)).not.toBe(layoutPreviewKey(after));
  });

  it("changes when rack geometry changes", () => {
    const before = createTestLayout({ racks: [createTestRack({ height: 42 })] });
    const after = createTestLayout({ racks: [createTestRack({ height: 24 })] });

    expect(layoutPreviewKey(before)).not.toBe(layoutPreviewKey(after));
  });

  it("changes when a device type colour changes", () => {
    const before = createTestLayout({
      device_types: [createTestDeviceType({ slug: "srv", colour: "#111111" })],
    });
    const after = createTestLayout({
      device_types: [createTestDeviceType({ slug: "srv", colour: "#222222" })],
    });

    expect(layoutPreviewKey(before)).not.toBe(layoutPreviewKey(after));
  });

  it("ignores the display mode (previews always render in label mode)", () => {
    const before = createTestLayout();
    const after = createTestLayout();
    after.settings = { ...after.settings, display_mode: "image" };

    expect(layoutPreviewKey(before)).toBe(layoutPreviewKey(after));
  });

  it("ignores the layout name (name is shown as row text, not in the render)", () => {
    const a = createTestLayout({ name: "Homelab" });
    const b = createTestLayout({ name: "Rack Room" });

    expect(layoutPreviewKey(a)).toBe(layoutPreviewKey(b));
  });
});

describe("createLayoutPreviewCache", () => {
  it("returns a cached value only when the key matches", () => {
    const cache = createLayoutPreviewCache(8);
    cache.set("tab-1", "key-a", "<svg>a</svg>");

    expect(cache.get("tab-1", "key-a")).toBe("<svg>a</svg>");
    expect(cache.get("tab-1", "key-b")).toBeUndefined();
  });

  it("returns undefined for an unknown tab", () => {
    const cache = createLayoutPreviewCache(8);
    expect(cache.get("missing", "key-a")).toBeUndefined();
  });

  it("replaces a stale entry when the key for a tab changes", () => {
    const cache = createLayoutPreviewCache(8);
    cache.set("tab-1", "key-a", "<svg>old</svg>");
    cache.set("tab-1", "key-b", "<svg>new</svg>");

    expect(cache.get("tab-1", "key-a")).toBeUndefined();
    expect(cache.get("tab-1", "key-b")).toBe("<svg>new</svg>");
    expect(cache.size).toBe(1);
  });

  it("evicts the least-recently-used entry when the bound is exceeded", () => {
    const cache = createLayoutPreviewCache(2);
    cache.set("tab-1", "k1", "one");
    cache.set("tab-2", "k2", "two");
    // Touch tab-1 so tab-2 becomes least-recently-used.
    cache.get("tab-1", "k1");
    cache.set("tab-3", "k3", "three");

    expect(cache.size).toBe(2);
    expect(cache.get("tab-2", "k2")).toBeUndefined();
    expect(cache.get("tab-1", "k1")).toBe("one");
    expect(cache.get("tab-3", "k3")).toBe("three");
  });

  it("drops a tab's entry on delete", () => {
    const cache = createLayoutPreviewCache(8);
    cache.set("tab-1", "k1", "one");
    cache.delete("tab-1");

    expect(cache.get("tab-1", "k1")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("exposes a key snapshot safe to delete from while iterating", () => {
    const cache = createLayoutPreviewCache(8);
    cache.set("tab-1", "k1", "one");
    cache.set("tab-2", "k2", "two");

    for (const id of cache.keys()) {
      if (id === "tab-1") cache.delete(id);
    }

    expect(cache.get("tab-1", "k1")).toBeUndefined();
    expect(cache.get("tab-2", "k2")).toBe("two");
  });
});
