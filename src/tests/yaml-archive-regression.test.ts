/**
 * YAML save/reload and legacy ZIP load regression coverage (#1114).
 *
 * These tests guard the user-facing "save layout, reload it later" workflow
 * against silent data loss as the data format evolves. They drive the public
 * load entrypoint (extractFolderArchive) with the same byte shapes the export
 * path writes, plus the legacy ZIP shapes older builds produced, so a future
 * change to the serializer or the archive reader that drops a section fails
 * loudly here.
 *
 * Scope note: the issue's git-sync coverage half was re-scoped out (no sync
 * code exists during M03; split to an M08 issue against #627). This file
 * covers the implementable half: YAML round-trip of representative layouts and
 * legacy ZIP compatibility.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { extractFolderArchive } from "$lib/utils/archive";
import {
  serializeLayoutToYaml,
  serializeLayoutToYamlWithMetadata,
} from "$lib/utils/yaml";
import { toInternalUnits } from "$lib/utils/position";
import type { Cable, Layout, RackGroup } from "$lib/types";
import {
  createTestDevice,
  createTestDeviceType,
  createTestLayout,
  createTestRack,
} from "./factories";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

/**
 * A layout that exercises every structural section the serializer writes:
 * metadata, multiple racks, multiple device types, placed devices, rack_groups,
 * cables, and settings. Used as the "representative layout" for round-trip
 * assertions.
 */
function representativeLayout(): Layout {
  const switchType = createTestDeviceType({
    slug: "switch-1u",
    u_height: 1,
    manufacturer: "Acme",
    category: "network",
  });
  const serverType = createTestDeviceType({
    slug: "server-2u",
    u_height: 2,
    manufacturer: "Acme",
    category: "server",
  });

  const rackA = createTestRack({
    id: "rack-a",
    name: "Rack A",
    devices: [
      createTestDevice({
        id: "dev-switch",
        device_type: "switch-1u",
        position: 40,
      }),
      createTestDevice({
        id: "dev-server",
        device_type: "server-2u",
        position: 10,
      }),
    ],
  });
  const rackB = createTestRack({
    id: "rack-b",
    name: "Rack B",
    devices: [],
  });

  const rackGroups: RackGroup[] = [
    {
      id: "group-1",
      name: "Row 1",
      rack_ids: ["rack-a", "rack-b"],
      layout_preset: "row",
    },
  ];

  const cables: Cable[] = [
    {
      id: "cable-1",
      a_device_id: "dev-switch",
      a_interface: "eth0",
      b_device_id: "dev-server",
      b_interface: "eth1",
      type: "cat6a",
      label: "uplink",
    },
  ];

  return createTestLayout({
    name: "Representative Lab",
    racks: [rackA, rackB],
    device_types: [switchType, serverType],
    rack_groups: rackGroups,
    cables,
    metadata: { id: UUID, name: "Representative Lab", schema_version: "1.0" },
  });
}

/** Build a new-format (#919) folder ZIP for a layout, the export-path shape. */
async function newFormatZipBlob(layout: Layout): Promise<Blob> {
  const yaml = await serializeLayoutToYamlWithMetadata(layout, {
    id: UUID,
    name: layout.name,
    schema_version: "1.0",
  });
  const zip = new JSZip();
  const folder = zip.folder(`${layout.name}-${UUID}`);
  folder?.file("layout.rackula.yaml", yaml);
  return zip.generateAsync({ type: "blob" });
}

describe("representative layout save/reload round-trip (#1114)", () => {
  it("preserves every structural section through a folder-ZIP save and reload", async () => {
    const original = representativeLayout();
    const blob = await newFormatZipBlob(original);

    const { layout } = await extractFolderArchive(blob);

    // Identity and metadata survive.
    expect(layout.name).toBe("Representative Lab");
    expect(layout.metadata?.id).toBe(UUID);

    // Both racks survive, with their devices, in a stable lookup-by-id form.
    const rackIds = layout.racks.map((r) => r.id).sort();
    expect(rackIds).toEqual(["rack-a", "rack-b"]);
    const rackA = layout.racks.find((r) => r.id === "rack-a");
    const placedIds = rackA?.devices.map((d) => d.id).sort();
    expect(placedIds).toEqual(["dev-server", "dev-switch"]);

    // Device positions round-trip exactly (no drift through serialize/parse).
    const server = rackA?.devices.find((d) => d.id === "dev-server");
    expect(server?.position).toBe(toInternalUnits(10));

    // The device-type library survives.
    const typeSlugs = layout.device_types.map((t) => t.slug).sort();
    expect(typeSlugs).toEqual(["server-2u", "switch-1u"]);

    // rack_groups and cables survive with their references intact.
    expect(layout.rack_groups?.[0]?.rack_ids).toEqual(["rack-a", "rack-b"]);
    const cable = layout.cables?.find((c) => c.id === "cable-1");
    expect(cable?.a_device_id).toBe("dev-switch");
    expect(cable?.b_device_id).toBe("dev-server");
    expect(cable?.label).toBe("uplink");
  });

  it("survives a second save/reload cycle without losing or mutating sections", async () => {
    // A user who opens, saves, opens, saves again must not accumulate drift.
    const original = representativeLayout();
    const firstReload = (
      await extractFolderArchive(await newFormatZipBlob(original))
    ).layout;
    const secondReload = (
      await extractFolderArchive(await newFormatZipBlob(firstReload))
    ).layout;

    expect(secondReload.racks.map((r) => r.id).sort()).toEqual([
      "rack-a",
      "rack-b",
    ]);
    expect(secondReload.cables?.map((c) => c.id)).toEqual(["cable-1"]);
    expect(secondReload.rack_groups?.[0]?.rack_ids).toEqual([
      "rack-a",
      "rack-b",
    ]);
  });
});

describe("legacy ZIP load compatibility (#1114)", () => {
  it("loads a pre-#919 folder ZIP with no UUID in the folder name", async () => {
    // Older builds wrote "{name}/{name}.yaml" with no UUID suffix. The reader
    // must still recognise this as a layout, not reject it as invalid.
    const layout = createTestLayout({
      name: "homelab",
      racks: [createTestRack({ id: "rack-1", name: "Main" })],
    });
    const yaml = await serializeLayoutToYaml(layout);

    const zip = new JSZip();
    const folder = zip.folder("homelab");
    folder?.file("homelab.yaml", yaml);
    const blob = await zip.generateAsync({ type: "blob" });

    const result = await extractFolderArchive(blob);
    expect(result.layout.name).toBe("homelab");
    expect(result.layout.racks.map((r) => r.id)).toEqual(["rack-1"]);
  });

  it("loads a bare YAML file (no ZIP wrapper) detected by magic bytes", async () => {
    // The load dialog accepts a plain .yaml file as well as a .zip. A YAML blob
    // does not start with the PK ZIP signature, so the reader takes the
    // direct-parse branch instead of attempting ZIP extraction.
    const layout = createTestLayout({
      name: "Plain File",
      racks: [createTestRack({ id: "only-rack" })],
    });
    const yaml = await serializeLayoutToYaml(layout);
    const blob = new Blob([yaml], { type: "text/yaml" });

    const result = await extractFolderArchive(blob);
    expect(result.layout.name).toBe("Plain File");
    expect(result.layout.racks.map((r) => r.id)).toEqual(["only-rack"]);
  });

  it("adapts legacy half-width pairs to carriers when loaded from a ZIP", async () => {
    // A legacy file can carry two co-located half-width devices marked
    // left/right. On load the carrier-first adapter (run inside the parse path)
    // must wrap them into a single carrier with two children, so the placement
    // survives the format change rather than colliding or being dropped.
    const half = createTestDeviceType({
      slug: "half-width",
      u_height: 1,
      slot_width: 1,
    });
    const legacy = createTestLayout({
      name: "Legacy Pair",
      device_types: [half],
      racks: [
        createTestRack({
          id: "rack-1",
          devices: [
            {
              ...createTestDevice({
                id: "left",
                device_type: "half-width",
                position: 10,
              }),
              slot_position: "left",
            },
            {
              ...createTestDevice({
                id: "right",
                device_type: "half-width",
                position: 10,
              }),
              slot_position: "right",
            },
          ],
        }),
      ],
    });
    // Serialize through the plain-YAML path; slot_position rides as an unknown
    // field, mirroring what a legacy file on disk actually contains. Wrap the
    // YAML in a folder ZIP so the load exercises the ZIP detection/extraction
    // path, the same shape an older build wrote to disk.
    const yaml = await serializeLayoutToYaml(legacy as unknown as Layout);
    const zip = new JSZip();
    zip.folder("legacy-pair")?.file("legacy-pair.yaml", yaml);
    const blob = await zip.generateAsync({ type: "blob" });

    const { layout } = await extractFolderArchive(blob);

    const rack = layout.racks[0];
    // The pair collapses into one synthesized carrier whose two children are
    // the original left/right devices, mapped deterministically onto the
    // 2-column carrier slots (left -> col-1, right -> col-2).
    const carrier = rack?.devices.find((d) => d.auto_created);
    expect(carrier).toBeDefined();

    const leftChild = rack?.devices.find((d) => d.id === "left");
    expect(leftChild?.container_id).toBe(carrier?.id);
    expect(leftChild?.slot_id).toBe("col-1");
    expect("slot_position" in (leftChild ?? {})).toBe(false);

    const rightChild = rack?.devices.find((d) => d.id === "right");
    expect(rightChild?.container_id).toBe(carrier?.id);
    expect(rightChild?.slot_id).toBe("col-2");
    expect("slot_position" in (rightChild ?? {})).toBe(false);
  });
});

describe("invalid YAML load error paths (#1114)", () => {
  it("rejects a ZIP whose YAML fails schema validation", async () => {
    // A corrupt or hand-edited file with a missing required rack field must be
    // rejected loudly, not silently loaded as a broken layout.
    const zip = new JSZip();
    const folder = zip.folder(`Broken-${UUID}`);
    folder?.file(
      "broken.rackula.yaml",
      "version: '1.0'\nname: Broken\nracks: not-an-array\ndevice_types: []\n",
    );
    const blob = await zip.generateAsync({ type: "blob" });

    await expect(extractFolderArchive(blob)).rejects.toThrow(/Invalid layout/);
  });
});
