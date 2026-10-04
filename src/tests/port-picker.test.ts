/**
 * Port picker on the count chip (#3462): a device whose ports show as a chip
 * (collapsed on a 10-inch rack, or more than HIGH_DENSITY_THRESHOLD ports)
 * opens a list of its ports, and choosing one runs the same
 * handleConnectionPortClick path as clicking a port marker.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import RackDevice from "$lib/components/RackDevice.svelte";
import {
  getConnectionCreationStore,
  resetConnectionCreationStore,
} from "$lib/stores/connection-creation.svelte";
import { getConnectionStore } from "$lib/stores/connection.svelte";
import { getLayoutStore } from "$lib/stores/layout.svelte";
import type { InterfaceType, PlacedPort, PortClickInfo } from "$lib/types";
import { handleConnectionPortClick } from "$lib/utils/connection-creation";
import { HIGH_DENSITY_THRESHOLD } from "$lib/utils/port-geometry";
import { createTestLayoutStore, placeDeviceWithPorts } from "./factories";

const TEN_INCH = { rackWidth: 116, nominalRackWidth: 10 };
const NINETEEN_INCH = { rackWidth: 300, nominalRackWidth: 19 };

let layoutStore: ReturnType<typeof getLayoutStore>;
let rackId: string;

function handlePortClick(info: PortClickInfo) {
  const connectionStore = getConnectionStore();
  handleConnectionPortClick(info, {
    connectionCreation: getConnectionCreationStore(),
    isPlacementActive: false,
    validateConnection: connectionStore.validateConnection,
    addConnection: connectionStore.addConnection,
    showToast: () => {},
  });
}

/** Place a device with `count` copper ports and render it on a rack of the given width. */
function renderDevice(
  slug: string,
  position: number,
  count: number,
  rack: { rackWidth: number; nominalRackWidth: number },
  /** Drop PlacedPorts to mimic a legacy layout or a template added after placement. */
  keepPorts: (ports: PlacedPort[]) => PlacedPort[] = (ports) => ports,
) {
  const types: InterfaceType[] = Array.from(
    { length: count },
    () => "1000base-t",
  );
  const { deviceId, ports } = placeDeviceWithPorts(
    layoutStore,
    rackId,
    slug,
    position,
    types,
  );
  const device = layoutStore.device_types.find((dt) => dt.slug === slug)!;
  const { container } = render(RackDevice, {
    props: {
      device,
      ports: keepPorts(ports),
      placedDeviceId: deviceId,
      position,
      rackHeight: 42,
      rackId,
      deviceIndex: 0,
      selected: false,
      uHeight: 22,
      ...rack,
      onPortClick: handlePortClick,
    },
  });
  return { ports, view: within(container) };
}

async function choosePort(
  user: ReturnType<typeof userEvent.setup>,
  view: ReturnType<typeof within>,
  portName: string,
) {
  await user.click(view.getByRole("button", { name: /choose a port/i }));
  await user.click(
    await screen.findByRole("menuitem", { name: new RegExp(`^${portName},`) }),
  );
}

describe("port picker on the count chip (#3462)", () => {
  beforeEach(() => {
    layoutStore = createTestLayoutStore();
    rackId = layoutStore.addRack("Test Rack", 42)!.id;
    resetConnectionCreationStore();
  });

  it("starts and completes a connection between two collapsed devices on a 10-inch rack", async () => {
    const user = userEvent.setup();
    const a = renderDevice("switch-a", 10, 3, TEN_INCH);
    const b = renderDevice("switch-b", 20, 3, TEN_INCH);

    await choosePort(user, a.view, "port-1");
    expect(getConnectionCreationStore().sourcePortId).toBe(a.ports[1]!.id);

    await choosePort(user, b.view, "port-2");
    expect(getConnectionCreationStore().isCreating).toBe(false);
    expect(getConnectionStore().connections).toContainEqual(
      expect.objectContaining({
        a_port_id: a.ports[1]!.id,
        b_port_id: b.ports[2]!.id,
      }),
    );
  });

  it("shows whether each port is connected or free", async () => {
    const user = userEvent.setup();
    const a = renderDevice("switch-a", 10, 3, TEN_INCH);
    const b = renderDevice("switch-b", 20, 3, TEN_INCH);
    getConnectionStore().addConnection({
      a_port_id: a.ports[0]!.id,
      b_port_id: b.ports[0]!.id,
    });

    await user.click(a.view.getByRole("button", { name: /choose a port/i }));

    expect(
      await screen.findByRole("menuitem", { name: /^port-0, .*connected/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /^port-1, .*free/ }),
    ).toBeInTheDocument();
  });

  it("picks a port on a device with more than the high-density threshold", async () => {
    const user = userEvent.setup();
    const a = renderDevice(
      "big-switch",
      10,
      HIGH_DENSITY_THRESHOLD + 1,
      NINETEEN_INCH,
    );

    await choosePort(user, a.view, "port-20");

    expect(getConnectionCreationStore().sourcePortId).toBe(a.ports[20]!.id);
  });

  it("gives a collapsed device one focus stop, not one per port", () => {
    const a = renderDevice("switch-a", 10, 3, TEN_INCH);

    expect(
      a.view.getByRole("button", { name: /choose a port/i }),
    ).toBeInTheDocument();
    expect(
      a.view.queryByRole("button", { name: /^port-0 \(/ }),
    ).not.toBeInTheDocument();
  });

  it("opens from the keyboard, moves with the arrow keys and selects with Enter", async () => {
    const user = userEvent.setup();
    const a = renderDevice("switch-a", 10, 3, TEN_INCH);

    a.view.getByRole("button", { name: /choose a port/i }).focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("menu");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(getConnectionCreationStore().sourcePortId).toBe(a.ports[1]!.id);
  });

  it("marks an interface with no PlacedPort as unavailable and does not choose it", async () => {
    const user = userEvent.setup();
    const a = renderDevice("switch-a", 10, 3, TEN_INCH, (ports) =>
      ports.slice(1),
    );

    await user.click(a.view.getByRole("button", { name: /choose a port/i }));
    const legacy = await screen.findByRole("menuitem", {
      name: /^port-0, .*unavailable/,
    });
    expect(legacy).toHaveAttribute("aria-disabled", "true");
    await user.click(legacy);

    expect(getConnectionCreationStore().isCreating).toBe(false);
  });

  it("does not open a picker when no port on the chip can be chosen", async () => {
    const user = userEvent.setup();
    const a = renderDevice("switch-a", 10, 3, TEN_INCH, () => []);
    const chip = a.view.getByRole("button", { name: /no ports to choose/i });

    expect(chip).toHaveAttribute("aria-disabled", "true");
    await user.click(chip);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the chip", async () => {
    const user = userEvent.setup();
    const a = renderDevice("switch-a", 10, 3, TEN_INCH);
    const chip = a.view.getByRole("button", { name: /choose a port/i });

    chip.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("menu");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(chip).toHaveFocus();
    expect(getConnectionCreationStore().isCreating).toBe(false);
  });
});
