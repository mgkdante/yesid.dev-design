import { render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import DataTable, { type DataTableColumn } from './DataTable.svelte';

interface Row {
	id: string;
	route: string;
	wait: number;
}

const cell = (read: (row: Row) => string | number) =>
	createRawSnippet<[Row]>((row) => ({ render: () => `<span>${read(row())}</span>` }));

const columns: DataTableColumn<Row>[] = [
	{ key: 'route', header: 'Route', rowHeader: true, cell: cell((row) => row.route) },
	{ key: 'wait', header: 'Wait', numeric: true, cell: cell((row) => row.wait) },
];
const rows: Row[] = [
	{ id: 'a', route: '24', wait: 6 },
	{ id: 'b', route: '55', wait: 11 },
];

const table = (caption = 'Waits by route') =>
	render(DataTable<Row>, { props: { rows, columns, key: (row) => row.id, caption } });

describe('DataTable', () => {
	it('is a table named by its caption, with column and row headers', () => {
		table();

		const grid = screen.getByRole('table', { name: 'Waits by route' });
		const headers = within(grid).getAllByRole('columnheader').map((th) => th.textContent?.trim());
		expect(headers).toEqual(columns.map((column) => column.header));
		const rowHeaders = within(grid).getAllByRole('rowheader').map((th) => th.textContent?.trim());
		expect(rowHeaders).toEqual(rows.map((row) => row.route));
	});

	it('is not a focusable region while nothing overflows', () => {
		table();

		expect(screen.queryByRole('region')).toBeNull();
	});

	it('refuses a blank caption', () => {
		expect(() => table('   ')).toThrow(/caption/);
	});
});
