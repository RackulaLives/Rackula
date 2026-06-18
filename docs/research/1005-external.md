# Issue #1005 — External UX Research: Layout Naming Patterns

## Summary

Surveyed naming UX patterns across creative/design tools. The dominant pattern is **auto-name with easy rename** — tools prioritise getting users into their work immediately, not forcing naming decisions upfront.

---

## 1. Tool Survey: How Comparable Tools Handle Naming

### Figma

- **Pattern:** Auto-name ("Untitled")
- **Flow:** New file opens immediately as "Untitled" — no prompt
- **Rename:** Click the title in the toolbar to rename inline
- **Multi-file:** Sequential defaults not used; all new files are "Untitled"
- **Key insight:** Figma treats naming as a secondary action. The primary action is designing.

### Excalidraw

- **Pattern:** Auto-name (timestamp-based for downloads)
- **Flow:** Opens a blank canvas immediately — no naming step
- **Rename:** File name only matters on export/download; defaults to `excalidraw-{timestamp}`
- **Discussion:** [Issue #1271](https://github.com/excalidraw/excalidraw/issues/1271) requested pre-download naming; [Issue #9078](https://github.com/excalidraw/excalidraw/issues/9078) requested custom embedded names
- **Key insight:** Excalidraw prioritises zero-friction start over naming discipline

### draw.io / diagrams.net

- **Pattern:** Name-on-save (not on create)
- **Flow:** Opens blank canvas, prompts for name only when saving/exporting
- **Storage:** When connected to Google Drive/OneDrive, uses "Untitled Diagram" as default
- **Key insight:** Defers naming to the point where it actually matters (persistence)

### Miro

- **Pattern:** Auto-name ("Untitled board") with inline rename
- **Flow:** New board opens immediately as "Untitled board"
- **Rename:** Click board title in header to edit inline
- **Key insight:** Similar to Figma — naming is available but never required

### Lucidchart

- **Pattern:** Auto-name ("Untitled Document") with inline rename
- **Flow:** Template picker or blank document, named "Untitled Document"
- **Rename:** Click title to rename
- **Key insight:** Same pattern as Figma/Miro

### Google Docs/Sheets/Slides

- **Pattern:** Auto-name ("Untitled document") with inline rename
- **Flow:** Opens immediately, title is editable in the toolbar
- **Auto-save:** Name persists automatically once set
- **Key insight:** The "Untitled document" pattern is the industry standard

---

## 2. Pattern Analysis: Name-on-Create vs Name-Later vs Auto-Name

| Pattern | Tools Using It | Pros | Cons |
| --- | --- | --- | --- |
| **Name on Create** (prompt before canvas) | None of the surveyed tools | Forces intentional naming | Blocks flow, adds friction |
| **Name on Save** (prompt at save/export time) | draw.io | Name only matters when it matters | Confusing if auto-save exists |
| **Auto-Name + Rename** (default name, edit anytime) | Figma, Miro, Lucidchart, Google Docs | Zero friction start, naming optional | Users may never rename |

**Industry consensus:** Auto-name with easy rename is the dominant pattern. No major creative tool prompts for a name before showing the canvas.

---

## 3. Default Naming Strategies

| Strategy | Examples | Pros | Cons |
| --- | --- | --- | --- |
| **"Untitled"** | Figma, Google Docs, Miro | Simple, universal, signals "needs naming" | Unhelpful if user has many "Untitled" items |
| **Sequential** ("Untitled 1", "Untitled 2") | Some IDEs | Distinguishes multiple unnamed items | Requires tracking a counter |
| **Timestamp-based** | Excalidraw downloads | Unique by default | Not human-friendly |
| **Contextual** ("New Rack Layout") | None surveyed | Domain-specific, helpful | May feel presumptuous |
| **Empty/placeholder** | Some note apps | Clean appearance | User may not realise naming is needed |

**Recommendation for Rackula:** Use a domain-contextual default like **"My Layout"** — it signals "this is a layout name" without being the rack name, and is obviously a placeholder that invites renaming.

---

## 4. Mobile UX for Naming Flows

- **Bottom sheets:** Common for settings/options on mobile, but naming is typically done inline in the header
- **Dialogs:** Used for confirmatory actions (delete, share), but NOT for naming in any surveyed tool
- **Inline editing:** The universal pattern — tap the title to rename
- **Key insight:** Mobile tools avoid modals/dialogs for naming because they interrupt the flow

---

## 5. Suggestion Chips / Contextual Defaults

No surveyed tool uses suggestion chips for naming. The pattern is:

1. Provide a sensible default
2. Make it trivially easy to change
3. Don't force a decision

**However**, some tools offer contextual naming in specific flows:

- Google Docs names files from the first heading if the user types one
- Notion auto-names pages from the first line of content
- Apple Notes auto-names from the first line of text

**Potential for Rackula:** Could offer contextual suggestions ("Home Lab", "Datacenter") as clickable chips in a rename popover, but this is enhancement territory — not required for the core fix.

---

## 6. ADHD-Friendly UX Principles for Naming

### Relevant Research Findings

From UX research on ADHD and cognitive load:

- **Hick's Law amplified:** ADHD users struggle more with indecisiveness relative to the number of options. Fewer choices = better ([UX Design for ADHD](https://medium.com/design-bootcamp/ux-design-for-adhd-when-focus-becomes-a-challenge-afe160804d94))
- **Decision paralysis:** Forcing a naming decision before the user has context about what they're building creates anxiety ([UXPA](https://uxpa.org/designing-for-adhd-in-ux/))
- **Cognitive load:** Cluttered layouts with too many decisions at once increase cognitive load and fatigue ([Startup House](https://startup-house.com/blog/cognitive-overload-ux))
- **Flexibility & predictability:** Neurodivergent-friendly UIs are designed with flexibility, clarity, and predictability ([AufaitUX](https://www.aufaitux.com/blog/neuro-inclusive-ux-design/))

### Application to Rackula

| Principle | Implication |
| --- | --- |
| **Don't add decision points** | Don't prompt for layout name before creating — auto-name instead |
| **Make rename discoverable but optional** | Inline editing in the header, visible but not forced |
| **Sensible defaults** | "My Layout" is better than "Untitled" (domain-specific) |
| **No modals for optional actions** | Avoid a naming dialog; prefer inline editing |
| **Predictable behaviour** | Renaming a rack should NOT rename the layout |

---

## 7. Key Takeaway

**The fix for Issue #1005 should NOT add a naming dialog or prompt.** Instead:

1. **Stop conflating** rack names with layout names (remove the name-sync)
2. **Auto-name** layouts with a sensible default ("My Layout")
3. **Make rename easy** via inline editing in the layout header
4. **Never force** a naming decision as a prerequisite to creating content
