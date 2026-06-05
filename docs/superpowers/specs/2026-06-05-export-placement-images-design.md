# Export placement images design

Issue: #1902 (bug: Export does not include device placement images)

## Problem

Device placement images (custom front/rear photos attached to a specific device
placement) render in the editor but are missing from every image-based export
(SVG, PNG, JPEG, PDF). CSV is data-only and unaffected.

## Verdict: bug, not a design choice

The data model supports placement images and the editor renders them; only the
export path omits them.

- Storage: images live in a `Map<string, DeviceImageData>` keyed either by device
  type slug (for example `dell-r620`) or by placement key `placement-{placedDevice.id}`.
- Editor: `RackDevice.svelte:156-171` does a placement-first, per-face lookup. It
  tries `getImageUrl("placement-{id}", face)` and falls back to
  `getImageUrl(device.slug, face)`.
- Export: `export.ts` `renderRackView()` (around line 888) looks up images only by
  type slug: `images?.get(device.slug)`. It never tries the `placement-{id}` key,
  so placement photos are silently dropped.

The full image map is already passed into `generateExportSVG()` from
`persistence-manager.svelte.ts`, so the data is present at export time. Nothing in
the pipeline intentionally excludes placement images; the lookup is simply incomplete.

## Fix

Mirror the editor's per-face fallback at the single export render point in
`export.ts` `renderRackView()`:

```js
const placementImages = images?.get(`placement-${placedDevice.id}`);
const slugImages = images?.get(device.slug);
const deviceImage = placementImages?.[face] ?? slugImages?.[face];
const imageUrl = deviceImage?.url ?? deviceImage?.dataUrl;
```

The fallback is per face (`?.[face] ?? ?.[face]`), not per device. A placement with
only a front image must still inherit the rear image from its device type, exactly
as the editor behaves. A per-device fallback (`placementImages ?? slugImages`) would
regress this: a truthy placement object with only a front image would shadow the
slug's rear image.

`placedDevice` is the `renderRackView()` loop variable and carries `.id`, so the
placement key is available without signature changes.

### Why no extra work is needed

- Serialization: `ImageData` always carries `url` (bundled asset) or `dataUrl`
  (base64 user upload). Export already resolves `url ?? dataUrl`. Placement images
  are user uploads with `dataUrl`, which survives serialization into standalone SVG,
  PNG, and PDF. No blob or object-URL conversion is required.
- Formats: SVG, PNG, JPEG, and PDF all derive from `generateExportSVG()`, so the
  single lookup change fixes all of them. CSV carries no images.
- No toggle: image visibility is already controlled by `displayMode`
  (`label`, `image`, `image-label`) in both editor and export. A separate export
  toggle would duplicate that control.

## Testing

TDD, written first against the export SVG generation:

1. A device with a placement image, exported in an image display mode, produces a
   serialized SVG that contains an `<image>` referencing the placement `dataUrl`.
2. Per-face fallback: a placement with only a front image, exported for the rear
   face, still emits the device type's rear image.

Assertions run against the serialized SVG string (substring or `<image>` count), not
DOM queries, to respect the ESLint test rules (no `querySelector`, no `toHaveClass`).

## Out of scope

- No export image on/off toggle (`displayMode` already covers this).
- No data-model or image-store changes.
- No changes to CSV export.
