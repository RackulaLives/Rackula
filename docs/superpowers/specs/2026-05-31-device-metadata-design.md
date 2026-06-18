# Device Metadata: Instance Fields and Layout-Defined Custom Fields

Date: 2026-05-31 Status: Approved design, pending implementation plan Related discussions: #1558 (serial/MAC), #1620 (CMDB custom fields, instance vs template) Adjacent: #1556 (brands, separate), #1557 (firewall category, separate), #1398 (EditPanel tab split), #571/#1209 (NetBox interop)

## Problem

Operators want per-instance asset data on the devices they place: serial number, asset tag, MAC address, and arbitrary organisation-specific fields (VLAN, cost centre, owner).

Today these have no home at the instance level:

- `serial_number` and `asset_tag` exist only on `DeviceTypeSchema` (the template), not on `PlacedDeviceSchema`. A serial is per physical unit, so storing it on the shared template is the wrong level. This is the core complaint in #1620.
- MAC address has no field anywhere.
- The only instance-level custom data is the untyped `custom_fields` Record, edited through a single hardcoded path (`updateDeviceIp` writes `custom_fields.ip`). There is no UI to manage other fields and no consistency across devices.

## Goals

- Promote `serial_number` and `asset_tag` to the placed-device instance.
- Add `mac_address` at the NetBox-correct level (the port/interface).
- Let a layout define a consistent, typed set of custom fields that every device can fill in.
- Surface all of the above in the annotation column and exports.

## Non-goals (explicitly out of scope)

These belong to separate issues and must not expand this spec:

- Site/location tagging, the site browser, and cross-layout device search (rest of #1620).
- Support-contract date tracking with expiry highlighting (rest of #1620).
- Editing device brands (#1556).
- A firewall device category (#1557).
- A NetBox import/export adapter (#1209/#571) consumes this model but is not built here.

## NetBox alignment

Rackula's schema is deliberately NetBox-compatible (≈25 "NetBox-compatible" annotations in `schemas/index.ts` and `types/index.ts`, plus a `comments` field marked "Legacy comments field from NetBox imports"). We follow the NetBox object model rather than inventing one:

| NetBox object | NetBox field | Rackula home |
| --- | --- | --- |
| Device (instance) | `serial`, `asset_tag`, `custom_fields` | `PlacedDevice` |
| Interface (component) | `mac_address` | `PlacedPort` |
| CustomField | typed: text/integer/boolean/date/url/select | `Layout.custom_field_defs` |
| DeviceType (template) | (NetBox has no serial/asset_tag here) | existing template defaults |

Naming decision: NetBox's instance field is `serial`, but Rackula's existing DeviceType key is `serial_number` and `AnnotationField` already uses `"serial"`. We use `serial_number` on `PlacedDevice` so instance and template share one key for annotation fallback. A future NetBox adapter maps `serial` <-> `serial_number`, consistent with the other name mappings it already performs.

## Data model

### PlacedDevice (instance) - `types/index.ts`, `schemas/index.ts`

Add to `PlacedDevice` and `PlacedDeviceSchema`:

```ts
serial_number?: string;  // z.string().max(100).optional()
asset_tag?: string;      // z.string().max(100).optional()
```

`custom_fields?: Record<string, unknown>` already exists and continues to hold custom-field values keyed by definition `name`. IP remains at `custom_fields.ip` unchanged.

Curated fields start blank on placement. They do not pre-fill from the DeviceType template, because serial and asset tag are per physical unit and inheriting the template value would usually be wrong.

### PlacedPort (component) - `types/index.ts`, `schemas/index.ts`

Add to `PlacedPort` and `PlacedPortSchema`:

```ts
mac_address?: string;  // z.string().optional()
```

MAC lives on the port because NetBox models it on the interface. A device with no defined ports cannot hold a MAC; that is acceptable and matches the NetBox model.

### Layout - `schemas/index.ts` (`LayoutSchemaBase`)

Add a typed custom-field definition list, mirroring NetBox `CustomField`:

```ts
custom_field_defs?: {
  name: string;                 // stable key into PlacedDevice.custom_fields
  label?: string;               // display label; defaults to name
  type: 'text' | 'integer' | 'boolean' | 'date' | 'url' | 'select';
  choices?: string[];           // required when type === 'select'
}[]
```

The layout already carries `custom_fields` (record) and `annotation_field`; this sits alongside them. Values for each def are stored per device in `PlacedDevice.custom_fields` under `name`.

## Annotation and export

`AnnotationField` already includes `"serial"` and `"asset_tag"`. Change their resolution to read the instance value first and fall back to the template value:

- `serial`: `placedDevice.serial_number ?? deviceType.serial_number`
- `asset_tag`: `placedDevice.asset_tag ?? deviceType.asset_tag`

Add `"mac_address"` to `AnnotationField`, resolving to the MAC of the device's first port (lowest port index) that has a `mac_address` set, or blank if none. Typed custom-field defs become selectable annotation fields, keyed by def `name`. The annotation column already drives SVG display and exports, so no separate export wiring is required.

## Store actions - `stores/layout.svelte.ts`

Follow the existing `updateDeviceIp` pattern exactly: snapshot the layout, locate the device, no-op guard if unchanged, dispatch a command for undo/redo, return boolean.

- `updateDeviceSerial(rackId, deviceIndex, value?: string): boolean`
- `updateDeviceAssetTag(rackId, deviceIndex, value?: string): boolean`
- `updateDeviceCustomField(rackId, deviceIndex, key: string, value: unknown): boolean`
- `updatePortMac(rackId, deviceIndex, portId, value?: string): boolean`
- Layout level: `setCustomFieldDefs(defs)` plus add/remove helpers, each a discrete command.

Each edit is its own command so undo operates per change, matching IP/notes behaviour.

## UI

### EditPanel - `components/EditPanel.svelte`

- Typed inputs for `serial_number` and `asset_tag` beside the existing IP and notes inputs, reusing the saved-indicator + blur-to-save behaviour from `handleDeviceIpBlur`.
- A custom-fields section that renders one control per `custom_field_defs` entry, with the control chosen by the def `type` (text input, number, checkbox, date picker, url input, select). Values read/write `PlacedDevice.custom_fields[name]`.
- A small "Manage fields" affordance to edit the layout-level def list (add, rename label, set type, remove, set select choices).

These are added to the panel as it exists today. They do not block on #1398 (the EditPanel tab-split refactor); when #1398 lands it reorganises where the inputs sit, but the fields and store actions are unaffected.

### Port UI

MAC is edited per port in the existing port editing UI, not in the device panel.

## Staging

The design is one spec; implementation ships in independently mergeable stages.

- Stage 1 (closes #1558 serial; core of #1620): instance `serial_number` + `asset_tag`, their store actions, EditPanel inputs, annotation instance-first fallback. Schema-clean and NetBox-aligned.
- Stage 2 (#1620 custom-fields slice): typed `custom_field_defs` on the layout, the field manager UI, per-device rendering, and custom-field annotation.
- Stage 3 (#1558 MAC): `mac_address` on `PlacedPort` and its port UI. Sized to the port work and can be its own issue alongside #71/#362.

## Risks and notes

- EditPanel growth overlaps #1398. Mitigation: add fields now, let #1398 reorganise later.
- `mac_address` requires defined ports. Mitigation: documented limitation; broader interface work tracked under #71/#362.
- Annotation fallback must not break existing layouts that rely on template serial/asset_tag. Mitigation: template remains the fallback; instance value only overrides when present.
