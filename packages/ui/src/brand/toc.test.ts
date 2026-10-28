import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as toc from './toc.js';
import type { TocEntry } from './toc.js';

const entry = (id: string, children: TocEntry[] = [], badge?: TocEntry['badge']): TocEntry =>
	({ id, title: id, level: 2, badge, children });
const nextFrame = () => new Promise(requestAnimationFrame);
const reducedMotion = (matches: boolean) =>
	vi.spyOn(window, 'matchMedia').mockReturnValue({ matches } as MediaQueryList);
const mount = (html: string) => void (document.body.innerHTML = html);
const spyScroll = (selector: string) => {
	const scrollIntoView = vi.fn();
	document.querySelector<HTMLElement>(selector)!.scrollIntoView = scrollIntoView;
	return scrollIntoView;
};
const CARD =
	'<div class="section-card"><button class="section-header">Heading</button><div class="section-body"><h3 id="nested">Nested</h3></div></div>';

function stubObserver() {
	const observed: Element[] = [];
	const instance = { observe: (el: Element) => observed.push(el), disconnect: vi.fn() };
	let report: IntersectionObserverCallback = () => {};
	vi.stubGlobal('IntersectionObserver', function (callback: IntersectionObserverCallback) {
		report = callback;
		return instance;
	});
	const intersect = (target: Element, isIntersecting = true) =>
		report([{ target, isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
	return { observed, disconnect: instance.disconnect, intersect };
}

function scrollerWith(height: () => number): HTMLElement {
	const scroller = document.body.appendChild(document.createElement('div'));
	scroller.style.overflowY = 'auto';
	Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: height });
	return scroller.appendChild(document.createElement('div'));
}

afterEach(() => {
	document.body.innerHTML = '';
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

it('resolveTocCounter follows badge numbers for a flat numbered run and counts positions otherwise', () => {
	const run = [entry('a', [], { kind: 'number', value: 2 }), entry('b', [], { kind: 'number', value: 8 })];
	expect(toc.resolveTocCounter(run, 'a')).toEqual({ current: 2, total: 8 });
	expect(toc.resolveTocCounter(run, 'unknown')).toEqual({ current: 2, total: 8 });

	const mixed = [entry('a', [], { kind: 'icon', name: 'eye' }), entry('b', [], { kind: 'number', value: 4 })];
	expect(toc.resolveTocCounter(mixed, 'b')).toEqual({ current: 2, total: 2 });
	expect(toc.resolveTocCounter([entry('a', [entry('a1')]), entry('b')], 'b')).toEqual({ current: 3, total: 3 });
});

it('tocElement resolves section-N, then data-toc, then a plain id, whatever characters it holds', () => {
	const odd = `say "hi"] [x='y'`;
	mount('<div data-section-index="4"></div><section data-toc="overview"></section><h2 id="plain"></h2>');
	document.body.appendChild(document.createElement('i')).setAttribute('data-toc', odd);
	expect(toc.tocElement('section-4')).toBe(document.querySelector('[data-section-index]'));
	expect(toc.tocElement('overview')).toBe(document.querySelector('[data-toc="overview"]'));
	expect(toc.tocElement('plain')).toBe(document.getElementById('plain'));
	expect(toc.tocElement(odd)).toBe(document.querySelector('i'));
	expect(toc.tocElement('missing')).toBeNull();
});

it('navigateToc lands an open nested heading, or the header of a closed card', () => {
	reducedMotion(false);
	mount(CARD);
	const heading = spyScroll('#nested');
	const header = spyScroll('.section-header');
	toc.navigateToc('nested');
	expect(heading).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });

	document.querySelector('.section-body')!.setAttribute('inert', '');
	toc.navigateToc('nested');
	expect(header).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
	expect(heading).toHaveBeenCalledOnce();
});

it('lands a TOC jump a quarter down the viewport, on the line the active tracker reads', () => {
	reducedMotion(false);
	mount(CARD);
	const heading = document.querySelector<HTMLElement>('#nested')!;
	let marginAtJump = '';
	heading.scrollIntoView = vi.fn(() => {
		marginAtJump = heading.style.scrollMarginTop;
	});
	toc.navigateToc('nested');
	expect(marginAtJump).toBe('25vh');
	expect(heading.style.scrollMarginTop).toBe('');

	mount('<section data-toc="overview"></section>');
	let rootMargin: string | undefined;
	vi.stubGlobal('IntersectionObserver', function (_: unknown, options?: IntersectionObserverInit) {
		rootMargin = options?.rootMargin;
		return { observe: vi.fn(), disconnect: vi.fn() };
	});
	toc.observeActiveToc(vi.fn());
	expect(rootMargin).toBe('-25% 0px -74% 0px');
});

it('navigateToc jumps under prefers-reduced-motion and ignores a missing target', () => {
	reducedMotion(true);
	mount(CARD);
	const heading = spyScroll('#nested');
	toc.navigateToc('nested');
	expect(heading).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
	expect(() => toc.navigateToc('missing')).not.toThrow();
});

it('onTocNavigate lands new fragment requests but not popstate, bad encodings or empty hashes', () => {
	mount(CARD);
	const heading = spyScroll('#nested');
	const to = (hash: string) => ({ url: new URL(`https://example.test/p${hash}`) });
	toc.onTocNavigate({ type: 'enter', to: to('#nested') });
	expect(heading).toHaveBeenCalledOnce();
	toc.onTocNavigate({ type: 'popstate', to: to('#nested') });
	toc.onTocNavigate({ type: 'link', to: to('#%invalid') });
	toc.onTocNavigate({ type: 'link', to: to('') });
	toc.onTocNavigate({ type: 'link', to: null });
	expect(heading).toHaveBeenCalledOnce();
});

it('openCollapsedTocTarget clicks only a collapsed trigger owned by the target', () => {
	mount(
		'<section data-toc="closed"><button data-section-trigger aria-expanded="false"></button></section>' +
			'<section data-toc="open"><button data-section-trigger aria-expanded="true"></button></section>',
	);
	const click = vi.spyOn(document.querySelector<HTMLElement>('[data-toc="closed"] button')!, 'click');
	expect([toc.openCollapsedTocTarget('open'), toc.openCollapsedTocTarget('missing')]).toEqual([false, false]);
	expect(toc.openCollapsedTocTarget('closed')).toBe(true);
	expect(click).toHaveBeenCalledOnce();
});

it('observeActiveToc reports section-N, data-toc and (with a selector) id targets, and disconnects', () => {
	expect(() => toc.observeActiveToc(vi.fn())()).not.toThrow();
	mount('<h2 id="faq"></h2><div data-section-index="2"></div><section data-toc="overview"></section>');
	const { observed, intersect, disconnect } = stubObserver();
	const setActive = vi.fn();
	const cleanup = toc.observeActiveToc(setActive);
	expect(observed).toHaveLength(2);
	[observed[0], observed[1]].forEach((el) => intersect(el));
	intersect(observed[1], false);
	expect(setActive.mock.calls).toEqual([['section-2'], ['overview']]);
	cleanup();
	expect(disconnect).toHaveBeenCalledOnce();

	const custom = stubObserver();
	toc.observeActiveToc(setActive, 'h2');
	expect(custom.observed).toEqual([document.getElementById('faq')]);
	custom.intersect(custom.observed[0]);
	expect(setActive).toHaveBeenLastCalledWith('faq');
});

it('settleLayout waits for the nearest scroller to stop growing, up to the max wait', async () => {
	let reads = 0;
	await toc.settleLayout(scrollerWith(() => (++reads < 4 ? reads * 100 : 400)));
	expect(reads).toBeGreaterThanOrEqual(5);

	let height = 0;
	const started = performance.now();
	await toc.settleLayout(scrollerWith(() => (height += 10)), 150);
	expect(performance.now() - started).toBeLessThan(5000);
});

it('revealTocTarget runs beforeReveal first, scrolls with the given behavior, and drops stale or missing targets', async () => {
	reducedMotion(true);
	const target = document.createElement('section');
	target.scrollIntoView = vi.fn();
	const beforeReveal = vi.fn((id: string) => {
		expect(toc.tocElement(id)).toBeNull();
		target.setAttribute('data-toc', id);
		document.body.append(target);
	});
	await expect(toc.revealTocTarget('late', { beforeReveal, behavior: 'smooth' })).resolves.toBe(true);
	expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });

	vi.mocked(target.scrollIntoView).mockClear();
	await expect(toc.revealTocTarget('late', { isCurrent: () => false, behavior: 'auto' })).resolves.toBe(false);
	await expect(toc.revealTocTarget('missing', { behavior: 'auto' })).resolves.toBe(false);
	expect(target.scrollIntoView).not.toHaveBeenCalled();
});

it('reconcileActiveToc keeps a survivor, else the nearest one, else the first, else empty', () => {
	const old = ['overview', 'intro', 'coverage', 'freshness', 'envelope'];
	expect(toc.reconcileActiveToc('coverage', old, ['coverage'])).toBe('coverage');
	expect(toc.reconcileActiveToc('coverage', old, ['overview', 'envelope', 'freshness'])).toBe('freshness');
	expect(toc.reconcileActiveToc('removed', ['old'], ['first', 'second'])).toBe('first');
	expect(toc.reconcileActiveToc('a', ['a'], [])).toBe('');
});

describe('landTocFragments', () => {
	let stop: () => void;

	function setup() {
		history.replaceState(null, '', '/#nested');
		const closedCard = CARD.replace('class="section-body"', 'class="section-body" inert');
		mount(`<main>${closedCard}<a href="#nested">Fragment</a><button id="other">Other</button></main>`);
		stop = toc.landTocFragments();
		return { header: spyScroll('.section-header'), link: document.querySelector('a')! };
	}

	afterEach(() => {
		stop();
		history.replaceState(null, '', '/');
	});

	it('lands a same-page fragment link on the next frame', async () => {
		const { header, link } = setup();
		link.click();
		expect(header).not.toHaveBeenCalled();
		await nextFrame();
		expect(header).toHaveBeenCalledOnce();
	});

	it('ignores canceled and download links and cancels pending corrections on history or another click', async () => {
		const { header, link } = setup();
		const cancel = (event: Event) => event.preventDefault();
		const idle = async () => {
			await nextFrame();
			expect(header).not.toHaveBeenCalled();
		};
		link.addEventListener('click', cancel);
		link.click();
		await idle();
		link.removeEventListener('click', cancel);
		link.setAttribute('download', '');
		link.click();
		await idle();
		link.removeAttribute('download');

		document.addEventListener('click', cancel);
		link.click();
		history.replaceState(null, '', '/#earlier');
		window.dispatchEvent(new PopStateEvent('popstate'));
		await idle();
		history.replaceState(null, '', '/#nested');
		link.click();
		window.dispatchEvent(new PopStateEvent('popstate', { state: { readingPosition: 750 } }));
		await idle();
		link.click();
		document.getElementById('other')!.click();
		await idle();

		link.click();
		await nextFrame();
		expect(header).toHaveBeenCalledOnce();
		document.removeEventListener('click', cancel);
	});

	it('ignores modified clicks', async () => {
		const { header, link } = setup();
		for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) {
			link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, [modifier]: true }));
		}
		await nextFrame();
		expect(header).not.toHaveBeenCalled();
	});

	it('cancels the pending frame and stops listening on cleanup', async () => {
		const { header, link } = setup();
		link.click();
		stop();
		link.click();
		await nextFrame();
		expect(header).not.toHaveBeenCalled();
	});
});

describe('settleLayout edge cases', () => {
	function scrollerReading(height: (read: number) => number) {
		const scroller = document.createElement('div');
		scroller.style.overflowY = 'auto';
		const target = document.createElement('div');
		scroller.appendChild(target);
		document.body.appendChild(scroller);
		let reads = 0;
		Object.defineProperty(scroller, 'scrollHeight', {
			configurable: true,
			get: () => height(++reads),
		});
		return { target, reads: () => reads, remove: () => scroller.remove() };
	}

	it('resolves immediately for a null target', async () => {
		await expect(toc.settleLayout(null)).resolves.toBeUndefined();
	});

	it('does not declare stability before a delayed transition begins', async () => {
		const probe = scrollerReading((read) => (read <= 4 ? 100 : read === 5 ? 200 : read === 6 ? 300 : 400));
		try {
			await toc.settleLayout(probe.target);
			expect(probe.reads()).toBeGreaterThanOrEqual(8);
		} finally {
			probe.remove();
		}
	});

	it('skips the transition-start grace under reduced motion', async () => {
		const media = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
		const probe = scrollerReading(() => 400);
		try {
			await toc.settleLayout(probe.target);
			expect(probe.reads()).toBe(3);
		} finally {
			media.mockRestore();
			probe.remove();
		}
	});

	it('honors the hard cap when animation frames stop firing', async () => {
		vi.useFakeTimers();
		const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 7);
		const caf = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
		const target = document.createElement('div');
		document.body.appendChild(target);
		let resolved = false;
		try {
			void toc.settleLayout(target, 150).then(() => {
				resolved = true;
			});
			await vi.advanceTimersByTimeAsync(151);
			expect(resolved).toBe(true);
		} finally {
			target.remove();
			raf.mockRestore();
			caf.mockRestore();
			vi.useRealTimers();
		}
	});

	it('makes revealTocTarget wait for layout settlement before scrolling', async () => {
		const target = document.createElement('section');
		target.setAttribute('data-toc', 'settling-target');
		target.scrollIntoView = vi.fn();
		document.body.appendChild(target);
		const frames: FrameRequestCallback[] = [];
		const media = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
		const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
			frames.push(callback);
			return frames.length;
		});
		const caf = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
		try {
			const result = toc.revealTocTarget('settling-target', { behavior: 'smooth' });
			await tick();
			expect(target.scrollIntoView).not.toHaveBeenCalled();
			expect(frames).toHaveLength(1);
			frames.shift()?.(performance.now());
			frames.shift()?.(performance.now());
			expect(target.scrollIntoView).not.toHaveBeenCalled();
			frames.shift()?.(performance.now());
			await expect(result).resolves.toBe(true);
			expect(target.scrollIntoView).toHaveBeenCalledOnce();
		} finally {
			caf.mockRestore();
			raf.mockRestore();
			media.mockRestore();
			target.remove();
		}
	});
});
