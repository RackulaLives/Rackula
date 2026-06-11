# Save Indicator Design: Replace SaveStatus with Toast Notifications

**Issue:** #1901
**Date:** 2026-06-04
**Status:** Approved, amended 2026-06-10 (see Amendment below)

## Problem

The "Saved" indicator in the toolbar displaces surrounding icons. `SaveStatus.svelte` uses `{#if shouldShow}` with `transition:fade`, which inserts/removes the element from the DOM entirely. This causes flex reflow in `.toolbar-right`, making icons shift then snap back.

## Solution

Remove the `SaveStatus` component and move all save feedback to the existing toast system. The toast system already supports persistent toasts (`duration: 0`), action buttons, and auto-dismiss.

## Toast Flow

| Event                     | Toast                                                                                                                                                        | Duration       | ARIA role | Action |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | --------- | ------ |
| Manual save succeeds      | Success: "Layout saved"                                                                                                                                      | 3000ms         | status    | None   |
| Auto-save succeeds        | None (silent)                                                                                                                                                | -              | -         | -      |
| Save fails (server error) | Error: "Save failed: {message}"                                                                                                                              | 0 (persistent) | alert     | Retry  |
| Save fails (offline)      | Warning: "Server save unavailable, working offline. Use Ctrl+S to retry." (persistence-manager); App init uses shorter "Server unavailable, working offline" | 0 (persistent) | alert     | Retry  |
| Save in progress          | None                                                                                                                                                         | -              | -         | -      |
| API disabled (local-auth) | None                                                                                                                                                         | -              | -         | -      |

## Key Design Decisions

1. **Auto-save is silent.** Only manual save (Ctrl+S) gets a success toast. Auto-save fires every 2 seconds; a toast every 2 seconds would be spam.
2. **Error toasts are persistent with Retry.** Duration 0, dismiss button, and a Retry action that calls the same save path.
3. **Error toast dedup.** Dismiss old error toast before showing new one. Track the error toast ID in the persistence manager.
4. **Internal `_saveStatus` preserved.** The health check effect reads `_saveStatus === "disabled"` to gate API polling. Keep the internal state, only remove the exported API.
5. **`setSaveStatus("disabled")` dropped.** Local-auth mode has no server; no save feedback needed.
6. **`setSaveStatus("offline")` replaced.** App.svelte calls that set offline status become persistent offline toasts.
7. **ARIA role split.** Success/info toasts use `role="status"` (non-urgent). Error/warning toasts use `role="alert"` (urgent). Prevents screen reader spam on every save.

## Files Changed

### Delete

- `src/lib/components/SaveStatus.svelte`
- Any SaveStatus test file

### Modify

- `src/lib/components/Toast.svelte` - conditional ARIA role
- `src/lib/utils/persistence-manager.svelte.ts` - toast calls, remove exports, keep internal state
- `src/App.svelte` - remove saveStatus prop chain, replace setSaveStatus calls
- `src/lib/components/Toolbar.svelte` - remove SaveStatus import/prop/render
- `src/lib/utils/persistence-api.ts` - remove SaveStatus type export
- `src/tests/persistence-manager-quota.test.ts` - update assertions

## Amendment (2026-06-10, spike #2019)

The storage chip from spike #2019 (epic #2017) reintroduces a persistent save-state surface in the toolbar, superseding the visual half of this record: the "toasts only, no persistent indicator" decision no longer holds. The chip also reverses decision 4: the persistence manager's save state is exported again as the chip's data source.

Standing unchanged:

- Auto-save stays silent (decision 1). The chip changes state; it does not toast.
- Manual save (Ctrl+S) success toast.
- Persistent error toasts with Retry and dedup (decisions 2 and 3).
- ARIA role split (decision 7).
- The reflow lesson from the Problem section: the chip occupies reserved fixed toolbar space rather than inserting and removing itself from the DOM.

The two persistent "working offline" toasts (decision 6) are deleted; the chip's state covers that case.
