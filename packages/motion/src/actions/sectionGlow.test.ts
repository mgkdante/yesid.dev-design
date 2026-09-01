import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sectionGlow } from './sectionGlow.js';

// `sectionGlow` tracks cursor proximity inside a section via CSS custom
// properties (--glow-x / --glow-y /
// --glow-opacity). Consumers paint a radial gradient using those vars in a
// background layer (e.g. `::before`). Action is a no-op on touch-only
// devices and SAFE-ALWAYS under reduced motion.

describe('motion/actions/sectionGlow', () => {
	let node: HTMLElement;

	beforeEach(() => {
		node = document.createElement('section');
		document.body.appendChild(node);
		// Default matchMedia stub: hover-capable, reduced-motion off.
		// Individual tests can override to exercise the no-op branches.
		window.matchMedia = vi.fn().mockImplementation((query: string) => ({
			matches: query === '(hover: hover)',
			media: query,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		})) as unknown as typeof window.matchMedia;
	});

	afterEach(() => {
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	it('sets --glow-x / --glow-y / --glow-opacity on pointermove', () => {
		const action = sectionGlow(node);
		Object.defineProperty(node, 'getBoundingClientRect', {
			value: () => ({
				left: 0,
				top: 0,
				width: 200,
				height: 100,
				right: 200,
				bottom: 100,
				x: 0,
				y: 0,
				toJSON: () => '',
			}),
		});
		node.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 50 }));
		expect(node.style.getPropertyValue('--glow-x')).toBe('50%');
		expect(node.style.getPropertyValue('--glow-y')).toBe('50%');
		expect(node.style.getPropertyValue('--glow-opacity')).toBe('1');
		action.destroy?.();
	});

	it('fades --glow-opacity to 0 after pointerleave (debounced)', () => {
		vi.useFakeTimers();
		const action = sectionGlow(node);
		node.style.setProperty('--glow-opacity', '1');
		node.dispatchEvent(new PointerEvent('pointerleave'));
		vi.advanceTimersByTime(250);
		expect(node.style.getPropertyValue('--glow-opacity')).toBe('0');
		action.destroy?.();
		vi.useRealTimers();
	});

	it('stays active under prefers-reduced-motion as a SAFE-ALWAYS alpha-only glow', () => {
		// Reduce ON and hover-capable: the action must still wire up.
		window.matchMedia = vi.fn().mockImplementation((query: string) => ({
			matches:
				query === '(prefers-reduced-motion: reduce)' || query === '(hover: hover)',
			media: query,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		})) as unknown as typeof window.matchMedia;
		const action = sectionGlow(node);
		Object.defineProperty(node, 'getBoundingClientRect', {
			value: () => ({
				left: 0, top: 0, width: 200, height: 100,
				right: 200, bottom: 100, x: 0, y: 0, toJSON: () => '',
			}),
		});
		node.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 50 }));
		expect(node.style.getPropertyValue('--glow-x')).toBe('50%');
		expect(node.style.getPropertyValue('--glow-opacity')).toBe('1');
		action.destroy?.();
	});

	it('no-op on touch-only devices (no hover capability)', () => {
		// Flip matchMedia: no hover.
		window.matchMedia = vi.fn().mockImplementation((query: string) => ({
			matches: false,
			media: query,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		})) as unknown as typeof window.matchMedia;
		const action = sectionGlow(node);
		node.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 50 }));
		expect(node.style.getPropertyValue('--glow-x')).toBe('');
		expect(() => action.destroy?.()).not.toThrow();
	});
});
