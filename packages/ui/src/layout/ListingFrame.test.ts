import { fireEvent, render, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ListingFrame, { type ListingFrameProps } from './ListingFrame.svelte';

const html = (markup: string) => createRawSnippet(() => ({ render: () => markup }));
const blueprint = html('<div data-testid="blueprint">Art</div>');
const aside = html('<p data-testid="aside">Inventory</p>');
const search = html('<input data-testid="search" aria-label="Search the catalogue">');
const filters = html(
	'<div data-testid="filter-controls"><input aria-label="Filter query"><button type="button">Apply filters</button></div>',
);
const children = html('<div data-testid="results">Results</div>');

const frame = (props: Partial<ListingFrameProps> = {}) =>
	render(ListingFrame, {
		props: { heading: 'Lines', subtitle: 'Network', filterLabel: 'Filters', blueprint, filters, children, ...props },
	});
type View = ReturnType<typeof frame>;

const slot = (view: View, name: string) => view.container.querySelector<HTMLElement>(`[data-slot="${name}"]`)!;
const toggle = (view: View) => within(view.container).getByRole('button', { name: 'Filters' });
const panel = (view: View) => slot(view, 'listing-filter-panel');
const isOpen = (view: View) => [toggle(view).getAttribute('aria-expanded'), panel(view).dataset.state];
const precedes = (a: Node, b: Node) => a.compareDocumentPosition(b) === Node.DOCUMENT_POSITION_FOLLOWING;
const click = fireEvent.click;

afterEach(() => sessionStorage.clear());

describe('header', () => {
	it('has one h1 and puts the artwork, copy and aside inside the header', () => {
		const view = frame({ description: 'Every line.', aside });
		const header = slot(view, 'blueprint-listing-header');
		expect(header.querySelectorAll('h1')).toHaveLength(1);
		expect(view.getByRole('heading', { level: 1 }).textContent).toBe('Lines.');
		for (const text of ['Network', 'Every line.']) expect(header.textContent).toContain(text);
		for (const id of ['blueprint', 'aside']) expect(header.contains(view.getByTestId(id))).toBe(true);
	});

	it('calls onHeaderMount once with the header and frame, and runs its cleanup on unmount', () => {
		const cleanup = vi.fn();
		const onHeaderMount = vi.fn(() => cleanup);
		const view = frame({ onHeaderMount });
		expect(onHeaderMount).toHaveBeenCalledOnce();
		const [header, host] = onHeaderMount.mock.calls[0] as unknown as HTMLElement[];
		expect(header).toBe(slot(view, 'blueprint-listing-header'));
		expect(host).toBe(slot(view, 'listing-frame'));

		expect(cleanup).not.toHaveBeenCalled();
		view.unmount();
		expect(cleanup).toHaveBeenCalledOnce();
	});
});

describe('edge title', () => {
	it.each(['Notes', 'Un catalogue de travaux et de recherches', ''])('shows the supplied title %j and the results', (edgeTitle) => {
		const view = frame({ edgeTitle });
		expect(slot(view, 'listing-edge-title').textContent?.trim()).toBe(`${edgeTitle}.`);
		expect(view.getByTestId('results').textContent).toBe('Results');
	});

	it('defaults to the heading and stays hidden from assistive technology', () => {
		const column = slot(frame(), 'listing-edge-title');
		expect(column.textContent?.trim()).toBe('Lines.');
		expect(column.getAttribute('aria-hidden')).toBe('true');
	});
});

describe('layout order', () => {
	it('runs from the separator through the filter column to the results', () => {
		const view = frame({ search });
		const [separator, column, results] = [
			view.getByTestId('listing-page-separator'),
			slot(view, 'listing-filter-column'),
			slot(view, 'listing-content'),
		];
		expect(precedes(separator, column)).toBe(true);
		expect(precedes(column, results)).toBe(true);
		expect(results.contains(view.getByTestId('results'))).toBe(true);
		expect(column.tagName).toBe('ASIDE');
	});

	it('shows search above the panel inside the filter column and mounts the filters once', () => {
		const view = frame({ search });
		const column = slot(view, 'listing-filter-column');
		expect(column.contains(view.getByTestId('search'))).toBe(true);
		expect(precedes(view.getByTestId('search'), toggle(view))).toBe(true);
		expect(precedes(toggle(view), panel(view))).toBe(true);
		expect(view.getAllByTestId('filter-controls')).toHaveLength(1);
		expect(panel(view).contains(view.getByTestId('filter-controls'))).toBe(true);
	});

	it('omits the search slot without a search snippet', () => {
		expect(slot(frame(), 'listing-filter-search')).toBeNull();
	});
});

describe('filter toggle', () => {
	it('starts closed, flips the toggle and panel together, and controls the panel', async () => {
		const view = frame();
		expect(isOpen(view)).toEqual(['false', 'closed']);
		expect(toggle(view).getAttribute('aria-controls')).toBe(panel(view).id);

		await click(toggle(view));
		expect(isOpen(view)).toEqual(['true', 'open']);
		await click(toggle(view));
		expect(isOpen(view)).toEqual(['false', 'closed']);
	});

	it('never makes the panel inert or aria-hidden, so the filters stay reachable', async () => {
		const view = frame();
		const input = view.getByLabelText('Filter query');
		for (const open of [false, true]) {
			if (open) await click(toggle(view));
			expect(panel(view).hasAttribute('inert')).toBe(false);
			expect(panel(view).hasAttribute('aria-hidden')).toBe(false);
			expect(input.closest('[inert], [aria-hidden="true"]')).toBeNull();
		}
	});

	it('opens no dialog or backdrop and leaves page scroll alone', async () => {
		const view = frame();
		await click(toggle(view));
		expect(view.container.querySelector('[role="dialog"], [data-slot="listing-filter-backdrop"]')).toBeNull();
		expect(document.body.style.overflow).not.toBe('hidden');
	});

	it('keeps the open state across a remount with filterPersistKey, and not without one', async () => {
		const keyed = frame({ filterPersistKey: 'listing:filters' });
		await click(toggle(keyed));
		keyed.unmount();
		expect(isOpen(frame({ filterPersistKey: 'listing:filters' }))).toEqual(['true', 'open']);

		const plain = frame();
		await click(toggle(plain));
		plain.unmount();
		expect(isOpen(frame())).toEqual(['false', 'closed']);
	});
});
