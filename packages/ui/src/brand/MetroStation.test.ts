import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import MetroStation from './MetroStation.svelte';

afterEach(() => cleanup());

describe('MetroStation', () => {
	it('renders the zero-padded station number by default', () => {
		const { container } = render(MetroStation, { props: { index: 3 } });
		expect(container.querySelector('.station-number-badge')?.textContent).toBe('03');
	});
});
