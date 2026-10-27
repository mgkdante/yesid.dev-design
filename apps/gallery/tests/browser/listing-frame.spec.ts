import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import { blockingAxeViolations } from './authority.js';

const DESKTOP_MIN_WIDTH = 1024;

function listing(page: Page) {
	return {
		search: page.getByRole('textbox', { name: 'Rechercher' }),
		toggle: page.locator('[data-slot="listing-filter-toggle"]'),
		firstButton: page.locator('[data-slot="listing-filter-panel"] button').first(),
		clear: page.locator('[data-slot="clear-filters"]'),
	};
}

async function expectTabTo(page: Page, target: Locator): Promise<void> {
	await page.keyboard.press('Tab');
	await expect(target).toBeFocused();
}

test('filter panel is usable at this width', async ({ page, browser, baseURL }) => {
	const viewport = page.viewportSize()!;
	await page.goto('/listing-frame');
	const { search, toggle, firstButton, clear } = listing(page);

	if (viewport.width >= DESKTOP_MIN_WIDTH) {
		await expect(firstButton).toBeVisible();
		await search.focus();
		await expectTabTo(page, firstButton);

		const context = await browser.newContext({
			baseURL,
			javaScriptEnabled: false,
			reducedMotion: 'reduce',
			viewport,
		});
		const plain = await context.newPage();
		await plain.goto('/listing-frame');
		const plainListing = listing(plain);
		await expect(plainListing.firstButton).toBeVisible();
		await plainListing.search.focus();
		await expectTabTo(plain, plainListing.firstButton);
		await context.close();
		return;
	}

	await expect(firstButton).toBeHidden();
	await search.focus();
	await expectTabTo(page, toggle);
	await expectTabTo(page, clear);

	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await expect(firstButton).toBeVisible();
	await expectTabTo(page, firstButton);

	// With motion on, the panel leaves the tab order once its close transition ends.
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await toggle.click();
	await expect(firstButton).toBeHidden();
	await toggle.focus();
	await expectTabTo(page, clear);

	// The stored open state survives a reload, and an open panel stays shown at desktop width.
	await toggle.click();
	await page.reload();
	await expect(listing(page).toggle).toHaveAttribute('aria-expanded', 'true');
	await expect(listing(page).firstButton).toBeVisible();
	await page.setViewportSize({ width: 1280, height: 900 });
	await expect(listing(page).firstButton).toBeVisible();
});

test('edge title fits and the page passes axe', async ({ page }, testInfo) => {
	const viewport = page.viewportSize()!;
	await page.goto('/listing-frame');
	await page.evaluate(() => document.fonts.ready);

	if (viewport.width >= DESKTOP_MIN_WIDTH) {
		const box = await page.locator('[data-slot="listing-edge-title"] .edge-title').boundingBox();
		expect(box!.height).toBeLessThanOrEqual(viewport.height);
	}

	const results = await new AxeBuilder({ page }).analyze();
	await testInfo.attach('axe-listing-frame.json', {
		body: JSON.stringify(results, null, 2),
		contentType: 'application/json',
	});
	const blockers = blockingAxeViolations(results.violations).map(
		({ help, helpUrl, id, impact, nodes }) => ({
			help,
			helpUrl,
			id,
			impact,
			nodes: nodes.map(({ failureSummary, html, target }) => ({ failureSummary, html, target })),
		}),
	);
	expect(blockers, 'listing frame has blocking axe violations').toEqual([]);
});
