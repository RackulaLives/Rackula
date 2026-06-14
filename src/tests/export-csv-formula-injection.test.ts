import { describe, it, expect } from "vitest";
import { exportToCSV } from "$lib/utils/export/data";
import {
  createTestRack,
  createTestDeviceType,
  createTestDevice,
} from "./factories";

// CSV columns: Position,Name,Model,Manufacturer,U_Height,Category,Face
// The first data row is index 1 (index 0 is the header).
function dataCell(csv: string, column: number): string {
  return csv.split("\n")[1].split(",")[column];
}

describe("exportToCSV formula injection", () => {
  it.each(["=2+2", "+CMD|'/C calc'!A0", "-5+5", "@SUM(A1)"])(
    "neutralizes a leading formula trigger in the device name: %s",
    (payload) => {
      const deviceType = createTestDeviceType({ slug: "srv", model: "Model" });
      const rack = createTestRack({
        devices: [createTestDevice({ device_type: "srv", name: payload })],
      });

      expect(dataCell(exportToCSV(rack, [deviceType]), 1)).toBe(`'${payload}`);
    },
  );

  it("neutralizes a leading formula trigger in the device-type manufacturer", () => {
    const deviceType = createTestDeviceType({
      slug: "srv",
      model: "Model",
      manufacturer: "=HYPERLINK(0)",
    });
    const rack = createTestRack({
      devices: [createTestDevice({ device_type: "srv", name: "Server" })],
    });

    expect(dataCell(exportToCSV(rack, [deviceType]), 3)).toBe("'=HYPERLINK(0)");
  });

  it("leaves a benign value untouched", () => {
    const deviceType = createTestDeviceType({ slug: "srv", model: "Model" });
    const rack = createTestRack({
      devices: [createTestDevice({ device_type: "srv", name: "Server 1" })],
    });

    expect(dataCell(exportToCSV(rack, [deviceType]), 1)).toBe("Server 1");
  });
});
