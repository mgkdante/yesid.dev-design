// @vitest-environment node
import { render } from 'svelte/server';
import { expect, it } from 'vitest';
import Fixture from './test-fixtures/CollapsibleSectionSsr.svelte';

it.each([
	[undefined, true],
	[true, true],
	[false, false],
])('CollapsibleSection server markup includes the complete body when open=%s', (open, expanded) => {
	const { body } = render(Fixture, { props: { open } });
	const content = body.match(/<div[^>]*data-slot="collapsible-content"[^>]*>/)?.[0] ?? '';

	expect(body).toContain('Complete methodology source');
	expect(body).toContain(`aria-expanded="${expanded}"`);
	expect(content).toContain(`data-state="${expanded ? 'open' : 'closed'}"`);
	expect([content.includes('inert'), content.includes('aria-hidden="true"')]).toEqual([!expanded, !expanded]);
});
