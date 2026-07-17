import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ComboboxFixture from './test-fixtures/ComboboxFixture.svelte';

afterEach(() => cleanup());

const options = [
	{ value: 'alpha', label: 'Alpha', sublabel: 'Eastern region', glyph: 'A', search: 'alpha eastern' },
	{ value: 'beta', label: 'Béta', sublabel: 'Northern region', glyph: 'B', search: 'beta northern' },
	{ value: 'gamma', label: 'Gamma', search: 'gamma western' },
] as const;

describe('Combobox', () => {
	it('exposes the caller label and a generic DOM hook', () => {
		const { container } = render(ComboboxFixture, { props: { options } });

		expect(screen.getByRole('combobox', { name: 'Choose a product' })).toBeInTheDocument();
		expect(
			container.querySelector('[data-slot="combobox"]')?.classList.contains('fixture-combobox'),
		).toBe(true);
	});

	it('renders a seeded selection and clears the bound nullable value', async () => {
		render(ComboboxFixture, { props: { options, value: 'beta' } });

		expect(
			(screen.getByRole('combobox', { name: 'Choose a product' }) as HTMLInputElement).value,
		).toBe('Béta');
		await fireEvent.click(screen.getByRole('button', { name: 'Clear product' }));

		await waitFor(() => {
			expect(screen.getByTestId('combobox-value').textContent).toBe('none');
			expect(screen.getByTestId('combobox-value-changes').textContent).toBe('1');
			expect(screen.queryByRole('button', { name: 'Clear product' })).toBeNull();
		});
	});

	it('syncs an external selection into the visible input', async () => {
		render(ComboboxFixture, { props: { options } });
		const input = screen.getByRole('combobox', {
			name: 'Choose a product',
		}) as HTMLInputElement;

		await fireEvent.click(screen.getByTestId('combobox-external-value'));
		await waitFor(() => {
			expect(screen.getByTestId('combobox-value').textContent).toBe('gamma');
			expect(input.value).toBe('Gamma');
			expect(screen.getByTestId('combobox-value-changes').textContent).toBe('0');
		});
	});

	it('exposes open state and composes open callbacks once', async () => {
		render(ComboboxFixture, { props: { options } });
		await fireEvent.pointerDown(screen.getByRole('button', { name: 'Choose a product' }));

		await waitFor(() => {
			expect(screen.getByTestId('combobox-open').textContent).toBe('open');
			expect(screen.getByTestId('combobox-open-changes').textContent).toBe('1');
		});
	});

	it('disables the native clear affordance with the combobox', () => {
		render(ComboboxFixture, { props: { options, value: 'beta', disabled: true } });
		expect(screen.getByRole('button', { name: 'Clear product' }).hasAttribute('disabled')).toBe(
			true,
		);
	});

	it('filters with folded token-AND matching and renders the caller empty copy', async () => {
		render(ComboboxFixture, { props: { options } });
		const input = screen.getByRole('combobox', { name: 'Choose a product' });

		await fireEvent.pointerDown(screen.getByRole('button', { name: 'Choose a product' }));
		await new Promise((resolve) => setTimeout(resolve, 5));
		await fireEvent.input(input, { target: { value: 'beta north' } });

		expect(await screen.findByRole('option', { name: /Béta/i })).toBeInTheDocument();
		expect(screen.queryByRole('option', { name: /Alpha/i })).not.toBeInTheDocument();

		await fireEvent.input(input, { target: { value: 'missing' } });
		expect(await screen.findByText('No matching products')).toBeInTheDocument();

		await fireEvent.pointerDown(screen.getByRole('button', { name: 'Choose a product' }));
		await waitFor(() => expect(screen.queryByText('No matching products')).toBeNull());
	});
});
