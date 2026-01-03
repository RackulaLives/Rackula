/**
 * Connection Model Tests
 * Tests for the MVP Connection interface and schema
 */

import { describe, it, expect } from "vitest";
import { ConnectionSchema, LayoutSchema } from "$lib/schemas";
import type { Connection } from "$lib/types";

describe("ConnectionSchema", () => {
  describe("valid connections", () => {
    it("validates minimal connection with required fields only", () => {
      const connection: Connection = {
        id: "conn-1",
        a_port_id: "port-abc-123",
        b_port_id: "port-def-456",
      };

      const result = ConnectionSchema.safeParse(connection);
      expect(result.success).toBe(true);
    });

    it("validates connection with optional label", () => {
      const connection: Connection = {
        id: "conn-2",
        a_port_id: "port-abc-123",
        b_port_id: "port-def-456",
        label: "Uplink to Core",
      };

      const result = ConnectionSchema.safeParse(connection);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.label).toBe("Uplink to Core");
      }
    });

    it("validates connection with optional color", () => {
      const connection: Connection = {
        id: "conn-3",
        a_port_id: "port-abc-123",
        b_port_id: "port-def-456",
        color: "#FF5500",
      };

      const result = ConnectionSchema.safeParse(connection);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.color).toBe("#FF5500");
      }
    });

    it("validates connection with all optional fields", () => {
      const connection: Connection = {
        id: "conn-4",
        a_port_id: "port-abc-123",
        b_port_id: "port-def-456",
        label: "Management Link",
        color: "#00FF00",
      };

      const result = ConnectionSchema.safeParse(connection);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.label).toBe("Management Link");
        expect(result.data.color).toBe("#00FF00");
      }
    });

    it("allows lowercase hex colors", () => {
      const connection: Connection = {
        id: "conn-5",
        a_port_id: "port-abc-123",
        b_port_id: "port-def-456",
        color: "#ff5500",
      };

      const result = ConnectionSchema.safeParse(connection);
      expect(result.success).toBe(true);
    });
  });

  describe("invalid connections", () => {
    it("rejects connection with missing id", () => {
      const connection = {
        a_port_id: "port-abc-123",
        b_port_id: "port-def-456",
      };

      const result = ConnectionSchema.safeParse(connection);
      expect(result.success).toBe(false);
    });

    it("rejects connection with empty id", () => {
      const connection = {
        id: "",
        a_port_id: "port-abc-123",
        b_port_id: "port-def-456",
      };

      const result = ConnectionSchema.safeParse(connection);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "Connection ID is required",
        );
      }
    });

    it("rejects connection with missing a_port_id", () => {
      const connection = {
        id: "conn-1",
        b_port_id: "port-def-456",
      };

      const result = ConnectionSchema.safeParse(connection);
      expect(result.success).toBe(false);
    });

    it("rejects connection with missing b_port_id", () => {
      const connection = {
        id: "conn-1",
        a_port_id: "port-abc-123",
      };

      const result = ConnectionSchema.safeParse(connection);
      expect(result.success).toBe(false);
    });

    it("rejects self-connection (a_port_id === b_port_id)", () => {
      const connection = {
        id: "conn-self",
        a_port_id: "port-same-123",
        b_port_id: "port-same-123",
      };

      const result = ConnectionSchema.safeParse(connection);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "Cannot connect a port to itself",
        );
      }
    });

    it("rejects invalid hex color (missing #)", () => {
      const connection = {
        id: "conn-bad-color-1",
        a_port_id: "port-abc-123",
        b_port_id: "port-def-456",
        color: "FF5500",
      };

      const result = ConnectionSchema.safeParse(connection);
      expect(result.success).toBe(false);
    });

    it("rejects invalid hex color (wrong length)", () => {
      const connection = {
        id: "conn-bad-color-2",
        a_port_id: "port-abc-123",
        b_port_id: "port-def-456",
        color: "#FFF",
      };

      const result = ConnectionSchema.safeParse(connection);
      expect(result.success).toBe(false);
    });

    it("rejects label exceeding 100 characters", () => {
      const connection = {
        id: "conn-long-label",
        a_port_id: "port-abc-123",
        b_port_id: "port-def-456",
        label: "A".repeat(101),
      };

      const result = ConnectionSchema.safeParse(connection);
      expect(result.success).toBe(false);
    });
  });

  describe("passthrough behavior", () => {
    it("preserves unknown fields for forward compatibility", () => {
      const connectionWithExtra = {
        id: "conn-extra",
        a_port_id: "port-abc-123",
        b_port_id: "port-def-456",
        future_field: "some value",
        another_field: 42,
      };

      const result = ConnectionSchema.safeParse(connectionWithExtra);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.future_field).toBe("some value");
        expect(result.data.another_field).toBe(42);
      }
    });
  });
});

describe("Layout with connections", () => {
  const baseLayout = {
    version: "1.0.0",
    name: "Test Layout",
    rack: {
      name: "Rack 1",
      height: 42,
      width: 19,
      desc_units: false,
      show_rear: true,
      form_factor: "4-post",
      starting_unit: 1,
      position: 0,
      devices: [],
    },
    device_types: [],
    settings: {
      display_mode: "label",
      show_labels_on_images: false,
    },
  };

  it("validates layout without connections", () => {
    const result = LayoutSchema.safeParse(baseLayout);
    expect(result.success).toBe(true);
  });

  it("validates layout with empty connections array", () => {
    const layout = {
      ...baseLayout,
      connections: [],
    };

    const result = LayoutSchema.safeParse(layout);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.connections).toEqual([]);
    }
  });

  it("validates layout with connections", () => {
    const layout = {
      ...baseLayout,
      connections: [
        {
          id: "conn-1",
          a_port_id: "port-abc-123",
          b_port_id: "port-def-456",
          label: "Primary uplink",
          color: "#0088FF",
        },
        {
          id: "conn-2",
          a_port_id: "port-ghi-789",
          b_port_id: "port-jkl-012",
        },
      ],
    };

    const result = LayoutSchema.safeParse(layout);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.connections).toHaveLength(2);
      expect(result.data.connections![0].label).toBe("Primary uplink");
      expect(result.data.connections![1].label).toBeUndefined();
    }
  });

  it("rejects layout with invalid connection in array", () => {
    const layout = {
      ...baseLayout,
      connections: [
        {
          id: "conn-valid",
          a_port_id: "port-abc-123",
          b_port_id: "port-def-456",
        },
        {
          id: "conn-self",
          a_port_id: "port-same",
          b_port_id: "port-same", // Self-connection
        },
      ],
    };

    const result = LayoutSchema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it("still supports deprecated cables field", () => {
    const layout = {
      ...baseLayout,
      cables: [
        {
          id: "cable-1",
          a_device_id: "device-1",
          a_interface: "eth0",
          b_device_id: "device-2",
          b_interface: "eth0",
        },
      ],
    };

    const result = LayoutSchema.safeParse(layout);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cables).toHaveLength(1);
    }
  });

  it("supports both connections and cables in same layout", () => {
    const layout = {
      ...baseLayout,
      connections: [
        {
          id: "conn-1",
          a_port_id: "port-abc-123",
          b_port_id: "port-def-456",
        },
      ],
      cables: [
        {
          id: "cable-1",
          a_device_id: "device-1",
          a_interface: "eth0",
          b_device_id: "device-2",
          b_interface: "eth0",
        },
      ],
    };

    const result = LayoutSchema.safeParse(layout);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.connections).toHaveLength(1);
      expect(result.data.cables).toHaveLength(1);
    }
  });
});
