import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gsap } from 'gsap';
import { _resetForTests, subscribe, unsubscribe } from './ticker.js';

describe('motion/utils/ticker', () => {
	let internalCallback: Parameters<typeof gsap.ticker.add>[0] | null = null;

	beforeEach(() => {
		_resetForTests();
		internalCallback = null;
		vi.restoreAllMocks();
		vi.clearAllMocks();
		vi.spyOn(gsap.ticker, 'add').mockImplementation((callback) => {
			internalCallback = callback;
			return callback;
		});
		vi.spyOn(gsap.ticker, 'remove').mockImplementation(() => gsap.ticker);
	});

	it('registers one GSAP ticker callback for many subscribers', () => {
		for (let index = 0; index < 10; index += 1) {
			subscribe(`many-${index}`, vi.fn());
		}

		expect(gsap.ticker.add).toHaveBeenCalledTimes(1);
	});

	it('fans every frame out to all subscribers', () => {
		const first = vi.fn();
		const second = vi.fn();
		subscribe('first', first);
		subscribe('second', second);

		internalCallback?.(1, 16.67, 1, 16.67);

		expect(first).toHaveBeenCalledWith(1, 16.67);
		expect(second).toHaveBeenCalledWith(1, 16.67);
	});

	it('replaces a duplicate id with the latest callback', () => {
		const first = vi.fn();
		const replacement = vi.fn();
		subscribe('same', first);
		subscribe('same', replacement);

		internalCallback?.(2, 16.67, 2, 16.67);

		expect(first).not.toHaveBeenCalled();
		expect(replacement).toHaveBeenCalledWith(2, 16.67);
	});

	it('supports explicit unsubscribe', () => {
		const callback = vi.fn();
		subscribe('explicit', callback);

		unsubscribe('explicit');
		internalCallback?.(3, 16.67, 3, 16.67);

		expect(callback).not.toHaveBeenCalled();
	});

	it('returns a disposer that unsubscribes the id', () => {
		const callback = vi.fn();
		const dispose = subscribe('disposed', callback);

		dispose();
		internalCallback?.(3, 16.67, 3, 16.67);

		expect(callback).not.toHaveBeenCalled();
	});

	it('reset removes the GSAP subscription and clears subscribers', () => {
		const callback = vi.fn();
		subscribe('reset-me', callback);
		const registered = internalCallback;

		_resetForTests();

		expect(gsap.ticker.remove).toHaveBeenCalledTimes(1);
		expect(gsap.ticker.remove).toHaveBeenCalledWith(registered);
		registered?.(4, 16.67, 4, 16.67);
		expect(callback).not.toHaveBeenCalled();
	});
});
