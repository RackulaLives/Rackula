import { describe, it, expect } from "vitest";
import {
  detectImageMime,
  encodeUserImagesToYaml,
  decodeYamlImages,
} from "$lib/utils/image-encoding";
import {
  serializeLayoutToYaml,
  parseLayoutYamlWithImages,
  parseLayoutYaml,
} from "$lib/utils/yaml";
import type { ImageData, ImageStoreMap } from "$lib/types/images";
import { MAX_IMAGE_SIZE_BYTES } from "$lib/types/constants";
import { createTestLayout, createTestDeviceType, createTestRack } from "./factories";

// Real PNG magic bytes (89 50 4E 47 0D 0A 1A 0A) so detectImageMime accepts it.
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Base64-encode raw bytes (no data: prefix). */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/** Build a valid PNG data URL from arbitrary trailing bytes. */
function makePngDataUrl(extraBytes: number[] = [0, 1, 2, 3]): string {
  const bytes = new Uint8Array([...PNG_MAGIC, ...extraBytes]);
  return `data:image/png;base64,${bytesToBase64(bytes)}`;
}

/** Create a user ImageData backed by a real PNG payload. */
function makeUserImage(filename = "custom-front.png"): ImageData {
  const bytes = new Uint8Array([...PNG_MAGIC, 0, 1, 2, 3]);
  return {
    blob: new Blob([bytes], { type: "image/png" }),
    dataUrl: makePngDataUrl(),
    filename,
  };
}

describe("detectImageMime", () => {
  it("detects PNG from magic bytes", () => {
    expect(detectImageMime(new Uint8Array(PNG_MAGIC))).toBe("image/png");
  });

  it("detects JPEG from magic bytes", () => {
    expect(detectImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg",
    );
  });

  it("detects WebP from RIFF/WEBP container", () => {
    const bytes = new Uint8Array(12);
    // "RIFF" at 0-3, "WEBP" at 8-11
    bytes.set([0x52, 0x49, 0x46, 0x46], 0);
    bytes.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(detectImageMime(bytes)).toBe("image/webp");
  });

  it("returns null for SVG/text content", () => {
    const svg = new TextEncoder().encode("<svg xmlns='...'></svg>");
    expect(detectImageMime(svg)).toBeNull();
  });

  it("returns null for unknown bytes", () => {
    expect(detectImageMime(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });
});

describe("encodeUserImagesToYaml", () => {
  it("embeds user image faces in the serialized record", () => {
    const images: ImageStoreMap = new Map([
      ["my-server", { front: makeUserImage("my-server-front.png") }],
    ]);

    const { serialized, oversized } = encodeUserImagesToYaml(images);

    expect(serialized["my-server"]?.front).toBe(makePngDataUrl());
    expect(serialized["my-server"]?.rear).toBeUndefined();
    expect(oversized).toBe(0);
  });

  it("encodes both faces when present", () => {
    const images: ImageStoreMap = new Map([
      [
        "my-server",
        { front: makeUserImage("front.png"), rear: makeUserImage("rear.png") },
      ],
    ]);

    const { serialized } = encodeUserImagesToYaml(images);

    expect(serialized["my-server"]?.front).toBeDefined();
    expect(serialized["my-server"]?.rear).toBeDefined();
  });

  it("reports oversized when a face exceeds ~100KB", () => {
    const bigBytes = new Uint8Array([...PNG_MAGIC, ...new Array(120 * 1024).fill(0)]);
    const big: ImageData = {
      blob: new Blob([bigBytes], { type: "image/png" }),
      dataUrl: `data:image/png;base64,${bytesToBase64(bigBytes)}`,
      filename: "big.png",
    };
    const images: ImageStoreMap = new Map([["big-device", { front: big }]]);

    const { oversized } = encodeUserImagesToYaml(images);

    expect(oversized).toBeGreaterThanOrEqual(1);
  });
});

describe("YAML image round-trip", () => {
  it("embeds and restores a user image with equivalent bytes", async () => {
    const deviceType = createTestDeviceType({ slug: "my-server" });
    const layout = createTestLayout({
      racks: [createTestRack({ id: "rack-1" })],
      device_types: [deviceType],
    });

    const images: ImageStoreMap = new Map([
      ["my-server", { front: makeUserImage("my-server-front.png") }],
    ]);
    const { serialized } = encodeUserImagesToYaml(images);

    const yaml = await serializeLayoutToYaml(layout, serialized);
    expect(yaml).toContain("images:");
    expect(yaml).toContain("my-server");

    const result = await parseLayoutYamlWithImages(yaml);

    expect(result.failedImagesCount).toBe(0);
    expect(result.images.has("my-server")).toBe(true);

    const restoredFront = result.images.get("my-server")?.front;
    expect(restoredFront?.blob).toBeInstanceOf(Blob);
    expect(restoredFront?.blob?.type).toBe("image/png");

    const restoredBytes = new Uint8Array(
      await restoredFront!.blob!.arrayBuffer(),
    );
    expect(Array.from(restoredBytes.slice(0, 8))).toEqual(PNG_MAGIC);
  });

  it("does not leak the base64 images key onto the runtime layout", async () => {
    const layout = createTestLayout({
      device_types: [createTestDeviceType({ slug: "my-server" })],
    });
    const images: ImageStoreMap = new Map([
      ["my-server", { front: makeUserImage() }],
    ]);
    const { serialized } = encodeUserImagesToYaml(images);

    const yaml = await serializeLayoutToYaml(layout, serialized);

    // parseLayoutYamlWithImages strips images from the layout object
    const result = await parseLayoutYamlWithImages(yaml);
    expect((result.layout as Record<string, unknown>).images).toBeUndefined();

    // parseLayoutYaml (the plain path) must also strip it
    const plainLayout = await parseLayoutYaml(yaml);
    expect((plainLayout as Record<string, unknown>).images).toBeUndefined();
  });
});

describe("decodeYamlImages validation", () => {
  it("strips an SVG-declared image and counts it as failed", async () => {
    const svgPayload = btoa("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    const raw = {
      "evil-device": { front: `data:image/svg+xml;base64,${svgPayload}` },
    };

    const { images, failedImagesCount } = decodeYamlImages(raw);

    expect(failedImagesCount).toBe(1);
    expect(images.has("evil-device")).toBe(false);
  });

  it("strips a magic-byte mismatch (declared png, text payload)", () => {
    const textPayload = btoa("just some text, not an image");
    const raw = {
      "liar-device": { front: `data:image/png;base64,${textPayload}` },
    };

    const { images, failedImagesCount } = decodeYamlImages(raw);

    expect(failedImagesCount).toBe(1);
    expect(images.has("liar-device")).toBe(false);
  });

  it("strips an oversized image exceeding MAX_IMAGE_SIZE_BYTES", () => {
    const bigBytes = new Uint8Array([
      ...PNG_MAGIC,
      ...new Array(MAX_IMAGE_SIZE_BYTES + 16).fill(0),
    ]);
    const raw = {
      "huge-device": {
        front: `data:image/png;base64,${bytesToBase64(bigBytes)}`,
      },
    };

    const { images, failedImagesCount } = decodeYamlImages(raw);

    expect(failedImagesCount).toBe(1);
    expect(images.has("huge-device")).toBe(false);
  });

  it("accepts a valid PNG and rejects a sibling bad face independently", () => {
    const goodPng = makePngDataUrl();
    const badText = `data:image/png;base64,${btoa("not an image")}`;
    const raw = {
      "mixed-device": { front: goodPng, rear: badText },
    };

    const { images, failedImagesCount } = decodeYamlImages(raw);

    expect(failedImagesCount).toBe(1);
    expect(images.get("mixed-device")?.front).toBeDefined();
    expect(images.get("mixed-device")?.rear).toBeUndefined();
  });

  it("counts malformed (non-string) entries as failures", () => {
    const raw = {
      "bad-shape": { front: 42 },
    };

    const { images, failedImagesCount } = decodeYamlImages(raw);

    expect(failedImagesCount).toBe(1);
    expect(images.has("bad-shape")).toBe(false);
  });

  it("returns an empty result for non-object input", () => {
    expect(decodeYamlImages(undefined).failedImagesCount).toBe(0);
    expect(decodeYamlImages(undefined).images.size).toBe(0);
    expect(decodeYamlImages("nope").images.size).toBe(0);
  });
});

describe("layout still loads when an embedded image is bad", () => {
  it("parses the layout even if every image is rejected", async () => {
    const layout = createTestLayout({
      name: "Survives Bad Image",
      device_types: [createTestDeviceType({ slug: "my-server" })],
    });
    const yaml = await serializeLayoutToYaml(layout, {
      "my-server": {
        front: `data:image/svg+xml;base64,${btoa("<svg></svg>")}`,
      },
    });

    const result = await parseLayoutYamlWithImages(yaml);

    expect(result.layout.name).toBe("Survives Bad Image");
    expect(result.failedImagesCount).toBe(1);
    expect(result.images.size).toBe(0);
    // failedKeys names the device whose face was rejected, for support logging.
    expect(result.failedKeys).toContain("my-server");
  });
});

describe("decodeYamlImages oversized handling", () => {
  it("rejects an oversized face before allocating the decode buffer", () => {
    // A base64 payload whose estimated length exceeds the cap must be skipped
    // by the cheap pre-alloc check, never reaching atob.
    const overCapBase64Chars = Math.ceil((MAX_IMAGE_SIZE_BYTES + 1024) / 3) * 4;
    const hugePayload = "A".repeat(overCapBase64Chars);
    const raw = {
      "huge-device": { front: `data:image/png;base64,${hugePayload}` },
    };

    const { images, failedImagesCount, failedKeys } = decodeYamlImages(raw);

    expect(failedImagesCount).toBe(1);
    expect(images.has("huge-device")).toBe(false);
    expect(failedKeys).toContain("huge-device");
  });

  it("skips reserved prototype keys defensively", () => {
    const raw = JSON.parse(
      `{"__proto__": {"front": "x"}, "good": {"front": "${makePngDataUrl()}"}}`,
    );

    const { images, failedImagesCount } = decodeYamlImages(raw);

    expect(failedImagesCount).toBe(0);
    expect(images.has("good")).toBe(true);
    expect(Object.getPrototypeOf(images)).toBe(Map.prototype);
  });
});

describe("save warns about oversized embedded images", () => {
  it("reports an oversized count the save path surfaces as a warning toast", () => {
    // encodeUserImagesToYaml.oversized drives the single non-blocking warning
    // toast the save manager shows; here we assert the count it returns.
    const bigBytes = new Uint8Array([
      ...PNG_MAGIC,
      ...new Array(150 * 1024).fill(0),
    ]);
    const big: ImageData = {
      blob: new Blob([bigBytes], { type: "image/png" }),
      dataUrl: `data:image/png;base64,${bytesToBase64(bigBytes)}`,
      filename: "big.png",
    };
    const images: ImageStoreMap = new Map([["big-device", { front: big }]]);

    const { oversized } = encodeUserImagesToYaml(images);

    expect(oversized).toBeGreaterThanOrEqual(1);
  });
});

describe("server-path round-trip", () => {
  it("survives serialize (server save) -> parseWithImages (server load)", async () => {
    // Mirrors the server path: saveLayoutToServer serializes with embedded
    // images, loadSavedLayout reads them back via parseLayoutYamlWithImages.
    const layout = createTestLayout({
      name: "Server Layout",
      device_types: [createTestDeviceType({ slug: "srv" })],
    });
    const { serialized } = encodeUserImagesToYaml(
      new Map([["srv", { front: makeUserImage("srv-front.png") }]]),
    );

    const yaml = await serializeLayoutToYaml(layout, serialized);
    const result = await parseLayoutYamlWithImages(yaml);

    expect(result.failedImagesCount).toBe(0);
    expect(result.images.has("srv")).toBe(true);
    const restored = result.images.get("srv")?.front;
    expect(restored?.blob?.type).toBe("image/png");
    const restoredBytes = new Uint8Array(await restored!.blob!.arrayBuffer());
    expect(Array.from(restoredBytes.slice(0, 8))).toEqual(PNG_MAGIC);
  });
});

describe("#2208 interaction: images stays off the runtime layout", () => {
  it("loads images-bearing YAML, resaves, and emits images exactly once", async () => {
    const layout = createTestLayout({
      name: "2208 Layout",
      device_types: [createTestDeviceType({ slug: "dev-a" })],
    });
    const { serialized } = encodeUserImagesToYaml(
      new Map([["dev-a", { front: makeUserImage("dev-a-front.png") }]]),
    );

    // First serialize (a save with images embedded).
    const firstYaml = await serializeLayoutToYaml(layout, serialized);

    // Load it back: the runtime layout must NOT carry a raw images property.
    const loaded = await parseLayoutYamlWithImages(firstYaml);
    expect((loaded.layout as Record<string, unknown>).images).toBeUndefined();

    // Resave the loaded (image-free) runtime layout, re-embedding the decoded
    // store. The images section must be emitted once, not duplicated by
    // appendUnknownSections.
    const { serialized: reSerialized } = encodeUserImagesToYaml(loaded.images);
    const resavedYaml = await serializeLayoutToYaml(
      loaded.layout,
      reSerialized,
    );

    const imagesKeyOccurrences = resavedYaml
      .split("\n")
      .filter((line) => /^images:/.test(line)).length;
    expect(imagesKeyOccurrences).toBe(1);

    // And the resaved file still round-trips the image.
    const reloaded = await parseLayoutYamlWithImages(resavedYaml);
    expect(reloaded.images.has("dev-a")).toBe(true);
    expect((reloaded.layout as Record<string, unknown>).images).toBeUndefined();
  });
});

describe("image-encoding security hardening (#2221)", () => {
  it("encode skips a reserved __proto__ image key without polluting the prototype", () => {
    const map: ImageStoreMap = new Map();
    map.set("__proto__", { front: makeUserImage() });
    map.set("real-device", { front: makeUserImage() });

    const { serialized } = encodeUserImagesToYaml(map);

    // The reserved key never lands as an entry, and the prototype is intact.
    expect(Object.hasOwn(serialized, "__proto__")).toBe(false);
    expect((({}) as Record<string, unknown>).front).toBeUndefined();
    // A normal device is still serialized.
    expect(Object.hasOwn(serialized, "real-device")).toBe(true);
  });

  it("decode ignores a face injected via the prototype chain", () => {
    // A per-device value whose `front` lives on the prototype, not as an own
    // property, as a crafted YAML `__proto__: { front: ... }` would produce.
    const faceRecord = Object.create({ front: makePngDataUrl() });
    const { images, failedImagesCount } = decodeYamlImages({ dev: faceRecord });

    expect(images.size).toBe(0);
    expect(failedImagesCount).toBe(0);
  });

  it("rejects a data URL whose declared MIME lies about the sniffed bytes", () => {
    // Declared image/png, but the bytes are JPEG (FF D8 FF).
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]);
    const lyingDataUrl = `data:image/png;base64,${bytesToBase64(jpegBytes)}`;

    const { images, failedImagesCount } = decodeYamlImages({
      dev: { front: lyingDataUrl },
    });

    expect(images.size).toBe(0);
    expect(failedImagesCount).toBe(1);
  });
});
