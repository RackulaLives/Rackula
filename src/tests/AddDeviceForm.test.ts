import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import AddDeviceForm from "$lib/components/AddDeviceForm.svelte";
import { ALL_CATEGORIES } from "$lib/types/constants";

// Setup URL mocks for jsdom (needed for ImageUpload component)
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  URL.revokeObjectURL = vi.fn();
});

afterAll(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

describe("AddDeviceForm Component", () => {
  describe("Open state", () => {
    it("renders when open=true", () => {
      render(AddDeviceForm, { props: { open: true } });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("is hidden when open=false", () => {
      render(AddDeviceForm, { props: { open: false } });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("Form fields", () => {
    it("renders all fields", () => {
      render(AddDeviceForm, { props: { open: true } });
      expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^height/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^category$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^colour$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^notes/i)).toBeInTheDocument();
    });

    it("category dropdown has all 10 categories", () => {
      render(AddDeviceForm, { props: { open: true } });
      const categorySelect = screen.getByLabelText(
        /category/i,
      ) as HTMLSelectElement;

      // Check that all categories are present
      ALL_CATEGORIES.forEach((category) => {
        const option = categorySelect.querySelector(
          `option[value="${category}"]`,
        );
        expect(option).toBeInTheDocument();
      });
    });
  });

  describe("Colour defaults", () => {
    it("colour defaults to category colour", async () => {
      render(AddDeviceForm, { props: { open: true } });

      // Default category is 'server', which has muted cyan colour #4A7A8A
      const colourInput = screen.getByLabelText(
        /^colour$/i,
      ) as HTMLInputElement;
      expect(colourInput.value.toLowerCase()).toBe("#4a7a8a");
    });

    it("colour updates when category changes", async () => {
      render(AddDeviceForm, { props: { open: true } });

      const categorySelect = screen.getByLabelText(/^category$/i);
      await fireEvent.change(categorySelect, { target: { value: "network" } });

      const colourInput = screen.getByLabelText(
        /^colour$/i,
      ) as HTMLInputElement;
      // Network colour is muted purple #7B6BA8
      expect(colourInput.value.toLowerCase()).toBe("#7b6ba8");
    });
  });

  describe("Validation", () => {
    it("rejects empty name", async () => {
      render(AddDeviceForm, { props: { open: true } });

      const submitBtn = screen.getByRole("button", { name: /add/i });
      await fireEvent.click(submitBtn);

      expect(screen.getByText(/name is required/i)).toBeInTheDocument();
    });

    it("rejects height < 1", async () => {
      render(AddDeviceForm, { props: { open: true } });

      // Fill name
      const nameInput = screen.getByLabelText(/^name$/i);
      await fireEvent.input(nameInput, { target: { value: "Test Device" } });

      // Set invalid height
      const heightInput = screen.getByLabelText(/^height/i);
      await fireEvent.input(heightInput, { target: { value: "0" } });

      const submitBtn = screen.getByRole("button", { name: /add/i });
      await fireEvent.click(submitBtn);

      expect(
        screen.getByText(/height must be between 0.5 and 42/i),
      ).toBeInTheDocument();
    });

    it("rejects height > 42", async () => {
      render(AddDeviceForm, { props: { open: true } });

      // Fill name
      const nameInput = screen.getByLabelText(/^name$/i);
      await fireEvent.input(nameInput, { target: { value: "Test Device" } });

      // Set invalid height
      const heightInput = screen.getByLabelText(/^height/i);
      await fireEvent.input(heightInput, { target: { value: "43" } });

      const submitBtn = screen.getByRole("button", { name: /add/i });
      await fireEvent.click(submitBtn);

      expect(
        screen.getByText(/height must be between 0.5 and 42/i),
      ).toBeInTheDocument();
    });
  });

  describe("Submit", () => {
    it("adds device to library on valid submit", async () => {
      const onAdd = vi.fn();
      render(AddDeviceForm, { props: { open: true, onadd: onAdd } });

      // Fill form
      const nameInput = screen.getByLabelText(/^name$/i);
      await fireEvent.input(nameInput, { target: { value: "My Server" } });

      const heightInput = screen.getByLabelText(/^height/i);
      await fireEvent.input(heightInput, { target: { value: "2" } });

      const categorySelect = screen.getByLabelText(/^category$/i);
      await fireEvent.change(categorySelect, { target: { value: "server" } });

      const notesInput = screen.getByLabelText(/^notes/i);
      await fireEvent.input(notesInput, { target: { value: "Test notes" } });

      const submitBtn = screen.getByRole("button", { name: /add/i });
      await fireEvent.click(submitBtn);

      expect(onAdd).toHaveBeenCalledTimes(1);
      const callArg = onAdd.mock.calls[0]![0];
      expect(callArg.name).toBe("My Server");
      expect(callArg.height).toBe(2);
      expect(callArg.category).toBe("server");
      expect(callArg.colour.toLowerCase()).toBe("#4a7a8a"); // muted cyan
      expect(callArg.notes).toBe("Test notes");
    });

    it("submits with empty notes", async () => {
      const onAdd = vi.fn();
      render(AddDeviceForm, { props: { open: true, onadd: onAdd } });

      // Fill only required fields
      const nameInput = screen.getByLabelText(/^name$/i);
      await fireEvent.input(nameInput, { target: { value: "Simple Device" } });

      const heightInput = screen.getByLabelText(/^height/i);
      await fireEvent.input(heightInput, { target: { value: "1" } });

      const submitBtn = screen.getByRole("button", { name: /add/i });
      await fireEvent.click(submitBtn);

      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Simple Device",
          height: 1,
          notes: "",
        }),
      );
    });
  });

  describe("Cancel", () => {
    it("has a cancel button", () => {
      render(AddDeviceForm, { props: { open: true } });
      expect(
        screen.getByRole("button", { name: /cancel/i }),
      ).toBeInTheDocument();
    });

    it("dispatches cancel event when cancel button clicked", async () => {
      const onCancel = vi.fn();
      render(AddDeviceForm, { props: { open: true, oncancel: onCancel } });

      const cancelBtn = screen.getByRole("button", { name: /cancel/i });
      await fireEvent.click(cancelBtn);

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("Form reset", () => {
    it("resets form when closed and reopened", async () => {
      const { rerender } = render(AddDeviceForm, { props: { open: true } });

      // Enter some data
      const nameInput = screen.getByLabelText(/^name$/i);
      await fireEvent.input(nameInput, { target: { value: "Test" } });

      // Close and reopen
      await rerender({ open: false });
      await rerender({ open: true });

      // Check form is reset
      const newNameInput = screen.getByLabelText(/^name$/i);
      expect(newNameInput).toHaveValue("");
    });
  });

  describe("Keyboard shortcuts", () => {
    it("Escape key cancels form", async () => {
      const onCancel = vi.fn();
      render(AddDeviceForm, { props: { open: true, oncancel: onCancel } });

      await fireEvent.keyDown(document, { key: "Escape" });

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("Depth toggle (#241)", () => {
    it("renders depth toggle", () => {
      render(AddDeviceForm, { props: { open: true } });
      expect(screen.getByLabelText(/full depth/i)).toBeInTheDocument();
    });

    it("depth toggle defaults to ON (full-depth)", () => {
      render(AddDeviceForm, { props: { open: true } });
      const toggle = screen.getByLabelText(/full depth/i) as HTMLInputElement;
      expect(toggle.checked).toBe(true);
    });

    it("created device has isFullDepth=true when toggle ON", async () => {
      const onAdd = vi.fn();
      render(AddDeviceForm, { props: { open: true, onadd: onAdd } });

      // Fill required fields
      const nameInput = screen.getByLabelText(/^name$/i);
      await fireEvent.input(nameInput, {
        target: { value: "Full Depth Server" },
      });

      // Toggle should be ON by default
      const submitBtn = screen.getByRole("button", { name: /add/i });
      await fireEvent.click(submitBtn);

      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          isFullDepth: true,
        }),
      );
    });

    it("created device has isFullDepth=false when toggle OFF", async () => {
      const onAdd = vi.fn();
      render(AddDeviceForm, { props: { open: true, onadd: onAdd } });

      // Fill required fields
      const nameInput = screen.getByLabelText(/^name$/i);
      await fireEvent.input(nameInput, {
        target: { value: "Half Depth Switch" },
      });

      // Turn OFF the toggle
      const toggle = screen.getByLabelText(/full depth/i);
      await fireEvent.click(toggle);

      const submitBtn = screen.getByRole("button", { name: /add/i });
      await fireEvent.click(submitBtn);

      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          isFullDepth: false,
        }),
      );
    });

    it("toggle state resets when form reopens", async () => {
      const { rerender } = render(AddDeviceForm, { props: { open: true } });

      // Turn OFF the toggle
      const toggle = screen.getByLabelText(/full depth/i) as HTMLInputElement;
      await fireEvent.click(toggle);
      expect(toggle.checked).toBe(false);

      // Close and reopen
      await rerender({ open: false });
      await rerender({ open: true });

      // Toggle should be back to ON (default)
      const newToggle = screen.getByLabelText(
        /full depth/i,
      ) as HTMLInputElement;
      expect(newToggle.checked).toBe(true);
    });

    it("displays helper text explaining full-depth", () => {
      render(AddDeviceForm, { props: { open: true } });
      expect(screen.getByText(/occupies.*front.*rear/i)).toBeInTheDocument();
    });
  });

  describe("Image uploads (v0.1.0)", () => {
    it("shows image upload for front", () => {
      render(AddDeviceForm, { props: { open: true } });
      expect(screen.getByText(/front image/i)).toBeInTheDocument();
    });

    it("shows image upload for rear", () => {
      render(AddDeviceForm, { props: { open: true } });
      expect(screen.getByText(/rear image/i)).toBeInTheDocument();
    });

    it("images are optional - form submits without them", async () => {
      const onAdd = vi.fn();
      render(AddDeviceForm, { props: { open: true, onadd: onAdd } });

      // Fill only required fields
      const nameInput = screen.getByLabelText(/^name$/i);
      await fireEvent.input(nameInput, { target: { value: "Test Device" } });

      const submitBtn = screen.getByRole("button", { name: /add/i });
      await fireEvent.click(submitBtn);

      expect(onAdd).toHaveBeenCalledTimes(1);
      const callArg = onAdd.mock.calls[0]?.[0];
      expect(callArg?.frontImage).toBeUndefined();
      expect(callArg?.rearImage).toBeUndefined();
    });
  });
});
