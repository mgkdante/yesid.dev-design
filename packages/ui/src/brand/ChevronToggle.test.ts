import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ChevronToggle from './ChevronToggle.svelte';

describe('ChevronToggle', () => {
	it('renders an SVG', () => {
		const { container } = render(ChevronToggle, { props: { open: false } });
		expect(container.querySelector('svg')).toBeTruthy();
	});

	it('defaults to md size and right direction', () => {
		const { container } = render(ChevronToggle, { props: { open: false } });
		const classes = container.querySelector('svg')?.getAttribute('class') ?? '';
		expect(classes).toContain('size-5');
		expect(classes).toContain('chevron-right');
	});

	it('applies open, size, and direction state classes', () => {
		const { container } = render(ChevronToggle, {
			props: { open: true, size: 'sm', direction: 'down' },
		});
		const classes = container.querySelector('svg')?.getAttribute('class') ?? '';
		expect(classes).toContain('chevron-open');
		expect(classes).toContain('size-4');
		expect(classes).toContain('chevron-down');
	});

	it('is decorative and forwards SVG attributes', () => {
		const { container } = render(ChevronToggle, {
			props: { open: false, 'data-testid': 'chevron', 'aria-hidden': false },
		});
		const svg = container.querySelector('[data-testid="chevron"]');
		expect(svg?.getAttribute('aria-hidden')).toBe('true');
	});
});
