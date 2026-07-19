import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { blockingAxeViolations } from './authority.js';
import { GALLERY_THEMES, openGallery } from './gallery.js';

async function scan(page: Page, testInfo: TestInfo, state: string): Promise<void> {
	const results = await new AxeBuilder({ page }).analyze();
	await testInfo.attach(`axe-${state}.json`, {
		body: JSON.stringify(results, null, 2),
		contentType: 'application/json',
	});
	const blockers = blockingAxeViolations(results.violations);
	const evidence = blockers.map(({ help, helpUrl, id, impact, nodes }) => ({
		help,
		helpUrl,
		id,
		impact,
		nodes: nodes.map(({ failureSummary, html, target }) => ({ failureSummary, html, target })),
	}));
	expect(evidence, `${state} has blocking axe violations`).toEqual([]);
}

for (const theme of GALLERY_THEMES) {
	test(`${theme} theme has no serious or critical axe violations in default and exposed states`, async ({
		page,
	}, testInfo) => {
		await openGallery(page, theme);
		await scan(page, testInfo, `${theme}-default`);

		const combobox = page
			.locator('[data-gallery-family="primitive:combobox"]')
			.getByRole('combobox', { name: 'Choisir une vue opérationnelle' });
		await page
			.locator('[data-gallery-family="primitive:combobox"]')
			.getByRole('button', { name: 'Choisir une vue opérationnelle' })
			.click();
		await expect(page.getByRole('listbox')).toBeVisible();
		await scan(page, testInfo, `${theme}-combobox-open`);
		await combobox.press('Escape');
		await expect(page.getByRole('listbox')).toBeHidden();

		await page.getByRole('button', { name: 'Open details' }).click();
		await expect(page.getByRole('dialog', { name: 'Operational detail' })).toBeVisible();
		await scan(page, testInfo, `${theme}-sheet-open`);
	});
}
