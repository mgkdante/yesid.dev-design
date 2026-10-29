import { fireEvent, render, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import Map from '@lucide/svelte/icons/map';
import { afterEach, describe, expect, it, vi } from 'vitest';

const motion = vi.hoisted(() => ({ reduced: true }));
vi.mock('@yesid/motion/stores/reducedMotion', async (original) => ({
	...(await original<object>()),
	isPrefersReducedMotion: () => motion.reduced,
}));

import SiteHeader, { type SiteHeaderProps } from './SiteHeader.svelte';
import type { NavigationEvent } from '../brand/navigation.js';

type Hook = (navigation: NavigationEvent) => unknown;
const link = (path: string): NavigationEvent => ({ type: 'link', to: { url: new URL(path, location.href) } });

function setup(overrides: Partial<SiteHeaderProps> = {}) {
	const hooks: { before?: Hook; on?: Hook; after?: Hook } = {};
	const view = render(SiteHeader, {
		props: {
			navigation: {
				beforeNavigate: (callback: Hook) => (hooks.before = callback),
				// The language toggle registers its own hook after the header's.
				onNavigate: (callback: Hook) => (hooks.on ??= callback),
				afterNavigate: (callback: Hook) => (hooks.after = callback),
			},
			home: '/',
			links: [{ href: '/a', label: 'A', current: true }],
			menuItems: [
				{ href: '/a', label: 'A', subtitle: 'First', current: true },
				{ href: 'https://example.com', label: 'Out', external: true },
			],
			labels: { openMenu: 'Open menu', closeMenu: 'Close menu', menu: 'Site menu', theme: 'Dark theme' },
			language: { locale: 'en', locales: ['en', 'fr'], href: (next: string) => `/${next}`, label: 'Language' },
			...overrides,
		},
	});
	const toggle = view.getByRole('button', { name: 'Open menu' });
	const menu = () => view.queryByRole('navigation', { name: 'Site menu' });
	return { ...view, hooks, toggle, menu, open: () => fireEvent.click(toggle) };
}

afterEach(() => {
	motion.reduced = true;
	vi.useRealTimers();
});

describe('SiteHeader', () => {
	it('menu items show their icon, and items without one keep the stop', async () => {
		const { menu, open } = setup({ menuItems: [
			{ href: '/a', label: 'A', icon: Map },
			{ href: 'https://example.com', label: 'Out', external: true },
		] });
		await open();
		expect(within(menu()!).getByRole('link', { name: 'A' }).querySelector('svg')).not.toBeNull();
		expect(within(menu()!).getByRole('link', { name: 'Out' }).querySelector('svg')).toBeNull();
	});

	it('the menu footer defaults by locale, takes an override and hides when empty', async () => {
		const texts: string[] = [];
		for (const [locale, menuFooter] of [['en', undefined], ['fr', undefined], ['en', 'Custom footer'], ['en', '']] as const) {
			const view = setup({
				language: { locale, locales: ['en', 'fr'], href: (next) => `/${next}`, label: 'Language', names: { en: 'Language', fr: 'Language' } },
				labels: { openMenu: 'Open menu', closeMenu: 'Close menu', menu: 'Site menu', theme: 'Dark theme', menuFooter },
			});
			await view.open();
			const dialog = view.getByRole('dialog', { name: 'Site menu' });
			texts.push(dialog.textContent!.replace(/\s+/g, ''));
			if (menuFooter === 'Custom footer') expect(within(dialog).getByText('Custom footer')).toBeTruthy();
			view.unmount();
		}
		const baseline = texts[3]!;
		const defaults = texts.slice(0, 2).map((text) => {
			expect(text).toContain(baseline);
			return text.replace(baseline, '');
		});
		for (const footer of defaults) {
			expect(footer).not.toBe('');
			expect(baseline).not.toContain(footer);
		}
		expect(defaults[0]).not.toBe(defaults[1]);
	});

	it('starts with a skip link to #main, named by locale or by label, before the banner', () => {
		const names = (['en', 'fr'] as const).map((locale) => {
			const view = setup({ language: { locale, locales: ['en', 'fr'], href: (next) => `/${next}`, label: 'Language' } });
			const skip = view.getAllByRole('link')[0]!;
			const banner = view.getByRole('banner');
			expect(skip.getAttribute('href')).toBe('#main');
			expect(skip.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
			expect(banner.contains(view.toggle)).toBe(true);
			const name = skip.textContent!.trim();
			view.unmount();
			return name;
		});
		expect(names[0]).not.toBe('');
		expect(names[0]).not.toBe(names[1]);
		const custom = setup({ labels: { openMenu: 'Open menu', closeMenu: 'Close menu', menu: 'Site menu', theme: 'Dark theme', skipToContent: 'Jump to the page' } });
		expect(custom.getAllByRole('link')[0]!.textContent!.trim()).toBe('Jump to the page');
	});

	it('opens the menu from the toggle and closes it from a menu link', async () => {
		const { toggle, menu, open } = setup();
		expect(menu()).toBeNull();
		await open();
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		expect(toggle.getAttribute('aria-label')).toBe('Close menu');
		const items = within(menu()!).getAllByRole('link');
		expect(items[0]!.getAttribute('aria-current')).toBe('page');
		expect(items[1]!.getAttribute('target')).toBe('_blank');

		await fireEvent.click(items[0]!);
		await tick();
		expect(menu()).toBeNull();
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
	});

	it('closes for a navigation but stays open for its own language switch', async () => {
		const { hooks, menu, open } = setup();
		await open();
		hooks.before!(link('/fr'));
		await tick();
		expect(menu()).not.toBeNull();

		hooks.before!(link('/elsewhere'));
		await tick();
		expect(menu()).toBeNull();
	});

	it('holds a navigation until the menu has finished closing', async () => {
		motion.reduced = false;
		vi.useFakeTimers();
		const { hooks, open } = setup();
		await open();

		let landed = false;
		const held = hooks.on!(link('/elsewhere')) as Promise<void>;
		void held.then(() => (landed = true));
		// No transitionend in the test DOM, so the 500ms fallback finishes the close.
		await vi.advanceTimersByTimeAsync(400);
		expect(landed).toBe(false);
		await vi.advanceTimersByTimeAsync(200);
		expect(landed).toBe(true);
	});
});
