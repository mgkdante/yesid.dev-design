import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cardParallax } from './cardParallax.js';

// Slice-23 Task 6. `cardParallax` is a Svelte action that tracks cursor
// position inside a card and writes two CSS custom properties:
//   --parallax-x, --parallax-y  (clamped pixel offsets, ±4px max)
// Consumers wire these onto inner elements via `transform: translate(...)`
// for a subtle in-card micro-parallax effect. No-op under
// prefers-reduced-motion and on touch-only devices.

describe('motion/actions/cardParallax', () => {
	let node: HTMLElement;

	beforeEach(() => {
		node = document.createElement('div');
		document.body.appendChild(node);
		// Default matchMedia stub: hover-capable, reduced-motion off.
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

	function stubRect(el: HTMLElement, rect: Partial<DOMRect>) {
		const defaults: DOMRect = {
			left: 0,
			top: 0,
			width: 100,
			height: 100,
			right: 100,
			bottom: 100,
			x: 0,
			y: 0,
			toJSON: () => '',
		};
		Object.defineProperty(el, 'getBoundingClientRect', {
			value: () => ({ ...defaults, ...rect }),
			configurable: true,
		});
	}

	it('sets --parallax-x / --parallax-y on pointermove (centered cursor = 0)', () => {
		stubRect(node, { width: 100, height: 100 });
		const action = cardParallax(node);
		node.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50 }));
		// Cursor centered → relX=0, relY=0 → offsets clamp to 0px.
		expect(node.style.getPropertyValue('--parallax-x')).toBe('0.00px');
		expect(node.style.getPropertyValue('--parallax-y')).toBe('0.00px');
		action.destroy?.();
	});

	it('clamps offsets to ±4px at the corners', () => {
		stubRect(node, { width: 100, height: 100 });
		const action = cardParallax(node);
		// Top-left corner: relX=-1, relY=-1 → offsets = -4px each.
		node.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 0 }));
		expect(node.style.getPropertyValue('--parallax-x')).toBe('-4.00px');
		expect(node.style.getPropertyValue('--parallax-y')).toBe('-4.00px');
		// Bottom-right corner: relX=+1, relY=+1 → offsets = +4px each.
		node.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 100 }));
		expect(node.style.getPropertyValue('--parallax-x')).toBe('4.00px');
		expect(node.style.getPropertyValue('--parallax-y')).toBe('4.00px');
		action.destroy?.();
	});

	it('resets vars to 0px on pointerleave', () => {
		stubRect(node, { width: 100, height: 100 });
		const action = cardParallax(node);
		node.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 100 }));
		expect(node.style.getPropertyValue('--parallax-x')).toBe('4.00px');
		node.dispatchEvent(new PointerEvent('pointerleave'));
		expect(node.style.getPropertyValue('--parallax-x')).toBe('0px');
		expect(node.style.getPropertyValue('--parallax-y')).toBe('0px');
		action.destroy?.();
	});

	it('no-op under prefers-reduced-motion', () => {
		window.matchMedia = vi.fn().mockImplementation((query: string) => ({
			matches:
				query === '(prefers-reduced-motion: reduce)' || query === '(hover: hover)',
			media: query,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		})) as unknown as typeof window.matchMedia;
		stubRect(node, { width: 100, height: 100 });
		const action = cardParallax(node);
		node.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50 }));
		expect(node.style.getPropertyValue('--parallax-x')).toBe('');
		expect(() => action.destroy?.()).not.toThrow();
	});

	it('no-op on touch-only devices', () => {
		window.matchMedia = vi.fn().mockImplementation((query: string) => ({
			matches: false,
			media: query,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		})) as unknown as typeof window.matchMedia;
		stubRect(node, { width: 100, height: 100 });
		const action = cardParallax(node);
		node.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50 }));
		expect(node.style.getPropertyValue('--parallax-x')).toBe('');
		expect(() => action.destroy?.()).not.toThrow();
	});
});
