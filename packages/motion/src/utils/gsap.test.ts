import { describe, it, expect, vi, beforeEach } from 'vitest';

// gsap and its plugins are mocked globally in src/__tests__/setup.ts.
// This test file validates our registration wrappers, not GSAP itself.
//
// DEVIATION MOTION-1 (2026-07-02): the yesid.dev source test also covered the
// MorphSVGPlugin re-export and the lazy loaders (loadDrawSVG/loadMorphSVG/
// loadFlip/loadCustomEase) — those were pruned together with the code they
// tested (see utils/gsap.ts header). Everything kept is byte-equivalent.

describe('initScrollTriggerConfig', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it('registers ScrollTrigger and applies config on first call', async () => {
		const { gsap } = await import('gsap');
		const { initScrollTriggerConfig } = await import('./gsap.js');
		const { ScrollTrigger } = await import('gsap/ScrollTrigger');

		initScrollTriggerConfig();

		expect(gsap.registerPlugin).toHaveBeenCalledWith(ScrollTrigger);
		expect(ScrollTrigger.config).toHaveBeenCalledWith({ ignoreMobileResize: true });
	});

	it('is idempotent — calling twice only registers once', async () => {
		const { gsap } = await import('gsap');
		const { initScrollTriggerConfig } = await import('./gsap.js');

		initScrollTriggerConfig();
		initScrollTriggerConfig();

		expect(gsap.registerPlugin).toHaveBeenCalledTimes(1);
	});
});

describe('ensureSplitTextRegistered', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it('registers SplitText synchronously', async () => {
		const { gsap } = await import('gsap');
		const { ensureSplitTextRegistered } = await import('./gsap.js');
		const { SplitText } = await import('gsap/SplitText');

		ensureSplitTextRegistered();

		expect(gsap.registerPlugin).toHaveBeenCalledWith(SplitText);
	});

	it('is idempotent', async () => {
		const { gsap } = await import('gsap');
		const { ensureSplitTextRegistered } = await import('./gsap.js');

		ensureSplitTextRegistered();
		ensureSplitTextRegistered();

		expect(gsap.registerPlugin).toHaveBeenCalledTimes(1);
	});
});

describe('re-exports', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('re-exports gsap', async () => {
		const { gsap } = await import('./gsap.js');
		expect(gsap).toBeDefined();
	});

	it('re-exports ScrollTrigger', async () => {
		const { ScrollTrigger } = await import('./gsap.js');
		expect(ScrollTrigger).toBeDefined();
	});

	it('re-exports SplitText', async () => {
		const { SplitText } = await import('./gsap.js');
		expect(SplitText).toBeDefined();
	});
});
