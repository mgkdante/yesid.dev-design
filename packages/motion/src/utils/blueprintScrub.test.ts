import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPrefersReducedMotion } from '../stores/reducedMotion.js';
import { isViewportAtMost } from './device.js';
import { blueprintScrub } from './blueprintScrub.js';

vi.mock('../stores/reducedMotion.js', () => ({ isPrefersReducedMotion: vi.fn(() => false) }));
vi.mock('./device.js', () => ({ isViewportAtMost: vi.fn(() => false) }));

function buildBand() {
	const scroller = document.createElement('div');
	const band = document.createElement('div');
	const trigger = document.createElement('div');
	band.innerHTML = '<div class="blueprint-bg"><svg><path /></svg></div><button><svg><path /></svg></button>';
	const [artPath, iconPath] = band.querySelectorAll<SVGPathElement>('path');
	for (const path of [artPath, iconPath]) path.getTotalLength = () => 200;
	let top = 100;
	let height = 500;
	trigger.getBoundingClientRect = () => new DOMRect(0, top, 320, height);
	band.getBoundingClientRect = () => new DOMRect(0, 700, 320, 500);
	scroller.append(band, trigger);
	document.body.append(scroller);
	return { band, trigger, artPath, iconPath, scroller, setTop: (value: number) => { top = value; }, setHeight: (value: number) => { height = value; } };
}
function drawnFraction(path: SVGPathElement) {
	const [drawn, total] = path.style.strokeDasharray.split(',').map(parseFloat);
	return drawn / total;
}
let cleanup: (() => void) | undefined;
beforeEach(() => {
	vi.mocked(isPrefersReducedMotion).mockReturnValue(false);
	vi.mocked(isViewportAtMost).mockReturnValue(false);
	vi.stubGlobal('innerHeight', 1000);
});
afterEach(() => {
	cleanup?.();
	cleanup = undefined;
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

describe('blueprintScrub', () => {
	it('draws the initial trigger progress on art and leaves button icons untouched', () => {
		const { band, trigger, artPath, iconPath } = buildBand();
		cleanup = blueprintScrub(band, trigger);
		expect(cleanup).toBeTypeOf('function');
		expect(drawnFraction(artPath)).toBeCloseTo(0.6, 2);
		expect(iconPath.style.strokeDasharray).toBe('');
	});

	it('uses the trigger geometry instead of the band geometry', () => {
		const { band, trigger, artPath } = buildBand();
		cleanup = blueprintScrub(band, trigger);
		expect(drawnFraction(artPath)).toBeCloseTo(0.6, 2);
		expect(drawnFraction(artPath)).not.toBeCloseTo(0.2, 2);
	});

	it('captures a non-bubbling inner scroll and advances on the next frame', async () => {
		const { band, trigger, artPath, scroller, setTop } = buildBand();
		cleanup = blueprintScrub(band, trigger);
		setTop(-200);
		scroller.dispatchEvent(new Event('scroll', { bubbles: false }));
		await new Promise((r) => setTimeout(r, 30));
		expect(drawnFraction(artPath)).toBeCloseTo(0.8, 2);
	});

	it('redraws when the trigger resizes', async () => {
		let resized!: () => void;
		const observe = vi.fn();
		const disconnect = vi.fn();
		vi.stubGlobal('ResizeObserver', class {
			constructor(callback: () => void) { resized = callback; }
			observe = observe;
			disconnect = disconnect;
		});
		const { band, trigger, artPath, setHeight } = buildBand();
		cleanup = blueprintScrub(band, trigger);
		expect(observe).toHaveBeenCalledWith(trigger);
		setHeight(1000);
		resized();
		await new Promise((r) => setTimeout(r, 30));
		expect(drawnFraction(artPath)).toBeCloseTo((innerHeight - 100) / (innerHeight + 1000), 2);
		cleanup?.();
		cleanup = undefined;
		expect(disconnect).toHaveBeenCalledOnce();
	});

	it('leaves art untouched under reduced motion', () => {
		vi.mocked(isPrefersReducedMotion).mockReturnValue(true);
		const { band, trigger, artPath } = buildBand();
		cleanup = blueprintScrub(band, trigger);
		expect(cleanup).toBeUndefined();
		expect(artPath.style.strokeDasharray).toBe('');
	});

	it('leaves art untouched at narrow viewport widths', () => {
		vi.mocked(isViewportAtMost).mockReturnValue(true);
		const { band, trigger, artPath } = buildBand();
		cleanup = blueprintScrub(band, trigger);
		expect(cleanup).toBeUndefined();
		expect(artPath.style.strokeDasharray).toBe('');
	});

	it('stops updating after cleanup', async () => {
		const { band, trigger, artPath, scroller, setTop } = buildBand();
		cleanup = blueprintScrub(band, trigger);
		expect(cleanup).toBeTypeOf('function');
		cleanup?.();
		cleanup = undefined;
		setTop(-200);
		scroller.dispatchEvent(new Event('scroll'));
		await new Promise((r) => setTimeout(r, 30));
		expect(drawnFraction(artPath)).toBeCloseTo(0.6, 2);
	});
});
