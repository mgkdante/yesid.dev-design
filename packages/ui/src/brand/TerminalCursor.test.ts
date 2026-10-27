import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import TerminalCursor from './TerminalCursor.svelte';

describe('TerminalCursor', () => {
	it('renders a decorative cursor hidden from assistive technology', () => {
		const { container } = render(TerminalCursor, { props: { 'data-testid': 'cursor' } });
		expect(container.querySelector('[data-testid="cursor"]')?.getAttribute('aria-hidden')).toBe('true');
	});
});
