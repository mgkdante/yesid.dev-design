// @vitest-environment node
import { render } from 'svelte/server';
import { expect, it } from 'vitest';
import Fixture from './test-fixtures/DetailFrameSsr.svelte';

it('server markup has the header, center, both rails and what follows the grid, in order', () => {
	const { body } = render(Fixture);
	const order = ['Page header', 'Left rail', 'Center column', 'Right rail', 'After the grid'].map((text) =>
		body.indexOf(text),
	);

	expect(order.every((at) => at >= 0)).toBe(true);
	expect(order).toEqual([...order].sort((a, b) => a - b));
	expect(body).toContain('data-slot="detail-shell-left"');
	expect(body).toContain('data-slot="detail-shell-right"');
});
