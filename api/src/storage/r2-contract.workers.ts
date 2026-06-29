/**
 * Runs the shared storage contract (#2091) against the R2 driver inside workerd
 * via vitest-pool-workers / Miniflare, plus R2-specific behaviours (snapshot
 * prune-to-5, prefix-count quota, asset round-trip). Named `*.workers.ts` so
 * `bun test` never picks it up; run via `npm run test:workers` (#2625).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { runStorageContract, type MakeDriver } from "./storage-contract";
import { createR2Driver, type R2BucketLike } from "./r2-driver";

// The Miniflare R2 binding (`cloudflare:test` env) is declared in
// src/cloudflare-test-env.d.ts; annotate against the minimal R2 surface the
// driver uses (the real binding is a structural superset).
const bucket: R2BucketLike = env.LAYOUTS;

async function clearBucket(): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ cursor });
    if (page.objects.length > 0) {
      await bucket.delete(page.objects.map((object) => object.key));
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

const makeR2Driver: MakeDriver = async () => {
  await clearBucket();
  return {
    driver: createR2Driver(bucket),
    cleanup: clearBucket,
  };
};

runStorageContract(makeR2Driver, { describe, it, expect });

function layoutYaml(name: string): string {
  return `version: "1.0.0"\nname: ${name}\nracks: []`;
}

/** A 12-byte PNG body: full 8-byte signature plus a short tail. */
function pngBytes(): ArrayBuffer {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]).buffer;
}

describe("R2 driver specifics", () => {
  beforeEach(async () => {
    await clearBucket();
  });

  const ID = "550e8400-e29b-41d4-a716-446655440000";

  it("prunes snapshots to the 5 most recent", async () => {
    const driver = createR2Driver(bucket);
    await driver.saveLayout(layoutYaml("Prune"), ID);
    // Seven uploaded losing copies, oldest (snap-0) first.
    for (let i = 0; i < 7; i += 1) {
      const saved = await driver.saveSnapshot(ID, layoutYaml(`snap-${i}`));
      expect(saved).not.toBeNull();
    }
    const snapshots = await driver.listSnapshots(ID);
    expect(snapshots?.length).toBe(5);

    const survivingContents = await Promise.all(
      (snapshots ?? []).map((snapshot) =>
        driver.getSnapshot(ID, snapshot.filename),
      ),
    );
    // The two oldest are pruned; the five most recent remain.
    expect(survivingContents).not.toContain(layoutYaml("snap-0"));
    expect(survivingContents).not.toContain(layoutYaml("snap-1"));
    for (let i = 2; i < 7; i += 1) {
      expect(survivingContents).toContain(layoutYaml(`snap-${i}`));
    }
  });

  it("counts layouts via prefix listing", async () => {
    const driver = createR2Driver(bucket);
    expect(await driver.countLayouts()).toBe(0);
    await driver.saveLayout(
      layoutYaml("A"),
      "11111111-1111-4111-8111-111111111111",
    );
    await driver.saveLayout(
      layoutYaml("B"),
      "22222222-2222-4222-8222-222222222222",
    );
    await driver.saveLayout(
      layoutYaml("C"),
      "33333333-3333-4333-8333-333333333333",
    );
    expect(await driver.countLayouts()).toBe(3);
  });

  it("round-trips, lists, counts, and deletes an asset", async () => {
    const driver = createR2Driver(bucket);
    await driver.saveLayout(layoutYaml("WithAsset"), ID);

    await driver.saveAsset(ID, "dell-r640", "front", pngBytes(), "image/png");

    const asset = await driver.getAsset(ID, "dell-r640", "front");
    expect(asset?.contentType).toBe("image/png");
    expect(await driver.countAssets(ID)).toBe(1);

    const listed = await driver.listLayoutAssets(ID);
    expect(listed).toContainEqual(
      expect.objectContaining({
        deviceSlug: "dell-r640",
        face: "front",
        ext: "png",
      }),
    );

    expect(await driver.deleteAsset(ID, "dell-r640", "front")).toBe(true);
    expect(await driver.getAsset(ID, "dell-r640", "front")).toBeNull();
    expect(await driver.countAssets(ID)).toBe(0);
  });

  it("rejects a non-image asset body via the shared magic-byte sniff", async () => {
    const driver = createR2Driver(bucket);
    await driver.saveLayout(layoutYaml("Sniff"), ID);
    const svg = new TextEncoder().encode('<svg onload="alert(1)">')
      .buffer as ArrayBuffer;
    await expect(
      driver.saveAsset(ID, "dell-r640", "front", svg, "image/png"),
    ).rejects.toThrow();
    expect(await driver.countAssets(ID)).toBe(0);
  });

  it("returns the durable pre-carrier backup only after a migrating save", async () => {
    const driver = createR2Driver(bucket);
    const seeded = await driver.saveLayout(layoutYaml("v1"), ID);
    expect(await driver.getPreCarrierBackup(ID)).toBeNull();

    await driver.saveLayout(layoutYaml("v2"), ID, seeded.updatedAt, {
      preCarrierMigration: true,
    });
    expect(await driver.getPreCarrierBackup(ID)).toBe(layoutYaml("v1"));
  });
});
