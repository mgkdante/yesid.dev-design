import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
	exports: Record<string, unknown>;
};

describe('@yesid/gates neutrality', () => {
	it('publishes engines only and leaves product presets to consumers', () => {
		expect(Object.keys(manifest.exports)).toEqual(['.']);
		expect(existsSync(new URL('../presets', import.meta.url))).toBe(false);
	});

	it('contains no app-named policy symbols in its production source', () => {
		const productionFiles = [
			'src/index.ts',
			'src/engines/brandHex.ts',
			'src/engines/colorMixFloors.ts',
		];
		for (const path of productionFiles) {
			const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
			expect(source, path).not.toMatch(/\b(?:YESID|TRANSIT)_/);
		}
	});

	it('keeps frozen regression policy under the test boundary', () => {
		expect(existsSync(new URL('./fixtures/neutral-policy.ts', import.meta.url))).toBe(true);
		expect(packageRoot).toContain('packages/gates');
	});
});
