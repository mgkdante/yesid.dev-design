import { fireEvent, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import SearchInput, { type SearchInputProps } from './SearchInput.svelte';
import Persisted from './test-fixtures/SearchInputPersisted.svelte';

const field = (props: Partial<SearchInputProps> = {}) =>
	render(SearchInput, { props: { label: 'Search lines', placeholder: 'Route, mode, or destination', ...props } });
const input = (view: ReturnType<typeof field>) => view.getByRole('textbox', { name: 'Search lines' }) as HTMLInputElement;
const type = (element: HTMLInputElement, value: string) => fireEvent.input(element, { target: { value } });

afterEach(() => sessionStorage.clear());

describe('SearchInput', () => {
	it('is named by label, hints with the placeholder and shows the initial value', () => {
		const view = field({ value: 'metro' });
		expect(input(view).placeholder).toBe('Route, mode, or destination');
		expect(input(view).value).toBe('metro');
	});

	it.each([
		['testId', { testId: 'line-search' }, 'line-search', 'line-search'],
		['an explicit name', { testId: 'line-search', name: 'q' }, 'q', 'line-search'],
		['neither', {}, 'listing-search', null],
	])('names the field from %s', (_case, props, name, testId) => {
		const element = input(field(props));
		expect([element.name, element.getAttribute('data-testid')]).toEqual([name, testId]);
	});

	it('updates its value as the reader types', async () => {
		const element = input(field());
		await type(element, 'bus');
		expect(element.value).toBe('bus');
	});

	it('bound to persisted state, keeps what was typed across an unmount and remount', async () => {
		const first = render(Persisted);
		await type(first.getByRole('textbox') as HTMLInputElement, 'railway');
		expect(first.getByTestId('echo').textContent).toBe('railway');
		first.unmount();

		expect((render(Persisted).getByRole('textbox') as HTMLInputElement).value).toBe('railway');
	});
});
