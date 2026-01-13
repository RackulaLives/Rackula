# Spike #526: vaul-svelte Evaluation for BottomSheet Replacement

## Summary

**Recommendation: Defer adoption.** The current custom BottomSheet implementation is working well and the benefits of vaul-svelte don't justify the migration effort at this time.

## Evaluation Results

### Bundle Size Impact

| Metric           | Before    | After     | Delta    |
| ---------------- | --------- | --------- | -------- |
| vendor-svelte.js | 108.37 kB | 108.61 kB | +0.24 kB |
| gzip             | 34.85 kB  | 34.88 kB  | +0.03 kB |

**Verdict:** Negligible impact. vaul-svelte shares the bits-ui Dialog primitive, so the additional bundle size is minimal.

### Feature Comparison

| Feature              | Custom BottomSheet      | vaul-svelte              |
| -------------------- | ----------------------- | ------------------------ |
| Swipe-to-dismiss     | ✓ Custom pointer events | ✓ Built-in               |
| Close threshold      | 100px fixed             | Configurable (0-1 ratio) |
| Escape to close      | ✓ Manual handler        | ✓ Built-in               |
| Backdrop click close | ✓                       | ✓                        |
| Body scroll lock     | ✓ Manual                | ✓ Built-in               |
| Drag handle visual   | ✓ Custom                | ✓ Built-in               |
| Direction support    | bottom only             | top/bottom/left/right    |
| Snap points          | ✗                       | ✓                        |
| Background scaling   | ✗                       | ✓                        |
| Accessibility (ARIA) | ✓ Manual                | ✓ Built-in               |
| Focus trap           | ✗ Manual needed         | ✓ Built-in               |
| Reduced motion       | ✓ @media query          | ✓ Built-in               |

### Advantages of vaul-svelte

1. **Snap Points**: Could enable partial sheet states (e.g., peek mode, full expansion)
2. **Built-in Accessibility**: Proper ARIA roles, focus trap, keyboard handling
3. **Ecosystem Consistency**: Same author (Huntabyte) as bits-ui
4. **Direction Flexibility**: Supports all four directions for future use cases
5. **Configurable Close Threshold**: Can adjust sensitivity

### Advantages of Current Implementation

1. **Zero Migration Risk**: Already tested and working on iOS Safari and Android Chrome
2. **Custom Control**: Full control over gesture behavior
3. **No New Dependencies**: Fewer packages to update/maintain
4. **Known Behavior**: Team familiar with the implementation

### Testing Limitations

**Cannot test in this spike:**

- iOS Safari swipe-to-dismiss UX comparison (requires device)
- Android Chrome swipe-to-dismiss UX comparison (requires device)
- Real-world gesture comparison with actual touch interactions

**Recommend manual testing before any migration decision.**

## Created Prototype

A vaul-svelte equivalent component was created at:
`src/lib/components/VaulBottomSheet.svelte`

This provides the same API as `BottomSheet.svelte`:

```svelte
<VaulBottomSheet bind:open {title} onclose={handleClose}>
  <Content />
</VaulBottomSheet>
```

## Recommendation

**Defer adoption** for the following reasons:

1. **Current Implementation Works Well**: The custom BottomSheet handles swipe-to-dismiss effectively
2. **No Immediate Need for Snap Points**: The current single-state sheet is sufficient
3. **Migration Effort vs Benefit**: Effort to migrate and test doesn't justify marginal gains
4. **Focus on Higher-Priority Items**: Other migrations (Tooltip) provide more immediate value

## Future Considerations

Consider adopting vaul-svelte if:

1. **Snap Points Needed**: When peek mode or partial sheets become a requirement
2. **Multi-Direction Drawers Needed**: Side drawers, top sheets, etc.
3. **Accessibility Audit Fails**: If current implementation doesn't meet WCAG standards
4. **Mobile UX Issues**: If current swipe behavior has problems on specific devices

## Files Created

- `src/lib/components/VaulBottomSheet.svelte` - Prototype for comparison
- `docs/research/spike-526-vaul-svelte-evaluation.md` - This document

## Related

- Issue #492: Svelte ecosystem adoption spike (parent research)
- Current implementation: `src/lib/components/BottomSheet.svelte`
- vaul-svelte: https://github.com/huntabyte/vaul-svelte
