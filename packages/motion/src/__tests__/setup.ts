// Test setup for @yesid/motion — the GSAP mock block is copied byte-faithful
// from yesid.dev apps/web/src/tests/setup.dom.ts @ 2bdb611d (the motion tests
// were written against these exact mocks). Plugins this package no longer
// ships eagerly (MorphSVG/DrawSVG/CustomEase — see utils/gsap.ts deviation
// note) keep their mocks: the extracted tests never import them, and keeping
// the block whole preserves byte-fidelity of the mock contract.
import { vi } from 'vitest';

// Mock GSAP and its plugins for the happy-dom test environment.
// GSAP relies on DOM measurement APIs (getBoundingClientRect, computed styles, scroll
// position) that happy-dom does not fully support. Actions and components that use GSAP
// are tested for correct invocation, not for visual animation output — that belongs
// to Playwright E2E tests in slice 10.
vi.mock('gsap', () => {
	const mockTimeline = {
		to: vi.fn().mockReturnThis(),
		from: vi.fn().mockReturnThis(),
		fromTo: vi.fn().mockReturnThis(),
		set: vi.fn().mockReturnThis(),
		call: vi.fn().mockReturnThis(),
		progress: vi.fn().mockReturnThis(),
		kill: vi.fn(),
		pause: vi.fn().mockReturnThis(),
		duration: vi.fn(() => 0),
		// GSAP timelines expose a .then() Promise-like API. Stub it so any code
		// that calls tl.then(...) in tests (e.g. the page-load wordmark animation)
		// doesn't throw "tl.then is not a function".
		then: vi.fn((cb: () => void) => { cb(); return mockTimeline; })
	};
	return {
		gsap: {
			registerPlugin: vi.fn(),
			from: vi.fn(() => ({ kill: vi.fn() })),
			to: vi.fn(() => ({ kill: vi.fn() })),
			fromTo: vi.fn(() => ({ kill: vi.fn() })),
			set: vi.fn(),
			killTweensOf: vi.fn(),
			matchMedia: vi.fn(),
			timeline: vi.fn(() => mockTimeline),
			context: vi.fn((fn: () => void) => { fn(); return { revert: vi.fn() }; }),
			utils: {
				selector: vi.fn(() => vi.fn(() => []))
			},
			// ticker stubbed so motion/utils/ticker can subscribe/unsubscribe under test.
			// Tests that need to assert tick behavior can spyOn(gsap.ticker, 'add').
			ticker: {
				add: vi.fn(),
				remove: vi.fn(),
				lagSmoothing: vi.fn()
			},
			plugins: {}
		}
	};
});

vi.mock('gsap/ScrollTrigger', () => ({
	ScrollTrigger: {
		create: vi.fn(() => ({ kill: vi.fn() })),
		refresh: vi.fn(),
		getAll: vi.fn(() => []),
		killAll: vi.fn(),
		normalizeScroll: vi.fn(),
		config: vi.fn(),
		update: vi.fn(),
		// 0 = no touch, 1 = touch only, 2 = touch + pointer. Tests override per scenario.
		isTouch: 0
	}
}));

vi.mock('gsap/MotionPathPlugin', () => ({
	MotionPathPlugin: {}
}));

vi.mock('gsap/DrawSVGPlugin', () => ({
	DrawSVGPlugin: {}
}));

vi.mock('gsap/CustomEase', () => ({
	CustomEase: {
		create: vi.fn(() => 'custom')
	}
}));

// MorphSVGPlugin morphs SVG <path> elements. convertToPath converts basic
// SVG shapes (rect, circle, etc.) to path elements. In happy-dom we stub it
// as a no-op since there's no real SVG rendering.
vi.mock('gsap/MorphSVGPlugin', () => ({
	MorphSVGPlugin: {
		convertToPath: vi.fn((el: unknown) => [el]),
	}
}));

// SplitText splits text nodes into chars/words/lines for GSAP animation.
// Return a proper class stub so `new SplitText(...)` works in happy-dom tests.
// The real SplitText measures DOM nodes; in tests we only care that the
// interface (chars, words, lines, revert) exists, not the animation output.
vi.mock('gsap/SplitText', () => ({
	SplitText: class {
		chars: Element[] = [];
		words: Element[] = [];
		lines: Element[] = [];
		revert = vi.fn();
	}
}));
