import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { blockingAxeViolations } from './authority.js';

test('site header links, search, menu and language at this width', async ({ page }) => {
	const width = page.viewportSize()!.width;
	await page.goto('/site-header');
	const pill = page.getByTestId('nav-pill');
	const toggle = page.getByTestId('nav-menu-toggle');

	await expect(pill.getByRole('link', { name: 'Header', exact: true })).toHaveAttribute('aria-current', 'page');
	await expect(pill.getByRole('link', { name: 'Listing', exact: true })).toBeVisible({ visible: width >= 500 });
	await expect(pill.getByRole('link', { name: 'Detail', exact: true })).toBeVisible({ visible: width >= 1024 });
	await expect(pill.getByRole('searchbox', { name: 'Search' })).toBeVisible({ visible: width >= 1024 });
	await expect(page.getByTestId('language-toggle')).toHaveAttribute('href', '/site-header?lang=fr');
	expect(blockingAxeViolations((await new AxeBuilder({ page }).analyze()).violations)).toEqual([]);

	await toggle.click();
	const menu = page.getByRole('dialog', { name: 'Site menu' });
	await expect(menu).toBeVisible();
	await expect(toggle).toBeFocused();
	await expect(toggle).toHaveAccessibleName('Close menu');
	await expect(page.getByRole('link', { name: 'Elsewhere (opens in a new tab)' })).toHaveAttribute('target', '_blank');
	await page.keyboard.press('Escape');
	await expect(menu).toBeHidden();
	await expect(toggle).toBeFocused();

	await toggle.click();
	await page.locator('[data-menu-item]', { hasText: 'Listing' }).click();
	await expect(page).toHaveURL(/\/listing-frame$/);
});

test('a language switch from the open menu keeps it open', async ({ page }) => {
	await page.goto('/site-header');
	await page.getByTestId('nav-menu-toggle').click();
	await page.getByTestId('language-toggle').click();
	await expect(page).toHaveURL(/lang=fr$/);
	await expect(page.getByRole('dialog', { name: 'Site menu' })).toBeVisible();
	await expect(page.getByTestId('language-toggle')).toBeFocused();
	await expect(page.getByTestId('language-toggle')).toHaveAttribute('href', '/site-header?lang=en');
});
