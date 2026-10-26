// go2 nested-scroll fix — scrollChain owns the data-lenis-prevent toggle AND
// must cancel an in-flight Lenis ease the moment a card claims a wheel event
// (otherwise the page glides under the card while it tries to unwind).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scrollChain } from './scrollChain.js';

interface MockLenis {
	isScrolling: boolean | 'native' | 'smooth';
	scroll: number;
	scrollTo: ReturnType<typeof vi.fn>;
}

let mockLenis: MockLenis | null = null;

vi.mock('../utils/lenis.js', () => ({
	getLenis: () => mockLenis,
}));

function makeNode({
	scrollTop = 0,
	scrollHeight = 600,
	clientHeight = 200,
}: { scrollTop?: number; scrollHeight?: number; clientHeight?: number } = {}): HTMLElement {
	const node = document.createElement('div');
	Object.defineProperties(node, {
		scrollTop: { value: scrollTop, writable: true, configurable: true },
		scrollHeight: { value: scrollHeight, writable: true, configurable: true },
		clientHeight: { value: clientHeight, writable: true, configurable: true },
	});
	return node;
}

function wheel(node: HTMLElement, deltaY: number, deltaX = 0): void {
	node.dispatchEvent(new WheelEvent('wheel', { deltaY, deltaX }));
}

describe('motion/actions/scrollChain', () => {
	beforeEach(() => {
		mockLenis = {
			isScrolling: false,
			scroll: 1234.5,
			scrollTo: vi.fn(),
		};
	});

	it('sets data-lenis-prevent at mount when the node overflows', () => {
		const node = makeNode();
		scrollChain(node);
		expect(node.hasAttribute('data-lenis-prevent')).toBe(true);
	});

	it('mid-scroll wheel keeps the card owning the event (attribute stays)', () => {
		const node = makeNode({ scrollTop: 100 });
		scrollChain(node);
		wheel(node, 120);
		expect(node.hasAttribute('data-lenis-prevent')).toBe(true);
	});

	it('at-bottom wheel-down chains to the page (attribute removed, no cancel)', () => {
		const node = makeNode({ scrollTop: 400 }); // 400 + 200 = 600 = scrollHeight
		scrollChain(node);
		wheel(node, 120);
		expect(node.hasAttribute('data-lenis-prevent')).toBe(false);
		expect(mockLenis!.scrollTo).not.toHaveBeenCalled();
	});

	it('at-top wheel-up chains to the page (attribute removed, no cancel)', () => {
		const node = makeNode({ scrollTop: 0 });
		scrollChain(node);
		wheel(node, -120);
		expect(node.hasAttribute('data-lenis-prevent')).toBe(false);
		expect(mockLenis!.scrollTo).not.toHaveBeenCalled();
	});

	it('THE BUG: at-bottom wheel-up re-claims the card and freezes a mid-ease Lenis', () => {
		mockLenis!.isScrolling = 'smooth'; // residual glide from the boundary handoff
		const node = makeNode({ scrollTop: 400 });
		scrollChain(node);
		wheel(node, -120);
		expect(node.hasAttribute('data-lenis-prevent')).toBe(true);
		expect(mockLenis!.scrollTo).toHaveBeenCalledWith(1234.5, {
			immediate: true,
			programmatic: true,
		});
	});

	it('claim with idle Lenis does not touch scrollTo', () => {
		mockLenis!.isScrolling = false;
		const node = makeNode({ scrollTop: 100 });
		scrollChain(node);
		wheel(node, -120);
		expect(mockLenis!.scrollTo).not.toHaveBeenCalled();
	});

	it('claim during native scrolling (isScrolling="native") does not touch scrollTo', () => {
		mockLenis!.isScrolling = 'native';
		const node = makeNode({ scrollTop: 100 });
		scrollChain(node);
		wheel(node, -120);
		expect(mockLenis!.scrollTo).not.toHaveBeenCalled();
	});

	it('no Lenis (reduced motion / touch): toggle still works, nothing throws', () => {
		mockLenis = null;
		const node = makeNode({ scrollTop: 100 });
		scrollChain(node);
		expect(() => wheel(node, -120)).not.toThrow();
		expect(node.hasAttribute('data-lenis-prevent')).toBe(true);
	});

	it('horizontal-dominant gesture passes through to Lenis (no claim, no cancel)', () => {
		mockLenis!.isScrolling = 'smooth';
		const node = makeNode({ scrollTop: 100 });
		scrollChain(node);
		wheel(node, 10, 120);
		expect(node.hasAttribute('data-lenis-prevent')).toBe(false);
		expect(mockLenis!.scrollTo).not.toHaveBeenCalled();
	});

	it('no vertical overflow: events pass through untouched', () => {
		mockLenis!.isScrolling = 'smooth';
		const node = makeNode({ scrollHeight: 200, clientHeight: 200 });
		scrollChain(node);
		wheel(node, 120);
		expect(node.hasAttribute('data-lenis-prevent')).toBe(false);
		expect(mockLenis!.scrollTo).not.toHaveBeenCalled();
	});

	it('destroy removes the attribute and the listener', () => {
		const node = makeNode({ scrollTop: 100 });
		const action = scrollChain(node);
		action.destroy();
		expect(node.hasAttribute('data-lenis-prevent')).toBe(false);
		mockLenis!.isScrolling = 'smooth';
		wheel(node, -120);
		expect(node.hasAttribute('data-lenis-prevent')).toBe(false);
		expect(mockLenis!.scrollTo).not.toHaveBeenCalled();
	});
});
