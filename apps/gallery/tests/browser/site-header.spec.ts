import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { blockingAxeViolations } from './authority.js';

const header = (page: Page) => page.getByRole('navigation', { name: 'Primary' });
const toggle = (page: Page) => header(page).getByRole('button', { name: /^(Open|Close) menu$/ });
const menu = (page: Page) => page.getByRole('dialog', { name: 'Site menu' });

test('site header links, search and language at this width', async ({ page }) => {
	const width = page.viewportSize()!.width;
	await page.goto('/site-header');

	await expect(header(page).getByRole('link', { name: 'Header', exact: true })).toHaveAttribute('aria-current', 'page');
	await expect(header(page).getByRole('link', { name: 'Listing', exact: true })).toBeVisible({ visible: width >= 500 });
	await expect(header(page).getByRole('link', { name: 'Detail', exact: true })).toBeVisible({ visible: width >= 1024 });
	await expect(header(page).getByRole('searchbox', { name: 'Search' })).toBeVisible({ visible: width >= 1024 });
	await expect(page.getByRole('link', { name: 'Language: English' })).toHaveAttribute('href', '/site-header?lang=fr');
});

test('the menu opens, traps focus, passes axe and closes with Escape', async ({ page }) => {
	await page.goto('/site-header');
	await toggle(page).click();

	await expect(menu(page)).toBeVisible();
	await expect(toggle(page)).toBeFocused();
	await expect(toggle(page)).toHaveAccessibleName('Close menu');
	await expect(page.getByRole('link', { name: 'Elsewhere (opens in a new tab)' })).toHaveAttribute('target', '_blank');
	expect(blockingAxeViolations((await new AxeBuilder({ page }).analyze()).violations)).toEqual([]);

	await page.keyboard.press('Shift+Tab');
	await expect(menu(page).locator(':focus')).toHaveCount(1);

	await page.keyboard.press('Escape');
	await expect(menu(page)).toBeHidden();
	await expect(toggle(page)).toBeFocused();
	await expect(toggle(page)).toHaveAccessibleName('Open menu');
});

test('a menu link closes the menu and navigates, with motion on', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.goto('/site-header');
	await toggle(page).click();
	await page.getByRole('navigation', { name: 'Site menu' }).getByRole('link', { name: /Listing/ }).click();

	await expect(page).toHaveURL(/\/listing-frame$/);
	await expect(menu(page)).toBeHidden();
});

test('a language switch from the open menu keeps it open', async ({ page }) => {
	await page.goto('/site-header');
	await toggle(page).click();
	await page.getByRole('link', { name: 'Language: English' }).click();

	await expect(page).toHaveURL(/lang=fr$/);
	await expect(menu(page)).toBeVisible();
	await expect(page.getByRole('link', { name: 'Language: Français' })).toBeFocused();
	await expect(page.getByRole('link', { name: 'Language: Français' })).toHaveAttribute('href', '/site-header?lang=en');
});
