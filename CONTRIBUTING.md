# Contributing to Rackula

Thanks for contributing to Rackula.

## AI-Assisted Development

Rackula is built largely with [Claude Code](https://claude.com/claude-code), but it is not an AI-exclusive project. Human and AI-assisted contributions are equally welcome.

- Read `CLAUDE.md` for how Claude Code is used with this project.
- Planning and design docs live in `docs/` (start with `docs/ARCHITECTURE.md`).

### When to Include AI Attribution

Add a `Co-authored-by:` trailer (format in `CLAUDE.md`) when AI generates substantial code: complete functions, whole features, or the bulk of a commit's changes.

Skip attribution for trivial assists: autocomplete, formatting, variable names, docstrings, or minor syntax fixes.

## Development Setup

1. **Prerequisites**
   - Node.js 22 or later (CI runs Node 22)
   - npm 10 or later

2. **Clone and Install**

   ```bash
   git clone https://github.com/RackulaLives/Rackula.git
   cd Rackula
   npm install
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

## Development Workflow

### Code Style

This project uses automated code formatting and linting:

- **ESLint**: JavaScript/TypeScript linting
- **Prettier**: Code formatting
- **svelte-check**: Svelte-specific type checking

Pre-commit hooks automatically format staged files with Prettier.

```bash
# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Type checking
npm run check

# Regenerate lockfile (if CI fails with sync errors)
npm run refresh-lockfile
```

**Lockfile sync issues:** If CI fails with "package.json and package-lock.json are out of sync", run `npm run refresh-lockfile` to regenerate the lockfile from a clean state.

### Testing

We follow Test-Driven Development (TDD). Write tests first, then implement.

```bash
# Run unit tests in watch mode
npm run test

# Run unit tests once
npm run test:run

# Run E2E tests
npm run test:e2e

# Run tests with coverage
npm run test:coverage
```

### Documentation

Key documentation for contributors:

- **Architecture overview:** `docs/ARCHITECTURE.md` (start here for orientation)
- **Technical overview:** `docs/reference/SPEC.md` (design principles)
- **Testing guide:** `docs/guides/TESTING.md` (testing patterns)
- **AI instructions:** `CLAUDE.md` (Claude Code workflow)

### Svelte 5 Runes

This project uses Svelte 5 with runes. Use the new reactivity primitives:

```svelte
<script lang="ts">
  // State
  let count = $state(0);

  // Derived values
  let doubled = $derived(count * 2);

  // Side effects
  $effect(() => {
    console.log("Count changed:", count);
  });

  // Props
  interface Props {
    name: string;
  }
  let { name }: Props = $props();
</script>
```

Do NOT use Svelte 4 stores (`writable`, `readable`, `derived` from `svelte/store`).

## Pull Request Process

1. **Create a Branch**

   ```bash
   git checkout -b feat/short-description
   ```

2. **Make Changes**
   - Write tests first (TDD)
   - Implement the feature
   - Ensure all tests pass
   - Run linting and formatting

3. **Commit**
   - Use the `type: description` format (feat, fix, docs, refactor, test, chore)
   - Sign off each commit with `git commit -s` (see Certifying Your Contributions below)
   - If using AI assistance, include co-author attribution (see `CLAUDE.md` for format)

4. **Push and Create PR**
   - Push your branch
   - Create a pull request with a clear description
   - Reference any related issues

## Certifying Your Contributions

Rackula uses the [Developer Certificate of Origin](https://developercertificate.org/) (DCO) rather than a Contributor Licence Agreement (CLA). The DCO is a lightweight, one-line certification that you have the right to submit your contribution under the project's MIT licence. There is no paperwork and no copyright assignment: you keep the copyright to your work.

To certify a contribution, sign off your commits with the `-s` flag:

```bash
git commit -s -m "feat: add rail snapping"
```

This appends a trailer to the commit message:

```
Signed-off-by: Your Name <your.email@example.com>
```

The name and email must be real and match the identity you commit under. By signing off, you certify the statement published at <https://developercertificate.org/>.

If you forget to sign off the most recent commit, amend it:

```bash
git commit --amend -s --no-edit
```

To sign off a range of commits on your branch, rebase against `main`:

```bash
git rebase --signoff main
```

## Project Structure

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the codebase map and entry points. It stays current as the structure evolves, so this guide does not duplicate the directory tree.

## Questions?

Open an issue for questions, bug reports, or feature requests.
