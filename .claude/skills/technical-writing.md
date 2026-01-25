---
name: technical-writing
description: Use when creating or editing user-facing documentation in docs/guides/
---

# Technical Writing for Rackula

## When to Use

- Creating new guides in `docs/guides/`
- Editing existing user-facing documentation
- Updating docs after a feature change

**Not for:** Research spikes, CLAUDE.md, changelogs, developer-facing docs.

## Audience

Homelabbers with Docker/Linux basics. They can:

- Run docker commands and edit config files
- Understand ports, networking, volumes
- Navigate a terminal

Don't explain Docker concepts. Don't over-explain. Just document.

---

## Verification Workflow (MANDATORY)

Before documenting any Rackula behavior:

1. **Identify claims** — What features, defaults, or behaviors will you describe?
2. **Read source code** — Use Grep/Glob to find implementation, then Read the files
3. **Document what code does** — Not what you think it does

**Must verify:**

- Environment variables and defaults
- API endpoints and parameters
- File formats and structure
- Feature availability (implemented vs planned)

**Skip verification for:**

- General Docker/Linux instructions
- Navigation text and links
- Section intros without feature claims

If behavior is unclear after reading code, ask the user.

---

## Writing Style

### Voice

- Second person: "you can configure..." not "users can configure..."
- Imperative for instructions: "Run this command" not "You should run"
- Direct statements: "This saves layouts" not "This should save layouts"

### Brevity

- Sentences: 20 words preferred, 30 max
- Paragraphs: 2-3 sentences before a break
- No filler: "In order to", "It is important to note that", "As mentioned above"
- One concept per section

### Formatting

| Element          | Use For                                                   |
| ---------------- | --------------------------------------------------------- |
| Tables           | Config options, env vars, comparisons                     |
| ASCII diagrams   | Architecture, request flow, data flow                     |
| Code blocks      | Commands, configs (always include language: `bash, `yaml) |
| Horizontal rules | Major section breaks                                      |

### Headings

- `#` — Document title only (one per file)
- `##` — Major sections
- `###` — Subsections
- `####` — Rarely, only for deep nesting

---

## Document Structure

```markdown
# [Feature] Guide

One-sentence description.

---

## Quick Start

3-5 steps to get working. Code blocks with copy-paste commands.

---

## Architecture (if applicable)

ASCII diagram of components/data flow.
Table of components with purpose.

---

## Configuration

### [Category]

| Name | Default | Description |
| ---- | ------- | ----------- |

Code example.

---

## Troubleshooting

### [Symptom as heading]

**Symptom:** What user sees.
**Check:** Diagnostic command.
**Common causes:** Numbered list.
**Fix:** Solution with code.

---

## Advanced Configuration (optional)

Power-user options, less common scenarios.
```

**Ordering principle:** Most common first, edge cases last.

---

## Anti-Patterns (BLOCKED)

### Verbosity

```
❌ "In order to configure the persistence layer, you will need to..."
✅ "To enable persistence:"

❌ "It is important to note that the API requires authentication."
✅ "The API requires authentication."

❌ "The following section describes how to..."
✅ (just start the section)
```

### Unverified claims

```
❌ "Rackula supports up to 100 racks" (did you verify?)
✅ "Rackula supports multiple racks" (verified in code)

❌ "The default port is 8080" (guessing)
✅ "The default port is 8080" (confirmed in Dockerfile)
```

### Wrong audience

```
❌ "Docker is a containerization platform that..."
✅ (they know Docker, just show the command)

❌ "For advanced users, you can edit the config"
✅ (don't gatekeep, just document the option)
```

### Structure violations

```
❌ Wall of text with multiple concepts
✅ Headed subsections, one concept each

❌ "supports PNG, JPEG, and SVG formats"
✅ Bulleted list or table when 3+ items
```

---

## Self-Review Checklist

Before finishing documentation work:

- [ ] No sentences over 30 words
- [ ] No filler phrases
- [ ] All feature claims verified in source code
- [ ] Tables for configs, ASCII for architecture
- [ ] Heading hierarchy: # title, ## sections, ### subsections
- [ ] Quick Start comes first, troubleshooting near end
