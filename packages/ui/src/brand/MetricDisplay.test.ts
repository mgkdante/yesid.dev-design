import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import MetricDisplay, { type MetricDisplayProps } from './MetricDisplay.svelte';

const absent = createRawSnippet(() => ({ render: () => '<em data-testid="absent">No data</em>' }));
const info = createRawSnippet(() => ({ render: () => '<button data-testid="info">i</button>' }));

const show = (props: Partial<MetricDisplayProps> = {}) =>
	render(MetricDisplay, { props: { value: '5', label: 'Label', ...props } });
const valueOf = ({ container }: { container: HTMLElement }) =>
	container.querySelector<HTMLElement>('.metric-value');
const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('MetricDisplay', () => {
	it('renders the value in the accent voice under a metric label, with a sublabel', () => {
		const view = show({ value: '82%', label: 'On-time', sublabel: 'last 7 days', absent });
		expect(valueOf(view)?.textContent).toBe('82%');
		expect(valueOf(view)?.classList.contains('text-accent-text')).toBe(true);
		expect(view.getByText('On-time').classList.contains('label-metric')).toBe(true);
		expect(view.getByText('last 7 days')).toBeInTheDocument();
		expect(view.queryByTestId('absent')).toBeNull();
	});

	it.each([null, undefined, ''])('renders the absent snippet for value=%j', (value) => {
		const view = show({ value, absent });
		expect(view.getByTestId('absent')).toBeInTheDocument();
		expect(view.getByText('Label')).toBeInTheDocument();
		expect(valueOf(view)).toBeNull();
	});

	it('treats "0" as a value and renders nothing extra when empty without an absent snippet', () => {
		expect(valueOf(show({ value: '0', absent }))?.textContent).toBe('0');
		const empty = show({ value: null });
		expect([valueOf(empty), empty.container.querySelectorAll('span').length]).toEqual([null, 1]);
	});

	it('orders the label, info snippet and value', () => {
		const view = show({ info });
		expect(follows(view.getByText('Label'), view.getByTestId('info'))).toBe(true);
		expect(follows(view.getByText('Label'), valueOf(view)!)).toBe(true);
		const below = show({ labelBelow: true, label: 'Below' });
		expect(follows(valueOf(below)!, below.getByText('Below'))).toBe(true);
	});

	it.each([
		['sm', 'text-subheading'],
		['md', 'text-heading'],
		['lg', 'text-title'],
	] as const)('sizes the %s value with %s', (size, expected) => {
		expect(valueOf(show({ size }))?.classList.contains(expected)).toBe(true);
	});

	it('forwards class and attributes to the root', () => {
		const root = show({ class: 'consumer', 'data-testid': 'metric' }).container.querySelector('[data-slot="metric-display"]');
		expect([root?.classList.contains('consumer'), root?.getAttribute('data-testid')]).toEqual([true, 'metric']);
	});
});
