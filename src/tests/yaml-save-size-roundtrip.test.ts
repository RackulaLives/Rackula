/**
 * #3553: a plain .yaml save must never write a file that plain .yaml load
 * rejects. Embedded base64 images push the file past the old 5MB load cap.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  downloadYamlFile,
  extractFolderArchive,
  LayoutTooLargeError,
} from "$lib/utils/archive";
import type { ImageStoreMap } from "$lib/types/images";
import { createTestLayout } from "./factories";

vi.mock("browser-fs-access", () => ({
  fileSave: vi.fn().mockResolvedValue(undefined),
}));

import { fileSave } from "browser-fs-access";

const mockedFileSave = vi.mocked(fileSave);

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A PNG-sniffing data URL whose decoded payload is `bytes` long. */
function pngDataUrl(bytes: number): string {
  const buf = new Uint8Array(bytes);
  buf.set(PNG_MAGIC);
  return `data:image/png;base64,${Buffer.from(buf).toString("base64")}`;
}

function imagesOfSize(count: number, bytesEach: number): ImageStoreMap {
  const images: ImageStoreMap = new Map();
  for (let i = 0; i < count; i++) {
    images.set(`device-${i}`, {
      front: { dataUrl: pngDataUrl(bytesEach), filename: `d${i}-front.png` },
    });
  }
  return images;
}

describe("plain .yaml save/load size round trip (#3553)", () => {
  beforeEach(() => {
    mockedFileSave.mockClear();
  });

  it("loads a saved layout whose embedded images exceed 5MB", async () => {
    const layout = createTestLayout({ name: "Image Heavy" });
    // Two 4MB images: each is under the 5MB upload cap, together ~11MB encoded.
    const images = imagesOfSize(2, 4 * 1024 * 1024);

    await downloadYamlFile(layout, images);
    const saved = mockedFileSave.mock.calls[0]?.[0] as Blob;
    expect(saved.size).toBeGreaterThan(5 * 1024 * 1024);

    const loaded = await extractFolderArchive(saved);
    expect(loaded.layout.name).toBe("Image Heavy");
    expect(loaded.failedImages.length).toBe(0);
    expect(loaded.images.get("device-1")?.front?.dataUrl).toBe(
      images.get("device-1")?.front?.dataUrl,
    );
  });

  it("refuses to save a .yaml that load would reject, without writing a file", async () => {
    const layout = createTestLayout({ name: "Too Big" });
    // Eleven 4.5MB images encode to well over 50MB.
    const images = imagesOfSize(11, 4.5 * 1024 * 1024);

    await expect(downloadYamlFile(layout, images)).rejects.toBeInstanceOf(
      LayoutTooLargeError,
    );
    expect(mockedFileSave).not.toHaveBeenCalled();
  });
});
