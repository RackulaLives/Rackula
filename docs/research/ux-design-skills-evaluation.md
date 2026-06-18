# UX Design Skills Evaluation (for the M14 Canvas UX Overhaul)

Status: Complete Epic: UX Overhaul (#2017) Date: 2026-06-17

## Question

Four community and official "design skills" for Claude Code circulate as the fix for "Claude sucks at design": `ui-ux-pro-max`, `impeccable`, `design-motion-principles`, and `frontend-design`. Do they have legitimate value for Rackula, specifically for brainstorming improvements to the M14 Canvas UX Overhaul?

## Short answer

Not a meaningful unlock for the structural work, which is roughly 90% of M14. The overhaul is an information-architecture and interaction problem, not a visual identity one, and these skills are built for the opposite problem. The one place worth reaching for an external skill is `design-motion-principles` (audit mode) when polishing micro-interactions, with `impeccable`'s critique commands as an optional review pass on the genuinely new visual surfaces.

## Why the category exists

"Claude sucks at design" is overstated but points at a real, documented failure mode: left unguided, an LLM converges on the statistical middle of its training data (the Inter font, purple-gradient-on-white, grid-of-cards look people call "AI slop"). Anthropic acknowledged this by shipping its own `frontend-design` skill. These skills work by injecting design taste and hard constraints as context. They steer the model, they do not upgrade it, so the value is real but bounded and comes with a context-budget cost.

## The four skills

| Skill | Source | What it is | Cost |
| --- | --- | --- | --- |
| frontend-design | Anthropic (official) | ~42 lines of principles: commit to ONE bold aesthetic, plus typography/color/motion/spatial guidance and an anti-pattern list | Low |
| impeccable | pbakaus (jQuery UI creator) | Built on frontend-design; 7 domain reference files, steering commands (`/audit`, `/critique`, `/polish`), brand-vs-product register | Medium |
| design-motion-principles | kylezantos | Motion design with build and audit modes; weights three named designers' philosophies (Kowalski, Krehel, Tompkins) to context | Medium |
| ui-ux-pro-max | nextlevelbuilder | Enumerated catalog: 67 UI styles, 161 palettes, 57 font pairings, 99 UX guidelines, 161 reasoning rules | High |

## Why most of it does not fit M14

M14's governing principle is "place each control where its scope lives": top bar as workspace frame, layouts as tabs, an honest storage chip, a tabbed and collapsible side panel, floating verb bars, a command registry, lazy session restore, per-layout undo. The hard decisions are tab semantics, a browser-safe keyboard map, storage honesty, and accessibility (WCAG 2.2 AA, axe-core CI, visual-regression tripwires, focus management).

The skills' entire pitch is "commit to a distinctive visual identity, avoid the generic middle." Rackula has already solved that:

- A committed visual direction exists: `docs/reference/BRAND.md` plus `src/lib/styles/tokens.css`. The anti-slop framing has nothing left to push on.
- UX standards are already codified as PR gates (#2100): WCAG 2.2 AA, 44px touch targets, reduced motion, visible focus, managed focus.
- The app's hard UI is tokenized SVG rack rendering, where correctness (collision math, alignment, a11y) dominates over aesthetic taste.

The overhaul's actual risks are interaction complexity, accessibility regressions, and scope creep across 30-plus issues. None of these skills address any of that.

## Where there is genuine value

### design-motion-principles (narrow but real)

The spec carries a thin, mostly unresolved or deferred motion layer that this skill's audit mode is built for:

- Dialog and sheet enter/exit animations with reduced-motion (#2092).
- The drag-to-place preview that must show the unhappy path: a red preview and a snap to the nearest legal slot on an invalid drop.
- Floating verb bars appearing and flipping below the object name; the spec flags "verb-bar behaviour at low zoom is unresolved".
- Side panel collapse-to-rail, tab drag-reorder.

Its restraint-first philosophy (Kowalski, tuned for productivity tools) matches Rackula far better than playful experimentation. Reach for it at the interaction-polish pass, not for IA decisions.

### impeccable (per-surface critique lens)

Its `/audit` and `/critique` commands are usable as a second opinion on the genuinely new visual surfaces: the storage chip popover, template chooser cards (#2095), side panel empty and multi-select states, and cached sidebar previews (#2083). A review heuristic applied selectively, not a generator.

### frontend-design and ui-ux-pro-max (little to add)

"Pick a bold aesthetic, avoid Inter and purple gradients" is already answered by the design system. ui-ux-pro-max's enumerated catalog is irrelevant to a tokenized SVG app and would mostly spend context.

## Recommendation

1. Do not install any of these as always-on skills during M14. Their core bias (commit to a distinctive aesthetic, break the grid, asymmetry, texture overlays) actively fights an established design system and the scope discipline the plan depends on.
2. The skills that serve this work are already wired into the repo: `brainstorming` for open spike questions, `writing-plans`, `systematic-debugging`, plus the axe-core and visual-regression guard rails.
3. If and when the micro-interaction polish pass lands, pull in `design-motion-principles` in audit mode for the motion layer, and optionally run `impeccable`'s critique over the new visual surfaces. Treat both as review lenses, not drivers.

## Sources

- Anthropic frontend-design SKILL.md: https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md
- Anthropic, Improving frontend design through skills: https://www.claude.com/blog/improving-frontend-design-through-skills
- impeccable (pbakaus): https://github.com/pbakaus/impeccable
- design-motion-principles (kylezantos): https://github.com/kylezantos/design-motion-principles
- ui-ux-pro-max-skill (nextlevelbuilder): https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Snyk, Top Claude Skills for UI/UX Engineers: https://snyk.io/articles/top-claude-skills-ui-ux-engineers/ </content> </invoke>
