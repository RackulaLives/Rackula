import { describe, it, expect } from "vitest";
import {
  serializeLayoutToYaml,
  serializeLayoutToYamlWithMetadata,
  parseLayoutYaml,
} from "$lib/utils/yaml";
import type { DeviceType } from "$lib/types";
import {
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
});

describe("YAML editor schema hint (#2230)", () => {
  // Asserted via startsWith/string equality on a captured variable rather than a
  // `toBe("#...")` literal: the latter trips the no-restricted-syntax hardcoded
  // colour rule (any first arg matching /^#/), a false positive for a YAML
  // comment line.
  const HINT_PREFIX = "# yaml-language-server: $schema=";

  it("prepends a yaml-language-server $schema comment as the first line for a v1 layout", async () => {
    const layout = createTestLayout({
      metadata: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Test Layout",
        schema_version: "1.0",
      },
    });

    const yaml = await serializeLayoutToYaml(layout);
    const firstLine = yaml.split("\n")[0];
    const expected = `${HINT_PREFIX}https://count.racku.la/schemas/layout-v1.json`;

    expect(firstLine.startsWith(HINT_PREFIX)).toBe(true);
    expect(firstLine === expected).toBe(true);
  });

  it("derives the schema URL MAJOR from the layout's schema_version", async () => {
    const layout = createTestLayout({
      metadata: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Future Layout",
        schema_version: "2.3",
      },
    });

    const yaml = await serializeLayoutToYaml(layout);
    const firstLine = yaml.split("\n")[0];
    const expected = `${HINT_PREFIX}https://count.racku.la/schemas/layout-v2.json`;

    expect(firstLine === expected).toBe(true);
  });

  it("defaults to MAJOR 1 when schema_version is absent", async () => {
    // createTestLayout has no metadata block, so there is no schema_version.
    const yaml = await serializeLayoutToYaml(createTestLayout());
    const firstLine = yaml.split("\n")[0];
    const expected = `${HINT_PREFIX}https://count.racku.la/schemas/layout-v1.json`;

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
    // carries the same hint, derived from the metadata's schema_version.
    const yaml = await serializeLayoutToYamlWithMetadata(createTestLayout(), {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Archive Lab",
      schema_version: "1.0",
    });
    const firstLine = yaml.split("\n")[0];
    const expected = `${HINT_PREFIX}https://count.racku.la/schemas/layout-v1.json`;

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
