import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import TerminalCursor from './TerminalCursor.svelte';
import TerminalCursorYesidFixture from './test-fixtures/TerminalCursorYesidFixture.svelte';

const fixtureSource = readFileSync(
	join(process.cwd(), 'src/brand/test-fixtures/TerminalCursorYesidFixture.svelte'),
	'utf8',
);

describe('TerminalCursor yesid.dev wrapper parity', () => {
	it('retains the current decorative markup and exposes a color-override hook', () => {
		// yesid.dev/apps/web/src/lib/components/shared/TerminalCursor.svelte:6-25
		// renders this span; its dark accent/light accent-text color conflict stays consumer CSS.
		const { container } = render(TerminalCursor, {
			props: { class: 'yesid-terminal-cursor', 'data-testid': 'cursor' },
		});
		const cursor = container.querySelector('[data-testid="cursor"]');

		expect(cursor?.tagName).toBe('SPAN');
		expect(cursor?.classList).toContain('terminal-cursor');
		expect(cursor?.classList).toContain('yesid-terminal-cursor');
		expect(cursor?.getAttribute('aria-hidden')).toBe('true');
	});

	it('renders the yesid.dev compatibility wrapper without changing cursor markup', () => {
		const { container } = render(TerminalCursorYesidFixture);
		const cursor = container.querySelector('.yesid-terminal-cursor');

		expect(container.children).toHaveLength(1);
		expect(cursor?.tagName).toBe('SPAN');
		expect(cursor?.classList).toContain('terminal-cursor');
	});

	it('locks yesid.dev fixed geometry and theme-selected colors in the wrapper fixture', () => {
		// yesid.dev/apps/web/src/lib/components/shared/TerminalCursor.svelte:8-25
		expect(fixtureSource).toContain('width: 8px;');
		expect(fixtureSource).toContain('height: 14px;');
		expect(fixtureSource).toContain('margin-left: 4px;');
		expect(fixtureSource).toContain('background: var(--accent);');
		expect(fixtureSource).toContain('background: var(--accent-text);');
	});
});
