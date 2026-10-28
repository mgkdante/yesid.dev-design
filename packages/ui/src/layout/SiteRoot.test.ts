import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const lenis = vi.hoisted(() => ({ initLenis: vi.fn(), destroyLenis: vi.fn() }));
vi.mock('@yesid/motion/utils/lenis', () => lenis);

import SiteRoot from './SiteRoot.svelte';
import { quietMode } from '../state/quiet-mode.svelte.js';
import { theme } from '../state/theme.svelte.js';

const page = createRawSnippet(() => ({
	render: () => '<div id="main"><div id="flow">page</div></div>',
}));

describe('SiteRoot', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
		quietMode.resetForTest();
	});

	it('renders its children without a wrapper element', () => {
		const { container } = render(SiteRoot, { props: { children: page } });
		expect(container.firstElementChild?.id).toBe('main');
	});

	it('adopts the document theme and restores quiet mode on mount', () => {
		document.documentElement.dataset.theme = 'light';
		localStorage.setItem('transit:quiet-mode', 'true');
		render(SiteRoot, { props: { children: page, quietModeKey: 'transit:quiet-mode' } });
		expect(theme.current).toBe('light');
		expect(quietMode.enabled).toBe(true);
	});

	it('restores a remembered quiet mode before its children render', () => {
		localStorage.setItem('quiet-mode', 'true');
		const probe = createRawSnippet(() => ({ render: () => `<p>${quietMode.enabled}</p>` }));
		const { container } = render(SiteRoot, { props: { children: probe } });
		expect(container.textContent).toBe('true');
	});

	it('keeps <html lang> on the page language', async () => {
		const view = render(SiteRoot, { props: { children: page, lang: 'fr' } });
		expect(document.documentElement.lang).toBe('fr');
		await view.rerender({ children: page, lang: 'en' });
		expect(document.documentElement.lang).toBe('en');
	});

	it('starts Lenis on the window by default and destroys it on unmount', () => {
		const { unmount } = render(SiteRoot, { props: { children: page } });
		expect(lenis.initLenis).toHaveBeenCalledWith(undefined);
		unmount();
		expect(lenis.destroyLenis).toHaveBeenCalledOnce();
	});

	it('passes an element scroller resolved from selectors', () => {
		render(SiteRoot, {
			props: { children: page, scroller: { wrapper: '#main', content: '#flow' } },
		});
		expect(lenis.initLenis).toHaveBeenCalledWith({
			wrapper: document.getElementById('main'),
			content: document.getElementById('flow'),
		});
	});

	it('leaves Lenis off when smooth scroll is disabled', () => {
		render(SiteRoot, { props: { children: page, smoothScroll: false } });
		expect(lenis.initLenis).not.toHaveBeenCalled();
	});
});
