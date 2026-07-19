import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';

import { GALLERY_THEMES, openGallery } from './gallery.js';

for (const theme of GALLERY_THEMES) {
	test(`${theme} Gallery visual regression`, async ({ page }, testInfo) => {
		await openGallery(page, theme);
		const screenshotName = `gallery-${theme}.png`;
		if (!existsSync(testInfo.snapshotPath(screenshotName))) {
			await page.screenshot({
				animations: 'disabled',
				caret: 'hide',
				fullPage: true,
				path: testInfo.outputPath(`gallery-${theme}-candidate.png`),
				scale: 'css',
			});
		}
		await expect(page).toHaveScreenshot(screenshotName, { fullPage: true });
	});
}
