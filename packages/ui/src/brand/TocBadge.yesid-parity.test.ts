import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import TocBadge from './TocBadge.svelte';

describe('TocBadge yesid.dev parity', () => {
	it('keeps the current 0.75rem number size independently of text-micro token values', () => {
		// yesid.dev/apps/web/src/lib/components/shared/TocBadge.svelte:18-22 delegates to Badge;
		// yesid.dev/apps/web/src/lib/components/ui/badge/badge.svelte:29-33 fixes number type at 0.75rem.
		const { container } = render(TocBadge, { props: { badge: { kind: 'number', value: 7 } } });
		const badge = container.querySelector('[data-slot="badge"]');

		expect(badge?.textContent?.trim()).toBe('07');
		expect(badge?.classList).toContain('text-[0.75rem]');
		expect(badge?.getAttribute('aria-hidden')).toBe('true');
	});

	it('preserves the consumer-provided icon class contract', () => {
		// yesid.dev/apps/web/src/lib/components/shared/TocBadge.svelte:12-19 forwards iconClass.
		const { container } = render(TocBadge, {
			props: { badge: { kind: 'icon', name: 'chart' }, iconClass: 'size-6 consumer-icon' },
		});
		expect(container.querySelector('svg')?.getAttribute('class')).toContain('consumer-icon');
	});
});
