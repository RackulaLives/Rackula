import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import AnnotationColumn from "$lib/components/AnnotationColumn.svelte";
import type { Rack, DeviceType, AnnotationField } from "$lib/types";

// Test fixtures
const createTestRack = (devices: Rack["devices"] = []): Rack => ({
  id: "test-rack",
  name: "Test Rack",
  height: 42,
  width: "19in",
  devices,
});

const createTestDeviceLibrary = (): DeviceType[] => [
  {
    slug: "server-1u",
    model: "PowerEdge R640",
    manufacturer: "Dell",
    u_height: 1,
    form_factor: "1U",
    asset_tag: "ASSET-001",
    serial_number: "SN-12345",
  },
  {
    slug: "server-2u",
    model: "ProLiant DL380",
    manufacturer: "HPE",
    u_height: 2,
    form_factor: "2U",
    asset_tag: "ASSET-002",
    serial_number: "SN-67890",
  },
  {
    slug: "switch-1u",
    model: "Catalyst 9300",
    manufacturer: "Cisco",
    u_height: 1,
    form_factor: "1U",
  },
];

// Helper to get annotation text content (excludes title element)
function getAnnotationTexts(): string[] {
  const texts = document.querySelectorAll(".annotation-text");
  return Array.from(texts).map((el) => {
    // Get direct text content, excluding nested title element
    const clone = el.cloneNode(true) as Element;
    const title = clone.querySelector("title");
    if (title) title.remove();
    return clone.textContent?.trim() ?? "";
  });
}

describe("AnnotationColumn", () => {
  describe("Rendering", () => {
    it("renders without devices", () => {
      const rack = createTestRack();
      const deviceLibrary = createTestDeviceLibrary();

      render(AnnotationColumn, {
        props: {
          rack,
          deviceLibrary,
          annotationField: "name" as AnnotationField,
        },
      });

      const svg = document.querySelector(".annotation-svg");
      expect(svg).toBeTruthy();
    });

    it("renders annotations for each device", () => {
      const rack = createTestRack([
        {
          id: "device-1",
          device_type: "server-1u",
          position: 10,
          face: "front",
          name: "Web Server",
        },
        {
          id: "device-2",
          device_type: "server-2u",
          position: 5,
          face: "front",
          name: "Database Server",
        },
      ]);
      const deviceLibrary = createTestDeviceLibrary();

      render(AnnotationColumn, {
        props: {
          rack,
          deviceLibrary,
          annotationField: "name" as AnnotationField,
        },
      });

      const texts = document.querySelectorAll(".annotation-text");
      expect(texts.length).toBe(2);
    });

    it("applies custom width", () => {
      const rack = createTestRack();
      const deviceLibrary = createTestDeviceLibrary();

      render(AnnotationColumn, {
        props: {
          rack,
          deviceLibrary,
          annotationField: "name" as AnnotationField,
          width: 150,
        },
      });

      const column = document.querySelector(".annotation-column");
      expect(column).toBeTruthy();
      expect((column as HTMLElement).style.width).toBe("150px");
    });
  });

  describe("Field Values", () => {
    it("displays device name when annotationField is name", () => {
      const rack = createTestRack([
        {
          id: "device-1",
          device_type: "server-1u",
          position: 10,
          face: "front",
          name: "Custom Name",
        },
      ]);
      const deviceLibrary = createTestDeviceLibrary();

      render(AnnotationColumn, {
        props: {
          rack,
          deviceLibrary,
          annotationField: "name" as AnnotationField,
        },
      });

      const texts = getAnnotationTexts();
      expect(texts).toContain("Custom Name");
    });

    it("falls back to model name when device name is not set", () => {
      const rack = createTestRack([
        {
          id: "device-1",
          device_type: "server-1u",
          position: 10,
          face: "front",
        },
      ]);
      const deviceLibrary = createTestDeviceLibrary();

      render(AnnotationColumn, {
        props: {
          rack,
          deviceLibrary,
          annotationField: "name" as AnnotationField,
        },
      });

      const texts = getAnnotationTexts();
      expect(texts).toContain("PowerEdge R640");
    });

    it("displays IP from custom_fields when annotationField is ip", () => {
      const rack = createTestRack([
        {
          id: "device-1",
          device_type: "server-1u",
          position: 10,
          face: "front",
          custom_fields: { ip: "192.168.1.100" },
        },
      ]);
      const deviceLibrary = createTestDeviceLibrary();

      render(AnnotationColumn, {
        props: {
          rack,
          deviceLibrary,
          annotationField: "ip" as AnnotationField,
        },
      });

      const texts = getAnnotationTexts();
      expect(texts).toContain("192.168.1.100");
    });

    it("displays notes when annotationField is notes", () => {
      const rack = createTestRack([
        {
          id: "device-1",
          device_type: "server-1u",
          position: 10,
          face: "front",
          notes: "Web server",
        },
      ]);
      const deviceLibrary = createTestDeviceLibrary();

      render(AnnotationColumn, {
        props: {
          rack,
          deviceLibrary,
          annotationField: "notes" as AnnotationField,
        },
      });

      const texts = getAnnotationTexts();
      expect(texts).toContain("Web server");
    });

    it("displays manufacturer from device type when annotationField is manufacturer", () => {
      const rack = createTestRack([
        {
          id: "device-1",
          device_type: "server-1u",
          position: 10,
          face: "front",
        },
      ]);
      const deviceLibrary = createTestDeviceLibrary();

      render(AnnotationColumn, {
        props: {
          rack,
          deviceLibrary,
          annotationField: "manufacturer" as AnnotationField,
        },
      });

      const texts = getAnnotationTexts();
      expect(texts).toContain("Dell");
    });

    it("displays asset_tag from device type when annotationField is asset_tag", () => {
      const rack = createTestRack([
        {
          id: "device-1",
          device_type: "server-1u",
          position: 10,
          face: "front",
        },
      ]);
      const deviceLibrary = createTestDeviceLibrary();

      render(AnnotationColumn, {
        props: {
          rack,
          deviceLibrary,
          annotationField: "asset_tag" as AnnotationField,
        },
      });

      const texts = getAnnotationTexts();
      expect(texts).toContain("ASSET-001");
    });

    it("displays serial from device type when annotationField is serial", () => {
      const rack = createTestRack([
        {
          id: "device-1",
          device_type: "server-1u",
          position: 10,
          face: "front",
        },
      ]);
      const deviceLibrary = createTestDeviceLibrary();

      render(AnnotationColumn, {
        props: {
          rack,
          deviceLibrary,
          annotationField: "serial" as AnnotationField,
        },
      });

      const texts = getAnnotationTexts();
      expect(texts).toContain("SN-12345");
    });
  });

  describe("Empty Values", () => {
    it("shows em-dash for missing IP", () => {
      const rack = createTestRack([
        {
          id: "device-1",
          device_type: "server-1u",
          position: 10,
          face: "front",
        },
      ]);
      const deviceLibrary = createTestDeviceLibrary();

      render(AnnotationColumn, {
        props: {
          rack,
          deviceLibrary,
          annotationField: "ip" as AnnotationField,
        },
      });

      const texts = getAnnotationTexts();
      expect(texts).toContain("—");
    });

    it("applies empty class to empty values", () => {
      const rack = createTestRack([
        {
          id: "device-1",
          device_type: "server-1u",
          position: 10,
          face: "front",
        },
      ]);
      const deviceLibrary = createTestDeviceLibrary();

      render(AnnotationColumn, {
        props: {
          rack,
          deviceLibrary,
          annotationField: "ip" as AnnotationField,
        },
      });

      const text = document.querySelector(".annotation-text.empty");
      expect(text).toBeTruthy();
    });
  });

  describe("Text Truncation", () => {
    it("truncates long values", () => {
      const rack = createTestRack([
        {
          id: "device-1",
          device_type: "server-1u",
          position: 10,
          face: "front",
          name: "This is a very long device name that should be truncated",
        },
      ]);
      const deviceLibrary = createTestDeviceLibrary();

      render(AnnotationColumn, {
        props: {
          rack,
          deviceLibrary,
          annotationField: "name" as AnnotationField,
        },
      });

      const texts = getAnnotationTexts();
      expect(texts[0].length).toBeLessThanOrEqual(15);
      expect(texts[0].endsWith("…")).toBe(true);
    });

    it("shows full value in title for tooltip", () => {
      const fullName =
        "This is a very long device name that should be truncated";
      const rack = createTestRack([
        {
          id: "device-1",
          device_type: "server-1u",
          position: 10,
          face: "front",
          name: fullName,
        },
      ]);
      const deviceLibrary = createTestDeviceLibrary();

      render(AnnotationColumn, {
        props: {
          rack,
          deviceLibrary,
          annotationField: "name" as AnnotationField,
        },
      });

      const title = document.querySelector(".annotation-text title");
      expect(title?.textContent).toBe(fullName);
    });
  });

  describe("Unknown Device Type", () => {
    it("handles device with unknown device_type gracefully", () => {
      const rack = createTestRack([
        {
          id: "device-1",
          device_type: "unknown-device",
          position: 10,
          face: "front",
          name: "Mystery Device",
        },
      ]);
      const deviceLibrary = createTestDeviceLibrary();

      render(AnnotationColumn, {
        props: {
          rack,
          deviceLibrary,
          annotationField: "name" as AnnotationField,
        },
      });

      const texts = getAnnotationTexts();
      expect(texts).toContain("Mystery Device");
    });

    it("shows em-dash for manufacturer when device type is unknown", () => {
      const rack = createTestRack([
        {
          id: "device-1",
          device_type: "unknown-device",
          position: 10,
          face: "front",
        },
      ]);
      const deviceLibrary = createTestDeviceLibrary();

      render(AnnotationColumn, {
        props: {
          rack,
          deviceLibrary,
          annotationField: "manufacturer" as AnnotationField,
        },
      });

      const texts = getAnnotationTexts();
      expect(texts).toContain("—");
    });
  });
});
