// @vitest-environment node
import { render } from 'svelte/server';
import { expect, it, vi } from 'vitest';
import Fixture from './test-fixtures/ListingFrameSsr.svelte';

// The suite resolves svelte's browser build, whose onMount throws outside a client component.
vi.mock('svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('svelte')>()),
	onMount: () => {},
}));

it.each([undefined, 'listing:filters'])('server markup of a closed frame keeps the filter controls reachable (filterPersistKey=%s)', (filterPersistKey) => {
	const { body } = render(Fixture, { props: { filterPersistKey } });
	const panel = body.match(/<div[^>]*data-slot="listing-filter-panel"[^>]*>/)?.[0] ?? '';
	const toggle = body.match(/<button[^>]*data-slot="listing-filter-toggle"[^>]*>/)?.[0] ?? '';

	expect(body).toContain('Apply filters');
	expect(body).toContain('aria-label="Filter query"');
	expect(panel).toContain('data-state="closed"');
	expect(toggle).toContain('aria-expanded="false"');
	expect([panel.includes('inert'), panel.includes('aria-hidden')]).toEqual([false, false]);
});
