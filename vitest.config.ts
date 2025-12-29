import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import { readFileSync } from 'fs';

// Read version from package.json
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
	plugins: [svelte({ hot: !process.env.VITEST })],
	define: {
		// Inject version at build time (same as vite.config.ts)
		__APP_VERSION__: JSON.stringify(pkg.version)
	},
	test: {
		environment: 'happy-dom',
		include: ['src/**/*.{test,spec}.{js,ts}'],
		globals: true,
		setupFiles: ['src/tests/setup.ts'],
		testTimeout: 10000, // 10 seconds per test (App tests are slow due to complex component tree)
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: ['node_modules/', 'src/tests/'],
			thresholds: {
				statements: 75,
				branches: 70,
				functions: 75,
				lines: 75
			}
		},
		alias: {
			// Ensure Svelte uses the browser build in tests
			svelte: 'svelte'
		}
	},
	resolve: {
		alias: {
			$lib: '/src/lib'
		},
		conditions: ['browser']
	}
});
