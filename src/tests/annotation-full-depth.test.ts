import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import AnnotationColumn from "$lib/components/AnnotationColumn.svelte";
import {
  createTestRack,
  createTestDevice,
  createTestDeviceType,
} from "./factories";

describe("AnnotationColumn shows full-depth devices on both faces", () => {
  it("annotates a full-depth device on the rear face", () => {
    const deviceType = createTestDeviceType({
      slug: "nas",
      model: "NAS",
      u_height: 1,
    });
    const rack = createTestRack({
      devices: [
        createTestDevice({
          device_type: "nas",
          position: 5,
          face: "front",
          name: "Big NAS",
        }),
      ],
    });

    render(AnnotationColumn, {
      props: {
        rack,
        deviceLibrary: [deviceType],
        annotationField: "name",
        faceFilter: "rear",
      },
    });

    // SVG <text> renders both a <title> child and a text node with the same
    // value, so getAllByText is required to avoid "multiple elements" error.
    expect(screen.getAllByText("Big NAS")[0]).toBeInTheDocument();
  });
});
