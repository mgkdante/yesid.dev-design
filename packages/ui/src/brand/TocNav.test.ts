import { fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { quietMode } from '../state/quiet-mode.svelte.js';
import TocNav, { type TocNavProps } from './TocNav.svelte';
import type { TocEntry } from './toc.js';

const entry = (id: string, rest: Partial<TocEntry> = {}): TocEntry => ({ id, title: id, level: 2, children: [], ...rest });
const entries = [
	entry('overview', { badge: { kind: 'icon', name: 'eye' } }),
	entry('reliability', { badge: { kind: 'number', value: 1 }, children: [entry('on-time', { level: 3 })] }),
	entry('sources', { rail: true }),
];
const props: TocNavProps = { entries, activeId: 'overview', onNavigate: () => {}, heading: 'On this page' };

type View = { container: HTMLElement };
const show = (overrides: Partial<TocNavProps> = {}) => render(TocNav, { props: { ...props, ...overrides } });
const counter = ({ container }: View) =>
	container.querySelector('.toc-counter-text')?.textContent?.replace(/\s+/g, ' ').trim();
const expanded = ({ container }: View) => container.querySelector('[data-section-trigger]')?.getAttribute('aria-expanded');

afterEach(() => {
	quietMode.resetForTest();
});

describe('TocNav', () => {
	it('lists non-rail entries and sub-entries, marking only the active one as current', () => {
		const view = show({ activeId: 'on-time' });
		expect(view.container.querySelectorAll('nav .toc-item')).toHaveLength(3);
		expect(view.queryByText('sources')).toBeNull();
		const current = (title: string) => view.getByText(title).closest('button')?.getAttribute('aria-current');
		expect([current('on-time'), current('overview'), current('reliability')]).toEqual(['location', null, null]);
	});

	it('counts shown positions without padding, excluding rail entries, or follows canonical numbers', () => {
		const numbered = [entry('a', { badge: { kind: 'number', value: 2 } }), entry('b', { badge: { kind: 'number', value: 8 } })];
		expect(counter(show())).toBe('SEC 1 / 3');
		expect(counter(show({ activeId: 'sources' }))).toBe('SEC 1 / 3');
		expect(counter(show({ entries: numbered, activeId: 'a', counterPrefix: 'PART' }))).toBe('PART 2 / 8');
	});

	it('calls onNavigate with the clicked entry or sub-entry id', async () => {
		const onNavigate = vi.fn();
		const view = show({ onNavigate });
		await fireEvent.click(view.getByText('reliability'));
		await fireEvent.click(view.getByText('on-time'));
		expect(onNavigate.mock.calls).toEqual([['reliability'], ['on-time']]);
	});

	it('folds from its heading and follows a changed open prop, unless collapsible={false}', async () => {
		const view = show();
		await fireEvent.click(view.getByRole('button', { name: 'On this page' }));
		expect(expanded(view)).toBe('false');
		await view.rerender({ ...props, open: true });
		expect(expanded(view)).toBe('true');
		expect(show({ collapsible: false }).container.querySelector('[data-section-trigger]')).toBeNull();
	});

	it('collapses with quiet mode unless quiet={false}', async () => {
		const [followed, ignored] = [show(), show({ quiet: false })];
		quietMode.set(true);
		await tick();
		expect([expanded(followed), expanded(ignored)]).toEqual(['false', 'true']);
	});
});
