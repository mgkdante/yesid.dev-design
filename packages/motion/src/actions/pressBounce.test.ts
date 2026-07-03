import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pressBounce } from './pressBounce';

// Mock GSAP to assert calls without running animation
vi.mock('$lib/motion/utils/gsap', () => ({
	gsap: {
		to: vi.fn(),
		killTweensOf: vi.fn(),
	},
}));

// Mock device + reduced-motion
const mockIsTouchDevice = vi.fn();
const mockIsPrefersReducedMotion = vi.fn();
vi.mock('$lib/motion/utils/device', () => ({
	isTouchDevice: () => mockIsTouchDevice(),
}));
vi.mock('$lib/motion/stores/reducedMotion', () => ({
	isPrefersReducedMotion: () => mockIsPrefersReducedMotion(),
}));

describe('pressBounce action', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockIsTouchDevice.mockReturnValue(true);
		mockIsPrefersReducedMotion.mockReturnValue(false);
	});

	it('attaches pointerdown + pointerup + pointercancel listeners on touch device', () => {
		const el = document.createElement('button');
		const addSpy = vi.spyOn(el, 'addEventListener');
		pressBounce(el);
		expect(addSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
		expect(addSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
		expect(addSpy).toHaveBeenCalledWith('pointercancel', expect.any(Function));
	});

	it('bails on non-touch device (no listeners attached)', () => {
		mockIsTouchDevice.mockReturnValue(false);
		const el = document.createElement('button');
		const addSpy = vi.spyOn(el, 'addEventListener');
		pressBounce(el);
		expect(addSpy).not.toHaveBeenCalled();
	});

	it('STAYS ACTIVE under prefers-reduced-motion (slice-23 operator policy)', () => {
		// <200ms scale feedback on user action isn't a vestibular trigger.
		// Operator chose to keep pressBounce active under reduced motion.
		mockIsPrefersReducedMotion.mockReturnValue(true);
		mockIsTouchDevice.mockReturnValue(true);
		const el = document.createElement('button');
		const addSpy = vi.spyOn(el, 'addEventListener');
		pressBounce(el);
		expect(addSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
		expect(addSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
		expect(addSpy).toHaveBeenCalledWith('pointercancel', expect.any(Function));
	});

	it('destroy() removes listeners', () => {
		const el = document.createElement('button');
		const removeSpy = vi.spyOn(el, 'removeEventListener');
		const result = pressBounce(el);
		result.destroy();
		expect(removeSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
		expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
		expect(removeSpy).toHaveBeenCalledWith('pointercancel', expect.any(Function));
	});

	it('on pointerdown, calls gsap.to with scale 0.94 + power2.out ease', async () => {
		const { gsap: mockedGsap } = await import('$lib/motion/utils/gsap');
		const el = document.createElement('button');
		pressBounce(el);

		el.dispatchEvent(new Event('pointerdown'));

		expect(mockedGsap.to).toHaveBeenCalledWith(
			el,
			expect.objectContaining({
				scale: 0.94,
				ease: 'power2.out',
			})
		);
	});

	it('on pointerup, calls gsap.to with scale 1 + back.out(2) ease', async () => {
		const { gsap: mockedGsap } = await import('$lib/motion/utils/gsap');
		const el = document.createElement('button');
		pressBounce(el);

		el.dispatchEvent(new Event('pointerup'));

		expect(mockedGsap.to).toHaveBeenCalledWith(
			el,
			expect.objectContaining({
				scale: 1,
				ease: 'back.out(2)',
			})
		);
	});

	it('on pointercancel, calls gsap.to with the release animation (same as pointerup)', async () => {
		const { gsap: mockedGsap } = await import('$lib/motion/utils/gsap');
		const el = document.createElement('button');
		pressBounce(el);

		el.dispatchEvent(new Event('pointercancel'));

		expect(mockedGsap.to).toHaveBeenCalledWith(
			el,
			expect.objectContaining({
				scale: 1,
				ease: 'back.out(2)',
			})
		);
	});
});
