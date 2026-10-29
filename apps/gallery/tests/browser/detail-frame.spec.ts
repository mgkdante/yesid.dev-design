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
	await expect
		.poll(async () => Math.abs((await left.boundingBox())!.y - (await navBottom())))
		.toBeLessThanOrEqual(2);

	await page.setViewportSize({ width: 1280, height: 600 });
	await page.evaluate(() => window.scrollTo(0, 0));
	const box = (await header.boundingBox())!;
	expect(box.y + box.height).toBeLessThanOrEqual(568);
	expect((await title.boundingBox())!.y).toBeGreaterThanOrEqual((await navBottom()) + NAV_CLEARANCE);
});

test('the header circuit grid holds still while the header scrolls', async ({ page }) => {
	await page.goto('/detail-frame');
	const header = page.locator('[data-slot="article-header"]');
	const grid = header.locator('.header__circuit-grid');
	for (const top of [0, 120]) {
		await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), top);
		await expect.poll(() => page.evaluate(() => scrollY)).toBe(top);
		expect((await grid.boundingBox())!.y).toBe(0);
	}
	await expect(header).toHaveCSS('clip-path', 'inset(0px)');
});

test('the back link sits midway between the chrome and the next line', async ({ page }) => {
	const { height } = page.viewportSize()!;
	for (const width of [page.viewportSize()!.width, 820])
		for (const chromeGap of [0, 8]) {
			await page.setViewportSize({ width, height });
			await page.goto(`/detail-frame?chromeGap=${chromeGap}`);
			await page.evaluate(() => document.fonts.ready);
			const link = page.getByRole('link', { name: 'All notes' });
			const gaps = await link.evaluate((element) => {
				// An app's header starts at the top of the page, under the fixed chrome.
				const header = element.closest('[data-slot="article-header"]')!;
				window.scrollTo(0, header.getBoundingClientRect().top + scrollY);
				const chromeBottom = document.querySelector('[data-testid="fixture-nav"]')!.getBoundingClientRect().bottom;
				const range = document.createRange();
				range.selectNodeContents(element);
				const text = range.getBoundingClientRect();
				return { above: text.top - chromeBottom, below: element.nextElementSibling!.getBoundingClientRect().top - text.bottom };
			});
			expect(Math.abs(gaps.above - gaps.below), `${width}px, --chrome-gap ${chromeGap}px`).toBeLessThanOrEqual(1);
		}
});

test('detail frame layout variants', async ({ page }) => {
	test.skip(page.viewportSize()!.width < DESKTOP_MIN_WIDTH, 'the rails collapse below the desktop breakpoint');

	const slot = (name: string) => page.locator(`[data-slot="detail-shell-${name}"]`);
	const box = async (name: string) => (await slot(name).boundingBox())!;
	const open = async (query: string) => {
		await page.goto(`/detail-frame?${query}`);
		await page.evaluate(() => document.fonts.ready);
	};
	const stuckAt = async (top: number) => {
		await page.evaluate(() => window.scrollTo(0, 800));
		await expect.poll(async () => Math.abs((await box('left')).y - top)).toBeLessThanOrEqual(2);
	};

	await open('');
	await stuckAt(88);
	await expect(slot('left')).toHaveCSS('overflow-y', 'visible');

	await open('layout=measured');
	await expect.poll(async () => Math.abs((await box('center')).width - 736)).toBeLessThanOrEqual(1);

	await open('layout=two');
	await expect(slot('right')).toHaveCount(0);
	const [twoLeft, twoCenter] = [await box('left'), await box('center')];
	expect(twoCenter.x).toBeGreaterThanOrEqual(twoLeft.x + twoLeft.width);

	await open('layout=right');
	await expect(slot('left')).toHaveCount(0);
	const [rightCenter, rightRail] = [await box('center'), await box('right')];
	expect(rightRail.x).toBeGreaterThanOrEqual(rightCenter.x + rightCenter.width);

	await open('layout=pane');
	await expect(slot('left')).toHaveCSS('position', 'static');
	const [paneLeft, paneCenter] = [await box('left'), await box('center')];
	expect(paneLeft.y + paneLeft.height).toBeLessThanOrEqual(paneCenter.y);

	await open('railScroll=1');
	await expect(slot('left')).toHaveCSS('overflow-y', 'auto');
	await expect(slot('left')).toHaveCSS('max-height', `${page.viewportSize()!.height - 88}px`);
	expect((await box('left')).height).toBeCloseTo(page.viewportSize()!.height - 88, 0);

	await open('railTop=140');
	await expect(slot('left')).toHaveCSS('top', '140px');
	await stuckAt(140);
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

	await page.goto('/error-page');
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await expect(page.locator('.light-a').first()).toHaveCSS('animation-name', 'none');
	await expect(page.getByTestId('error-suggestion-link').first()).toHaveCSS('transition-duration', '0s');

	await page.setViewportSize({ width: 390, height: 600 });
	await page.goto('/error-page?long=1');
	const lastLink = page.getByTestId('error-suggestion-link').last();
	await expect(lastLink).toContainText('deliberately long');
	const terminal = page.getByTestId('terminal-line');
	await terminal.scrollIntoViewIfNeeded();
	await expect(lastLink).toBeInViewport();
	await expect(terminal).toBeInViewport();
	const [line, footer] = [(await terminal.boundingBox())!, (await page.locator('[data-slot="footer"]').boundingBox())!];
	expect(footer.y).toBeGreaterThanOrEqual(line.y + line.height);

	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.reload();
	await expect(page.locator('.light-a').first()).not.toHaveCSS('animation-name', 'none');

	if (!desktop) return;
	await page.goto('/error-page');
	const groups = page.locator('[data-slot="footer"] nav');
	await expect(groups).toHaveCount(3);
	for (const group of await groups.all()) await expect(group).toHaveAccessibleName(/\S/);
	await expect(page.getByRole('link', { name: 'Source' })).toHaveAttribute('target', '_blank');
});
