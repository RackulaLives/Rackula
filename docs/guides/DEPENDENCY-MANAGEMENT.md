# Dependency Management

## Overview

Rackula uses Dependabot for automated dependency updates with a tiered auto-merge strategy based on risk level.

## Configuration

- **Location**: `.github/dependabot.yml`
- **Auto-merge workflow**: `.github/workflows/dependabot-auto-merge.yml`

## Update Strategy

### Tier 1: Auto-Merge (No Human Review)

These updates merge automatically after CI passes:

| Update Type            | Examples                     |
| ---------------------- | ---------------------------- |
| Patch versions (any)   | `1.2.3` → `1.2.4`            |
| Minor dev dependencies | `vitest 4.0.0` → `4.1.0`     |
| GitHub Actions (any)   | `actions/checkout@v4` → `v5` |

### Tier 2: Manual Review Required

These require human approval:

| Update Type           | Reason                        |
| --------------------- | ----------------------------- |
| Major versions        | Breaking changes possible     |
| Minor production deps | Could affect runtime behavior |

## Package Grouping

Related packages are grouped to prevent version mismatches:

| Group        | Packages                                     |
| ------------ | -------------------------------------------- |
| `vitest`     | `vitest`, `@vitest/*`                        |
| `eslint`     | `eslint`, `@eslint/*`, `eslint-*`, `globals` |
| `svelte`     | `svelte`, `@sveltejs/*`, `svelte-*`          |
| `typescript` | `typescript`, `@types/*`                     |

## Schedule

- **npm packages**: Daily (prevents batch accumulation)
- **GitHub Actions**: Weekly on Mondays

## Handling Major Updates

When major version PRs arrive:

1. Read the changelog/release notes
2. Check for breaking changes that affect our usage
3. Test locally: `npm install <package>@latest && npm test`
4. Merge if tests pass

## Troubleshooting

### "claude-review" check failing on Dependabot PRs

This is expected. The Claude Code Review workflow skips Dependabot PRs because GitHub doesn't expose secrets to them (security feature). CodeRabbit still reviews these PRs.

### Multiple related PRs not grouped

Dependabot opened PRs before the grouping config was in place. Options:

1. Close the individual PRs and let Dependabot recreate grouped ones
2. Merge them manually in the correct order

### Version mismatch after partial merge

If you merged `vitest` but not `@vitest/coverage-v8`:

```bash
npm install @vitest/coverage-v8@latest
```
