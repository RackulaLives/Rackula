/**
 * Behavioural storage contract (#2091).
 *
 * Encodes the atomic snapshot-on-mismatch invariant that every storage driver
 * must uphold: a save whose echoed updatedAt does not match the stored copy
 * MUST snapshot the diverged copy before overwriting it, and a concurrent
 * write to the same layout must never cause a diverged copy to be lost
 * without a snapshot.
 *
 * The surface is deliberately minimal: just the operations this invariant
 * exercises. The filesystem driver runs it today; the future R2 driver
 * (#2133) will run the same harness against its own makeDriver factory.
 */
import { describe, it, expect } from "bun:test";

/**
 * Minimal driver surface the contract exercises. A `makeDriver` factory binds
 * a driver to a fresh, isolated backing store so each test starts clean.
 */
export interface StorageContractDriver {
  /**
   * Save a layout. `echoedUpdatedAt` is the updatedAt the client last
   * received; a mismatch with the stored copy must trigger a pre-overwrite
   * snapshot. Returns the stored copy's updatedAt for the client to echo next.
   */
  saveLayout(
    id: string,
    yamlContent: string,
    echoedUpdatedAt?: string,
  ): Promise<{ updatedAt: string }>;
  /** Read the stored layout, or null if it does not exist. */
  getLayout(id: string): Promise<{ content: string; updatedAt: string } | null>;
  /** Return the raw YAML content of every snapshot held for the layout. */
  getSnapshotContents(id: string): Promise<string[]>;
}

export type MakeDriver = () => Promise<{
  driver: StorageContractDriver;
  cleanup: () => Promise<void>;
}>;

const TEST_ID = "550e8400-e29b-41d4-a716-446655440000";
const STALE_UPDATED_AT = "1999-01-01T00:00:00.000Z";

function layoutYaml(marker: string): string {
  return `version: "1.0.0"\nname: My Layout\ndescription: ${marker}\nracks: []`;
}

/**
 * Run the storage contract against a driver produced by `makeDriver`.
 * Asserts the atomic snapshot-on-mismatch invariant.
 */
export function runStorageContract(makeDriver: MakeDriver): void {
  describe("storage contract: atomic snapshot on mismatch", () => {
    it("snapshots the existing copy when the echoed updatedAt mismatches", async () => {
      const { driver, cleanup } = await makeDriver();
      try {
        const v1 = layoutYaml("v1");
        const v2 = layoutYaml("v2");
        await driver.saveLayout(TEST_ID, v1);

        await driver.saveLayout(TEST_ID, v2, STALE_UPDATED_AT);

        const snapshots = await driver.getSnapshotContents(TEST_ID);
        expect(snapshots).toContain(v1);

        const stored = await driver.getLayout(TEST_ID);
        expect(stored?.content).toBe(v2);
      } finally {
        await cleanup();
      }
    });

    it("does not snapshot when the echoed updatedAt matches", async () => {
      const { driver, cleanup } = await makeDriver();
      try {
        const v1 = layoutYaml("v1");
        const first = await driver.saveLayout(TEST_ID, v1);

        await driver.saveLayout(TEST_ID, layoutYaml("v2"), first.updatedAt);

        const snapshots = await driver.getSnapshotContents(TEST_ID);
        expect(snapshots).toEqual([]);
      } finally {
        await cleanup();
      }
    });

    it("never loses a diverged copy when a stale-echo write races a concurrent write", async () => {
      const { driver, cleanup } = await makeDriver();
      try {
        const v1 = layoutYaml("v1");
        const v2 = layoutYaml("v2");
        const v3 = layoutYaml("v3");
        const seeded = await driver.saveLayout(TEST_ID, v1);

        // A clean overwrite to v2 (echoing the real updatedAt) racing a
        // stale-echo overwrite to v3. Whichever copy is overwritten must
        // survive as a snapshot: no silent data loss.
        await Promise.all([
          driver.saveLayout(TEST_ID, v2, seeded.updatedAt),
          driver.saveLayout(TEST_ID, v3, STALE_UPDATED_AT),
        ]);

        const stored = await driver.getLayout(TEST_ID);
        const finalContent = stored?.content ?? "";
        const snapshots = await driver.getSnapshotContents(TEST_ID);

        // A diverged copy was actually snapshotted. Without this guard the
        // case is vacuous: when no snapshot is produced (the bug) the loop
        // below has nothing to assert and passes silently.
        expect(snapshots.length).toBeGreaterThan(0);

        // Whichever of v2/v3 lost the race and was overwritten must survive
        // in the snapshot set, and it must differ from the final stored copy
        // (no silent data loss). At least one diverged copy is guaranteed by
        // the guard above, so the loop has real work to do.
        const overwritten = [v2, v3].filter((c) => c !== finalContent);
        for (const lost of overwritten) {
          expect(snapshots).toContain(lost);
        }
      } finally {
        await cleanup();
      }
    });

    it("serializes concurrent saves to the same id across UUID casing", async () => {
      const { driver, cleanup } = await makeDriver();
      try {
        const v1 = layoutYaml("v1");
        const v2 = layoutYaml("v2");
        const v3 = layoutYaml("v3");
        const upperId = TEST_ID.toUpperCase();
        const seeded = await driver.saveLayout(TEST_ID, v1);

        // Same logical layout, different UUID casing. UUIDs are matched
        // case-insensitively, so both saves must serialize on one lock.
        // If they did not, the diverged copy could be overwritten without a
        // snapshot, reopening the TOCTOU this contract guards.
        await Promise.all([
          driver.saveLayout(TEST_ID, v2, seeded.updatedAt),
          driver.saveLayout(upperId, v3, STALE_UPDATED_AT),
        ]);

        const stored = await driver.getLayout(TEST_ID);
        const finalContent = stored?.content ?? "";
        const snapshots = await driver.getSnapshotContents(TEST_ID);

        expect(snapshots.length).toBeGreaterThan(0);

        const overwritten = [v2, v3].filter((c) => c !== finalContent);
        for (const lost of overwritten) {
          expect(snapshots).toContain(lost);
        }
      } finally {
        await cleanup();
      }
    });
  });
}
