import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Badge from '../primitives/badge/badge.svelte';
import { configureUi } from './index.js';

afterEach(() => {
	cleanup();
	configureUi();
});

describe('configureUi', () => {
	it("extends a primitive's internal class merge with consumer vocabulary", () => {
		const vocab = {
			text: ['consumer-label'],
			colors: ['dataviz-status-late', 'dataviz-status-on-time'],
		} as const;
		configureUi({ vocab });

		const { container } = render(Badge, {
			props: {
				class:
					'text-consumer-label text-dataviz-status-late text-dataviz-status-on-time',
			},
		});
		const badge = container.querySelector('[data-slot="badge"]');

		expect(badge).not.toBeNull();
		expect(badge?.classList.contains('text-caption')).toBe(false);
		expect(badge?.classList.contains('text-consumer-label')).toBe(true);
		expect(badge?.classList.contains('text-dataviz-status-on-time')).toBe(true);
		expect(badge?.classList.contains('text-dataviz-status-late')).toBe(false);
	});
});
