import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ChevronToggle from './ChevronToggle.svelte';

describe('ChevronToggle', () => {
	it('renders an SVG', () => {
		const { container } = render(ChevronToggle, { props: { open: false } });
		expect(container.querySelector('svg')).toBeTruthy();
	});

	it.each([true, false])('reports open=%s as its data-state', (open) => {
		const { container } = render(ChevronToggle, { props: { open } });
		expect(container.querySelector('svg')?.getAttribute('data-state')).toBe(open ? 'open' : 'closed');
	});

	it('is decorative and forwards SVG attributes', () => {
		const { container } = render(ChevronToggle, {
			props: { open: false, 'data-testid': 'chevron', 'aria-hidden': false },
		});
		const svg = container.querySelector('[data-testid="chevron"]');
		expect(svg?.getAttribute('aria-hidden')).toBe('true');
	});
});
