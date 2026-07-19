import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Toggle from './toggle.svelte';

afterEach(() => cleanup());

describe('Toggle visual-state contract', () => {
	it('keeps primary text AA-safe on selected light surfaces', () => {
		const { container } = render(Toggle, { props: { pressed: true } });
		const toggle = container.querySelector('[data-slot="toggle"]');

		expect(toggle?.classList.contains('aria-pressed:bg-primary/10')).toBe(true);
		expect(toggle?.classList.contains('data-[state=on]:bg-primary/10')).toBe(true);
		expect(toggle?.classList.contains('aria-pressed:bg-primary/15')).toBe(false);
		expect(toggle?.classList.contains('data-[state=on]:bg-primary/15')).toBe(false);
	});
});
