import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SheetContractFixture from './test-fixtures/SheetContractFixture.svelte';

afterEach(() => cleanup());

describe('Sheet content contract', () => {
	it('preserves the existing close label fallback', () => {
		render(SheetContractFixture);
		expect(screen.getByText('Close')).toBeInTheDocument();
	});

	it('accepts caller-owned localized close copy', () => {
		render(SheetContractFixture, { props: { closeLabel: 'Fermer le panneau' } });
		expect(screen.getByText('Fermer le panneau')).toBeInTheDocument();
		expect(screen.queryByText('Close')).toBeNull();
	});

	it('tears down an open dismissible layer without stale reactive work', async () => {
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		try {
			render(SheetContractFixture);
			cleanup();
			await new Promise((resolve) => setTimeout(resolve, 20));
			expect(warning).not.toHaveBeenCalled();
		} finally {
			warning.mockRestore();
		}
	});
});
