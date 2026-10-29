import { expect, test, type Page } from '@playwright/test';

import {
	HOME,
	LABELS,
	LANGUAGE_LABEL,
	LINKS,
	LOCALES,
	MENU_ITEMS,
	SEARCH_LABEL,
	languageHref,
} from '../../src/lib/gallery/site-header-fixture.js';

// The header width each link priority needs before it shows (the package's contract).
const SHOWN_FROM = { 1: 0, 2: 500, 3: 1024 } as const;
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const header = (page: Page) => page.getByRole('navigation', { name: LABELS.nav });
const toggle = (page: Page) =>
	header(page).getByRole('button', { name: new RegExp(`^(${literal(LABELS.openMenu)}|${literal(LABELS.closeMenu)})$`) });
const menu = (page: Page) => page.getByRole('dialog', { name: LABELS.menu });
const menuLinks = (page: Page) => page.getByRole('navigation', { name: LABELS.menu });
const language = (page: Page) => page.getByRole('link', { name: new RegExp(`^${literal(LANGUAGE_LABEL)}:`) });

test('links and search show at the header widths their priority allows', async ({ page }) => {
	const width = page.viewportSize()!.width;
	await page.goto(HOME);

	for (const link of LINKS) {
		const shown = header(page).getByRole('link', { name: link.label, exact: true });
		await expect(shown).toBeVisible({ visible: width >= SHOWN_FROM[link.priority ?? 1] });
		if (link.current) await expect(shown).toHaveAttribute('aria-current', 'page');
	}
	await expect(header(page).getByRole('searchbox', { name: SEARCH_LABEL })).toBeVisible({ visible: width >= 1024 });
	await expect(language(page)).toHaveAttribute('href', languageHref(LOCALES[1]));
});

test('the language link meets the tap-size minimum', async ({ page }) => {
	await page.goto(HOME);
	const { min, width, height } = await language(page).evaluate((link) => {
		const probe = document.createElement('div');
		probe.style.inlineSize = 'var(--size-tap-min)';
		document.body.append(probe);
		const min = probe.getBoundingClientRect().width;
		probe.remove();
		const { width, height } = link.getBoundingClientRect();
		return { min, width, height };
	});
	expect(min).toBeGreaterThan(0);
	expect(width).toBeGreaterThanOrEqual(min);
	expect(height).toBeGreaterThanOrEqual(min);
});

test('the menu opens with every item, traps focus and closes with Escape', async ({ page }) => {
	await page.goto(HOME);
	await toggle(page).click();

	await expect(menu(page)).toBeVisible();
	await expect(toggle(page)).toBeFocused();
	await expect(toggle(page)).toHaveAccessibleName(LABELS.closeMenu);
	for (const item of MENU_ITEMS) {
		const link = menuLinks(page).getByRole('link', { name: item.ariaLabel ?? new RegExp(`^${literal(item.label)}`) });
		await expect(link).toBeVisible();
		if (item.external) await expect(link).toHaveAttribute('target', '_blank');
	}

	await page.keyboard.press('Shift+Tab');
	await expect(menu(page).locator(':focus')).toHaveCount(1);
	await page.keyboard.press('Escape');
	await expect(menu(page)).toBeHidden();
	await expect(toggle(page)).toBeFocused();
	await expect(toggle(page)).toHaveAccessibleName(LABELS.openMenu);
});

test('menu items carry icons and only the current item\'s icon is lit', async ({ page }) => {
	await page.goto(HOME);
	await toggle(page).click();
	for (const item of MENU_ITEMS) {
		const icon = menuLinks(page).getByRole('link', { name: item.ariaLabel ?? new RegExp(`^${literal(item.label)}`) }).locator('svg');
		await expect(icon).toBeVisible();
		if (item.current) await expect(icon).not.toHaveCSS('fill', 'none');
		else await expect(icon).toHaveCSS('fill', 'none');
	}
});

test('a classless text link is underlined and readable in both themes; header links are not', async ({ page }) => {
	await page.goto(HOME);
	const link = page.getByRole('paragraph').getByRole('link');
	await expect(link).toBeVisible();
	for (const colorScheme of ['dark', 'light'] as const) {
		const result = await page.evaluate(({ link, colorScheme }) => {
			document.documentElement.dataset.theme = colorScheme;
			const context = document.createElement('canvas').getContext('2d')!;
			const rgba = (color: string) => {
				context.clearRect(0, 0, 1, 1);
				context.fillStyle = color;
				context.fillRect(0, 0, 1, 1);
				return Array.from(context.getImageData(0, 0, 1, 1).data);
			};
			const luminance = (rgb: number[]) => rgb.slice(0, 3).reduce((sum, value, i) => {
				const c = value / 255;
				return sum + (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i]!;
			}, 0);
			let ancestor = link!.parentElement;
			while (ancestor && rgba(getComputedStyle(ancestor).backgroundColor)[3] === 0) ancestor = ancestor.parentElement;
			if (!ancestor) throw new Error('No non-transparent link background');
			const style = getComputedStyle(link!);
			const foreground = luminance(rgba(style.color));
			const background = luminance(rgba(getComputedStyle(ancestor).backgroundColor));
			return { decoration: style.textDecorationLine, contrast: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05) };
		}, { link: await link.elementHandle(), colorScheme });
		expect(result.decoration).toContain('underline');
		expect(result.contrast).toBeGreaterThanOrEqual(4.5);
		await expect(header(page).getByRole('link', { name: LINKS[0]!.label, exact: true })).toHaveCSS('text-decoration-line', 'none');
	}
});

test('a language switch from the open menu keeps it open', async ({ page }) => {
	await page.goto(HOME);
	await toggle(page).click();
	await language(page).click();

	await expect(page).toHaveURL(new RegExp(`lang=${LOCALES[1]}$`));
	await expect(menu(page)).toBeVisible();
	await expect(language(page)).toBeFocused();
	await expect(language(page)).toHaveAttribute('href', languageHref(LOCALES[0]));
});

test.describe('with motion on', () => {
	test.use({ contextOptions: { reducedMotion: 'no-preference' } });

	test('a menu link closes the menu and navigates', async ({ page }) => {
		const target = MENU_ITEMS.find((item) => !item.external && !item.current)!;
		await page.goto(HOME);
		await toggle(page).click();
		await menuLinks(page).getByRole('link', { name: new RegExp(`^${literal(target.label)}`) }).click();

		await expect(page).toHaveURL((url) => url.pathname === target.href);
		await expect(menu(page)).toBeHidden();
	});

	test('Back with the menu open closes it, returns to the previous entry and releases the scroll lock', async ({ page }) => {
		await page.goto(HOME);
		const overflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
		await language(page).click();
		await expect(page).toHaveURL(new RegExp(`lang=${LOCALES[1]}$`));
		await toggle(page).click();
		await expect(menu(page)).toBeVisible();
		await page.goBack();

		await expect(page).toHaveURL((url) => url.pathname === HOME && !url.search);
		await expect(menu(page)).toBeHidden();
		await expect(page.locator('body')).toHaveCSS('overflow', overflow);
	});

	test('reopening while the menu closes keeps the same menu open, and the pill stays clickable above it', async ({ page }) => {
		await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
		await page.goto(HOME);
		await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
		await toggle(page).click();
		await page.clock.runFor(100);
		const list = await menuLinks(page).elementHandle();
		await toggle(page).click();
		await toggle(page).click();
		await page.clock.runFor(1000);

		await expect(menu(page)).toBeVisible();
		await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
		expect(await list!.evaluate((node) => node.isConnected)).toBe(true);
	});
});

test.describe('in a short viewport', () => {
	test.use({ viewport: { width: 390, height: 320 } });

	test('the wheel scrolls the menu while the page stays put', async ({ page }) => {
		await page.goto(HOME);
		const pageScroll = await page.evaluate(() => window.scrollY);
		await toggle(page).click();
		const list = menuLinks(page);
		await list.hover();
		await page.mouse.wheel(0, 400);

		await expect.poll(() => list.evaluate((nav) => nav.parentElement!.scrollTop)).toBeGreaterThan(0);
		expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);
	});
});
