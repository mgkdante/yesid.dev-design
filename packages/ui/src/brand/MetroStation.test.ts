import { cleanup, render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import MetroStation from './MetroStation.svelte';

afterEach(() => cleanup());

describe('MetroStation', () => {
	it('renders the zero-padded station number by default', () => {
		const { container } = render(MetroStation, { props: { index: 3 } });
		expect(container.querySelector('.station-number-badge')?.textContent).toBe('03');
	});

	it('renders a caller roundel snippet with the zero-padded number', () => {
		const roundel = createRawSnippet<[string]>((stationNo) => ({
			render: () => `<span data-slot="custom-roundel">${stationNo()}</span>`,
		}));
		const { container } = render(MetroStation, { props: { index: 3, roundel } });
		expect(container.querySelector('[data-slot="custom-roundel"]')?.textContent).toBe('03');
		expect(container.querySelector('.station-number-badge')).toBeNull();
	});
});
