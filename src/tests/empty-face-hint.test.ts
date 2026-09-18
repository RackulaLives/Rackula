import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Rack from "$lib/components/Rack.svelte";
import { getEmptyRackHintLines } from "$lib/utils/rack";
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

    expect(screen.getByRole("note")).toBeInTheDocument();
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

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
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

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("hides the hint on the face that has devices while the other face is empty", () => {
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
        faceFilter: "front",
      },
    });

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("shows one hint for an empty rack, on the front face only (#3330)", () => {
    const rack = createTestRack({ devices: [] });
    const props = { rack, deviceLibrary: [], selected: false };

    const front = render(Rack, { props: { ...props, faceFilter: "front" } });
    expect(screen.getByRole("note")).toBeInTheDocument();
    front.unmount();

    render(Rack, { props: { ...props, faceFilter: "rear" } });
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});

describe("getEmptyRackHintLines (#3330)", () => {
  const emptyRack = {
    face: "front" as const,
    rackHasDevices: false,
    faceHasDevices: false,
    interiorWidth: 1000,
  };

  it("omits the hint when it is taller than the rack interior", () => {
    expect(
      getEmptyRackHintLines({ ...emptyRack, interiorHeight: 1000 }).length,
    ).toBeGreaterThan(0);
    expect(getEmptyRackHintLines({ ...emptyRack, interiorHeight: 1 })).toEqual(
      [],
    );
  });
});
