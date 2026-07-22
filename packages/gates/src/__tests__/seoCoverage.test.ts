import { describe, expect, it } from 'vitest';
import { ogCoverage, sitemapCoverage } from '../engines/seoCoverage.js';

describe('sitemapCoverage', () => {
	it('deduplicates normalized locale variants and reports both drift directions', () => {
		const result = sitemapCoverage({
			expected: ['/', '/about', '/projects'],
			actual: [
				'https://example.com/',
				'https://example.com/fr',
				'https://example.com/about',
				'https://example.com/fr/about',
				'https://example.com/ghost',
			],
			normalize: (value) => new URL(value, 'https://example.com').pathname.replace(/^\/fr(?=\/|$)/, '') || '/',
		});
		expect(result).toEqual({ missing: ['/projects'], extra: ['/ghost'] });
	});
});

describe('ogCoverage', () => {
	it('reports missing assets, unexpected assets, and invalid content identifiers', () => {
		const result = ogCoverage({
			expected: ['en', 'fr'],
			actual: ['en', 'es'],
			identifiers: ['blog/a-valid-slug', 'blog/Not Valid'],
			isValidIdentifier: (value) => /^[a-z]+\/[a-z0-9-]+$/.test(value),
		});
		expect(result).toEqual({
			missing: ['fr'],
			extra: ['es'],
			invalid: ['blog/Not Valid'],
		});
	});

	it('is a pure coverage diff when no identifier policy is supplied', () => {
		expect(ogCoverage({ expected: ['en'], actual: ['en'] })).toEqual({
			missing: [],
			extra: [],
			invalid: [],
		});
	});
});
