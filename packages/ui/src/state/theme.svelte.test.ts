import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { theme } from './theme.svelte.js';

describe('theme', () => {
	beforeEach(() => {
		localStorage.clear();
		document.documentElement.dataset.theme = 'dark';
		theme.init();
	});

	afterEach(() => {
		document.head.querySelector('meta[name="theme-color"]')?.remove();
		vi.unstubAllGlobals();
	});

	it('toggle flips the document theme and persists it', () => {
		theme.toggle();
		expect(document.documentElement.dataset.theme).toBe('light');
		expect(localStorage.getItem('theme')).toBe('light');
		expect(theme.isDark).toBe(false);
	});

	it('dispatches themechange after applying the document theme', () => {
		const seen: string[] = [];
		const listener = (event: Event) => {
			const { detail } = event as CustomEvent<{ theme: string }>;
			seen.push(`${detail.theme}:${document.documentElement.dataset.theme}`);
		};
		document.addEventListener('themechange', listener);
		theme.set('light');
		document.removeEventListener('themechange', listener);
		expect(seen).toEqual(['light:light']);
	});

	it('init adopts the pre-paint theme without writing storage', () => {
		document.documentElement.dataset.theme = 'light';
		theme.init();
		expect(theme.current).toBe('light');
		expect(localStorage.getItem('theme')).toBeNull();
	});

	it('init treats a missing or unknown document theme as dark', () => {
		delete document.documentElement.dataset.theme;
		theme.init();
		expect(theme.current).toBe('dark');
		expect(document.documentElement.dataset.theme).toBe('dark');
	});

	it('coalesces theme-color updates into one frame read from --background', () => {
		const frames: FrameRequestCallback[] = [];
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
		const meta = document.createElement('meta');
		meta.name = 'theme-color';
		document.head.append(meta);
		document.documentElement.style.setProperty('--background', '#f3f6fb');

		theme.set('light');
		theme.set('dark');
		theme.set('light');
		expect(frames).toHaveLength(1);
		frames[0](0);
		expect(meta.getAttribute('content')).toBe('#f3f6fb');
		document.documentElement.style.removeProperty('--background');
	});
});
