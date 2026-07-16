import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import StopLabel from './StopLabel.svelte';

describe('StopLabel yesid.dev parity', () => {
	it('accepts app-owned localized prefix copy while retaining yesid.dev plate markup', () => {
		// yesid.dev/apps/web/src/lib/components/brand/StopLabel.svelte:19-28
		// selects STOP/ARRÊT/PARADA app-side and renders a div with stop-label-num.
		const { container } = render(StopLabel, {
			props: { stop: '03', label: 'STACK', prefix: 'STOP', class: 'about-stop' },
		});
		const plate = container.querySelector('[data-slot="stop-label"]');
		const normalizedText = plate?.textContent?.replace(/\s+/g, ' ').trim();

		expect(plate?.tagName).toBe('DIV');
		expect(plate?.classList).toContain('stop-label');
		expect(plate?.classList).toContain('about-stop');
		expect(plate?.querySelector('.stop-label-num')?.textContent).toBe('STOP 03');
		expect(normalizedText).toBe('STOP 03 · STACK');
	});
});
