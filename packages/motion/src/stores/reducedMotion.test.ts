import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

// Helper to mock window.matchMedia with a fixed return value.
function mockMatchMedia(matches: boolean) {
	const mql = {
		matches,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn()
	};
	Object.defineProperty(window, 'matchMedia', {
		writable: true,
		value: vi.fn().mockReturnValue(mql)
	});
	return mql;
}

describe('prefersReducedMotion store', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('is a readable store with a subscribe method', async () => {
		mockMatchMedia(false);
		// Re-import to get a fresh module using the mocked matchMedia.
		const { prefersReducedMotion } = await import('./reducedMotion.js');
		expect(typeof prefersReducedMotion.subscribe).toBe('function');
	});

	it('returns false when reduced motion is not set (default jsdom behaviour)', async () => {
		mockMatchMedia(false);
		const { prefersReducedMotion } = await import('./reducedMotion.js');
		expect(get(prefersReducedMotion)).toBe(false);
	});

	it('returns true when OS reduced-motion preference is on', async () => {
		mockMatchMedia(true);
		// Force a fresh import after changing the mock.
		vi.resetModules();
		const { prefersReducedMotion } = await import('./reducedMotion.js');
		expect(get(prefersReducedMotion)).toBe(true);
	});

	it('registers a change event listener for reactivity', async () => {
		const mql = mockMatchMedia(false);
		vi.resetModules();
		const { prefersReducedMotion } = await import('./reducedMotion.js');
		// Subscribe to trigger setup code.
		const unsub = prefersReducedMotion.subscribe(() => {});
		expect(mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
		unsub();
	});

	it('removes the change listener on unsubscribe', async () => {
		const mql = mockMatchMedia(false);
		vi.resetModules();
		const { prefersReducedMotion } = await import('./reducedMotion.js');
		const unsub = prefersReducedMotion.subscribe(() => {});
		unsub();
		expect(mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
	});
});

describe('isPrefersReducedMotion helper', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.resetModules();
	});

	it('returns a boolean', async () => {
		mockMatchMedia(false);
		const { isPrefersReducedMotion } = await import('./reducedMotion.js');
		expect(typeof isPrefersReducedMotion()).toBe('boolean');
	});

	it('returns false when reduced motion is off', async () => {
		mockMatchMedia(false);
		vi.resetModules();
		const { isPrefersReducedMotion } = await import('./reducedMotion.js');
		expect(isPrefersReducedMotion()).toBe(false);
	});

	it('returns true when reduced motion is on', async () => {
		mockMatchMedia(true);
		vi.resetModules();
		const { isPrefersReducedMotion } = await import('./reducedMotion.js');
		expect(isPrefersReducedMotion()).toBe(true);
	});
});
