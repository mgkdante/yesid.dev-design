// @vitest-environment node
import { render } from 'svelte/server';
import { expect, it } from 'vitest';
import QuietModeButton, { type QuietModeButtonCopy } from './QuietModeButton.svelte';

const copy: QuietModeButtonCopy = {
	collapse: 'Collapse all',
	expand: 'Expand all',
	collapseTitle: 'Collapse every section',
	expandTitle: 'Expand every section',
	remember: 'Always start collapsed',
	forget: "Don't start collapsed",
};

it('server-renders a controlled label alone and both store labels otherwise', () => {
	const controlled = render(QuietModeButton, { props: { copy, enabled: true, remembered: false } }).body;
	expect(controlled).toContain(copy.expand);
	expect(controlled).not.toContain(copy.collapse);
	expect(controlled).not.toContain(copy.forget);

	const storeDefault = render(QuietModeButton, { props: { copy } }).body;
	for (const label of [copy.collapse, copy.expand, copy.remember, copy.forget]) expect(storeDefault).toContain(label);
});
