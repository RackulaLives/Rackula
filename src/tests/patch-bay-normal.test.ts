import { describe, expect, it } from "vitest";
import { DeviceTypeSchema } from "$lib/schemas";
import { parseLayoutYaml, serializeLayoutToYaml } from "$lib/utils/yaml";
import {
  resolvePatchBayNormalPortIds,
  resolvePatchBayNormals,
} from "$lib/utils/port-utils";
import {
  createTestDevice,
  createTestDeviceType,
  createTestInterfaceTemplate,
  createTestPlacedPort,
} from "./factories";
import type { DeviceType, PatchBayNormal } from "$lib/types";

function createPatchBay(patch_bay_normals: PatchBayNormal[]): DeviceType {
  return {
    ...createTestDeviceType({ slug: "patch-bay", category: "av-media" }),
    interfaces: ["1 Top", "1 Bottom", "2 Top", "2 Bottom"].map((name) =>
      createTestInterfaceTemplate({ name, type: "trs-1-4" }),
    ),
    patch_bay_normals,
  };
}

const PAIRS: PatchBayNormal[] = [
  { top: "1 Top", bottom: "1 Bottom", mode: "half-normal" },
  { top: "2 Top", bottom: "2 Bottom", mode: "full-normal" },
];

describe("resolvePatchBayNormals", () => {
  it("returns the template modes when the placed device has no override", () => {
    const deviceType = createPatchBay(PAIRS);
    const device = createTestDevice({ device_type: "patch-bay" });

    expect(resolvePatchBayNormals(device, deviceType)).toEqual([
      { ...PAIRS[0], source: "template" },
      { ...PAIRS[1], source: "template" },
    ]);
  });

  it("applies a per-instance override keyed by the top port name", () => {
    const deviceType = createPatchBay(PAIRS);
    const device = createTestDevice({
      device_type: "patch-bay",
      patch_bay_normal_overrides: { "2 Top": "non-normal" },
    });

    expect(resolvePatchBayNormals(device, deviceType)).toEqual([
      { ...PAIRS[0], source: "template" },
      {
        top: "2 Top",
        bottom: "2 Bottom",
        mode: "non-normal",
        source: "override",
      },
    ]);
  });

  it("ignores an override for a pair the device type does not define", () => {
    const deviceType = createPatchBay(PAIRS);
    const device = createTestDevice({
      device_type: "patch-bay",
      patch_bay_normal_overrides: {
        "1 Bottom": "non-normal",
        "9 Top": "full-normal",
      },
    });

    expect(resolvePatchBayNormals(device, deviceType)).toEqual([
      { ...PAIRS[0], source: "template" },
      { ...PAIRS[1], source: "template" },
    ]);
  });

  it("returns no pairs for a device type without normalling", () => {
    const device = createTestDevice({
      patch_bay_normal_overrides: { "1 Top": "full-normal" },
    });

    expect(resolvePatchBayNormals(device, createTestDeviceType())).toEqual([]);
  });
});

describe("resolvePatchBayNormalPortIds", () => {
  const pair = PAIRS[0]!;

  it("resolves both jacks of a pair to their placed port ids", () => {
    const device = createTestDevice({
      ports: [
        createTestPlacedPort({
          id: "p-top",
          template_name: "1 Top",
          template_index: 0,
        }),
        createTestPlacedPort({
          id: "p-bottom",
          template_name: "1 Bottom",
          template_index: 1,
        }),
      ],
    });

    expect(resolvePatchBayNormalPortIds(device, pair)).toEqual({
      top: "p-top",
      bottom: "p-bottom",
    });
  });

  it("returns undefined when either jack has no placed port", () => {
    const onlyTop = createTestDevice({
      ports: [createTestPlacedPort({ id: "p-top", template_name: "1 Top" })],
    });

    expect(resolvePatchBayNormalPortIds(onlyTop, pair)).toBeUndefined();
    expect(
      resolvePatchBayNormalPortIds(createTestDevice(), pair),
    ).toBeUndefined();
  });
});

describe("DeviceTypeSchema patch_bay_normals", () => {
  it("accepts pairs that reference distinct ports on the device type", () => {
    expect(DeviceTypeSchema.safeParse(createPatchBay(PAIRS)).success).toBe(
      true,
    );
  });

  it("rejects a pair that references an unknown port name", () => {
    const result = DeviceTypeSchema.safeParse(
      createPatchBay([
        { top: "1 Top", bottom: "Missing", mode: "full-normal" },
      ]),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        path: ["patch_bay_normals", 0, "bottom"],
        message: expect.stringContaining("Missing"),
      }),
    );
  });

  it("rejects a port used in more than one pair", () => {
    const result = DeviceTypeSchema.safeParse(
      createPatchBay([
        { top: "1 Top", bottom: "1 Bottom", mode: "full-normal" },
        { top: "2 Top", bottom: "1 Bottom", mode: "half-normal" },
      ]),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        path: ["patch_bay_normals", 1, "bottom"],
        message: expect.stringContaining("1 Bottom"),
      }),
    );
  });

  it("rejects a pair whose top and bottom are the same port", () => {
    const result = DeviceTypeSchema.safeParse(
      createPatchBay([{ top: "1 Top", bottom: "1 Top", mode: "full-normal" }]),
    );

    expect(result.success).toBe(false);
  });
});

describe("patch bay normalling on save", () => {
  it("keeps normalled pairs and overrides through a save and reload", async () => {
    const fixture = (
      await import("./fixtures/upgrade-corpus/v26.9.2-patch-bay-normals.rackula.yaml?raw")
    ).default as string;
    const loaded = await parseLayoutYaml(fixture);

    const reloaded = await parseLayoutYaml(await serializeLayoutToYaml(loaded));

    const patchBay = reloaded.device_types.find(
      (dt) => dt.slug === "trs-patch-bay-1u",
    )!;
    const device = reloaded.racks[0]!.devices[0]!;
    expect(resolvePatchBayNormals(device, patchBay)).toEqual([
      {
        top: "1 Top",
        bottom: "1 Bottom",
        mode: "half-normal",
        source: "template",
      },
      {
        top: "2 Top",
        bottom: "2 Bottom",
        mode: "non-normal",
        source: "override",
      },
    ]);
  });
});
