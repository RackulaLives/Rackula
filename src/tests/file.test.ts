import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { openFilePicker, readFileAsText } from "$lib/utils/file";

describe("File Utilities", () => {
  describe("openFilePicker", () => {
    let originalCreateElement: typeof document.createElement;
    let mockInput: HTMLInputElement;

    beforeEach(() => {
      originalCreateElement = document.createElement.bind(document);

      // Create a real input element to mock
      mockInput = originalCreateElement("input") as HTMLInputElement;
      Object.defineProperty(mockInput, "files", {
        value: null,
        writable: true,
      });

      // Mock createElement to return our mock input
      vi.spyOn(document, "createElement").mockImplementation(
        (tagName: string) => {
          if (tagName === "input") {
            return mockInput;
          }
          return originalCreateElement(tagName);
        },
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('creates an input element with type="file"', async () => {
      // Simulate file selection
      setTimeout(() => {
        Object.defineProperty(mockInput, "files", {
          value: [new File(["test"], "test.zip", { type: "application/zip" })],
        });
        mockInput.dispatchEvent(new Event("change"));
      }, 10);

      await openFilePicker();

      expect(mockInput.type).toBe("file");
    });

    it("accepts zip files", async () => {
      setTimeout(() => {
        Object.defineProperty(mockInput, "files", {
          value: [new File(["test"], "test.zip", { type: "application/zip" })],
        });
        mockInput.dispatchEvent(new Event("change"));
      }, 10);

      await openFilePicker();

      // Should accept .zip files
      expect(mockInput.accept).toContain(".zip");
    });

    it("returns the selected file", async () => {
      const testFile = new File(["test content"], "layout.Rackula.zip", {
        type: "application/zip",
      });

      setTimeout(() => {
        Object.defineProperty(mockInput, "files", {
          value: [testFile],
        });
        mockInput.dispatchEvent(new Event("change"));
      }, 10);

      const result = await openFilePicker();

      expect(result).toBe(testFile);
    });

    it("returns null when no file is selected", async () => {
      setTimeout(() => {
        Object.defineProperty(mockInput, "files", {
          value: [],
        });
        mockInput.dispatchEvent(new Event("change"));
      }, 10);

      const result = await openFilePicker();

      expect(result).toBeNull();
    });

    it("handles rapid file selection correctly (race condition fix)", async () => {
      // This test simulates the race condition where focus fires
      // very close to change, potentially before the change handler completes
      const testFile = new File(["test"], "rapid.zip", {
        type: "application/zip",
      });

      setTimeout(() => {
        // Simulate focus firing (dialog closing)
        window.dispatchEvent(new Event("focus"));

        // Immediately after, change fires with file
        Object.defineProperty(mockInput, "files", {
          value: [testFile],
        });
        mockInput.dispatchEvent(new Event("change"));
      }, 10);

      const result = await openFilePicker();

      // Should return the file, not null (cancel)
      expect(result).toBe(testFile);
    });

    it("returns null on cancel even with rapid interaction", async () => {
      // Focus fires, no change follows within timeout
      setTimeout(() => {
        window.dispatchEvent(new Event("focus"));
        // No change event - simulates actual cancel
      }, 10);

      const result = await openFilePicker();

      // Should correctly detect cancel
      expect(result).toBeNull();
    }, 3000);
  });

  describe("readFileAsText", () => {
    it("reads file content as text", async () => {
      const content = "Hello, World!";
      const file = new File([content], "test.txt", { type: "text/plain" });

      const result = await readFileAsText(file);

      expect(result).toBe(content);
    });

    it("reads YAML content correctly", async () => {
      const yamlContent = `name: Test Layout
version: 0.3.0
racks:
  - name: Main Rack
    height: 42`;
      const file = new File([yamlContent], "test.yaml", { type: "text/yaml" });

      const result = await readFileAsText(file);

      expect(result).toBe(yamlContent);
      expect(result).toContain("name: Test Layout");
    });

    it("handles empty files", async () => {
      const file = new File([""], "empty.txt", { type: "text/plain" });

      const result = await readFileAsText(file);

      expect(result).toBe("");
    });
  });
});
