import { describe, expect, it } from 'vitest';

import { blockingAxeViolations } from './browser/authority.js';

describe('browser accessibility authority', () => {
	it('blocks serious and critical violations without hiding lower-impact evidence', () => {
		const violations = [
			{ id: 'minor-rule', impact: 'minor' },
			{ id: 'moderate-rule', impact: 'moderate' },
			{ id: 'serious-rule', impact: 'serious' },
			{ id: 'critical-rule', impact: 'critical' },
			{ id: 'unscored-rule', impact: null },
		];

		expect(blockingAxeViolations(violations).map(({ id }) => id)).toEqual([
			'serious-rule',
			'critical-rule',
		]);
		expect(violations).toHaveLength(5);
	});
});
