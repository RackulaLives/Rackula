# Upgrade Corpus

Each entry is a pair: a `.rackula.yaml` layout exactly as some past version wrote it, and a `.expected.json` sidecar listing intentional transformations the load may apply.

`src/tests/upgrade-corpus.test.ts` runs every YAML fixture through the real `parseLayoutYaml` and fails if any leaf value disappears that is not declared in the sidecar allow-list. Browser-mode localStorage cases live in `src/tests/browser-upgrade.test.ts`.

The real UI ingress does not stop at `parseLayoutYaml`: it continues into `layoutStore.loadLayout` (`src/lib/stores/layout/layout-lifecycle.ts`), a second pass that re-runs `adaptLegacyLayout` and applies per-rack ID regeneration/dedup plus defensive position defaulting. `src/tests/upgrade-corpus-loadlayout.test.ts` drives a representative fixture one layer deeper, through that store pass, and asserts the same no-silent-loss property so an ID-remap or position-defaulting regression that drops a value is caught (#2450).

## Sidecar format

```json
{
  "reject": false,
  "hasImages": false,
  "allowList": [
    { "pathPattern": "slot_position$", "reason": "consumed by carrier adapter" }
  ]
}
```

`reject: true` asserts the version gate rejects the fixture. `hasImages: true` routes loading through `parseLayoutYamlWithImages`. `allowList` patterns are JS regexes matched against the raw leaf path; a value that vanishes is a failure unless every path it appeared at matches an entry.

## Adding a fixture each release (required when the schema changes)

1. Export a representative layout from the version about to ship.
2. Run `scripts/add-corpus-fixture.sh <file> v<version>-<desc>`.
3. Run `npm run test:run -- src/tests/upgrade-corpus.test.ts` and confirm it passes.
4. Commit both files.

The release pipeline blocks (see `scripts/check-corpus-freshness.sh`) if a schema-touching release adds no new fixture.
