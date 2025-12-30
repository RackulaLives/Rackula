import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173
	},
	testDir: 'e2e',
	fullyParallel: true,
	retries: 1,
	reporter: [['html', { open: 'never' }]],
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'webkit',
			use: { ...devices['Desktop Safari'] }
		},
		{
			name: 'ios-safari',
			use: {
				...devices['iPhone 14'],
				browserName: 'webkit'
			},
			testMatch: 'ios-safari.spec.ts'
		},
		{
			name: 'ipad',
			use: {
				...devices['iPad Pro 11'],
				browserName: 'webkit'
			},
			testMatch: 'ios-safari.spec.ts'
		}
	]
});
