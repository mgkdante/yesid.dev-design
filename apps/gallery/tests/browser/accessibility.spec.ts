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

test('the resizable handle is valid server markup before hydration', async ({ page }) => {
	await page.route('**/_app/**/*.js', (route) => route.abort());
	await page.goto('/');
	await expectAccessible(page, { include: '[data-gallery-family="primitive:resizable"]' });
});

// Catalogue families drawn at their default, standalone size; the rest show deliberate size variants.
const FULL_SIZE_FAMILIES = ['brand:CodeBlock', 'brand:TocNav'];

test('catalogue families at their default size keep full-size tap targets', async ({ page }) => {
	await openGallery(page);
	const others = FULL_SIZE_FAMILIES.map((family) => `:not([data-gallery-family="${family}"])`).join('');
	await expectTapTargets(page, { exclude: [`[data-gallery-family]${others}`] });
});

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('at 320 px the grown tap targets keep clear of their neighbours', async ({ page }, { project }) => {
	test.skip(project.name !== 'phone', 'one width is enough');
	await page.setViewportSize({ width: 320, height: 640 });
	await openGallery(page);
	const code = page.locator('[data-gallery-family="brand:CodeBlock"]');
	const copy = (await code.getByRole('button', { name: 'Copy code' }).boundingBox())!;
	for (const text of ['Long translated query title', 'sql']) {
		expect(overlaps(copy, (await code.getByText(text, { exact: true }).first().boundingBox())!), text).toBe(false);
	}

	await page.getByRole('button', { name: 'Open details' }).click();
	const sheet = page.getByRole('dialog', { name: 'Operational detail' });
	const close = (await sheet.getByRole('button', { name: 'Fermer le panneau' }).boundingBox())!;
	expect(overlaps(close, (await sheet.getByRole('heading', { name: 'Operational detail' }).boundingBox())!)).toBe(false);
});

test('tap targets: sentence links are exempt, a lone row control needs 24px, other controls the token', async ({ page }) => {
	const verdict = async (body: string) => {
		await page.setContent(`<style>:root { --size-tap-min: 44px; } .row { display: block; height: 24px; }</style>${body}`);
		return expectTapTargets(page).then(() => 'pass', () => 'fail');
	};
	expect(await verdict('<p>Read <a href="#">the notes</a> first.</p><ul><li><a class="row" href="#">Row</a></li></ul>')).toBe('pass');
	expect(await verdict('<nav><a href="#">Home</a> <a href="#">About</a></nav>')).toBe('fail');
	expect(await verdict('<ul><li><button class="row">Edit</button><button class="row">Delete</button></li></ul>')).toBe('fail');
	expect(await verdict('<ul><li><a class="row" href="#" style="height: 20px">Row</a></li></ul>')).toBe('fail');
	expect(await verdict('<div><span hidden>Hidden text</span><a href="#">Go</a></div>')).toBe('fail');
	expect(await verdict('<div><p>A separate paragraph.</p><a href="#">Go</a></div>')).toBe('fail');
	await page.setContent('<button>Go</button>');
	await expect(expectTapTargets(page)).rejects.toThrow('--size-tap-min is not defined');
});
