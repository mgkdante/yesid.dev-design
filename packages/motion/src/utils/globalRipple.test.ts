import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initGlobalRipple } from './globalRipple.js';

describe('motion/utils/globalRipple', () => {
	let dispose: (() => void) | undefined;

	beforeEach(() => {
		vi.useFakeTimers();
		document.body.replaceChildren();
	});

	afterEach(() => {
		dispose?.();
		dispose = undefined;
		document.body.replaceChildren();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('spawns the two ripple rings at the pointer coordinates', () => {
		dispose = initGlobalRipple();

		window.dispatchEvent(
			new PointerEvent('pointerdown', { clientX: 123, clientY: 456 }),
		);

		expect(document.body.children).toHaveLength(2);
		const [outer, inner] = [...document.body.children] as HTMLElement[];
		expect(outer.className).toBe('global-ripple');
		expect(outer.style.left).toBe('123px');
		expect(outer.style.top).toBe('456px');
		expect(inner.className).toBe('global-ripple-inner');
		expect(inner.style.left).toBe('123px');
		expect(inner.style.top).toBe('456px');
	});

	it('removes the inner ring at 800ms and the outer ring at 1200ms', () => {
		dispose = initGlobalRipple();
		window.dispatchEvent(new PointerEvent('pointerdown'));

		vi.advanceTimersByTime(799);
		expect(document.querySelector('.global-ripple-inner')).not.toBeNull();
		expect(document.querySelector('.global-ripple')).not.toBeNull();

		vi.advanceTimersByTime(1);
		expect(document.querySelector('.global-ripple-inner')).toBeNull();
		expect(document.querySelector('.global-ripple')).not.toBeNull();

		vi.advanceTimersByTime(400);
		expect(document.querySelector('.global-ripple')).toBeNull();
	});

	it('registers the pointer listener as passive', () => {
		const addEventListener = vi.spyOn(window, 'addEventListener');

		dispose = initGlobalRipple();

		expect(addEventListener).toHaveBeenCalledWith(
			'pointerdown',
			expect.any(Function),
			{ passive: true },
		);
	});

	it('disposer removes the listener and prevents later ripples', () => {
		const removeEventListener = vi.spyOn(window, 'removeEventListener');
		dispose = initGlobalRipple();

		window.dispatchEvent(
			new PointerEvent('pointerdown', { clientX: 10, clientY: 20 }),
		);
		expect(document.querySelectorAll('.global-ripple, .global-ripple-inner')).toHaveLength(2);

		dispose();
		dispose = undefined;
		expect(removeEventListener).toHaveBeenCalledWith(
			'pointerdown',
			expect.any(Function),
		);

		window.dispatchEvent(new PointerEvent('pointerdown'));
		expect(document.querySelectorAll('.global-ripple, .global-ripple-inner')).toHaveLength(2);

		vi.advanceTimersByTime(800);
		expect(document.querySelector('.global-ripple-inner')).toBeNull();
		expect(document.querySelector('.global-ripple')).not.toBeNull();

		vi.advanceTimersByTime(400);
		expect(document.querySelector('.global-ripple')).toBeNull();
	});

	it('evaluates the exclusion selector against the live target on every event', () => {
		const excludedSurface = document.createElement('div');
		const target = document.createElement('button');
		excludedSurface.appendChild(target);
		document.body.appendChild(excludedSurface);
		dispose = initGlobalRipple({ exclude: '[data-ripple-excluded]' });

		target.dispatchEvent(
			new PointerEvent('pointerdown', {
				bubbles: true,
				clientX: 20,
				clientY: 30,
			}),
		);
		expect(document.querySelectorAll('.global-ripple, .global-ripple-inner')).toHaveLength(2);

		excludedSurface.dataset.rippleExcluded = '';
		target.dispatchEvent(
			new PointerEvent('pointerdown', {
				bubbles: true,
				clientX: 40,
				clientY: 50,
			}),
		);
		expect(document.querySelectorAll('.global-ripple, .global-ripple-inner')).toHaveLength(2);

		delete excludedSurface.dataset.rippleExcluded;
		target.dispatchEvent(
			new PointerEvent('pointerdown', {
				bubbles: true,
				clientX: 60,
				clientY: 70,
			}),
		);
		expect(document.querySelectorAll('.global-ripple, .global-ripple-inner')).toHaveLength(4);
	});

	it('returns a no-op disposer during SSR', () => {
		const originalWindow = globalThis.window;
		// @ts-expect-error — simulating SSR
		delete globalThis.window;

		try {
			const ssrDispose = initGlobalRipple();
			expect(ssrDispose).toBeTypeOf('function');
			expect(() => ssrDispose()).not.toThrow();
		} finally {
			globalThis.window = originalWindow;
		}
	});
});
