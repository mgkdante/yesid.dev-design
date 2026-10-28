import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import ToggleChip from './ToggleChip.svelte';

const text = (value: string) => createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));

describe('ToggleChip', () => {
	it('shows the pressed state it is given and leaves changes to the caller', async () => {
		const onclick = vi.fn();
		render(ToggleChip, { props: { pressed: true, onclick, children: text('Late') } });

		const chip = screen.getByRole('button', { name: 'Late' });
		await fireEvent.click(chip);

		expect(onclick).toHaveBeenCalledOnce();
		expect(chip.getAttribute('aria-pressed')).toBe('true');
		expect(chip.getAttribute('type')).toBe('button');
	});
});
