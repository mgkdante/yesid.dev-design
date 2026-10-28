import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import TerminalPanel from './TerminalPanel.svelte';

describe('TerminalPanel', () => {
	it('shows its readouts, children and actions and forwards root attributes', () => {
		const footer = [{ label: 'Rows', value: '42' }, { label: 'Time', value: '8 ms' }];
		render(TerminalPanel, { props: {
			title: 'Query console', tag: 'SQL', status: 'Ready', footer,
			children: createRawSnippet(() => ({ render: () => '<p>Result set</p>' })),
			actions: createRawSnippet(() => ({ render: () => '<button type="button">Copy</button>' })),
			'data-testid': 'panel',
		} });
		for (const text of ['Query console', 'SQL', 'Ready', 'Result set', ...footer.flatMap(({ label, value }) => [label, value])]) {
			expect(screen.getByText(text)).toBeInTheDocument();
		}
		expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
		expect(screen.getByTestId('panel').contains(screen.getByText('Query console'))).toBe(true);
	});

	it('needs only a title and children', () => {
		render(TerminalPanel, { props: {
			title: 'Query console',
			children: createRawSnippet(() => ({ render: () => '<p>Result set</p>' })),
		} });
		expect(screen.getByText('Query console')).toBeInTheDocument();
		expect(screen.getByText('Result set')).toBeInTheDocument();
		for (const text of ['SQL', 'Ready', 'Rows', '42', 'Time', '8 ms']) expect(screen.queryByText(text)).toBeNull();
		expect(screen.queryByRole('button')).toBeNull();
	});
});
