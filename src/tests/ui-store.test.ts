import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getUIStore,
  resetUIStore,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
} from "$lib/stores/ui.svelte";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// Mock document.documentElement
const documentMock = {
  dataset: {} as Record<string, string>,
};
Object.defineProperty(globalThis, "document", {
  value: { documentElement: documentMock },
  writable: true,
});

describe("UI Store", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    documentMock.dataset = {};
    resetUIStore();
  });

  describe("Theme", () => {
    it("initial theme is dark when localStorage empty", () => {
      const store = getUIStore();
      expect(store.theme).toBe("dark");
    });

    it("initial theme loads from localStorage", () => {
      localStorageMock.getItem.mockReturnValueOnce("light");
      resetUIStore();
      const store = getUIStore();
      expect(store.theme).toBe("light");
    });

    it("toggleTheme switches between dark and light", () => {
      const store = getUIStore();
      expect(store.theme).toBe("dark");

      store.toggleTheme();
      expect(store.theme).toBe("light");

      store.toggleTheme();
      expect(store.theme).toBe("dark");
    });

    it("setTheme applies specified theme", () => {
      const store = getUIStore();
      store.setTheme("light");
      expect(store.theme).toBe("light");

      store.setTheme("dark");
      expect(store.theme).toBe("dark");
    });

    it("theme change persists to localStorage", () => {
      const store = getUIStore();
      store.setTheme("light");
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "Rackula_theme",
        "light",
      );
    });

    it("theme change updates document dataset", () => {
      const store = getUIStore();
      store.setTheme("light");
      expect(documentMock.dataset["theme"]).toBe("light");
    });
  });

  describe("Zoom", () => {
    it("initial zoom is 100", () => {
      const store = getUIStore();
      expect(store.zoom).toBe(100);
    });

    it("zoomIn increases zoom by ZOOM_STEP", () => {
      const store = getUIStore();
      store.zoomIn();
      expect(store.zoom).toBe(100 + ZOOM_STEP);
    });

    it("zoomOut decreases zoom by ZOOM_STEP", () => {
      const store = getUIStore();
      store.zoomOut();
      expect(store.zoom).toBe(100 - ZOOM_STEP);
    });

    it("zoom cannot exceed ZOOM_MAX", () => {
      const store = getUIStore();
      // Set zoom to max
      store.setZoom(ZOOM_MAX);
      expect(store.zoom).toBe(ZOOM_MAX);

      // Try to zoom in further
      store.zoomIn();
      expect(store.zoom).toBe(ZOOM_MAX);
      expect(store.canZoomIn).toBe(false);
    });

    it("zoom cannot go below ZOOM_MIN", () => {
      const store = getUIStore();
      // Set zoom to min
      store.setZoom(ZOOM_MIN);
      expect(store.zoom).toBe(ZOOM_MIN);

      // Try to zoom out further
      store.zoomOut();
      expect(store.zoom).toBe(ZOOM_MIN);
      expect(store.canZoomOut).toBe(false);
    });

    it("setZoom sets zoom within bounds", () => {
      const store = getUIStore();
      store.setZoom(75);
      expect(store.zoom).toBe(75);
    });

    it("setZoom clamps to ZOOM_MIN", () => {
      const store = getUIStore();
      store.setZoom(10);
      expect(store.zoom).toBe(ZOOM_MIN);
    });

    it("setZoom clamps to ZOOM_MAX", () => {
      const store = getUIStore();
      store.setZoom(500);
      expect(store.zoom).toBe(ZOOM_MAX);
    });

    it("resetZoom sets zoom to 100", () => {
      const store = getUIStore();
      store.setZoom(150);
      store.resetZoom();
      expect(store.zoom).toBe(100);
    });

    it("canZoomIn returns true when zoom < ZOOM_MAX", () => {
      const store = getUIStore();
      expect(store.canZoomIn).toBe(true);
    });

    it("canZoomOut returns true when zoom > ZOOM_MIN", () => {
      const store = getUIStore();
      expect(store.canZoomOut).toBe(true);
    });

    it("zoomScale returns zoom / 100", () => {
      const store = getUIStore();
      expect(store.zoomScale).toBe(1);

      store.setZoom(150);
      expect(store.zoomScale).toBe(1.5);

      store.setZoom(50);
      expect(store.zoomScale).toBe(0.5);
    });
  });

  describe("Drawers", () => {
    it("leftDrawerOpen starts false", () => {
      const store = getUIStore();
      expect(store.leftDrawerOpen).toBe(false);
    });

    it("rightDrawerOpen starts false", () => {
      const store = getUIStore();
      expect(store.rightDrawerOpen).toBe(false);
    });

    it("toggleLeftDrawer toggles leftDrawerOpen", () => {
      const store = getUIStore();
      store.toggleLeftDrawer();
      expect(store.leftDrawerOpen).toBe(true);

      store.toggleLeftDrawer();
      expect(store.leftDrawerOpen).toBe(false);
    });

    it("toggleRightDrawer toggles rightDrawerOpen", () => {
      const store = getUIStore();
      store.toggleRightDrawer();
      expect(store.rightDrawerOpen).toBe(true);

      store.toggleRightDrawer();
      expect(store.rightDrawerOpen).toBe(false);
    });

    it("openLeftDrawer sets leftDrawerOpen to true", () => {
      const store = getUIStore();
      store.openLeftDrawer();
      expect(store.leftDrawerOpen).toBe(true);
    });

    it("closeLeftDrawer sets leftDrawerOpen to false", () => {
      const store = getUIStore();
      store.openLeftDrawer();
      store.closeLeftDrawer();
      expect(store.leftDrawerOpen).toBe(false);
    });

    it("openRightDrawer sets rightDrawerOpen to true", () => {
      const store = getUIStore();
      store.openRightDrawer();
      expect(store.rightDrawerOpen).toBe(true);
    });

    it("closeRightDrawer sets rightDrawerOpen to false", () => {
      const store = getUIStore();
      store.openRightDrawer();
      store.closeRightDrawer();
      expect(store.rightDrawerOpen).toBe(false);
    });
  });

  describe("Display Mode", () => {
    it("initial displayMode is label", () => {
      const store = getUIStore();
      expect(store.displayMode).toBe("label");
    });

    it("toggleDisplayMode cycles through label → image → image-label → label", () => {
      const store = getUIStore();
      expect(store.displayMode).toBe("label");

      store.toggleDisplayMode();
      expect(store.displayMode).toBe("image");

      store.toggleDisplayMode();
      expect(store.displayMode).toBe("image-label");

      store.toggleDisplayMode();
      expect(store.displayMode).toBe("label");
    });

    it("setDisplayMode sets specific mode", () => {
      const store = getUIStore();

      store.setDisplayMode("image");
      expect(store.displayMode).toBe("image");

      store.setDisplayMode("image-label");
      expect(store.displayMode).toBe("image-label");

      store.setDisplayMode("label");
      expect(store.displayMode).toBe("label");
    });

    it("setDisplayMode only accepts valid modes", () => {
      const store = getUIStore();

      store.setDisplayMode("image");
      expect(store.displayMode).toBe("image");

      // Invalid mode should be ignored
      store.setDisplayMode("invalid" as "label" | "image" | "image-label");
      expect(store.displayMode).toBe("image");
    });
  });

  describe("Show Labels On Images (derived from displayMode)", () => {
    it("showLabelsOnImages is false when displayMode is label", () => {
      const store = getUIStore();
      store.setDisplayMode("label");
      expect(store.showLabelsOnImages).toBe(false);
    });

    it("showLabelsOnImages is false when displayMode is image", () => {
      const store = getUIStore();
      store.setDisplayMode("image");
      expect(store.showLabelsOnImages).toBe(false);
    });

    it("showLabelsOnImages is true when displayMode is image-label", () => {
      const store = getUIStore();
      store.setDisplayMode("image-label");
      expect(store.showLabelsOnImages).toBe(true);
    });
  });

  describe("Annotations", () => {
    it("initial showAnnotations is false", () => {
      const store = getUIStore();
      expect(store.showAnnotations).toBe(false);
    });

    it("initial annotationField is name", () => {
      const store = getUIStore();
      expect(store.annotationField).toBe("name");
    });

    it("toggleAnnotations toggles showAnnotations", () => {
      const store = getUIStore();
      expect(store.showAnnotations).toBe(false);

      store.toggleAnnotations();
      expect(store.showAnnotations).toBe(true);

      store.toggleAnnotations();
      expect(store.showAnnotations).toBe(false);
    });

    it("setAnnotations sets showAnnotations explicitly", () => {
      const store = getUIStore();

      store.setAnnotations(true);
      expect(store.showAnnotations).toBe(true);

      store.setAnnotations(false);
      expect(store.showAnnotations).toBe(false);
    });

    it("setAnnotationField sets the annotation field", () => {
      const store = getUIStore();

      store.setAnnotationField("ip");
      expect(store.annotationField).toBe("ip");

      store.setAnnotationField("notes");
      expect(store.annotationField).toBe("notes");

      store.setAnnotationField("asset_tag");
      expect(store.annotationField).toBe("asset_tag");

      store.setAnnotationField("serial");
      expect(store.annotationField).toBe("serial");

      store.setAnnotationField("manufacturer");
      expect(store.annotationField).toBe("manufacturer");

      store.setAnnotationField("name");
      expect(store.annotationField).toBe("name");
    });
  });

  describe("Banana for Scale (Easter Egg)", () => {
    it("initial showBanana is false", () => {
      const store = getUIStore();
      expect(store.showBanana).toBe(false);
    });

    it("toggleBanana toggles showBanana", () => {
      const store = getUIStore();
      expect(store.showBanana).toBe(false);

      store.toggleBanana();
      expect(store.showBanana).toBe(true);

      store.toggleBanana();
      expect(store.showBanana).toBe(false);
    });
  });

  describe("Sidebar Tabs", () => {
    it("initial sidebarTab is devices", () => {
      const store = getUIStore();
      expect(store.sidebarTab).toBe("devices");
    });

    it("setSidebarTab sets the sidebar tab", () => {
      const store = getUIStore();

      store.setSidebarTab("racks");
      expect(store.sidebarTab).toBe("racks");

      store.setSidebarTab("devices");
      expect(store.sidebarTab).toBe("devices");
    });

    it("sidebar tab persists to localStorage", () => {
      const store = getUIStore();
      store.setSidebarTab("racks");
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "Rackula_sidebar_tab",
        "racks",
      );
    });

    it("sidebar tab loads from localStorage", () => {
      // Set up mock to return "racks" when queried for sidebar tab key
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === "Rackula_sidebar_tab") return "racks";
        return null;
      });
      resetUIStore();
      const store = getUIStore();
      expect(store.sidebarTab).toBe("racks");
    });
  });
});
