# NetBox Field Mapping

Rackula reads and writes device types in the [netbox-community devicetype-library](https://github.com/netbox-community/devicetype-library) YAML format. This page lists how each field maps in both directions and what does not survive.

- Import: the **Import from NetBox** command reads one devicetype-library file into the device library (`src/lib/utils/netbox-import.ts`).
- Export: the **Export device type to NetBox YAML** command writes the selected device's type to `<slug>.yaml` (`src/lib/utils/netbox-export.ts`).

Both work on device types only. Importing rack placements (elevations) is tracked in [#3328](https://github.com/RackulaLives/Rackula/issues/3328). For bundling devicetype-library files into a brand pack at build time, see [NETBOX-IMPORT.md](../guides/NETBOX-IMPORT.md).

## Warnings

Every change that loses or alters data produces a warning.

- Export writes the warnings as a comment block after the `---` document start, so the file itself records what changed. The toast after the download says when the file lists changes.
- Import shows the warnings in the import dialog.

## Scalar fields

| Rackula | NetBox | Export | Import |
| --- | --- | --- | --- |
| `manufacturer` | `manufacturer` | Written. `Generic` when unset, with a warning. | Required. |
| `model` | `model` | Written. Falls back to the legacy `name`, then the slug, with a warning. | Required. |
| `slug` | `slug` | Written as is. | Normalised to a Rackula slug, and suffixed if it collides with an existing type. |
| `part_number` | `part_number` | Written as is. | Read as is. |
| `u_height` | `u_height` | Written as is, except child types, which are written as `0`. | Read as is. Defaults to 1. A 0U child imports as 1U with a warning. |
| `is_full_depth` | `is_full_depth` | Written. `true` when unset. | Read as is. Defaults to `true`. |
| `airflow` | `airflow` | Written as is. | `rear-to-side`, `bottom-to-top` and `top-to-bottom` have no Rackula value and are skipped with a warning. |
| `weight`, `weight_unit` | `weight`, `weight_unit` | Written. The unit is `kg` when unset, with a warning. | `g` and `oz` have no Rackula unit, so the weight is skipped with a warning. |
| `is_powered` | `is_powered` | Written as is. | Not read. |
| `subdevice_role` | `subdevice_role` | `parent` for any type with slots or device bays, otherwise as is. | Read as is. |
| `notes` | `comments` | `notes`, or the legacy `comments` field. | Read into `notes`. |
| `front_image`, `rear_image` | `front_image`, `rear_image` | Not written. The flags point at image files in the devicetype-library repository, which the export does not include. | Read as booleans. |

## Components

Export writes each list under its hyphenated devicetype-library key and omits empty lists. Import reads the hyphenated keys and also accepts the underscore spellings (`power_ports`) found in older files.

| Rackula | NetBox | Fields carried | Dropped on export |
| --- | --- | --- | --- |
| `interfaces` | `interfaces` | `name`, `label`, `type`, `mgmt_only`, `poe_mode`, `poe_type` | `position`, `direction`, `signal_type` |
| `power_ports` | `power-ports` | `name`, `type`, `maximum_draw`, `allocated_draw` | None |
| `power_outlets` | `power-outlets` | `name`, `type`, `power_port`, `feed_leg` | None |
| `device_bays` | `device-bays` | `name` | `position` |
| `inventory_items` | `inventory-items` | `name`, `manufacturer`, `part_id` | `serial`, `asset_tag` |
| None | `console-ports`, `console-server-ports`, `module-bays`, `front-ports`, `rear-ports` | Not written. | Counted in a warning and not imported. |

## Fields export drops

These are Rackula extensions with no devicetype-library field. Export drops them without a warning because they are dropped on every export:

- `colour`, `category`, `tags`
- `slot_width`, `rack_widths`
- `slots` (written as device bays, see below)
- `va_rating`, `outlet_count`
- `serial_number`, `asset_tag`, `links`, `custom_fields`
- Device images

## Carriers and device bays

Rackula models a carrier, slotted shelf or blade chassis as a container: a device type with `slots`. NetBox models the same thing as a parent device type with `device-bays`.

### Export

A device type with slots exports as `subdevice_role: parent` with one `device-bays` entry per slot, in slot order.

- The bay name is the slot name, or the slot id when the slot has no name.
- A repeated name gets a numeric suffix (`Bay`, `Bay 2`) so bay names stay unique, which NetBox requires.
- Slot positions, width fractions, heights and `accepts` do not survive. The export warns about this.

A device type without slots but with `device_bays` (for example, one imported from NetBox) exports those bays by name.

### Import

A parent device type with `device-bays` imports as a container with one slot per bay.

- When the slug matches a starter library container (the `carrier-*` carriers, the slotted shelves, `blade-chassis-4u`) with the same number of slots, the importer reuses that container's slot geometry and names the slots after the bays, in order.
- Otherwise it generates one slot per bay in a single row: each slot is `1/N` of the width and the full height of the device, named after its bay. The import warns that the geometry is approximate, so check the slot layout in the device editor.

### Round trip

| Exported type | Re-imported as |
| --- | --- |
| Starter library container | A container with the same slot count, bay names and slot geometry. |
| Other container | A container with the same slot count and bay names. Slots become a single row of equal widths. |

## Child device types

NetBox requires child device types (`subdevice_role: child`) to be 0U. Rackula needs a height of at least 0.5U.

- Export writes a child type with `u_height: 0` and warns that the Rackula height is not carried.
- Import gives a 0U child type a height of 1U and warns you to set the height to match the bay it fits.

Sub-U and half-width rail gear (for example a 0.5U unit that mounts in a carrier) is not a child type in Rackula and exports with its own height and no `subdevice_role`.

## Interface types

Rackula's interface type list is NetBox's Ethernet, virtual and LAG types plus Rackula additions for AV, USB, serial and console connectors.

| Type | Export | Import |
| --- | --- | --- |
| A type NetBox defines (for example `1000base-t`, `10gbase-x-sfpp`) | Written as is. | Read as is. |
| A Rackula-only type (for example `xlr-3`, `hdmi`, `usb-c`, `rs-232`, `console`) | Written as `other`, keeping the interface name. NetBox rejects types it does not know, so the file would not import otherwise. The warning names each type and how many interfaces used it. | Not applicable. |
| A type this Rackula version does not know (for example `400gbase-x-osfp` from a newer file) | Written unchanged with a warning, since newer NetBox versions may accept it. | Kept unchanged and shown as a generic port, with a warning. |

The Rackula-only types are `console`, `management`, `usb-a`, `usb-b`, `usb-c`, `usb-mini-b`, `usb-micro-b`, `xlr-3`, `xlr-5`, `trs-1-4`, `ts-1-4`, `rca`, `adat-optical`, `midi-din`, `bnc`, `db25-audio`, `phoenix`, `speakon`, `displayport`, `hdmi`, `sdi-bnc`, `vga`, `dmx-xlr`, `rs-232`, `rs-422`, `aes3`, `avb` and `dante`.

PoE types NetBox does not define (`passive-24v-1pair`, `passive-48v-1pair`, `passive-56v-4pair`) are removed from the interface on export, with a warning.
