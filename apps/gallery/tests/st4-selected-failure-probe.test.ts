import { describe, expect, it } from 'vitest';

describe('ST4 selected failure probe', () => {
	it('intentionally fails to prove required reporting', () => {
		expect(true).toBe(false);
	});
});
