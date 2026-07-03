import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { findSettleTarget, initSectionMagnet } from './sectionMagnet.js';
import { initLenis, destroyLenis, getLenis } from './lenis.js';

// GO-w2t5 matchMedia control (lenis.test.ts pattern) — isPrefersReducedMotion
// reads live, so swapping the mock per test flips the magnet's settle style.
function mockMatchMedia(matches: boolean): void {
	Object.defineProperty(window, 'matchMedia', {
		writable: true,
		configurable: true,
		value: vi.fn().mockReturnValue({
			matches,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		}),
	});
}

function setTouch(value: number): void {
	(ScrollTrigger as unknown as { isTouch: number }).isTouch = value;
}

describe('motion/utils/sectionMagnet — findSettleTarget (pure math)', () => {
	const opts = { radius: 200, maxScroll: 10000, epsilon: 2 };

	it('returns the nearest section top when settled within the radius', () => {
		expect(findSettleTarget(2120, [0, 2000, 5000], opts)).toBe(2000);
		expect(findSettleTarget(4870, [0, 2000, 5000], opts)).toBe(5000);
	});

	it('soft magnet: returns null beyond the radius — never hard paging', () => {
		expect(findSettleTarget(3500, [0, 2000, 5000], opts)).toBeNull();
		expect(findSettleTarget(2201, [0, 2000, 5000], opts)).toBeNull();
	});

	it('pulls at exactly the radius boundary', () => {
		expect(findSettleTarget(2200, [0, 2000, 5000], opts)).toBe(2000);
	});

	it('returns null when already aligned (within epsilon) — no feedback loop', () => {
		expect(findSettleTarget(2000, [0, 2000, 5000], opts)).toBeNull();
		expect(findSettleTarget(2002, [0, 2000, 5000], opts)).toBeNull();
	});

	it('picks the nearest of two competing tops', () => {
		expect(findSettleTarget(2090, [2000, 2200], opts)).toBe(2000);
		expect(findSettleTarget(2110, [2000, 2200], opts)).toBe(2200);
	});

	it('magnetizes back to the page top (section top 0)', () => {
		expect(findSettleTarget(120, [0, 2000], opts)).toBe(0);
	});

	it('clamps targets to maxScroll so it never eases past the page end', () => {
		expect(findSettleTarget(9950, [0, 9900, 10100], { ...opts, maxScroll: 10000 })).toBe(9900);
		// A section top below maxScroll clamps to maxScroll.
		expect(findSettleTarget(9950, [0, 10100], { ...opts, maxScroll: 10000 })).toBe(10000);
	});

	it('returns null for an empty section list', () => {
		expect(findSettleTarget(100, [], opts)).toBeNull();
	});

	it('never returns a negative target', () => {
		expect(findSettleTarget(50, [-20, 2000], opts)).toBe(0);
	});
});

// ---- wiring tests --------------------------------------------------------

function setScrollY(value: number): void {
	Object.defineProperty(window, 'scrollY', { value, writable: true, configurable: true });
}

function setScrollHeight(value: number): void {
	Object.defineProperty(document.documentElement, 'scrollHeight', {
		value,
		writable: true,
		configurable: true,
	});
}

/** A fake section whose document-space top stays fixed regardless of scrollY. */
function fakeSection(documentTop: number): HTMLElement {
	const el = document.createElement('section');
	el.getBoundingClientRect = () =>
		({ top: documentTop - window.scrollY }) as DOMRect;
	return el;
}

describe('motion/utils/sectionMagnet — initSectionMagnet (wiring)', () => {
	let scrollToSpy: ReturnType<typeof vi.fn>;
	let destroy: (() => void) | undefined;

	beforeEach(() => {
		vi.useFakeTimers();
		mockMatchMedia(false);
		setTouch(0);
		setScrollY(0);
		setScrollHeight(10000);
		Object.defineProperty(window, 'innerHeight', {
			value: 1000,
			writable: true,
			configurable: true,
		});
		scrollToSpy = vi.fn();
		window.scrollTo = scrollToSpy as unknown as typeof window.scrollTo;
	});

	afterEach(() => {
		destroy?.();
		destroy = undefined;
		destroyLenis();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	/** Advance past BOTH tier debounces (desktop 150ms / touch 260ms). */
	function settleAt(scrollY: number): void {
		setScrollY(scrollY);
		window.dispatchEvent(new Event('scroll'));
		vi.advanceTimersByTime(300);
	}

	it('eases to the nearest section top after scroll settles (native smooth)', () => {
		const sections = [fakeSection(0), fakeSection(2000), fakeSection(5000)];
		destroy = initSectionMagnet(() => sections);
		settleAt(2100);
		expect(scrollToSpy).toHaveBeenCalledWith({ top: 2000, behavior: 'smooth' });
	});

	it('does nothing when the settle point is outside the radius', () => {
		const sections = [fakeSection(0), fakeSection(2000), fakeSection(5000)];
		destroy = initSectionMagnet(() => sections);
		settleAt(3500);
		expect(scrollToSpy).not.toHaveBeenCalled();
	});

	// Taste round 2: STRONGER desktop pull — radius 0.32×viewport (capped
	// 360px). At a 1000px viewport that is 320px; round 1's 240px cap would
	// have ignored a 300px-out settle.
	it('desktop tier pulls from 300px out (decisive radius, round-2)', () => {
		const sections = [fakeSection(0), fakeSection(2000)];
		destroy = initSectionMagnet(() => sections);
		window.dispatchEvent(new Event('wheel')); // precise modality
		settleAt(2300);
		expect(scrollToSpy).toHaveBeenCalledWith({ top: 2000, behavior: 'smooth' });
	});

	it('desktop tier still soft: nothing beyond the 0.32×viewport radius', () => {
		const sections = [fakeSection(0), fakeSection(2000)];
		destroy = initSectionMagnet(() => sections);
		window.dispatchEvent(new Event('wheel'));
		settleAt(2330); // 330 > 320 radius
		expect(scrollToSpy).not.toHaveBeenCalled();
	});

	// Taste round 2: touch is GENTLER than round 1 — radius 0.16×viewport
	// (capped 160px) so natural touch scrolling is never fought.
	it('touch tier ignores a settle the desktop tier would magnetize', () => {
		const sections = [fakeSection(0), fakeSection(2000)];
		destroy = initSectionMagnet(() => sections);
		window.dispatchEvent(new Event('touchstart'));
		settleAt(2300); // 300 > 160 touch radius
		expect(scrollToSpy).not.toHaveBeenCalled();
	});

	it('touch tier still assists when genuinely close (within 160px)', () => {
		const sections = [fakeSection(0), fakeSection(2000)];
		destroy = initSectionMagnet(() => sections);
		window.dispatchEvent(new Event('touchstart'));
		settleAt(2100);
		expect(scrollToSpy).toHaveBeenCalledWith({ top: 2000, behavior: 'smooth' });
	});

	it('touch debounce waits out momentum (260ms, longer than desktop)', () => {
		const sections = [fakeSection(0), fakeSection(2000)];
		destroy = initSectionMagnet(() => sections);
		window.dispatchEvent(new Event('touchstart'));
		setScrollY(2100);
		window.dispatchEvent(new Event('scroll'));
		vi.advanceTimersByTime(200); // desktop would have settled by now
		expect(scrollToSpy).not.toHaveBeenCalled();
		vi.advanceTimersByTime(100);
		expect(scrollToSpy).toHaveBeenCalledWith({ top: 2000, behavior: 'smooth' });
	});

	it('touch never routes through Lenis — native smooth only (hybrid device)', () => {
		setTouch(0);
		initLenis();
		const lenis = getLenis()!;
		const lenisScrollTo = vi.spyOn(lenis, 'scrollTo').mockImplementation(() => {});
		const sections = [fakeSection(0), fakeSection(2000)];
		destroy = initSectionMagnet(() => sections);
		window.dispatchEvent(new Event('touchstart'));
		settleAt(2100);
		expect(lenisScrollTo).not.toHaveBeenCalled();
		expect(scrollToSpy).toHaveBeenCalledWith({ top: 2000, behavior: 'smooth' });
	});

	it('wheel after touch flips back to the precise tier (hybrid device)', () => {
		const sections = [fakeSection(0), fakeSection(2000)];
		destroy = initSectionMagnet(() => sections);
		window.dispatchEvent(new Event('touchstart'));
		window.dispatchEvent(new Event('wheel'));
		settleAt(2300); // desktop radius again
		expect(scrollToSpy).toHaveBeenCalledWith({ top: 2000, behavior: 'smooth' });
	});

	it('does nothing before the settle debounce elapses', () => {
		const sections = [fakeSection(0), fakeSection(2000)];
		destroy = initSectionMagnet(() => sections);
		setScrollY(2100);
		window.dispatchEvent(new Event('scroll'));
		vi.advanceTimersByTime(80);
		expect(scrollToSpy).not.toHaveBeenCalled();
	});

	it('reduced-motion KEEPS the magnet but settles instantly (assistive, not vestibular)', () => {
		mockMatchMedia(true);
		const sections = [fakeSection(0), fakeSection(2000)];
		destroy = initSectionMagnet(() => sections);
		settleAt(2100);
		expect(scrollToSpy).toHaveBeenCalledWith({ top: 2000, behavior: 'auto' });
	});

	it('routes through Lenis when a Lenis instance is live (desktop wheel)', () => {
		setTouch(0);
		initLenis();
		const lenis = getLenis()!;
		expect(lenis).not.toBeNull();
		const lenisScrollTo = vi.spyOn(lenis, 'scrollTo').mockImplementation(() => {});
		const sections = [fakeSection(0), fakeSection(2000)];
		destroy = initSectionMagnet(() => sections);
		settleAt(2100);
		expect(lenisScrollTo).toHaveBeenCalled();
		expect(lenisScrollTo.mock.calls[0][0]).toBe(2000);
		expect(scrollToSpy).not.toHaveBeenCalled();
	});

	it('holds the magnet while a pointer is down, settles after release', () => {
		const sections = [fakeSection(0), fakeSection(2000)];
		destroy = initSectionMagnet(() => sections);
		window.dispatchEvent(new Event('pointerdown'));
		settleAt(2100);
		expect(scrollToSpy).not.toHaveBeenCalled();
		window.dispatchEvent(new Event('pointerup'));
		vi.advanceTimersByTime(200);
		expect(scrollToSpy).toHaveBeenCalledWith({ top: 2000, behavior: 'smooth' });
	});

	it('wheel/touchstart cancel a pending settle (user re-engaged)', () => {
		const sections = [fakeSection(0), fakeSection(2000)];
		destroy = initSectionMagnet(() => sections);
		setScrollY(2100);
		window.dispatchEvent(new Event('scroll'));
		vi.advanceTimersByTime(100);
		window.dispatchEvent(new Event('wheel'));
		vi.advanceTimersByTime(150);
		expect(scrollToSpy).not.toHaveBeenCalled();
		// The next scroll stream re-arms the magnet.
		settleAt(2080);
		expect(scrollToSpy).toHaveBeenCalledWith({ top: 2000, behavior: 'smooth' });
	});

	// slice-34.4: the suppress predicate stands the magnet down while a
	// locale-switch scroll restore is in flight — the restore's forced jump
	// fires scroll events that would otherwise yank the restored position to
	// the nearest section top.
	it('suppress(): magnet stands down while the predicate is true', () => {
		const sections = [fakeSection(0), fakeSection(2000)];
		let suppressed = true;
		destroy = initSectionMagnet(() => sections, { suppress: () => suppressed });
		settleAt(2100);
		expect(scrollToSpy).not.toHaveBeenCalled();
		// Once restore finishes the predicate flips and the magnet resumes.
		suppressed = false;
		settleAt(2080);
		expect(scrollToSpy).toHaveBeenCalledWith({ top: 2000, behavior: 'smooth' });
	});

	it('destroy removes listeners — no settle fires afterwards', () => {
		const sections = [fakeSection(0), fakeSection(2000)];
		destroy = initSectionMagnet(() => sections);
		destroy();
		destroy = undefined;
		settleAt(2100);
		expect(scrollToSpy).not.toHaveBeenCalled();
	});

	it('measures sections lazily at settle time (layout changes are picked up)', () => {
		const sections = [fakeSection(0), fakeSection(2000)];
		destroy = initSectionMagnet(() => sections);
		// Layout shifts before the user stops scrolling (e.g. hero collapse).
		sections[1].getBoundingClientRect = () =>
			({ top: 1500 - window.scrollY }) as DOMRect;
		settleAt(1450);
		expect(scrollToSpy).toHaveBeenCalledWith({ top: 1500, behavior: 'smooth' });
	});
});
