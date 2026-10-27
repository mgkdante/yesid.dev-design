import { fireEvent, render } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TocEntry } from '../brand/toc.js';
import DetailFrame, { type DetailFrameProps, type DetailFrameToc } from './DetailFrame.svelte';

const toc = vi.hoisted(() => ({ observe: vi.fn(), land: vi.fn() }));

vi.mock('../brand/toc.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../brand/toc.js')>()),
	observeActiveToc: toc.observe,
	landTocFragments: toc.land,
}));

const part = (id: string) => createRawSnippet(() => ({ render: () => `<div data-testid="${id}">${id}</div>` }));
const entry = (id: string, title: string): TocEntry => ({ id, title, level: 2, children: [] });

const tocProps: DetailFrameToc = {
	entries: [entry('sec-a', 'Section A'), entry('sec-b', 'Section B')],
	openAria: 'Open contents',
	closeAria: 'Close contents',
};

const frame = (props: Partial<DetailFrameProps> = {}) =>
	render(DetailFrame, { props: { children: part('center'), ...props } });
type View = ReturnType<typeof frame>;

const slot = (view: View, name: string) => view.container.querySelector<HTMLElement>(`[data-slot="${name}"]`)!;
const article = (view: View) => view.container.querySelector<HTMLElement>('article')!;
const pill = (view: View) => view.container.querySelector('[data-testid="toc-pill"] button');
const precedes = (a: Node, b: Node) => a.compareDocumentPosition(b) === Node.DOCUMENT_POSITION_FOLLOWING;

beforeEach(() => {
	toc.observe.mockReset().mockImplementation(() => vi.fn());
	toc.land.mockReset().mockImplementation(() => vi.fn());
});

describe('layout order', () => {
	it('runs from the header through the hazard rule, toolbar, mobile summary and grid to after', () => {
		const view = frame({
			header: part('header'),
			toolbar: part('toolbar'),
			mobileSummary: part('mobile-summary'),
			after: part('after'),
		});
		const order = [
			view.getByTestId('header'),
			slot(view, 'separator'),
			slot(view, 'detail-shell-toolbar'),
			slot(view, 'detail-shell-mobile-summary'),
			slot(view, 'detail-shell-center').parentElement!,
			view.getByTestId('after'),
		];
		order.slice(1).forEach((node, index) => expect(precedes(order[index], node)).toBe(true));
		for (const [slotName, id] of [
			['detail-shell-toolbar', 'toolbar'],
			['detail-shell-mobile-summary', 'mobile-summary'],
		]) {
			expect(slot(view, slotName).contains(view.getByTestId(id))).toBe(true);
		}
		expect(article(view).contains(view.getByTestId('after'))).toBe(true);
	});

	it('renders the toolbar and mobile summary only when supplied', () => {
		const view = frame();
		expect(slot(view, 'detail-shell-toolbar')).toBeNull();
		expect(slot(view, 'detail-shell-mobile-summary')).toBeNull();
		expect(slot(view, 'separator')).not.toBeNull();
	});

	it('puts left, center and right in their own cells in that order', () => {
		const view = frame({ left: part('left'), right: part('right') });
		const [left, center, right] = ['left', 'center', 'right'].map((name) => slot(view, `detail-shell-${name}`));
		expect([left.tagName, right.tagName]).toEqual(['ASIDE', 'ASIDE']);
		expect(left.contains(view.getByTestId('left'))).toBe(true);
		expect(center.contains(view.getByTestId('center'))).toBe(true);
		expect(right.contains(view.getByTestId('right'))).toBe(true);
		expect(precedes(left, center)).toBe(true);
		expect(precedes(center, right)).toBe(true);
		expect(left.parentElement).toBe(center.parentElement);
	});

	it('starts the center with the summary, before the children', () => {
		const view = frame({ summary: part('summary') });
		const center = slot(view, 'detail-shell-center');
		expect(center.firstElementChild).toBe(slot(view, 'detail-shell-summary'));
		expect(slot(view, 'detail-shell-summary').contains(view.getByTestId('summary'))).toBe(true);
		expect(precedes(view.getByTestId('summary'), view.getByTestId('center'))).toBe(true);
	});
});

describe('rails', () => {
	it('renders no aside without a left or right rail, so the center stands alone', () => {
		const view = frame();
		expect(view.container.querySelector('aside')).toBeNull();
		expect(view.getByTestId('center')).toBeInTheDocument();
	});

	it.each([
		['left', 'detail-shell-right'],
		['right', 'detail-shell-left'],
	] as const)('renders only the %s rail when the other is missing', (side, missing) => {
		const view = frame({ [side]: part(side) });
		expect(view.container.querySelectorAll('aside')).toHaveLength(1);
		expect(slot(view, missing)).toBeNull();
		expect(view.getByTestId(side)).toBeInTheDocument();
	});

	it('lets the caller own the left cell with rail, once', () => {
		const rail = createRawSnippet(() => ({ render: () => '<section data-testid="rail">Sheet rail</section>' }));
		const view = frame({ rail, left: part('left'), right: part('right') });
		expect(slot(view, 'detail-shell-left')).toBeNull();
		expect(view.queryByTestId('left')).toBeNull();
		expect(view.getAllByTestId('rail')).toHaveLength(1);
		expect(precedes(view.getByTestId('rail'), slot(view, 'detail-shell-center'))).toBe(true);
	});

	it('marks the left rail as visible on mobile only with leftMobile', () => {
		const mobile = (flag: boolean) =>
			slot(frame({ left: part('left'), leftMobile: flag }), 'detail-shell-left').classList.contains(
				'detail-shell-rail--mobile',
			);
		expect([mobile(true), mobile(false)]).toEqual([true, false]);
	});

	it('marks the grid pane-owned only with paneOwnedRail', () => {
		const owned = (paneOwnedRail: boolean) =>
			slot(frame({ paneOwnedRail }), 'detail-shell-center').parentElement!.classList.contains(
				'detail-shell-grid--pane-owned',
			);
		expect([owned(true), owned(false)]).toEqual([true, false]);
	});
});

describe('root attributes', () => {
	it('passes class, style and data-testid to the article', () => {
		const view = frame({ class: 'custom-frame', style: 'color: red', 'data-testid': 'detail' });
		expect(view.getByTestId('detail')).toBe(article(view));
		expect(article(view).classList.contains('custom-frame')).toBe(true);
		expect(article(view).style.color).toBe('red');
	});

	it('sets --detail-measure from measure and keeps the caller style', () => {
		const view = frame({ measure: '46rem', style: 'color: red' });
		expect(article(view).style.getPropertyValue('--detail-measure')).toBe('46rem');
		expect(article(view).style.color).toBe('red');
		expect(article(frame()).style.getPropertyValue('--detail-measure')).toBe('');
	});
});

describe('toc pill', () => {
	it('shows the pill only with toc entries and no caller rail', () => {
		const rail = part('rail');
		expect(pill(frame({ toc: tocProps }))).not.toBeNull();
		expect(pill(frame())).toBeNull();
		expect(pill(frame({ toc: { ...tocProps, entries: [] } }))).toBeNull();
		expect(pill(frame({ toc: tocProps, rail }))).toBeNull();
	});

	it('lists pillEntries instead of entries, and names the pill from openAria', () => {
		const view = frame({ toc: { ...tocProps, pillEntries: [entry('mobile', 'Mobile section')] } });
		expect(pill(view)!.getAttribute('aria-label')).toBe('Mobile section 1/1 · Open contents');
	});

	it('navigates through onNavigate from the open drawer', async () => {
		const onNavigate = vi.fn();
		const view = frame({ toc: { ...tocProps, onNavigate } });
		await fireEvent.click(pill(view)!);
		await fireEvent.click(view.getByText('Section B'));
		expect(onNavigate).toHaveBeenCalledWith('sec-b');
	});
});

describe('active toc entry', () => {
	it('starts from activeId and follows the observer, which gets the selector', async () => {
		const view = frame({ toc: { ...tocProps, selector: '[data-target]' }, activeId: 'sec-b' });
		await vi.waitFor(() => expect(toc.observe).toHaveBeenCalledOnce());
		const [setActive, selector] = toc.observe.mock.calls[0];
		expect(selector).toBe('[data-target]');
		expect(pill(view)!.getAttribute('aria-label')).toBe('Section B 2/2 · Open contents');

		setActive('sec-a');
		await tick();
		expect(pill(view)!.getAttribute('aria-label')).toBe('Section A 1/2 · Open contents');
	});

	it('observes again when the entries change, and stops each observer', async () => {
		const view = frame({ toc: { ...tocProps, entries: [] } });
		await vi.waitFor(() => expect(toc.observe).toHaveBeenCalledTimes(1));

		await view.rerender({ toc: tocProps });
		await vi.waitFor(() => expect(toc.observe).toHaveBeenCalledTimes(2));
		expect(toc.observe.mock.results[0].value).toHaveBeenCalledOnce();

		view.unmount();
		expect(toc.observe.mock.results[1].value).toHaveBeenCalledOnce();
	});

	it('does not observe without toc', async () => {
		frame();
		await tick();
		expect(toc.observe).not.toHaveBeenCalled();
	});
});

describe('fragment landing', () => {
	it('lands fragments with toc.landFragments and cleans up on unmount', () => {
		const view = frame({ toc: { ...tocProps, landFragments: true } });
		expect(toc.land).toHaveBeenCalledOnce();
		const cleanup = toc.land.mock.results[0].value;
		expect(cleanup).not.toHaveBeenCalled();
		view.unmount();
		expect(cleanup).toHaveBeenCalledOnce();
	});

	it.each([undefined, { ...tocProps }])('does not land fragments without landFragments (toc=%j)', (value) => {
		frame({ toc: value });
		expect(toc.land).not.toHaveBeenCalled();
	});
});
