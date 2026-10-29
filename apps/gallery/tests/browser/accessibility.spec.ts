import { readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoHorizontalOverflow, expectTapTargets } from '@yesid/config/playwright';

import { HOME, LABELS } from '../../src/lib/gallery/site-header-fixture.js';
import { copy } from '../../src/routes/data-page/fixture.js';
import { openGallery } from './gallery.js';

const routes = [
	'/',
	...readdirSync(new URL('../../src/routes', import.meta.url), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map(({ name }) => `/${name}`),
];

test.describe('accessibility', { tag: '@theme' }, () => {
	test.afterEach(async ({ page }, testInfo) => {
		await expect(page.locator('html')).toHaveAttribute('data-theme', testInfo.project.name);
	});

	for (const route of routes) {
		test(`${route} has no serious or critical axe violations`, async ({ page }) => {
			await page.goto(route);
			await page.evaluate(() => document.fonts.ready);
			await expectAccessible(page);
		});
	}

	test('the gallery stays accessible with its combobox and sheet open', async ({ page }) => {
		await openGallery(page);
		const family = page.locator('[data-gallery-family="primitive:combobox"]');
		await family.getByRole('button', { name: 'Choisir une vue opérationnelle' }).click();
		await expect(page.getByRole('listbox')).toBeVisible();
		await expectAccessible(page);
		await family.getByRole('combobox', { name: 'Choisir une vue opérationnelle' }).press('Escape');
		await expect(page.getByRole('listbox')).toBeHidden();

		await page.getByRole('button', { name: 'Open details' }).click();
		await expect(page.getByRole('dialog', { name: 'Operational detail' })).toBeVisible();
		await expect(page.getByRole('dialog', { name: 'Operational detail' })).toHaveCSS('animation-name', 'none');
		await expectAccessible(page);
	});

	test('the data page stays accessible with its rail sheet open on a phone', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/data-page');
		await page.getByRole('button', { name: new RegExp(`^${copy.rail.label}`) }).click();
		await expect(page.getByRole('dialog', { name: copy.rail.label })).toBeVisible();
		await expectAccessible(page);
	});

	test('the detail frame stays accessible on a phone, contents pill included', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/detail-frame');
		await expect(page.getByRole('button', { name: /Open contents$/ })).toBeVisible();
		await expectAccessible(page);
	});

	test('the site header stays accessible with its menu open', async ({ page }) => {
		await page.goto(HOME);
		await page.getByRole('navigation', { name: LABELS.nav }).getByRole('button', { name: LABELS.openMenu }).click();
		await expect(page.getByRole('dialog', { name: LABELS.menu })).toBeVisible();
		await expectAccessible(page);
	});
});

for (const route of routes) {
	test(`${route} fits the viewport with full-size tap targets`, async ({ page }) => {
		await page.goto(route);
		await expectAccessible(page);
		await expectNoHorizontalOverflow(page);
		// The catalogue shows every size variant, dense ones included.
		if (route !== '/') await expectTapTargets(page);
	});
}

test('tap targets: sentence links are exempt, a lone row control needs 24px, other controls the token', async ({ page }) => {
	const verdict = async (body: string) => {
		await page.setContent(`<style>:root { --size-tap-min: 44px; } .row { display: block; height: 24px; }</style>${body}`);
		return expectTapTargets(page).then(() => 'pass', () => 'fail');
	};
	expect(await verdict('<p>Read <a href="#">the notes</a> first.</p><ul><li><a class="row" href="#">Row</a></li></ul>')).toBe('pass');
	expect(await verdict('<nav><a href="#">Home</a> <a href="#">About</a></nav>')).toBe('fail');
	expect(await verdict('<ul><li><button class="row">Edit</button><button class="row">Delete</button></li></ul>')).toBe('fail');
	expect(await verdict('<ul><li><a class="row" href="#" style="height: 20px">Row</a></li></ul>')).toBe('fail');
});
