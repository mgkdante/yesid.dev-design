import { expect, test } from '@playwright/test';

import { GALLERY_THEMES, openGallery } from './gallery.js';

for (const theme of GALLERY_THEMES) {
	test(`${theme} Gallery visual regression`, async ({ page }) => {
		await openGallery(page, theme);
		await expect(page).toHaveScreenshot(`gallery-${theme}.png`, { fullPage: true });
	});
}
