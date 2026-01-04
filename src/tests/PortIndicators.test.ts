import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/svelte";
import PortIndicators from "$lib/components/PortIndicators.svelte";
import type { InterfaceTemplate, InterfaceType } from "$lib/types";

describe("PortIndicators SVG Component", () => {
  // Helper to create interface templates
  function createInterface(
    name: string,
    type: InterfaceType,
    options: Partial<InterfaceTemplate> = {},
  ): InterfaceTemplate {
    return { name, type, ...options };
  }

  const defaultProps = {
    interfaces: [
      createInterface("eth0", "1000base-t"),
      createInterface("eth1", "1000base-t"),
    ],
    deviceWidth: 186,
    deviceHeight: 22, // 1U
    rackView: "front" as const,
  };

  describe("Basic Rendering", () => {
    it("renders port indicators group when showPorts is true (default)", () => {
      const { container } = render(PortIndicators, { props: defaultProps });

      const group = container.querySelector("g.port-indicators");
      expect(group).toBeInTheDocument();
    });

    it("does not render when showPorts is false", () => {
      const { container } = render(PortIndicators, {
        props: { ...defaultProps, showPorts: false },
      });

      const group = container.querySelector("g.port-indicators");
      expect(group).not.toBeInTheDocument();
    });

    it("does not render when interfaces array is empty", () => {
      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces: [] },
      });

      const group = container.querySelector("g.port-indicators");
      expect(group).not.toBeInTheDocument();
    });

    it("renders correct number of port circles for low-density devices", () => {
      const interfaces = Array.from({ length: 8 }, (_, i) =>
        createInterface(`eth${i}`, "1000base-t"),
      );

      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces },
      });

      const circles = container.querySelectorAll("circle.port-circle");
      expect(circles).toHaveLength(8);
    });
  });

  describe("Color Coding", () => {
    it("renders 1GbE ports with design token color", () => {
      const interfaces = [createInterface("eth0", "1000base-t")];
      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces },
      });

      const circle = container.querySelector("circle.port-circle");
      expect(circle?.getAttribute("fill")).toBe("var(--colour-port-1gbe)");
    });

    it("renders 10GbE copper ports with design token color", () => {
      const interfaces = [createInterface("eth0", "10gbase-t")];
      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces },
      });

      const circle = container.querySelector("circle.port-circle");
      expect(circle?.getAttribute("fill")).toBe("var(--colour-port-10gbe)");
    });

    it("renders SFP+ ports with design token color", () => {
      const interfaces = [createInterface("sfp0", "10gbase-x-sfpp")];
      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces },
      });

      const circle = container.querySelector("circle.port-circle");
      expect(circle?.getAttribute("fill")).toBe("var(--colour-port-sfpp)");
    });

    it("renders SFP28 ports with design token color", () => {
      const interfaces = [createInterface("sfp0", "25gbase-x-sfp28")];
      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces },
      });

      const circle = container.querySelector("circle.port-circle");
      expect(circle?.getAttribute("fill")).toBe("var(--colour-port-sfp28)");
    });

    it("renders QSFP+ ports with design token color", () => {
      const interfaces = [createInterface("qsfp0", "40gbase-x-qsfpp")];
      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces },
      });

      const circle = container.querySelector("circle.port-circle");
      expect(circle?.getAttribute("fill")).toBe("var(--colour-port-qsfpp)");
    });

    it("renders QSFP28 ports with design token color", () => {
      const interfaces = [createInterface("qsfp0", "100gbase-x-qsfp28")];
      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces },
      });

      const circle = container.querySelector("circle.port-circle");
      expect(circle?.getAttribute("fill")).toBe("var(--colour-port-qsfp28)");
    });

    it("renders unknown types with default design token color", () => {
      const interfaces = [createInterface("other0", "other" as InterfaceType)];
      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces },
      });

      const circle = container.querySelector("circle.port-circle");
      expect(circle?.getAttribute("fill")).toBe("var(--colour-port-default)");
    });
  });

  describe("Position Filtering", () => {
    it("shows only front-positioned interfaces in front view", () => {
      const interfaces = [
        createInterface("eth0", "1000base-t", { position: "front" }),
        createInterface("eth1", "1000base-t", { position: "rear" }),
        createInterface("eth2", "1000base-t", { position: "front" }),
      ];

      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces, rackView: "front" },
      });

      const circles = container.querySelectorAll("circle.port-circle");
      expect(circles).toHaveLength(2);
    });

    it("shows only rear-positioned interfaces in rear view", () => {
      const interfaces = [
        createInterface("eth0", "1000base-t", { position: "front" }),
        createInterface("eth1", "1000base-t", { position: "rear" }),
        createInterface("eth2", "1000base-t", { position: "rear" }),
      ];

      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces, rackView: "rear" },
      });

      const circles = container.querySelectorAll("circle.port-circle");
      expect(circles).toHaveLength(2);
    });

    it("treats interfaces with no position as front by default", () => {
      const interfaces = [
        createInterface("eth0", "1000base-t"), // no position = front
        createInterface("eth1", "1000base-t", { position: "rear" }),
      ];

      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces, rackView: "front" },
      });

      const circles = container.querySelectorAll("circle.port-circle");
      expect(circles).toHaveLength(1);
    });
  });

  describe("Management Interface Indicator", () => {
    it("renders inner dot for management-only interfaces", () => {
      const interfaces = [
        createInterface("mgmt0", "1000base-t", { mgmt_only: true }),
      ];

      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces },
      });

      const mgmtIndicator = container.querySelector(
        "circle.port-mgmt-indicator",
      );
      expect(mgmtIndicator).toBeInTheDocument();
      // fill is controlled by CSS via design tokens
      expect(mgmtIndicator?.getAttribute("r")).toBe("1");
    });

    it("does not render inner dot for non-management interfaces", () => {
      const interfaces = [createInterface("eth0", "1000base-t")];

      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces },
      });

      const mgmtIndicator = container.querySelector(
        "circle.port-mgmt-indicator",
      );
      expect(mgmtIndicator).not.toBeInTheDocument();
    });
  });

  describe("PoE Indicator", () => {
    it("renders lightning bolt for PSE interfaces", () => {
      const interfaces = [
        createInterface("eth0", "1000base-t", { poe_mode: "pse" }),
      ];

      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces },
      });

      const poeIndicator = container.querySelector("text.port-poe-indicator");
      expect(poeIndicator).toBeInTheDocument();
      expect(poeIndicator?.textContent).toBe("⚡");
    });

    it("does not render PoE indicator for PD interfaces", () => {
      const interfaces = [
        createInterface("eth0", "1000base-t", { poe_mode: "pd" }),
      ];

      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces },
      });

      const poeIndicator = container.querySelector("text.port-poe-indicator");
      expect(poeIndicator).not.toBeInTheDocument();
    });

    it("does not render PoE indicator when poe_mode is not set", () => {
      const interfaces = [createInterface("eth0", "1000base-t")];

      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces },
      });

      const poeIndicator = container.querySelector("text.port-poe-indicator");
      expect(poeIndicator).not.toBeInTheDocument();
    });
  });

  describe("High-Density Mode (>24 ports)", () => {
    it("renders grouped badges instead of individual ports", () => {
      // Create 48 1GbE ports
      const interfaces = Array.from({ length: 48 }, (_, i) =>
        createInterface(`eth${i}`, "1000base-t"),
      );

      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces },
      });

      // Should NOT have individual circles
      const circles = container.querySelectorAll("circle.port-circle");
      expect(circles).toHaveLength(0);

      // Should have badge groups
      const badges = container.querySelectorAll("g.port-group-badge");
      expect(badges.length).toBeGreaterThan(0);
    });

    it("shows count in badge for each interface type", () => {
      // Create 30 1GbE and 18 SFP+ ports
      const interfaces = [
        ...Array.from({ length: 30 }, (_, i) =>
          createInterface(`eth${i}`, "1000base-t"),
        ),
        ...Array.from({ length: 18 }, (_, i) =>
          createInterface(`sfp${i}`, "10gbase-x-sfpp"),
        ),
      ];

      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces },
      });

      // Should have 2 badge groups (one for each type)
      const badges = container.querySelectorAll("g.port-group-badge");
      expect(badges).toHaveLength(2);

      // Check count text
      const countTexts = container.querySelectorAll("text.port-count-text");
      const counts = Array.from(countTexts).map((t) => t.textContent);
      expect(counts).toContain("30");
      expect(counts).toContain("18");
    });

    it("uses correct design token colors for badge backgrounds", () => {
      const interfaces = Array.from({ length: 48 }, (_, i) =>
        createInterface(`eth${i}`, "1000base-t"),
      );

      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces },
      });

      const badgeRect = container.querySelector("g.port-group-badge rect");
      expect(badgeRect?.getAttribute("fill")).toBe("var(--colour-port-1gbe)");
    });

    it("threshold is >24 ports for high-density mode", () => {
      // 24 ports should show individual circles
      const interfaces24 = Array.from({ length: 24 }, (_, i) =>
        createInterface(`eth${i}`, "1000base-t"),
      );

      const { container: container24 } = render(PortIndicators, {
        props: { ...defaultProps, interfaces: interfaces24 },
      });

      expect(container24.querySelectorAll("circle.port-circle")).toHaveLength(
        24,
      );

      // 25 ports should show badges
      const interfaces25 = Array.from({ length: 25 }, (_, i) =>
        createInterface(`eth${i}`, "1000base-t"),
      );

      const { container: container25 } = render(PortIndicators, {
        props: { ...defaultProps, interfaces: interfaces25 },
      });

      expect(container25.querySelectorAll("circle.port-circle")).toHaveLength(
        0,
      );
      expect(
        container25.querySelectorAll("g.port-group-badge").length,
      ).toBeGreaterThan(0);
    });
  });

  describe("Click Handling", () => {
    it("renders SVG hit targets for low-density mode (Safari compatible)", () => {
      const { container } = render(PortIndicators, {
        props: defaultProps,
      });

      // Should have SVG circle hit targets, not foreignObject
      const hitTargets = container.querySelectorAll("circle.port-hit-target");
      expect(hitTargets.length).toBeGreaterThan(0);

      // Should NOT have foreignObject (WebKit Bug #230304)
      const overlay = container.querySelector("foreignObject");
      expect(overlay).not.toBeInTheDocument();
    });

    it("renders hit targets for each port", () => {
      const interfaces = [
        createInterface("eth0", "1000base-t"),
        createInterface("eth1", "1000base-t"),
        createInterface("eth2", "1000base-t"),
      ];

      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces },
      });

      const hitTargets = container.querySelectorAll("circle.port-hit-target");
      expect(hitTargets).toHaveLength(3);
    });

    it("hit targets have accessible title via SVG title element", () => {
      const interfaces = [createInterface("eth0", "1000base-t")];

      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces },
      });

      const hitTarget = container.querySelector("circle.port-hit-target");
      const title = hitTarget?.querySelector("title");
      expect(title?.textContent).toBe("eth0 (1000base-t)");
    });

    it("calls onPortClick when port is clicked", async () => {
      const handlePortClick = vi.fn();
      const interfaces = [createInterface("eth0", "1000base-t")];

      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces, onPortClick: handlePortClick },
      });

      const hitTarget = container.querySelector("circle.port-hit-target");
      await hitTarget?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );

      expect(handlePortClick).toHaveBeenCalledWith(interfaces[0]);
    });
  });

  describe("Accessibility", () => {
    it("hit targets have aria-label for screen readers", () => {
      const interfaces = [createInterface("eth0", "1000base-t")];

      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces },
      });

      const hitTarget = container.querySelector("circle.port-hit-target");
      expect(hitTarget).toHaveAttribute("aria-label", "eth0 (1000base-t)");
    });

    it("hit targets have button role and are focusable", () => {
      const interfaces = [createInterface("eth0", "1000base-t")];

      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces },
      });

      const hitTarget = container.querySelector("circle.port-hit-target");
      expect(hitTarget).toHaveAttribute("role", "button");
      expect(hitTarget).toHaveAttribute("tabindex", "0");
    });

    it("hit targets support keyboard activation", async () => {
      const handlePortClick = vi.fn();
      const interfaces = [createInterface("eth0", "1000base-t")];

      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces, onPortClick: handlePortClick },
      });

      const hitTarget = container.querySelector(
        "circle.port-hit-target",
      ) as SVGCircleElement;

      // Test Enter key
      hitTarget?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      expect(handlePortClick).toHaveBeenCalledWith(interfaces[0]);

      handlePortClick.mockClear();

      // Test Space key
      hitTarget?.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true }),
      );
      expect(handlePortClick).toHaveBeenCalledWith(interfaces[0]);
    });
  });

  describe("Port Positioning", () => {
    it("centers ports horizontally within device width", () => {
      const interfaces = [
        createInterface("eth0", "1000base-t"),
        createInterface("eth1", "1000base-t"),
        createInterface("eth2", "1000base-t"),
      ];

      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces },
      });

      const circles = container.querySelectorAll("circle.port-circle");
      const cxValues = Array.from(circles).map((c) =>
        parseFloat(c.getAttribute("cx") || "0"),
      );

      // First and last ports should be equidistant from edges
      const firstPort = cxValues[0];
      const lastPort = cxValues[cxValues.length - 1];
      const distFromStart = firstPort;
      const distFromEnd = defaultProps.deviceWidth - lastPort;

      // They should be symmetric (with some tolerance for spacing)
      expect(Math.abs(distFromStart - distFromEnd)).toBeLessThan(1);
    });

    it("positions ports near device bottom edge", () => {
      const interfaces = [createInterface("eth0", "1000base-t")];

      const { container } = render(PortIndicators, {
        props: { ...defaultProps, interfaces },
      });

      const circle = container.querySelector("circle.port-circle");
      const cy = parseFloat(circle?.getAttribute("cy") || "0");

      // Should be positioned near bottom (within last 10px of device height)
      expect(cy).toBeGreaterThan(defaultProps.deviceHeight - 10);
    });
  });
});
