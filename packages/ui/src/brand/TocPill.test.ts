import { fireEvent, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TocPill, { type TocPillProps } from './TocPill.svelte';
import type { TocEntry } from './toc.js';

const entries: TocEntry[] = [
	{
		id: 'overview',
		title: 'Overview',
		level: 2,
		badge: { kind: 'icon', name: 'eye' },
		children: [{ id: 'scope', title: 'Scope', level: 3, children: [] }],
	},
	{ id: 'sources', title: 'Sources', level: 2, rail: true, children: [] },
];
const props: TocPillProps = { entries, activeId: 'overview', openAria: 'Table of contents', closeAria: 'Close' };

const show = (overrides: Partial<TocPillProps> = {}) => render(TocPill, { props: { ...props, ...overrides } });
type View = ReturnType<typeof show>;
const pillOf = (view: View) => view.getByRole('button', { expanded: false }) as HTMLButtonElement;
const items = (view: View) => [...view.container.querySelectorAll<HTMLElement>('.toc-drawer-item')];

afterEach(() => {
	document.body.innerHTML = '';
	vi.restoreAllMocks();
});

describe('TocPill', () => {
	it('shows the active entry and a counter over every entry, named with its visible text first', () => {
		const pill = pillOf(show());
		expect(pill.textContent?.replace(/\s+/g, ' ').trim()).toBe('Overview 1/3');
		expect(pill.getAttribute('aria-label')).toBe('Overview 1/3 · Table of contents');
	});

	it('opens a drawer of every entry and sub-entry, focusing the first', async () => {
		const view = show();
		expect(items(view)).toHaveLength(0);
		await fireEvent.click(pillOf(view));
		expect(items(view).map((item) => item.textContent?.trim())).toEqual(['Overview', 'Scope', 'Sources']);
		expect(items(view)[0].getAttribute('aria-current')).toBe('location');
		expect(document.activeElement).toBe(items(view)[0]);
	});

	it('closes the drawer and refocuses the pill before it navigates', async () => {
		let focusedWhenNavigating: Element | null = null;
		const onNavigate = vi.fn(() => (focusedWhenNavigating = document.activeElement));
		const view = show({ onNavigate });
		const pill = pillOf(view);
		const focus = vi.spyOn(pill, 'focus');

		await fireEvent.click(pill);
		await fireEvent.click(items(view)[1]);
		expect(onNavigate).toHaveBeenCalledWith('scope');
		expect(focus).toHaveBeenCalledWith({ preventScroll: true });
		expect(focusedWhenNavigating).toBe(pill);
		expect(items(view)).toHaveLength(0);
	});

	it('navigates with navigateToc by default', async () => {
		vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
		const target = document.body.appendChild(document.createElement('section'));
		target.setAttribute('data-toc', 'sources');
		target.scrollIntoView = vi.fn();

		const view = show();
		await fireEvent.click(pillOf(view));
		await fireEvent.click(items(view)[2]);
		expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
	});

	it('closes from Escape and from the backdrop, returning focus to the pill', async () => {
		const view = show();
		const pill = pillOf(view);
		await fireEvent.click(pill);
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect([items(view).length, document.activeElement]).toEqual([0, pill]);

		await fireEvent.click(pill);
		await fireEvent.click(view.getByRole('button', { name: 'Close' }));
		expect([items(view).length, document.activeElement]).toEqual([0, pill]);
	});
});
