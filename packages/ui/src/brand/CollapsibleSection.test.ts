import { fireEvent, render } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { quietMode } from '../state/quiet-mode.svelte.js';
import CollapsibleSection, { type CollapsibleSectionProps } from './CollapsibleSection.svelte';
import Bound from './test-fixtures/CollapsibleSectionBound.svelte';

type View = { container: HTMLElement };
type Props = Partial<CollapsibleSectionProps>;

const children = createRawSnippet(() => ({
	render: () => `<div>
		<p data-testid="prose">Plain prose</p>
		<button type="button" data-testid="button">Action</button>
		<span role="button" tabindex="0" data-testid="role-button">Faux button</span>
		<a href="/lines" data-testid="link">Link</a>
		<div data-card-interactive><span data-testid="boundary">Chart mark</span></div>
		<div data-slot="card"><p data-testid="nested-card">Nested</p></div>
	</div>`,
}));

const section = (props: Props = {}) => render(CollapsibleSection, { props: { title: 'Section', children, ...props } });
const keyed = (props: Props = {}) => section({ sectionKey: 'reader', ...props });
const query = <T extends Element>({ container }: View, selector: string) => container.querySelector<T>(selector)!;
const trigger = (view: View) => query<HTMLButtonElement>(view, '[data-section-trigger]');
const content = (view: View) => query(view, '.section-body');
const isOpen = (view: View) => trigger(view).getAttribute('aria-expanded') === 'true';
const boundText = (view: View) => query(view, '[data-testid="bound"]').textContent;
const stored = () => sessionStorage.getItem('persisted:reader');
const click = fireEvent.click;
const setQuiet = async (enabled: boolean) => {
	quietMode.set(enabled);
	await tick();
};

afterEach(() => {
	quietMode.resetForTest();
	sessionStorage.clear();
	window.getSelection()?.removeAllRanges();
});

describe('disclosure', () => {
	it('keeps the closed body mounted, inert and hidden, with its control target', async () => {
		const view = section();
		const prose = view.getByTestId('prose');
		expect(trigger(view).getAttribute('aria-controls')).toBe(content(view).id);

		await click(trigger(view));
		expect(content(view).hasAttribute('inert')).toBe(true);
		expect(content(view).getAttribute('aria-hidden')).toBe('true');
		expect(view.container.contains(prose)).toBe(true);

		await click(trigger(view));
		expect(content(view).hasAttribute('inert') || content(view).hasAttribute('aria-hidden')).toBe(false);
		expect(view.getByTestId('prose')).toBe(prose);
	});

	it('follows the open prop and gives simultaneous sections distinct control targets', async () => {
		const [first, second] = [section({ open: false }), section()];
		expect(isOpen(first)).toBe(false);
		await first.rerender({ open: true });
		expect(isOpen(first)).toBe(true);
		expect(content(first).id).not.toBe(content(second).id);
	});

	it('shows a zero-padded index or an icon, the toc anchor and the accent', () => {
		const icon = createRawSnippet(() => ({ render: () => '<svg data-testid="icon"></svg>' }));
		const indexed = section({ index: 0, anchor: 'overview', accentColor: 'var(--accent-text)' });
		const card = query<HTMLElement>(indexed, '[data-slot="card"]');
		expect(query(indexed, '[data-slot="badge"]').textContent?.trim()).toBe('01');
		expect(card.getAttribute('data-toc')).toBe('overview');
		expect(card.style.getPropertyValue('--accent')).toBe('var(--accent-text)');
		expect(section({ icon }).getByTestId('icon')).toBeInTheDocument();
	});

	it('is a static, always-open card with collapsible={false}', async () => {
		quietMode.set(true);
		const view = section({ collapsible: false });
		expect(view.container.querySelector('[data-section-trigger]')).toBeNull();
		await click(view.getByTestId('prose'));
		expect(content(view).getAttribute('data-state')).toBe('open');
	});

	it('shows a static body over a stored close, and keeps that choice for later', async () => {
		sessionStorage.setItem('persisted:reader', 'false');
		const view = keyed({ collapsible: false });
		expect(content(view).hasAttribute('inert')).toBe(false);

		const runtime = keyed();
		expect(content(runtime).getAttribute('data-state')).toBe('closed');
		await runtime.rerender({ collapsible: false });
		expect(content(runtime).getAttribute('data-state')).toBe('open');
		expect(stored()).toBe('false');
	});
});

describe('whole-card toggling', () => {
	it('toggles from prose or the bare card, and exactly once from the header', async () => {
		const view = section();
		await click(view.getByTestId('prose'));
		expect(isOpen(view)).toBe(false);
		await click(query(view, '[data-slot="card"]'));
		expect(isOpen(view)).toBe(true);
		await click(trigger(view));
		expect(isOpen(view)).toBe(false);
	});

	it.each(['button', 'role-button', 'link', 'boundary', 'nested-card'])(
		'leaves the section alone when %s owns the click',
		async (testId) => {
			const view = section();
			await click(view.getByTestId(testId));
			expect(isOpen(view)).toBe(true);
		},
	);

	it('does not toggle when a click finishes selecting text', async () => {
		const view = section();
		const range = document.createRange();
		range.selectNodeContents(view.getByTestId('prose'));
		window.getSelection()!.addRange(range);
		await click(view.getByTestId('prose'));
		expect(isOpen(view)).toBe(true);
	});
});

describe('article-summary header', () => {
	const props: Props = { headerVariant: 'article-summary', subtitle: 'What riders saw.' };

	it('puts the trigger alone in the h2, described by its own subtitle', async () => {
		const [view, other] = [section(props), section(props)];
		const subtitle = query(view, '.section-subtitle--article-summary');
		const heading = query(view, 'h2.section-heading');
		expect([heading.childElementCount, heading.firstElementChild]).toEqual([1, trigger(view)]);
		expect(trigger(view).getAttribute('aria-describedby')).toBe(subtitle.id);
		expect(subtitle.id).not.toBe(query(other, '.section-subtitle--article-summary').id);

		await click(trigger(view));
		expect(subtitle.textContent?.trim()).toBe('What riders saw.');
		expect(subtitle.getAttribute('data-state')).toBe('closed');
		await click(trigger(view));
		expect(subtitle.getAttribute('data-state')).toBe('open');
	});

	it('leaves a title-only summary undescribed', () => {
		const view = section({ headerVariant: 'article-summary' });
		expect(trigger(view).hasAttribute('aria-describedby')).toBe(false);
	});

	it('keeps header actions outside the trigger and lets the far chevron toggle', async () => {
		const headerActions = createRawSnippet(() => ({
			render: () => '<button type="button" data-testid="action">Inspect</button>',
		}));
		const view = section({ ...props, headerActions });
		expect(trigger(view).contains(view.getByTestId('action'))).toBe(false);
		await click(view.getByTestId('action'));
		expect(isOpen(view)).toBe(true);
		await click(query(view, '.section-header__chevron'));
		expect(isOpen(view)).toBe(false);
	});
});

describe('focus', () => {
	it('returns to the trigger when a collapse hides the focused child, and not from outside', async () => {
		const view = section();
		view.getByTestId('link').focus();
		await view.rerender({ open: false });
		expect(document.activeElement).toBe(trigger(view));

		await view.rerender({ open: true });
		const outside = document.body.appendChild(document.createElement('button'));
		outside.focus();
		await view.rerender({ open: false });
		expect(document.activeElement).toBe(outside);
	});
});

describe('keyed section', () => {
	it('starts closed when quiet mode was on before mount, leaving storage untouched', () => {
		quietMode.set(true);
		const view = keyed();
		expect(isOpen(view)).toBe(false);
		expect(stored()).toBeNull();
	});

	it('stores reader clicks, from the header or the card, and restores them on remount', async () => {
		const first = keyed();
		await click(trigger(first));
		expect(stored()).toBe('false');
		await click(first.getByTestId('prose'));
		expect(stored()).toBe('true');
		await click(trigger(first));
		first.unmount();
		expect(isOpen(keyed())).toBe(false);
	});

	it.each([
		['a stored close', true, 'false', false],
		['an untouched default', false, null, true],
	])('Collapse all then Expand all leaves %s alone', async (_case, readerClicks, kept, reopens) => {
		const first = keyed();
		if (readerClicks) await click(trigger(first));
		await setQuiet(true);
		expect(isOpen(first)).toBe(false);
		await setQuiet(false);
		expect(isOpen(first)).toBe(true);
		expect(stored()).toBe(kept);
		first.unmount();
		expect(isOpen(keyed())).toBe(reopens);
	});

	it.each([
		['off then on', [false, true], false],
		['on then off', [true, false], true],
	] as const)('lands on the final mode when quiet mode toggles %s in one tick', async (_case, modes, open) => {
		if (!modes[0]) quietMode.set(true);
		const view = keyed();
		const bound = render(Bound);
		for (const mode of modes) quietMode.set(mode);
		await tick();
		expect([isOpen(view), boundText(bound), stored()]).toEqual([open, String(open), null]);
	});

	it('lets a reader click replace a quiet override', async () => {
		const view = keyed();
		await setQuiet(true);
		await click(trigger(view));
		expect([isOpen(view), stored()]).toEqual([true, 'true']);
	});

	it('ignores quiet changes with quiet={false}', async () => {
		quietMode.set(true);
		const view = keyed({ quiet: false });
		await setQuiet(false);
		await setQuiet(true);
		expect([isOpen(view), stored()]).toEqual([true, null]);
	});

	it('opens and stores true when openSignal changes, like a reader click', async () => {
		const view = keyed();
		await click(trigger(view));
		await view.rerender({ openSignal: 1 });
		expect([isOpen(view), stored()]).toEqual([true, 'true']);

		await click(trigger(view));
		await view.rerender({ openSignal: 1 });
		expect(isOpen(view)).toBe(false);
	});

	it('closes when quiet mode is remembered', async () => {
		const view = keyed();
		quietMode.rememberCurrent();
		await tick();
		expect([isOpen(view), stored()]).toEqual([false, null]);
	});
});

describe('unkeyed section with a bound open', () => {
	it('follows quiet mode and reader clicks in the parent value', async () => {
		const view = render(Bound);
		expect(boundText(view)).toBe('true');
		await setQuiet(true);
		expect(boundText(view)).toBe('false');
		await setQuiet(false);
		expect(boundText(view)).toBe('true');
		await click(trigger(view));
		expect(boundText(view)).toBe('false');
	});

	it('mounts closed when quiet mode is already on, unless quiet={false}', () => {
		quietMode.set(true);
		const [followed, ignored] = [render(Bound), render(Bound, { props: { quiet: false } })];
		expect([boundText(followed), boundText(ignored)]).toEqual(['false', 'true']);
	});
});
