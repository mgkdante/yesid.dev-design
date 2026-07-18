import { describe, expect, it } from 'vitest';
import { GALLERY_BRAND_HEXES, GALLERY_FORBIDDEN } from './policy.js';

describe('gallery gate policy contract', () => {
	it('owns its exact brand hex policy', () => {
		expect(GALLERY_BRAND_HEXES).toEqual(['#E07800', '#FFB627']);
	});

	it('owns its forbidden utility policy', () => {
		expect(GALLERY_FORBIDDEN.map(({ pattern }) => pattern.source)).toEqual([
		'\\bbg-bg-',
		'\\bborder-bg-',
		'\\btext-text-',
		'var\\(--text-light\\)',
		'var\\(--dim-foreground\\)|var\\(--light-foreground\\)',
	]);
	});
});
