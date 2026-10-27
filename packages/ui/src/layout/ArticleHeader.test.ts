import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import ArticleHeader, { type ArticleHeaderProps, type ArticleMetaEntry } from './ArticleHeader.svelte';
import Canvas from './test-fixtures/ArticleHeaderCanvas.svelte';

const html = (markup: string) => createRawSnippet(() => ({ render: () => markup }));

const header = (props: Partial<ArticleHeaderProps> = {}) =>
	render(ArticleHeader, {
		props: { title: 'How we measure reliability', backHref: '/', backLabel: '← Back to the dashboard', ...props },
	});
type View = ReturnType<typeof header>;

const root = (view: View) => view.container.querySelector<HTMLElement>('[data-slot="article-header"]')!;
const title = (view: View) => view.getByRole('heading', { level: 1 });
const metaRow = (view: View) => view.container.querySelector<HTMLElement>('[data-pending]');
const hidden = (node: Element) => node.closest('[aria-hidden="true"]') !== null;
const precedes = (a: Node, b: Node) => a.compareDocumentPosition(b) === Node.DOCUMENT_POSITION_FOLLOWING;

describe('anatomy', () => {
	it('has one h1 with the title, the back link and the optional lines', () => {
		const view = header({
			category: 'METHOD · MEASUREMENT',
			subtitle: 'How the numbers are made',
			watermark: 'Method',
			edgeLeft: 'LINE 24',
			edgeRight: 'JUL 9 2026',
			titleId: 'page-title',
		});
		expect(view.container.querySelectorAll('h1')).toHaveLength(1);
		expect(title(view).textContent).toBe('How we measure reliability');
		expect(title(view).id).toBe('page-title');
		expect(view.getByRole('link', { name: '← Back to the dashboard' }).getAttribute('href')).toBe('/');
		for (const text of ['METHOD · MEASUREMENT', 'How the numbers are made', 'Method', 'LINE 24', 'JUL 9 2026']) {
			expect(view.getByText(text)).toBeInTheDocument();
		}
	});

	it('renders only the title and back link when nothing else is given', () => {
		const view = header();
		expect(view.container.querySelector('p, [data-pending], [data-slot^="article-header-"]')).toBeNull();
	});

	it('never renders a tag list or pills', () => {
		const view = header({ category: 'METHOD', meta: ['12 metrics', '2 families'], subtitle: 'Notes' });
		expect(view.container.querySelector('ul, ol, li, nav')).toBeNull();
	});

	it('puts testId and the accent on the root', () => {
		const view = header({ testId: 'article-header', accent: 'var(--secondary)' });
		expect(view.getByTestId('article-header')).toBe(root(view));
		expect(root(view).style.getPropertyValue('--article-accent')).toBe('var(--secondary)');
		expect(root(header()).style.getPropertyValue('--article-accent')).toBe('var(--primary)');
	});
});

describe('meta', () => {
	it('separates entries with decorative separators', () => {
		const row = metaRow(header({ meta: ['12 metrics', '2 families', 'Updated daily'] }))!;
		for (const text of ['12 metrics', '2 families', 'Updated daily']) expect(row.textContent).toContain(text);
		expect(row.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
	});

	const entries: [ArticleMetaEntry, string | null, string[]][] = [
		[{ text: 'Jul 9, 2026', datetime: '2026-07-09T12:00:00Z' }, '2026-07-09T12:00:00Z', ['Jul 9, 2026']],
		[{ label: 'Updated', text: 'Jul 9', datetime: '2026-07-09' }, '2026-07-09', ['Updated', 'Jul 9']],
		[{ label: 'By', text: 'Yesid' }, null, ['By', 'Yesid']],
		[{ text: 'Plain' }, null, ['Plain']],
	];
	it.each(entries)('renders the structured entry %j', (entry, datetime, texts) => {
		const view = header({ meta: [entry] });
		const time = view.container.querySelector('time');
		expect(time?.getAttribute('datetime') ?? null).toBe(datetime);
		for (const part of texts) expect(metaRow(view)!.textContent).toContain(part);
		if (time) expect(time.textContent).toBe(texts.at(-1));
	});

	it('keeps a label and its dated value in one item', () => {
		const view = header({ meta: [{ label: 'Updated', text: 'Jul 9', datetime: '2026-07-09' }, '8 sections'] });
		const pair = view.container.querySelector('time')!.parentElement!;
		expect(pair.textContent).toContain('Updated');
		expect(pair.textContent).not.toContain('8 sections');
	});

	it('reserves the row with an inert skeleton while meta is pending', () => {
		const row = metaRow(header({ metaPending: true }))!;
		expect(row.dataset.pending).toBe('true');
		expect(row.textContent?.trim()).toBe('');
		expect(row.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
	});

	it('shows entries instead of the skeleton, and renders no row without meta', () => {
		const loaded = metaRow(header({ metaPending: true, meta: ['12 metrics'] }))!;
		expect(loaded.textContent).toContain('12 metrics');
		expect(loaded.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0);
		expect(metaRow(header())).toBeNull();
	});
});

describe('actions and controls', () => {
	it('renders actions before controls, with controls last in the content column', () => {
		const view = header({
			actions: html('<a href="/map" data-testid="action">Map</a>'),
			controls: html('<button type="button" data-testid="control">Collapse</button>'),
		});
		const actionRow = view.container.querySelector('[data-slot="article-header-actions"]')!;
		const controlRow = view.container.querySelector('[data-slot="article-header-controls"]')!;
		expect(actionRow.contains(view.getByTestId('action'))).toBe(true);
		expect(controlRow.contains(view.getByTestId('control'))).toBe(true);
		expect(precedes(actionRow, controlRow)).toBe(true);
		expect(controlRow.parentElement!.lastElementChild).toBe(controlRow);
		expect(controlRow.parentElement).toBe(title(view).parentElement);
	});
});

describe('decoration', () => {
	it('keeps every decorative layer out of the accessibility tree', () => {
		const view = header({
			watermark: 'Method',
			edgeLeft: 'LINE 24',
			edgeRight: 'JUL 9 2026',
			decorations: html('<i data-testid="extra">+</i>'),
		});
		expect(root(view).firstElementChild!.getAttribute('aria-hidden')).toBe('true');
		for (const text of ['Method', 'LINE 24', 'JUL 9 2026']) expect(hidden(view.getByText(text))).toBe(true);
		expect(hidden(view.getByTestId('extra'))).toBe(true);
		expect(hidden(title(view))).toBe(false);
	});
});

describe('title highlight', () => {
	it.each([
		['How we measure reliability', 'measure', 'measure'],
		['How we measure reliability', 'MEASURE', 'measure'],
		['How we measure reliability', 'RELIABILITY', 'reliability'],
		['Measure twice, measure once', 'measure', 'Measure'],
		['Reliability', 'Reliability', 'Reliability'],
	])('wraps only the first match in %j for %j and keeps the title text', (text, highlight, wrapped) => {
		const heading = title(header({ title: text, highlight }));
		const spans = heading.querySelectorAll('span');
		expect(spans).toHaveLength(1);
		expect(spans[0].textContent).toBe(wrapped);
		expect(heading.textContent).toBe(text);
	});

	it.each([undefined, '', 'absent'])('adds no highlight span for %j', (highlight) => {
		const heading = title(header({ highlight }));
		expect(heading.querySelector('span')).toBeNull();
		expect(heading.textContent).toBe('How we measure reliability');
	});
});

describe('canvas', () => {
	it('passes the snippet undefined first, then the header element, and renders inside it behind the content', () => {
		const seen: (HTMLElement | undefined)[] = [];
		const view = render(Canvas, { props: { seen } });
		const frame = view.container.querySelector<HTMLElement>('[data-slot="article-header"]')!;
		const marker = view.getByTestId('canvas');

		expect(seen[0]).toBeUndefined();
		expect(seen.at(-1)).toBe(frame);
		expect(marker.dataset.header).toBe('element');
		expect(frame.contains(marker)).toBe(true);
		expect(precedes(marker, view.getByRole('heading', { level: 1 }))).toBe(true);
	});
});
