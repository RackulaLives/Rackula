# TypeScript Strict Mode Burndown

> Baseline created: 2026-05-19
> Issue: #1609
> Config: `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `noUncheckedIndexedAccess: true`

## Summary

- Total files with `@ts-nocheck`: **25**
- `.svelte` files: **9**
- `.ts` files: **14**
- `.svelte.ts` files: **2**
- Total type errors suppressed: **84**

## Progress Tracker

- [ ] **Batch 1: Types, constants, schemas** (0 files — already strict)
- [ ] **Batch 2: Utils** (11 files, 49 errors)
- [ ] **Batch 3: Data** (0 files — already strict)
- [ ] **Batch 4: Stores** (3 files, 8 errors)
- [ ] **Batch 5: Icon components** (0 files — already strict)
- [ ] **Batch 6: Top-level components** (9 files, 23 errors)
- [ ] **Batch 7: Test helpers** (2 files, 4 errors)

## File Checklist

### Batch 2: Utils (11 files, 49 errors)

- [ ] `src/lib/utils/export.ts` — strictNullChecks, noUncheckedIndexedAccess (17 errors)
- [ ] `src/lib/utils/persistence-manager.svelte.ts` — string vs literal types, SVGElement cast, noUnusedLocals (12 errors)
- [ ] `src/lib/utils/gestures.ts` — PointerEvent vs EventListener type narrowing (8 errors)
- [ ] `src/lib/utils/generate-bundled-images.ts` — strictNullChecks, noUncheckedIndexedAccess (3 errors)
- [ ] `src/lib/utils/canvas.ts` — strictNullChecks, noUncheckedIndexedAccess (2 errors)
- [ ] `src/lib/utils/deviceFilters.ts` — strictNullChecks, undefined vs null (2 errors)
- [ ] `src/lib/utils/netbox-import.ts` — noUncheckedIndexedAccess (1 error)
- [ ] `src/lib/utils/qrcode.ts` — missing type declaration (1 error)
- [ ] `src/lib/utils/rack-context-actions.ts` — noUnusedLocals (1 error)
- [ ] `src/lib/utils/rack-interaction-handlers.ts` — DeviceFace vs literal type (1 error)
- [ ] `src/lib/utils/yaml.ts` — noUncheckedIndexedAccess, string vs undefined (1 error)

### Batch 4: Stores (3 files, 8 errors)

- [ ] `src/lib/stores/layout/rack-actions.ts` — strictNullChecks, Rack \| undefined (5 errors)
- [ ] `src/lib/stores/cables.svelte.ts` — strictNullChecks, null (2 errors)
- [ ] `src/lib/stores/layout/command-adapters.ts` — strictNullChecks, return type (1 error)

### Batch 6: Top-level components (9 files, 23 errors)

- [ ] `src/lib/components/ExportDialog.svelte` — strictNullChecks, unknown prop (2 errors)
- [ ] `src/lib/components/DialogOrchestrator.svelte` — type mismatch, union type (2 errors)
- [ ] `src/lib/components/DevicePalette.svelte` — strictNullChecks, null vs undefined (4 errors)
- [ ] `src/lib/components/Rack.svelte` — noUnusedLocals, strictNullChecks (4 errors)
- [ ] `src/lib/components/RackList.svelte` — strictNullChecks (4 errors)
- [ ] `src/lib/components/Toolbar.svelte` — string literal type mismatch (3 errors)
- [ ] `src/lib/components/DevicePaletteItem.svelte` — unknown prop (1 error)
- [ ] `src/lib/components/ImportFromNetBoxDialog.svelte` — noUnusedLocals (1 error)
- [ ] `src/App.svelte` — strictNullChecks, null (2 errors)

### Batch 7: Test helpers (2 files, 4 errors)

- [ ] `src/tests/factories.ts` — noUncheckedIndexedAccess (2 errors)
- [ ] `src/tests/setup.ts` — callback type mismatch (2 errors)

## Error Categories Reference

| Category                 | Description                                               | Typical Fix                                             |
| ------------------------ | --------------------------------------------------------- | ------------------------------------------------------- |
| strictNullChecks         | Possibly null/undefined values                            | Add null checks, optional chaining, non-null assertions |
| noUncheckedIndexedAccess | Array/object index access returns T \| undefined          | Add bounds checks or type guards                        |
| noUnusedLocals           | Declared but unread variables                             | Remove or prefix with `_`                               |
| noUnusedParameters       | Unused function parameters                                | Prefix with `_`                                         |
| type mismatch            | Incompatible types (string vs literal, null vs undefined) | Fix type annotations, use type assertions               |
| missing types            | Implicit any, missing declarations                        | Add type annotations or declaration files               |
| unknown prop             | Unknown component property                                | Add prop to interface                                   |

## How to Remove @ts-nocheck

For each file in the burndown:

1. Remove the `// @ts-nocheck` line
2. Run `npx svelte-check --tsconfig ./tsconfig.json` to see remaining errors
3. Fix each error according to its category (see table above)
4. Run `npm run lint && npm run build && npm run test:run` to verify
5. Commit in a separate PR with title: `chore(ts): Remove @ts-nocheck from [module]`
