import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cursorGlow } from './cursorGlow.js';

// Mock reduced-motion store
vi.mock('../stores/reducedMotion.js', () => ({
	isPrefersReducedMotion: vi.fn(() => false)
}));

describe('cursorGlow', () => {
	let node: HTMLDivElement;

	beforeEach(() => {
		node = document.createElement('div');
		vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({
			left: 0, top: 0, width: 200, height: 100,
			right: 200, bottom: 100, x: 0, y: 0, toJSON: () => {}
		});
	});

	it('sets --glow-x and --glow-y on pointermove', () => {
		const action = cursorGlow(node);
		const event = new PointerEvent('pointermove', { clientX: 150, clientY: 40 });
		node.dispatchEvent(event);
		expect(node.style.getPropertyValue('--glow-x')).toBe('150px');
		expect(node.style.getPropertyValue('--glow-y')).toBe('40px');
		action.destroy();
	});

	it('resets CSS vars on pointerleave', () => {
		const action = cursorGlow(node);
		node.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 50 }));
		node.dispatchEvent(new PointerEvent('pointerleave'));
		expect(node.style.getPropertyValue('--glow-x')).toBe('');
		expect(node.style.getPropertyValue('--glow-y')).toBe('');
		action.destroy();
	});

	it('returns no-op on touch devices', () => {
		Object.defineProperty(navigator, 'maxTouchPoints', { value: 1, configurable: true });
		const action = cursorGlow(node);
		node.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50 }));
		expect(node.style.getPropertyValue('--glow-x')).toBe('');
		action.destroy();
		Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
	});

	it('GO-w2t5 retier: stays ACTIVE under reduced motion (SAFE-ALWAYS — opacity-only light)', async () => {
		const { isPrefersReducedMotion } = await import('../stores/reducedMotion.js');
		(isPrefersReducedMotion as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
		const action = cursorGlow(node);
		node.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50 }));
		expect(node.style.getPropertyValue('--glow-x')).toBe('50px');
		action.destroy();
	});
});
