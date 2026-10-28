import AxeBuilder from '@axe-core/playwright';
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
import { blockingAxeViolations } from './authority.js';

// The header width each link priority needs before it shows (the package's contract).
const SHOWN_FROM = { 1: 0, 2: 500, 3: 1024 } as const;
const header = (page: Page) => page.getByRole('navigation', { name: LABELS.nav });
const toggle = (page: Page) =>
	header(page).getByRole('button', { name: new RegExp(`^(${LABELS.openMenu}|${LABELS.closeMenu})$`) });
const menu = (page: Page) => page.getByRole('dialog', { name: LABELS.menu });
const menuLinks = (page: Page) => page.getByRole('navigation', { name: LABELS.menu });
const language = (page: Page) => page.getByRole('link', { name: new RegExp(`^${LANGUAGE_LABEL}:`) });

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

test('the menu opens with every item, traps focus, passes axe and closes with Escape', async ({ page }) => {
	await page.goto(HOME);
	await toggle(page).click();

	await expect(menu(page)).toBeVisible();
	await expect(toggle(page)).toBeFocused();
	await expect(toggle(page)).toHaveAccessibleName(LABELS.closeMenu);
	for (const item of MENU_ITEMS) {
		const link = menuLinks(page).getByRole('link', { name: item.ariaLabel ?? new RegExp(`^${item.label}`) });
		await expect(link).toBeVisible();
		if (item.external) await expect(link).toHaveAttribute('target', '_blank');
	}
	expect(blockingAxeViolations((await new AxeBuilder({ page }).analyze()).violations)).toEqual([]);

	await page.keyboard.press('Shift+Tab');
	await expect(menu(page).locator(':focus')).toHaveCount(1);
	await page.keyboard.press('Escape');
	await expect(menu(page)).toBeHidden();
	await expect(toggle(page)).toBeFocused();
	await expect(toggle(page)).toHaveAccessibleName(LABELS.openMenu);
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
		await menuLinks(page).getByRole('link', { name: new RegExp(`^${target.label}`) }).click();

		await expect(page).toHaveURL(new RegExp(`${target.href}$`));
		await expect(menu(page)).toBeHidden();
	});

	test('Back with the menu open closes it, lands on the previous page and releases the scroll lock', async ({ page }) => {
		const previous = MENU_ITEMS.find((item) => !item.external && !item.current)!.href;
		await page.goto(previous);
		await page.goto(HOME);
		const overflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
		await toggle(page).click();
		await expect(menu(page)).toBeVisible();
		await page.goBack();

		await expect(page).toHaveURL(new RegExp(`${previous}$`));
		await expect(menu(page)).toBeHidden();
		await expect(page.locator('body')).toHaveCSS('overflow', overflow);
	});

	test('reopening while the menu closes keeps it open, and the pill stays clickable above it', async ({ page }) => {
		await page.clock.install();
		await page.goto(HOME);
		await toggle(page).click();
		await expect(menu(page)).toBeVisible();
		await toggle(page).click();
		await toggle(page).click();
		await page.clock.runFor(1000);

		await expect(menu(page)).toBeVisible();
		await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
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
