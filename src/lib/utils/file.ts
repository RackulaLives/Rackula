/**
 * File utilities for saving and loading layouts
 */

/**
 * Open a file picker dialog and return the selected file
 * Returns null if the user cancels or no file is selected
 * Only accepts archive (.Rackula.zip) format
 */
export function openFilePicker(): Promise<File | null> {
  return new Promise((resolve) => {
    // Create a temporary file input and attach it to the DOM so that
    // Playwright's page.setInputFiles() can target it in E2E tests.
    const input = document.createElement("input");
    input.type = "file";
    input.setAttribute("data-testid", "file-input-load");
    // Accept ZIP files (including .Rackula.zip which is a zip file)
    // Using application/zip MIME type is more reliable across browsers
    input.accept = ".zip,application/zip,application/x-zip-compressed";
    // Hide visually but keep in DOM for Playwright access
    input.style.position = "absolute";
    input.style.opacity = "0";
    input.style.pointerEvents = "none";
    input.style.width = "0";
    input.style.height = "0";
    document.body.appendChild(input);

    let resolved = false;
    // Track change event separately to prevent race condition with focus timeout
    // This flag is set immediately when change fires, before any other logic
    let changeReceived = false;
    let cancelTimer: ReturnType<typeof setTimeout> | null = null;

    // Handle file selection
    const handleChange = () => {
      // Set flag immediately to prevent race with focus timeout
      changeReceived = true;
      if (resolved) return;
      resolved = true;
      cleanup();
      const file = input.files?.[0] ?? null;
      resolve(file);
    };

    // Handle cancel (window regains focus without a file being selected)
    const handleFocus = () => {
      // 300ms debounce for cancel detection — no browser API exists to detect
      // when the user cancels a file picker; this delay gives the change event
      // enough time to fire before we assume cancellation.
      if (cancelTimer) clearTimeout(cancelTimer);
      cancelTimer = setTimeout(() => {
        // Only treat as cancel if no change event was received
        if (resolved || changeReceived) return;
        resolved = true;
        cleanup();
        resolve(null);
      }, 300);
    };

    const cleanup = () => {
      if (cancelTimer) {
        clearTimeout(cancelTimer);
        cancelTimer = null;
      }
      input.removeEventListener("change", handleChange);
      window.removeEventListener("focus", handleFocus);
      input.remove();
    };

    input.addEventListener("change", handleChange);
    window.addEventListener("focus", handleFocus);

    // Trigger the file picker
    input.click();
  });
}

/**
 * Read file content as text using FileReader
 * (More compatible across environments than File.text())
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}
