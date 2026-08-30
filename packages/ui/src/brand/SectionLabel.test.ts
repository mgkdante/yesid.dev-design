import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import SectionLabel from './SectionLabel.svelte';

describe('SectionLabel', () => {
	it('renders text with the section variant by default', () => {
		render(SectionLabel, { props: { text: 'HELLO' } });
		const label = screen.getByText('HELLO');
		expect(label.classList).toContain('label-section');
		expect(label.classList).not.toContain('text-center');
	});

	it.each([
		['station', 'label-station'],
		['metric', 'label-metric'],
	] as const)('applies the %s variant', (variant, expectedClass) => {
		const { container } = render(SectionLabel, { props: { text: 'Test', variant } });
		expect(container.querySelector('span')?.classList).toContain(expectedClass);
	});

	it('centers the label and composes caller attributes', () => {
		const { container } = render(SectionLabel, {
			props: { text: 'Test', align: 'center', class: 'consumer-label', id: 'label-id' },
		});
		const label = container.querySelector('#label-id');
		expect(label?.classList).toContain('block');
		expect(label?.classList).toContain('text-center');
		expect(label?.classList).toContain('consumer-label');
	});
});
