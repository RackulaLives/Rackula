# Image load-state UX (#2532)

Wave 2 of epic #2513. Consumes #2531's load failure data and turns it into UX.

## Verified facts (re-located on main 9d4df0b4)

- `eagerFetchServerImages` (server-load-images.ts) returns `{ images, failedImagesCount, failedKeys }`. `loadSavedLayout` (api.ts:302) merges these.
- `finalizeLayoutLoad` (load-pipeline.ts:36) is the single choke point all load paths funnel through. It receives the parsed `layout` and `failedImagesCount`, and today shows only a generic count warning toast. It does NOT receive `failedKeys`.
- `failedKeys` carry the device-level key only (placement key `placement-{layoutId}:{deviceId}` for server load, or a device-type slug for YAML embedded decode). The FACE is dropped at the push site in both `eagerFetchServerImages` and `decodeYamlImages`. A key appears once per failed face.
- `placement-key.ts` already has `deviceIdFromPlacementKey`, `isPlacementKey`, `layoutIdFromPlacementKey`.
- Human device label convention: `placedDevice.name ?? deviceType.model ?? device_type-slug`.
- Reduced motion: `animations.css:205` resets `transition-duration`/`animation-duration` to `0.01ms !important` on `*`. A CSS animation/transition fade is auto-disabled; a Svelte `transition:` directive is NOT. -> use CSS. `motion.ts` has `prefersReducedMotion()` if a JS gate is ever needed.
- Toast store: `getToastStore().showToast(message, type, duration?, action?)`; `warning`/`error` toasts render `role="alert"` (Toast.svelte:58) inside ToastContainer `aria-live="polite"`. Reaches the live region.
- RackDevice receives `device` (DeviceType), `placedDeviceName`, `placedDeviceId` -- NOT the PlacedDevice. It knows only whether a URL is in the store (`deviceImageUrl`, :153). Rack.svelte:469 instantiates it and has the full PlacedDevice with `front_image`/`rear_image`.
- EditPanelImage.svelte is the placement-override edit panel (its own inline upload slots; .btn sub-44px; alt `"{face} override preview"`). ImageUpload.svelte is used by AddDeviceForm for device-TYPE images (.btn no min-height; alt `"{face} view preview"`).

## Deliverables

### 1. Failure-label helper (NEW, tested)

`src/lib/utils/image-failure-labels.ts`

```ts
export function resolveImageFailureMessages(
  failedKeys: string[],
  layout: Layout,
): string[];
```

- Group failedKeys by key, counting occurrences (1 = one face failed, 2 = both faces).
- For a placement key: parse UUID, find the placed device across `layout.racks[].devices[]`, resolve label (`name ?? type.model ?? device_type`). Determine the failed face: if the device sets only one of `front_image`/`rear_image`, that is the failed face; if both set and count is 1, fall back to "an image"; if count is 2, "front and rear images".
- For a non-placement key (slug): label is the slug; face indeterminate -> "an image".
- Missing device (key references a UUID not in the layout): skip it (defensive; never emit a bare UUID).
- Message form: `Front image for "<label>" failed to load`, `Rear image for "<label>" failed to load`, `Front and rear images for "<label>" failed to load`, `An image for "<label>" failed to load`.
- De-dupe identical messages.

High-value: pure logic, multiple edge cases (placement vs slug, one vs both faces, missing device). Test in `src/tests/image-failure-labels.test.ts`.

### 2. Wire per-face toasts into the load choke point (tested)

Extend `finalizeLayoutLoad` to accept `failedKeys` and emit one named warning toast per failed device (via the helper), replacing the generic count toast when keys are present. Falls back to the count toast when only a count is known (no keys). Pass `failedKeys` through from `loadFromApi`, `restoreFromSnapshot`, `App.svelte` recovery, `DialogOrchestrator`. Test in `load-pipeline.test.ts`.

### 3. RackDevice: placeholder + reduced-motion-safe fade + a11y (no unit test -- ESLint blocks DOM/visual tests; axe #2099 + visual regression cover)

- New prop `hasImageReference: boolean` (the placement sets `front_image`/`rear_image` for the current face), passed from Rack.svelte.
- When in image mode and the face is referenced but no URL is in the store yet: render a graceful placeholder (subtle, themed -- not blank/broken). Covers both the in-flight window and a failed face awaiting auto-retry.
- When the URL is present: render `<image>` with a CSS fade-in animation (auto-disabled by the global reduced-motion reset).
- A11y: give the `<image>` an accessible name via `role="img"` + `aria-label` naming device + face; fold the image/face into the group `aria-label` when an image shows.

### 4. Opportunistic a11y on the upload controls (no unit test)

- EditPanelImage.svelte: `.btn` -> `min-height: 44px`; preview alt -> device + face (the panel knows the device).
- ImageUpload.svelte: `.btn` -> `min-height: 44px`; preview alt -> device + face (thread a `deviceName` prop from AddDeviceForm).

## Auto-retry, NO button

No new interactive control. A failed face shows the placeholder and retries on the next reopen / autosave (existing behaviour). The a11y surface stays: image alt + the toast live region.
