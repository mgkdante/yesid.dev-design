import { expect, test } from '@playwright/test';

// With the app's scripts blocked, only the head boot script can restore the reader's choices.
for (const colorScheme of ['dark', 'light'] as const) {
	test(`a reload paints the stored theme and closed section before the app runs (system ${colorScheme})`, async ({ page }) => {
		await page.emulateMedia({ colorScheme });
		await page.goto('/');
		const html = page.locator('html');
		const themeSwitch = page.getByRole('switch', { name: 'Dark theme' });
		const section = page.getByRole('button', { name: 'Service notes' });
		await expect(html).toHaveAttribute('data-theme', 'dark');

		// Server markup shows the controls before hydration wires them; retry until they respond.
		await expect(async () => {
			if ((await html.getAttribute('data-theme')) !== 'light') await themeSwitch.click();
			await expect(html).toHaveAttribute('data-theme', 'light', { timeout: 1000 });
		}).toPass();
		await expect(async () => {
			if ((await section.getAttribute('aria-expanded')) !== 'false') await section.click();
			await expect(section).toHaveAttribute('aria-expanded', 'false', { timeout: 1000 });
		}).toPass();

		await page.route('**/_app/**/*.js', (route) => route.abort());
		await page.reload();
		await expect(html).toHaveAttribute('data-theme', 'light');
		await expect(section).toHaveAttribute('aria-expanded', 'false');
		const body = page.locator(`[id="${await section.getAttribute('aria-controls')}"]`);
		await expect(body).toBeHidden();

		// Hydration takes over the boot script's markup: once the theme switch responds, the section is
		// still closed and its toggle still opens it.
		await page.unroute('**/_app/**/*.js');
		await page.reload();
		await expect(async () => {
			if ((await html.getAttribute('data-theme')) !== 'dark') await themeSwitch.click();
			await expect(html).toHaveAttribute('data-theme', 'dark', { timeout: 1000 });
		}).toPass();
		await expect(section).toHaveAttribute('aria-expanded', 'false');
		await section.click();
		await expect(section).toHaveAttribute('aria-expanded', 'true');
		await expect(body).toBeVisible();
	});
}

test('a remembered quiet mode paints sections closed before the app runs, and hydration keeps them closed', async ({ page }) => {
	await page.goto('/');
	const section = page.getByRole('button', { name: 'Service notes' });
	const remember = page.getByRole('button', { name: 'Always start collapsed' });
	// Server markup shows the controls before hydration wires them; retry until they respond.
	await expect(async () => {
		if ((await section.getAttribute('aria-expanded')) !== 'false') await remember.click();
		await expect(section).toHaveAttribute('aria-expanded', 'false', { timeout: 1000 });
	}).toPass();

	await page.route('**/_app/**/*.js', (route) => route.abort());
	await page.reload();
	await expect(section).toHaveAttribute('aria-expanded', 'false');
	await expect(page.locator(`[id="${await section.getAttribute('aria-controls')}"]`)).toBeHidden();
	const closed = await page
		.getByRole('button', { expanded: false })
		.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-controls')).filter(Boolean));
	expect(closed).toContain(await section.getAttribute('aria-controls'));

	// Every value each control's aria-expanded holds from the first parse through hydration.
	await page.unroute('**/_app/**/*.js');
	await page.addInitScript(() => {
		const states: Record<string, (string | null)[]> = {};
		Object.assign(window, { states });
		new MutationObserver((records) => {
			for (const { target, oldValue } of records)
				(states[(target as Element).getAttribute('aria-controls') ?? ''] ??= []).push(oldValue);
		}).observe(document, { subtree: true, attributeFilter: ['aria-expanded'], attributeOldValue: true });
	});
	await page.reload();
	// Hydration renders the store's label, so this button only exists once the app runs.
	const expandAll = page.getByRole('button', { name: 'Expand all' });
	await expect(expandAll).toBeVisible();
	const states = await page.evaluate(() => (window as unknown as { states: Record<string, (string | null)[]> }).states);
	for (const id of closed) {
		// The first value is the server markup's; nothing after it may be expanded.
		const current = await page.locator(`[aria-controls="${id}"]`).first().getAttribute('aria-expanded');
		expect([...(states[id!] ?? []).slice(1), current], id!).not.toContain('true');
	}
	await expandAll.click();
	await expect(section).toHaveAttribute('aria-expanded', 'true');
});
