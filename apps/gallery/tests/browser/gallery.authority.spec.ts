import { expect, test, type Page } from '@playwright/test';

import { GALLERY_COVERAGE } from '../../src/lib/gallery/coverage.js';
import { openGallery } from './gallery.js';

test('Manifesto layers share one background strength across themes and motion settings', async ({ page }) => {
	for (const colorScheme of ['light', 'dark'] as const) {
		for (const reducedMotion of ['reduce', 'no-preference'] as const) {
			await page.emulateMedia({ colorScheme, reducedMotion });
			await openGallery(page, colorScheme);
			const demo = page.locator('[data-gallery-family="brand:ManifestoCanvas"]');
			await demo.scrollIntoViewIfNeeded();
			const strengths = await demo.evaluate(el => {
				const strength = Number(getComputedStyle(el).getPropertyValue('--manifesto-background-strength'));
				const canvas = el.querySelector('canvas')!;
				const glow = canvas.nextElementSibling!;
				return { strength, layers: [canvas, glow].map(layer => Number(getComputedStyle(layer).opacity)) };
			});
			expect(strengths.strength).toBeGreaterThan(0);
			expect(strengths.strength).toBeLessThan(1);
			for (const layer of strengths.layers) expect(layer).toBe(strengths.strength);
			const rippleRatios = await demo.evaluate(el => {
				const host = el.querySelector('canvas')!.parentElement!;
				const alpha = (ring: Element) => {
					const color = getComputedStyle(ring).borderTopColor;
					return Number.parseFloat(color.split('/')[1] ?? color.split(',')[3] ?? '1');
				};
				const click = () => host.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 40, clientY: 40 }));
				click();
				const rings = [...host.querySelectorAll('.manifesto__ripple, .manifesto__ripple-inner')];
				const quiet = rings.map(alpha);
				host.style.setProperty('--manifesto-background-strength', '1');
				const ratios = rings.map((ring, i) => quiet[i] / alpha(ring));
				host.style.removeProperty('--manifesto-background-strength');
				return ratios;
			});
			if (reducedMotion === 'reduce') expect(rippleRatios).toEqual([]);
			else {
				expect(rippleRatios.length).toBeGreaterThan(0);
				for (const ratio of rippleRatios) expect(ratio).toBeCloseTo(strengths.strength);
			}
		}
	}
});

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

test('renders both global ripple rings at the pointer coordinates', async ({ page }) => {
	await openGallery(page);
	const demo = page.locator('[data-gallery-demo="global-ripple"]');

	await demo.dispatchEvent('pointerdown', { clientX: 124, clientY: 168 });

	const ripples = await page
		.locator('.global-ripple, .global-ripple-inner')
		.evaluateAll((nodes) =>
			nodes.map((node) => {
				const style = getComputedStyle(node);
				return {
					left: style.left,
					top: style.top,
					position: style.position,
					borderTopStyle: style.borderTopStyle,
					animationName: style.animationName,
				};
			}),
		);

	expect(ripples).toHaveLength(2);
	for (const ripple of ripples) {
		expect(ripple).toMatchObject({ left: '124px', top: '168px', position: 'fixed', borderTopStyle: 'solid' });
		expect(ripple.animationName).not.toBe('none');
	}
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
		name: 'footer caller-owned status refresh',
		async run(page) {
			const family = page.locator('[data-gallery-family="primitive:footer"]');
			const status = family.getByRole('status');
			await expect(status).toHaveText('Status refreshes: 0');
			await family.getByRole('button', { name: 'Request a Gallery status refresh' }).click();
			await expect(status).toHaveText('Status refreshes: 1');
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
