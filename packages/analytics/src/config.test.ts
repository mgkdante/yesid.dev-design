import { describe, expect, expectTypeOf, it } from 'vitest';
import { defineAnalyticsPreset, type AnalyticsEventName } from './config';

describe('analytics preset', () => {
	it('preserves a consumer-owned domain, typed events, and four versioned storage keys', () => {
		const preset = defineAnalyticsPreset({
			domain: 'metrics.example',
			events: ['event_alpha', 'event_beta'] as const,
			storageKeys: {
				consent: 'test:analytics-consent:v1',
				preferencesOpen: 'test:analytics-preferences-open:v1',
				denialSafety: 'test:analytics-denial-safety:v1',
				storageProbe: 'test:analytics-storage-probe:v1',
			},
		});

		expect(preset).toEqual({
			domain: 'metrics.example',
			events: ['event_alpha', 'event_beta'],
			storageKeys: {
				consent: 'test:analytics-consent:v1',
				preferencesOpen: 'test:analytics-preferences-open:v1',
				denialSafety: 'test:analytics-denial-safety:v1',
				storageProbe: 'test:analytics-storage-probe:v1',
			},
		});
		expectTypeOf<AnalyticsEventName<typeof preset>>().toEqualTypeOf<
			'event_alpha' | 'event_beta'
		>();
	});
});
