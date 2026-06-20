import { afterEach, beforeEach, describe, it, expect } from "vitest";
import {
  markPreCarrierMigrationPending,
  hasPreCarrierMigrationPending,
  clearPreCarrierMigrationPending,
} from "$lib/storage/pre-carrier-migration-pending";
import { adaptLegacyLayout } from "$lib/storage/adapt-legacy-layout";
import {
  createTestDevice,
  createTestDeviceType,
  createTestLayout,
  createTestRack,
} from "./factories";
import type { Layout } from "$lib/types";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

describe("pre-carrier migration pending registry", () => {
  afterEach(() => {
    clearPreCarrierMigrationPending(UUID_A);
    clearPreCarrierMigrationPending(UUID_B);
  });

  it("peek is non-destructive and clear removes the mark", () => {
    markPreCarrierMigrationPending(UUID_A);
    expect(hasPreCarrierMigrationPending(UUID_A)).toBe(true);
    // Peeking again must not clear it: a failed save retries with the header.
    expect(hasPreCarrierMigrationPending(UUID_A)).toBe(true);
    clearPreCarrierMigrationPending(UUID_A);
    expect(hasPreCarrierMigrationPending(UUID_A)).toBe(false);
  });

  it("tracks distinct uuids independently", () => {
    markPreCarrierMigrationPending(UUID_A);
    markPreCarrierMigrationPending(UUID_B);

    clearPreCarrierMigrationPending(UUID_A);
    // Clearing A leaves B marked.
    expect(hasPreCarrierMigrationPending(UUID_A)).toBe(false);
    expect(hasPreCarrierMigrationPending(UUID_B)).toBe(true);
  });

  it("has is false for a uuid that was never marked", () => {
    expect(
      hasPreCarrierMigrationPending("33333333-3333-4333-8333-333333333333"),
    ).toBe(false);
  });
});

/**
 * adaptLegacyLayout branches on storage mode: in server mode a changed layout
 * marks its uuid pending (the client signals the server), while in browser mode
 * it falls through to the local ensurePreCarrierBackup and never marks. A layout
 * that does not change marks nothing in either mode.
 */
describe("adaptLegacyLayout pre-carrier migration signalling", () => {
  const original = window.__RACKULA_CONFIG__;

  beforeEach(() => {
    delete window.__RACKULA_CONFIG__;
    // Drain any leftover marks so each test starts clean.
    clearPreCarrierMigrationPending(UUID_A);
  });

  afterEach(() => {
    window.__RACKULA_CONFIG__ = original;
  });

  /** A layout whose only half-width device forces a carrier wrap (changed=true). */
  function changedLayout(uuid: string): Layout {
    const half = createTestDeviceType({
      slug: "half-width",
      u_height: 1,
      slot_width: 1,
    });
    return createTestLayout({
      metadata: { id: uuid },
      device_types: [half],
      racks: [
        createTestRack({
          devices: [
            createTestDevice({
              id: "half-dev",
              device_type: "half-width",
              position: 10,
            }),
          ],
        }),
      ],
    });
  }

  it("marks the layout uuid pending in server mode when the layout changed", () => {
    window.__RACKULA_CONFIG__ = { storage: "server" };

    adaptLegacyLayout(changedLayout(UUID_A));

    expect(hasPreCarrierMigrationPending(UUID_A)).toBe(true);
  });

  it("does not mark in browser mode even when the layout changed", () => {
    window.__RACKULA_CONFIG__ = { storage: "browser" };

    adaptLegacyLayout(changedLayout(UUID_A));

    expect(hasPreCarrierMigrationPending(UUID_A)).toBe(false);
  });

  it("does not mark when nothing changed (server mode)", () => {
    window.__RACKULA_CONFIG__ = { storage: "server" };

    // A plain layout with no half-width / sub-U gear is already carrier-first.
    const layout = createTestLayout({
      metadata: { id: UUID_A },
      device_types: [createTestDeviceType({ slug: "srv-1u", u_height: 1 })],
      racks: [
        createTestRack({
          devices: [
            createTestDevice({
              id: "srv",
              device_type: "srv-1u",
              position: 6,
            }),
          ],
        }),
      ],
    });

    adaptLegacyLayout(layout);

    expect(hasPreCarrierMigrationPending(UUID_A)).toBe(false);
  });
});
