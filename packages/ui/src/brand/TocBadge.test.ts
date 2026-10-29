// TocBadge.test.ts - a TOC entry's leading mark.
//
// The whole point of TocBadge is "reuse the card's badge, never re-derive it":
//   - a number spec renders the zero-padded numbered Badge (same as the card);
//   - an icon spec renders the matching SectionIcon shape;
//   - no spec renders nothing (sub-headings carry no badge).

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import TocBadge from './TocBadge.svelte';

describe('TocBadge', () => {
	it('renders a zero-padded number badge for a number spec', () => {
		const { container } = render(TocBadge, { props: { badge: { kind: 'number', value: 7 } } });
		const badge = container.querySelector('[data-slot="badge"]');
		expect(badge?.textContent?.trim()).toBe('07');
		expect(badge?.getAttribute('aria-hidden')).toBe('true');
	});

	it('renders the matching SectionIcon for an icon spec', () => {
		const { container } = render(TocBadge, { props: { badge: { kind: 'icon', name: 'chart' }, iconClass: 'consumer-icon' } });
		expect(container.querySelector('[data-testid="section-chart-icon"]')).toBeTruthy();
		expect(container.querySelector('svg')?.getAttribute('class')).toContain('consumer-icon');
	});

	it('renders nothing when no badge spec is given', () => {
		const { container } = render(TocBadge, { props: {} });
		expect(container.querySelector('[data-slot="badge"]')).toBeNull();
		expect(container.querySelector('svg')).toBeNull();
	});
});
