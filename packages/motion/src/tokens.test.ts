import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { duration, ease } from './tokens.js';

// Vitest runs tests from the project root; process.cwd() is reliable.
// Avoid __dirname (not defined under ESM/Vitest without extra plumbing).
const tokensCss = readFileSync(
	resolve(process.cwd(), '../../apps/gallery/src/lib/styles/tokens.css'),
	'utf-8',
);

function extractCssValue(cssText: string, name: string): string | null {
	const re = new RegExp(`--${name}:\\s*([^;]+);`);
	const match = cssText.match(re);
	return match ? match[1].trim() : null;
}

describe('motion/tokens — parity with tokens.css', () => {
	describe('durations', () => {
		it.each([
			['instant', 100],
			['fast', 150],
			['normal', 200],
			['slow', 300],
			['slower', 500],
		])('duration.%s === %ims (matches --duration-%s in tokens.css)', (key, expectedMs) => {
			const cssValue = extractCssValue(tokensCss, `duration-${key}`);
			expect(cssValue, `--duration-${key} missing from tokens.css`).not.toBeNull();
			expect(cssValue).toBe(`${expectedMs}ms`);
			expect(duration[key as keyof typeof duration]).toBe(expectedMs);
		});
	});

	describe('easings', () => {
		it.each([
			['default', 'cubic-bezier(0.4, 0, 0.2, 1)'],
			['out', 'cubic-bezier(0.2, 0.8, 0.2, 1)'],
			['in-out', 'cubic-bezier(0.4, 0, 0.2, 1)'],
			['bounce', 'cubic-bezier(0.34, 1.56, 0.64, 1)'],
		])('ease.%s matches --ease-%s in tokens.css', (cssKey, expectedCurve) => {
			const cssValue = extractCssValue(tokensCss, `ease-${cssKey}`);
			expect(cssValue, `--ease-${cssKey} missing from tokens.css`).not.toBeNull();
			expect(cssValue).toBe(expectedCurve);

			// JS key uses camelCase for hyphenated CSS keys
			const jsKey = cssKey === 'in-out' ? 'inOut' : cssKey;
			expect(ease[jsKey as keyof typeof ease]).toBe(expectedCurve);
		});
	});

	it('duration has exactly the 5 expected keys', () => {
		expect(Object.keys(duration).sort()).toEqual(['fast', 'instant', 'normal', 'slow', 'slower']);
	});

	it('ease has exactly the 4 expected keys', () => {
		expect(Object.keys(ease).sort()).toEqual(['bounce', 'default', 'inOut', 'out']);
	});
});
