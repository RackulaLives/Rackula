import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/svelte";
import ShareDialog from "$lib/components/ShareDialog.svelte";
import { createTestLayout, createTestRack } from "./factories";

const shareMocks = vi.hoisted(() => ({
  generateShareUrl: vi.fn<() => string | null>(
    () => "https://example.test/?l=abc",
  ),
}));

vi.mock("$lib/utils/share", async () => {
  const actual =
    await vi.importActual<typeof import("$lib/utils/share")>(
      "$lib/utils/share",
    );
  return {
    ...actual,
    generateShareUrl: shareMocks.generateShareUrl,
  };
});

vi.mock("$lib/utils/qrcode", () => ({
  generateQRCode: vi.fn(async () => "data:image/png;base64,"),
  canFitInQR: vi.fn(() => false),
  QR_MIN_PRINT_CM: 4,
}));

// R6d/#2988: ShareDialog previously derived shareUrl unconditionally, so an
// unrelated effect reading isTooLong forced generateShareUrl (and the
// compression it does) to run on every layout edit even while the dialog was
// closed, including at boot with a zero-rack layout (logging a spurious
// "Layout must have at least one rack" warning on every fresh load).
describe("ShareDialog share URL computation (#2988)", () => {
  beforeEach(() => {
    shareMocks.generateShareUrl.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not compute a share URL while closed", () => {
    const layout = createTestLayout({ racks: [] });
    render(ShareDialog, { props: { open: false, layout, onclose: () => {} } });

    expect(shareMocks.generateShareUrl).not.toHaveBeenCalled();
  });

  it("computes the share URL once open", () => {
    const layout = createTestLayout({
      racks: [createTestRack({ id: "rack-1", name: "Rack 1" })],
    });
    render(ShareDialog, { props: { open: true, layout, onclose: () => {} } });

    expect(shareMocks.generateShareUrl).toHaveBeenCalledWith(layout);
  });
});
