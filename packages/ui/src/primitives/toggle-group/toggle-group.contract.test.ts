import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ToggleGroupContractFixture from './test-fixtures/ToggleGroupContractFixture.svelte';

afterEach(() => cleanup());

describe('ToggleGroup value contract', () => {
	it('keeps single and multiple value/callback shapes correlated', async () => {
		render(ToggleGroupContractFixture);
		const singleGroup = screen.getByTestId('single-toggle-group');
		expect(singleGroup.style.opacity).toBe('0.5');
		expect(singleGroup.style.getPropertyValue('--gap')).toBe('2');
		const multipleGroup = screen.getByTestId('multiple-toggle-group');
		expect(multipleGroup.style.opacity).toBe('0.75');
		expect(multipleGroup.style.getPropertyValue('--gap')).toBe('3');

		await fireEvent.click(screen.getByRole('radio', { name: 'Two' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Multi two' }));

		await waitFor(() => {
			expect(screen.getByTestId('single-value').textContent).toBe('two');
			expect(screen.getByTestId('multiple-value').textContent).toBe('one,two');
			expect(screen.getByTestId('single-changes').textContent).toBe('1');
			expect(screen.getByTestId('multiple-changes').textContent).toBe('1');
		});
	});
});
