import { fireEvent, render, within } from '@testing-library/svelte';
import { createHash } from 'node:crypto';
import { createRawSnippet, tick } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import CollapsibleSection from '../brand/CollapsibleSection.svelte';
import FilterGroup from '../brand/FilterGroup.svelte';
import TocNav from '../brand/TocNav.svelte';
import ListingFrame from '../layout/test-fixtures/ListingFrameSsr.svelte';
import { quietMode } from '../state/quiet-mode.svelte.js';
import { theme } from '../state/theme.svelte.js';
import boot from './boot.json';
import { injectThemeBoot, themeBootScript } from './boot.js';

const runBoot = () => new Function(themeBootScript)();
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
// What a reader or assistive technology sees on each element.
const STATE = ['data-state', 'aria-expanded', 'inert', 'aria-hidden'];
const stateOf = (root: Element) =>
	[...root.querySelectorAll(STATE.map((name) => `[${name}]`).join(', '))].map((element) =>
		STATE.map((name) => element.getAttribute(name)),
	);
const children = createRawSnippet(() => ({ render: () => '<p>Body</p>' }));

// Runs the boot script, then parses `server` markup as a page load would, and returns what it shows.
async function booted(server: string) {
	runBoot();
	const host = document.createElement('div');
	document.body.append(host);
	host.innerHTML = server;
	await flush();
	return stateOf(host);
}

const notes = { title: 'Notes', subtitle: 'Weekday', children };
const cases = [
	{ name: 'CollapsibleSection', toggle: 'Notes', mount: () => render(CollapsibleSection, { props: { ...notes, sectionKey: 'notes' } }) },
	{
		name: 'CollapsibleSection closed by default',
		toggle: 'Notes',
		mount: () => render(CollapsibleSection, { props: { ...notes, open: false, sectionKey: 'closed-notes' } }),
	},
	{
		name: 'CollapsibleSection article summary',
		toggle: 'Notes',
		mount: () => render(CollapsibleSection, { props: { ...notes, headerVariant: 'article-summary', sectionKey: 'summary' } }),
	},
	{
		name: 'FilterGroup',
		toggle: 'Lines',
		mount: () =>
			render(FilterGroup, {
				props: { label: 'Lines', allLabel: 'All', items: [{ key: 'a', label: 'A' }], collapsible: true, persistKey: 'lines', onSelect: () => {} },
			}),
	},
	{ name: 'ListingFrame', toggle: 'Filters', mount: () => render(ListingFrame, { props: { filterPersistKey: 'filters' } }) },
];

// Every kind of collapsible a page holds: quiet mode closes the ones that follow it and leaves the rest.
const quietCases = [
	...cases,
	{ name: 'CollapsibleSection without a key', mount: () => render(CollapsibleSection, { props: notes }) },
	{
		name: 'CollapsibleSection that opts out of quiet mode',
		mount: () => render(CollapsibleSection, { props: { ...notes, quiet: false, sectionKey: 'loud' } }),
	},
	{ name: 'static CollapsibleSection', mount: () => render(CollapsibleSection, { props: { ...notes, collapsible: false } }) },
	{
		name: 'TocNav',
		mount: () =>
			render(TocNav, {
				props: {
					entries: [{ id: 'intro', title: 'Intro', level: 2, children: [] }],
					activeId: 'intro',
					onNavigate: () => {},
					heading: 'On this page',
					sectionKey: 'toc',
				},
			}),
	},
];

afterEach(() => {
	quietMode.resetForTest();
	// The script disconnects its observer at DOMContentLoaded; end every run here.
	document.dispatchEvent(new Event('DOMContentLoaded'));
	document.body.innerHTML = '';
	sessionStorage.clear();
	localStorage.clear();
	document.documentElement.dataset.theme = 'dark';
});

describe('theme boot script', () => {
	it('paints the stored theme over the markup default', () => {
		theme.set('light');
		document.documentElement.dataset.theme = 'dark';
		runBoot();
		expect(document.documentElement.dataset.theme).toBe('light');
	});

	it('paints dark when nothing is stored', () => {
		document.documentElement.dataset.theme = 'light';
		runBoot();
		expect(document.documentElement.dataset.theme).toBe('dark');
	});

	it.each(cases)('turns $name server markup into the state the stored choice renders', async ({ mount, toggle }) => {
		const view = mount();
		const server = view.container.innerHTML;
		await fireEvent.click(within(view.container).getByRole('button', { name: new RegExp(toggle) }));
		await tick();
		const expected = stateOf(view.container);
		expect(expected).not.toEqual(stateOf(Object.assign(document.createElement('div'), { innerHTML: server })));
		view.unmount();

		expect(await booted(server)).toEqual(expected);
	});

	it('leaves a section without a stored choice as the server rendered it', async () => {
		const stored = cases[0]!.mount();
		await fireEvent.click(within(stored.container).getByRole('button', { name: /Notes/ }));
		stored.unmount();
		const other = render(CollapsibleSection, { props: { title: 'Other', sectionKey: 'other', children } });
		const server = other.container.innerHTML;
		const before = stateOf(other.container);
		other.unmount();

		expect(await booted(server)).toEqual(before);
	});

	it.each(quietCases)('paints $name the way a remembered quiet mode renders it', async ({ mount }) => {
		const view = mount();
		const server = view.container.innerHTML;
		quietMode.rememberCurrent();
		await tick();
		const expected = stateOf(view.container);
		view.unmount();
		expect(await booted(server)).toEqual(expected);
	});

	it('closes a quiet section over the reader\'s stored open choice', async () => {
		const view = render(CollapsibleSection, { props: { ...notes, sectionKey: 'reopened' } });
		const toggle = within(view.container).getByRole('button', { name: /Notes/ });
		await fireEvent.click(toggle);
		await fireEvent.click(toggle);
		const server = view.container.innerHTML;
		quietMode.rememberCurrent();
		await tick();
		const expected = stateOf(view.container);
		expect(expected).not.toEqual(stateOf(Object.assign(document.createElement('div'), { innerHTML: server })));
		view.unmount();
		expect(await booted(server)).toEqual(expected);
	});

	it('ships its CSP hash in boot.json and replaces the app.html placeholder', () => {
		expect(boot.hash).toBe(`sha256-${createHash('sha256').update(themeBootScript).digest('base64')}`);
		expect(injectThemeBoot('<head>%yesid.themeBoot%</head>')).toBe(`<head><script>${themeBootScript}</script></head>`);
	});
});
