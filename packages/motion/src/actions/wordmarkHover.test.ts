import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock isTouchDevice so touch-bail tests can control the return value
vi.mock('$lib/motion/utils/device.js', () => ({
	isTouchDevice: vi.fn().mockReturnValue(false)
}));

// Mock GSAP and SplitText since jsdom can't run them
vi.mock('$lib/motion/utils/gsap.js', () => {
	const timelineMock = {
		fromTo: vi.fn().mockReturnThis(),
		to: vi.fn().mockReturnThis(),
		set: vi.fn().mockReturnThis(),
		kill: vi.fn().mockReturnThis(),
		then: vi.fn().mockReturnThis()
	};

	// SplitText is called with `new` — must be a function (not arrow) to work as constructor
	const SplitTextMock = vi.fn(function (this: Record<string, unknown>) {
		this.chars = [document.createElement('span'), document.createElement('span')];
		this.revert = vi.fn();
	});

	return {
		gsap: {
			timeline: vi.fn(() => timelineMock),
			registerPlugin: vi.fn()
		},
		SplitText: SplitTextMock,
		initScrollTriggerConfig: vi.fn(),
		ensureSplitTextRegistered: vi.fn()
	};
});

function mockMatchMedia(matches: boolean) {
	Object.defineProperty(window, 'matchMedia', {
		writable: true,
		value: vi.fn().mockReturnValue({
			matches,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn()
		})
	});
}

describe('wordmarkHover action', () => {
	beforeEach(() => {
		mockMatchMedia(false);
		vi.clearAllMocks();
		vi.resetModules();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('returns an object with a destroy method', async () => {
		const { wordmarkHover } = await import('./wordmarkHover.js');
		const el = document.createElement('span');
		el.textContent = 'yesid';
		const dot = document.createElement('span');
		const result = wordmarkHover(el, { dotEl: dot });
		expect(typeof result.destroy).toBe('function');
	});

	it('registers GSAP plugins on mount', async () => {
		const gsapMod = await import('$lib/motion/utils/gsap.js');
		const { wordmarkHover } = await import('./wordmarkHover.js');
		const el = document.createElement('span');
		const dot = document.createElement('span');
		wordmarkHover(el, { dotEl: dot });
		// Post-17e-5 D269: registerGsapPlugins split into
		// initScrollTriggerConfig (for ScrollTrigger) and
		// ensureSplitTextRegistered (for the sync-coupled SplitText).
		expect(gsapMod.initScrollTriggerConfig).toHaveBeenCalled();
		expect(gsapMod.ensureSplitTextRegistered).toHaveBeenCalled();
	});

	it('creates a SplitText instance on the text element', async () => {
		const gsapMod = await import('$lib/motion/utils/gsap.js');
		const { wordmarkHover } = await import('./wordmarkHover.js');
		const el = document.createElement('span');
		const dot = document.createElement('span');
		wordmarkHover(el, { dotEl: dot });
		expect(gsapMod.SplitText).toHaveBeenCalledWith(el, { type: 'chars' });
	});

	it('does nothing when prefers-reduced-motion is on', async () => {
		mockMatchMedia(true);
		vi.resetModules();
		const gsapMod = await import('$lib/motion/utils/gsap.js');
		(gsapMod.SplitText as unknown as ReturnType<typeof vi.fn>).mockClear();
		const { wordmarkHover } = await import('./wordmarkHover.js');
		const el = document.createElement('span');
		const dot = document.createElement('span');
		wordmarkHover(el, { dotEl: dot });
		expect(gsapMod.SplitText).not.toHaveBeenCalled();
	});

	it('reverts SplitText on destroy', async () => {
		const gsapMod = await import('$lib/motion/utils/gsap.js');
		(gsapMod.SplitText as unknown as ReturnType<typeof vi.fn>).mockClear();
		const { wordmarkHover } = await import('./wordmarkHover.js');
		const el = document.createElement('span');
		const dot = document.createElement('span');
		const action = wordmarkHover(el, { dotEl: dot });
		action.destroy();

		const splitInstance = (gsapMod.SplitText as unknown as ReturnType<typeof vi.fn>).mock.instances[0];
		expect(splitInstance.revert).toHaveBeenCalled();
	});

	it('triggers animation on mouseenter', async () => {
		const gsapMod = await import('$lib/motion/utils/gsap.js');
		const { wordmarkHover } = await import('./wordmarkHover.js');
		const el = document.createElement('span');
		const dot = document.createElement('span');
		wordmarkHover(el, { dotEl: dot });

		el.dispatchEvent(new MouseEvent('mouseenter'));

		expect(gsapMod.gsap.timeline).toHaveBeenCalled();
	});

	it('fires autoplay only after the configured delay', async () => {
		vi.useFakeTimers();
		const gsapMod = await import('$lib/motion/utils/gsap.js');
		(gsapMod.gsap.timeline as unknown as ReturnType<typeof vi.fn>).mockClear();
		const { wordmarkHover } = await import('./wordmarkHover.js');
		const el = document.createElement('span');
		const dot = document.createElement('span');
		const action = wordmarkHover(el, {
			dotEl: dot,
			autoPlay: true,
			autoPlayDelay: 500
		});

		expect(gsapMod.gsap.timeline).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(499);
		expect(gsapMod.gsap.timeline).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(gsapMod.gsap.timeline).toHaveBeenCalledTimes(1);

		action.destroy();
		vi.useRealTimers();
	});

	it('cancels delayed autoplay when destroyed before the delay', async () => {
		vi.useFakeTimers();
		const gsapMod = await import('$lib/motion/utils/gsap.js');
		(gsapMod.gsap.timeline as unknown as ReturnType<typeof vi.fn>).mockClear();
		const { wordmarkHover } = await import('./wordmarkHover.js');
		const el = document.createElement('span');
		const dot = document.createElement('span');
		const action = wordmarkHover(el, {
			dotEl: dot,
			autoPlay: true,
			autoPlayDelay: 500
		});

		expect(vi.getTimerCount()).toBe(1);
		action.destroy();
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(500);

		expect(gsapMod.gsap.timeline).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it('kills and reverts an active action only once across repeated destroy', async () => {
		const gsapMod = await import('$lib/motion/utils/gsap.js');
		const timelineFactory = gsapMod.gsap.timeline as unknown as ReturnType<typeof vi.fn>;
		timelineFactory.mockClear();
		const splitTextFactory = gsapMod.SplitText as unknown as ReturnType<typeof vi.fn>;
		splitTextFactory.mockClear();
		const { wordmarkHover } = await import('./wordmarkHover.js');
		const el = document.createElement('span');
		const dot = document.createElement('span');
		const action = wordmarkHover(el, { dotEl: dot });

		el.dispatchEvent(new MouseEvent('mouseenter'));
		const timeline = timelineFactory.mock.results[0]?.value as {
			kill: ReturnType<typeof vi.fn>;
		};
		const splitInstance = splitTextFactory.mock.instances[0];
		action.destroy();
		action.destroy();

		expect(timeline.kill).toHaveBeenCalledTimes(1);
		expect(splitInstance.revert).toHaveBeenCalledTimes(1);
	});
});

describe('wordmarkHover device gating', () => {
	beforeEach(() => {
		mockMatchMedia(false);
		vi.clearAllMocks();
		vi.resetModules();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('bails on touch device (no DOM mutation)', async () => {
		const deviceMod = await import('$lib/motion/utils/device.js');
		(deviceMod.isTouchDevice as ReturnType<typeof vi.fn>).mockReturnValue(true);

		const { wordmarkHover } = await import('./wordmarkHover.js');
		const el = document.createElement('span');
		el.textContent = 'wordmark';
		const dot = document.createElement('span');
		const before = el.innerHTML;

		wordmarkHover(el, { dotEl: dot });

		expect(el.innerHTML).toBe(before);
	});

	it('bails on touch device (no SplitText instantiation)', async () => {
		const deviceMod = await import('$lib/motion/utils/device.js');
		(deviceMod.isTouchDevice as ReturnType<typeof vi.fn>).mockReturnValue(true);

		const gsapMod = await import('$lib/motion/utils/gsap.js');
		(gsapMod.SplitText as unknown as ReturnType<typeof vi.fn>).mockClear();

		const { wordmarkHover } = await import('./wordmarkHover.js');
		const el = document.createElement('span');
		const dot = document.createElement('span');

		wordmarkHover(el, { dotEl: dot });

		expect(gsapMod.SplitText).not.toHaveBeenCalled();
	});

	it('returns a valid destroy-shaped object on touch bail', async () => {
		const deviceMod = await import('$lib/motion/utils/device.js');
		(deviceMod.isTouchDevice as ReturnType<typeof vi.fn>).mockReturnValue(true);

		const { wordmarkHover } = await import('./wordmarkHover.js');
		const el = document.createElement('span');
		const dot = document.createElement('span');

		const result = wordmarkHover(el, { dotEl: dot });

		expect(typeof result.destroy).toBe('function');
	});
});
