import { expect, test } from '@playwright/test';

import { openGallery } from './gallery.js';

const CHROMIUM_VERSION = '149.0.7827.55';

test('runs the fixed Chromium and self-hosted Gallery fonts', async ({ browser, page }) => {
	expect(browser.browserType().name()).toBe('chromium');
	expect(browser.version()).toBe(CHROMIUM_VERSION);

	await openGallery(page);
	const fonts = await page.evaluate(async () => {
		const [inter, jetBrainsMono] = await Promise.all([
			document.fonts.load('400 16px "Inter Variable"', 'Brand gallery'),
			document.fonts.load('400 16px "JetBrains Mono Variable"', 'READY 0123'),
		]);
		return {
			inter: inter.length,
			jetBrainsMono: jetBrainsMono.length,
			heading: getComputedStyle(document.querySelector('h1')!).fontFamily,
			mono: getComputedStyle(document.querySelector('.font-mono')!).fontFamily,
		};
	});

	expect(fonts.inter).toBeGreaterThan(0);
	expect(fonts.jetBrainsMono).toBeGreaterThan(0);
	expect(fonts.heading).toContain('Inter Variable');
	expect(fonts.mono).toContain('JetBrains Mono Variable');
});
