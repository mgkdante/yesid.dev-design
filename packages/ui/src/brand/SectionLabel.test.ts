import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import SectionLabel from './SectionLabel.svelte';

describe('SectionLabel', () => {
	it('renders its text and composes caller attributes', () => {
		render(SectionLabel, { props: { text: 'HELLO', class: 'consumer-label', id: 'label-id' } });
		const label = screen.getByText('HELLO');
		expect(label.id).toBe('label-id');
		expect(label.classList).toContain('consumer-label');
	});
});
