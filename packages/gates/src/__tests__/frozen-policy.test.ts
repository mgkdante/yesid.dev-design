import { describe, expect, it } from 'vitest';
import { runContrastPairs, runIdentities } from '../engines/contrastPairs.js';
import {
	FROZEN_CONTRAST_PAIRS,
	FROZEN_IDENTITIES,
	FROZEN_TOKENS,
} from './fixtures/neutral-policy.js';

describe('neutral frozen regression policy', () => {
	it('holds its contrast and identity contracts', () => {
		const pairs = runContrastPairs(FROZEN_TOKENS, FROZEN_CONTRAST_PAIRS);
		const identities = runIdentities(FROZEN_TOKENS, FROZEN_IDENTITIES);

		expect(pairs).toHaveLength(3);
		expect(pairs.filter(({ pass }) => !pass)).toEqual([]);
		expect(identities).toHaveLength(1);
		expect(identities.filter(({ pass }) => !pass)).toEqual([]);
	});

	it('catches a frozen token regression', () => {
		const regressed = {
			...FROZEN_TOKENS,
			color: {
				...FROZEN_TOKENS.color,
				dark: {
					...FROZEN_TOKENS.color.dark,
					ink: { $value: '#333333' },
				},
			},
		};

		const results = runContrastPairs(regressed, FROZEN_CONTRAST_PAIRS);
		expect(results.find(({ label }) => label === 'dark ink/canvas')?.pass).toBe(false);
	});
});
