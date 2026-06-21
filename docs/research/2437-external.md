# Spike #2437 External Research

Research question: can the collapse chevron on a side panel be replaced by a clickable panel border/edge without losing discoverability? This compares that against keeping a visible chevron or handle. Findings are drawn from VS Code and Figma behaviour, plus established UX guidance on signifiers and hit targets.

## Industry Practices

The pattern across mature editors is layered controls, not a single hidden one. None of the editors surveyed rely on a bare clickable border as the only way to collapse a panel. Each pairs an always-visible control with a keyboard shortcut, and treats the draggable border as a resize affordance rather than the primary collapse control.

- VS Code, Primary Side Bar: collapses with Ctrl+B (Cmd+B on Mac), the most documented method. It also keeps a persistent Activity Bar on the edge whose icons re-open a view, and a "Customize Layout" control plus View menu entries that toggle visibility. The border between the side bar and editor is a draggable sash for resizing, separate from collapsing. So VS Code keeps multiple visible affordances (Activity Bar icons, menu items, layout control) in addition to the keyboard shortcut. The draggable border is never the only way in.
- VS Code, Secondary Side Bar and Panel: same model. They are repositionable and toggleable via menu commands and shortcuts, not via a hidden edge. The Panel has a visible close affordance and shortcut (Ctrl+J).
- Figma, left and right panels: in the current UI (UI3) the panels minimise and expand with Shift+\ (both panels together). There is also a visible control in the interface: a minimise-UI button and collapse arrows you can click, rather than relying on the keyboard alone. Earlier UI (UI2) allowed independent left/right collapse, and users have actively requested that independence back, which shows the collapse control is something users look for and expect to be reachable, not hidden.

Takeaway for #2437: a clickable border can be one entry point, but the prevailing practice is to also keep at least one persistently visible affordance (an icon, an arrow, or a labelled control) and a keyboard shortcut. Replacing the chevron with a border alone would diverge from how VS Code and Figma ship.

## Hidden vs Visible Affordances

The governing principle is Don Norman's distinction between affordances and signifiers. An affordance is a possible action an object permits. A signifier is the perceivable signal that tells a person the action exists and how to do it.

Norman's core argument, from his essay "Signifiers, not affordances": affordances "did not have to be perceivable or even knowable, they simply existed," and because of that, "what people need, and what design must provide, are signifiers." His point is that an action that is genuinely possible is still useless if the user cannot detect that it is possible. A clickable panel border is an affordance with a missing or weak signifier: the click works, but nothing on screen tells a first-time user it is there.

Nielsen Norman Group reinforces this for screen interfaces. In "Beyond Blue Links: Making Clickable Elements Recognizable," NN/g notes that on a screen every pixel can be clicked even though most clicks do nothing, so users will not play a "minesweeping game" hunting for what is actionable. The article's blunt summary, "life is too short to click on things you don't understand," captures the cost of hidden controls. It explicitly warns that over-minimal flat design strips away the signals (borders, shape, contrast, depth) that tell users something is interactive, and that removing them "without substituting clear alternatives creates ambiguity about what's clickable." A border with no visible mark is exactly that ambiguity.

Conclusion: a border-only collapse fails the signifier test. To keep it without losing discoverability you must add a perceptible signifier (a persistent grip mark, an arrow, contrast, or shape) so the affordance is announced, not just present.

## The Hover-Revealed Grip Pattern

The hover-revealed grip is a recognised pattern: on hover over a panel edge or splitter, the cursor changes (commonly to col-resize or row-resize for splitters, or pointer for a clickable region) and a grip mark such as a row of dots or a thin handle appears. It is widely used for resizable split views and panes, and the CSS cursor property includes col-resize and row-resize precisely to signal horizontal and vertical resizing on these handles.

Its discoverability limits are real and well documented:

- Touch devices have no hover. NN/g and others note that touch interfaces generally do not generate hover events, so any signifier that only appears on hover is invisible to mobile and tablet users. On touch, "the first click shows the hidden content and the second click leads you to it," meaning hover-gated controls become a two-tap guessing exercise or are missed entirely. A grip that only appears on hover does not exist for touch users.
- First-time users may never trigger the hover. The reveal only fires if the pointer lands on the exact edge. A user who never happens to move the cursor over the thin border never sees the cursor change or the grip, so the control stays undiscovered. The signifier is conditional on already suspecting the control is there.
- Cursor change is not a signifier at rest. cursor: pointer and col-resize only communicate after the pointer is over the target, so they cannot do the job of announcing the control before interaction.

So the hover-revealed grip improves a border control for mouse users who explore the edge, but it does not solve discoverability for touch users or for users who never hover the precise spot. It is a reinforcement, not a substitute for an at-rest visible signifier.

## Resize Handle / Hit-Target Guidance

Even a discoverable handle fails if it is too small to hit reliably.

- WCAG 2.2 Success Criterion 2.5.8, Target Size (Minimum), Level AA: pointer targets must be at least 24 by 24 CSS pixels, or, if smaller, have enough spacing that a 24px-diameter circle centred on each target does not intersect another target. A 1px or 2px border is well under this and would fail unless the hit area is padded out to 24px even when the visible line stays thin.
- WCAG 2.2 Success Criterion 2.5.5, Target Size (Enhanced), Level AAA: 44 by 44 CSS pixels for important controls. Apple's Human Interface Guidelines also recommend 44 by 44 points, and Google Material recommends 48 by 48 dp for touch targets. For a primary collapse control these stricter sizes are the better target, especially on touch.
- Sash and splitter practice: editors render a thin visible divider but give it a wider invisible hit zone, and combine it with a cursor change on hover. The visible line can stay slim for aesthetics as long as the actual interactive region meets the minimum hit size.

Implication for #2437: if the panel border is to be clickable, pad its hit area to at least 24px (ideally 44px for the collapse action and for touch), keep the collapse affordance distinct from the resize sash so the two actions do not conflict on the same pixels, and ensure the visible signifier (grip or arrow) is large enough to both see and tap.

## Sources

- https://code.visualstudio.com/docs/getstarted/userinterface - VS Code UI: Activity Bar, Primary and Secondary Side Bars, Panel, layout customization, toggling and repositioning views.
- https://code.visualstudio.com/docs/getstarted/tips-and-tricks - VS Code tips, including Ctrl+B / Cmd+B toggle sidebar and related layout shortcuts.
- https://bobbyhadz.com/blog/vscode-show-hide-sidebar - confirms Ctrl/Cmd+B and the Activity Bar show/hide behaviour in VS Code.
- https://forum.figma.com/suggest-a-feature-11/bring-back-independent-left-right-panel-collapsing-as-in-ui2-42703
  - Figma users requesting independent left/right panel collapse; documents that UI3 collapses both panels together and UI2 collapsed them independently.
- https://forum.figma.com/suggest-a-feature-11/option-to-hide-the-right-panel-20448
  - Figma forum thread on hiding the right panel and panel-toggle behaviour.
- https://jnd.org/signifiers-not-affordances/ - Don Norman's primary essay distinguishing affordances from signifiers; "what design must provide, are signifiers"; affordances need not be perceivable to exist.
- https://www.nngroup.com/articles/clickable-elements/ - NN/g "Beyond Blue Links"; the minesweeping problem, "life is too short to click on things you don't understand," and the flat-design loss of clickability signifiers.
- https://www.nngroup.com/articles/timing-exposing-content/ - NN/g on exposing hidden content and the hover problem on touch devices.
- https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html - WCAG 2.2 SC 2.5.8 Target Size (Minimum), 24x24 CSS px, Level AA, with the spacing exception.
- https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html - WCAG 2.2 SC 2.5.5 Target Size (Enhanced), 44x44 CSS px, Level AAA.
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/cursor - MDN cursor property; col-resize and row-resize values for splitter handles and the limits of cursor as a signifier on touch.
