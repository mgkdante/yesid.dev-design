import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

function mockTouchDevice(hasTouch: boolean) {
	Object.defineProperty(navigator, 'maxTouchPoints', {
		writable: true,
		configurable: true,
		value: hasTouch ? 1 : 0
	});
}

describe('magnetic action', () => {
	beforeEach(() => {
		mockMatchMedia(false);
		mockTouchDevice(false);
		vi.resetModules();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns update and destroy methods', async () => {
		const { magnetic } = await import('./magnetic.js');
		const el = document.createElement('a');
		const result = magnetic(el);
		expect(typeof result.update).toBe('function');
		expect(typeof result.destroy).toBe('function');
	});

	it('applies transform on mousemove within radius', async () => {
		const { magnetic } = await import('./magnetic.js');
		const el = document.createElement('a');
		document.body.appendChild(el);

		// Mock bounding rect at (100, 100, 50x50) — centre at (125, 125).
		vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
			left: 100,
			top: 100,
			width: 50,
			height: 50,
			right: 150,
			bottom: 150,
			x: 100,
			y: 100,
			toJSON: () => ({})
		});

		magnetic(el, { strength: 3, radius: 50 });

		// Move cursor 20px to the right of centre (within radius).
		el.dispatchEvent(new MouseEvent('mousemove', { clientX: 145, clientY: 125 }));

		expect(el.style.transform).toContain('translate');
		document.body.removeChild(el);
	});

	it('clears transform on mouseleave', async () => {
		const { magnetic } = await import('./magnetic.js');
		const el = document.createElement('a');

		vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
			left: 100, top: 100, width: 50, height: 50,
			right: 150, bottom: 150, x: 100, y: 100, toJSON: () => ({})
		});

		magnetic(el, { strength: 3, radius: 50 });
		el.dispatchEvent(new MouseEvent('mousemove', { clientX: 145, clientY: 125 }));
		el.dispatchEvent(new MouseEvent('mouseleave'));

		expect(el.style.transform).toBe('');
	});

	it('clears transform on destroy', async () => {
		const { magnetic } = await import('./magnetic.js');
		const el = document.createElement('a');

		vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
			left: 100, top: 100, width: 50, height: 50,
			right: 150, bottom: 150, x: 100, y: 100, toJSON: () => ({})
		});

		const action = magnetic(el, { strength: 3, radius: 50 });
		el.dispatchEvent(new MouseEvent('mousemove', { clientX: 145, clientY: 125 }));
		action.destroy();

		expect(el.style.transform).toBe('');
	});

	it('does nothing when reduced motion is on', async () => {
		mockMatchMedia(true);
		vi.resetModules();
		const { magnetic } = await import('./magnetic.js');
		const el = document.createElement('a');

		vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
			left: 100, top: 100, width: 50, height: 50,
			right: 150, bottom: 150, x: 100, y: 100, toJSON: () => ({})
		});

		magnetic(el);
		el.dispatchEvent(new MouseEvent('mousemove', { clientX: 145, clientY: 125 }));

		expect(el.style.transform).toBe('');
	});

	it('does nothing on touch devices', async () => {
		mockTouchDevice(true);
		vi.resetModules();
		const { magnetic } = await import('./magnetic.js');
		const el = document.createElement('a');

		vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
			left: 100, top: 100, width: 50, height: 50,
			right: 150, bottom: 150, x: 100, y: 100, toJSON: () => ({})
		});

		magnetic(el);
		el.dispatchEvent(new MouseEvent('mousemove', { clientX: 145, clientY: 125 }));

		expect(el.style.transform).toBe('');
	});
});
