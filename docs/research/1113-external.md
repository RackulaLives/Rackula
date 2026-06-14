# Spike #1113 -- External / Industry Research: YAML Schema Versioning and Compatibility Policy

Industry precedent and concrete patterns to ground and pressure-test Rackula's decided
forward-compat stance: a reader **rejects** a layout whose `schema_version` MAJOR is newer
than the app understands; additive/minor changes still load.

---

## Semver for data formats

Semantic versioning (semver.org) was written for code APIs, but the same MAJOR/MINOR/PATCH
contract maps cleanly onto a serialized document schema. The "public API" becomes "the shape
of the document a reader must understand."

- **MAJOR** -- "incompatible API changes." Verbatim: "Major version X MUST be incremented if
  any backward incompatible changes are introduced." For a document schema, this is: a field
  removed, a field's type changed, a previously-optional field made required, or semantics of
  an existing field redefined. An old reader cannot safely interpret the document. (<https://semver.org/>)
- **MINOR** -- "add functionality in a backward compatible manner." For a schema: a new
  *optional* field with a sensible default. An old reader can ignore it and still produce a
  correct (if lossy) interpretation.
- **PATCH** -- "backward compatible bug fixes." For a schema/document: data corrections,
  clarifications, no shape change at all.

Industry framing of the same rule for data products (BigQuery/Snowflake schema-evolution
guidance): PATCH = backfill/correction, no schema change; MINOR = additive backward-compatible
change (add a *nullable* field with a default); MAJOR = breaking (column removed or type
changed). The addition of a new attribute is non-breaking "so long as it's not required."
(<https://medium.com/@sendoamoronta/schema-evolution-in-bigquery-and-snowflake-designing-and-versioning-models-in-modern-data-921df282aaa7>,
<https://www.freecodecamp.org/news/how-to-handle-breaking-changes/>)

**SchemaVer** (Snowplow) is the closest precedent to a *document-schema-specific* semver. It
relabels the three numbers around data compatibility rather than code:
`MODEL-REVISION-ADDITION`.
- ADDITION = compatible with all historical data (new optional field).
- REVISION = may prevent interaction with *some* historical data.
- MODEL = breaking; prevents interaction with any historical data.
This is worth citing because it reframes the version around "can existing documents still be
read," which is exactly Rackula's question. (<https://snowplow.io/blog/introducing-schemaver-for-semantic-versioning-of-schemas>)

**Takeaway for Rackula:** Our `metadata.schema_version` ("1.0") is effectively `MAJOR.MINOR`.
Reserve PATCH if we ever need it, but MAJOR.MINOR is enough: MAJOR gates the reject decision,
MINOR signals "additive, load anyway."

---

## Tolerant reader & must-ignore

The reason additive change can be non-breaking *at all* is the **tolerant reader** pattern
(Martin Fowler), an application of the **robustness principle / Postel's Law** (RFC 1122):
"be conservative in what you do, be liberal in what you accept from others."

- Fowler's core advice: "only take the elements you need, ignore anything you don't." Do not
  bind tightly to the exact document structure; do not fail on unexpected/extra fields. Wrap
  the payload behind one component (a DTO) so the rest of the system is insulated from shape
  drift. (<https://martinfowler.com/bliki/TolerantReader.html>)
- Practical "must-ignore unknown fields" convention: if a document contains fields the reader
  doesn't know about, discard them silently rather than erroring; if an expected field is
  absent, apply an application default. Most JSON libraries do this by default or with one
  annotation (Jackson, System.Text.Json, serde). (<https://java-design-patterns.com/patterns/tolerant-reader/>,
  <https://github.com/zalando/restful-api-guidelines/blob/main/chapters/compatibility.adoc>)
- Binary-format precedent for the same rule:
  - **Protobuf**: old readers *ignore unknown fields* (new field numbers) -> forward
    compatible. Never reuse a field number; mark dead numbers `reserved` so a future field
    can't be misread by old decoders.
  - **Avro**: backward-compatible additions require a *default value* on the new field.
  - Confluent's vocabulary is the clean mental model: **backward** = new code reads old data;
    **forward** = old code reads new data (achieved precisely by ignoring unknown fields);
    **full** = both. (<https://yokota.blog/2021/08/26/understanding-protobuf-compatibility/>,
    <https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html>)

### The silent-drop failure mode (directly relevant to #617)

The tolerant reader's strength is also its trap: "ignore unknown fields" means an unaware
reader **drops** those fields. If the reader then **re-saves**, the dropped data is gone. This
is exactly the Rackula #617 hazard: a reader that doesn't understand the future `images`
section would skip it, and a save would silently destroy embedded images even though the
document's MAJOR never changed.

This is the strongest argument that "tolerant + must-ignore" is necessary but **not
sufficient**. The mitigations seen in practice:
- **Preserve-unknown round-trip.** Keep unrecognized fields verbatim and write them back on
  save (Kubernetes uses `x-kubernetes-preserve-unknown-fields` for exactly this; protobuf
  retains unknown fields in the wire object). Rackula's reader/writer should round-trip
  unknown top-level sections rather than drop them.
- **Bump MAJOR when a section is load-bearing.** If silently dropping a section causes data
  loss, that section's introduction is arguably *not* a pure additive/MINOR change for a
  re-saving editor. Rackula has to decide per-feature: is `images` MINOR (ignorable) or does
  introducing a lossy-on-resave section warrant a MAJOR/warning?

---

## How comparable tools version

| Tool | Where the version lives | What a reader does with unknown/newer |
|------|------------------------|----------------------------------------|
| **Excalidraw** (`.excalidraw` JSON) | Top-level `type: "excalidraw"`, `version` (number, currently `2`), optional `source` (origin URL/system) | `type`+`version` are checked *before any element is processed*. Single integer bumped on breaking format changes; minor/additive changes don't bump it. (<https://docs.excalidraw.com/docs/codebase/json-schema>, <https://github.com/orgs/ocwg/discussions/1>) |
| **draw.io / mxGraph** (`mxfile`) | `<mxfile ... version="13.6.2" ...>` attribute = the *app* version that wrote it, plus `compressed`/`host`/`agent`. No separate *schema* version | Permissive/best-effort. The format is structural (`mxGraphModel`/`mxCell`); the version attr is provenance, not a gate. (<https://deepwiki.com/jgraph/drawio-diagrams/10-file-format-reference>) |
| **Kubernetes** (`apiVersion`) | `apiVersion: group/version` (e.g. `apps/v1`) per object | A server is **not required to serve unrecognized versions** -> request rejected. Unknown *fields* are Warn by default, can be Strict (400). `x-kubernetes-preserve-unknown-fields` opts a subtree into round-tripping unknowns. Strong precedent for **reject-on-unknown-version**. (<https://kubernetes.io/docs/reference/using-api/api-concepts/>, <https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definition-versioning/>) |
| **OpenAPI / Swagger** | Required `openapi: 3.1.0` (`major.minor.patch`) | `major.minor` designates the feature set; **patch is ignored** by tooling (3.1.0 == 3.1.1). MINOR bumps are written to guarantee backward compatibility (a valid 3.0.x doc becomes a valid 3.1.0 doc). Tools key off the major.minor pair. (<https://spec.openapis.org/oas/v3.1.0.html>, <https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.1.0.md>) |
| **JSON Schema** | `$schema` keyword = dialect URI (e.g. `https://json-schema.org/draft/2020-12/schema`) | `$schema` is the *dialect identifier* (a URI, treated as an identity, not a fetched location). A validator that doesn't recognize the dialect cannot safely validate. Custom dialects must use a URI under a domain you own. (<https://json-schema.org/understanding-json-schema/reference/schema>) |
| **Terraform state** | `"version": N` integer in `terraform.tfstate` | **Hard reject newer.** "state snapshot was created by Terraform vX, which is newer than current vY; upgrade to vX or greater to work with this state." Newer Terraform reads older state (migrates up); older Terraform refuses newer state. Canonical reject-newer-major precedent. (<https://www.terraformpilot.com/articles/fix-terraform-error-state-snapshot-was-created-by-newer-version/>) |
| **SQLite** | `PRAGMA user_version` (app-defined integer; SQLite ignores it) | App-managed: the engine itself doesn't gate on it. Note: SQLite's *own* file format is forward/backward stable since 2004 and does **not** record the writing library version, so it can't say "made by newer." Lesson: if you want reject-newer, you must store the version yourself. (<https://sqlite.org/pragma.html>) |
| **NetBox** | REST API version tied to major release (`API-Version: 3.0`); device-type YAML import | REST API historically had **no backward compatibility** across majors. Emerging guidance for portable/exported object types: embed a version and "compare that version to an existing schema... enforce compatibility ranges and dictate up/downgrade behaviors." (<https://github.com/netboxlabs/netbox-custom-objects/issues/392>) |

**Pattern summary:**
- A *single integer that only bumps on breaking change* (Excalidraw, TF state, SQLite
  user_version) is the simplest viable scheme.
- A *major.minor pair where tooling keys off major.minor and ignores patch* (OpenAPI, K8s
  group/version) is the next step up and matches Rackula's existing `1.0`.
- The version belongs **at the top, checked before parsing the body** (Excalidraw, K8s).
- Reject-newer-major is mainstream for *stateful/editable* documents (Terraform, K8s),
  best-effort is for *render-only* consumers (draw.io). Rackula edits and re-saves, so it sits
  firmly in the reject-newer camp.

---

## Reject-newer-major precedent & UX

Precedents for refusing to open a document written by a newer version:

- **Terraform state** -- refuses outright, names the version that wrote it, and tells the user
  the concrete remedy (upgrade to >= that version). This is the gold-standard message shape.
- **Kubernetes** -- servers may decline unrecognized `apiVersion`; clients get a clear
  unrecognized-type error rather than a corrupt apply.
- **Office / database file formats** -- the familiar "this file was created in a newer version
  of the application" dialog. SQLite's `legacy_file_format` note captures the underlying
  reality: "new databases ... might not be readable or writable by older versions."

**Good UX messaging (synthesised):**
- State the cause plainly: "This layout was created with a newer version of Rackula
  (schema 2.x). This version understands up to schema 1.x."
- Give the remedy: "Update Rackula to open it," with a link/where-to-get-it.
- Never partially load then silently corrupt. Reject *before* mutating the working copy.
- Offer a non-destructive out where possible: view raw YAML, download/keep the original file
  untouched, or open read-only. Refusing to open must not mean "and now your file is at risk."

**Pitfalls observed:**
- **Too strict on MINOR.** OpenAPI/K8s deliberately *don't* gate on patch and treat minor as
  compatible. If Rackula rejects on any version mismatch instead of strictly MAJOR, additive
  releases break old readers needlessly -- defeating the whole tolerant-reader benefit.
- **No recovery path.** Terraform's pain point is users with newer state and an older binary
  and no obvious downgrade. Always provide a path (upgrade link, read-only, export-original).
- **Provenance vs schema conflation.** draw.io stores the *app* version, not a *schema*
  version; using app version as the gate over-rejects (every app bump looks "newer"). Rackula
  must gate on the **schema** version, not the app/build version.

---

## Version + JSON Schema conventions

For #571 (publishing a JSON Schema later), the relationship between the in-document version and
the schema URL:

- **`$schema`** declares the *dialect* (which JSON Schema spec the schema file itself is
  written against), e.g. `https://json-schema.org/draft/2020-12/schema`. This is about the
  schema language, not Rackula's data version. (<https://json-schema.org/understanding-json-schema/reference/schema>)
- **`$id`** is the canonical identifier (URI) of *our* schema. Convention: **put the version in
  the `$id`** (and in `title`), e.g.
  `https://rackula.lives/schemas/layout/1.0/schema.json` or
  `https://schemas.racku.la/layout/v1.json`. The `$id` URI must be under a domain we own; it is
  an identity, not necessarily a live URL (though publishing it as a real URL is good practice).
  (<https://blog.liquid-technologies.com/json-schema-tutorial-part-3-design-and-structure>)
- **How they relate to `metadata.schema_version`:** the in-document `schema_version: "1.0"` is
  the source of truth the *reader* gates on. The published schema's `$id` carries the same
  MAJOR (one schema document per MAJOR; MINOR additions are reflected by relaxing/extending the
  same MAJOR schema with new optional fields). A future document can optionally carry a
  `$schema`-style pointer to its schema `$id`, but the gate logic reads the integer/`MAJOR.MINOR`
  string, not the URL.
- **Recommendation:** keep `metadata.schema_version` as the authoritative gate; mint one
  published JSON Schema per MAJOR at a versioned `$id` URL; let MINOR be additive optional
  fields layered into the same MAJOR schema. Don't make the reader fetch a URL to decide
  whether to load -- offline-first, the integer in the file is the contract.

---

## Implications for Rackula's policy

1. **The reject-newer-MAJOR / load-on-MINOR stance is well-supported.** It is exactly what
   Terraform state and Kubernetes do for stateful/editable artifacts, and it matches semver's
   own definitions. Keep it.
2. **Gate strictly on MAJOR.** Match OpenAPI/K8s: ignore patch, treat MINOR as compatible,
   reject only when the file's MAJOR exceeds what the app supports. Be liberal on MINOR.
3. **Make the reader tolerant + non-dropping.** Must-ignore unknown fields to load forward, but
   **round-trip** (preserve and re-write) unknown top-level sections rather than dropping them
   -- this is the #617 fix. Borrow K8s `preserve-unknown-fields` semantics conceptually.
4. **Decide the "lossy-on-resave section" rule.** A purely additive field that an old reader
   ignores is MINOR. A section whose loss on resave destroys user data (images, #617) is a
   policy edge: either bump MAJOR for it, or guarantee round-trip preservation, or warn before
   a lossy save. Don't let it ride as a silent MINOR.
5. **The version must be present and checked first.** Apply this to *every* ingress, not just
   file open: share-link payloads, server store, and the localStorage working copy. Excalidraw
   and K8s both validate version before touching the body.
6. **Publish one JSON Schema per MAJOR at a versioned `$id`;** keep the in-file
   `schema_version` integer/string as the authoritative offline gate.

---

## Pressure tests for our reject-newer-major stance

- **MINOR-vs-MAJOR boundary is a judgement call, not a fact.** Whoever authors a future
  release must classify each change correctly. Misclassifying a breaking change as MINOR means
  old readers load a document they then misinterpret or corrupt. Need a written checklist
  (remove/retype/require-a-field/redefine-semantics = MAJOR) and ideally a schema-diff CI gate.
- **Share-links / payloads with no version field.** If any current share-link or localStorage
  payload predates or omits `schema_version`, the gate has nothing to read. Define the
  default: absent version == assume `1.0`? Or reject as malformed? This is a real hole because
  the localStorage working copy is **unvalidated** today.
- **The unvalidated localStorage path.** If the working copy is read without running the same
  version gate as file-open, a newer-MAJOR document could slip in through a different door
  (e.g. a tab left open across an app downgrade, or a synced/restored localStorage). The gate
  must live in one shared ingress function, not just the file loader.
- **#617 images: MINOR that causes data loss.** Our stance loads MINOR documents, but a
  MINOR-tagged `images` section gets silently dropped by an unaware reader and destroyed on
  resave. Reject-newer-MAJOR does **not** protect against this; only round-trip preservation or
  reclassifying does. This is the case most likely to bite.
- **App version vs schema version confusion.** If anyone ever gates on app/build version
  (draw.io's mistake) instead of `schema_version`, every release will look "newer" and
  over-reject. Keep the two strictly separate.
- **No downgrade/recovery path.** Terraform's lived pain: a user on an older Rackula with a
  newer file and no way forward. We must ship the remedy (update link, read-only view,
  keep-original) or rejection becomes a dead end.
- **Server store written by a newer deploy, read by an older one.** During a rolling or
  rolled-back deploy, the server could hold newer-MAJOR documents an older instance must
  reject cleanly rather than crash or truncate. Same gate, server side.
