import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  finalizeLayoutLoad,
  loadFromApi,
  loadFromFile,
  restoreFromSnapshot,
} from "$lib/storage/load-pipeline";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";
import * as persistenceApi from "$lib/storage/api";
import {
  getServerBaseUpdatedAt,
  setServerBaseUpdatedAt,
} from "$lib/storage/server-base";
import * as archive from "$lib/utils/archive";
import * as fileUtils from "$lib/utils/file";
import {
  createTestLayout,
  createTestRack,
  createTestDevice,
  createTestDeviceType,
} from "./factories";
import { placementKey } from "$lib/utils/placement-key";

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

vi.mock("$lib/storage/api", () => ({
  loadSavedLayout: vi.fn(),
  loadSnapshot: vi.fn(),
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
        expect.objectContaining({
          message: "Layout loaded successfully",
          type: "success",
        }),
      );
    });

    it("restores images when provided", () => {
      const layout = createTestLayout({ name: "Image Test" });
      const mockBlob = new Blob(["test"], { type: "image/png" });
      const images = new Map();
      const imageData = {
        blob: mockBlob,
        dataUrl: "data:test",
        filename: "front.png",
      };
      images.set("test-slug", {
        front: imageData,
      });

      finalizeLayoutLoad(layout, images);

      expect(mockImageStore.clearAllImages).toHaveBeenCalled();
      expect(mockImageStore.setDeviceImage).toHaveBeenCalledWith(
        "test-slug",
        "front",
        imageData,
      );
      expect(mockImageStore.loadBundledImages).toHaveBeenCalled();
    });

    it("suppresses the success toast when successMessage is null", () => {
      const layout = createTestLayout({ name: "Server Reconcile" });
      finalizeLayoutLoad(layout, undefined, 0, { successMessage: null });

      // Layout still loads, but the generic success toast is withheld so the
      // server-reconciliation path can show its own "Loaded ... from server".
      expect(layoutStore.layout.name).toBe("Server Reconcile");
      expect(toastStore.toasts.some((t) => t.type === "success")).toBe(false);
    });

    it("still warns about failed images when successMessage is null", () => {
      const layout = createTestLayout({ name: "Server Partial" });
      finalizeLayoutLoad(layout, undefined, 2, { successMessage: null });

      expect(toastStore.toasts).toContainEqual(
        expect.objectContaining({
          message: "Layout loaded with 2 images that couldn't be read",
          type: "warning",
        }),
      );
      // The warning fires but the generic success toast stays suppressed.
      expect(toastStore.toasts.some((t) => t.type === "success")).toBe(false);
    });

    it("names the device and face in a per-face failure toast when keys are given", () => {
      const layoutId = "11111111-1111-4111-8111-111111111111";
      const deviceId = "22222222-2222-4222-8222-222222222222";
      const rack = createTestRack({
        devices: [
          createTestDevice({
            id: deviceId,
            device_type: "test-device",
            name: "Synology NAS",
            front_image: "front.png",
          }),
        ],
      });
      const layout = createTestLayout({
        name: "Named Failure",
        metadata: { id: layoutId },
        device_types: [createTestDeviceType({ slug: "test-device" })],
        racks: [rack],
      });

      finalizeLayoutLoad(layout, undefined, 1, {
        failedKeys: [placementKey(layoutId, deviceId)],
      });

      // The named per-face toast replaces the generic count toast.
      expect(toastStore.toasts).toContainEqual(
        expect.objectContaining({
          message: 'Front image for "Synology NAS" failed to load',
          type: "warning",
        }),
      );
      expect(
        toastStore.toasts.some((t) =>
          t.message.includes("that couldn't be read"),
        ),
      ).toBe(false);
      // A partial failure is not a failed save: no success toast either.
      expect(toastStore.toasts.some((t) => t.type === "success")).toBe(false);
    });

    it("falls back to the generic count toast when no keys resolve to a device", () => {
      const layout = createTestLayout({ name: "Orphan Keys" });

      finalizeLayoutLoad(layout, undefined, 1, {
        // A placement key whose device is not in the layout resolves to nothing.
        failedKeys: [
          placementKey(
            "11111111-1111-4111-8111-111111111111",
            "99999999-9999-4999-8999-999999999999",
          ),
        ],
      });

      expect(toastStore.toasts).toContainEqual(
        expect.objectContaining({
          message: "Layout loaded with 1 image that couldn't be read",
          type: "warning",
        }),
      );
    });
  });

  describe("loadFromApi", () => {
    it("fetches from API and finalizes load on success", async () => {
      const layout = createTestLayout({ name: "API Load" });
      vi.mocked(persistenceApi.loadSavedLayout).mockResolvedValue({
        layout,
        images: new Map(),
        failedImagesCount: 0,
      });

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

  describe("restoreFromSnapshot", () => {
    it("loads the snapshot through loadSnapshot and finalizes as the working copy", async () => {
      const layout = createTestLayout({ name: "Restored Snapshot" });
      vi.mocked(persistenceApi.loadSnapshot).mockResolvedValue({
        layout,
        images: new Map(),
        failedImagesCount: 0,
        failedKeys: [],
      });

      const result = await restoreFromSnapshot(
        "uuid-1",
        "restored~20260615-143005.yaml",
      );

      expect(result).toBe(true);
      // Restore must go through the same loadSnapshot parse/validate/adapt path
      // as a normal load, not a bespoke bypass.
      expect(persistenceApi.loadSnapshot).toHaveBeenCalledWith(
        "uuid-1",
        "restored~20260615-143005.yaml",
      );
      expect(layoutStore.layout.name).toBe("Restored Snapshot");
    });

    it("clears the server base so the next save is a fresh write, not an in-place revert", async () => {
      // Seed a non-null base so the assertion cannot pass vacuously: the test
      // must observe restoreFromSnapshot actively clearing it.
      setServerBaseUpdatedAt("2026-06-15T12:00:00.000Z");
      expect(getServerBaseUpdatedAt()).not.toBeNull();

      const layout = createTestLayout({ name: "Restore As New Write" });
      vi.mocked(persistenceApi.loadSnapshot).mockResolvedValue({
        layout,
        images: new Map(),
        failedImagesCount: 0,
        failedKeys: [],
      });

      await restoreFromSnapshot("uuid-1", "x~20260615-143005.yaml");

      expect(getServerBaseUpdatedAt()).toBeNull();
    });

    it("shows an error toast when the snapshot cannot be loaded", async () => {
      vi.mocked(persistenceApi.loadSnapshot).mockRejectedValue(
        new persistenceApi.PersistenceError("Snapshot not found", 404),
      );

      const result = await restoreFromSnapshot(
        "uuid-1",
        "missing~20260615-143005.yaml",
      );

      expect(result).toBe(false);
      expect(toastStore.toasts.some((t) => t.type === "error")).toBe(true);
    });
  });

  describe("loadFromFile", () => {
    it("opens file picker, extracts archive and finalizes load", async () => {
      const layout = createTestLayout({ name: "File Load" });
      const mockFile = new File(["test"], "test.zip", {
        type: "application/zip",
      });

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
      const mockFile = new File(["bad"], "bad.zip", {
        type: "application/zip",
      });
      vi.mocked(fileUtils.openFilePicker).mockResolvedValue(mockFile);
      vi.mocked(archive.extractFolderArchive).mockRejectedValue(
        new Error("Invalid archive format"),
      );

      const result = await loadFromFile();

      expect(result).toBe(false);
      expect(toastStore.toasts).toContainEqual(
        expect.objectContaining({
          message: "Invalid archive format",
          type: "error",
        }),
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
