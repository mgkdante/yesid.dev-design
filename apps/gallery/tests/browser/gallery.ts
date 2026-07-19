import { expect, type Page } from '@playwright/test';

export const GALLERY_THEMES = ['dark', 'light'] as const;

export type GalleryTheme = (typeof GALLERY_THEMES)[number];

export async function openGallery(page: Page, theme: GalleryTheme = 'dark'): Promise<void> {
	await page.addInitScript((selectedTheme) => {
		localStorage.setItem('theme', selectedTheme);
	}, theme);
	await page.goto('/');
	await expect(page).toHaveTitle('yesid.dev-design — brand gallery');
	await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
	await expect(page.getByRole('heading', { level: 1, name: 'Brand gallery' })).toBeVisible();
	await page.evaluate(async () => {
		await document.fonts.ready;
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
		});
	});
}
