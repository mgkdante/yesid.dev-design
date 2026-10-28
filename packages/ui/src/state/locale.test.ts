import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import LocaleProbe from './test-fixtures/LocaleProbe.svelte';

const shown = (container: HTMLElement) => container.querySelector('output')?.textContent;

describe('createLocaleContext', () => {
	it('falls back where nothing provides a locale', () => {
		expect(shown(render(LocaleProbe).container)).toBe('en');
	});

	it('reads the provided locale and follows it', async () => {
		const view = render(LocaleProbe, { props: { provided: 'fr' } });
		expect(shown(view.container)).toBe('fr');
		await view.rerender({ provided: 'en' });
		expect(shown(view.container)).toBe('en');
	});
});
