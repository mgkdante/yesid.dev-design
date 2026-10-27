import { expect, test, type Page } from '@playwright/test';

async function sizes(page: Page, half: 'default' | 'compact'): Promise<string[]> {
	return Promise.all(
		['class', 'body', 'detail'].map((part) =>
			page
				.getByTestId(`${half}-${part}`)
				.evaluate((element) => getComputedStyle(element).fontSize),
		),
	);
}

test('compact density shrinks the type scale only inside its subtree', async ({ page }) => {
	await page.goto('/density');

	expect(await sizes(page, 'default')).toEqual(['17px', '17px', '18px']);
	expect(await sizes(page, 'compact')).toEqual(['16px', '16px', '17px']);
});

test('compact density on the document root applies to the whole page', async ({ page }) => {
	await page.goto('/density?density=compact');

	await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
	expect(await sizes(page, 'default')).toEqual(['16px', '16px', '17px']);
	expect(await sizes(page, 'compact')).toEqual(['16px', '16px', '17px']);
});
