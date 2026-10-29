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

	const [normal, compact] = [await sizes(page, 'default'), await sizes(page, 'compact')];
	compact.forEach((size, part) => expect(parseFloat(size)).toBeLessThan(parseFloat(normal[part]!)));
});

test('compact density on the document root applies to the whole page', async ({ page }) => {
	await page.goto('/density');
	const compact = await sizes(page, 'compact');

	await page.goto('/density?density=compact');
	await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
	expect(await sizes(page, 'default')).toEqual(compact);
	expect(await sizes(page, 'compact')).toEqual(compact);
});
