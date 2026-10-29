import { describe, expect, expectTypeOf, it } from 'vitest';
import { defineAnalyticsPreset, type AnalyticsEventName } from './config';

describe('analytics preset', () => {
	it('preserves typed consumer events', () => {
		const preset = defineAnalyticsPreset({
			events: ['event_alpha', 'event_beta'] as const,
		});

		expect(preset).toEqual({
			events: ['event_alpha', 'event_beta'],
		});
		expectTypeOf<AnalyticsEventName<typeof preset>>().toEqualTypeOf<
			'event_alpha' | 'event_beta'
		>();
	});
});
