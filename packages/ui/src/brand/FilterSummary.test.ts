import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import FilterSummary from './FilterSummary.svelte';

const labels = {
	en: { singular: '{count} alert', plural: '{count} alerts' },
	fr: { singular: '{count} résultat', plural: '{count} résultats' },
};

const summary = (locale: 'en' | 'fr', count: number, onClear = vi.fn()) =>
	render(FilterSummary, { props: { count, locale, countLabel: labels[locale], clearLabel: 'Clear filters', onClear } });
const countText = (view: ReturnType<typeof summary>) =>
	view.container.querySelector('[data-slot="filter-summary-count"]')?.textContent?.trim();

describe('FilterSummary', () => {
	it.each([
		['en', 0, '0 alerts'],
		['en', 1, '1 alert'],
		['en', 5, '5 alerts'],
		['fr', 0, '0 résultat'],
		['fr', 1, '1 résultat'],
		['fr', 2, '2 résultats'],
	] as const)('counts %s %i as %j', (locale, count, text) => {
		expect(countText(summary(locale, count))).toBe(text);
	});

	it('shows the clear label and calls onClear when it is clicked', async () => {
		const onClear = vi.fn();
		const view = summary('en', 3, onClear);
		const clear = view.getByRole('button', { name: 'Clear filters' });
		expect(onClear).not.toHaveBeenCalled();
		await fireEvent.click(clear);
		expect(onClear).toHaveBeenCalledOnce();
	});
});
