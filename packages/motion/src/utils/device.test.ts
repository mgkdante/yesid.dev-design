import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('isTouchDevice', () => {
	let isTouchDevice: () => boolean;

	beforeEach(async () => {
		// Re-import each test to get fresh module
		const mod = await import('./device.js');
		isTouchDevice = mod.isTouchDevice;
	});

	it('returns false when maxTouchPoints is 0', () => {
		Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
		expect(isTouchDevice()).toBe(false);
	});

	it('returns true when maxTouchPoints is > 0', () => {
		Object.defineProperty(navigator, 'maxTouchPoints', { value: 1, configurable: true });
		expect(isTouchDevice()).toBe(true);
	});

	it('returns false when window is undefined', () => {
		const originalWindow = globalThis.window;
		// @ts-expect-error — simulating SSR
		delete globalThis.window;
		expect(isTouchDevice()).toBe(false);
		globalThis.window = originalWindow;
	});
});

describe('isViewportAtMost', () => {
	let isViewportAtMost: (maxWidthPx: number) => boolean;
	let originalMatchMedia: typeof window.matchMedia;

	beforeEach(async () => {
		const mod = await import('./device.js');
		isViewportAtMost = mod.isViewportAtMost;
		originalMatchMedia = window.matchMedia;
	});

	afterEach(() => {
		window.matchMedia = originalMatchMedia;
	});

	it('queries (max-width: Npx) and returns the match result', () => {
		const spy = vi.fn().mockReturnValue({ matches: true } as MediaQueryList);
		window.matchMedia = spy;
		expect(isViewportAtMost(767)).toBe(true);
		expect(spy).toHaveBeenCalledWith('(max-width: 767px)');
	});

	it('returns false when the query does not match', () => {
		window.matchMedia = vi.fn().mockReturnValue({ matches: false } as MediaQueryList);
		expect(isViewportAtMost(1023)).toBe(false);
	});

	it('returns false when window is undefined (SSR)', () => {
		const originalWindow = globalThis.window;
		// @ts-expect-error — simulating SSR
		delete globalThis.window;
		expect(isViewportAtMost(767)).toBe(false);
		globalThis.window = originalWindow;
	});
});
