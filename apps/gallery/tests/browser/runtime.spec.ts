import { expect, test } from '@playwright/test';

import { openGallery } from './gallery.js';

const CHROMIUM_VERSION = '149.0.7827.55';

test('runs the fixed Chromium and self-hosted Gallery fonts', async ({ browser, page }) => {
	expect(browser.browserType().name()).toBe('chromium');
	expect(browser.version()).toBe(CHROMIUM_VERSION);

	await openGallery(page);
	const preloads = await page
		.locator('link[rel="preload"][as="font"]')
		.evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
	expect(preloads).toHaveLength(2);
	expect(preloads.some((href) => href.includes('inter-latin-wght-normal'))).toBe(true);
	expect(preloads.some((href) => href.includes('jetbrains-mono-latin-wght-normal'))).toBe(true);

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

test('keeps the header control and ThemeToggle on one shared theme', async ({ page }) => {
	await openGallery(page);
	const html = page.locator('html');
	const lamp = page.getByRole('switch', { name: 'Dark theme' });

	await page.getByRole('button', { name: 'toggle theme' }).click();
	await expect(html).toHaveAttribute('data-theme', 'light');
	await expect(lamp).toHaveAttribute('aria-checked', 'false');

	await lamp.click();
	await expect(html).toHaveAttribute('data-theme', 'dark');
	await expect(lamp).toHaveAttribute('aria-checked', 'true');
});
