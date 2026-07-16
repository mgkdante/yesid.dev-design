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

describe('BlueprintShell consumer parity', () => {
	it('defaults to the Transit SVG text normalization', () => {
		const { container } = render(BlueprintShell, {
			props: { hero, details, labels: ['TR', 'BL', 'BR'] },
		});

		expect(container.querySelector('.blueprint-text-font')).not.toBeNull();
	});

	it('keeps the decorative shell hidden when a consumer forwards aria-hidden=false', () => {
		const { container } = render(BlueprintShell, {
			props: { hero, details, labels: ['TR', 'BL', 'BR'], 'aria-hidden': false },
		});

		expect(container.querySelector('.blueprint-bg')?.getAttribute('aria-hidden')).toBe('true');
	});

	it('reproduces yesid.dev markup when SVG text normalization is disabled', () => {
		// yesid.dev/apps/web/src/lib/components/brand/BlueprintShell.svelte:29-49
		// has this shell/label markup and no Transit-only nested-text normalization hook.
		const { container } = render(BlueprintShell, {
			props: {
				hero,
				details,
				labels: ['TR', 'BL', 'BR'],
				normalizeTextFont: false,
				class: 'consumer-shell',
			},
		});
		const shell = container.querySelector('[aria-hidden="true"]');

		expect(shell?.classList).toContain('blueprint-bg');
		expect(shell?.classList).toContain('consumer-shell');
		expect(shell?.classList).not.toContain('blueprint-text-font');
		expect(container.querySelectorAll('.crosshair')).toHaveLength(4);
		expect(Array.from(container.querySelectorAll('.ref-label')).map((node) => node.textContent)).toEqual([
			'TR',
			'BL',
			'BR',
		]);
	});
});
