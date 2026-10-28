import { expect, test } from '@playwright/test';

import { openGallery } from './gallery.js';

test('a long code line scrolls sideways from the keyboard', async ({ page }) => {
	await openGallery(page);
	const code = page.locator('[data-gallery-family="brand:CodeBlock"] pre').last();
	await code.scrollIntoViewIfNeeded();
	await expect.poll(() => code.evaluate((pre) => pre.scrollWidth > pre.clientWidth)).toBe(true);
	await code.focus();
	await page.keyboard.press('ArrowRight');
	await expect.poll(() => code.evaluate((pre) => pre.scrollLeft)).toBeGreaterThan(0);
});
