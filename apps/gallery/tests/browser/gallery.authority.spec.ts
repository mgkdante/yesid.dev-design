import { expect, test, type Page } from '@playwright/test';

import { GALLERY_COVERAGE } from '../../src/lib/gallery/coverage.js';
import { openGallery } from './gallery.js';

function expectedFamilyMarkers(): string[] {
	return [
		...GALLERY_COVERAGE.primitives.map((family) => `primitive:${family}`),
		...GALLERY_COVERAGE.brand.map((family) => `brand:${family}`),
		...GALLERY_COVERAGE.motion.map((family) => `motion:${family}`),
	].sort();
}

test('renders the exact coverage matrix', async ({ page }) => {
	await openGallery(page);
	const families = await page.locator('[data-gallery-family]').evaluateAll((nodes) =>
		[...new Set(nodes.map((node) => node.getAttribute('data-gallery-family')!))].sort(),
	);
	const states = await page.locator('[data-gallery-state]').evaluateAll((nodes) =>
		[...new Set(nodes.map((node) => node.getAttribute('data-gallery-state')!))].sort(),
	);

	expect(families).toEqual(expectedFamilyMarkers());
	expect(states).toEqual([...GALLERY_COVERAGE.states].sort());

	const containment = await page
		.locator('[aria-label="Theme semantics"]')
		.evaluate((section) => ({
			childrenFit: [...section.children].every((child) => {
				const { left, right } = child.getBoundingClientRect();
				return left >= 0 && right <= window.innerWidth;
			}),
			pageFits: document.documentElement.scrollWidth <= window.innerWidth,
		}));
	expect(containment).toEqual({ childrenFit: true, pageFits: true });
});

type Interaction = Readonly<{
	name: string;
	run: (page: Page) => Promise<void>;
}>;

const INTERACTIONS: readonly Interaction[] = [
	{
		name: 'collapsible disclosure',
		async run(page) {
			const trigger = page.getByRole('button', { name: 'Maintenance window' });
			await expect(trigger).toHaveAttribute('aria-expanded', 'true');
			await trigger.click();
			await expect(trigger).toHaveAttribute('aria-expanded', 'false');
			await expect(page.getByText('A neutral disclosure owns no persistence')).toBeHidden();
		},
	},
	{
		name: 'combobox keyboard opening and filtered selection',
		async run(page) {
			const family = page.locator('[data-gallery-family="primitive:combobox"]');
			const combobox = family.getByRole('combobox', { name: 'Choisir une vue opérationnelle' });
			await combobox.focus();
			await combobox.press('ArrowDown');
			await expect(page.getByRole('listbox')).toBeVisible();
			await combobox.fill('accessibilite');
			const option = page.getByRole('option', { name: /Accessibilité universelle/ });
			await expect(option).toBeVisible();
			const optionId = await option.getAttribute('id');
			expect(optionId).not.toBeNull();
			await expect(combobox).toHaveAttribute('aria-activedescendant', optionId!);
			await combobox.press('Enter');
			await expect(page.getByRole('listbox')).toBeHidden();
			await expect(combobox).toHaveValue('Accessibilité universelle');
			await expect(family).toContainText('Selected: accessibility');
		},
	},
	{
		name: 'resizable keyboard handle',
		async run(page) {
			const family = page.locator('[data-gallery-family="primitive:resizable"]');
			const handle = family.getByRole('separator');
			const pane = family.locator('[data-pane]').first();
			const before = await pane.boundingBox();
			await handle.focus();
			await expect(handle).toHaveAttribute('data-active', 'keyboard');
			await handle.press('ArrowRight');
			await expect
				.poll(async () => (await pane.boundingBox())?.width)
				.not.toBe(before?.width);
		},
	},
	{
		name: 'scroll-area overflow',
		async run(page) {
			const viewport = page
				.locator('[data-gallery-state="overflow"]')
				.locator('[data-slot="scroll-area-viewport"]');
			await expect
				.poll(() => viewport.evaluate((node) => node.scrollHeight > node.clientHeight))
				.toBe(true);
			await viewport.evaluate((node) => node.scrollTo({ top: node.scrollHeight }));
			await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
		},
	},
	{
		name: 'sheet focus and dismissal',
		async run(page) {
			const trigger = page.getByRole('button', { name: 'Open details' });
			await trigger.click();
			const dialog = page.getByRole('dialog', { name: 'Operational detail' });
			await expect(dialog).toBeVisible();
			expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
			await page.keyboard.press('Escape');
			await expect(dialog).toBeHidden();
			await expect(trigger).toBeFocused();
		},
	},
	{
		name: 'tabs keyboard navigation',
		async run(page) {
			const family = page.locator('[data-gallery-family="primitive:tabs"]');
			const summary = family.getByRole('tab', { name: 'Summary' });
			const details = family.getByRole('tab', { name: 'Details' });
			await summary.focus();
			await summary.press('ArrowRight');
			await expect(details).toBeFocused();
			await expect(details).toHaveAttribute('aria-selected', 'true');
			await expect(family.getByRole('tabpanel')).toContainText('Caller classes still compose.');
		},
	},
	{
		name: 'toggle pressed state',
		async run(page) {
			const family = page.locator('[data-gallery-family="primitive:toggle"]');
			const toggle = family.getByRole('button', { name: 'Pin', exact: true });
			await toggle.click();
			await expect(family.getByRole('button', { name: 'Pinned' })).toHaveAttribute(
				'aria-pressed',
				'true',
			);
		},
	},
	{
		name: 'toggle-group single selection',
		async run(page) {
			const family = page.locator('[data-gallery-family="primitive:toggle-group"]');
			const summary = family.getByRole('radio', { name: 'Summary' });
			const timeline = family.getByRole('radio', { name: 'Timeline' });
			await expect(summary).toHaveAttribute('aria-checked', 'true');
			await timeline.click();
			await expect(summary).toHaveAttribute('aria-checked', 'false');
			await expect(timeline).toHaveAttribute('aria-checked', 'true');
			await expect(family.getByRole('radio', { name: 'Map' })).toBeDisabled();
		},
	},
];

test('directly exercises every complex public primitive family', async ({ page }) => {
	await openGallery(page);
	for (const interaction of INTERACTIONS) {
		await test.step(interaction.name, () => interaction.run(page));
	}
});
