import { describe, it, expect } from "vitest";
import {
  serializeLayoutToYaml,
  serializeLayoutToYamlWithMetadata,
  parseLayoutYaml,
} from "$lib/utils/yaml";
import type { Cable, DeviceType, PlacedDevice, Rack } from "$lib/types";
import {
  createTestCable,
  createTestContainerChild,
  createTestDevice,
  createTestDeviceType,
  createTestLayout,
  createTestRack,
} from "./factories";

describe("YAML layout round-trip", () => {
  it("preserves auto_created for an auto-synthesized carrier placement", async () => {
    const carrierType = createTestDeviceType({
      slug: "carrier-device",
      u_height: 1,
    });

    const layout = createTestLayout({
      racks: [
        createTestRack({
          id: "rack-1",
          devices: [
            createTestDevice({
              id: "auto-carrier",
              device_type: carrierType.slug,
              position: 10,
              auto_created: true,
            }),
            createTestDevice({
              id: "user-carrier",
              device_type: carrierType.slug,
              position: 14,
            }),
          ],
        }),
      ],
      device_types: [carrierType],
    });

    const yaml = await serializeLayoutToYaml(layout);

    // auto_created must be serialised so a later slice can self-remove
    // auto-synthesized carriers while user-placed carriers persist.
    expect(yaml).toContain("auto_created");

    const restored = await parseLayoutYaml(yaml);
    const auto = restored.racks[0]?.devices.find(
      (d) => d.id === "auto-carrier",
    );
    const user = restored.racks[0]?.devices.find(
      (d) => d.id === "user-carrier",
    );
    expect(auto?.auto_created).toBe(true);
    // A placement that never set the flag round-trips as the default (false).
    expect(user?.auto_created).toBe(false);
  });

  it("preserves container_id and slot_id for contained child devices", async () => {
    const containerType: DeviceType = {
      ...createTestDeviceType({
        slug: "container-device",
        u_height: 2,
      }),
      slots: [{ id: "slot-left", position: { row: 0, col: 0 } }],
    };
    const childType = createTestDeviceType({
      slug: "child-device",
      u_height: 1,
    });

    const layout = createTestLayout({
      racks: [
        createTestRack({
          id: "rack-1",
          devices: [
            createTestDevice({
              id: "container-1",
              device_type: containerType.slug,
              position: 10,
            }),
            createTestContainerChild({
              id: "child-1",
              device_type: childType.slug,
              container_id: "container-1",
              slot_id: "slot-left",
            }),
          ],
        }),
      ],
      device_types: [containerType, childType],
    });

    const yaml = await serializeLayoutToYaml(layout);

    // container_id/slot_id must be serialised so container membership survives save/load
    expect(yaml).toContain("container_id");
    expect(yaml).toContain("slot_id");

    const restored = await parseLayoutYaml(yaml);
    const restoredContainerType = restored.device_types.find(
      (dt) => dt.slug === "container-device",
    );
    expect(restoredContainerType?.slots?.[0]?.id).toBe("slot-left");
    const child = restored.racks[0]?.devices.find((d) => d.id === "child-1");
    expect(child?.container_id).toBe("container-1");
    expect(child?.slot_id).toBe("slot-left");
  });

  it("preserves label, ports, and colour_override on a placed device (#2700)", async () => {
    const deviceType = createTestDeviceType({
      slug: "labelled-device",
      u_height: 1,
    });
    // Captured in a const so the colour assertion below passes an Identifier, not
    // a `toBe("#...")` literal, which the no-restricted-syntax colour rule flags.
    const COLOUR_OVERRIDE = "#ab12cd";

    const layout = createTestLayout({
      racks: [
        createTestRack({
          id: "rack-1",
          devices: [
            createTestDevice({
              id: "device-1",
              device_type: deviceType.slug,
              position: 10,
              label: "Legacy Label",
              colour_override: COLOUR_OVERRIDE,
              ports: [
                {
                  id: "port-1",
                  template_name: "eth0",
                  template_index: 0,
                  type: "1000base-t",
                  label: "Uplink",
                },
              ],
            }),
          ],
        }),
      ],
      device_types: [deviceType],
    });

    const yaml = await serializeLayoutToYaml(layout);
    // All three fields must be written, not silently dropped by the serializer.
    expect(yaml).toContain("colour_override");
    expect(yaml).toContain("ports");
    expect(yaml).toContain("Legacy Label");

    const restored = await parseLayoutYaml(yaml);
    const device = restored.racks[0]?.devices.find((d) => d.id === "device-1");

    expect(device?.label).toBe("Legacy Label");
    expect(device?.colour_override).toBe(COLOUR_OVERRIDE);
    expect(device?.ports?.[0]?.id).toBe("port-1");
    expect(device?.ports?.[0]?.label).toBe("Uplink");
  });

  it("preserves rack.show_rear = false through a round-trip (#2701)", async () => {
    const layout = createTestLayout({
      racks: [createTestRack({ id: "rack-1", show_rear: false })],
    });

    const yaml = await serializeLayoutToYaml(layout);
    // show_rear must be serialised so the rear-view toggle survives reload.
    expect(yaml).toContain("show_rear");

    const restored = await parseLayoutYaml(yaml);
    // Without serialisation this resets to the schema default (true).
    expect(restored.racks[0]?.show_rear).toBe(false);
  });

  it("does not resurrect stale layout.images when the image set is explicitly cleared (#2702)", async () => {
    // A unique marker so we can detect the stale payload re-emerging in the file.
    const STALE_TOKEN = "STALE-IMAGE-PAYLOAD-DO-NOT-RESURRECT";
    const layout = {
      ...createTestLayout(),
      images: {
        "ghost-device": { front: `data:image/png;base64,${STALE_TOKEN}` },
      },
    } as unknown as Parameters<typeof serializeLayoutToYaml>[0];

    // The user cleared every image: serialize with an explicitly-empty image set.
    const yaml = await serializeLayoutToYaml(layout, {});

    // The empty `{}` must count as handled so appendUnknownSections does not copy
    // the stale layout.images back into the file.
    expect(yaml).not.toContain(STALE_TOKEN);
    expect(yaml).not.toContain("ghost-device");
  });
});

describe("YAML editor schema hint (#2230)", () => {
  // Asserted via startsWith/string equality on a captured variable rather than a
  // `toBe("#...")` literal: the latter trips the no-restricted-syntax hardcoded
  // colour rule (any first arg matching /^#/), a false positive for a YAML
  // comment line.
  const HINT_PREFIX = "# yaml-language-server: $schema=";

  it("prepends a yaml-language-server $schema comment as the first line", async () => {
    const layout = createTestLayout({
      metadata: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Test Layout",
        schema_version: "1.0",
      },
    });

    const yaml = await serializeLayoutToYaml(layout);
    const firstLine = yaml.split("\n")[0];
    const expected = `${HINT_PREFIX}https://count.racku.la/schemas/rackula-layout.schema.json`;

    expect(firstLine.startsWith(HINT_PREFIX)).toBe(true);
    expect(firstLine === expected).toBe(true);
  });

  it("still round-trips cleanly with the comment prepended", async () => {
    const layout = createTestLayout({ name: "Round Trip Lab" });

    const yaml = await serializeLayoutToYaml(layout);
    const restored = await parseLayoutYaml(yaml);

    expect(restored.name).toBe("Round Trip Lab");
  });

  it("prepends the hint on the folder-ZIP metadata export path too", async () => {
    // The .rackula.yaml inside a folder ZIP is an editor-openable export, so it
    // carries the same hint.
    const yaml = await serializeLayoutToYamlWithMetadata(createTestLayout(), {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Archive Lab",
      schema_version: "1.0",
    });
    const firstLine = yaml.split("\n")[0];
    const expected = `${HINT_PREFIX}https://count.racku.la/schemas/rackula-layout.schema.json`;

    expect(firstLine === expected).toBe(true);

    // And the file still parses (the comment is ignored on read).
    const restored = await parseLayoutYaml(yaml);
    expect(restored.name).toBeTruthy();
  });
});

describe("YAML unknown top-level section round-trip (#2208)", () => {
  it("preserves an unknown top-level section through a load and resave", async () => {
    // Simulate a file written by a newer build that carries an additive section
    // this build does not recognise.
    const baseYaml = await serializeLayoutToYaml(createTestLayout());
    const yamlWithUnknown = `${baseYaml}\nfuture_section:\n  hello: world\n  count: 3\n`;

    // On load the unknown section rides onto the runtime layout (Zod passthrough).
    const loaded = await parseLayoutYaml(yamlWithUnknown);

    // On resave it must not be silently dropped by the serializer allowlist.
    const resaved = await serializeLayoutToYaml(loaded);
    expect(resaved).toContain("future_section");

    const reloaded = (await parseLayoutYaml(resaved)) as unknown as Record<
      string,
      unknown
    >;
    expect(reloaded.future_section).toEqual({ hello: "world", count: 3 });
  });

  it("re-emits unrecognised top-level keys present on a layout object", async () => {
    const layout = {
      ...createTestLayout(),
      experimental_flag: 42,
      annotations: [{ id: "a1", text: "note" }],
    } as unknown as Parameters<typeof serializeLayoutToYaml>[0];

    const yaml = await serializeLayoutToYaml(layout);
    expect(yaml).toContain("experimental_flag");
    expect(yaml).toContain("annotations");

    const restored = (await parseLayoutYaml(yaml)) as unknown as Record<
      string,
      unknown
    >;
    expect(restored.experimental_flag).toBe(42);
    expect(restored.annotations).toEqual([{ id: "a1", text: "note" }]);
  });

  it("does not invent keys for a layout with no unknown sections", async () => {
    const layout = createTestLayout();
    const yaml = await serializeLayoutToYaml(layout);
    const restored = await parseLayoutYaml(yaml);
    expect(restored.name).toBe(layout.name);
    // A clean layout has no stray top-level "future"/"unknown" markers.
    expect(yaml).not.toContain("undefined");
  });

  it("preserves connections, which the serializer does not write explicitly", async () => {
    const layout = {
      ...createTestLayout(),
      connections: [
        {
          id: "c1",
          a_device_id: "d1",
          a_interface: "eth0",
          b_device_id: "d2",
          b_interface: "eth0",
        },
      ],
    } as unknown as Parameters<typeof serializeLayoutToYaml>[0];

    const yaml = await serializeLayoutToYaml(layout);
    expect(yaml).toContain("connections");
    expect(yaml).toContain("c1");
  });

  it("does not copy prototype-polluting keys from a crafted layout", async () => {
    const layout = createTestLayout() as unknown as Record<string, unknown>;
    // Hostile own enumerable keys a crafted YAML file could carry.
    Object.defineProperty(layout, "__proto__", {
      value: { hacked: true },
      enumerable: true,
      configurable: true,
      writable: true,
    });
    layout.constructor = { hacked: true };
    layout.prototype = { hacked: true };

    const yaml = await serializeLayoutToYaml(
      layout as unknown as Parameters<typeof serializeLayoutToYaml>[0],
    );

    // None of the reserved keys are emitted, and the global prototype is intact.
    expect(yaml).not.toContain("hacked");
    expect(({} as Record<string, unknown>).hacked).toBeUndefined();
  });
});

describe("YAML nested unknown-field round-trip (#2927)", () => {
  it("preserves an unknown field on a device type through a save/load/save round-trip", async () => {
    const deviceType = {
      ...createTestDeviceType({ slug: "future-device" }),
      future_dt_field: "keep-me",
    } as unknown as DeviceType;

    const layout = createTestLayout({ device_types: [deviceType] });

    const yaml = await serializeLayoutToYaml(layout);
    expect(yaml).toContain("future_dt_field");

    const restored = await parseLayoutYaml(yaml);
    const restoredType = restored.device_types.find(
      (dt) => dt.slug === "future-device",
    ) as unknown as Record<string, unknown> | undefined;
    expect(restoredType?.future_dt_field).toBe("keep-me");

    // A second resave must not drop it now that it round-tripped once already.
    const resaved = await serializeLayoutToYaml(restored);
    expect(resaved).toContain("future_dt_field");
  });

  it("preserves an unknown field on a placed device through a save/load/save round-trip", async () => {
    const deviceType = createTestDeviceType({ slug: "host-device" });
    const device = {
      ...createTestDevice({ id: "device-1", device_type: deviceType.slug }),
      future_pd_field: "keep-me",
    } as unknown as PlacedDevice;

    const layout = createTestLayout({
      racks: [createTestRack({ id: "rack-1", devices: [device] })],
      device_types: [deviceType],
    });

    const yaml = await serializeLayoutToYaml(layout);
    expect(yaml).toContain("future_pd_field");

    const restored = await parseLayoutYaml(yaml);
    const restoredDevice = restored.racks[0]?.devices.find(
      (d) => d.id === "device-1",
    ) as unknown as Record<string, unknown> | undefined;
    expect(restoredDevice?.future_pd_field).toBe("keep-me");

    const resaved = await serializeLayoutToYaml(restored);
    expect(resaved).toContain("future_pd_field");
  });

  it("preserves an unknown field on a rack through a save/load/save round-trip", async () => {
    const rack = {
      ...createTestRack({ id: "rack-1" }),
      future_rack_field: "keep-me",
    } as unknown as Rack;

    const layout = createTestLayout({ racks: [rack] });

    const yaml = await serializeLayoutToYaml(layout);
    expect(yaml).toContain("future_rack_field");

    const restored = await parseLayoutYaml(yaml);
    const restoredRack = restored.racks.find(
      (r) => r.id === "rack-1",
    ) as unknown as Record<string, unknown> | undefined;
    expect(restoredRack?.future_rack_field).toBe("keep-me");

    const resaved = await serializeLayoutToYaml(restored);
    expect(resaved).toContain("future_rack_field");
  });

  it("preserves an unknown field on a cable through a save/load/save round-trip", async () => {
    const deviceA = createTestDevice({ id: "device-a", position: 10 });
    const deviceB = createTestDevice({ id: "device-b", position: 12 });
    const deviceType = createTestDeviceType({ slug: "test-device" });
    const cable = {
      ...createTestCable({
        id: "cable-1",
        a_device_id: "device-a",
        b_device_id: "device-b",
      }),
      future_cable_field: "keep-me",
    } as unknown as Cable;

    const layout = createTestLayout({
      racks: [createTestRack({ id: "rack-1", devices: [deviceA, deviceB] })],
      device_types: [deviceType],
      cables: [cable],
    });

    const yaml = await serializeLayoutToYaml(layout);
    expect(yaml).toContain("future_cable_field");

    const restored = await parseLayoutYaml(yaml);
    const restoredCable = restored.cables?.find(
      (c) => c.id === "cable-1",
    ) as unknown as Record<string, unknown> | undefined;
    expect(restoredCable?.future_cable_field).toBe("keep-me");

    const resaved = await serializeLayoutToYaml(restored);
    expect(resaved).toContain("future_cable_field");
  });

  it("preserves the known-but-unlisted rack_widths field on a device type through a round-trip", async () => {
    const deviceType = createTestDeviceType({
      slug: "mini-rack-device",
      rack_widths: [10],
    });
    const layout = createTestLayout({ device_types: [deviceType] });

    const yaml = await serializeLayoutToYaml(layout);
    expect(yaml).toContain("rack_widths");

    const restored = await parseLayoutYaml(yaml);
    const restoredType = restored.device_types.find(
      (dt) => dt.slug === "mini-rack-device",
    );
    expect(restoredType?.rack_widths).toEqual([10]);
  });

  it("preserves an explicitly-empty rack_widths array on a device type through a round-trip", async () => {
    const deviceType = createTestDeviceType({
      slug: "explicit-empty-device",
      rack_widths: [],
    });
    const layout = createTestLayout({ device_types: [deviceType] });

    const yaml = await serializeLayoutToYaml(layout);
    expect(yaml).toContain("rack_widths");

    const restored = await parseLayoutYaml(yaml);
    const restoredType = restored.device_types.find(
      (dt) => dt.slug === "explicit-empty-device",
    );
    // An explicitly-set empty array must survive save/load, not be silently
    // dropped to `undefined`.
    expect(restoredType?.rack_widths).toEqual([]);
  });
});
