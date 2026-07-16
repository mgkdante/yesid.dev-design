import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import MetroStation from './MetroStation.svelte';

const source = readFileSync(join(process.cwd(), 'src/brand/MetroStation.svelte'), 'utf8');

const yesidRoundel = createRawSnippet<[string]>((stationNo) => ({
	render: () =>
		`<span data-slot="badge" class="station-number-badge" style="background-color: var(--signage-bg); color: var(--signage-text);" aria-hidden="true">${stationNo()}</span>`,
}));

describe('MetroStation consumer parity', () => {
	it('uses the self-contained Transit roundel by default', () => {
		const { container } = render(MetroStation, { props: { index: 3 } });
		const roundel = container.querySelector('.station-number-badge');
		expect(roundel?.textContent).toBe('03');
		expect(roundel?.getAttribute('data-slot')).toBeNull();
	});

	it('reproduces yesid.dev Badge markup and signage styles through the roundel snippet', () => {
		// yesid.dev/apps/web/src/lib/components/brand/MetroStation.svelte:31-37
		// renders the numbered roundel through Badge with this class and inline signage palette.
		const { container } = render(MetroStation, {
			props: { index: 3, roundel: yesidRoundel, pulseDelay: 0.25 },
		});
		const badge = container.querySelector('[data-slot="metro-station"] [data-slot="badge"]');

		expect(badge?.textContent?.trim()).toBe('03');
		expect(badge?.classList).toContain('station-number-badge');
		expect(badge?.classList).not.toContain('text-[0.75rem]');
		expect(badge?.getAttribute('style')).toContain('background-color: var(--signage-bg)');
		expect(badge?.getAttribute('style')).toContain('color: var(--signage-text)');
		expect(container.querySelector('[data-slot="metro-station-pulse"]')?.getAttribute('style')).toContain(
			'0.25s',
		);
	});

	it('preserves the shared three-pixel rail and tie markup', () => {
		// yesid.dev/apps/web/src/lib/components/brand/MetroStation.svelte:43-63
		// locks the 3px amber rail plus border-strong dashed tie overlay.
		const { container } = render(MetroStation, { props: { index: 1, showLine: true } });
		const lines = Array.from(container.querySelectorAll('[data-metro-line] line'));
		expect(lines).toHaveLength(2);
		expect(lines[0]?.getAttribute('stroke')).toBe('var(--line-amber, var(--primary))');
		expect(lines[1]?.getAttribute('stroke')).toBe('var(--border-strong)');
		expect(lines[1]?.getAttribute('stroke-dasharray')).toBe('1 4');
	});

	it('sizes only a consumer-provided Badge through the same 32px hook', () => {
		// yesid.dev/apps/web/src/lib/components/brand/MetroStation.svelte:83-89
		// sizes the nested Badge through a global station-number-badge selector.
		expect(source).toContain(
			".station-badge-wrapper :global([data-slot='badge'].station-number-badge)",
		);
		expect(source).not.toContain('.station-badge-wrapper :global(.station-number-badge)');
	});
});
