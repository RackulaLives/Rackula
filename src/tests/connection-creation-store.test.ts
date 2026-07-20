/**
 * Connection Creation Store Tests (#1932)
 * Tests for the desktop click-to-click connection creation mode state
 * machine. Mirrors placement-store.test.ts's structure for the tap-to-place
 * mode this feature is modeled after.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getConnectionCreationStore,
  resetConnectionCreationStore,
} from "$lib/stores/connection-creation.svelte";
import { createTestInterfaceTemplate } from "./factories";

describe("connection creation store", () => {
  const sourceIface = createTestInterfaceTemplate({ name: "eth0" });

  beforeEach(() => {
    resetConnectionCreationStore();
  });

  describe("initial state", () => {
    it("has isCreating as false by default", () => {
      expect(getConnectionCreationStore().isCreating).toBe(false);
    });

    it("has sourcePortId as null by default", () => {
      expect(getConnectionCreationStore().sourcePortId).toBeNull();
    });

    it("has sourceIface as null by default", () => {
      expect(getConnectionCreationStore().sourceIface).toBeNull();
    });

    it("has connectionAnnouncement as null by default", () => {
      expect(getConnectionCreationStore().connectionAnnouncement).toBeNull();
    });
  });

  describe("startConnection()", () => {
    it("sets isCreating to true", () => {
      const store = getConnectionCreationStore();
      store.startConnection("port-a", sourceIface);
      expect(store.isCreating).toBe(true);
    });

    it("records the source port id and interface", () => {
      const store = getConnectionCreationStore();
      store.startConnection("port-a", sourceIface);
      expect(store.sourcePortId).toBe("port-a");
      expect(store.sourceIface).toEqual(sourceIface);
    });

    it("sets a screen-reader announcement", () => {
      const store = getConnectionCreationStore();
      store.startConnection("port-a", sourceIface);
      expect(store.connectionAnnouncement).toBeTruthy();
    });

    it("replaces a previous source when called again while already armed", () => {
      const store = getConnectionCreationStore();
      const otherIface = createTestInterfaceTemplate({ name: "eth1" });
      store.startConnection("port-a", sourceIface);
      store.startConnection("port-b", otherIface);
      expect(store.sourcePortId).toBe("port-b");
      expect(store.sourceIface).toEqual(otherIface);
    });
  });

  describe("cancelConnection()", () => {
    it("sets isCreating to false", () => {
      const store = getConnectionCreationStore();
      store.startConnection("port-a", sourceIface);
      store.cancelConnection();
      expect(store.isCreating).toBe(false);
    });

    it("clears the source port and interface", () => {
      const store = getConnectionCreationStore();
      store.startConnection("port-a", sourceIface);
      store.cancelConnection();
      expect(store.sourcePortId).toBeNull();
      expect(store.sourceIface).toBeNull();
    });

    it("sets a cancellation announcement", () => {
      const store = getConnectionCreationStore();
      store.startConnection("port-a", sourceIface);
      store.cancelConnection();
      expect(store.connectionAnnouncement).toBe(
        "Connection creation cancelled",
      );
    });

    it("is safe to call when not creating", () => {
      const store = getConnectionCreationStore();
      expect(() => store.cancelConnection()).not.toThrow();
      expect(store.isCreating).toBe(false);
      // No active connection-creation means nothing to announce.
      expect(store.connectionAnnouncement).toBeNull();
    });
  });

  describe("completeConnection()", () => {
    it("sets isCreating to false", () => {
      const store = getConnectionCreationStore();
      store.startConnection("port-a", sourceIface);
      store.completeConnection();
      expect(store.isCreating).toBe(false);
    });

    it("clears the source port and interface", () => {
      const store = getConnectionCreationStore();
      store.startConnection("port-a", sourceIface);
      store.completeConnection();
      expect(store.sourcePortId).toBeNull();
      expect(store.sourceIface).toBeNull();
    });

    it("sets a default completion announcement", () => {
      const store = getConnectionCreationStore();
      store.startConnection("port-a", sourceIface);
      store.completeConnection();
      expect(store.connectionAnnouncement).toBe("Connection created");
    });

    it("accepts a custom summary announcement", () => {
      const store = getConnectionCreationStore();
      store.startConnection("port-a", sourceIface);
      store.completeConnection("Connected eth0 to eth1");
      expect(store.connectionAnnouncement).toBe("Connected eth0 to eth1");
    });

    it("is safe to call when not creating", () => {
      const store = getConnectionCreationStore();
      expect(() => store.completeConnection()).not.toThrow();
      expect(store.isCreating).toBe(false);
      expect(store.connectionAnnouncement).toBeNull();
    });
  });

  describe("resetConnectionCreationStore()", () => {
    it("resets all state to defaults", () => {
      const store = getConnectionCreationStore();
      store.startConnection("port-a", sourceIface);

      resetConnectionCreationStore();

      expect(store.isCreating).toBe(false);
      expect(store.sourcePortId).toBeNull();
      expect(store.sourceIface).toBeNull();
      expect(store.connectionAnnouncement).toBeNull();
    });
  });
});
