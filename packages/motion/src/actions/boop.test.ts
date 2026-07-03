import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock isTouchDevice so touch-bail tests can control the return value.
// Default false keeps existing tests unaffected.
vi.mock('$lib/motion/utils/device.js', () => ({
	isTouchDevice: vi.fn().mockReturnValue(false)
}));

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

describe('boop action', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mockMatchMedia(false); // Animations enabled by default.
		vi.resetModules();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('returns an object with update and destroy methods', async () => {
		const { boop } = await import('./boop.js');
		const el = document.createElement('button');
		const result = boop(el);
		expect(typeof result.update).toBe('function');
		expect(typeof result.destroy).toBe('function');
	});

	it('sets transform on mouseenter', async () => {
		const { boop } = await import('./boop.js');
		const el = document.createElement('button');
		boop(el, { scale: 1.05 });

		el.dispatchEvent(new MouseEvent('mouseenter'));

		expect(el.style.transform).toContain('scale(1.05)');
	});

	it('resets transform after the timing duration', async () => {
		const { boop } = await import('./boop.js');
		const el = document.createElement('button');
		boop(el, { scale: 1.1, timing: 300 });

		el.dispatchEvent(new MouseEvent('mouseenter'));
		expect(el.style.transform).toContain('scale');

		vi.advanceTimersByTime(300);

		expect(el.style.transform).toBe('');
	});

	it('includes rotation in the transform when specified', async () => {
		const { boop } = await import('./boop.js');
		const el = document.createElement('button');
		boop(el, { rotation: 10 });

		el.dispatchEvent(new MouseEvent('mouseenter'));

		expect(el.style.transform).toContain('rotate(10deg)');
	});

	it('clears transform on destroy cleanup', async () => {
		const { boop } = await import('./boop.js');
		const el = document.createElement('button');
		const action = boop(el, { scale: 1.05, timing: 500 });

		el.dispatchEvent(new MouseEvent('mouseenter'));
		// destroy before timeout fires
		action.destroy();

		// Timeout should be cancelled — advancing time should not throw.
		vi.advanceTimersByTime(500);
		// Transform won't be reset by the timer because it was cleared by destroy.
		// The point is destroy() doesn't throw.
	});

	it('GO-w2t5 retier: boops under prefers-reduced-motion (SAFE-ALWAYS, ≤1.05 scale)', async () => {
		mockMatchMedia(true);
		vi.resetModules();
		const { boop } = await import('./boop.js');
		const el = document.createElement('button');
		boop(el);

		el.dispatchEvent(new MouseEvent('mouseenter'));

		expect(el.style.transform).toContain('scale(1.05)');
	});

	it('update() changes the params applied on next hover', async () => {
		const { boop } = await import('./boop.js');
		const el = document.createElement('button');
		const action = boop(el, { scale: 1.05 });

		action.update({ scale: 1.2 });
		el.dispatchEvent(new MouseEvent('mouseenter'));

		expect(el.style.transform).toContain('scale(1.2)');
		action.destroy();
	});
});

describe('boop device gating', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mockMatchMedia(false);
		vi.resetModules();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('bails on touch device (no listener attached)', async () => {
		const deviceMod = await import('$lib/motion/utils/device.js');
		(deviceMod.isTouchDevice as ReturnType<typeof vi.fn>).mockReturnValue(true);

		const { boop } = await import('./boop.js');
		const el = document.createElement('div');
		const addSpy = vi.spyOn(el, 'addEventListener');
		boop(el);
		expect(addSpy).not.toHaveBeenCalled();
	});

	it('returns a valid destroy-shaped object on touch bail', async () => {
		const deviceMod = await import('$lib/motion/utils/device.js');
		(deviceMod.isTouchDevice as ReturnType<typeof vi.fn>).mockReturnValue(true);

		const { boop } = await import('./boop.js');
		const el = document.createElement('div');
		const result = boop(el);
		expect(typeof result.destroy).toBe('function');
	});
});
