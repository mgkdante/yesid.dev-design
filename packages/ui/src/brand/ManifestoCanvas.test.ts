import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleHeader from '../layout/ArticleHeader.svelte';
import ManifestoCanvas from './ManifestoCanvas.svelte';

const ticker = vi.hoisted(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn() }));
const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('@yesid/motion/utils/ticker', () => ticker);
vi.mock('@yesid/motion/stores/reducedMotion', () => ({
	isPrefersReducedMotion: () => motion.reduced,
}));

class IntersectionObserverStub {
	observe = vi.fn();
	disconnect = vi.fn();
	unobserve = vi.fn();
}
const resizeObservers: ResizeObserverStub[] = [];
class ResizeObserverStub {
	observe = vi.fn();
	disconnect = vi.fn();
	unobserve = vi.fn();
	constructor(private readonly callback: ResizeObserverCallback) {
		resizeObservers.push(this);
	}
	trigger() { this.callback([], this as unknown as ResizeObserver); }
}
const context = {
	clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
	moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
	fillStyle: '', strokeStyle: '', lineWidth: 1,
} as unknown as CanvasRenderingContext2D;

function host() {
	const node = document.createElement('div');
	node.getBoundingClientRect = () => new DOMRect(0, 0, 320, 240);
	document.body.append(node);
	return node;
}

beforeEach(() => {
	vi.clearAllMocks();
	motion.reduced = false;
	resizeObservers.length = 0;
	vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);
	vi.stubGlobal('ResizeObserver', ResizeObserverStub);
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

describe('ManifestoCanvas', () => {
	it('gives simultaneous canvases independent ticker subscriptions and cleanup', async () => {
		const first = render(ManifestoCanvas, { props: { containerEl: host() } });
		const second = render(ManifestoCanvas, { props: { containerEl: host() } });
		expect(ticker.subscribe).toHaveBeenCalledTimes(2);
		const firstId = ticker.subscribe.mock.calls[0][0];
		const secondId = ticker.subscribe.mock.calls[1][0];
		expect(firstId).not.toBe(secondId);
		await first.unmount();
		expect(ticker.unsubscribe).toHaveBeenCalledExactlyOnceWith(firstId);
		expect(ticker.unsubscribe).not.toHaveBeenCalledWith(secondId);
		await second.unmount();
		expect(ticker.unsubscribe).toHaveBeenCalledTimes(2);
		expect(ticker.unsubscribe).toHaveBeenLastCalledWith(secondId);
	});

	it('resizes its static bitmap under reduced motion without a ticker subscription', () => {
		motion.reduced = true;
		const containerEl = host();
		const view = render(ManifestoCanvas, { props: { containerEl } });
		const canvas = view.getByTestId('manifesto-canvas') as HTMLCanvasElement;
		resizeObservers[0].trigger();
		expect(canvas.width).toBe(320);
		expect(canvas.height).toBe(240);
		containerEl.getBoundingClientRect = () => new DOMRect(0, 0, 480, 360);
		resizeObservers[0].trigger();
		expect(canvas.width).toBe(480);
		expect(canvas.height).toBe(360);
		expect(ticker.subscribe).not.toHaveBeenCalled();
	});

	it('hides every rendered element from assistive technology', () => {
		const view = render(ManifestoCanvas);
		for (const element of view.container.children) {
			expect(element.getAttribute('aria-hidden')).toBe('true');
		}
	});

	it('subscribes once after ArticleHeader binds its host and releases that subscription', async () => {
		const view = render(ArticleHeader, { props: { title: 'Report', backHref: '/', backLabel: 'Back' } });
		await tick();
		expect(ticker.subscribe).toHaveBeenCalledTimes(1);
		const id = ticker.subscribe.mock.calls[0][0];
		expect(ticker.unsubscribe).not.toHaveBeenCalled();
		await view.unmount();
		expect(ticker.unsubscribe).toHaveBeenCalledExactlyOnceWith(id);
	});
});
