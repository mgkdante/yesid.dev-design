import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initLenis, destroyLenis, getLenis } from './lenis.js';

// Force a known touch state per test. The global mock defaults to 0 (desktop).
function setTouch(value: number): void {
	(ScrollTrigger as unknown as { isTouch: number }).isTouch = value;
}

// Control prefers-reduced-motion independently in each test.
function mockMatchMedia(matches: boolean): void {
	Object.defineProperty(window, 'matchMedia', {
		writable: true,
		configurable: true,
		value: vi.fn().mockReturnValue({
			matches,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		}),
	});
}

describe('motion/utils/lenis', () => {
	beforeEach(() => {
		destroyLenis();
		vi.clearAllMocks();
		setTouch(0);
		mockMatchMedia(false);
	});

	afterEach(() => {
		destroyLenis();
		setTouch(0);
	});

	it('desktop: initLenis creates a Lenis instance', () => {
		setTouch(0);
		initLenis();
		expect(getLenis()).not.toBeNull();
	});

	it('touch: initLenis does NOT create a Lenis instance', () => {
		setTouch(1);
		initLenis();
		expect(getLenis()).toBeNull();
	});

	it('touch: initLenis does NOT call ScrollTrigger.normalizeScroll', () => {
		setTouch(1);
		initLenis();
		expect(ScrollTrigger.normalizeScroll).not.toHaveBeenCalled();
	});

	it('desktop: initLenis does NOT call ScrollTrigger.normalizeScroll either', () => {
		setTouch(0);
		initLenis();
		expect(ScrollTrigger.normalizeScroll).not.toHaveBeenCalled();
	});

	it('desktop: initLenis is idempotent — second call keeps the same instance', () => {
		setTouch(0);
		initLenis();
		const first = getLenis();
		initLenis();
		expect(getLenis()).toBe(first);
	});

	it('desktop: destroyLenis clears the instance', () => {
		setTouch(0);
		initLenis();
		expect(getLenis()).not.toBeNull();
		destroyLenis();
		expect(getLenis()).toBeNull();
	});

	it('touch: destroyLenis does NOT call ScrollTrigger.normalizeScroll', () => {
		setTouch(1);
		initLenis();
		destroyLenis();
		expect(ScrollTrigger.normalizeScroll).not.toHaveBeenCalled();
	});

	it('does not create a Lenis instance under reduced motion (MOTION-GATED tier)', () => {
		setTouch(0);
		mockMatchMedia(true);
		initLenis();
		expect(getLenis()).toBeNull();
	});

	it('destroyLenis is a safe no-op after a reduced-motion bail', () => {
		setTouch(0);
		mockMatchMedia(true);
		initLenis();
		expect(() => destroyLenis()).not.toThrow();
		expect(getLenis()).toBeNull();
	});
});
