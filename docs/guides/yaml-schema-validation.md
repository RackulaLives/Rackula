# YAML Schema Validation Guide

This guide explains how to validate hand-edited Rackula layout YAML in your editor using the published JSON Schema. Wiring the schema into an editor catches structural mistakes (missing required fields, wrong types, bad enum values) as you type, before you load the file back into Rackula.

## What the schema validates

The schema is generated from Rackula's authoritative Zod schema and describes the structural shape of a saved layout: the required fields, their types, and the allowed enum values. It catches the common hand-editing mistakes:

- A required field is missing (for example a device without a `position`).
- A field has the wrong type (a string where a number is expected).
- An enum value is invalid (a `category` or `form_factor` that does not exist).

It is a structural contract, not a full validator. The schema covers roughly 80 percent of what Rackula checks on load. The remaining rules (cross-field constraints, referential integrity, the load-time transform) live in the Zod schema and run only when Rackula opens the file. See [Limitations](#limitations) for the full list.

## Schema URLs

There are two URLs, and they serve different purposes.

| URL | Purpose |
| --- | --- |
| `https://schemas.racku.la/layout/v1.json` | Canonical `$id`. The stable identifier written inside the schema. |
| `https://count.racku.la/schemas/layout-v1.json` | Interim served URL. The fetchable location editors download to validate. |

The canonical `$id` is an identifier, not a fetch target. Rackula itself decides whether it can load a file offline from the `metadata.schema_version` field and never resolves the `$id` over the network, so the canonical identifier is wired before the `schemas.racku.la` domain exists.

Your editor is different: it must actually download the schema to validate against it. Use the interim served URL for any tooling that fetches a schema, including the `# yaml-language-server: $schema=...` hint below. When `schemas.racku.la` DNS is live it will serve the artifact at the canonical `$id` path and the fetch URL will converge on the `$id`.

Availability: the served URL goes live with the next Rackula release. Production (`count.racku.la`) publishes the schema only on a tagged release, and the dev environment (`https://d.racku.la/schemas/layout-v1.json`) is behind access control, so neither is fetchable by an external editor until then. Until the artifact is published, an editor cannot download the schema and the `# yaml-language-server` hint is simply ignored: this does not block editing, and Rackula still loads and validates the file itself offline from `metadata.schema_version`.

For the full identifier-versus-fetch rationale, see the Published Schema section of [SCHEMA.md](../reference/SCHEMA.md#published-schema).

## Sample layout with inline schema hint

Add a `# yaml-language-server: $schema=...` comment as the first line of your layout file. yaml-language-server reads this comment and validates the rest of the document against the schema it points to. This sample is a minimal but valid Rackula layout:

```yaml
# yaml-language-server: $schema=https://count.racku.la/schemas/layout-v1.json
metadata:
  id: 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed
  name: Homelab Rack
  schema_version: "1.0"
name: Homelab Rack
rack:
  id: rack-0
  name: Primary Rack
  height: 12
  width: 19
  desc_units: false
  form_factor: 4-post-cabinet
  starting_unit: 1
  position: 0
  devices:
    - id: 550e8400-e29b-41d4-a716-446655440000
      device_type: dell-r650
      position: 10
      face: front
      name: Web Server
    - id: 6ba7b810-9dad-11d1-80b4-00c04fd430c8
      device_type: 2u-ups
      position: 1
      face: front
      name: Main UPS
device_types:
  - slug: dell-r650
    manufacturer: Dell
    model: PowerEdge R650
    u_height: 1
    colour: "#8BE9FD"
    category: server
  - slug: 2u-ups
    manufacturer: APC
    model: Smart-UPS 3000
    u_height: 2
    colour: "#FF5555"
    category: power
settings:
  display_mode: label
  show_labels_on_images: false
```

The required fields the schema enforces here are:

- Top level: `name`, `device_types`, `settings`.
- `metadata`: `id`, `name`, `schema_version`.
- Each rack: `name`, `height`, `width`, `desc_units`, `form_factor`, `starting_unit`, `position`, `devices`.
- Each device: `id`, `device_type`, `position`, `face`.
- Each device type: `slug`, `u_height`, `colour`, `category`.
- `settings`: `display_mode`, `show_labels_on_images`.

For the full field reference, including optional fields and component arrays, see [SCHEMA.md](../reference/SCHEMA.md).

## VS Code setup

Validation in VS Code is provided by the Red Hat YAML extension ([redhat.vscode-yaml](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml)), which bundles yaml-language-server.

1. Install the YAML extension from the Extensions view (search for `redhat.vscode-yaml`).
2. Tell the extension which schema applies to your file. Either approach works.

### Option A: inline comment (per file)

Add the schema hint as the first line of the file, exactly as in the sample above:

```yaml
# yaml-language-server: $schema=https://count.racku.la/schemas/layout-v1.json
```

The comment travels with the file, so anyone who opens it gets validation without changing their own settings. This is the recommended approach for files you share.

### Option B: settings.json mapping (per workspace)

Map a file glob to the schema in your workspace `.vscode/settings.json`. This validates matching files without an inline comment:

```json
{
  "yaml.schemas": {
    "https://count.racku.la/schemas/layout-v1.json": [
      "*.rackula.yaml",
      "*.rackula.yml"
    ]
  }
}
```

Adjust the globs to match how you name your layout files.

Other editors that use yaml-language-server (Neovim with a YAML LSP, JetBrains IDEs with a YAML plugin) read the same inline `# yaml-language-server: $schema=...` comment, so Option A works across editors.

## Limitations

JSON Schema describes structure. It cannot express the cross-field rules that Rackula enforces in code, so an editor can report a file as valid that Rackula will still reject on load. The schema's own `$description` states this directly: expect roughly 80 percent validation coverage, and the Zod schema in `src/lib/schemas/index.ts` is authoritative.

The following are checked by Rackula on load but not by the schema in your editor:

- Cross-field rules (Zod `.refine` and `.superRefine`): referential integrity (a device referencing a parent or container that exists), carrier-first rail placement, and slot fit.
- Foreign keys: that a `device_type` slug on a placed device matches an entry in the `device_types` library, and similar references between collections.
- The load-time transform (Zod `.transform`): legacy position migration, rack id generation, and unknown-field preservation, which run only when Rackula opens the file.

Treat editor validation as a fast first pass that catches typos and shape errors. Loading the file into Rackula remains the authoritative check.

## Related documentation

- [SCHEMA.md](../reference/SCHEMA.md) - full field reference and the Published Schema section.
- [NETBOX-IMPORT.md](./NETBOX-IMPORT.md) - importing device types from the NetBox library.
