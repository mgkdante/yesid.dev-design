import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { copy, hourTable, statuses, stopRows, stopTable } from '../../src/routes/data-page/fixture.js';
import { blockingAxeViolations } from './authority.js';

const DESKTOP_MIN_WIDTH = 1024;
const isPhone = (page: Page) => page.viewportSize()!.width < DESKTOP_MIN_WIDTH;

async function open(page: Page): Promise<void> {
	await page.goto('/data-page');
	await page.evaluate(() => document.fonts.ready);
}

async function dismissConsent(page: Page): Promise<void> {
	await page.getByRole('button', { name: copy.consent.decline }).click();
	await expect(page.getByRole('region', { name: copy.consent.title })).toHaveCount(0);
}

test('tables stack or scroll to fit this width', async ({ page }) => {
	await open(page);
	const stacked = page.getByRole('table', { name: stopTable.caption });

	await expect(stacked.getByRole('columnheader')).toHaveText(Object.values(stopTable.headers));
	const rowCells = stacked.getByRole('row').nth(1).locator('th, td');
	const tops = await rowCells.evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().top));
	const fits = await stacked.evaluate((table) => table.getBoundingClientRect().right <= window.innerWidth);
	expect(fits).toBe(true);
	if (isPhone(page)) {
		expect(new Set(tops).size).toBe(tops.length);
	} else {
		expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
	}

	const hours = page.getByRole('table', { name: hourTable.caption });
	const overflows = await hours.evaluate((table) => {
		const frame = table.parentElement!;
		return frame.scrollWidth - frame.clientWidth > 1;
	});
	const region = page.getByRole('region', { name: hourTable.caption });
	if (overflows) {
		await region.focus();
		await expect(region).toBeFocused();
	} else {
		await expect(region).toHaveCount(0);
	}
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

	await expect(page.getByText('Headway on the night route:')).toContainText('no feed');
});

test('filter chips narrow the table and say so when nothing matches', async ({ page }) => {
	await open(page);
	await dismissConsent(page);
	const filters = page.getByRole('group', { name: copy.filters });
	const table = page.getByRole('table', { name: stopTable.caption });
	const late = statuses.find((status) => status.key === 'late')!;
	const empty = statuses.find((status) => !stopRows.some((row) => row.status === status.key))!;

	await filters.getByRole('button', { name: late.label }).click();
	await expect(filters.getByRole('button', { name: late.label })).toHaveAttribute('aria-pressed', 'true');
	await expect(table.getByRole('rowheader')).toHaveText(
		stopRows.filter((row) => row.status === late.key).map((row) => row.stop),
	);

	await filters.getByRole('button', { name: late.label }).click();
	await filters.getByRole('button', { name: empty.label }).click();
	await expect(page.getByRole('status')).toContainText(copy.noMatch);
	await expect(table).toHaveCount(0);
});

test('the rail is a landmark on desktop and a sheet on phones that keeps its state', async ({ page }) => {
	await open(page);
	await dismissConsent(page);
	const landmark = page.getByRole('complementary', { name: copy.rail.label });
	const pill = page.getByRole('button', { name: new RegExp(`^${copy.rail.label}`) });

	if (!isPhone(page)) {
		await expect(landmark).toBeVisible();
		await expect(pill).toBeHidden();
		return;
	}

	await expect(landmark).toBeHidden();
	await pill.click();
	const sheet = page.getByRole('dialog', { name: copy.rail.label });
	await sheet.getByRole('searchbox', { name: copy.search }).fill('Bonaventure');
	await page.keyboard.press('Escape');
	await expect(sheet).toBeHidden();
	await expect(pill).toBeFocused();
	await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');

	await pill.click();
	await expect(sheet.getByRole('searchbox', { name: copy.search })).toHaveValue('Bonaventure');
	await sheet.getByRole('link', { name: stopTable.caption }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByRole('table', { name: stopTable.caption })).toBeInViewport();

	await pill.click();
	await sheet.getByRole('searchbox', { name: copy.search }).focus();
	await page.setViewportSize({ width: DESKTOP_MIN_WIDTH + 256, height: page.viewportSize()!.height });
	await expect(sheet).toBeHidden();
	await expect(landmark).toBeVisible();
	await expect(landmark.getByRole('searchbox', { name: copy.search })).toHaveValue('Bonaventure');
	await expect(landmark.locator(':focus')).toHaveCount(1);
});

test.describe('with motion on', () => {
	test.use({ contextOptions: { reducedMotion: 'no-preference' } });

	test('the rail sheet stays centred while it opens on phones', async ({ page }) => {
		test.skip(!isPhone(page), 'the rail sheet is only shown on phones');
		await open(page);
		await dismissConsent(page);
		// Samples every frame in which the sheet is animating, from before the click until it settles.
		await page.evaluate((label) => {
			const offsets: number[] = [];
			(window as unknown as { railOffsets: number[] }).railOffsets = offsets;
			const sample = () => {
				const sheet = document.querySelector(`[role="dialog"][aria-label="${label}"]`);
				const animating = sheet ? sheet.getAnimations().length > 0 : false;
				if (sheet && animating) {
					const rect = sheet.getBoundingClientRect();
					offsets.push(Math.abs(rect.x + rect.width / 2 - innerWidth / 2));
				}
				if (!sheet || animating || offsets.length === 0) requestAnimationFrame(sample);
			};
			requestAnimationFrame(sample);
		}, copy.rail.label);
		await page.getByRole('button', { name: new RegExp(`^${copy.rail.label}`) }).click();
		const sheet = page.getByRole('dialog', { name: copy.rail.label });
		await expect(sheet).toBeVisible();
		await expect.poll(() => sheet.evaluate((element) => element.getAnimations().length)).toBe(0);
		const offsets = await page.evaluate(() => (window as unknown as { railOffsets: number[] }).railOffsets);
		expect(offsets.length).toBeGreaterThanOrEqual(5);
		for (const offset of offsets) expect(offset).toBeLessThanOrEqual(1);
	});
});

test('consent asks, steps aside after a choice and comes back as settings with tap-size actions', async ({ page }) => {
	await open(page);
	const prompt = page.getByRole('region', { name: copy.consent.title });

	await expect(prompt).toBeVisible();
	await prompt.getByRole('button', { name: copy.consent.decline }).click();
	await expect(prompt).toBeHidden();

	await page.getByRole('button', { name: copy.consent.settings }).click();
	const settings = page.getByRole('region', { name: copy.consent.settings });
	await expect(settings).toBeFocused();
	await expect(settings.getByRole('button', { name: copy.consent.decline })).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	const box = (await settings.boundingBox())!;
	expect(box.x).toBeGreaterThanOrEqual(0);
	expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
	const tapMin = await page.evaluate(() => {
		const probe = document.body.appendChild(document.createElement('div'));
		probe.style.height = 'var(--size-tap-min)';
		const height = probe.getBoundingClientRect().height;
		probe.remove();
		return height;
	});
	for (const button of await settings.getByRole('button').all()) {
		const { x, width, height } = (await button.boundingBox())!;
		expect(height).toBeGreaterThanOrEqual(tapMin);
		expect(x).toBeGreaterThanOrEqual(box.x);
		expect(x + width).toBeLessThanOrEqual(box.x + box.width);
	}
});

test('no blocking axe violations with the prompt and the sheet open', async ({ page }, testInfo) => {
	await open(page);
	const states: Array<[string, () => Promise<void>]> = [['loaded', async () => {}]];
	if (isPhone(page)) {
		states.push([
			'rail sheet',
			async () => {
				await dismissConsent(page);
				await page.getByRole('button', { name: new RegExp(`^${copy.rail.label}`) }).click();
				await expect(page.getByRole('dialog', { name: copy.rail.label })).toBeVisible();
			},
		]);
	}

	for (const [name, enter] of states) {
		await enter();
		const results = await new AxeBuilder({ page }).analyze();
		await testInfo.attach(`axe-data-page-${name}.json`, {
			body: JSON.stringify(results, null, 2),
			contentType: 'application/json',
		});
		const blockers = blockingAxeViolations(results.violations).map(
			({ id, nodes }) => `${name}: ${id} ${nodes.map((node) => node.target.join(' ')).join(', ')}`,
		);
		expect(blockers).toEqual([]);
	}
});
