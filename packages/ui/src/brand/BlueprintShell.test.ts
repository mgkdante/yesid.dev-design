import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import BlueprintShell from './BlueprintShell.svelte';

const hero = createRawSnippet(() => ({
	render: () => '<svg data-testid="blueprint-hero"><text>HERO</text></svg>',
}));
const details = createRawSnippet(() => ({
	render: () => '<svg class="edge-detail" data-testid="blueprint-detail"></svg>',
}));

describe('BlueprintShell', () => {
	it('keeps the decorative shell hidden when a consumer forwards aria-hidden=false', () => {
		const { container } = render(BlueprintShell, {
			props: { hero, details, labels: ['TR', 'BL', 'BR'], 'aria-hidden': false },
		});

		expect(container.querySelector('[data-testid="blueprint-hero"]')?.closest('[aria-hidden]')?.getAttribute('aria-hidden')).toBe('true');
	});

	it('forwards a caller class and renders the supplied labels', () => {
		const { container } = render(BlueprintShell, {
			props: { hero, details, labels: ['TR', 'BL', 'BR'], class: 'consumer-shell' },
		});
		const shell = container.querySelector('[data-testid="blueprint-hero"]')?.closest('[aria-hidden]');
		expect(shell?.classList).toContain('consumer-shell');
		for (const label of ['TR', 'BL', 'BR']) expect(shell?.textContent).toContain(label);
	});
});
