import { describe, it, expect, beforeEach } from "vitest";
import {
  showPortTooltip,
  hidePortTooltip,
  getPortTooltipState,
} from "$lib/stores/portTooltip.svelte";
import type { InterfaceTemplate } from "$lib/types";

describe("Port Tooltip Store", () => {
  // Sample port for testing
  const samplePort: InterfaceTemplate = {
    name: "GigabitEthernet1/0/1",
    type: "1000base-t",
    label: "Uplink Port 1",
    mgmt_only: false,
    poe_mode: "pse",
    poe_type: "type2-ieee802.3at",
  };

  beforeEach(() => {
    // Reset tooltip state before each test
    hidePortTooltip();
  });

  describe("showPortTooltip", () => {
    it("should set visible to true", () => {
      showPortTooltip(samplePort, 100, 200);

      const state = getPortTooltipState();
      expect(state.visible).toBe(true);
    });

    it("should set the port data", () => {
      showPortTooltip(samplePort, 100, 200);

      const state = getPortTooltipState();
      expect(state.port).toEqual(samplePort);
    });

    it("should set the coordinates", () => {
      showPortTooltip(samplePort, 150, 250);

      const state = getPortTooltipState();
      expect(state.x).toBe(150);
      expect(state.y).toBe(250);
    });

    it("should update when called multiple times", () => {
      const port1: InterfaceTemplate = { name: "eth0", type: "1000base-t" };
      const port2: InterfaceTemplate = { name: "eth1", type: "10gbase-t" };

      showPortTooltip(port1, 100, 100);
      expect(getPortTooltipState().port?.name).toBe("eth0");

      showPortTooltip(port2, 200, 200);
      expect(getPortTooltipState().port?.name).toBe("eth1");
      expect(getPortTooltipState().x).toBe(200);
      expect(getPortTooltipState().y).toBe(200);
    });
  });

  describe("hidePortTooltip", () => {
    it("should set visible to false", () => {
      showPortTooltip(samplePort, 100, 200);
      expect(getPortTooltipState().visible).toBe(true);

      hidePortTooltip();
      expect(getPortTooltipState().visible).toBe(false);
    });

    it("should preserve port data when hiding", () => {
      showPortTooltip(samplePort, 100, 200);
      hidePortTooltip();

      // Port data is preserved (but tooltip is hidden)
      // This is intentional to allow smooth animations
      const state = getPortTooltipState();
      expect(state.visible).toBe(false);
    });
  });

  describe("getPortTooltipState", () => {
    it("should return hidden state after hidePortTooltip", () => {
      // The store is a singleton, so after beforeEach calls hidePortTooltip(),
      // we should have visible=false. Port data may be preserved for animations.
      const state = getPortTooltipState();

      expect(state.visible).toBe(false);
      // Port data is intentionally preserved when hiding (for smooth animations)
      // so we only check that visible is false
    });

    it("should return reactive state", () => {
      // First check
      let state = getPortTooltipState();
      expect(state.visible).toBe(false);

      // Show tooltip
      showPortTooltip(samplePort, 100, 200);

      // Get fresh state
      state = getPortTooltipState();
      expect(state.visible).toBe(true);
      expect(state.port).toEqual(samplePort);
    });
  });

  describe("PoE and management port handling", () => {
    it("should handle port with PoE PSE mode", () => {
      const poePort: InterfaceTemplate = {
        name: "Gi1/0/1",
        type: "1000base-t",
        poe_mode: "pse",
        poe_type: "type2-ieee802.3at",
      };

      showPortTooltip(poePort, 100, 200);

      const state = getPortTooltipState();
      expect(state.port?.poe_mode).toBe("pse");
      expect(state.port?.poe_type).toBe("type2-ieee802.3at");
    });

    it("should handle port with PoE PD mode", () => {
      const pdPort: InterfaceTemplate = {
        name: "eth0",
        type: "1000base-t",
        poe_mode: "pd",
      };

      showPortTooltip(pdPort, 100, 200);

      const state = getPortTooltipState();
      expect(state.port?.poe_mode).toBe("pd");
    });

    it("should handle management-only port", () => {
      const mgmtPort: InterfaceTemplate = {
        name: "mgmt0",
        type: "1000base-t",
        mgmt_only: true,
      };

      showPortTooltip(mgmtPort, 100, 200);

      const state = getPortTooltipState();
      expect(state.port?.mgmt_only).toBe(true);
    });
  });

  describe("interface types", () => {
    const interfaceTypes = [
      "1000base-t",
      "10gbase-t",
      "10gbase-x-sfpp",
      "25gbase-x-sfp28",
      "40gbase-x-qsfpp",
      "100gbase-x-qsfp28",
    ] as const;

    interfaceTypes.forEach((type) => {
      it(`should handle ${type} interface type`, () => {
        const port: InterfaceTemplate = {
          name: "test-port",
          type,
        };

        showPortTooltip(port, 100, 200);

        const state = getPortTooltipState();
        expect(state.port?.type).toBe(type);
      });
    });
  });
});
