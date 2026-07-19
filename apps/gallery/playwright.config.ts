import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const host = '127.0.0.1';
const port = 4173;
const baseURL = `http://${host}:${port}`;

export default defineConfig({
	testDir: './tests/browser',
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: 0,
	workers: 1,
	timeout: 30_000,
	expect: {
		timeout: 5_000,
		toHaveScreenshot: {
			animations: 'disabled',
			caret: 'hide',
			maxDiffPixels: 0,
			scale: 'css',
			threshold: 0,
		},
	},
	preserveOutput: 'failures-only',
	updateSnapshots: 'none',
	outputDir: './test-results',
	snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
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
		reducedMotion: 'reduce',
		screenshot: 'only-on-failure',
		serviceWorkers: 'block',
		timezoneId: 'UTC',
		trace: 'retain-on-failure',
		video: 'off',
	},
	projects: [
		{
			name: 'chromium-noble-desktop',
			use: {
				browserName: 'chromium',
				hasTouch: false,
				isMobile: false,
				viewport: { width: 1440, height: 1000 },
			},
		},
		{
			name: 'chromium-noble-mobile',
			use: {
				browserName: 'chromium',
				hasTouch: true,
				isMobile: true,
				viewport: { width: 390, height: 844 },
			},
		},
	],
	webServer: {
		command: `node node_modules/vite/bin/vite.js preview --host ${host} --port ${port} --strictPort`,
		cwd: fileURLToPath(new URL('.', import.meta.url)),
		reuseExistingServer: false,
		timeout: 120_000,
		url: baseURL,
	},
});
