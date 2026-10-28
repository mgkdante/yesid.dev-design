import { describe, expect, it } from 'vitest';
import { SECURITY_HEADERS, contentSecurityPolicy } from '../headers.js';

describe('security headers', () => {
	it('denies every powerful feature it names', () => {
		const features = SECURITY_HEADERS['Permissions-Policy']!.split(', ');
		expect(features.length).toBeGreaterThan(0);
		for (const feature of features) expect(feature).toMatch(/^[a-z-]+=\(\)$/);
	});

	it('writes directives in order and sourceless ones alone', () => {
		expect( contentSecurityPolicy({ 'default-src': ["'self'"], 'img-src': ["'self'", 'data:'], 'upgrade-insecure-requests': [], }), ).toBe("default-src 'self'; img-src 'self' data:; upgrade-insecure-requests");
	});
});
