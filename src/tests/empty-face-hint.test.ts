import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Rack from "$lib/components/Rack.svelte";
import {
  createTestRack,
  createTestDevice,
  createTestDeviceType,
} from "./factories";

describe("Empty-face hint", () => {
  it("shows a hint when no devices face the rear", () => {
    // A half-depth front-only device: nothing is on the rear.
    const deviceType = createTestDeviceType({
      slug: "sw",
      model: "Switch",
      u_height: 1,
      is_full_depth: false,
    });
    const rack = createTestRack({
      devices: [
        createTestDevice({ device_type: "sw", position: 5, face: "front" }),
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

    expect(
      screen.getByText(/no rear-facing or full-depth devices/i),
    ).toBeInTheDocument();
  });

  it("hides the hint when a full-depth device is visible on the rear", () => {
    // Full-depth (is_full_depth omitted) device stored face: "front". It
    // occupies both faces, so it shows on the rear and the hint is suppressed.
    const deviceType = createTestDeviceType({
      slug: "nas",
      model: "NAS",
      u_height: 1,
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

    expect(
      screen.queryByText(/no rear-facing or full-depth devices/i),
    ).not.toBeInTheDocument();
  });

  it("hides the hint when a rear-mounted half-depth device faces the rear", () => {
    // A genuinely rear-facing device: half-depth, mounted on the rear. It is
    // the only thing on the rear, so the hint must be suppressed. Guards
    // against a regression that would ignore rear-mounted half-depth devices.
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

    expect(
      screen.queryByText(/no rear-facing or full-depth devices/i),
    ).not.toBeInTheDocument();
  });
});
