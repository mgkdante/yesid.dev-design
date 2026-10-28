import { fireEvent, render, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

const motion = vi.hoisted(() => ({ reduced: true }));
vi.mock('@yesid/motion/stores/reducedMotion', async (original) => ({
	...(await original<object>()),
	isPrefersReducedMotion: () => motion.reduced,
}));

import SiteHeader from './SiteHeader.svelte';
import type { NavigationEvent } from '../brand/navigation.js';

type Hook = (navigation: NavigationEvent) => unknown;
const link = (path: string): NavigationEvent => ({ type: 'link', to: { url: new URL(path, location.href) } });

function setup() {
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
		},
	});
	const toggle = view.getByRole('button', { name: 'Open menu' });
	const menu = () => view.queryByRole('navigation', { name: 'Site menu' });
	return { hooks, toggle, menu, open: () => fireEvent.click(toggle) };
}

afterEach(() => {
	motion.reduced = true;
	vi.useRealTimers();
});

describe('SiteHeader', () => {
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
