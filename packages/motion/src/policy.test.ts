import { describe, it, expect, vi, afterEach } from 'vitest';
import { shouldAnimate } from './policy.js';

// GO-w2t5: the two-tier motion policy, formalized. SAFE-ALWAYS ignores the
// OS reduced-motion setting; MOTION-GATED honors it.

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

describe('motion/policy — two-tier helper', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('safe-always runs regardless of prefers-reduced-motion', () => {
		mockMatchMedia(true);
		expect(shouldAnimate('safe-always')).toBe(true);
		mockMatchMedia(false);
		expect(shouldAnimate('safe-always')).toBe(true);
	});

	it('motion-gated no-ops under prefers-reduced-motion: reduce', () => {
		mockMatchMedia(true);
		expect(shouldAnimate('motion-gated')).toBe(false);
	});

	it('motion-gated runs when there is no reduce preference', () => {
		mockMatchMedia(false);
		expect(shouldAnimate('motion-gated')).toBe(true);
	});
});
