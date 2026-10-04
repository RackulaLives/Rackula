import { describe, it, expect } from "vitest";
import { exportConnectionsToCSV } from "$lib/utils/export/data";
import type { DeviceType, InterfaceTemplate, PlacedPort } from "$lib/types";
import {
  createTestRack,
  createTestDeviceType,
  createTestDevice,
  createTestInterfaceTemplate,
  createTestPlacedPort,
  createTestConnection,
  createTestContainerChild,
} from "./factories";

const HEADER =
  "Source Rack,Source Device,Source Port,Direction,Destination Rack,Destination Device,Destination Port,Signal,Label/Notes";

// Split a CSV with no quoted fields into rows of cells.
function rows(csv: string): string[][] {
  return csv
    .split("\n")
    .slice(1)
    .map((line) => line.split(","));
}

// A device type whose interfaces are the given templates, plus a placed port
// per template with a predictable id (`${slug}-${index}`).
function deviceWithPorts(
  slug: string,
  interfaces: InterfaceTemplate[],
  portOverrides: Partial<PlacedPort>[] = [],
): { deviceType: DeviceType; ports: PlacedPort[] } {
  const deviceType = {
    ...createTestDeviceType({ slug, model: slug }),
    interfaces,
  };
  const ports = interfaces.map((iface, index) =>
    createTestPlacedPort({
      id: `${slug}-${index}`,
      template_name: iface.name,
      template_index: index,
      type: iface.type,
      ...portOverrides[index],
    }),
  );
  return { deviceType, ports };
}

const xlrOut = (name: string) =>
  createTestInterfaceTemplate({ name, type: "xlr-3", direction: "output" });
const xlrIn = (name: string) =>
  createTestInterfaceTemplate({ name, type: "xlr-3", direction: "input" });

describe("exportConnectionsToCSV", () => {
  it("writes the patch list header", () => {
    const { csv } = exportConnectionsToCSV([], [], []);
    expect(csv).toBe(HEADER);
  });

  it("orders a row from the output port to the input port, whichever is stored as a", () => {
    const desk = deviceWithPorts("console", [xlrOut("Out 1")]);
    const amp = deviceWithPorts("amp", [xlrIn("In A")]);
    const rack = createTestRack({
      name: "FOH",
      devices: [
        createTestDevice({ device_type: "console", ports: desk.ports }),
        createTestDevice({ device_type: "amp", ports: amp.ports }),
      ],
    });
    const connection = createTestConnection({
      a_port_id: "amp-0",
      b_port_id: "console-0",
    });

    const { csv } = exportConnectionsToCSV(
      [rack],
      [connection],
      [desk.deviceType, amp.deviceType],
    );

    expect(rows(csv)).toEqual([
      ["FOH", "console", "Out 1", "→", "FOH", "amp", "In A", "Line level", ""],
    ]);
  });

  it("keeps stored a-then-b order and marks the row bidirectional when direction is unresolved", () => {
    const eth = createTestInterfaceTemplate({ name: "eth0" });
    const sw = deviceWithPorts("switch", [eth]);
    const nas = deviceWithPorts("nas", [eth]);
    const rack = createTestRack({
      name: "R1",
      devices: [
        createTestDevice({ device_type: "switch", ports: sw.ports }),
        createTestDevice({ device_type: "nas", ports: nas.ports }),
      ],
    });
    const connection = createTestConnection({
      a_port_id: "nas-0",
      b_port_id: "switch-0",
    });

    const { csv } = exportConnectionsToCSV(
      [rack],
      [connection],
      [sw.deviceType, nas.deviceType],
    );

    expect(rows(csv)).toEqual([
      ["R1", "nas", "eth0", "↔", "R1", "switch", "eth0", "", ""],
    ]);
  });

  it("uses the port label when set and the template name otherwise", () => {
    const desk = deviceWithPorts(
      "console",
      [xlrOut("Out 1")],
      [{ label: "Main L" }],
    );
    const amp = deviceWithPorts("amp", [xlrIn("In A")]);
    const rack = createTestRack({
      devices: [
        createTestDevice({ device_type: "console", ports: desk.ports }),
        createTestDevice({ device_type: "amp", ports: amp.ports }),
      ],
    });

    const { csv } = exportConnectionsToCSV(
      [rack],
      [createTestConnection({ a_port_id: "console-0", b_port_id: "amp-0" })],
      [desk.deviceType, amp.deviceType],
    );

    const [row] = rows(csv);
    expect(row![2]).toBe("Main L");
    expect(row![6]).toBe("In A");
  });

  it("prefers the placed device name over the device type model", () => {
    const desk = deviceWithPorts("console", [xlrOut("Out 1")]);
    const amp = deviceWithPorts("amp", [xlrIn("In A")]);
    const rack = createTestRack({
      devices: [
        createTestDevice({
          device_type: "console",
          name: "FOH Desk",
          ports: desk.ports,
        }),
        createTestDevice({ device_type: "amp", ports: amp.ports }),
      ],
    });

    const { csv } = exportConnectionsToCSV(
      [rack],
      [createTestConnection({ a_port_id: "console-0", b_port_id: "amp-0" })],
      [desk.deviceType, amp.deviceType],
    );

    const [row] = rows(csv);
    expect(row![1]).toBe("FOH Desk");
    expect(row![5]).toBe("amp");
  });

  it("resolves the signal from the port override before the template and inference", () => {
    const desk = deviceWithPorts(
      "console",
      [
        createTestInterfaceTemplate({
          name: "Out 1",
          type: "xlr-3",
          direction: "output",
          signal_type: "digital-audio-aes3",
        }),
        xlrOut("Out 2"),
      ],
      [{ signal_type: "analog-audio-mic" }],
    );
    const amp = deviceWithPorts("amp", [xlrIn("In A"), xlrIn("In B")]);
    const rack = createTestRack({
      devices: [
        createTestDevice({ device_type: "console", ports: desk.ports }),
        createTestDevice({ device_type: "amp", ports: amp.ports }),
      ],
    });
    const connections = [
      createTestConnection({ a_port_id: "console-0", b_port_id: "amp-0" }),
      createTestConnection({ a_port_id: "console-1", b_port_id: "amp-1" }),
    ];

    const { csv } = exportConnectionsToCSV([rack], connections, [
      desk.deviceType,
      amp.deviceType,
    ]);

    expect(rows(csv).map((row) => row[7])).toEqual(["Mic level", "Line level"]);
  });

  it("takes an explicit signal from the destination over a signal inferred at the source", () => {
    const desk = deviceWithPorts("console", [xlrOut("Out 1")]);
    const amp = deviceWithPorts("amp", [
      createTestInterfaceTemplate({
        name: "AES In",
        type: "xlr-3",
        direction: "input",
        signal_type: "digital-audio-aes3",
      }),
    ]);
    const rack = createTestRack({
      devices: [
        createTestDevice({ device_type: "console", ports: desk.ports }),
        createTestDevice({ device_type: "amp", ports: amp.ports }),
      ],
    });

    const { csv } = exportConnectionsToCSV(
      [rack],
      [createTestConnection({ a_port_id: "console-0", b_port_id: "amp-0" })],
      [desk.deviceType, amp.deviceType],
    );

    expect(rows(csv)[0]![7]).toBe("AES3");
  });

  it("orders rows by source rack, then device top to bottom, then port index", () => {
    const stagebox = deviceWithPorts("stagebox", [
      xlrOut("Out 1"),
      xlrOut("Out 2"),
    ]);
    const desk = deviceWithPorts("console", [xlrOut("Out 1")]);
    const playback = deviceWithPorts("playback", [xlrOut("Out 1")]);
    const amp = deviceWithPorts("amp", [
      xlrIn("In A"),
      xlrIn("In B"),
      xlrIn("In C"),
      xlrIn("In D"),
    ]);
    const stage = createTestRack({
      name: "Stage",
      devices: [
        createTestDevice({
          device_type: "stagebox",
          position: 2,
          ports: stagebox.ports,
        }),
      ],
    });
    const foh = createTestRack({
      name: "FOH",
      devices: [
        createTestDevice({ device_type: "amp", position: 1, ports: amp.ports }),
        createTestDevice({
          device_type: "playback",
          position: 5,
          ports: playback.ports,
        }),
        createTestDevice({
          device_type: "console",
          position: 10,
          ports: desk.ports,
        }),
      ],
    });
    // Stored in an order that matches none of the sort keys.
    const connections = [
      createTestConnection({ a_port_id: "stagebox-1", b_port_id: "amp-1" }),
      createTestConnection({ a_port_id: "amp-2", b_port_id: "console-0" }),
      createTestConnection({ a_port_id: "stagebox-0", b_port_id: "amp-0" }),
      createTestConnection({ a_port_id: "playback-0", b_port_id: "amp-3" }),
    ];

    const { csv } = exportConnectionsToCSV([foh, stage], connections, [
      stagebox.deviceType,
      desk.deviceType,
      playback.deviceType,
      amp.deviceType,
    ]);

    expect(rows(csv).map((row) => row.slice(0, 3))).toEqual([
      ["FOH", "console", "Out 1"],
      ["FOH", "playback", "Out 1"],
      ["Stage", "stagebox", "Out 1"],
      ["Stage", "stagebox", "Out 2"],
    ]);
  });

  it("orders a container child at its container's rack position", () => {
    const wireless = deviceWithPorts("wireless", [xlrOut("Out 1")]);
    const playback = deviceWithPorts("playback", [xlrOut("Out 1")]);
    const amp = deviceWithPorts("amp", [xlrIn("In A"), xlrIn("In B")]);
    const rack = createTestRack({
      devices: [
        createTestDevice({ device_type: "amp", position: 1, ports: amp.ports }),
        createTestDevice({
          device_type: "playback",
          position: 5,
          ports: playback.ports,
        }),
        createTestDevice({ id: "shelf", device_type: "shelf", position: 10 }),
        createTestContainerChild({
          container_id: "shelf",
          slot_id: "slot-left",
          device_type: "wireless",
          ports: wireless.ports,
        }),
      ],
    });
    const connections = [
      createTestConnection({ a_port_id: "playback-0", b_port_id: "amp-0" }),
      createTestConnection({ a_port_id: "wireless-0", b_port_id: "amp-1" }),
    ];

    const { csv } = exportConnectionsToCSV([rack], connections, [
      wireless.deviceType,
      playback.deviceType,
      amp.deviceType,
    ]);

    expect(rows(csv).map((row) => row[1])).toEqual(["wireless", "playback"]);
  });

  it("escapes CSV fields and neutralizes formula injection", () => {
    const desk = deviceWithPorts("console", [xlrOut("Out 1")]);
    const amp = deviceWithPorts("amp", [xlrIn("In A")]);
    const rack = createTestRack({
      name: "Rack, Left",
      devices: [
        createTestDevice({ device_type: "console", ports: desk.ports }),
        createTestDevice({ device_type: "amp", ports: amp.ports }),
      ],
    });
    const connection = createTestConnection({
      a_port_id: "console-0",
      b_port_id: "amp-0",
      label: "=HYPERLINK(0)",
    });

    const { csv } = exportConnectionsToCSV(
      [rack],
      [connection],
      [desk.deviceType, amp.deviceType],
    );

    expect(csv.split("\n")[1]).toBe(
      `"Rack, Left",console,Out 1,→,"Rack, Left",amp,In A,Line level,'=HYPERLINK(0)`,
    );
  });

  it("skips and counts a connection whose port does not resolve, instead of emitting a broken row", () => {
    const desk = deviceWithPorts("console", [xlrOut("Out 1")]);
    const amp = deviceWithPorts("amp", [xlrIn("In A")]);
    const rack = createTestRack({
      devices: [
        createTestDevice({ device_type: "console", ports: desk.ports }),
        createTestDevice({ device_type: "amp", ports: amp.ports }),
      ],
    });
    const connections = [
      createTestConnection({ a_port_id: "console-0", b_port_id: "missing" }),
      createTestConnection({ a_port_id: "console-0", b_port_id: "amp-0" }),
    ];

    const { csv, skipped } = exportConnectionsToCSV([rack], connections, [
      desk.deviceType,
      amp.deviceType,
    ]);

    expect(skipped).toBe(1);
    expect(rows(csv).map((row) => row[6])).toEqual(["In A"]);
  });
});
