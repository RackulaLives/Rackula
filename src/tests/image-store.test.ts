import { describe, it, expect, beforeEach } from "vitest";
import { getImageStore, resetImageStore } from "$lib/stores/images.svelte";
import type { ImageData } from "$lib/types/images";

// Helper to create mock ImageData (user upload)
function createMockImageData(filename = "test-front.png"): ImageData {
  return {
    blob: new Blob(["test"], { type: "image/png" }),
    dataUrl: "data:image/png;base64,dGVzdA==",
    filename,
  };
}

// Helper to create mock URL-based ImageData (bundled)
function createMockUrlImageData(filename = "test-front.webp"): ImageData {
  return {
    url: "/assets/device-images/test.webp",
    filename,
    isBundled: true,
  };
}

describe("Image Store", () => {
  beforeEach(() => {
    resetImageStore();
  });

  describe("setDeviceImage", () => {
    it("stores front image for device", () => {
      const store = getImageStore();
      const imageData = createMockImageData("server-1u-front.png");

      store.setDeviceImage("device-1", "front", imageData);

      expect(store.hasImage("device-1", "front")).toBe(true);
    });

    it("stores rear image for device", () => {
      const store = getImageStore();
      const imageData = createMockImageData("server-1u-rear.png");

      store.setDeviceImage("device-1", "rear", imageData);

      expect(store.hasImage("device-1", "rear")).toBe(true);
    });

    it("can store both front and rear for same device", () => {
      const store = getImageStore();
      const frontImage = createMockImageData("server-1u-front.png");
      const rearImage = createMockImageData("server-1u-rear.png");

      store.setDeviceImage("device-1", "front", frontImage);
      store.setDeviceImage("device-1", "rear", rearImage);

      expect(store.hasImage("device-1", "front")).toBe(true);
      expect(store.hasImage("device-1", "rear")).toBe(true);
    });

    it("overwrites existing image for same face", () => {
      const store = getImageStore();
      const image1 = createMockImageData("old.png");
      const image2 = createMockImageData("new.png");

      store.setDeviceImage("device-1", "front", image1);
      store.setDeviceImage("device-1", "front", image2);

      const retrieved = store.getDeviceImage("device-1", "front");
      expect(retrieved?.filename).toBe("new.png");
    });
  });

  describe("getDeviceImage", () => {
    it("retrieves stored front image", () => {
      const store = getImageStore();
      const imageData = createMockImageData("server-1u-front.png");

      store.setDeviceImage("device-1", "front", imageData);
      const retrieved = store.getDeviceImage("device-1", "front");

      expect(retrieved).toBeDefined();
      expect(retrieved?.filename).toBe("server-1u-front.png");
      expect(retrieved?.dataUrl).toBe(imageData.dataUrl);
    });

    it("retrieves stored rear image", () => {
      const store = getImageStore();
      const imageData = createMockImageData("server-1u-rear.png");

      store.setDeviceImage("device-1", "rear", imageData);
      const retrieved = store.getDeviceImage("device-1", "rear");

      expect(retrieved).toBeDefined();
      expect(retrieved?.filename).toBe("server-1u-rear.png");
    });

    it("returns undefined for non-existent device", () => {
      const store = getImageStore();

      const result = store.getDeviceImage("non-existent", "front");

      expect(result).toBeUndefined();
    });

    it("returns undefined for non-existent face", () => {
      const store = getImageStore();
      const imageData = createMockImageData();
      store.setDeviceImage("device-1", "front", imageData);

      const result = store.getDeviceImage("device-1", "rear");

      expect(result).toBeUndefined();
    });
  });

  describe("removeDeviceImage", () => {
    it("removes specific face image", () => {
      const store = getImageStore();
      const frontImage = createMockImageData("front.png");
      const rearImage = createMockImageData("rear.png");

      store.setDeviceImage("device-1", "front", frontImage);
      store.setDeviceImage("device-1", "rear", rearImage);

      store.removeDeviceImage("device-1", "front");

      expect(store.hasImage("device-1", "front")).toBe(false);
      expect(store.hasImage("device-1", "rear")).toBe(true);
    });

    it("does nothing for non-existent device", () => {
      const store = getImageStore();

      // Should not throw
      expect(() =>
        store.removeDeviceImage("non-existent", "front"),
      ).not.toThrow();
    });
  });

  describe("removeAllDeviceImages", () => {
    it("removes both front and rear images", () => {
      const store = getImageStore();
      const frontImage = createMockImageData("front.png");
      const rearImage = createMockImageData("rear.png");

      store.setDeviceImage("device-1", "front", frontImage);
      store.setDeviceImage("device-1", "rear", rearImage);

      store.removeAllDeviceImages("device-1");

      expect(store.hasImage("device-1", "front")).toBe(false);
      expect(store.hasImage("device-1", "rear")).toBe(false);
    });

    it("does not affect other devices", () => {
      const store = getImageStore();
      const image1 = createMockImageData("device1.png");
      const image2 = createMockImageData("device2.png");

      store.setDeviceImage("device-1", "front", image1);
      store.setDeviceImage("device-2", "front", image2);

      store.removeAllDeviceImages("device-1");

      expect(store.hasImage("device-1", "front")).toBe(false);
      expect(store.hasImage("device-2", "front")).toBe(true);
    });
  });

  describe("clearAllImages", () => {
    it("removes all images from store", () => {
      const store = getImageStore();

      store.setDeviceImage("device-1", "front", createMockImageData());
      store.setDeviceImage("device-1", "rear", createMockImageData());
      store.setDeviceImage("device-2", "front", createMockImageData());

      store.clearAllImages();

      expect(store.hasImage("device-1", "front")).toBe(false);
      expect(store.hasImage("device-1", "rear")).toBe(false);
      expect(store.hasImage("device-2", "front")).toBe(false);
    });

    it("results in empty getAllImages map", () => {
      const store = getImageStore();

      store.setDeviceImage("device-1", "front", createMockImageData());
      store.clearAllImages();

      const allImages = store.getAllImages();
      expect(allImages.size).toBe(0);
    });
  });

  describe("hasImage", () => {
    it("returns true when image exists", () => {
      const store = getImageStore();
      store.setDeviceImage("device-1", "front", createMockImageData());

      expect(store.hasImage("device-1", "front")).toBe(true);
    });

    it("returns false when device does not exist", () => {
      const store = getImageStore();

      expect(store.hasImage("non-existent", "front")).toBe(false);
    });

    it("returns false when face does not exist for device", () => {
      const store = getImageStore();
      store.setDeviceImage("device-1", "front", createMockImageData());

      expect(store.hasImage("device-1", "rear")).toBe(false);
    });
  });

  describe("getAllImages", () => {
    it("returns empty map when no images stored", () => {
      const store = getImageStore();

      const allImages = store.getAllImages();

      expect(allImages).toBeInstanceOf(Map);
      expect(allImages.size).toBe(0);
    });

    it("returns map with all stored images", () => {
      const store = getImageStore();
      const image1 = createMockImageData("device1-front.png");
      const image2 = createMockImageData("device2-front.png");

      store.setDeviceImage("device-1", "front", image1);
      store.setDeviceImage("device-2", "front", image2);

      const allImages = store.getAllImages();

      expect(allImages.size).toBe(2);
      expect(allImages.get("device-1")?.front?.filename).toBe(
        "device1-front.png",
      );
      expect(allImages.get("device-2")?.front?.filename).toBe(
        "device2-front.png",
      );
    });

    it("returns a copy of the internal map", () => {
      const store = getImageStore();
      store.setDeviceImage("device-1", "front", createMockImageData());

      const allImages = store.getAllImages();
      allImages.delete("device-1");

      // Original store should not be affected
      expect(store.hasImage("device-1", "front")).toBe(true);
    });
  });

  describe("imageCount", () => {
    it("returns 0 when no images stored", () => {
      const store = getImageStore();
      expect(store.imageCount).toBe(0);
    });

    it("counts individual images correctly", () => {
      const store = getImageStore();

      store.setDeviceImage("device-1", "front", createMockImageData());
      expect(store.imageCount).toBe(1);

      store.setDeviceImage("device-1", "rear", createMockImageData());
      expect(store.imageCount).toBe(2);

      store.setDeviceImage("device-2", "front", createMockImageData());
      expect(store.imageCount).toBe(3);
    });
  });

  describe("resetImageStore", () => {
    it("clears all images and resets state", () => {
      const store = getImageStore();
      store.setDeviceImage("device-1", "front", createMockImageData());

      resetImageStore();

      const freshStore = getImageStore();
      expect(freshStore.imageCount).toBe(0);
      expect(freshStore.hasImage("device-1", "front")).toBe(false);
    });
  });

  describe("getImageUrl", () => {
    it("returns dataUrl for user-uploaded images", () => {
      const store = getImageStore();
      const imageData = createMockImageData();
      store.setDeviceImage("device-1", "front", imageData);

      const url = store.getImageUrl("device-1", "front");
      expect(url).toBe("data:image/png;base64,dGVzdA==");
    });

    it("returns url for bundled images", () => {
      const store = getImageStore();
      const imageData = createMockUrlImageData();
      store.setDeviceImage("device-1", "front", imageData);

      const url = store.getImageUrl("device-1", "front");
      expect(url).toBe("/assets/device-images/test.webp");
    });

    it("returns undefined for non-existent device", () => {
      const store = getImageStore();
      expect(store.getImageUrl("non-existent", "front")).toBeUndefined();
    });

    it("prefers url over dataUrl when both present", () => {
      const store = getImageStore();
      store.setDeviceImage("device-1", "front", {
        url: "/assets/preferred.webp",
        dataUrl: "data:image/png;base64,dGVzdA==",
        filename: "test.webp",
      });

      const url = store.getImageUrl("device-1", "front");
      expect(url).toBe("/assets/preferred.webp");
    });
  });

  describe("loadBundledImages", () => {
    it("loads bundled images into store", () => {
      const store = getImageStore();
      store.loadBundledImages();

      // Should have images for bundled devices
      expect(store.hasImage("1u-server", "front")).toBe(true);
      expect(store.hasImage("2u-server", "front")).toBe(true);
      expect(store.hasImage("4u-server", "front")).toBe(true);
    });

    it("bundled images have URL and isBundled flag", () => {
      const store = getImageStore();
      store.loadBundledImages();

      const image = store.getDeviceImage("1u-server", "front");
      expect(image).toBeDefined();
      expect(image?.url).toBeDefined();
      expect(image?.isBundled).toBe(true);
    });

    it("bundled images return valid URL from getImageUrl", () => {
      const store = getImageStore();
      store.loadBundledImages();

      const url = store.getImageUrl("1u-server", "front");
      expect(url).toBeDefined();
      expect(typeof url).toBe("string");
    });
  });

  describe("getUserImages", () => {
    it("returns only user-uploaded images", () => {
      const store = getImageStore();

      // Add a bundled image
      store.setDeviceImage("bundled-device", "front", createMockUrlImageData());

      // Add a user-uploaded image
      store.setDeviceImage("user-device", "front", createMockImageData());

      const userImages = store.getUserImages();

      expect(userImages.has("user-device")).toBe(true);
      expect(userImages.has("bundled-device")).toBe(false);
    });

    it("excludes bundled images after loadBundledImages", () => {
      const store = getImageStore();
      store.loadBundledImages();

      // Add a user-uploaded image
      store.setDeviceImage("my-custom-server", "front", createMockImageData());

      const userImages = store.getUserImages();

      // Should have user image
      expect(userImages.has("my-custom-server")).toBe(true);

      // Should not have bundled images
      expect(userImages.has("1u-server")).toBe(false);
      expect(userImages.has("2u-server")).toBe(false);
    });

    it("returns empty map when only bundled images exist", () => {
      const store = getImageStore();
      store.loadBundledImages();

      const userImages = store.getUserImages();
      expect(userImages.size).toBe(0);
    });
  });

  describe("bundled images after clear (Issue #3)", () => {
    it("loses bundled images after clearAllImages without reload", () => {
      const store = getImageStore();

      // Load bundled images (simulates app mount)
      store.loadBundledImages();
      expect(store.hasImage("1u-server", "front")).toBe(true);

      // Clear all (simulates file load)
      store.clearAllImages();

      // Bundled images are gone!
      expect(store.hasImage("1u-server", "front")).toBe(false);
    });

    it("restores bundled images after clearAllImages + loadBundledImages", () => {
      const store = getImageStore();

      // Load bundled images (simulates app mount)
      store.loadBundledImages();
      expect(store.hasImage("1u-server", "front")).toBe(true);

      // Clear all (simulates file load)
      store.clearAllImages();

      // Reload bundled images (the fix!)
      store.loadBundledImages();

      // Bundled images are restored
      expect(store.hasImage("1u-server", "front")).toBe(true);
    });

    it("preserves user images when reloading bundled images", () => {
      const store = getImageStore();

      // Simulate file load with user images
      store.clearAllImages();
      store.setDeviceImage(
        "my-custom-device",
        "front",
        createMockImageData("custom.png"),
      );

      // Reload bundled images
      store.loadBundledImages();

      // Both user and bundled images should exist
      expect(store.hasImage("my-custom-device", "front")).toBe(true);
      expect(store.hasImage("1u-server", "front")).toBe(true);
    });
  });

  describe("cleanupOrphanedImages (Issue #46)", () => {
    it("removes user images not in use list", () => {
      const store = getImageStore();

      // Add some user-uploaded images
      store.setDeviceImage(
        "used-device",
        "front",
        createMockImageData("used.png"),
      );
      store.setDeviceImage(
        "orphan-device",
        "front",
        createMockImageData("orphan.png"),
      );

      // Only 'used-device' is in use
      const usedSlugs = new Set(["used-device"]);
      const removed = store.cleanupOrphanedImages(usedSlugs);

      expect(store.hasImage("used-device", "front")).toBe(true);
      expect(store.hasImage("orphan-device", "front")).toBe(false);
      expect(removed).toBe(1);
    });

    it("preserves bundled images even if not in use list", () => {
      const store = getImageStore();
      store.loadBundledImages();

      // Add a user image
      store.setDeviceImage(
        "user-device",
        "front",
        createMockImageData("user.png"),
      );

      // Empty use list - nothing in use
      const usedSlugs = new Set<string>();
      store.cleanupOrphanedImages(usedSlugs);

      // Bundled images should remain
      expect(store.hasImage("1u-server", "front")).toBe(true);
      expect(store.hasImage("2u-server", "front")).toBe(true);
      // User image should be removed
      expect(store.hasImage("user-device", "front")).toBe(false);
    });

    it("returns count of removed devices", () => {
      const store = getImageStore();

      store.setDeviceImage("orphan-1", "front", createMockImageData());
      store.setDeviceImage("orphan-1", "rear", createMockImageData()); // Same device, both faces
      store.setDeviceImage("orphan-2", "front", createMockImageData());
      store.setDeviceImage("keep-this", "front", createMockImageData());

      const usedSlugs = new Set(["keep-this"]);
      const removed = store.cleanupOrphanedImages(usedSlugs);

      // Should count devices removed, not individual images
      expect(removed).toBe(2);
      expect(store.hasImage("keep-this", "front")).toBe(true);
    });

    it("does nothing when all images are in use", () => {
      const store = getImageStore();

      store.setDeviceImage("device-1", "front", createMockImageData());
      store.setDeviceImage("device-2", "front", createMockImageData());

      const usedSlugs = new Set(["device-1", "device-2"]);
      const removed = store.cleanupOrphanedImages(usedSlugs);

      expect(removed).toBe(0);
      expect(store.hasImage("device-1", "front")).toBe(true);
      expect(store.hasImage("device-2", "front")).toBe(true);
    });

    it("handles empty store gracefully", () => {
      const store = getImageStore();

      const usedSlugs = new Set(["some-device"]);
      const removed = store.cleanupOrphanedImages(usedSlugs);

      expect(removed).toBe(0);
    });

    it("only removes user images with no bundled face", () => {
      const store = getImageStore();

      // A device with both bundled front and user-uploaded rear
      store.setDeviceImage("mixed-device", "front", createMockUrlImageData());
      store.setDeviceImage("mixed-device", "rear", createMockImageData());

      // Device not in use
      const usedSlugs = new Set<string>();
      const removed = store.cleanupOrphanedImages(usedSlugs);

      // Should keep the device since it has bundled content
      expect(store.hasImage("mixed-device", "front")).toBe(true);
      // Bundled front preserved
      expect(removed).toBe(0);
    });
  });
});
