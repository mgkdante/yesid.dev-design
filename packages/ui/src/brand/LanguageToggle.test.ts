import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import LanguageToggle from './LanguageToggle.svelte';
import type { NavigationEvent } from './navigation.js';

const href = (locale: string) => `/${locale}/page?q=1#h`;
const to = (path: string) => ({ url: new URL(path, location.href) });

describe('LanguageToggle', () => {
	it('renders nothing with fewer than two locales', () => {
		const { queryByRole } = render(LanguageToggle, { props: { locale: 'en', locales: ['en'], href, label: 'Language' } });
		expect(queryByRole('link')).toBeNull();
	});

	it('links to the next locale and names the current one', () => {
		const { getByRole } = render(LanguageToggle, {
			props: { locale: 'fr', locales: ['en', 'fr', 'es'], href, label: 'Langue' },
		});
		const link = getByRole('link', { name: 'Langue: Français (EN FR ES)' });
		expect(link.getAttribute('href')).toBe('/es/page?q=1#h');
		expect(link.textContent).toContain('EN');
		expect(link.textContent).toContain('ES');
		expect(link.hasAttribute('data-sveltekit-reset')).toBe(false);
		expect(link.hasAttribute('data-sveltekit-reload')).toBe(false);
	});

	it('asks for a full load or a state-preserving switch', () => {
		const reload = render(LanguageToggle, {
			props: { locale: 'en', locales: ['en', 'fr'], href, label: 'Language', reload: true },
		});
		expect(reload.getByRole('link', { name: 'Language: English (EN FR)' }).hasAttribute('data-sveltekit-reload')).toBe(true);
		reload.unmount();

		const kept = render(LanguageToggle, {
			props: { locale: 'en', locales: ['en', 'fr'], href, label: 'Language', preserveState: true },
		});
		expect(kept.getByRole('link', { name: 'Language: English (EN FR)' }).getAttribute('data-sveltekit-reset')).toBe('false');
	});

	it('resets focus only after its own state-preserving navigation', () => {
		const onNavigate = vi.fn();
		render(LanguageToggle, {
			props: { locale: 'en', locales: ['en', 'fr'], href, label: 'Language', preserveState: true, onNavigate },
		});
		const callback = onNavigate.mock.calls[0]![0] as (navigation: NavigationEvent) => unknown;
		expect(callback({ type: 'link', to: to('/fr/page?q=1#h') })).toBeTypeOf('function');
		expect(callback({ type: 'link', to: to('/elsewhere') })).toBeUndefined();
		expect(callback({ type: 'popstate', to: to('/fr/page?q=1#h') })).toBeUndefined();
	});
});
