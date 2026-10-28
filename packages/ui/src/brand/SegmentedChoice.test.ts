import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import SegmentedChoice from './SegmentedChoice.svelte';

const options = [
	{ key: 'day', label: 'Day' },
	{ key: 'week', label: 'Week', disabled: true },
	{ key: 'month', label: 'Month', compactLabel: 'M' },
];

function choice(value = 'day') {
	const onSelect = vi.fn();
	render(SegmentedChoice, { props: { options, value, label: 'Grain', onSelect } });
	const radio = (name: string) => screen.getByRole('radio', { name });
	return { onSelect, radio };
}

describe('SegmentedChoice', () => {
	it('is a named radio group with one tab stop on the checked option', () => {
		const { radio } = choice('month');

		expect(screen.getByRole('radiogroup', { name: 'Grain' })).toBeInTheDocument();
		expect(radio('Month').getAttribute('aria-checked')).toBe('true');
		expect(options.map((option) => radio(option.label).tabIndex)).toEqual([-1, -1, 0]);
	});

	it('selects and focuses the next enabled option with the arrow keys', async () => {
		const { onSelect, radio } = choice('day');

		await fireEvent.keyDown(radio('Day'), { key: 'ArrowRight' });
		expect(onSelect).toHaveBeenLastCalledWith('month');
		expect(document.activeElement).toBe(radio('Month'));

		await fireEvent.keyDown(radio('Day'), { key: 'ArrowLeft' });
		expect(onSelect).toHaveBeenLastCalledWith('month');
	});

	it('reports a pick of the current option and ignores a disabled one', async () => {
		const { onSelect, radio } = choice('day');

		await fireEvent.click(radio('Day'));
		await fireEvent.click(radio('Week'));

		expect(onSelect.mock.calls).toEqual([['day']]);
	});
});
