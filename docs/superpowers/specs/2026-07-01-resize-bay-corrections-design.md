# Resize and Bay Corrections Design

Date: 2026-07-01 Status: Approved (design-grilling session with Gareth) Follows: drag-to-resize (#2737, #2765), bay creation and extension (#2740, #2766, #2767), member removal (#2741), shipped in v26.6.6

## Context

Living with the 26.6.6 resize and bay features surfaced five problems: the drag feels twitchy near U boundaries, the view does not adjust after a resize, a floating "+ Bay" button collides with the verb bar (and was not the expected affordance), the resize handles straddle the selection outline with heavy chrome, and the handles do not read as resize affordances.

Root causes found in code: snapResizeHeight rounds to nearest whole U with no hysteresis, so pixel jitter at the half-U line flips the height back and forth. The right-edge bay grip the design originally targeted does exist but is gated to empty racks, so on any populated rack only the fallback button shows, in the same lane the verb bar occupies.

## Locked decisions

### Bay affordances

- The right-edge drag grip is the primary bay gesture: drag right past the snap threshold, ghost preview, release to create.
- A bay action joins the verb bar as the click, keyboard, and touch path.
- The floating "+ Bay" button and the whole slot-controls lane are removed.
- Baying is a creation-time decision. Bay affordances (grip and verb action) appear only on empty standalone racks and on bay groups. Populated standalone racks never show bay affordances. This intentionally drops the 26.6.6 ability to bay a populated rack; the retrofit case is served by creating the bay before populating.
- Bay groups always extend, regardless of member contents. The new member is created empty at group height, so the creation-time rule applies to the rack being created, not the group. Symmetric with member removal (#2741). The grip sits on the group's right edge.

### Verb bar

- Move-left and move-right chevrons fold into the verb bar behind a divider, position verbs before object verbs. Shown when the row has 2 or more items, as today.
- The verb bar becomes the only floating control surface for a selection. The overlap class of bugs is removed by construction.
- Rack reorder by dragging the rack itself is deferred (stage 2); if it lands, the chevrons can be revisited.

### Resize handles

- Edge-midpoint squares centred on the selection outline, the vector-tool convention for axis-only resize. Visible square roughly 11px, screen-space.
- Invisible hit areas of 44px that shrink to max(11px, min(44px, half the rack's screen height minus a gap)), floored at the visible square so the hit area never collapses to zero, so the two zones do not overlap on short racks at low zoom. Resize stays available at any zoom.
- ns-resize cursor, focus-visible ring on the square, ArrowUp and ArrowDown keyboard resize unchanged (one undoable step per press).
- Bay groups keep the single top-edge handle (#2767), restyled to match.
- Replaces the 56px straddling pill and its shadow ring.

### Drag feel

- Whole-U stepping stays (rail invariant). Directional hysteresis is added in snapResizeHeight: a step commits only after roughly 0.6U of travel past the current height in the direction of movement, so the half-U flicker zone disappears.
- Continuous preview with snap-on-release was considered and decided against. Not staged.

### Camera

- On resize commit (drag release or keyboard step): ensure-visible. Animated, minimal zoom or pan, and only when the new extent breaks the viewport. Shrinking never moves the camera.
- Nothing extra happens mid-drag when the pointer reaches the viewport edge. The Height field and its presets cover large jumps; edge auto-pan is deferred.

### Assumed rules, veto if wrong

- Undo and redo never move the camera. Only direct-manipulation commits trigger ensure-visible.
- Bay creation commit also gets ensure-visible so the new member ends on screen.

## Build list

Stage 1:

- [ ] Remove the floating "+ Bay" button and the slot-controls lane
- [ ] Add move chevrons and a divider to the verb bar for rack and bay selections
- [ ] Add the bay action to the verb bar for empty standalone racks and bay groups
- [ ] Re-gate the right-edge bay grip: empty standalone racks and bay groups
- [ ] Restyle resize grips to edge-midpoint squares with adaptive hit areas
- [ ] Add directional hysteresis to snapResizeHeight, with boundary unit tests
- [ ] Ensure-visible camera on resize and bay commits, animated

Stage 2 (deferred):

- [ ] Drag rack horizontally to reorder
- [ ] Edge auto-pan during resize drag

## Edge-case rules

- Populated standalone rack: no bay grip, no bay verb. The capability is intentionally absent.
- Bay group with populated members: extension allowed; the new member arrives empty at group height.
- Short racks at low zoom: hit areas shrink, the visible handle stays 11px.
- Keyboard resize: ensure-visible applies per commit; a 1U step normally moves the camera little or not at all.

## Links

- Session artifact: "resize-bay-session-design" in Cowork
- Invariant: rail positions are whole-U integers (CLAUDE.md, SPEC.md Mounting Model)
