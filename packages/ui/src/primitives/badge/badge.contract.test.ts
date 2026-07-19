import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Badge from './badge.svelte';

afterEach(() => cleanup());

describe('Badge element contract', () => {
	it('keeps destructive text AA-safe on the dark tinted surface', () => {
		const { container } = render(Badge, { props: { variant: 'destructive' } });
		const badge = container.querySelector('[data-slot="badge"]');

		expect(badge?.classList.contains('dark:bg-destructive/15')).toBe(true);
		expect(badge?.classList.contains('dark:bg-destructive/20')).toBe(false);
	});

	it('renders an unlinked badge as a span', () => {
		const { container } = render(Badge);
		expect(container.querySelector('[data-slot="badge"]')?.tagName).toBe('SPAN');
	});

	it('treats a present empty href as an anchor', () => {
		const { container } = render(Badge, { props: { href: '', target: '_blank' } });
		const badge = container.querySelector('[data-slot="badge"]');
		expect(badge?.tagName).toBe('A');
		expect(badge?.getAttribute('href')).toBe('');
		expect(badge?.getAttribute('target')).toBe('_blank');
	});
});
