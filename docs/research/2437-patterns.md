# Spike #2437 Pattern Analysis

Synthesis of the codebase findings (2437-codebase.md) and external research (2437-external.md) into a recommendation.

## Key Insights

- The reopen path is already solved. Collapsed, each panel is a 44px strip that is one big labelled button. The spike is only about the COLLAPSE (close) path, which today is a 44px chevron in the tab row.
- A border-only collapse is an affordance with no at-rest signifier. Norman's signifiers argument and NN/g's "minesweeping" warning both say a control the user cannot see is, in practice, a control most users will not find.
- The mature editors do not ship a bare clickable border as the only collapse control. VS Code uses an Activity Bar, menu items, a layout control, and Ctrl+B; its draggable border is a resize sash, not the collapse control. Figma keeps a visible toggle plus Shift+\. The border is at most an extra entry point.
- A hover-revealed grip helps mouse users who explore the edge, but it does nothing for touch (no hover events) and nothing for users who never hover the exact 1px edge. It reinforces; it does not announce.
- Hit-target rules bite a thin border. WCAG 2.2 SC 2.5.8 (AA) wants 24x24px; the enhanced SC 2.5.5 (AAA) and the existing project 44px touch standard want 44x44px. A 1-2px line must pad its hit area to clear this.
- The existing chevron already satisfies all of the above: it is visible at rest, 44px, labelled, keyboard reachable, and identical in shape on both panels.

## Implementation Approaches

### Option A: REPLACE the chevron with a clickable border plus hover grip

Remove `.sidebar-collapse-btn` and `.side-panel-collapse-btn`, add a `PanelEdgeGrip` on each panel's canvas-facing edge (prototype in docs/research/prototype-border-collapse-grip.svelte). Cleaner tab row, more canvas-like edge.

Cost: loses the only at-rest signifier. Fails the Norman/NN/g discoverability test. The grip is invisible on touch. Diverges from VS Code and Figma. A thin border needs hit-area padding to meet WCAG 2.2 target size. Net: cleaner but measurably less discoverable, which is exactly the risk the spike names.

### Option B: KEEP the chevron, change nothing

Zero work, zero risk, fully discoverable, already shipped and tested. The only downside is the stated aesthetic one: the chevron is a small piece of chrome in the tab row.

### Option C: HYBRID, border grip plus retained chevron

Keep both existing chevrons exactly as they are (the at-rest signifier, the keyboard path, the touch path) and ADD a hover-revealed `PanelEdgeGrip` on each panel's canvas-facing edge as a power-user shortcut for mouse users who already expect a VS Code-style edge. This is how VS Code itself layers controls: a visible primary plus an edge affordance.

Cost: a small, additive component on each panel (about 30 to 60 lines including shared styling), gated to non-mobile via the existing `viewportStore.isMobile`, wired to the existing `set*Collapsed(true)` handlers. No store change, no change to the reopen strip, no change to the chevron. Low risk because it is purely additive: if the grip is never discovered, nothing is lost.

## Trade-offs

| Concern                   | A: Replace | B: Keep | C: Hybrid |
| ------------------------- | ---------- | ------- | --------- |
| At-rest discoverability   | Poor       | Good    | Good      |
| Touch support             | Poor       | Good    | Good      |
| Matches VS Code / Figma   | No         | Partial | Yes       |
| Aesthetic (clean tab row) | Best       | Plain   | Plain     |
| Build cost                | Medium     | None    | Low       |
| Regression risk           | Medium     | None    | Low       |
| WCAG 2.2 target size      | Needs care | Met     | Met       |

## Recommendation

HYBRID (Option C), with a strong fallback to KEEP (Option B).

The research answers the spike's literal question, "can the chevron be replaced without losing discoverability", with no: a clickable border alone is a hidden affordance and both the UX literature and the reference editors reject it as a sole control. So REPLACE is off the table.

That leaves whether the border grip is worth adding at all. It is a genuine, additive nicety for mouse users that mirrors VS Code, costs little, and carries low risk because the chevron stays as the guaranteed-discoverable path. Ship it as HYBRID if the edge interaction is wanted. If the appetite is "don't add chrome for a marginal gain", KEEP is the honest default and the spike still closes with a clear no to the original replace question. Either way, the chevron stays.
