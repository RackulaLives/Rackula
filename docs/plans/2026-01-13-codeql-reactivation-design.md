# CodeQL Reactivation Design

**Issue:** #585
**Related:** #556 (original CI optimization that disabled CodeQL)
**Date:** 2026-01-13

## Context

Public repos get unlimited free GitHub Actions minutes. CodeQL was disabled in #556 to save minutes, but can now be reactivated.

## Design

### Workflow: `.github/workflows/codeql.yml`

```yaml
name: "CodeQL"

on:
  pull_request:
    branches: [main]
  schedule:
    - cron: "35 11 * * 0" # Weekly on Sunday

jobs:
  analyze:
    name: Analyze (${{ matrix.language }})
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      packages: read
      contents: read

    strategy:
      fail-fast: false
      matrix:
        include:
          - language: javascript-typescript
            build-mode: none
          - language: actions
            build-mode: none

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v4
        with:
          languages: ${{ matrix.language }}
          build-mode: ${{ matrix.build-mode }}
          queries: security-extended

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v4
        with:
          category: "/language:${{ matrix.language }}"
```

### Key Decisions

| Decision    | Choice                             | Rationale                                               |
| ----------- | ---------------------------------- | ------------------------------------------------------- |
| Query suite | `security-extended`                | More thorough than default; ESLint handles code quality |
| Triggers    | PR + weekly                        | Skip push-to-main since PRs catch issues before merge   |
| Languages   | `javascript-typescript`, `actions` | Cover app code and workflow security                    |

### Limitations

- CodeQL doesn't parse `.svelte` files natively
- Will analyze all `.ts` files (stores, utilities, types)
- Vue/React/Angular supported, Svelte is not

## Implementation

1. Create `.github/workflows/codeql.yml` with the above content
2. Delete `docs/plans/2026-01-13-ci-optimization-design.md` (superseded)
