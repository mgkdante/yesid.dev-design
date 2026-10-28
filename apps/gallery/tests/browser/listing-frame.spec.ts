import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import { blockingAxeViolations } from './authority.js';

const DESKTOP_MIN_WIDTH = 1024;

test('blueprint strokes follow scrolling and remain fully drawn under reduced motion', async ({ page }) => {
	test.skip(page.viewportSize()!.width < DESKTOP_MIN_WIDTH, 'Blueprint scrubbing is desktop only');
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.goto('/listing-frame');
	if (await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)) {
		await page.addStyleTag({ content: 'body { min-height: 300vh; }' });
	}
	const path = page.locator('[data-slot="listing-frame"] .blueprint-bg svg path').first();
	const fraction = () => path.evaluate((element) => {
		const [drawn, total] = (element as SVGPathElement).style.strokeDasharray.split(',').map(parseFloat);
		return drawn / total;
	});
	await expect.poll(fraction).toBeGreaterThan(0);
	const initial = await fraction();
	await page.mouse.wheel(0, 800);
	await expect.poll(fraction).toBeGreaterThan(initial);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.reload();
	await expect.poll(() => path.evaluate((element) => (element as SVGPathElement).style.strokeDasharray)).toBe('');
});

test('every header drawing renders at the frame ink in both themes', async ({ page }) => {
	await page.goto('/listing-frame');
	const art = page.locator('[data-slot="blueprint-listing-art"]');
	for (const theme of ['dark', 'light'] as const) {
		const { ink, drawings } = await art.evaluate((slot, theme) => {
			document.documentElement.dataset.theme = theme;
			// What a drawing shows: its own opacity times its wrappers' inside the slot.
			const rendered = (drawing: Element) => {
				let opacity = 1;
				for (let node: Element | null = drawing; node && node !== slot; node = node.parentElement) {
					opacity *= Number(getComputedStyle(node).opacity);
				}
				return opacity;
			};
			return {
				ink: Number(getComputedStyle(slot).getPropertyValue('--blueprint-ink')),
				drawings: [...slot.querySelectorAll('svg')].map(rendered),
			};
		}, theme);
		expect(ink, theme).toBeGreaterThan(0);
		expect(drawings.length, theme).toBeGreaterThan(1);
		for (const opacity of drawings) expect(opacity, theme).toBeCloseTo(ink, 3);
	}
});

test('the lowest header copy rests on the band floor, with or without an aside', async ({ page }) => {
	for (const aside of ['1', '0']) {
		await page.goto(`/listing-frame?aside=${aside}`);
		await expect(page.getByLabel('Totaux du catalogue')).toHaveCount(aside === '1' ? 1 : 0);
		await page.evaluate(() => document.fonts.ready);
		const gap = await page.locator('[data-slot="blueprint-listing-content"]').evaluate((content) => {
			const header = content.closest('[data-slot="blueprint-listing-header"]')!;
			const copy = [content.firstElementChild!.lastElementChild!, ...[...content.children].slice(1)];
			const lowest = Math.max(...copy.map((element) => element.getBoundingClientRect().bottom));
			return header.getBoundingClientRect().bottom - parseFloat(getComputedStyle(content).paddingBottom) - lowest;
		});
		expect(Math.abs(gap), `aside=${aside}`).toBeLessThanOrEqual(1);
	}
});

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
