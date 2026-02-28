import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { finalizeLayoutLoad, loadFromApi, loadFromFile } from "$lib/utils/load-pipeline";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";
import * as persistenceApi from "$lib/utils/persistence-api";
import * as archive from "$lib/utils/archive";
import * as fileUtils from "$lib/utils/file";
import { createTestLayout } from "./factories";

const mockImageStore = {
  clearAllImages: vi.fn(),
  setDeviceImage: vi.fn(),
  getDeviceImage: vi.fn(),
  loadBundledImages: vi.fn(),
};

// Mock the dependencies
vi.mock("$lib/stores/images.svelte", () => ({
  getImageStore: vi.fn(() => mockImageStore),
  resetImageStore: vi.fn(),
}));

vi.mock("$lib/utils/persistence-api", () => ({
  loadSavedLayout: vi.fn(),
  PersistenceError: class PersistenceError extends Error {
    statusCode?: number;
    constructor(message: string, statusCode?: number) {
      super(message);
      this.name = "PersistenceError";
      this.statusCode = statusCode;
    }
  },
}));

vi.mock("$lib/utils/archive", () => ({
  extractFolderArchive: vi.fn(),
}));

vi.mock("$lib/utils/file", () => ({
  openFilePicker: vi.fn(),
}));

describe("load-pipeline", () => {
  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();

  beforeEach(() => {
    vi.resetAllMocks();
    resetLayoutStore();
    resetToastStore();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("finalizeLayoutLoad", () => {
    it("loads layout and shows success toast", () => {
      const layout = createTestLayout({ name: "Pipeline Test" });
      finalizeLayoutLoad(layout);

      expect(layoutStore.layout.name).toBe("Pipeline Test");
      expect(toastStore.toasts).toContainEqual(
        expect.objectContaining({ message: "Layout loaded successfully", type: "success" }),
      );
    });

    it("restores images when provided", () => {
      const layout = createTestLayout({ name: "Image Test" });
      const mockBlob = new Blob(["test"], { type: "image/png" });
      const images = new Map();
      const imageData = { blob: mockBlob, dataUrl: "data:test", filename: "front.png" };
      images.set("test-slug", {
        front: imageData,
      });

      finalizeLayoutLoad(layout, images);

      expect(mockImageStore.clearAllImages).toHaveBeenCalled();
      expect(mockImageStore.setDeviceImage).toHaveBeenCalledWith("test-slug", "front", imageData);
      expect(mockImageStore.loadBundledImages).toHaveBeenCalled();
    });
  });

  describe("loadFromApi", () => {
    it("fetches from API and finalizes load on success", async () => {
      const layout = createTestLayout({ name: "API Load" });
      vi.mocked(persistenceApi.loadSavedLayout).mockResolvedValue(layout);

      const result = await loadFromApi("uuid-1");

      expect(result).toBe(true);
      expect(persistenceApi.loadSavedLayout).toHaveBeenCalledWith("uuid-1");
      expect(layoutStore.layout.name).toBe("API Load");
    });

    it("shows error toast on API failure", async () => {
      vi.mocked(persistenceApi.loadSavedLayout).mockRejectedValue(
        new persistenceApi.PersistenceError("Not found"),
      );

      const result = await loadFromApi("uuid-1");

      expect(result).toBe(false);
      expect(toastStore.toasts).toContainEqual(
        expect.objectContaining({ message: "Not found", type: "error" }),
      );
    });
  });

  describe("loadFromFile", () => {
    it("opens file picker, extracts archive and finalizes load", async () => {
      const layout = createTestLayout({ name: "File Load" });
      const mockFile = new File(["test"], "test.zip", { type: "application/zip" });
      
      vi.mocked(fileUtils.openFilePicker).mockResolvedValue(mockFile);
      vi.mocked(archive.extractFolderArchive).mockResolvedValue({
        layout,
        images: new Map(),
        failedImages: [],
      });

      const result = await loadFromFile();

      expect(result).toBe(true);
      expect(fileUtils.openFilePicker).toHaveBeenCalled();
      expect(archive.extractFolderArchive).toHaveBeenCalledWith(mockFile);
      expect(layoutStore.layout.name).toBe("File Load");
    });

    it("shows error toast when extraction fails", async () => {
      const mockFile = new File(["bad"], "bad.zip", { type: "application/zip" });
      vi.mocked(fileUtils.openFilePicker).mockResolvedValue(mockFile);
      vi.mocked(archive.extractFolderArchive).mockRejectedValue(
        new Error("Invalid archive format"),
      );

      const result = await loadFromFile();

      expect(result).toBe(false);
      expect(toastStore.toasts).toContainEqual(
        expect.objectContaining({ message: "Invalid archive format", type: "error" }),
      );
    });

    it("returns false when file picker is cancelled", async () => {
      vi.mocked(fileUtils.openFilePicker).mockResolvedValue(null);

      const result = await loadFromFile();

      expect(result).toBe(false);
      expect(archive.extractFolderArchive).not.toHaveBeenCalled();
    });
  });
});
