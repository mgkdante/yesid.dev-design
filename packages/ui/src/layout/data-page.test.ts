import { render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import Breadcrumb from './Breadcrumb.svelte';
import ControlsRail from './ControlsRail.svelte';
import DashboardGrid from './DashboardGrid.svelte';
import Masthead from './Masthead.svelte';

const html = (markup: string) => createRawSnippet(() => ({ render: () => markup }));

describe('Breadcrumb', () => {
	const items = [
		{ name: 'Home', href: '/' },
		{ name: 'Lines', href: '/lines' },
		{ name: '24', href: '/lines/24' },
	];

	it('links every ancestor and marks the last item as the current page', () => {
		render(Breadcrumb, { props: { items, label: 'Breadcrumb' } });

		const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
		const links = within(nav).getAllByRole('link');
		expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual(
			items.slice(0, -1).map((item) => [item.name, item.href]),
		);
		expect(within(nav).getByText(items.at(-1)!.name).getAttribute('aria-current')).toBe('page');
	});

	it('renders nothing for a single item', () => {
		render(Breadcrumb, { props: { items: items.slice(0, 1), label: 'Breadcrumb' } });

		expect(screen.queryByRole('navigation')).toBeNull();
	});
});

describe('ControlsRail and DashboardGrid', () => {
	it('name their group and region from the label', () => {
		render(ControlsRail, { props: { label: 'Filters', children: html('<button>Late</button>') } });
		render(DashboardGrid, { props: { label: 'Summary', children: html('<p>Tile</p>') } });

		expect(within(screen.getByRole('group', { name: 'Filters' })).getByRole('button')).toBeInTheDocument();
		expect(within(screen.getByRole('region', { name: 'Summary' })).getByText('Tile')).toBeInTheDocument();
	});

	it('keeps a list grid a list instead of a region', () => {
		render(DashboardGrid, { props: { as: 'ul', label: 'Summary', children: html('<li>Tile</li>') } });

		expect(screen.queryByRole('region')).toBeNull();
		expect(screen.getByRole('list')).toBeInTheDocument();
	});
});

describe('Masthead', () => {
	it('heads the surface at the requested level', () => {
		render(Masthead, { props: { kicker: 'Search', heading: 'Find a stop', level: 2 } });

		expect(screen.getByRole('heading', { level: 2, name: /Find a stop/ })).toBeInTheDocument();
	});
});
