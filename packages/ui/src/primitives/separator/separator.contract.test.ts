import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import SeparatorContractFixture from './test-fixtures/SeparatorContractFixture.svelte';

afterEach(() => cleanup());

describe('Separator variant contracts', () => {
	it('keeps native custom variants honest and ref-capable', async () => {
		render(SeparatorContractFixture);
		const hazard = screen.getByTestId('hazard');
		const gradient = screen.getByTestId('gradient');

		expect(hazard.getAttribute('data-slot')).toBe('custom-hazard');
		expect(hazard.hasAttribute('orientation')).toBe(false);
		expect(hazard.hasAttribute('decorative')).toBe(false);
		expect(hazard.getAttribute('style')).toContain('max-width: 100%');
		expect(gradient.getAttribute('data-slot')).toBe('custom-gradient');
		expect(screen.getByTestId('delegated-default').tagName).toBe('HR');
		await waitFor(() => expect(screen.getByTestId('hazard-ref').textContent).toBe('DIV'));
	});
});

