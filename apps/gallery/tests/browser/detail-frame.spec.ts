import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { blockingAxeViolations } from './authority.js';

const DESKTOP_MIN_WIDTH = 1024;
const NAV_CLEARANCE = 14;

test('detail frame layout at this width', async ({ page }) => {
	const viewport = page.viewportSize()!;
	await page.goto('/detail-frame');
	await page.evaluate(() => document.fonts.ready);

	const left = page.locator('[data-slot="detail-shell-left"]');
	const right = page.locator('[data-slot="detail-shell-right"]');
	const header = page.locator('[data-slot="article-header"]');
	const title = header.locator('h1');
	const navBottom = async () => {
		const nav = (await page.getByTestId('fixture-nav').boundingBox())!;
		return nav.y + nav.height;
	};

	if (viewport.width < DESKTOP_MIN_WIDTH) {
		await expect(left).toBeHidden();
		await expect(right).toBeHidden();
		await expect(page.getByTestId('toc-pill')).toBeVisible();
		await expect(header.locator('ul[aria-label]')).toHaveCount(0);
		return;
	}

	await expect(left).toBeVisible();
	await expect(right).toBeVisible();
	await expect(page.getByRole('link', { name: 'All notes' })).toBeVisible();
	expect((await title.boundingBox())!.y).toBeGreaterThanOrEqual((await navBottom()) + NAV_CLEARANCE);

	await page.evaluate(() => window.scrollTo(0, 800));
	expect((await left.boundingBox())!.y).toBeGreaterThanOrEqual(await navBottom());

	await page.setViewportSize({ width: 1280, height: 600 });
	await page.evaluate(() => window.scrollTo(0, 0));
	const box = (await header.boundingBox())!;
	expect(box.y + box.height).toBeLessThanOrEqual(568);
	expect((await title.boundingBox())!.y).toBeGreaterThanOrEqual((await navBottom()) + NAV_CLEARANCE);
});

test('error page and footer pass axe', async ({ page }, testInfo) => {
	const desktop = page.viewportSize()!.width >= DESKTOP_MIN_WIDTH;

	for (const path of ['/error-page', '/detail-frame']) {
		await page.goto(path);
		await page.evaluate(() => document.fonts.ready);

		const results = await new AxeBuilder({ page }).analyze();
		await testInfo.attach(`axe${path.replace('/', '-')}.json`, {
			body: JSON.stringify(results, null, 2),
			contentType: 'application/json',
		});
		const blockers = blockingAxeViolations(results.violations).map(({ help, id, impact, nodes }) => ({
			help,
			id,
			impact,
			targets: nodes.map(({ target }) => target),
		}));
		expect(blockers, `${path} has blocking axe violations`).toEqual([]);
	}

	if (!desktop) return;
	await page.goto('/error-page');
	const groups = page.locator('[data-slot="footer"] nav');
	await expect(groups).toHaveCount(3);
	for (const group of await groups.all()) await expect(group).toHaveAccessibleName(/\S/);
	await expect(page.getByRole('link', { name: 'Source' })).toHaveAttribute('target', '_blank');
});
