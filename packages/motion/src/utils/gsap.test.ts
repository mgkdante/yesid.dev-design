import { describe, it, expect, vi, beforeEach } from 'vitest';

// gsap and its plugins are mocked globally in src/__tests__/setup.ts.
// This test file validates our registration wrappers, not GSAP itself.

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

describe('lazy plugin loaders', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it.each([
		['loadDrawSVG', () => import('gsap/DrawSVGPlugin').then((m) => m.DrawSVGPlugin)],
		['loadMorphSVG', () => import('gsap/MorphSVGPlugin').then((m) => m.MorphSVGPlugin)],
		['loadCustomEase', () => import('gsap/CustomEase').then((m) => m.CustomEase)],
	] as const)('%s registers its plugin only on the first call', async (name, plugin) => {
		const { gsap } = await import('gsap');
		const loaders = await import('./gsap.js');
		await loaders[name]();
		expect(gsap.registerPlugin).toHaveBeenCalledExactlyOnceWith(await plugin());
		await loaders[name]();
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
