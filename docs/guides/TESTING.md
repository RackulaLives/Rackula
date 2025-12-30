# Testing Guidelines

This document describes the testing patterns, conventions, and best practices for the Rackula project.

## Environments

| Environment | URL                   | Purpose                                  |
| ----------- | --------------------- | ---------------------------------------- |
| **Local**   | `localhost:5173`      | Development with HMR (`npm run dev`)     |
| **Dev**     | https://dev.racku.la  | Preview production builds before release |
| **Prod**    | https://app.racku.la  | Live production environment              |

### Dev Environment

The dev environment auto-deploys on every push to `main`:

```
Push to main → Lint → Test → Build → Deploy to GitHub Pages
```

Use it to:

- Test production builds in a real environment
- Share preview links with stakeholders
- Catch build-time issues before releasing

**Note:** Dev deployment only succeeds if lint and tests pass.

## Philosophy

We follow the **Testing Trophy** approach:

- **E2E tests** (few) - Critical user journeys only
- **Integration tests** (most) - Component behavior with stores
- **Unit tests** (some) - Pure functions and utilities
- **Static analysis** (base) - TypeScript + ESLint

Tests should be **behavior-driven**, focusing on what the user sees and experiences rather than implementation details.

## Running Tests

```bash
# Unit tests (watch mode)
npm run test

# Unit tests (CI mode)
npm run test:run

# Unit tests with coverage
npm run test:coverage

# E2E tests
npm run test:e2e
```

## Project Structure

```
src/tests/                    # Centralized unit/integration tests
├── factories.ts              # Shared test data factories
├── mocks/
│   └── browser.ts            # Browser API mocks (Canvas, FileReader, etc.)
├── helpers/
│   └── TestAccordion.svelte  # Test wrapper components
├── setup.ts                  # Vitest setup (jsdom, matchers)
├── setup.test.ts             # Verify test environment
├── *.test.ts                 # Test files
e2e/                          # Playwright E2E tests
├── *.spec.ts                 # E2E test specs
```

## Test File Naming

- **Unit/Integration tests**: `*.test.ts` in `src/tests/`
- **E2E tests**: `*.spec.ts` in `e2e/`

## Writing Tests

### Test Structure (AAA Pattern)

```typescript
it('adds device to rack when placed', () => {
	// Arrange
	const store = getLayoutStore();
	const deviceType = createTestDeviceType({ u_height: 2 });

	// Act
	store.addDeviceTypeRecorded(deviceType);
	store.placeDeviceRecorded(deviceType.slug, 10);

	// Assert
	expect(store.rack.devices).toHaveLength(1);
	expect(store.rack.devices[0]?.position).toBe(10);
});
```

### Using Test Factories

Always use the centralized factories instead of inline mocks:

```typescript
import { createTestRack, createTestDeviceType, createTestDevice, createMockCommand } from './factories';

// Good - uses factory
const deviceType = createTestDeviceType({ u_height: 2, category: 'server' });

// Avoid - inline mock
const deviceType = { slug: 'test', u_height: 2, ... };
```

Available factories:

- `createTestRack(overrides?)` - Creates a test Rack
- `createTestDeviceType(overrides?)` - Creates a test DeviceType
- `createTestDevice(overrides?)` - Creates a test PlacedDevice
- `createMockCommand(description, type?)` - Creates a mock Command
- `createTestLayout(overrides?)` - Creates a complete Layout
- `createTestDeviceLibrary()` - Creates multiple test DeviceTypes

### Testing Svelte 5 Runes

For components using `$state`, `$derived`, or `$effect`:

```typescript
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import MyComponent from '$lib/components/MyComponent.svelte';

it('updates state when button clicked', async () => {
	const user = userEvent.setup();
	render(MyComponent, { props: { initialCount: 0 } });

	await user.click(screen.getByRole('button', { name: 'Increment' }));

	expect(screen.getByText('Count: 1')).toBeInTheDocument();
});
```

### Testing Command Pattern (Undo/Redo)

Commands should have symmetrical execute/undo:

```typescript
it('can be undone after execution', () => {
	const store = createMockStore();
	const command = createAddDeviceTypeCommand(deviceType, store);

	command.execute();
	expect(store.addDeviceTypeRaw).toHaveBeenCalledWith(deviceType);

	command.undo();
	expect(store.removeDeviceTypeRaw).toHaveBeenCalledWith(deviceType.slug);
});
```

### Using Browser Mocks

For tests requiring browser APIs:

```typescript
import { setupBrowserMocks, createMockFile } from './mocks/browser';

describe('Image Upload', () => {
	beforeEach(() => {
		setupBrowserMocks();
	});

	it('handles file upload', async () => {
		const file = createMockFile('test.png', 'image/png');
		// ... test file handling
	});
});
```

## E2E Testing

### Browser Projects

The Playwright configuration supports multiple browser projects:

| Project | Browser | Use Case |
|---------|---------|----------|
| `chromium` | Chrome | Default desktop testing |
| `webkit` | Safari | Desktop Safari testing |
| `ios-safari` | WebKit (iPhone 14) | iOS Safari viewport tests |
| `ipad` | WebKit (iPad Pro 11) | iPad viewport tests |

Run specific projects:

```bash
npx playwright test --project=chromium        # Desktop Chrome only
npx playwright test --project=ios-safari      # iOS Safari tests
npx playwright test ios-safari.spec.ts        # Run specific test file
```

### iOS Safari Testing

The `e2e/ios-safari.spec.ts` tests mobile Safari functionality:
- FAB button visibility and 48px touch targets
- Bottom sheet open/close behavior
- Device label positioning
- No horizontal scroll on all iOS viewports

**Note:** Playwright WebKit is a desktop build. For real iOS device testing, use BrowserStack or LambdaTest.

### Selector Strategy

Use `data-testid` attributes for reliable element selection:

```typescript
// Good - stable selector
await page.click('[data-testid="btn-new-rack"]');

// Avoid - fragile selectors
await page.click('.toolbar-action-btn[aria-label="New Rack"]');
```

Available data-testid attributes:

- Toolbar: `btn-new-rack`, `btn-save`, `btn-load-layout`, `btn-export`, `btn-undo`, `btn-redo`, `btn-delete`, `btn-reset-view`, `btn-help`, `btn-toggle-theme`, `btn-toggle-display-mode`, `btn-toggle-airflow`, `btn-hamburger-menu`
- DevicePalette: `search-devices`, `btn-import-devices`, `btn-add-device`

### E2E Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		// Common setup
	});

	test('user can complete workflow', async ({ page }) => {
		// Arrange
		await page.click('[data-testid="btn-new-rack"]');

		// Act
		await page.fill('[data-testid="input-rack-name"]', 'Test Rack');
		await page.click('[data-testid="btn-create-rack"]');

		// Assert
		await expect(page.locator('.rack-name')).toHaveText('Test Rack');
	});
});
```

## Coverage

Coverage thresholds are configured in `vitest.config.ts`:

```
Statements: 75%
Branches: 70%
Functions: 75%
Lines: 75%
```

Run coverage report:

```bash
npm run test:coverage
```

## Best Practices

### Do

- Test behavior, not implementation
- Use factories for test data
- Follow AAA pattern (Arrange-Act-Assert)
- Test edge cases and error states
- Keep tests focused and independent
- Use `data-testid` for E2E selectors

### Don't

- Test implementation details
- Couple tests to CSS classes or DOM structure
- Share state between tests
- Skip cleanup in `beforeEach`/`afterEach`
- Over-mock - prefer real implementations when practical

## Adding New Tests

1. Create test file in `src/tests/` with `.test.ts` extension
2. Import factories and mocks as needed
3. Structure tests using `describe` blocks for grouping
4. Follow AAA pattern in each test case
5. Run tests locally before committing
