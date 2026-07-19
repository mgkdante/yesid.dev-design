import { beforeEach, describe, expect, it, vi } from 'vitest';

type TickerModule = typeof import('./ticker.js');
type GsapModule = typeof import('gsap');

describe('motion/utils/ticker', () => {
	let internalCallback: Parameters<GsapModule['gsap']['ticker']['add']>[0] | null = null;
	let gsap: GsapModule['gsap'];
	let ticker: TickerModule;

	beforeEach(async () => {
		internalCallback = null;
		vi.restoreAllMocks();
		vi.clearAllMocks();
		vi.resetModules();
		({ gsap } = await import('gsap'));
		vi.spyOn(gsap.ticker, 'add').mockImplementation((callback) => {
			internalCallback = callback;
			return callback;
		});
		ticker = await import('./ticker.js');
	});

	it('registers one GSAP ticker callback for many subscribers', () => {
		for (let index = 0; index < 10; index += 1) {
			ticker.subscribe(`many-${index}`, vi.fn());
		}

		expect(gsap.ticker.add).toHaveBeenCalledTimes(1);
	});

	it('fans every frame out to all subscribers', () => {
		const first = vi.fn();
		const second = vi.fn();
		ticker.subscribe('first', first);
		ticker.subscribe('second', second);

		internalCallback?.(1, 16.67, 1, 16.67);

		expect(first).toHaveBeenCalledWith(1, 16.67);
		expect(second).toHaveBeenCalledWith(1, 16.67);
	});

	it('replaces a duplicate id with the latest callback', () => {
		const first = vi.fn();
		const replacement = vi.fn();
		ticker.subscribe('same', first);
		ticker.subscribe('same', replacement);

		internalCallback?.(2, 16.67, 2, 16.67);

		expect(first).not.toHaveBeenCalled();
		expect(replacement).toHaveBeenCalledWith(2, 16.67);
	});

	it('supports explicit unsubscribe', () => {
		const callback = vi.fn();
		ticker.subscribe('explicit', callback);

		ticker.unsubscribe('explicit');
		internalCallback?.(3, 16.67, 3, 16.67);

		expect(callback).not.toHaveBeenCalled();
	});

	it('returns a disposer that unsubscribes the id', () => {
		const callback = vi.fn();
		const dispose = ticker.subscribe('disposed', callback);

		dispose();
		internalCallback?.(3, 16.67, 3, 16.67);

		expect(callback).not.toHaveBeenCalled();
	});
});
