import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Rack from "$lib/components/Rack.svelte";
import {
  createTestRack,
  createTestDevice,
  createTestDeviceType,
} from "./factories";

describe("Rear treatment for full-depth devices", () => {
  it("marks a full-depth device as rear in the rear view", () => {
    const deviceType = createTestDeviceType({
      slug: "nas",
      model: "NAS",
      u_height: 2,
    });
    const rack = createTestRack({
      devices: [
        createTestDevice({ device_type: "nas", position: 5, face: "front" }),
      ],
    });

    render(Rack, {
      props: {
        rack,
        deviceLibrary: [deviceType],
        selected: false,
        faceFilter: "rear",
      },
    });

    expect(screen.getByText("REAR")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /NAS.*rear/i }),
    ).toBeInTheDocument();
  });

  it("does not mark the same device as rear in the front view", () => {
    const deviceType = createTestDeviceType({
      slug: "nas",
      model: "NAS",
      u_height: 2,
    });
    const rack = createTestRack({
      devices: [
        createTestDevice({ device_type: "nas", position: 5, face: "front" }),
      ],
    });

    render(Rack, {
      props: {
        rack,
        deviceLibrary: [deviceType],
        selected: false,
        faceFilter: "front",
      },
    });

    expect(screen.getByRole("button", { name: /NAS/i })).toBeInTheDocument();
    expect(screen.queryByText("REAR")).not.toBeInTheDocument();
  });

  it("does not mark a rear-mounted half-depth device as rear", () => {
    const deviceType = createTestDeviceType({
      slug: "pdu",
      model: "PDU",
      u_height: 1,
      is_full_depth: false,
    });
    const rack = createTestRack({
      devices: [
        createTestDevice({ device_type: "pdu", position: 5, face: "rear" }),
      ],
    });

    render(Rack, {
      props: {
        rack,
        deviceLibrary: [deviceType],
        selected: false,
        faceFilter: "rear",
      },
    });

    expect(screen.getByText("PDU")).toBeInTheDocument();
    expect(screen.queryByText("REAR")).not.toBeInTheDocument();
  });
});
