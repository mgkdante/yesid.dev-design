import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import StatusDot, { type StatusDotProps } from './StatusDot.svelte';

const dotOf = (props: StatusDotProps = {}) =>
	render(StatusDot, { props }).container.querySelector<HTMLElement>('[data-slot="status-dot"]')!;

describe('StatusDot', () => {
	it('is decorative without a label and screen-reader text with one', () => {
		const plain = dotOf();
		expect([plain.getAttribute('aria-hidden'), plain.textContent]).toEqual(['true', '']);
		const labelled = dotOf({ label: 'Delayed' });
		expect(labelled.hasAttribute('aria-hidden')).toBe(false);
		expect(labelled.querySelector('.sr-only')?.textContent).toBe('Delayed');
	});

	it('merges a consumer class and forwards attributes', () => {
		const dot = dotOf({ class: 'consumer-dot', 'aria-label': 'No realtime' });
		expect(dot.classList.contains('consumer-dot')).toBe(true);
		expect(dot.getAttribute('aria-label')).toBe('No realtime');
	});
});
