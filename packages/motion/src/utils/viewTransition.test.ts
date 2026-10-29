import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPrefersReducedMotion } from '../stores/reducedMotion.js';
import { viewTransition } from './viewTransition.js';

vi.mock('../stores/reducedMotion.js', () => ({
	isPrefersReducedMotion: vi.fn(() => false),
}));

describe('viewTransition', () => {
	const navigation = {
		from: { url: new URL('https://example.com/from') },
		to: { url: new URL('https://example.com/to') },
		complete: Promise.resolve(),
	};
	const original = Object.getOwnPropertyDescriptor(document, 'startViewTransition');
	const start = vi.fn((callback: () => Promise<void>) => {
		void callback();
		return { ready: Promise.reject(new DOMException('Transition was skipped', 'AbortError')) };
	});

	beforeEach(() => {
		start.mockClear();
		vi.mocked(isPrefersReducedMotion).mockReturnValue(false);
		Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true });
	});

	afterEach(() => {
		if (original) Object.defineProperty(document, 'startViewTransition', original);
		else Reflect.deleteProperty(document, 'startViewTransition');
	});

	it('returns undefined without the View Transitions API', () => {
		Object.defineProperty(document, 'startViewTransition', { value: undefined });
		expect(viewTransition(navigation)).toBeUndefined();
	});

	it('returns undefined under reduced motion', () => {
		vi.mocked(isPrefersReducedMotion).mockReturnValue(true);
		expect(viewTransition(navigation)).toBeUndefined();
		expect(start).not.toHaveBeenCalled();
	});

	it('returns undefined for same-path navigation', () => {
		expect(viewTransition({
			...navigation,
			to: { url: new URL('https://example.com/from?query=changed#section') },
		})).toBeUndefined();
		expect(start).not.toHaveBeenCalled();
	});

	it('starts a transition and resolves the navigation promise', async () => {
		await expect(viewTransition(navigation)).resolves.toBeUndefined();
		expect(start).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
	});
});
