import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import { yesidProjects } from '@yesid/config/playwright';

const host = '127.0.0.1';
const port = Number(process.env.GALLERY_BROWSER_PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
	throw new Error('GALLERY_BROWSER_PORT must be an integer from 1 through 65535');
}
const baseURL = `http://${host}:${port}`;

export default defineConfig({
	testDir: './tests/browser',
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: 0,
	workers: 1,
	timeout: 30_000,
	expect: { timeout: 5_000 },
	preserveOutput: 'failures-only',
	outputDir: './test-results',
	reporter: process.env.CI
		? [
				['line'],
				['html', { open: 'never', outputFolder: 'playwright-report' }],
			]
		: [['list']],
	use: {
		baseURL,
		deviceScaleFactor: 1,
		locale: 'en-CA',
		contextOptions: { reducedMotion: 'reduce' },
		screenshot: 'only-on-failure',
		serviceWorkers: 'block',
		timezoneId: 'UTC',
		trace: 'retain-on-failure',
		video: 'off',
	},
	projects: yesidProjects(baseURL),
	webServer: {
		command: `node node_modules/vite/bin/vite.js preview --host ${host} --port ${port} --strictPort`,
		cwd: fileURLToPath(new URL('.', import.meta.url)),
		reuseExistingServer: false,
		timeout: 120_000,
		url: baseURL,
	},
});
