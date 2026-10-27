import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ErrorPage, { type ErrorPageProps } from './ErrorPage.svelte';

const props: ErrorPageProps = {
	status: 404,
	label: 'ROUTE NOT FOUND',
	heading: 'This page is under construction',
	body: 'The page you want has not been built yet.',
	suggestions: [
		{ href: '/docs', label: 'Docs' },
		{ href: '/guides', label: 'Guides' },
	],
	suggestionsLabel: 'Where to next',
	statusNote: '# no such route',
	signLabel: 'SAMPLE',
};

const page = (overrides: Partial<ErrorPageProps> = {}) => render(ErrorPage, { props: { ...props, ...overrides } });
type View = ReturnType<typeof page>;

const signText = (view: View) =>
	[...view.getByTestId('construction-scene').querySelectorAll('text')].map((text) => text.textContent);
const terminal = (view: View) => view.queryByTestId('terminal-line')?.textContent?.replace(/\s+/g, ' ').trim();

describe('404', () => {
	it('shows the hazard rule, scene, label, heading, body and destinations', () => {
		const view = page();
		expect(view.getAllByTestId('hazard-tape')).toHaveLength(1);
		expect(view.getByTestId('construction-scene')).toBeInTheDocument();
		expect(view.getByTestId('error-label').textContent).toBe('ROUTE NOT FOUND');
		expect(view.container.querySelectorAll('h1')).toHaveLength(1);
		expect(view.getByRole('heading', { level: 1 }).textContent).toBe('This page is under construction');
		expect(view.getByText('The page you want has not been built yet.')).toBeInTheDocument();
		expect(view.queryByRole('alert')).toBeNull();
	});

	it('shows the status command with the note on the terminal line', () => {
		const line = terminal(page());
		expect(line).toContain('route --status 404');
		expect(line).toContain('# no such route');
	});
});

describe('other statuses', () => {
	it('announces the status, keeps the destinations and detail, and never signs the scene as 404', () => {
		const view = page({
			status: 500,
			heading: 'Something went wrong',
			detail: 'Database unavailable',
			suggestions: [{ href: '/', label: 'Home' }],
		});
		expect(view.getByRole('alert').textContent).toContain('500');
		expect(view.getByRole('heading', { level: 1 }).textContent).toBe('Something went wrong');
		expect(view.getByText('Database unavailable')).toBeInTheDocument();
		expect(view.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/');
		expect(view.getByTestId('construction-scene')).toBeInTheDocument();
		expect(signText(view)).not.toContain('404');
		expect(terminal(view)).toContain('route --status 500');
	});
});

describe('illustration sign', () => {
	it.each([
		[404, 'SAMPLE', ['SAMPLE', '404']],
		[404, undefined, ['404']],
		[500, 'SAMPLE', ['SAMPLE']],
		[500, undefined, []],
	])('for status %i with signLabel %j shows %j', (status, signLabel, expected) => {
		expect(signText(page({ status, signLabel }))).toEqual(expected);
	});
});

describe('suggestions', () => {
	it('lists the destinations in order in a navigation named by suggestionsLabel', () => {
		const view = page();
		const nav = view.getByRole('navigation', { name: 'Where to next' });
		const items = view.getAllByTestId('error-suggestion-link');
		expect(items.map((link) => [link.textContent?.trim(), link.getAttribute('href')])).toEqual([
			['Docs', '/docs'],
			['Guides', '/guides'],
		]);
		expect(items.every((link) => nav.contains(link))).toBe(true);
	});

	it('styles only the first destination as primary', () => {
		const items = page().getAllByTestId('error-suggestion-link');
		expect(items.map((link) => link.classList.contains('suggestion-primary'))).toEqual([true, false]);
	});

	it.each([[[]], [undefined]])('renders no navigation for suggestions=%j', (suggestions) => {
		expect(page({ suggestions }).queryByRole('navigation')).toBeNull();
	});
});

describe('terminal line', () => {
	it('renders only when statusNote is given', () => {
		expect(page({ statusNote: undefined }).queryByTestId('terminal-line')).toBeNull();
		expect(page().queryByTestId('terminal-line')).not.toBeNull();
	});
});
